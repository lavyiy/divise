const pool = require('../config/db');

function toNumber(value) {
  return value === null || value === undefined ? null : parseFloat(value);
}

/**
 * Q01 — Cotizaciones activas: última cotización por (divisa, mercado)
 * con variación porcentual vs. la cotización inmediatamente anterior.
 */
async function getActiveRates() {
  const { rows } = await pool.query(`
    WITH ranked AS (
      SELECT tc.*, d.codigo, d.nombre, d.tipo,
             LAG(tc.precio_venta) OVER (
               PARTITION BY tc.id_divisa, tc.tipo_mercado
               ORDER BY tc.fecha_actualizacion, tc.id_tipo_cambio
             ) AS prev_venta,
             ROW_NUMBER() OVER (
               PARTITION BY tc.id_divisa, tc.tipo_mercado
               ORDER BY tc.fecha_actualizacion DESC, tc.id_tipo_cambio DESC
             ) AS rn
      FROM tipos_de_cambio tc
      JOIN divisas d ON d.id_divisa = tc.id_divisa
    )
    SELECT id_tipo_cambio AS id, codigo, nombre, tipo,
           tipo_mercado AS mercado,
           precio_compra, precio_venta,
           CASE
             WHEN prev_venta > 0
             THEN ROUND(((precio_venta - prev_venta) / prev_venta) * 100, 2)
             ELSE 0
           END AS variacion_pct,
           fecha_actualizacion AS updated_at
    FROM ranked
    WHERE rn = 1
    ORDER BY tipo, nombre, tipo_mercado
  `);

  return rows.map(r => ({
    id: r.id,
    codigo: r.codigo,
    nombre: r.nombre,
    tipo: r.tipo,
    mercado: r.mercado,
    compra: toNumber(r.precio_compra),
    venta: toNumber(r.precio_venta),
    variacion_pct: toNumber(r.variacion_pct),
    fecha: r.updated_at
  }));
}

/**
 * Q03 — Historial de cotizaciones de una moneda (para gráficos).
 */
async function getHistory(codigo, dias = 30, mercado = null) {
  const { rows } = await pool.query(`
    SELECT tc.id_tipo_cambio AS id,
           tc.precio_compra, tc.precio_venta,
           tc.tipo_mercado AS mercado,
           tc.fecha_actualizacion AS created_at
    FROM tipos_de_cambio tc
    JOIN divisas d ON d.id_divisa = tc.id_divisa
    WHERE d.codigo = $1
      AND ($2::text IS NULL OR tc.tipo_mercado = $2)
      AND tc.fecha_actualizacion >= CURRENT_TIMESTAMP - ($3::int * INTERVAL '1 day')
    ORDER BY tc.fecha_actualizacion ASC, tc.id_tipo_cambio ASC
  `, [codigo, mercado, dias]);

  return rows.map(r => ({
    id: r.id,
    codigo,
    mercado: r.mercado,
    compra: toNumber(r.precio_compra),
    venta: toNumber(r.precio_venta),
    created_at: r.created_at
  }));
}

/**
 * Q05 — Conversión entre monedas.
 * Las cotizaciones se expresan en ARS por 1 unidad del activo
 * (ARS es la moneda base: tasa 1). Devuelve cuántas unidades del
 * destino equivalen a `monto` unidades del origen.
 */
async function getLatestByCodes(codes) {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (d.codigo) d.codigo, tc.precio_compra, tc.precio_venta
    FROM tipos_de_cambio tc
    JOIN divisas d ON d.id_divisa = tc.id_divisa
    WHERE d.codigo = ANY($1::text[])
    ORDER BY d.codigo, tc.fecha_actualizacion DESC, tc.id_tipo_cambio DESC
  `, [codes]);
  return rows;
}

async function convert(monto, origen, destino) {
  const numMonto = parseFloat(monto);
  if (!(numMonto > 0)) {
    const err = new Error('El monto debe ser un número mayor que 0.');
    err.status = 400;
    throw err;
  }
  if (!origen || !destino) {
    const err = new Error('Indicar codigo_origen y codigo_destino.');
    err.status = 400;
    throw err;
  }

  const origenUp = String(origen).toUpperCase();
  const destinoUp = String(destino).toUpperCase();

  if (origenUp === destinoUp) {
    return { resultado: numMonto, tasa_origen: 1, tasa_destino: 1 };
  }

  const codes = [...new Set([origenUp, destinoUp])];
  const rows = await getLatestByCodes(codes);

  const quote = code => rows.find(r => r.codigo === code);

  // Tasa de cada activo expresada en ARS (moneda base del sistema)
  const tasaEnBase = code => {
    if (code === 'ARS') return 1;
    const q = quote(code);
    return q ? toNumber(q.precio_venta) : null;
  };

  const tasaOrigen = tasaEnBase(origenUp);
  const tasaDestino = tasaEnBase(destinoUp);

  if (tasaOrigen === null) {
    const err = new Error(`No hay cotización para la moneda origen "${origen}".`);
    err.status = 404;
    throw err;
  }
  if (tasaDestino === null) {
    const err = new Error(`No hay cotización para la moneda destino "${destino}".`);
    err.status = 404;
    throw err;
  }

  const resultado = (numMonto * tasaOrigen) / tasaDestino;
  return {
    resultado: Math.round(resultado * 1000000) / 1000000,
    tasa_origen: tasaOrigen,
    tasa_destino: tasaDestino
  };
}

/**
 * Q06 — Panel bursátil (acciones).
 * Funcionalidad planificada: el esquema actual no tiene divisas de tipo
 * 'Accion' ni columna 'volumen'. Devuelve una lista lista para alimentarse
 * cuando se carguen acciones.
 */
async function getMarketPanel(monedaBase = 'ARS') {
  const { rows } = await pool.query(`
    WITH ranked AS (
      SELECT tc.*, d.codigo,
             LAG(tc.precio_venta) OVER (
               PARTITION BY tc.id_divisa, tc.tipo_mercado
               ORDER BY tc.fecha_actualizacion, tc.id_tipo_cambio
             ) AS prev_venta,
             ROW_NUMBER() OVER (
               PARTITION BY tc.id_divisa, tc.tipo_mercado
               ORDER BY tc.fecha_actualizacion DESC, tc.id_tipo_cambio DESC
             ) AS rn
      FROM tipos_de_cambio tc
      JOIN divisas d ON d.id_divisa = tc.id_divisa
    )
    SELECT m.codigo AS ticker, m.nombre,
           r.precio_venta AS precio,
           CASE
             WHEN r.prev_venta > 0
             THEN ROUND(((r.precio_venta - r.prev_venta) / r.prev_venta) * 100, 2)
             ELSE 0
           END AS variacion_pct,
           NULL::numeric AS volumen,
           $1::text AS moneda_base
    FROM divisas m
    LEFT JOIN ranked r ON r.id_divisa = m.id_divisa AND r.rn = 1
    WHERE m.tipo = 'Accion'
    ORDER BY r.precio_venta DESC NULLS LAST, m.nombre ASC
  `, [monedaBase]);

  return rows.map(r => ({
    ticker: r.ticker,
    nombre: r.nombre,
    precio: toNumber(r.precio),
    variacion_pct: toNumber(r.variacion_pct),
    volumen: r.volumen,
    moneda_base: r.moneda_base
  }));
}

module.exports = { getActiveRates, getHistory, convert, getMarketPanel };
