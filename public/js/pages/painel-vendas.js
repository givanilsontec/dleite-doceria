// Vendas: resumo do faturamento (cartões), o que foi vendido (rosca) e o faturamento dia a dia (linha).
// Gráficos em SVG feitos à mão: a CSP do site só permite scripts do próprio site, e são só dois gráficos.

import { lerVendasPainel, sairDoPainel } from '../api.js';
import { renderComLogin, abrirAlterarSenha } from './painel.js';
import { esc, dinheiro, icone, estadoHTML, carregandoHTML } from '../ui.js';

const SVG = 'http://www.w3.org/2000/svg';
const MAX_FATIAS = 5; // além disso, o resto vira "Outros"
const PERIODOS = [{ dias: 7, rotulo: '7 dias' }, { dias: 30, rotulo: '30 dias' }, { dias: 90, rotulo: '90 dias' }];

const dataCurta = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const diaSemana = (dia) => new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
const dataLonga = (dia) => `${diaSemana(dia)}, ${dataCurta(dia)}`;
const pct = (v) => `${Math.round(v * 100)}%`;

// Topo "redondo" do eixo: 0, 50, 100... para o gráfico não terminar em R$ 47,30.
function topoRedondo(max) {
  if (max <= 0) return 50;
  const bruto = max / 4;
  const ordem = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * ordem).find((p) => p >= bruto);
  return passo * 4;
}

function el(tag, attrs = {}, pai = null) {
  const n = document.createElementNS(SVG, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  if (pai) pai.appendChild(n);
  return n;
}

// ---------- Rosca: o que foi vendido (unidades) ----------
// As cores vêm de classes (serie-1..5, serie-outros): a CSP bloqueia style="" no HTML.

function dadosRosca(porProduto) {
  if (porProduto.length <= MAX_FATIAS) return porProduto.map((p, i) => ({ ...p, cor: `serie-${i + 1}` }));
  const porVolume = [...porProduto].sort((a, b) => b.quantidade - a.quantidade);
  const principais = new Set(porVolume.slice(0, MAX_FATIAS - 1).map((p) => p.nome));
  const fatias = porProduto.filter((p) => principais.has(p.nome)).map((p, i) => ({ ...p, cor: `serie-${i + 1}` }));
  const resto = porProduto.filter((p) => !principais.has(p.nome));
  fatias.push({
    nome: 'Outros',
    quantidade: resto.reduce((s, p) => s + p.quantidade, 0),
    faturamento: resto.reduce((s, p) => s + p.faturamento, 0),
    cor: 'serie-outros',
  });
  return fatias;
}

function desenharRosca(caixa, porProduto) {
  const fatias = dadosRosca(porProduto);
  const total = fatias.reduce((s, f) => s + f.quantidade, 0);
  const R = 84;
  const r = 54;
  const svg = el('svg', { viewBox: '0 0 200 200', class: 'rosca', role: 'img', 'aria-label': `O que foi vendido: ${fatias.map((f) => `${f.nome} ${f.quantidade}`).join(', ')}` });
  let angulo = -Math.PI / 2;
  const ponto = (raio, a) => [100 + raio * Math.cos(a), 100 + raio * Math.sin(a)];

  fatias.forEach((f) => {
    const fracao = f.quantidade / total;
    if (fracao <= 0) return;
    const fim = angulo + fracao * 2 * Math.PI;
    let d;
    if (fracao >= 0.9999) {
      // um só doce: anel inteiro
      d = `M ${100 + R} 100 A ${R} ${R} 0 1 1 ${100 - R} 100 A ${R} ${R} 0 1 1 ${100 + R} 100 Z M ${100 + r} 100 A ${r} ${r} 0 1 0 ${100 - r} 100 A ${r} ${r} 0 1 0 ${100 + r} 100 Z`;
    } else {
      const grande = fim - angulo > Math.PI ? 1 : 0;
      const [x1, y1] = ponto(R, angulo);
      const [x2, y2] = ponto(R, fim);
      const [x3, y3] = ponto(r, fim);
      const [x4, y4] = ponto(r, angulo);
      d = `M ${x1} ${y1} A ${R} ${R} 0 ${grande} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${grande} 0 ${x4} ${y4} Z`;
    }
    const fatia = el('path', { d, class: `fatia ${f.cor}`, 'fill-rule': 'evenodd', tabindex: '0' }, svg);
    fatia.dataset.nome = f.nome;
    angulo = fim;
  });

  const centro = el('text', { x: 100, y: 97, 'text-anchor': 'middle', class: 'rosca-total' }, svg);
  centro.textContent = String(total);
  const sub = el('text', { x: 100, y: 118, 'text-anchor': 'middle', class: 'rosca-sub' }, svg);
  sub.textContent = total === 1 ? 'doce' : 'doces';

  caixa.innerHTML = `
    <div class="rosca-area">
      <div class="rosca-svg"></div>
      <ul class="legenda">
        ${fatias.map((f) => `
          <li data-nome="${esc(f.nome)}">
            <span class="legenda-cor ${f.cor}" aria-hidden="true"></span>
            <span class="legenda-nome">${esc(f.nome)}</span>
            <span class="legenda-sub"><strong>${f.quantidade} un. · ${pct(f.quantidade / total)}</strong> · ${dinheiro(f.faturamento)}</span>
          </li>`).join('')}
      </ul>
    </div>`;
  caixa.querySelector('.rosca-svg').appendChild(svg);

  // Passar o dedo/mouse numa fatia destaca a linha da legenda (e vice-versa).
  const destacar = (nome) => {
    caixa.querySelectorAll('.fatia').forEach((p) => p.classList.toggle('apagada', Boolean(nome) && p.dataset.nome !== nome));
    caixa.querySelectorAll('.legenda li').forEach((li) => li.classList.toggle('ativa', li.dataset.nome === nome));
  };
  caixa.addEventListener('pointerover', (e) => destacar(e.target.closest('[data-nome]')?.dataset.nome || null));
  caixa.addEventListener('pointerleave', () => destacar(null));
  caixa.addEventListener('focusin', (e) => destacar(e.target.dataset.nome || null));
  caixa.addEventListener('focusout', () => destacar(null));
}

// ---------- Linha: faturamento dia a dia ----------

function desenharLinha(caixa, porDia, melhor) {
  caixa.innerHTML = '<div class="linha-tooltip" role="status" hidden></div>';
  const tooltip = caixa.querySelector('.linha-tooltip');
  const L = Math.max(caixa.clientWidth, 280);
  const A = 240;
  const m = { esq: 62, dir: 16, topo: 22, base: 30 };
  const largura = L - m.esq - m.dir;
  const altura = A - m.topo - m.base;
  const topo = topoRedondo(Math.max(...porDia.map((d) => d.faturamento)));
  const x = (i) => m.esq + (porDia.length === 1 ? largura / 2 : (i / (porDia.length - 1)) * largura);
  const y = (v) => m.topo + altura - (v / topo) * altura;

  const svg = el('svg', { viewBox: `0 0 ${L} ${A}`, width: L, height: A, class: 'grafico-linha', tabindex: '0', role: 'img', 'aria-label': 'Faturamento dia a dia. Use as setas para percorrer os dias.' });

  // grade e eixo Y (recessivos)
  for (let k = 0; k <= 4; k += 1) {
    const v = (topo / 4) * k;
    el('line', { x1: m.esq, x2: L - m.dir, y1: y(v), y2: y(v), class: k === 0 ? 'eixo' : 'grade' }, svg);
    const t = el('text', { x: m.esq - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'rotulo-eixo' }, svg);
    t.textContent = dinheiro(v).replace(',00', '');
  }
  // eixo X: quantas datas couberem com folga (>= 56 px entre elas); a de hoje sempre aparece
  const ESPACO = 56;
  const maxRotulos = Math.max(2, Math.floor(largura / ESPACO));
  const passo = Math.max(1, Math.ceil((porDia.length - 1) / (maxRotulos - 1)));
  const indices = [];
  for (let i = 0; i < porDia.length; i += passo) indices.push(i);
  const ultimo = porDia.length - 1;
  if (indices[indices.length - 1] !== ultimo) {
    if (x(ultimo) - x(indices[indices.length - 1]) < ESPACO) indices.pop();
    indices.push(ultimo);
  }
  indices.forEach((i) => {
    const t = el('text', { x: x(i), y: A - 8, 'text-anchor': i === ultimo && indices.length > 1 ? 'end' : 'middle', class: 'rotulo-eixo' }, svg);
    t.textContent = dataCurta(porDia[i].dia);
  });

  // linha
  el('path', { d: porDia.map((d, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(d.faturamento)}`).join(' '), class: 'linha' }, svg);

  // melhor dia: marcador + rótulo direto (o único número fixo no gráfico)
  if (melhor) {
    const i = porDia.findIndex((d) => d.dia === melhor.dia);
    el('circle', { cx: x(i), cy: y(melhor.faturamento), r: 5, class: 'ponto-destaque' }, svg);
    const naDireita = x(i) < L - 120;
    const t = el('text', { x: x(i) + (naDireita ? 10 : -10), y: Math.max(y(melhor.faturamento) - 10, 14), 'text-anchor': naDireita ? 'start' : 'end', class: 'rotulo-destaque' }, svg);
    t.textContent = `Melhor dia: ${dinheiro(melhor.faturamento)}`;
  }

  // mira (linha vertical + ponto) que segue o dedo/mouse
  const mira = el('line', { y1: m.topo, y2: m.topo + altura, class: 'mira', visibility: 'hidden' }, svg);
  const pontoMira = el('circle', { r: 5, class: 'ponto-mira', visibility: 'hidden' }, svg);
  el('rect', { x: m.esq, y: 0, width: largura, height: A, class: 'area-toque' }, svg);
  caixa.appendChild(svg);

  let atual = -1;
  function mostrar(i) {
    atual = Math.max(0, Math.min(porDia.length - 1, i));
    const d = porDia[atual];
    const px = x(atual);
    mira.setAttribute('x1', px); mira.setAttribute('x2', px); mira.setAttribute('visibility', 'visible');
    pontoMira.setAttribute('cx', px); pontoMira.setAttribute('cy', y(d.faturamento)); pontoMira.setAttribute('visibility', 'visible');
    tooltip.innerHTML = `<strong>${esc(dataLonga(d.dia))}</strong><span>${dinheiro(d.faturamento)}</span><span class="tooltip-sub">${d.pedidos} ${d.pedidos === 1 ? 'pedido' : 'pedidos'}</span>`;
    tooltip.hidden = false;
    const larguraTip = tooltip.offsetWidth;
    // ao lado da mira (nunca em cima do ponto): à direita, ou à esquerda se não couber
    const escala = svg.getBoundingClientRect().width / L || 1;
    const pxTela = px * escala;
    const direita = pxTela + 12 + larguraTip <= caixa.clientWidth;
    tooltip.style.left = `${direita ? pxTela + 12 : Math.max(pxTela - 12 - larguraTip, 0)}px`;
  }
  function esconder() {
    mira.setAttribute('visibility', 'hidden');
    pontoMira.setAttribute('visibility', 'hidden');
    tooltip.hidden = true;
  }
  const indicePeloX = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * L;
    return Math.round(((px - m.esq) / largura) * (porDia.length - 1));
  };
  svg.addEventListener('pointermove', (e) => mostrar(indicePeloX(e.clientX)));
  svg.addEventListener('pointerdown', (e) => mostrar(indicePeloX(e.clientX)));
  svg.addEventListener('pointerleave', esconder);
  svg.addEventListener('focus', () => mostrar(porDia.length - 1));
  svg.addEventListener('blur', esconder);
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); mostrar(atual - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); mostrar(atual + 1); }
  });
}

// ---------- Tela ----------

function renderVendas({ el: raiz, aoExpirar }) {
  let ativo = true;
  let dias = 30;
  let dados = null;

  raiz.innerHTML = `
    <header class="painel-topo">
      <div class="painel-topo-interno">
        <div>
          <h1 class="painel-titulo">Vendas</h1>
          <p class="painel-sub">Conta os pedidos confirmados em diante. Novos (ainda não confirmados) e cancelados ficam de fora.</p>
        </div>
        <div class="painel-topo-acoes">
          <a class="botao botao-secundario botao-pequeno" href="#/painel">Pedidos</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/cardapio">Cardápio</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/loja">Loja e horário</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/entrega">Entrega</a>
          <button type="button" class="botao botao-fantasma botao-pequeno" data-acao="senha">Senha</button>
          <button type="button" class="botao botao-fantasma botao-pequeno" data-acao="sair">Sair</button>
        </div>
      </div>
    </header>
    <div class="painel vendas">
      <div class="chips" role="group" aria-label="Período">
        ${PERIODOS.map((p) => `<button type="button" class="chip" data-acao="periodo" data-dias="${p.dias}" aria-pressed="${p.dias === dias}">Últimos ${p.rotulo}</button>`).join('')}
      </div>
      <div data-conteudo>${carregandoHTML('Carregando vendas')}</div>
    </div>`;

  const conteudo = raiz.querySelector('[data-conteudo]');

  function desenhar() {
    const { hoje, periodo, por_dia: porDia, por_produto: porProduto } = dados;
    if (periodo.pedidos === 0 && hoje.pedidos === 0) {
      conteudo.innerHTML = estadoHTML({
        titulo: 'Nenhuma venda no período',
        texto: 'Os números aparecem aqui assim que houver pedidos confirmados.',
        categoria: 'brownie',
      });
      return;
    }

    conteudo.innerHTML = `
      <div class="cartoes-vendas">
        <div class="cartao-venda destaque">
          <p class="cartao-venda-rotulo">Hoje</p>
          <p class="cartao-venda-valor">${dinheiro(hoje.faturamento)}</p>
          <p class="cartao-venda-sub">${hoje.pedidos} ${hoje.pedidos === 1 ? 'pedido' : 'pedidos'}</p>
        </div>
        <div class="cartao-venda">
          <p class="cartao-venda-rotulo">Últimos ${dias} dias</p>
          <p class="cartao-venda-valor">${dinheiro(periodo.faturamento)}</p>
          <p class="cartao-venda-sub">${periodo.pedidos} ${periodo.pedidos === 1 ? 'pedido' : 'pedidos'} · ticket médio ${dinheiro(periodo.ticket_medio)}</p>
        </div>
        <div class="cartao-venda">
          <p class="cartao-venda-rotulo">Média por dia</p>
          <p class="cartao-venda-valor">${dinheiro(periodo.media_por_dia)}</p>
          <p class="cartao-venda-sub">contando os dias sem venda</p>
        </div>
        <div class="cartao-venda">
          <p class="cartao-venda-rotulo">Melhor dia</p>
          <p class="cartao-venda-valor">${periodo.melhor_dia ? dinheiro(periodo.melhor_dia.faturamento) : '-'}</p>
          <p class="cartao-venda-sub">${periodo.melhor_dia ? esc(dataLonga(periodo.melhor_dia.dia)) : 'sem vendas'}${periodo.pior_dia && periodo.pior_dia.dia !== periodo.melhor_dia?.dia ? ` · mais fraco: ${esc(dataCurta(periodo.pior_dia.dia))} (${dinheiro(periodo.pior_dia.faturamento)})` : ''}</p>
        </div>
      </div>

      <div class="graficos-vendas">
        <section class="cartao grafico-cartao">
          <h2 class="cartao-titulo">Faturamento dia a dia</h2>
          <div class="linha-caixa" data-linha></div>
        </section>
        <section class="cartao grafico-cartao">
          <h2 class="cartao-titulo">O que foi vendido</h2>
          <div data-rosca></div>
        </section>
      </div>

      <details class="cartao tabela-vendas">
        <summary>Ver em tabela</summary>
        <h3 class="subtitulo-tabela">Por doce</h3>
        <table>
          <thead><tr><th>Doce</th><th>Unidades</th><th>Faturamento</th></tr></thead>
          <tbody>${porProduto.map((p) => `<tr><td>${esc(p.nome)}</td><td>${p.quantidade}</td><td>${dinheiro(p.faturamento)}</td></tr>`).join('')}</tbody>
        </table>
        <h3 class="subtitulo-tabela">Por dia</h3>
        <table>
          <thead><tr><th>Dia</th><th>Pedidos</th><th>Faturamento</th></tr></thead>
          <tbody>${[...porDia].reverse().map((d) => `<tr><td>${esc(dataLonga(d.dia))}</td><td>${d.pedidos}</td><td>${dinheiro(d.faturamento)}</td></tr>`).join('')}</tbody>
        </table>
      </details>`;

    if (porProduto.length) desenharRosca(conteudo.querySelector('[data-rosca]'), porProduto);
    else conteudo.querySelector('[data-rosca]').innerHTML = '<p class="campo-dica">Sem doces vendidos no período.</p>';
    desenharLinha(conteudo.querySelector('[data-linha]'), porDia, periodo.melhor_dia);
  }

  async function carregar() {
    conteudo.innerHTML = carregandoHTML('Carregando vendas');
    try {
      const r = await lerVendasPainel(dias);
      if (!ativo) return;
      dados = r;
      desenhar();
    } catch (erro) {
      if (!ativo) return;
      if (erro.status === 401) { sairDoPainel(); aoExpirar(); return; }
      conteudo.innerHTML = estadoHTML({
        titulo: 'Não deu para carregar as vendas',
        texto: esc(erro.message),
        acao: '<button type="button" class="botao botao-primario" data-acao="recarregar">Tentar de novo</button>',
      });
    }
  }

  raiz.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-acao]');
    if (!alvo || !raiz.contains(alvo)) return;
    const { acao } = alvo.dataset;
    if (acao === 'senha') abrirAlterarSenha(aoExpirar);
    if (acao === 'sair') { sairDoPainel(); aoExpirar(); }
    if (acao === 'recarregar') carregar();
    if (acao === 'periodo') {
      dias = Number(alvo.dataset.dias);
      raiz.querySelectorAll('[data-acao="periodo"]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.dias) === dias)));
      carregar();
    }
  });

  // O gráfico de linha usa a largura real da caixa: redesenha quando a tela muda de tamanho/girar o celular.
  let larguraAnterior = 0;
  const observador = new ResizeObserver(() => {
    const caixa = conteudo.querySelector('[data-linha]');
    if (!dados || !caixa || Math.abs(caixa.clientWidth - larguraAnterior) < 8) return;
    larguraAnterior = caixa.clientWidth;
    desenharLinha(caixa, dados.por_dia, dados.periodo.melhor_dia);
  });
  observador.observe(conteudo);

  carregar();
  return () => {
    ativo = false;
    observador.disconnect();
  };
}

export function render({ el }) {
  return renderComLogin(el, renderVendas);
}
