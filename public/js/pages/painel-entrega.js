// Entrega: o casal cadastra os bairros de Carpina (cada um com sua taxa) e outras cidades (valor fixo).
// Vale na hora no checkout. Sem nada cadastrado, a entrega é grátis.

import { lerEntregaPainel, salvarTaxaEntregaPainel, removerTaxaEntregaPainel, sairDoPainel } from '../api.js';
import { renderComLogin, abrirAlterarSenha } from './painel.js';
import { esc, dinheiro, icone, estadoHTML, carregandoHTML, toast } from '../ui.js';

const valorCampo = (taxa) => (Number(taxa) || 0).toFixed(2).replace('.', ',');

function linhaHTML(tipo, item) {
  const nome = tipo === 'bairro' ? item.bairro : item.cidade;
  return `<form class="taxa-linha" data-linha data-tipo="${tipo}" data-id="${esc(item.id)}" novalidate>
    <input class="entrada" name="nome" value="${esc(nome)}" maxlength="60" aria-label="Nome ${tipo === 'bairro' ? 'do bairro' : 'da cidade'}">
    <span class="taxa-campo"><span aria-hidden="true">R$</span>
      <input class="entrada" name="taxa" value="${valorCampo(item.taxa)}" inputmode="decimal" maxlength="8" aria-label="Taxa de entrega para ${esc(nome)}">
    </span>
    <span class="taxa-acoes">
      <button type="submit" class="botao botao-primario botao-pequeno" data-salvar hidden>Salvar</button>
      <button type="button" class="botao botao-fantasma botao-pequeno" data-acao="remover">Remover</button>
    </span>
    <span class="taxa-info">${Number(item.taxa) > 0 ? dinheiro(item.taxa) : 'entrega grátis'}</span>
  </form>`;
}

function novoHTML(tipo) {
  const rotulo = tipo === 'bairro' ? 'Novo bairro' : 'Nova cidade';
  return `<form class="taxa-linha taxa-nova" data-novo data-tipo="${tipo}" novalidate>
    <input class="entrada" name="nome" maxlength="60" placeholder="${tipo === 'bairro' ? 'Ex.: Centro' : 'Ex.: Paudalho'}" aria-label="${rotulo}">
    <span class="taxa-campo"><span aria-hidden="true">R$</span>
      <input class="entrada" name="taxa" inputmode="decimal" maxlength="8" placeholder="0,00" aria-label="Taxa de entrega">
    </span>
    <span class="taxa-acoes">
      <button type="submit" class="botao botao-secundario botao-pequeno">${icone('mais')} Adicionar</button>
    </span>
  </form>`;
}

function renderEntrega({ el, aoExpirar }) {
  let ativo = true;

  el.innerHTML = `
    <header class="painel-topo">
      <div class="painel-topo-interno">
        <div>
          <h1 class="painel-titulo">Entrega</h1>
          <p class="painel-sub">Taxas por bairro e por cidade. Mudanças valem na hora no site.</p>
        </div>
        <div class="painel-topo-acoes">
          <a class="botao botao-secundario botao-pequeno" href="#/painel">Pedidos</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/cardapio">Cardápio</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/loja">Loja e horário</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/vendas">Vendas</a>
          <button type="button" class="botao botao-fantasma botao-pequeno" data-acao="senha">Senha</button>
          <button type="button" class="botao botao-fantasma botao-pequeno" data-acao="sair">Sair</button>
        </div>
      </div>
    </header>
    <div class="gestao" data-conteudo>${carregandoHTML('Carregando')}</div>`;

  const conteudo = el.querySelector('[data-conteudo]');

  function desenhar(cfg) {
    conteudo.innerHTML = `
      <p class="aviso aviso-info">
        No pedido, o cliente escolhe a cidade e, em ${esc(cfg.cidade_principal)}, o bairro, e a taxa entra no total.
        Bairro ou cidade fora da lista: o cliente pode pedir, e a taxa fica <strong>a combinar pelo WhatsApp</strong>.
        Sem nada cadastrado, a entrega é grátis.
      </p>

      <section class="cartao">
        <h2 class="cartao-titulo">Bairros de ${esc(cfg.cidade_principal)}</h2>
        <div class="taxas-lista">
          ${cfg.bairros.length ? cfg.bairros.map((b) => linhaHTML('bairro', b)).join('') : '<p class="campo-dica">Nenhum bairro cadastrado ainda.</p>'}
        </div>
        ${novoHTML('bairro')}
      </section>

      <section class="cartao">
        <h2 class="cartao-titulo">Outras cidades (valor fixo)</h2>
        <p class="campo-dica">Um valor só para a cidade inteira. O cliente digita o bairro normalmente.</p>
        <div class="taxas-lista">
          ${cfg.cidades.length ? cfg.cidades.map((c) => linhaHTML('cidade', c)).join('') : '<p class="campo-dica">Nenhuma cidade cadastrada ainda.</p>'}
        </div>
        ${novoHTML('cidade')}
      </section>`;
  }

  async function carregar() {
    try {
      const cfg = await lerEntregaPainel();
      if (ativo) desenhar(cfg);
    } catch (erro) {
      if (!ativo) return;
      if (erro.status === 401) { sairDoPainel(); aoExpirar(); return; }
      conteudo.innerHTML = estadoHTML({
        titulo: 'Não deu para carregar',
        texto: esc(erro.message),
        acao: '<button type="button" class="botao botao-primario" data-acao="recarregar">Tentar de novo</button>',
      });
    }
  }

  // Monta o que vai para o servidor a partir de uma linha do formulário.
  function dadosDaLinha(form) {
    const tipo = form.dataset.tipo;
    const nome = form.elements.nome.value;
    return { tipo, [tipo === 'bairro' ? 'bairro' : 'cidade']: nome, taxa: form.elements.taxa.value };
  }

  async function executar(acao, botao, mensagemOk) {
    if (botao) botao.disabled = true;
    try {
      const cfg = await acao();
      if (!ativo) return;
      desenhar(cfg);
      toast(mensagemOk);
    } catch (erro) {
      if (erro.status === 401) { sairDoPainel(); aoExpirar(); return; }
      toast(erro.message || 'Não foi possível salvar.', 'erro');
      if (botao) botao.disabled = false;
    }
  }

  // Mudou o nome ou a taxa de uma linha: aparece o botão Salvar dela.
  el.addEventListener('input', (evento) => {
    const linha = evento.target.closest('[data-linha]');
    if (linha) linha.querySelector('[data-salvar]').hidden = false;
  });

  el.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const form = evento.target;
    if (form.matches('[data-novo]')) {
      const tipo = form.dataset.tipo;
      executar(() => salvarTaxaEntregaPainel(null, dadosDaLinha(form)), form.querySelector('button'),
        tipo === 'bairro' ? 'Bairro adicionado' : 'Cidade adicionada');
    } else if (form.matches('[data-linha]')) {
      executar(() => salvarTaxaEntregaPainel(form.dataset.id, dadosDaLinha(form)), form.querySelector('[data-salvar]'), 'Alteração salva');
    }
  });

  el.addEventListener('click', (evento) => {
    const alvo = evento.target.closest('[data-acao]');
    if (!alvo || !el.contains(alvo)) return;
    const { acao } = alvo.dataset;
    if (acao === 'senha') abrirAlterarSenha(aoExpirar);
    if (acao === 'sair') { sairDoPainel(); aoExpirar(); }
    if (acao === 'recarregar') carregar();
    if (acao === 'remover') {
      const form = alvo.closest('[data-linha]');
      const nome = form.elements.nome.value;
      if (!window.confirm(`Remover ${nome} da lista de entrega?`)) return;
      executar(() => removerTaxaEntregaPainel(form.dataset.id), alvo, `${nome} removido`);
    }
  });

  carregar();
  return () => { ativo = false; };
}

export function render({ el }) {
  return renderComLogin(el, renderEntrega);
}
