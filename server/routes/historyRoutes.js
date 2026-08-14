const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const historyService = require('../services/historyService');

router.use(verifyToken);

// GET /api/history?limit=50&offset=0 — historial de consultas del usuario (Q04)
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const history = await historyService.getLastQueries(req.user.id_usuario, limit, offset);
    res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
