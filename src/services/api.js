// ── src/services/api.js ─────────────────────────────────────────────────────
// Centraliza todas las llamadas HTTP al backend y APIs de cotización en tiempo real.

// Ruta relativa: en desarrollo Vite proxya /api al backend local (vite.config.js).
// En producción usa VITE_API_URL si está seteada, si no apunta al backend de Render.
const BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'https://divise.onrender.com');

/**
 * Helper genérico para fetch con JSON al backend propio.
 */
async function request(path, options = {}) {
  try {
    const res = await fetch(`${BASE_URL}/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message =
        data?.message || data?.error || `Error ${res.status}: ${res.statusText}`;
      throw new Error(message);
    }

    return data;
  } catch (err) {
    console.warn(`[API] Servidor backend no disponible (${err.message}).`);
    throw err;
  }
}

// ── Auth endpoints ────────────────────────────────────────────────────────────

export function authRegister({ nombre, email, password }) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ nombre, email, password }),
  });
}

export function authLogin({ email, password }) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// ── Catálogo de monedas ───────────────────────────────────────────────────────

const CRYPTO_CURRENCIES = [
  { id: 'bitcoin', codigo: 'BTC', nombre: 'Bitcoin' },
  { id: 'ethereum', codigo: 'ETH', nombre: 'Ethereum' },
  { id: 'solana', codigo: 'SOL', nombre: 'Solana' },
  { id: 'tether', codigo: 'USDT', nombre: 'Tether' },
  { id: 'binancecoin', codigo: 'BNB', nombre: 'BNB' },
];

// Forex FIAT que DolarApi no expone (se cruzan contra el Dólar Oficial vía open.er-api).
const FOREX_CROSS_CODES = ['GBP', 'JPY', 'CAD', 'CHF'];

const FOREX_NAMES = {
  GBP: 'Libra Esterlina',
  JPY: 'Yen Japonés',
  CAD: 'Dólar Canadiense',
  CHF: 'Franco Suizo',
};

/** Mapea un mercado de Dólar a la fuente equivalente en bluelytics para calcular variación. */
const SOURCE_KEYS = { Informal: 'blue', Oficial: 'oficial', Financiero: 'ccl' };

// ── Cache de variación diaria (bluelytics evolution, pesado ~700KB) ──────────
let usdVariationsCache = null;
let usdVariationsCacheAt = 0;
const VARIATIONS_TTL = 10 * 60 * 1000; // 10 minutos

/**
 * Variación diaria (%) del Dólar Blue / Oficial / CCL.
 * Se calcula comparando el último valor de venta con el anterior (bluelytics).
 */
async function getUsdVariations() {
  const now = Date.now();
  if (usdVariationsCache && now - usdVariationsCacheAt < VARIATIONS_TTL) {
    return usdVariationsCache;
  }
  try {
    const res = await fetch('https://api.bluelytics.com.ar/v2/evolution.json');
    const data = await res.json();
    const seen = {};
    for (const row of data) {
      const source = String(row.source || '').toLowerCase();
      if (!seen[source]) seen[source] = [];
      if (seen[source].length < 2) seen[source].push(Number(row.value_sell));
    }
    const result = {};
    for (const [source, values] of Object.entries(seen)) {
      if (values.length === 2 && values[1] > 0) {
        result[source] = ((values[0] - values[1]) / values[1]) * 100;
      }
    }
    usdVariationsCache = result;
    usdVariationsCacheAt = now;
    return result;
  } catch (err) {
    console.warn('[API] No se pudo calcular la variación diaria del dólar.', err.message);
    return {};
  }
}

// ── Cotizaciones en Tiempo Real (DolarApi + CoinGecko + open.er-api) ─────────

/**
 * Obtiene las cotizaciones actuales en tiempo real:
 *  - Dólares (Oficial, Blue, MEP, CCL, Tarjeta, Mayorista, Cripto) desde DolarApi.
 *  - Fiat (EUR, BRL, UYU, CLP) desde DolarApi y (GBP, JPY, CAD, CHF) desde open.er-api.
 *  - Cripto (BTC, ETH, SOL, USDT, BNB) desde CoinGecko en ARS.
 * Cada rate incluye su % de variación diario cuando la fuente lo provee.
 */
export async function fetchRates() {
  try {
    const [dolaresRes, cotizRes, cryptoRes, forexRes] = await Promise.allSettled([
      fetch('https://dolarapi.com/v1/dolares').then((res) => res.json()),
      fetch('https://dolarapi.com/v1/cotizaciones').then((res) => res.json()),
      fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${CRYPTO_CURRENCIES.map((c) => c.id).join(',')}&vs_currencies=ars&include_24hr_change=true`).then((res) => res.json()),
      fetch('https://open.er-api.com/v6/latest/USD').then((res) => res.json()),
    ]);

    let formattedRates = [];
    const usdVariations = await getUsdVariations();

    // Cotizaciones del Dólar (Oficial, Blue, Bolsa, CCL, Tarjeta, Mayorista, Cripto)
    if (dolaresRes.status === 'fulfilled' && Array.isArray(dolaresRes.value)) {
      const mappedDolares = dolaresRes.value.map((d) => {
        const mercado =
          d.casa === 'blue' ? 'Informal'
            : d.casa === 'oficial' ? 'Oficial'
              : d.casa === 'bolsa' ? 'Bolsa'
                : d.casa === 'contadoconliqui' ? 'Financiero'
                  : d.casa === 'tarjeta' ? 'Tarjeta'
                    : d.casa === 'mayorista' ? 'Mayorista'
                      : d.casa === 'cripto' ? 'Cripto'
                        : d.nombre;
        const source = SOURCE_KEYS[mercado];
        const variacion = source && usdVariations[source] != null ? usdVariations[source] : undefined;
        return {
          codigo: 'USD',
          nombre: `Dólar ${d.nombre}`,
          tipo_mercado: mercado,
          tipo: 'Fiat',
          compra: d.compra || d.venta,
          venta: d.venta,
          variacion,
          updated_at: d.fechaActualizacion,
        };
      });
      formattedRates.push(...mappedDolares);
    }

    // Cotizaciones de otras divisas oficiales (Euro, Real, Peso Uruguayo, Peso Chileno)
    if (cotizRes.status === 'fulfilled' && Array.isArray(cotizRes.value)) {
      const mappedCotiz = cotizRes.value
        .filter((c) => c.moneda !== 'USD')
        .map((c) => ({
          codigo: c.moneda,
          nombre: c.nombre,
          tipo_mercado: 'Oficial',
          tipo: 'Fiat',
          compra: c.compra || c.venta,
          venta: c.venta,
          updated_at: c.fechaActualizacion,
        }));
      formattedRates.push(...mappedCotiz);
    }

    // Forex no cubierto por DolarApi (GBP, JPY, CAD, CHF) cruzado contra el Dólar Oficial real
    const oficialUsd =
      dolaresRes.status === 'fulfilled' && Array.isArray(dolaresRes.value)
        ? dolaresRes.value.find((d) => d.casa === 'oficial')
        : null;
    if (forexRes.status === 'fulfilled' && forexRes.value?.result === 'success' && oficialUsd) {
      const base = Number(oficialUsd.compra);
      const ask = Number(oficialUsd.venta);
      if (base > 0 && ask > 0) {
        for (const code of FOREX_CROSS_CODES) {
          const cross = Number(forexRes.value.rates?.[code]);
          if (cross > 0) {
            formattedRates.push({
              codigo: code,
              nombre: FOREX_NAMES[code],
              tipo_mercado: 'Oficial',
              tipo: 'Fiat',
              compra: base / cross,
              venta: ask / cross,
              updated_at: new Date().toISOString(),
            });
          }
        }
      }
    }

    // Cripto en ARS (CoinGecko) con variación real de 24 h
    if (cryptoRes.status === 'fulfilled' && cryptoRes.value) {
      const cryptoData = cryptoRes.value;
      for (const { id, codigo, nombre } of CRYPTO_CURRENCIES) {
        const ars = Number(cryptoData[id]?.ars);
        if (ars > 0) {
          const change = Number(cryptoData[id]?.ars_24h_change);
          formattedRates.push({
            codigo,
            nombre,
            tipo_mercado: 'Cripto',
            tipo: 'Cripto',
            compra: ars,
            venta: ars * 1.01,
            variacion: Number.isFinite(change) ? change : undefined,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    if (formattedRates.length > 0) {
      return formattedRates;
    }
    throw new Error("No rates returned");
  } catch (err) {
    console.error("Error fetching live rates", err);
    return [
      { codigo: 'USD', nombre: 'Dólar Blue', tipo_mercado: 'Informal', tipo: 'Fiat', compra: 1520, venta: 1540, variacion: 0.33 },
      { codigo: 'USD', nombre: 'Dólar Oficial', tipo_mercado: 'Oficial', tipo: 'Fiat', compra: 1460, venta: 1510, variacion: 0.2 },
      { codigo: 'USD', nombre: 'Dólar Bolsa (MEP)', tipo_mercado: 'Bolsa', tipo: 'Fiat', compra: 1518.9, venta: 1522.4, variacion: 0.1 },
      { codigo: 'USD', nombre: 'Dólar Contado con Liqui', tipo_mercado: 'Financiero', tipo: 'Fiat', compra: 1575.5, venta: 1576, variacion: 0.05 },
      { codigo: 'USD', nombre: 'Dólar Tarjeta', tipo_mercado: 'Tarjeta', tipo: 'Fiat', compra: 1898, venta: 1963, variacion: 0.2 },
      { codigo: 'EUR', nombre: 'Euro', tipo_mercado: 'Oficial', tipo: 'Fiat', compra: 1707.97, venta: 1722.07, variacion: 0.1 },
      { codigo: 'BRL', nombre: 'Real Brasileño', tipo_mercado: 'Oficial', tipo: 'Fiat', compra: 283.89, venta: 284.05, variacion: 0.1 },
      { codigo: 'GBP', nombre: 'Libra Esterlina', tipo_mercado: 'Oficial', tipo: 'Fiat', compra: 1965, venta: 2030, variacion: 0.1 },
      { codigo: 'JPY', nombre: 'Yen Japonés', tipo_mercado: 'Oficial', tipo: 'Fiat', compra: 9.2, venta: 9.5, variacion: 0.1 },
      { codigo: 'CAD', nombre: 'Dólar Canadiense', tipo_mercado: 'Oficial', tipo: 'Fiat', compra: 1070, venta: 1105, variacion: 0.1 },
      { codigo: 'CHF', nombre: 'Franco Suizo', tipo_mercado: 'Oficial', tipo: 'Fiat', compra: 1700, venta: 1755, variacion: 0.1 },
      { codigo: 'BTC', nombre: 'Bitcoin', tipo_mercado: 'Cripto', tipo: 'Cripto', compra: 94074276, venta: 95015018, variacion: -0.16 },
      { codigo: 'ETH', nombre: 'Ethereum', tipo_mercado: 'Cripto', tipo: 'Cripto', compra: 2806959, venta: 2835028, variacion: 0.27 },
      { codigo: 'SOL', nombre: 'Solana', tipo_mercado: 'Cripto', tipo: 'Cripto', compra: 112402, venta: 113526, variacion: -0.52 },
      { codigo: 'USDT', nombre: 'Tether', tipo_mercado: 'Cripto', tipo: 'Cripto', compra: 1491.1, venta: 1506, variacion: 0.05 },
      { codigo: 'BNB', nombre: 'BNB', tipo_mercado: 'Cripto', tipo: 'Cripto', compra: 904597, venta: 913642, variacion: -0.23 },
    ];
  }
}

/**
 * Historial diario del Dólar Blue / Oficial en ARS (bluelytics).
 * La API devuelve los datos de más reciente a más antigua: se toman los
 * primeros `days` registros y se invierten para que el gráfico vaya de
 * pasado a presente (corrige el bug que mostraba valores de 2011).
 * Devuelve [{ date, compra, venta }].
 */
export async function fetchUsdHistory(source = 'Blue', days = 30) {
  const res = await fetch('https://api.bluelytics.com.ar/v2/evolution.json');
  const data = await res.json();
  const rows = data
    .filter((r) => r.source.toLowerCase() === source.toLowerCase())
    .slice(0, Math.max(days, 2))
    .reverse()
    .map((r) => ({
      date: r.date,
      compra: Number(r.value_buy),
      venta: Number(r.value_sell),
    }));
  return rows;
}

/**
 * Historial de una cripto en ARS (CoinGecko).
 * Para 1 día devuelve puntos horarios (~24); para más días, puntos diarios.
 * Devuelve [{ date, compra, venta }].
 */
export async function fetchCryptoHistory(id = 'bitcoin', days = 30) {
  const url =
    days <= 1
      ? `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=ars&days=1`
      : `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=ars&days=${days}&interval=daily`;
  const res = await fetch(url);
  const data = await res.json();

  let points = data.prices || [];

  if (days <= 1) {
    // La API devuelve datos de 5 minutos: se agrupan por hora (~24 puntos)
    const hourly = new Map();
    for (const [ts, price] of points) {
      const key = new Date(ts).setMinutes(0, 0, 0);
      hourly.set(key, price);
    }
    points = [...hourly.entries()].sort((a, b) => a[0] - b[0]).slice(-24);
  }

  return points.map(([ts, price]) => {
    const d = new Date(ts);
    return {
      date: days <= 1 ? d.toISOString() : d.toISOString().slice(0, 10),
      compra: Number(price),
      venta: Number(price),
    };
  });
}
