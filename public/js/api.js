// =========================================================
// Camada de serviço: TODA conversa com o back-end passa por aqui.
// As telas nunca chamam fetch direto, só estas funções.
// =========================================================

import { CONFIG } from './config.js';

// ---------- Sessão do painel da cozinha ----------
// Sem "manter conectado": o token fica só na aba aberta (sessionStorage) e some ao fechá-la.
// Com "manter conectado": fica guardado no aparelho (localStorage) até expirar (7 dias) ou a senha ser trocada.
const CHAVE_TOKEN = 'atelier:painel-token';
const CHAVE_ACESSO = 'atelier:painel-acesso';

function lerToken() {
  try {
    return sessionStorage.getItem(CHAVE_TOKEN) || localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

const tokenLembrado = () => {
  try {
    return Boolean(localStorage.getItem(CHAVE_TOKEN));
  } catch {
    return false;
  }
};

function guardarToken(token, lembrar) {
  try {
    if (lembrar) {
      localStorage.setItem(CHAVE_TOKEN, token);
      sessionStorage.removeItem(CHAVE_TOKEN);
    } else {
      sessionStorage.setItem(CHAVE_TOKEN, token);
      localStorage.removeItem(CHAVE_TOKEN);
    }
  } catch {
    // sem armazenamento: o painel pedirá a senha de novo
  }
}

export function temSessaoPainel() {
  return Boolean(lerToken());
}

export function sairDoPainel() {
  try {
    sessionStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    // sem armazenamento: nada a limpar
  }
}

function cabecalhoPainel() {
  const token = lerToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------- Chamada HTTP ----------

async function request(caminho, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(`${CONFIG.API_URL}${caminho}`, {
      ...opcoes,
      headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
    });
  } catch {
    throw new Error('Não foi possível falar com o servidor. Confira sua conexão e tente de novo.');
  }

  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const erro = new Error(corpo?.erro || `O servidor respondeu com erro ${resposta.status}.`);
    erro.status = resposta.status;
    throw erro;
  }
  return corpo;
}

// ---------- Normalização ----------
// O Postgres devolve números decimais como texto ("5.00"), por isso o Number().

// Preço 0 ou vazio vira null, que no site aparece como "Preço em breve".
// sabores e adicionais são opcionais: produto sem eles continua funcionando.
function normalizarProduto(p) {
  const preco = p.preco === null || p.preco === undefined ? null : Number(p.preco);
  return {
    ...p,
    preco: preco > 0 ? preco : null,
    precos_sabor: Object.fromEntries(Object.entries(p.precos_sabor || {}).map(([s, v]) => [s, Number(v)]).filter(([, v]) => v > 0)),
    promo_qtd: Number(p.promo_qtd) >= 2 ? Number(p.promo_qtd) : null,
    promo_preco: Number(p.promo_preco) > 0 ? Number(p.promo_preco) : null,
    sabores: Array.isArray(p.sabores) ? p.sabores : [],
    galeria: (Array.isArray(p.galeria) ? p.galeria : []).filter((g) => g && typeof g.url === 'string' && g.url),
    adicionais: (Array.isArray(p.adicionais) ? p.adicionais : []).map((a) => ({ ...a, preco: Number(a.preco) || 0 })),
  };
}


// taxa_entrega: null = "a combinar"; número = valor (0 = sem taxa).
function normalizarPedido(p) {
  return {
    ...p,
    total: Number(p.total) || 0,
    taxa_entrega: p.taxa_entrega === null ? null : Number(p.taxa_entrega) || 0,
    itens: (p.itens || []).map((i) => ({
      ...i,
      sabor: i.sabor || null,
      adicionais: (i.adicionais || []).map((a) => ({ ...a, preco: Number(a.preco) || 0 })),
      quantidade: Number(i.quantidade) || 0,
      preco_unitario: Number(i.preco_unitario) || 0,
      desconto: Number(i.desconto) || 0,
    })),
  };
}

// =========================================================
// Site do cliente
// =========================================================

// GET /produtos
export async function listarProdutos() {
  const lista = await request('/produtos');
  return lista.map(normalizarProduto).filter((p) => p.disponivel !== false);
}

// GET /taxas-entrega
// -> { cidade_principal, bairros: [{ bairro, taxa }], cidades: [{ cidade, taxa }] }
export async function listarTaxasEntrega() {
  const r = await request('/taxas-entrega');
  const taxa = (v) => Number(v) || 0;
  return {
    cidade_principal: r.cidade_principal || 'Carpina',
    bairros: (r.bairros || []).map((b) => ({ bairro: b.bairro, taxa: taxa(b.taxa) })),
    cidades: (r.cidades || []).map((c) => ({ cidade: c.cidade, taxa: taxa(c.taxa) })),
  };
}

// GET /loja  -> { aberta, motivo, aviso, aceita_entrega, aceita_retirada, endereco_retirada }
export function buscarLoja() {
  return request('/loja');
}

// POST /pedidos
// O front envia só produto, sabor, adicionais (ids) e quantidade.
// Preços, taxa e total oficiais quem calcula é o back-end.
// chaveEnvio evita pedido duplicado se o cliente reenviar depois de uma falha de rede.
export async function criarPedido(dados, chaveEnvio) {
  const headers = chaveEnvio ? { 'Idempotency-Key': chaveEnvio } : {};
  return guardarPedidoNaAba(normalizarPedido(await request('/pedidos', { method: 'POST', headers, body: JSON.stringify(dados) })));
}

// O pedido recém-feito fica guardado só nesta aba (sessionStorage), para a tela de confirmação.
// Por segurança o servidor não tem consulta pública de pedido: ninguém lê dados de outro cliente pelo código.
const chavePedido = (codigo) => `atelier:pedido:${String(codigo).toUpperCase()}`;

function guardarPedidoNaAba(pedido) {
  try {
    sessionStorage.setItem(chavePedido(pedido.codigo), JSON.stringify(pedido));
  } catch {
    // sem armazenamento: a confirmação mostra só o código
  }
  return pedido;
}

export async function buscarPedido(codigo) {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(chavePedido(codigo)) || 'null');
    if (salvo) return normalizarPedido(salvo);
  } catch {
    // segue para o erro abaixo
  }
  const erro = new Error('Não encontramos um pedido com esse código.');
  erro.status = 404;
  throw erro;
}

// =========================================================
// Painel da cozinha (exige login)
// =========================================================

// POST /painel/login. lembrar = "manter conectado neste aparelho".
export async function entrarNoPainel(senha, lembrar = false) {
  const { token, ultimo_acesso: ultimoAcesso } = await request('/painel/login', {
    method: 'POST',
    body: JSON.stringify({ senha, lembrar }),
  });
  guardarToken(token, lembrar);
  try {
    sessionStorage.setItem(CHAVE_ACESSO, JSON.stringify(ultimoAcesso || null));
  } catch {
    // sem armazenamento: o aviso de acesso anterior não aparece
  }
}

// Acesso anterior ao login desta sessão ({ quando, ip }), para o painel mostrar. null se for o primeiro.
export function ultimoAcessoPainel() {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_ACESSO) || 'null');
  } catch {
    return null;
  }
}

// POST /painel/senha: troca a senha. As outras sessões caem; esta recebe um token novo
// (guardado do mesmo jeito que o anterior: só na aba ou no aparelho).
export async function alterarSenhaPainel(atual, nova) {
  const lembrar = tokenLembrado();
  const { token } = await request('/painel/senha', {
    method: 'POST',
    headers: cabecalhoPainel(),
    body: JSON.stringify({ atual, nova, lembrar }),
  });
  guardarToken(token, lembrar);
}

// GET /pedidos?status=xxx  (status é opcional)
export async function listarPedidos(status) {
  const busca = status ? `?status=${encodeURIComponent(status)}` : '';
  const lista = await request(`/pedidos${busca}`, { headers: cabecalhoPainel() });
  return lista.map(normalizarPedido);
}

// PATCH /pedidos/:id/status
export async function atualizarStatus(id, status) {
  return normalizarPedido(await request(`/pedidos/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: cabecalhoPainel(),
    body: JSON.stringify({ status }),
  }));
}

// GET /painel/produtos  (inclui os indisponíveis)
export function listarProdutosPainel() {
  return request('/painel/produtos', { headers: cabecalhoPainel() });
}

// POST /painel/produtos (sem id) ou PATCH /painel/produtos/:id
export function salvarProdutoPainel(id, dados) {
  return request(id ? `/painel/produtos/${encodeURIComponent(id)}` : '/painel/produtos', {
    method: id ? 'PATCH' : 'POST',
    headers: cabecalhoPainel(),
    body: JSON.stringify(dados),
  });
}

// GET /painel/loja  -> { config, estado }
export function lerLojaPainel() {
  return request('/painel/loja', { headers: cabecalhoPainel() });
}

// PATCH /painel/loja  (só os campos enviados)
export function salvarLojaPainel(campos) {
  return request('/painel/loja', { method: 'PATCH', headers: cabecalhoPainel(), body: JSON.stringify(campos) });
}

// GET /painel/vendas?dias=7|30|90  -> resumo de vendas
export function lerVendasPainel(dias = 30) {
  return request(`/painel/vendas?dias=${encodeURIComponent(dias)}`, { headers: cabecalhoPainel() });
}

// PUT /painel/produtos/:id/foto  (o corpo é o próprio arquivo da foto)
export function enviarFotoPainel(id, arquivo) {
  return request(`/painel/produtos/${encodeURIComponent(id)}/foto`, {
    method: 'PUT',
    headers: { ...cabecalhoPainel(), 'Content-Type': arquivo.type },
    body: arquivo,
  });
}

// DELETE /painel/produtos/:id/foto
export function removerFotoPainel(id) {
  return request(`/painel/produtos/${encodeURIComponent(id)}/foto`, { method: 'DELETE', headers: cabecalhoPainel() });
}

// ---------- Taxas de entrega no painel ----------

// GET /painel/entrega  -> { cidade_principal, bairros: [{ id, bairro, taxa }], cidades: [{ id, cidade, taxa }] }
export function lerEntregaPainel() {
  return request('/painel/entrega', { headers: cabecalhoPainel() });
}

// POST (sem id) ou PATCH /painel/entrega/:id  com { tipo: 'bairro'|'cidade', bairro|cidade, taxa }
export function salvarTaxaEntregaPainel(id, dados) {
  return request(id ? `/painel/entrega/${encodeURIComponent(id)}` : '/painel/entrega', {
    method: id ? 'PATCH' : 'POST',
    headers: cabecalhoPainel(),
    body: JSON.stringify(dados),
  });
}

// DELETE /painel/entrega/:id
export function removerTaxaEntregaPainel(id) {
  return request(`/painel/entrega/${encodeURIComponent(id)}`, { method: 'DELETE', headers: cabecalhoPainel() });
}
