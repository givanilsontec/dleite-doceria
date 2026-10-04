const crypto = require('crypto');
const express = require('express');
const db = require('../config/db');
const { exigirPainel } = require('../middleware/auth');
const { estadoLoja } = require('../lib/loja');
const { lerConfigLoja } = require('./loja');
const {
  STATUS, UUID, ErroValidacao, calcularTaxa, validarPedido, montarItens, totalPedido,
} = require('../lib/regras');

const router = express.Router();

// ---------- Leitura ----------

const COLUNAS = `id, codigo, status, cliente_nome, cliente_whatsapp, endereco_rua, endereco_bairro,
  endereco_cidade, endereco_complemento, forma_pagamento, observacoes, criado_em, taxa_entrega, tipo_entrega`;

function formatarItem(i) {
  return {
    produto_id: i.produto_id,
    nome: i.nome,
    sabor: i.sabor,
    adicionais: i.adicionais || [],
    quantidade: i.quantidade,
    preco_unitario: Number(i.preco_unitario),
    desconto: Number(i.desconto) || 0,
  };
}

function formatarPedido(p, itens) {
  const taxa = p.taxa_entrega === null ? null : Number(p.taxa_entrega);
  const lista = itens.map(formatarItem);
  return { ...p, taxa_entrega: taxa, total: totalPedido(lista, taxa), itens: lista };
}

// Carrega os itens de vários pedidos de uma vez (evita uma consulta por pedido).
async function comItens(pedidos, cliente = db) {
  if (!pedidos.length) return [];
  const { rows } = await cliente.query(
    `select pedido_id, produto_id, nome, sabor, adicionais, quantidade, preco_unitario, desconto
       from itens_pedido where pedido_id = any($1::uuid[]) order by id`,
    [pedidos.map((p) => p.id)],
  );
  const porPedido = new Map();
  rows.forEach((i) => porPedido.set(i.pedido_id, [...(porPedido.get(i.pedido_id) || []), i]));
  return pedidos.map((p) => formatarPedido(p, porPedido.get(p.id) || []));
}

// ---------- Criar ----------

const TENTATIVAS_CODIGO = 8;

// Código aleatório (AT-482913): não dá para adivinhar o pedido de outra pessoa contando de 1 em 1.
const gerarCodigo = () => `AT-${crypto.randomInt(100000, 1000000)}`;

async function buscarPorChave(chave, cliente = db) {
  const { rows } = await cliente.query(`select ${COLUNAS} from pedidos where chave_idempotencia = $1`, [chave]);
  return rows[0] || null;
}

// Resposta do POST: o pedido completo, só para quem acabou de enviá-lo (ele já tem esses dados).
// Não existe consulta pública por código: nome, telefone e endereço só saem pelo painel (com login).
const respostaCriacao = (p) => p;

// POST /pedidos
// Cabeçalho opcional "Idempotency-Key": se o cliente repetir o envio (a rede caiu depois de gravar),
// devolve o pedido que já existe em vez de criar outro.
router.post('/', async (req, res, next) => {
  let cliente;
  try {
    const dados = validarPedido(req.body);
    const chave = (req.get('idempotency-key') || '').slice(0, 80) || null;

    if (chave) {
      const existente = await buscarPorChave(chave);
      if (existente) {
        const [pedido] = await comItens([existente]);
        return res.status(200).json(respostaCriacao(pedido));
      }
    }

    // Loja fechada ou modo de entrega desativado: o pedido não entra.
    const loja = await lerConfigLoja();
    const estado = estadoLoja(loja);
    if (!estado.aberta) throw new ErroValidacao(estado.aviso, 409);
    if (dados.tipo_entrega === 'entrega' && !loja.aceita_entrega) throw new ErroValidacao('No momento só fazemos retirada na doceria.', 409);
    if (dados.tipo_entrega === 'retirada' && !loja.aceita_retirada) throw new ErroValidacao('No momento só fazemos entrega.', 409);

    // Preços e adicionais SEMPRE do banco.
    const ids = [...new Set(dados.itens.map((i) => i.produto_id))];
    const { rows: linhasProdutos } = await db.query(
      'select id, nome, preco, array(select s from unnest(sabores) s where s <> all(sabores_esgotados)) as sabores, precos_sabor, promo_qtd, promo_preco from produtos where id = any($1::uuid[]) and disponivel = true', [ids],
    );
    const { rows: linhasAdicionais } = await db.query(
      'select id, produto_id, nome, preco from adicionais where produto_id = any($1::uuid[]) and disponivel = true', [ids],
    );
    const produtos = new Map(linhasProdutos.map((p) => [p.id, {
      ...p,
      adicionais: linhasAdicionais.filter((a) => a.produto_id === p.id),
    }]));

    const itens = montarItens(dados.itens, produtos);
    const { rows: taxas } = await db.query('select bairro, taxa from taxas_entrega');
    const taxa = dados.tipo_entrega === 'retirada' ? 0 : calcularTaxa(taxas, dados.endereco_bairro);

    cliente = await db.connect();
    let pedido;
    for (let tentativa = 0; tentativa < TENTATIVAS_CODIGO && !pedido; tentativa += 1) {
      try {
        await cliente.query('begin');
        const { rows } = await cliente.query(
          `insert into pedidos (codigo, status, cliente_nome, cliente_whatsapp, endereco_rua, endereco_bairro,
             endereco_cidade, endereco_complemento, forma_pagamento, observacoes, taxa_entrega, chave_idempotencia, tipo_entrega)
           values ($1,'recebido',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning ${COLUNAS}`,
          [gerarCodigo(), dados.cliente_nome, dados.cliente_whatsapp, dados.endereco_rua, dados.endereco_bairro,
            dados.endereco_cidade, dados.endereco_complemento, dados.forma_pagamento, dados.observacoes, taxa, chave,
            dados.tipo_entrega],
        );
        for (const i of itens) {
          await cliente.query(
            `insert into itens_pedido (pedido_id, produto_id, nome, sabor, adicionais, quantidade, preco_unitario, desconto)
             values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
            [rows[0].id, i.produto_id, i.nome, i.sabor, JSON.stringify(i.adicionais), i.quantidade, i.preco_unitario, i.desconto],
          );
        }
        await cliente.query('commit');
        pedido = rows[0];
      } catch (erro) {
        await cliente.query('rollback').catch(() => {});
        if (erro.code !== '23505') throw erro;
        // Duplicado: ou o código (tenta outro), ou a chave de idempotência (devolve o já criado).
        if (chave) pedido = await buscarPorChave(chave, cliente);
      }
    }
    if (!pedido) throw new Error('Não foi possível gerar o código do pedido.');

    const [completo] = await comItens([pedido], cliente);
    res.status(201).json(respostaCriacao(completo));
  } catch (erro) {
    next(erro);
  } finally {
    if (cliente) cliente.release();
  }
});

// ---------- Consultar ----------

// GET /pedidos?status=xxx  (painel)
router.get('/', exigirPainel, async (req, res, next) => {
  try {
    const { status } = req.query;
    if (status !== undefined && !STATUS.includes(status)) throw new ErroValidacao('Status inválido.');
    const { rows } = status
      ? await db.query(`select ${COLUNAS} from pedidos where status = $1 order by criado_em desc limit 300`, [status])
      : await db.query(`select ${COLUNAS} from pedidos order by criado_em desc limit 300`);
    res.json(await comItens(rows));
  } catch (erro) {
    next(erro);
  }
});

// PATCH /pedidos/:id/status  (painel)
router.patch('/:id/status', exigirPainel, async (req, res, next) => {
  try {
    const { id } = req.params;
    const status = req.body?.status;
    if (!UUID.test(id)) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (!STATUS.includes(status)) throw new ErroValidacao('Status inválido.');
    const { rows } = await db.query(`update pedidos set status = $1 where id = $2 returning ${COLUNAS}`, [status, id]);
    if (!rows.length) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const [pedido] = await comItens(rows);
    res.json(pedido);
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
