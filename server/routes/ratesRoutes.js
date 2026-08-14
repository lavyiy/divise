const express = require('express');
const router = express.Router();
const ratesService = require('../services/ratesService');

// GET /api/rates — cotizaciones activas con variación (Q01)
router.get('/', async (req, res) => {
  try {
    const rates = await ratesService.getActiveRates();
    res.json(rates);
  } catch (error) {
    console.error('Error fetching rates:', error);
    res.status(500).json({ error: 'Error interno del servidor al obtener cotizaciones' });
  }
});

// GET /api/rates/history?codigo=USD&mercado=Blue&dias=30 (Q03)
router.get('/history', async (req, res) => {
  try {
    const { codigo, mercado } = req.query;
    if (!codigo) {
      return res.status(400).json({ error: 'Falta el parámetro codigo.' });
    }
    const dias = Math.max(parseInt(req.query.dias, 10) || 30, 1);
    const history = await ratesService.getHistory(codigo, dias, mercado || null);
    res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Error interno al obtener el historial' });
  }
});

// POST /api/rates/convert — conversión entre monedas (Q05)
router.post('/convert', async (req, res) => {
  try {
    const { monto, origen, destino } = req.body || {};
    const result = await ratesService.convert(monto, origen, destino);
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

// GET /api/rates/panel?moneda_base=ARS — panel bursátil (Q06, planificado)
router.get('/panel', async (req, res) => {
  try {
    const panel = await ratesService.getMarketPanel(req.query.moneda_base || 'ARS');
    res.json(panel);
  } catch (error) {
    console.error('Error fetching panel:', error);
    res.status(500).json({ error: 'Error interno al obtener el panel bursátil' });
  }
});

module.exports = router;
