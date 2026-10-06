// Gestão do cardápio pelo painel da cozinha (tudo exige login).
const express = require('express');
const db = require('../config/db');
const { exigirPainel, senhaCorreta, trocarSenha, gerarToken, SENHA_MINIMA } = require('../middleware/auth');
const { UUID, validarProduto, ErroValidacao } = require('../lib/regras');
const { estadoLoja, validarConfigLoja } = require('../lib/loja');
const { lerConfigLoja, gravarConfigLoja } = require('./loja');
const { PERIODOS, resumoVendas } = require('../lib/vendas');
const { TIPOS_ACEITOS, MAX_BYTES, prepararFoto } = require('../lib/fotos');
const { validarTaxaEntrega } = require('../lib/entrega');
const { lerConfigEntrega } = require('./taxas');

const router = express.Router();
router.use(exigirPainel);

const COLUNAS = `id, nome, descricao, preco, categoria, disponivel, sabores, sabores_esgotados,
  precos_sabor, promo_qtd, promo_preco, imagem_url, galeria`;

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
    // foto que aparece no card: a principal, ou a primeira do carrossel
    foto: p.imagem_url || (p.galeria || [])[0]?.url || null,
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

// ---------- Taxas de entrega ----------
// Duplicado (mesmo bairro ou mesma cidade) vira uma mensagem clara.
function erroDuplicado(erro, dados) {
  if (erro.code !== '23505') return erro;
  return new ErroValidacao(dados.bairro ? `O bairro ${dados.bairro} já está na lista.` : `A cidade ${dados.cidade} já está na lista.`, 409);
}

// GET /painel/entrega  -> { cidade_principal, bairros: [{ id, bairro, taxa }], cidades: [{ id, cidade, taxa }] }
router.get('/entrega', async (req, res, next) => {
  try {
    res.json(await lerConfigEntrega());
  } catch (erro) {
    next(erro);
  }
});

// POST /painel/entrega  { tipo: 'bairro', bairro, taxa } | { tipo: 'cidade', cidade, taxa }
router.post('/entrega', async (req, res, next) => {
  let dados;
  try {
    dados = validarTaxaEntrega(req.body);
    await db.query('insert into taxas_entrega (cidade, bairro, taxa) values ($1, $2, $3)', [dados.cidade, dados.bairro, dados.taxa]);
    res.status(201).json(await lerConfigEntrega());
  } catch (erro) {
    next(erroDuplicado(erro, dados || {}));
  }
});

// PATCH /painel/entrega/:id  (mesmo formato do POST)
router.patch('/entrega/:id', async (req, res, next) => {
  let dados;
  try {
    if (!UUID.test(req.params.id)) return res.status(404).json({ erro: 'Não encontrado.' });
    dados = validarTaxaEntrega(req.body);
    const r = await db.query('update taxas_entrega set cidade = $2, bairro = $3, taxa = $4 where id = $1', [req.params.id, dados.cidade, dados.bairro, dados.taxa]);
    if (!r.rowCount) return res.status(404).json({ erro: 'Não encontrado.' });
    res.json(await lerConfigEntrega());
  } catch (erro) {
    next(erroDuplicado(erro, dados || {}));
  }
});

// DELETE /painel/entrega/:id
router.delete('/entrega/:id', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(404).json({ erro: 'Não encontrado.' });
    await db.query('delete from taxas_entrega where id = $1', [req.params.id]);
    res.json(await lerConfigEntrega());
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

// ---------- Foto do produto ----------
// A foto fica no banco (o disco do servidor no Render grátis é apagado a cada atualização).
const ehFotoDoPainel = (url) => typeof url === 'string' && /^imagens\/[0-9a-f-]{36}$/i.test(url);

// Apaga do banco a foto antiga que não é mais usada (só as enviadas pelo painel; as do projeto ficam).
async function apagarFotoAntiga(cliente, url) {
  if (ehFotoDoPainel(url)) await cliente.query('delete from imagens where id = $1', [url.slice('imagens/'.length)]);
}

// Produto com carrossel (galeria): a foto principal é o primeiro slide; nos outros, a imagem_url.
async function trocarFoto(cliente, produto, novaUrl) {
  const galeria = Array.isArray(produto.galeria) ? produto.galeria : [];
  if (galeria.length > 1) {
    const antiga = galeria[0].url;
    const nova = novaUrl ? [{ ...galeria[0], url: novaUrl }, ...galeria.slice(1)] : galeria.slice(1);
    await cliente.query('update produtos set galeria = $2::jsonb where id = $1', [produto.id, JSON.stringify(nova)]);
    await apagarFotoAntiga(cliente, antiga);
  } else {
    await cliente.query('update produtos set imagem_url = $2 where id = $1', [produto.id, novaUrl]);
    await apagarFotoAntiga(cliente, produto.imagem_url);
  }
}

// PUT /painel/produtos/:id/foto  (corpo = a própria imagem, Content-Type image/jpeg|png|webp)
router.put('/produtos/:id/foto', express.raw({ type: TIPOS_ACEITOS, limit: MAX_BYTES }), async (req, res, next) => {
  let cliente;
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(404).json({ erro: 'Produto não encontrado.' });
    if (!TIPOS_ACEITOS.includes(req.get('content-type'))) {
      return res.status(415).json({ erro: 'Envie uma foto em JPG, PNG ou WEBP.' });
    }
    const jpg = await prepararFoto(req.body);

    cliente = await db.connect();
    await cliente.query('begin');
    const atual = await cliente.query(`select ${COLUNAS} from produtos where id = $1 for update`, [id]);
    if (!atual.rows.length) {
      await cliente.query('rollback');
      return res.status(404).json({ erro: 'Produto não encontrado.' });
    }
    const { rows } = await cliente.query("insert into imagens (dados, tipo) values ($1, 'image/jpeg') returning id", [jpg]);
    await trocarFoto(cliente, atual.rows[0], `imagens/${rows[0].id}`);
    await cliente.query('commit');

    const novo = await db.query(`select ${COLUNAS} from produtos where id = $1`, [id]);
    res.json(formatar(novo.rows[0]));
  } catch (erro) {
    if (cliente) await cliente.query('rollback').catch(() => {});
    if (erro.type === 'entity.too.large') return res.status(413).json({ erro: 'A foto é grande demais (máximo 10 MB).' });
    next(erro);
  } finally {
    if (cliente) cliente.release();
  }
});

// DELETE /painel/produtos/:id/foto  -> volta para o desenho padrão (ou para o próximo slide do carrossel)
router.delete('/produtos/:id/foto', async (req, res, next) => {
  let cliente;
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(404).json({ erro: 'Produto não encontrado.' });
    cliente = await db.connect();
    await cliente.query('begin');
    const atual = await cliente.query(`select ${COLUNAS} from produtos where id = $1 for update`, [id]);
    if (!atual.rows.length) {
      await cliente.query('rollback');
      return res.status(404).json({ erro: 'Produto não encontrado.' });
    }
    await trocarFoto(cliente, atual.rows[0], null);
    await cliente.query('commit');
    const novo = await db.query(`select ${COLUNAS} from produtos where id = $1`, [id]);
    res.json(formatar(novo.rows[0]));
  } catch (erro) {
    if (cliente) await cliente.query('rollback').catch(() => {});
    next(erro);
  } finally {
    if (cliente) cliente.release();
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
