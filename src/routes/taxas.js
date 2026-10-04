const express = require('express');
const db = require('../config/db');

const router = express.Router();

// GET /taxas-entrega -> [{ bairro, taxa }]. Lista vazia = a doceria não cobra taxa.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query('select bairro, taxa from taxas_entrega order by bairro');
    res.json(rows.map((t) => ({ bairro: t.bairro, taxa: Number(t.taxa) })));
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
