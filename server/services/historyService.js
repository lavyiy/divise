const pool = require('../config/db');

function toNumber(value) {
  return value === null || value === undefined ? null : parseFloat(value);
}

/**
 * Q04 — Historial de consultas del usuario.
 * par_consultado tiene formato 'USD/ARS'; se extrae la moneda origen.
 */
async function getLastQueries(idUsuario, limit = 50, offset = 0) {
  const { rows } = await pool.query(`
    SELECT hc.id_historial AS id,
           LEFT(hc.par_consultado, POSITION('/' IN hc.par_consultado) - 1) AS codigo,
           COALESCE(d.nombre, hc.par_consultado) AS nombre,
           hc.valor_momento AS precio_al_momento,
           hc.fecha AS consulted_at
    FROM historial_de_consultas hc
    LEFT JOIN divisas d
      ON d.codigo = LEFT(hc.par_consultado, POSITION('/' IN hc.par_consultado) - 1)
    WHERE hc.id_usuario = $1
    ORDER BY hc.fecha DESC, hc.id_historial DESC
    LIMIT $2 OFFSET $3
  `, [idUsuario, limit, offset]);

  return rows.map(r => ({
    id: r.id,
    codigo: r.codigo,
    nombre: r.nombre,
    precio_al_momento: toNumber(r.precio_al_momento),
    consulted_at: r.consulted_at
  }));
}

module.exports = { getLastQueries };
