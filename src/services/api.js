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

// ── Cotizaciones en Tiempo Real (DolarHoy / DolarApi) ───────────────────────

/**
 * Obtiene las cotizaciones actuales en tiempo real:
 *  - Fiat (USD, EUR, BRL, ...) desde DolarApi (ARS).
 *  - Cripto (BTC, ETH) desde CoinGecko (también en ARS).
 */
export async function fetchRates() {
  try {
    const [dolaresRes, cotizRes, cryptoRes] = await Promise.allSettled([
      fetch('https://dolarapi.com/v1/dolares').then(res => res.json()),
      fetch('https://dolarapi.com/v1/cotizaciones').then(res => res.json()),
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=ars').then(res => res.json())
    ]);

    let formattedRates = [];

    // Cotizaciones del Dólar (Oficial, Blue, Bolsa, CCL, Tarjeta, Mayorista, Cripto)
    if (dolaresRes.status === 'fulfilled' && Array.isArray(dolaresRes.value)) {
      const mappedDolares = dolaresRes.value.map(d => ({
        codigo: 'USD',
        nombre: `Dólar ${d.nombre}`,
        tipo_mercado: d.casa === 'blue' ? 'Informal' : d.casa === 'oficial' ? 'Oficial' : d.casa === 'bolsa' ? 'Bolsa' : d.casa === 'contadoconliqui' ? 'Financiero' : d.casa === 'tarjeta' ? 'Tarjeta' : d.casa === 'cripto' ? 'Cripto' : d.nombre,
        tipo: d.casa === 'blue' ? 'Informal' : 'Oficial',
        compra: d.compra || d.venta,
        venta: d.venta,
        updated_at: d.fechaActualizacion
      }));
      formattedRates.push(...mappedDolares);
    }

    // Cotizaciones de otras divisas (Euro, Real, Peso Uruguayo, Peso Chileno)
    if (cotizRes.status === 'fulfilled' && Array.isArray(cotizRes.value)) {
      const mappedCotiz = cotizRes.value
        .filter(c => c.moneda !== 'USD')
        .map(c => ({
          codigo: c.moneda,
          nombre: c.nombre,
          tipo_mercado: 'Oficial',
          tipo: 'Oficial',
          compra: c.compra || c.venta,
          venta: c.venta,
          updated_at: c.fechaActualizacion
        }));
      formattedRates.push(...mappedCotiz);
    }

    // Cripto en ARS (CoinGecko)
    if (cryptoRes.status === 'fulfilled' && cryptoRes.value?.bitcoin?.ars) {
      const btcArs = cryptoRes.value.bitcoin.ars;
      const ethArs = cryptoRes.value.ethereum?.ars;
      formattedRates.push(
        { codigo: 'BTC', nombre: 'Bitcoin', tipo_mercado: 'Cripto', tipo: 'Cripto', compra: btcArs, venta: btcArs * 1.01, updated_at: new Date().toISOString() },
        { codigo: 'ETH', nombre: 'Ethereum', tipo_mercado: 'Cripto', tipo: 'Cripto', compra: ethArs || btcArs / 30, venta: (ethArs || btcArs / 30) * 1.01, updated_at: new Date().toISOString() }
      );
    }

    if (formattedRates.length > 0) {
      return formattedRates;
    }
    throw new Error("No rates returned");
  } catch (err) {
    console.error("Error fetching live rates", err);
    return [
      { codigo: 'USD', nombre: 'Dólar Blue', tipo_mercado: 'Informal', tipo: 'Informal', compra: 1520, venta: 1540 },
      { codigo: 'USD', nombre: 'Dólar Oficial', tipo_mercado: 'Oficial', tipo: 'Oficial', compra: 1465, venta: 1515 },
      { codigo: 'USD', nombre: 'Dólar Bolsa (MEP)', tipo_mercado: 'Bolsa', tipo: 'Financiero', compra: 1524, venta: 1526 },
      { codigo: 'USD', nombre: 'Dólar Contado con Liqui', tipo_mercado: 'Financiero', tipo: 'Financiero', compra: 1579, venta: 1581 },
      { codigo: 'USD', nombre: 'Dólar Tarjeta', tipo_mercado: 'Tarjeta', tipo: 'Oficial', compra: 1904, venta: 1969 },
      { codigo: 'EUR', nombre: 'Euro', tipo_mercado: 'Oficial', tipo: 'Oficial', compra: 1707, venta: 1722 },
      { codigo: 'BRL', nombre: 'Real Brasileño', tipo_mercado: 'Oficial', tipo: 'Oficial', compra: 286, venta: 287 },
      { codigo: 'BTC', nombre: 'Bitcoin', tipo_mercado: 'Cripto', tipo: 'Cripto', compra: 93393926, venta: 94327865 },
      { codigo: 'ETH', nombre: 'Ethereum', tipo_mercado: 'Cripto', tipo: 'Cripto', compra: 2784629, venta: 2812475 }
    ];
  }
}

/**
 * Historial diario del Dólar Blue / Oficial en ARS (bluelytics).
 * Devuelve [{ date, compra, venta }] de los últimos `days` días.
 */
export async function fetchUsdHistory(source = 'Blue', days = 30) {
  const res = await fetch('https://api.bluelytics.com.ar/v2/evolution.json');
  const data = await res.json();
  const rows = data
    .filter((r) => r.source.toLowerCase() === source.toLowerCase())
    .slice(-days)
    .map((r) => ({
      date: r.date,
      compra: Number(r.value_buy),
      venta: Number(r.value_sell),
    }));
  return rows;
}

/**
 * Historial diario de una cripto en ARS (CoinGecko).
 * Devuelve [{ date, compra, venta }] de los últimos `days` días.
 */
export async function fetchCryptoHistory(id = 'bitcoin', days = 30) {
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=ars&days=${days}&interval=daily`);
  const data = await res.json();
  return (data.prices || []).map(([ts, price]) => {
    const d = new Date(ts);
    return {
      date: d.toISOString().slice(0, 10),
      compra: Number(price),
      venta: Number(price),
    };
  });
}
