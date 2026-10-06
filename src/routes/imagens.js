// GET /imagens/:id  -> foto de produto enviada pelo painel (guardada no banco).
// Cada envio gera um id novo, então a foto pode ficar em cache "para sempre" no navegador.
const express = require('express');
const db = require('../config/db');
const { UUID } = require('../lib/regras');

const router = express.Router();

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(404).end();
    const { rows } = await db.query('select dados, tipo from imagens where id = $1', [id]);
    if (!rows.length) return res.status(404).end();
    res.set('Content-Type', rows[0].tipo);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(rows[0].dados);
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
