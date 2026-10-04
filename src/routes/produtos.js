const express = require('express');
const db = require('../config/db');

const router = express.Router();

// GET /produtos -> produtos disponíveis, com sabores e adicionais (só os disponíveis).
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      select p.id, p.nome, p.descricao, p.preco, p.categoria, p.disponivel,
        array(select s from unnest(p.sabores) s where s <> all(p.sabores_esgotados)) as sabores, p.imagem_url, p.galeria, p.promo_qtd, p.promo_preco, p.precos_sabor,
        coalesce(
          json_agg(json_build_object('id', a.id, 'nome', a.nome, 'preco', a.preco) order by a.nome)
            filter (where a.id is not null and a.disponivel),
          '[]'
        ) as adicionais
      from produtos p
      left join adicionais a on a.produto_id = p.id
      where p.disponivel = true
        and (cardinality(p.sabores) = 0 or exists (select 1 from unnest(p.sabores) s where s <> all(p.sabores_esgotados)))
      group by p.id
      order by p.categoria, p.preco, p.nome`);
    res.json(rows.map((p) => ({ ...p, preco: p.preco === null ? null : Number(p.preco), promo_preco: p.promo_preco === null ? null : Number(p.promo_preco) })));
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
