// Ponto de entrada do site.
// As telas trocam pelo trecho depois do # na URL (ex.: /#/carrinho).
// Assim o Express só precisa servir este index.html, e as rotas da API
// (/produtos, /pedidos...) nunca se confundem com as telas.

import { CONFIG } from './config.js';
import { carrinho } from './cart.js';
import { icone, dinheiro } from './ui.js';
import * as cardapio from './pages/cardapio.js';
import * as paginaCarrinho from './pages/carrinho.js';
import * as checkout from './pages/checkout.js';
import * as pedido from './pages/pedido.js';
import * as painel from './pages/painel.js';
import * as painelCardapio from './pages/painel-cardapio.js';
import * as painelLoja from './pages/painel-loja.js';

const ROTAS = [
  { padrao: /^\/$/, pagina: cardapio, aba: 'cardapio', titulo: 'Cardápio' },
  { padrao: /^\/carrinho$/, pagina: paginaCarrinho, aba: 'carrinho', titulo: 'Seu pedido' },
  { padrao: /^\/checkout$/, pagina: checkout, aba: 'carrinho', titulo: 'Entrega e pagamento' },
  { padrao: /^\/pedido\/([^/]+)$/, pagina: pedido, aba: null, titulo: 'Seu pedido' },
  // Área interna: não aparece no menu do cliente. O login (senha) é feito dentro da própria tela.
  { padrao: /^\/painel\/loja$/, pagina: painelLoja, aba: null, titulo: 'Loja e horário', interno: true },
  { padrao: /^\/painel\/cardapio$/, pagina: painelCardapio, aba: null, titulo: 'Cardápio do painel', interno: true },
  { padrao: /^\/painel$/, pagina: painel, aba: null, titulo: 'Painel da cozinha', interno: true },
];

const raiz = document.getElementById('app');
const barraCarrinho = document.getElementById('barra-carrinho');
let limparTelaAtual = null;
let rotaAtual = null;

function navegar(caminho) {
  if (location.hash === `#${caminho}`) rotear();
  else location.hash = caminho;
}

function lerHash() {
  const bruto = location.hash.replace(/^#/, '') || '/';
  const [caminho, busca = ''] = bruto.split('?');
  return { caminho: caminho || '/', query: new URLSearchParams(busca) };
}

function marcarAba(aba) {
  document.querySelectorAll('[data-aba]').forEach((link) => {
    if (link.dataset.aba === aba) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function atualizarCarrinhoNaTela() {
  const quantidade = carrinho.totalItens();
  const textoQtd = `${quantidade} ${quantidade === 1 ? 'item' : 'itens'}`;

  const badge = document.querySelector('[data-badge]');
  badge.hidden = quantidade === 0;
  badge.textContent = quantidade > 99 ? '99+' : String(quantidade);
  document.querySelector('[data-aba="carrinho"]')
    .setAttribute('aria-label', quantidade ? `Carrinho, ${textoQtd}` : 'Carrinho');

  const noCarrinho = rotaAtual?.pagina === paginaCarrinho;
  const mostrarBarra = (rotaAtual?.aba === 'cardapio' || noCarrinho) && quantidade > 0;
  barraCarrinho.hidden = !mostrarBarra;
  document.body.classList.toggle('com-barra', mostrarBarra);
  if (mostrarBarra) {
    barraCarrinho.href = noCarrinho ? '#/checkout' : '#/carrinho';
    barraCarrinho.querySelector('.barra-acao').textContent = noCarrinho ? 'Continuar' : 'Ver pedido';
    barraCarrinho.querySelector('[data-barra-qtd]').textContent = textoQtd;
    barraCarrinho.querySelector('[data-barra-total]').textContent = dinheiro(carrinho.totalValor());
  }
}

function rotear() {
  const { caminho, query } = lerHash();
  const rota = ROTAS.find((r) => r.padrao.test(caminho));

  if (!rota) {
    navegar('/');
    return;
  }

  // Cada tela pode devolver uma função de limpeza (parar timers, cancelar assinaturas).
  if (typeof limparTelaAtual === 'function') limparTelaAtual();
  limparTelaAtual = null;

  // Um elemento novo por tela: os eventos da tela anterior somem junto com ele.
  const el = document.createElement('div');
  raiz.replaceChildren(el);

  rotaAtual = rota;
  document.body.classList.toggle('modo-interno', Boolean(rota.interno));
  document.title = `${rota.titulo} | ${CONFIG.NOME_LOJA}`;
  marcarAba(rota.aba);
  atualizarCarrinhoNaTela();

  let params;
  try {
    params = caminho.match(rota.padrao).slice(1).map((p) => decodeURIComponent(p));
  } catch {
    navegar('/'); // endereço com % inválido
    return;
  }
  limparTelaAtual = rota.pagina.render({ el, params, query, navegar });

  window.scrollTo(0, 0);
  raiz.focus({ preventScroll: true });
}

// Topo do site: nome, frase e logo vêm do config.js.
function montarMarca() {
  document.querySelector('[data-marca-nome]').textContent = CONFIG.NOME_LOJA;
  const sub = document.querySelector('[data-marca-sub]');
  sub.textContent = CONFIG.SLOGAN;
  sub.hidden = !CONFIG.SLOGAN;

  if (!CONFIG.LOGO) return;
  const selo = document.querySelector('[data-marca-selo]');
  const img = document.createElement('img');
  img.className = 'marca-logo';
  img.src = CONFIG.LOGO;
  img.alt = CONFIG.LOGO_MOSTRA_NOME ? '' : CONFIG.NOME_LOJA;
  // Logo que não carregar: volta ao ícone padrão.
  img.addEventListener('error', () => img.replaceWith(selo));
  selo.replaceWith(img);
  if (!CONFIG.LOGO_MOSTRA_NOME) {
    document.querySelector('[data-marca-nome]').parentElement.hidden = true;
  }
}
montarMarca();

document.querySelectorAll('[data-icone]').forEach((alvo) => {
  alvo.innerHTML = icone(alvo.dataset.icone);
});

carrinho.assinar(atualizarCarrinhoNaTela);
window.addEventListener('hashchange', rotear);
rotear();
