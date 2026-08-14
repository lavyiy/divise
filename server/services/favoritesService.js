const pool = require('../config/db');

function toNumber(value) {
  return value === null || value === undefined ? null : parseFloat(value);
}

/**
 * Q02 — Favoritos del usuario con su última cotización y variación.
 */
async function getFavoritesWithRates(idUsuario) {
  const { rows } = await pool.query(`
    WITH ranked AS (
      SELECT tc.*,
             LAG(tc.precio_venta) OVER (
               PARTITION BY tc.id_divisa, tc.tipo_mercado
               ORDER BY tc.fecha_actualizacion, tc.id_tipo_cambio
             ) AS prev_venta,
             ROW_NUMBER() OVER (
               PARTITION BY tc.id_divisa, tc.tipo_mercado
               ORDER BY tc.fecha_actualizacion DESC, tc.id_tipo_cambio DESC
             ) AS rn
      FROM tipos_de_cambio tc
    )
    SELECT d.codigo, d.nombre, d.tipo,
           r.tipo_mercado AS mercado,
           r.precio_compra, r.precio_venta,
           CASE
             WHEN r.prev_venta > 0
             THEN ROUND(((r.precio_venta - r.prev_venta) / r.prev_venta) * 100, 2)
             ELSE 0
           END AS variacion_pct,
           r.fecha_actualizacion AS updated_at
    FROM favoritos f
    JOIN divisas d ON d.id_divisa = f.id_divisa
    LEFT JOIN ranked r ON r.id_divisa = f.id_divisa AND r.rn = 1
    WHERE f.id_usuario = $1
    ORDER BY f.id_favorito DESC
  `, [idUsuario]);

  return rows.map(r => ({
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

module.exports = { getFavoritesWithRates };
