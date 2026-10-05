// Gestão do cardápio pelo painel da cozinha (tudo exige login).
const express = require('express');
const db = require('../config/db');
const { exigirPainel, senhaCorreta, trocarSenha, gerarToken, SENHA_MINIMA } = require('../middleware/auth');
const { UUID, validarProduto, ErroValidacao } = require('../lib/regras');
const { estadoLoja, validarConfigLoja } = require('../lib/loja');
const { lerConfigLoja, gravarConfigLoja } = require('./loja');
const { PERIODOS, resumoVendas } = require('../lib/vendas');

const router = express.Router();
router.use(exigirPainel);

const COLUNAS = `id, nome, descricao, preco, categoria, disponivel, sabores, sabores_esgotados,
  precos_sabor, promo_qtd, promo_preco, imagem_url`;

// Banco -> formato do painel: sabores viram [{ nome, preco, esgotado }].
function formatar(p) {
  const precos = p.precos_sabor || {};
  return {
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    preco: Number(p.preco),
    categoria: p.categoria,
    disponivel: p.disponivel,
    sabores: (p.sabores || []).map((nome) => ({
      nome,
      preco: Number(precos[nome]) > 0 ? Number(precos[nome]) : null,
      esgotado: (p.sabores_esgotados || []).includes(nome),
    })),
    promo_qtd: p.promo_qtd,
    promo_preco: p.promo_preco === null ? null : Number(p.promo_preco),
    imagem_url: p.imagem_url,
  };
}

// POST /painel/senha  { atual, nova } -> troca a senha e devolve um token novo (as outras sessões caem)
router.post('/senha', async (req, res, next) => {
  try {
    const { atual, nova, lembrar } = req.body || {};
    if (!(await senhaCorreta(atual))) return res.status(403).json({ erro: 'A senha atual está incorreta.' });
    if (typeof nova !== 'string' || nova.length < SENHA_MINIMA) throw new ErroValidacao(`A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    if (nova.length > 100) throw new ErroValidacao('A nova senha é longa demais.');
    if (nova === atual) throw new ErroValidacao('A nova senha precisa ser diferente da atual.');
    await trocarSenha(nova);
    res.json({ token: await gerarToken({ lembrar: lembrar === true }) });
  } catch (erro) {
    next(erro);
  }
});

// GET /painel/vendas?dias=7|30|90  -> resumo de vendas (faturamento por dia e por produto)
router.get('/vendas', async (req, res, next) => {
  try {
    const dias = PERIODOS.includes(Number(req.query.dias)) ? Number(req.query.dias) : 30;
    // Busca um dia a mais por segurança de fuso; o resumo corta no período exato (horário de Recife).
    const { rows } = await db.query(
      `select p.status, p.criado_em, p.taxa_entrega,
         coalesce(json_agg(json_build_object('nome', i.nome, 'quantidade', i.quantidade,
           'preco_unitario', i.preco_unitario, 'desconto', i.desconto)) filter (where i.id is not null), '[]') as itens
       from pedidos p left join itens_pedido i on i.pedido_id = p.id
       where p.criado_em > now() - make_interval(days => $1)
       group by p.id`,
      [dias + 1],
    );
    res.json(resumoVendas(rows, { dias }));
  } catch (erro) {
    next(erro);
  }
});

// GET /painel/loja  -> configuração completa + estado atual
router.get('/loja', async (req, res, next) => {
  try {
    const config = await lerConfigLoja();
    res.json({ config, estado: estadoLoja(config) });
  } catch (erro) {
    next(erro);
  }
});

// PATCH /painel/loja  (aceita só os campos enviados, ex.: { pausado: true })
router.patch('/loja', async (req, res, next) => {
  try {
    const config = validarConfigLoja({ ...(await lerConfigLoja()), ...(req.body || {}) });
    await gravarConfigLoja(config);
    res.json({ config, estado: estadoLoja(config) });
  } catch (erro) {
    next(erro);
  }
});

// GET /painel/produtos  (inclui os indisponíveis)
router.get('/produtos', async (req, res, next) => {
  try {
    const { rows } = await db.query(`select ${COLUNAS} from produtos order by categoria, preco, nome`);
    res.json(rows.map(formatar));
  } catch (erro) {
    next(erro);
  }
});

// POST /painel/produtos
router.post('/produtos', async (req, res, next) => {
  try {
    const p = validarProduto(req.body);
    const { rows } = await db.query(
      `insert into produtos (nome, descricao, preco, categoria, disponivel, sabores, precos_sabor, sabores_esgotados, promo_qtd, promo_preco)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) returning ${COLUNAS}`,
      [p.nome, p.descricao, p.preco, p.categoria, p.disponivel, p.sabores, JSON.stringify(p.precos_sabor),
        p.sabores_esgotados, p.promo_qtd, p.promo_preco],
    );
    res.status(201).json(formatar(rows[0]));
  } catch (erro) {
    next(erro);
  }
});

// PATCH /painel/produtos/:id  (aceita só alguns campos, ex.: { disponivel: false })
router.patch('/produtos/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(404).json({ erro: 'Produto não encontrado.' });
    const atual = await db.query(`select ${COLUNAS} from produtos where id = $1`, [id]);
    if (!atual.rows.length) return res.status(404).json({ erro: 'Produto não encontrado.' });

    const p = validarProduto({ ...formatar(atual.rows[0]), ...req.body });
    const { rows } = await db.query(
      `update produtos set nome=$2, descricao=$3, preco=$4, categoria=$5, disponivel=$6, sabores=$7,
         precos_sabor=$8::jsonb, sabores_esgotados=$9, promo_qtd=$10, promo_preco=$11
       where id=$1 returning ${COLUNAS}`,
      [id, p.nome, p.descricao, p.preco, p.categoria, p.disponivel, p.sabores, JSON.stringify(p.precos_sabor),
        p.sabores_esgotados, p.promo_qtd, p.promo_preco],
    );
    res.json(formatar(rows[0]));
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
