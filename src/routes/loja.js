// Configuração da loja (aberta/fechada, horário, entrega/retirada).
// GET /loja é público (o site precisa saber se está aberto). Ler/alterar tudo fica em /painel/loja.
const express = require('express');
const db = require('../config/db');
const { completar, estadoLoja } = require('../lib/loja');

async function lerConfigLoja(cliente = db) {
  const { rows } = await cliente.query("select valor from painel_config where chave = 'loja'");
  return completar(rows[0] ? JSON.parse(rows[0].valor) : null);
}

async function gravarConfigLoja(config) {
  await db.query(
    "insert into painel_config (chave, valor) values ('loja', $1) on conflict (chave) do update set valor = excluded.valor",
    [JSON.stringify(config)],
  );
}

const router = express.Router();

// GET /loja  (público: só o necessário para o site)
router.get('/', async (req, res, next) => {
  try {
    const c = await lerConfigLoja();
    res.json({
      ...estadoLoja(c),
      aceita_entrega: c.aceita_entrega,
      aceita_retirada: c.aceita_retirada,
      endereco_retirada: c.aceita_retirada ? c.endereco_retirada : '',
    });
  } catch (erro) {
    next(erro);
  }
});

module.exports = { router, lerConfigLoja, gravarConfigLoja };
