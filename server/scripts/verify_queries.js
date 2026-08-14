// Verificación de las 6 consultas del Sprint 2 contra la DB real.
// Uso: node scripts/verify_queries.js  (desde /server)
require('dotenv').config();
const pool = require('../config/db');
const ratesService = require('../services/ratesService');
const favoritesService = require('../services/favoritesService');
const historyService = require('../services/historyService');

async function main() {
  const userRes = await pool.query('SELECT id_usuario FROM usuarios WHERE email = $1', ['prueba@email.com']);
  const userId = userRes.rows[0]?.id_usuario;
  console.log('Usuario de prueba:', userId);

  console.log('\n=== Q01: cotizaciones activas (última por divisa/mercado + variación) ===');
  const rates = await ratesService.getActiveRates();
  rates.forEach(r => console.log(
    `${r.codigo} [${r.mercado}] ${r.tipo}: compra=${r.compra} venta=${r.venta} variacion=${r.variacion_pct}%`
  ));

  console.log('\n=== Q03: historial USD Blue 30 días ===');
  const hist = await ratesService.getHistory('USD', 30, 'Blue');
  console.log(`filas=${hist.length}`);
  console.log('primera:', hist[0]);
  console.log('última:', hist[hist.length - 1]);

  console.log('\n=== Q02: favoritos con cotizaciones ===');
  const favs = await favoritesService.getFavoritesWithRates(userId);
  console.log(favs);

  console.log('\n=== Q04: historial de consultas del usuario ===');
  const queries = await historyService.getLastQueries(userId, 10, 0);
  console.log(queries);

  console.log('\n=== Q05: conversión ===');
  console.log('1000 ARS → USD :', await ratesService.convert(1000, 'ARS', 'USD'));
  console.log('1 USD → ARS   :', await ratesService.convert(1, 'USD', 'ARS'));
  console.log('1 BTC → USD   :', await ratesService.convert(1, 'BTC', 'USD'));
  try { await ratesService.convert(-5, 'ARS', 'USD'); } catch (e) { console.log('monto inválido →', e.status, e.message); }
  try { await ratesService.convert(1, 'XYZ', 'USD'); } catch (e) { console.log('origen inexistente →', e.status, e.message); }

  console.log('\n=== Q06: panel bursátil (planificado) ===');
  console.log(await ratesService.getMarketPanel('ARS'));

  await pool.end();
}

main().catch(err => { console.error('ERROR:', err); process.exit(1); });
