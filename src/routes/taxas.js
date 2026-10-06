// Taxas de entrega: GET /taxas-entrega é público (o checkout precisa da lista).
// Editar fica em /painel/entrega (exige login).
const express = require('express');
const db = require('../config/db');
const { montarConfigEntrega } = require('../lib/entrega');

async function lerConfigEntrega(cliente = db) {
  const { rows } = await cliente.query('select id, cidade, bairro, taxa from taxas_entrega');
  return montarConfigEntrega(rows);
}

const router = express.Router();

// GET /taxas-entrega -> { cidade_principal, bairros: [{ bairro, taxa }], cidades: [{ cidade, taxa }] }
// Tudo vazio = a doceria não cobra taxa.
router.get('/', async (req, res, next) => {
  try {
    const c = await lerConfigEntrega();
    res.json({
      cidade_principal: c.cidade_principal,
      bairros: c.bairros.map(({ bairro, taxa }) => ({ bairro, taxa })),
      cidades: c.cidades.map(({ cidade, taxa }) => ({ cidade, taxa })),
    });
  } catch (erro) {
    next(erro);
  }
});

module.exports = { router, lerConfigEntrega };
