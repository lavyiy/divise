const pool = require('../config/db');
const alertService = require('./alertService');

/**
 * Fetch rates from DolarApi (Argentina) and CoinGecko (Crypto)
 * and update the database.
 */
async function syncRates() {
  console.log('🔄 Iniciando sincronización de cotizaciones...');
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    
    // 1. Fetch DolarApi (ARS - Blue, Oficial)
    const dolarRes = await fetch('https://dolarapi.com/v1/dolares');
    if (dolarRes.ok) {
      const dolares = await dolarRes.json();
      
      const blue = dolares.find(d => d.casa === 'blue');
      const oficial = dolares.find(d => d.casa === 'oficial');
      
      if (blue) {
        await updateRate(client, 'USD', 'Blue', blue.compra, blue.venta);
      }
      if (oficial) {
        await updateRate(client, 'USD', 'Oficial', oficial.compra, oficial.venta);
      }
    }
    
    // 2. Fetch DolarApi (Euro)
    const euroRes = await fetch('https://dolarapi.com/v1/cotizaciones/eur');
    if (euroRes.ok) {
      const euro = await euroRes.json();
      await updateRate(client, 'EUR', 'Oficial', euro.compra, euro.venta);
    }
    
    // 3. Fetch CoinGecko (BTC, ETH en ARS, consistente con el resto de las cotizaciones)
    const cryptoRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=ars');
    if (cryptoRes.ok) {
      const cryptos = await cryptoRes.json();
      
      if (cryptos.bitcoin?.ars) {
        await updateRate(client, 'BTC', 'Cripto', cryptos.bitcoin.ars, cryptos.bitcoin.ars * 1.01);
      }
      if (cryptos.ethereum?.ars) {
        await updateRate(client, 'ETH', 'Cripto', cryptos.ethereum.ars, cryptos.ethereum.ars * 1.01);
      }
    }
    
    await client.query('COMMIT');
    console.log('✅ Cotizaciones sincronizadas con éxito.');
    
    // Luego de sincronizar, verificamos las alertas
    await alertService.checkAlerts();
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error sincronizando cotizaciones:', err.message);
  } finally {
    if (client) client.release();
  }
}

async function updateRate(client, divisaCodigo, tipoMercado, compra, venta) {
  // 1. Get id_divisa
  const divisaRes = await client.query('SELECT id_divisa FROM divisas WHERE codigo = $1', [divisaCodigo]);
  if (divisaRes.rows.length === 0) return;
  const idDivisa = divisaRes.rows[0].id_divisa;
  
  // 2. Insertar una fila nueva por ciclo para preservar el historial
  //    (permite calcular variación real y alimentar los gráficos)
  await client.query(`
    INSERT INTO tipos_de_cambio (id_divisa, precio_compra, precio_venta, tipo_mercado)
    VALUES ($1, $2, $3, $4)
  `, [idDivisa, compra, venta, tipoMercado]);
}

module.exports = { syncRates };
