import { CONFIG } from '../config.js';
import {
  listarPedidos, atualizarStatus, entrarNoPainel, temSessaoPainel, sairDoPainel, alterarSenhaPainel, ultimoAcessoPainel,
  lerLojaPainel, salvarLojaPainel,
} from '../api.js';
import { linkAvisoCliente, statusAvisaCliente } from '../whatsapp.js';
import { lerLocal, gravarLocal } from '../storage.js';
import {
  esc, dinheiro, icone, hora, horario, haQuanto, formatarTelefone,
  STATUS, STATUS_FINAIS, statusInfo, indiceStatus, proximoStatus, acaoStatus, rotuloPagamento, precoLinha, subtotalPedido,
  metaItemHTML, enderecoCompleto, textoEntrega, estadoHTML, carregandoHTML, toast,
} from '../ui.js';

const INTERVALO_ATUALIZACAO = 15000;

// Fila: primeiro os status mais "atrás" no fluxo; dentro de cada status, o pedido mais antigo primeiro.
// Entregues e cancelados ficam no fim, do mais recente para o mais antigo.
function ordenar(pedidos) {
  return [...pedidos].sort((a, b) => {
    const porStatus = indiceStatus(a.status) - indiceStatus(b.status);
    if (porStatus !== 0) return porStatus;
    const diferenca = new Date(a.criado_em) - new Date(b.criado_em);
    return STATUS_FINAIS.includes(a.status) ? -diferenca : diferenca;
  });
}

// Janela "Alterar senha" (usada no painel de pedidos e no do cardápio).
export function abrirAlterarSenha(aoExpirar) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="senha-titulo" tabindex="-1">
      <div class="modal-cabeca">
        <div class="modal-titulo-bloco"><h2 id="senha-titulo">Alterar senha</h2></div>
        <button type="button" class="botao-fechar" data-acao="fechar" aria-label="Fechar">${icone('fechar')}</button>
      </div>
      <form class="modal-corpo" data-form novalidate>
        <p class="campo-dica">Ao trocar, quem estiver logado com a senha antiga é desconectado. Use pelo menos 10 caracteres.</p>
        <div class="campo">
          <label class="campo-rotulo" for="s-atual">Senha atual</label>
          <input class="entrada" id="s-atual" name="atual" type="password" autocomplete="current-password" maxlength="100">
        </div>
        <div class="campo">
          <label class="campo-rotulo" for="s-nova">Nova senha</label>
          <input class="entrada" id="s-nova" name="nova" type="password" autocomplete="new-password" maxlength="100">
        </div>
        <div class="campo">
          <label class="campo-rotulo" for="s-conf">Repita a nova senha</label>
          <input class="entrada" id="s-conf" name="conf" type="password" autocomplete="new-password" maxlength="100">
        </div>
      </form>
      <div class="modal-rodape">
        <p class="campo-erro" data-erro role="alert" hidden></p>
        <button type="button" class="botao botao-primario botao-bloco" data-acao="salvar">Salvar nova senha</button>
      </div>
    </div>`;
  document.body.appendChild(fundo);
  document.body.classList.add('modal-aberto');

  const form = fundo.querySelector('[data-form]');
  const erro = fundo.querySelector('[data-erro]');
  const botao = fundo.querySelector('[data-acao="salvar"]');
  const mostrarErro = (msg) => { erro.textContent = msg; erro.hidden = !msg; };

  function fechar() {
    document.removeEventListener('keydown', aoTeclar);
    fundo.remove();
    document.body.classList.remove('modal-aberto');
  }
  function aoTeclar(evento) {
    if (evento.key === 'Escape') fechar();
  }

  async function salvar() {
    mostrarErro('');
    const { atual, nova, conf } = form.elements;
    if (!atual.value || !nova.value) { mostrarErro('Preencha a senha atual e a nova.'); return; }
    if (nova.value.length < 10) { mostrarErro('A nova senha precisa ter pelo menos 10 caracteres.'); return; }
    if (nova.value !== conf.value) { mostrarErro('A repetição não confere com a nova senha.'); return; }
    botao.disabled = true;
    botao.textContent = 'Salvando…';
    try {
      await alterarSenhaPainel(atual.value, nova.value);
      fechar();
      toast('Senha alterada');
    } catch (e) {
      if (e.status === 401) { fechar(); sairDoPainel(); aoExpirar(); return; }
      mostrarErro(e.message || 'Não foi possível trocar a senha.');
      botao.disabled = false;
      botao.textContent = 'Salvar nova senha';
    }
  }

  fundo.addEventListener('click', (evento) => {
    if (evento.target === fundo) { fechar(); return; }
    const alvo = evento.target.closest('[data-acao]');
    if (alvo?.dataset.acao === 'fechar') fechar();
    if (alvo?.dataset.acao === 'salvar') salvar();
  });
  form.addEventListener('submit', (evento) => { evento.preventDefault(); salvar(); });
  document.addEventListener('keydown', aoTeclar);
  form.elements.atual.focus();
}

function telaLogin(el, aoEntrar) {
  el.innerHTML = `
    <div class="pagina pagina-estreita login-painel">
      <div class="login-marca">
        ${CONFIG.LOGO ? `<img class="login-logo" src="${esc(CONFIG.LOGO)}" alt="Logo ${esc(CONFIG.NOME_LOJA)}" width="112" height="112">` : ''}
        <p class="login-nome">${esc(CONFIG.NOME_LOJA)}</p>
        ${CONFIG.SLOGAN ? `<p class="login-slogan">${esc(CONFIG.SLOGAN)}</p>` : ''}
      </div>
      <h1 class="titulo-pagina">Painel da cozinha</h1>
      <p class="texto-apoio">Digite a senha para ver os pedidos.</p>
      <form class="cartao espaco-topo" data-form novalidate>
        <div class="campo">
          <label class="campo-rotulo" for="senha">Senha</label>
          <input class="entrada" id="senha" name="senha" type="password" autocomplete="current-password" maxlength="100" aria-describedby="erro-senha">
          <p class="campo-erro" id="erro-senha" role="alert" hidden></p>
        </div>
        <label class="opcao-avisar espaco-topo-sm">
          <input type="checkbox" name="lembrar">
          Manter conectado neste aparelho por 7 dias
        </label>
        <p class="campo-dica">Marque só no celular ou tablet de vocês, nunca em aparelho de outra pessoa.</p>
        <button type="submit" class="botao botao-primario botao-bloco espaco-topo-sm">Entrar</button>
      </form>
    </div>`;
  const form = el.querySelector('[data-form]');
  const erro = el.querySelector('#erro-senha');
  const botao = form.querySelector('button[type="submit"]');
  form.elements.senha.focus();
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    erro.hidden = true;
    botao.disabled = true;
    try {
      await entrarNoPainel(form.elements.senha.value, form.elements.lembrar.checked);
      aoEntrar();
    } catch (e) {
      erro.textContent = e.message || 'Não foi possível entrar.';
      erro.hidden = false;
      botao.disabled = false;
    }
  });
}

// Mostra a tela de senha quando preciso e, com sessão, a tela pedida (pedidos ou cardápio).
export function renderComLogin(el, criarTela) {
  let limpar = null;
  const abrir = () => {
    if (typeof limpar === 'function') limpar();
    // Elemento novo a cada entrada: os eventos da sessão anterior somem junto com ele.
    const tela = document.createElement('div');
    el.replaceChildren(tela);
    if (!temSessaoPainel()) {
      limpar = null;
      telaLogin(tela, abrir);
      return;
    }
    limpar = criarTela({ el: tela, aoExpirar: abrir });
  };
  abrir();
  return () => typeof limpar === 'function' && limpar();
}

export function render({ el }) {
  return renderComLogin(el, renderPedidos);
}

function renderPedidos({ el, aoExpirar }) {
  const idsConhecidos = new Set();
  let pedidos = [];
  let filtro = 'todos';
  let carregou = false;
  let ativo = true;
  let timer = null;
  let loja = null;
  const emAtualizacao = new Set();
  const tituloOriginal = document.title;
  const CHAVE_AVISAR = 'atelier:painel-avisar';
  let avisarAuto = lerLocal(CHAVE_AVISAR, true) !== false;

  // Voltou para o painel (desbloqueou o celular, trocou de app e voltou): busca na hora, sem esperar os 15 s.
  function aoMudarVisibilidade() {
    if (document.visibilityState !== 'visible' || !ativo) return;
    carregar();
    carregarLoja();
  }
  document.addEventListener('visibilitychange', aoMudarVisibilidade);

  el.innerHTML = `
    <header class="painel-topo">
      <div class="painel-topo-interno">
        <div>
          <h1 class="painel-titulo">Painel da cozinha</h1>
          <p class="painel-sub" data-sub>Carregando pedidos…</p>
          <p class="painel-sub" data-acesso hidden></p>
        </div>
        <div class="painel-topo-acoes">
          <a class="botao botao-secundario botao-pequeno" href="#/painel/cardapio">Cardápio</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/loja">Loja e horário</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/vendas">Vendas</a>
          <button type="button" class="botao botao-fantasma botao-pequeno" data-acao="atualizar">${icone('atualizar')} Atualizar</button>
          <button type="button" class="botao botao-fantasma botao-pequeno" data-acao="senha">Senha</button>
          <button type="button" class="botao botao-fantasma botao-pequeno" data-acao="sair">Sair</button>
          <a class="botao botao-fantasma botao-pequeno" href="#/">${icone('loja')} Ver site</a>
        </div>
      </div>
    </header>
    <div class="painel">
      <div class="estado-loja" data-estado-loja hidden></div>
      <label class="opcao-avisar">
        <input type="checkbox" data-avisar ${avisarAuto ? 'checked' : ''}>
        Abrir o WhatsApp do cliente com a mensagem pronta ao mudar o status
      </label>
      <div class="alerta-novo" data-alerta-novo role="status" hidden>
        <strong data-alerta-texto></strong>
      </div>
      <div class="contadores" data-contadores></div>
      <div class="chips" data-chips role="group" aria-label="Filtrar pedidos"></div>
      <div class="grade-pedidos" data-grade>${carregandoHTML('Carregando pedidos')}</div>
    </div>`;

  const sub = el.querySelector('[data-sub]');
  const estadoLojaEl = el.querySelector('[data-estado-loja]');
  const alertaNovo = el.querySelector('[data-alerta-novo]');
  const contadores = el.querySelector('[data-contadores]');
  const chips = el.querySelector('[data-chips]');
  const grade = el.querySelector('[data-grade]');

  // Mostra o acesso anterior: se não foi o casal, dá para perceber (e trocar a senha).
  const anterior = ultimoAcessoPainel();
  const infoAcesso = el.querySelector('[data-acesso]');
  if (anterior?.quando) {
    infoAcesso.textContent = `Acesso anterior ao painel: ${horario(anterior.quando)}${anterior.ip ? ` (IP ${anterior.ip})` : ''}. Não foi você? Troque a senha.`;
    infoAcesso.hidden = false;
  }

  // ---------- Aviso visual de pedido "Novo" esperando confirmação (sem som) ----------
  function atualizarAvisoNovos() {
    const novos = pedidos.filter((p) => p.status === 'recebido');
    alertaNovo.hidden = novos.length === 0;
    el.querySelector('[data-alerta-texto]').textContent = novos.length === 1
      ? `Pedido novo esperando confirmação: ${novos[0].codigo}`
      : `${novos.length} pedidos novos esperando confirmação`;
    document.title = novos.length ? `(${novos.length}) Pedido novo! | ${CONFIG.NOME_LOJA}` : tituloOriginal;
  }

  // ---------- Situação da loja (pausar/reabrir com um toque) ----------
  function desenharLoja() {
    if (!loja) return;
    const { estado, config } = loja;
    const texto = estado.aberta
      ? 'Loja aberta: recebendo pedidos.'
      : estado.motivo === 'pausado' ? 'Pedidos pausados: o site não aceita pedidos agora.' : 'Fechada pelo horário de funcionamento.';
    estadoLojaEl.className = `estado-loja ${estado.aberta ? 'aberta' : 'fechada'}`;
    estadoLojaEl.innerHTML = `
      <span>${esc(texto)}</span>
      <button type="button" class="botao ${config.pausado ? 'botao-primario' : 'botao-secundario'} botao-pequeno" data-acao="pausar">
        ${config.pausado ? 'Reabrir pedidos' : 'Pausar pedidos'}
      </button>`;
    estadoLojaEl.hidden = false;
  }

  async function carregarLoja() {
    try {
      loja = await lerLojaPainel();
      if (ativo) desenharLoja();
    } catch {
      // sem a situação da loja, o painel de pedidos continua funcionando
    }
  }

  function cardHTML(p) {
    const info = statusInfo(p.status);
    const proximo = proximoStatus(p.status, p.tipo_entrega);
    const final = STATUS_FINAIS.includes(p.status);
    const ocupado = emAtualizacao.has(String(p.id));
    const retirada = p.tipo_entrega === 'retirada';

    return `<article class="pedido-card" data-status="${esc(p.status)}">
      <div class="pedido-cabeca">
        <div>
          <h2 class="pedido-codigo">${esc(p.codigo)}</h2>
          <p class="pedido-cliente">${esc(p.cliente_nome)}</p>
        </div>
        <div class="pedido-cabeca-dir">
          <span class="status status-${esc(p.status)}">${info.rotulo}</span>
          <span class="pedido-hora">${icone('relogio')} ${hora(p.criado_em)}, ${haQuanto(p.criado_em)}</span>
        </div>
      </div>

      ${retirada ? '<p class="selo-retirada">Retirada na doceria</p>' : ''}

      <ul class="pedido-itens">
        ${p.itens.map((i) => `
          <li>
            <span><span class="pedido-qtd">${i.quantidade}x</span>${esc(i.nome || 'Item')}${metaItemHTML(i)}</span>
            <span>${dinheiro(precoLinha(i))}</span>
          </li>`).join('')}
      </ul>

      ${p.observacoes ? `<p class="pedido-obs"><strong>Obs.:</strong> ${esc(p.observacoes)}</p>` : ''}

      ${retirada ? '' : `<p class="pedido-detalhe">${icone('local')}<span>${esc(enderecoCompleto(p)) || 'Endereço não informado'}</span></p>`}
      <p class="pedido-detalhe">${icone('whatsapp')}<span>${esc(formatarTelefone(p.cliente_whatsapp))}</span></p>
      <p class="pedido-detalhe">${icone('cartao')}<span>${esc(rotuloPagamento(p.forma_pagamento))}</span></p>

      ${!retirada && textoEntrega(p.taxa_entrega) ? `<p class="pedido-entrega"><span>Doces ${dinheiro(subtotalPedido(p))}</span><span>Entrega: ${textoEntrega(p.taxa_entrega)}</span></p>` : ''}
      <div class="pedido-rodape">
        <span>Total</span>
        <span class="pedido-total">${dinheiro(p.total)}</span>
      </div>

      <div class="pedido-acoes">
        ${proximo
          ? `<button type="button" class="botao botao-primario botao-pequeno" data-acao="avancar" data-id="${esc(p.id)}" ${ocupado ? 'disabled' : ''}>${ocupado ? 'Atualizando…' : acaoStatus(p.status, p.tipo_entrega)}</button>`
          : `<span class="pedido-finalizado">${p.status === 'cancelado' ? 'Pedido cancelado' : `${icone('check')} Pedido entregue`}</span>`}
        <a class="botao botao-menta botao-redondo" href="${esc(linkAvisoCliente(p, { enderecoRetirada: loja?.config?.endereco_retirada }))}" target="_blank" rel="noopener"
          aria-label="Avisar ${esc(p.cliente_nome)} no WhatsApp: ${esc(info.rotulo)}" title="Avisar o cliente no WhatsApp (${esc(info.rotulo)})">${icone('whatsapp')}</a>
      </div>
      ${final ? '' : `<button type="button" class="link-cancelar" data-acao="cancelar" data-id="${esc(p.id)}" ${ocupado ? 'disabled' : ''}>Cancelar pedido</button>`}
    </article>`;
  }

  // "Todos em aberto" primeiro; depois cada status na ordem do fluxo do pedido (Novo → ... → Entregue → Cancelado).
  // Entregues e cancelados só aparecem nos filtros deles, e só por 24 horas (depois o servidor nem envia).
  const FILTROS = [
    { valor: 'todos', rotulo: 'Todos em aberto', teste: (p) => !STATUS_FINAIS.includes(p.status) },
    ...STATUS.map((s) => ({ valor: s.valor, rotulo: s.rotulo, teste: (p) => p.status === s.valor })),
  ];

  function desenhar() {
    const hoje = new Date().toDateString();
    const deHoje = pedidos.filter((p) => new Date(p.criado_em).toDateString() === hoje && p.status !== 'cancelado').length;
    const novos = pedidos.filter((p) => p.status === 'recebido').length;
    const emAndamento = pedidos.filter((p) => !STATUS_FINAIS.includes(p.status) && p.status !== 'recebido').length;

    contadores.innerHTML = `
      <div class="contador ${novos ? 'destaque' : ''}"><p class="contador-valor">${novos}</p><p class="contador-rotulo">Novos</p></div>
      <div class="contador"><p class="contador-valor">${emAndamento}</p><p class="contador-rotulo">Em andamento</p></div>
      <div class="contador"><p class="contador-valor">${deHoje}</p><p class="contador-rotulo">Pedidos hoje</p></div>`;

    chips.innerHTML = FILTROS.map((f) => `
      <button type="button" class="chip" data-acao="filtrar" data-status="${f.valor}" aria-pressed="${filtro === f.valor}">
        ${f.rotulo} <span class="chip-contagem">${pedidos.filter(f.teste).length}</span>
      </button>`).join('');

    const atual = FILTROS.find((f) => f.valor === filtro) || FILTROS[0];
    const visiveis = ordenar(pedidos.filter(atual.teste));
    grade.innerHTML = visiveis.length
      ? visiveis.map(cardHTML).join('')
      : estadoHTML({
        titulo: filtro === 'todos' ? 'Nenhum pedido em aberto' : `Nenhum pedido em "${esc(atual.rotulo)}"`,
        texto: STATUS_FINAIS.includes(filtro) ? 'Aparecem aqui só os das últimas 24 horas.' : 'Os pedidos novos aparecem aqui sozinhos.',
        categoria: 'brownie',
      });
    atualizarAvisoNovos();
  }

  async function carregar() {
    clearTimeout(timer);
    try {
      const lista = await listarPedidos();
      if (!ativo) return;
      // Pedido novo (depois da primeira carga): aviso rápido na tela.
      const novos = lista.filter((p) => !idsConhecidos.has(String(p.id)));
      if (carregou && novos.length) {
        toast(novos.length === 1 ? `Pedido novo: ${novos[0].codigo}` : `${novos.length} pedidos novos`);
      }
      lista.forEach((p) => idsConhecidos.add(String(p.id)));
      pedidos = lista;
      carregou = true;
      sub.textContent = `Atualizado às ${hora(new Date().toISOString())}. Atualiza sozinho a cada ${INTERVALO_ATUALIZACAO / 1000} segundos.`;
      desenhar();
    } catch (erro) {
      if (!ativo) return;
      if (erro.status === 401) {
        sairDoPainel();
        aoExpirar();
        return;
      }
      sub.textContent = `Falha ao atualizar: ${erro.message}`;
      if (!carregou) {
        grade.innerHTML = estadoHTML({
          titulo: 'Não deu para carregar os pedidos',
          texto: esc(erro.message),
          acao: '<button type="button" class="botao botao-primario" data-acao="atualizar">Tentar de novo</button>',
        });
      }
    } finally {
      if (ativo) {
        clearTimeout(timer);
        timer = setTimeout(() => { carregar(); carregarLoja(); }, INTERVALO_ATUALIZACAO);
      }
    }
  }

  // A aba do WhatsApp precisa ser aberta no próprio clique (o navegador bloqueia janelas abertas depois).
  // Ela abre em branco e só recebe o endereço se o status mudar de verdade.
  function abrirAbaAviso(pedido, novoStatus) {
    if (!avisarAuto || !statusAvisaCliente(novoStatus, pedido.tipo_entrega)) return null;
    const aba = window.open('', '_blank');
    if (aba) aba.opener = null;
    return aba;
  }

  async function mudarStatus(pedido, novoStatus, aba = null) {
    const id = String(pedido.id);
    emAtualizacao.add(id);
    desenhar();
    try {
      const atualizado = await atualizarStatus(pedido.id, novoStatus);
      Object.assign(pedido, { status: atualizado.status || novoStatus });
      toast(`${pedido.codigo}: ${statusInfo(pedido.status).rotulo}`);
      if (aba) aba.location.href = linkAvisoCliente(pedido, { enderecoRetirada: loja?.config?.endereco_retirada });
    } catch (erro) {
      aba?.close();
      if (erro.status === 401) {
        sairDoPainel();
        aoExpirar();
        return;
      }
      toast(erro.message || 'Não foi possível atualizar o pedido.', 'erro');
    } finally {
      emAtualizacao.delete(id);
      if (ativo) desenhar();
    }
  }

  el.addEventListener('click', async (evento) => {
    const alvo = evento.target.closest('[data-acao]');
    if (!alvo || !el.contains(alvo)) return;
    const { acao } = alvo.dataset;

    if (acao === 'senha') { abrirAlterarSenha(aoExpirar); return; }
    if (acao === 'sair') { sairDoPainel(); aoExpirar(); return; }

    if (acao === 'atualizar') {
      sub.textContent = 'Atualizando…';
      carregar();
      carregarLoja();
      return;
    }

    if (acao === 'filtrar') {
      filtro = alvo.dataset.status;
      desenhar();
      [...chips.querySelectorAll('.chip')].find((c) => c.dataset.status === filtro)?.focus();
      return;
    }

    if (acao === 'pausar' && loja) {
      const pausar = !loja.config.pausado;
      if (pausar && !window.confirm('Pausar os pedidos? O site vai mostrar que a loja está fechada até vocês reabrirem.')) return;
      alvo.disabled = true;
      try {
        loja = await salvarLojaPainel({ pausado: pausar });
        toast(pausar ? 'Pedidos pausados' : 'Pedidos reabertos');
      } catch (erro) {
        if (erro.status === 401) { sairDoPainel(); aoExpirar(); return; }
        toast(erro.message || 'Não foi possível alterar.', 'erro');
      } finally {
        if (ativo) desenharLoja();
      }
      return;
    }

    const pedido = pedidos.find((p) => String(p.id) === alvo.dataset.id);
    if (!pedido || emAtualizacao.has(String(pedido.id))) return;

    if (acao === 'avancar') {
      const novoStatus = proximoStatus(pedido.status, pedido.tipo_entrega);
      if (novoStatus) mudarStatus(pedido, novoStatus, abrirAbaAviso(pedido, novoStatus));
    }

    if (acao === 'cancelar') {
      if (!window.confirm(`Cancelar o pedido ${pedido.codigo} de ${pedido.cliente_nome}? Avise o cliente pelo WhatsApp.`)) return;
      mudarStatus(pedido, 'cancelado', abrirAbaAviso(pedido, 'cancelado'));
    }
  });

  el.querySelector('[data-avisar]').addEventListener('change', (evento) => {
    avisarAuto = evento.target.checked;
    gravarLocal(CHAVE_AVISAR, avisarAuto);
  });

  carregar();
  carregarLoja();

  return () => {
    ativo = false;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    document.title = tituloOriginal;
  };
}
