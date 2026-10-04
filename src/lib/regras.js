// Regras de negócio puras (sem banco), para ficarem fáceis de testar.

const STATUS = ['recebido', 'confirmado', 'producao', 'pronto', 'despachado', 'entregue', 'cancelado'];
const TIPOS_ENTREGA = ['entrega', 'retirada'];
const PAGAMENTOS = ['pix', 'cartao_entrega', 'dinheiro'];
const LIMITE_POR_ITEM = 20;
const MAX_LINHAS = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ErroValidacao extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

// "Jardim São Paulo" e "jardim sao paulo" são o mesmo bairro.
function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

const emCentavos = (v) => Math.round(Number(v) * 100);

// Preço de um doce para o sabor escolhido: alguns sabores custam diferente do preço base.
// precos_sabor = { "Ninho": 10 }. Sabor fora da lista usa o preço base do produto.
function precoDoSabor(produto, sabor) {
  const especial = Number((produto.precos_sabor || {})[sabor]);
  return especial > 0 ? especial : Number(produto.preco);
}
const deCentavos = (c) => c / 100;

// Tabela vazia = 0; bairro achado = valor; bairro fora da tabela (ou sem bairro) = null ("a combinar").
function calcularTaxa(taxas, bairro) {
  if (!taxas.length) return 0;
  const achada = taxas.find((t) => normalizarTexto(t.bairro) === normalizarTexto(bairro));
  return achada ? Number(achada.taxa) : null;
}

function textoOpcional(valor, max, campo) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw new ErroValidacao(`Campo inválido: ${campo}.`);
  const limpo = valor.trim();
  if (limpo.length > max) throw new ErroValidacao(`O campo ${campo} é longo demais.`);
  return limpo || null;
}

// Confere o corpo do POST /pedidos e devolve só os campos aceitos, já limpos.
function validarPedido(corpo) {
  if (!corpo || typeof corpo !== 'object') throw new ErroValidacao('Pedido inválido.');

  const nome = typeof corpo.cliente_nome === 'string' ? corpo.cliente_nome.trim() : '';
  if (nome.length < 2 || nome.length > 120) throw new ErroValidacao('Informe o nome de quem vai receber.');

  const whatsapp = String(corpo.cliente_whatsapp ?? '').replace(/\D/g, '');
  if (whatsapp.length < 10 || whatsapp.length > 11) throw new ErroValidacao('Informe o WhatsApp com DDD.');

  const tipo = corpo.tipo_entrega ?? 'entrega';
  if (!TIPOS_ENTREGA.includes(tipo)) throw new ErroValidacao('Escolha entrega ou retirada.');
  const retirada = tipo === 'retirada';

  const rua = typeof corpo.endereco_rua === 'string' ? corpo.endereco_rua.trim() : '';
  if (!retirada && (rua.length < 3 || rua.length > 160)) throw new ErroValidacao('Informe a rua e o número.');
  const bairro = textoOpcional(corpo.endereco_bairro, 80, 'bairro');
  if (!retirada && (!bairro || bairro.length < 2)) throw new ErroValidacao('Informe o bairro da entrega.');

  if (!PAGAMENTOS.includes(corpo.forma_pagamento)) throw new ErroValidacao('Escolha uma forma de pagamento válida.');

  if (!Array.isArray(corpo.itens) || corpo.itens.length === 0) throw new ErroValidacao('O pedido não tem itens.');
  if (corpo.itens.length > MAX_LINHAS) throw new ErroValidacao('O pedido tem itens demais.');

  const itens = corpo.itens.map((i) => {
    if (!i || typeof i !== 'object' || !UUID.test(String(i.produto_id))) throw new ErroValidacao('Item inválido no pedido.');
    const quantidade = Number(i.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1) throw new ErroValidacao('A quantidade precisa ser 1 ou mais.');
    if (quantidade > LIMITE_POR_ITEM) throw new ErroValidacao(`O máximo é ${LIMITE_POR_ITEM} unidades por item.`);
    const adicionais = Array.isArray(i.adicionais) ? i.adicionais.map(String) : [];
    if (adicionais.some((id) => !UUID.test(id))) throw new ErroValidacao('Adicional inválido no pedido.');
    if (new Set(adicionais).size !== adicionais.length) throw new ErroValidacao('Adicional repetido no mesmo item.');
    return {
      produto_id: String(i.produto_id).toLowerCase(),
      quantidade,
      sabor: typeof i.sabor === 'string' && i.sabor.trim() ? i.sabor.trim() : null,
      adicionais: adicionais.map((id) => id.toLowerCase()),
    };
  });

  return {
    cliente_nome: nome,
    cliente_whatsapp: whatsapp,
    tipo_entrega: tipo,
    // Retirada não guarda endereço: menos dado pessoal armazenado.
    endereco_rua: retirada ? null : rua,
    endereco_bairro: retirada ? null : bairro,
    endereco_cidade: retirada ? null : textoOpcional(corpo.endereco_cidade, 80, 'cidade'),
    endereco_complemento: retirada ? null : textoOpcional(corpo.endereco_complemento, 160, 'complemento'),
    forma_pagamento: corpo.forma_pagamento,
    observacoes: textoOpcional(corpo.observacoes, 600, 'observações'),
    itens,
  };
}

// Preço de cada linha vem do banco, nunca do navegador.
// produtos: Map id -> { nome, preco, sabores, adicionais: [{ id, nome, preco }] }
function montarItens(itensPedidos, produtos) {
  return itensPedidos.map((item) => {
    const produto = produtos.get(item.produto_id);
    if (!produto) throw new ErroValidacao('Um dos doces do pedido não está mais disponível. Volte ao carrinho e confira.', 409);
    if (!(Number(produto.preco) > 0)) throw new ErroValidacao(`${produto.nome} ainda está sem preço.`, 409);

    const sabores = produto.sabores || [];
    if (sabores.length > 0 && !sabores.includes(item.sabor)) {
      throw new ErroValidacao(`Escolha um sabor válido para ${produto.nome}.`, 409);
    }

    const escolhidos = item.adicionais.map((id) => produto.adicionais.find((a) => a.id === id));
    if (escolhidos.some((a) => !a)) {
      throw new ErroValidacao(`Um adicional de ${produto.nome} não está mais disponível.`, 409);
    }

    const precoBase = precoDoSabor(produto, item.sabor);
    const unitarioCentavos = emCentavos(precoBase) + escolhidos.reduce((s, a) => s + emCentavos(a.preco), 0);
    return {
      produto_id: item.produto_id,
      nome: produto.nome,
      sabor: sabores.length > 0 ? item.sabor : null,
      adicionais: escolhidos.map((a) => ({ nome: a.nome, preco: Number(a.preco) })),
      quantidade: item.quantidade,
      preco_unitario: deCentavos(unitarioCentavos),
      desconto: calcularDesconto(precoBase, item.quantidade, produto.promo_qtd, produto.promo_preco),
    };
  });
}

// Promoção por quantidade: a cada `promoQtd` unidades, o grupo custa `promoPreco` (ex.: 2 pudins por 12).
// O desconto só vale sobre o preço base do doce; adicionais continuam cobrados por unidade.
function calcularDesconto(precoBase, quantidade, promoQtd, promoPreco) {
  if (!(Number(promoQtd) >= 2) || !(Number(promoPreco) > 0)) return 0;
  const grupos = Math.floor(quantidade / Number(promoQtd));
  const cheio = emCentavos(precoBase) * Number(promoQtd);
  return deCentavos(Math.max(0, grupos * (cheio - emCentavos(promoPreco))));
}

function totalPedido(itens, taxaEntrega) {
  const doces = itens.reduce(
    (s, i) => s + emCentavos(i.preco_unitario) * Number(i.quantidade) - emCentavos(i.desconto || 0), 0,
  );
  return deCentavos(doces + (taxaEntrega === null || taxaEntrega === undefined ? 0 : emCentavos(taxaEntrega)));
}

// ---------- Cardápio (painel) ----------

function numeroOpcional(valor, campo, max = 1000) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > max) throw new ErroValidacao(`Valor inválido em ${campo}.`);
  return Math.round(n * 100) / 100;
}

function textoObrigatorio(valor, max, campo) {
  const t = typeof valor === 'string' ? valor.trim() : '';
  if (!t) throw new ErroValidacao(`Preencha ${campo}.`);
  if (t.length > max) throw new ErroValidacao(`${campo[0].toUpperCase()}${campo.slice(1)} é longo demais (máximo ${max} letras).`);
  return t;
}

// Confere o produto enviado pelo painel. Sabores chegam como [{ nome, preco, esgotado }]
// e são gravados em três colunas: sabores, precos_sabor e sabores_esgotados.
function validarProduto(corpo) {
  if (!corpo || typeof corpo !== 'object') throw new ErroValidacao('Produto inválido.');

  const nome = textoObrigatorio(corpo.nome, 80, 'o nome');
  const categoria = textoObrigatorio(corpo.categoria ?? 'Outros', 40, 'a categoria');
  const descricao = textoOpcional(corpo.descricao, 200, 'descrição');
  const preco = numeroOpcional(corpo.preco ?? 0, 'preço') ?? 0;
  if (typeof corpo.disponivel !== 'boolean') throw new ErroValidacao('Informe se o produto está disponível.');

  const lista = Array.isArray(corpo.sabores) ? corpo.sabores : [];
  if (lista.length > 30) throw new ErroValidacao('Sabores demais (máximo 30).');
  const vistos = new Set();
  const sabores = [];
  const precos_sabor = {};
  const sabores_esgotados = [];
  for (const s of lista) {
    const nomeSabor = textoObrigatorio(s?.nome, 60, 'o nome do sabor');
    const chave = normalizarTexto(nomeSabor);
    if (vistos.has(chave)) throw new ErroValidacao(`O sabor "${nomeSabor}" está repetido.`);
    vistos.add(chave);
    sabores.push(nomeSabor);
    const precoSabor = numeroOpcional(s.preco, `preço do sabor ${nomeSabor}`);
    if (precoSabor > 0) precos_sabor[nomeSabor] = precoSabor;
    if (s.esgotado === true) sabores_esgotados.push(nomeSabor);
  }

  const promoQtd = corpo.promo_qtd === '' || corpo.promo_qtd == null ? null : Number(corpo.promo_qtd);
  const promoPreco = numeroOpcional(corpo.promo_preco, 'preço da promoção');
  if ((promoQtd === null) !== (promoPreco === null || promoPreco === 0)) {
    throw new ErroValidacao('Para a promoção, preencha a quantidade e o preço.');
  }
  if (promoQtd !== null && (!Number.isInteger(promoQtd) || promoQtd < 2 || promoQtd > 50)) {
    throw new ErroValidacao('A promoção precisa de 2 unidades ou mais.');
  }

  return {
    nome, categoria, descricao, preco, disponivel: corpo.disponivel, sabores, precos_sabor, sabores_esgotados,
    promo_qtd: promoQtd, promo_preco: promoQtd === null ? null : promoPreco,
  };
}

module.exports = {
  STATUS, TIPOS_ENTREGA, PAGAMENTOS, UUID, ErroValidacao,
  validarProduto,
  normalizarTexto, calcularTaxa, calcularDesconto, precoDoSabor, validarPedido, montarItens, totalPedido,
};
