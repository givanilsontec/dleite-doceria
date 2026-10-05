// Gestão do cardápio no painel: o casal marca o que acabou, muda preços, cria produtos e promoções.
// Tudo é salvo na hora no banco (e vale para quem abrir o site depois).

import { listarProdutosPainel, salvarProdutoPainel, sairDoPainel } from '../api.js';
import { renderComLogin, abrirAlterarSenha } from './painel.js';
import { esc, dinheiro, icone, estadoHTML, carregandoHTML, toast } from '../ui.js';

const FOCAVEIS = 'button:not([disabled]), input:not([disabled]), select, textarea, [href]';

// "10,50" ou "10.5" -> 10.5 ; vazio -> null
function numero(texto) {
  const limpo = String(texto ?? '').trim().replace(',', '.');
  return limpo === '' ? null : Number(limpo);
}

function resumoHTML(p) {
  const partes = [esc(p.categoria)];
  partes.push(p.preco > 0 ? dinheiro(p.preco) : 'sem preço');
  if (p.promo_qtd) partes.push(`promoção ${p.promo_qtd} por ${dinheiro(p.promo_preco)}`);
  if (p.sabores.length) {
    const esgotados = p.sabores.filter((s) => s.esgotado).length;
    partes.push(`${p.sabores.length} sabores${esgotados ? ` (${esgotados} esgotado${esgotados > 1 ? 's' : ''})` : ''}`);
  }
  return partes.join(' · ');
}

function itemHTML(p) {
  return `<article class="gestao-item ${p.disponivel ? '' : 'inativo'}">
    <div>
      <h2 class="gestao-nome">${esc(p.nome)}</h2>
      <p class="gestao-meta">${resumoHTML(p)}</p>
    </div>
    <div class="gestao-acoes">
      <button type="button" class="chip" data-acao="alternar" data-id="${esc(p.id)}" aria-pressed="${p.disponivel}"
        aria-label="${esc(p.nome)}: ${p.disponivel ? 'disponível' : 'fora do cardápio'}. Tocar para alternar">
        ${p.disponivel ? 'No cardápio' : 'Fora do cardápio'}
      </button>
      <button type="button" class="botao botao-secundario botao-pequeno" data-acao="editar" data-id="${esc(p.id)}">Editar</button>
    </div>
  </article>`;
}

function saborLinhaHTML(s = { nome: '', preco: null, esgotado: false }) {
  return `<div class="sabor-linha" data-sabor>
    <input class="entrada" name="sabor_nome" value="${esc(s.nome)}" placeholder="Sabor" maxlength="60" aria-label="Nome do sabor">
    <input class="entrada" name="sabor_preco" value="${s.preco ? String(s.preco).replace('.', ',') : ''}" inputmode="decimal" placeholder="Preço" maxlength="8" aria-label="Preço deste sabor, se for diferente">
    <label class="sabor-esgotado"><input type="checkbox" name="sabor_esgotado" ${s.esgotado ? 'checked' : ''}> Esgotado</label>
    <button type="button" class="sabor-remover" data-acao="tirar-sabor" aria-label="Remover sabor">×</button>
  </div>`;
}

// Janela de edição/criação. `produto` null = produto novo.
function abrirFormulario(produto, categorias, aoSalvar, aoExpirar) {
  const novo = !produto;
  const p = produto || { nome: '', categoria: categorias[0] || '', descricao: '', preco: 0, disponivel: true, sabores: [], promo_qtd: null, promo_preco: null };

  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="form-titulo" tabindex="-1">
      <div class="modal-cabeca">
        <div class="modal-titulo-bloco"><h2 id="form-titulo">${novo ? 'Novo produto' : 'Editar produto'}</h2></div>
        <button type="button" class="botao-fechar" data-acao="fechar" aria-label="Fechar">${icone('fechar')}</button>
      </div>
      <form class="modal-corpo" data-form novalidate>
        <div class="campo">
          <label class="campo-rotulo" for="f-nome">Nome</label>
          <input class="entrada" id="f-nome" name="nome" value="${esc(p.nome)}" maxlength="80">
        </div>
        <div class="linha-dupla">
          <div class="campo">
            <label class="campo-rotulo" for="f-preco">Preço (R$)</label>
            <input class="entrada" id="f-preco" name="preco" value="${p.preco ? String(p.preco).replace('.', ',') : ''}" inputmode="decimal" placeholder="0,00" maxlength="8">
          </div>
          <div class="campo">
            <label class="campo-rotulo" for="f-categoria">Categoria</label>
            <input class="entrada" id="f-categoria" name="categoria" value="${esc(p.categoria)}" list="f-categorias" maxlength="40">
            <datalist id="f-categorias">${categorias.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
          </div>
        </div>
        <div class="campo">
          <label class="campo-rotulo" for="f-descricao">Descrição <span class="campo-opcional">(opcional)</span></label>
          <input class="entrada" id="f-descricao" name="descricao" value="${esc(p.descricao || '')}" maxlength="200" placeholder="Ex.: Unidade">
        </div>
        <fieldset class="grupo">
          <legend class="grupo-titulo">Promoção <span class="campo-opcional">(opcional)</span></legend>
          <div class="linha-dupla">
            <div class="campo">
              <label class="campo-rotulo" for="f-promo-qtd">Leve (unidades)</label>
              <input class="entrada" id="f-promo-qtd" name="promo_qtd" value="${p.promo_qtd || ''}" inputmode="numeric" placeholder="Ex.: 2" maxlength="2">
            </div>
            <div class="campo">
              <label class="campo-rotulo" for="f-promo-preco">Por (R$)</label>
              <input class="entrada" id="f-promo-preco" name="promo_preco" value="${p.promo_preco ? String(p.promo_preco).replace('.', ',') : ''}" inputmode="decimal" placeholder="Ex.: 12,00" maxlength="8">
            </div>
          </div>
        </fieldset>
        <fieldset class="grupo">
          <legend class="grupo-titulo">Sabores <span class="campo-opcional">(deixe vazio se não tiver)</span></legend>
          <p class="campo-dica">O preço do sabor só precisa ser preenchido se for diferente do preço acima. Marque "Esgotado" para tirar o sabor do cardápio por enquanto.</p>
          <div data-sabores>${p.sabores.map((s) => saborLinhaHTML(s)).join('')}</div>
          <button type="button" class="botao botao-secundario botao-pequeno" data-acao="add-sabor">${icone('mais')} Adicionar sabor</button>
        </fieldset>
        <label class="opcao"><input type="checkbox" name="disponivel" ${p.disponivel ? 'checked' : ''}>
          <span class="opcao-corpo"><span class="opcao-nome">Mostrar no cardápio</span></span></label>
      </form>
      <div class="modal-rodape">
        <p class="campo-erro" data-erro role="alert" hidden></p>
        <button type="button" class="botao botao-primario botao-bloco" data-acao="salvar">Salvar</button>
      </div>
    </div>`;

  document.body.appendChild(fundo);
  document.body.classList.add('modal-aberto');
  const janela = fundo.querySelector('.modal');
  const form = fundo.querySelector('[data-form]');
  const erro = fundo.querySelector('[data-erro]');
  const botaoSalvar = fundo.querySelector('[data-acao="salvar"]');

  const mostrarErro = (msg) => { erro.textContent = msg; erro.hidden = !msg; };

  function fechar() {
    document.removeEventListener('keydown', aoTeclar);
    fundo.remove();
    document.body.classList.remove('modal-aberto');
  }

  function aoTeclar(evento) {
    if (evento.key === 'Escape') { fechar(); return; }
    if (evento.key !== 'Tab') return;
    const lista = [...janela.querySelectorAll(FOCAVEIS)];
    const primeiro = lista[0];
    const ultimo = lista[lista.length - 1];
    if (evento.shiftKey && (document.activeElement === primeiro || document.activeElement === janela)) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  function coletar() {
    const sabores = [...form.querySelectorAll('[data-sabor]')]
      .map((linha) => ({
        nome: linha.querySelector('[name="sabor_nome"]').value.trim(),
        preco: numero(linha.querySelector('[name="sabor_preco"]').value),
        esgotado: linha.querySelector('[name="sabor_esgotado"]').checked,
      }))
      .filter((s) => s.nome); // linha em branco é ignorada
    return {
      nome: form.elements.nome.value,
      categoria: form.elements.categoria.value,
      descricao: form.elements.descricao.value,
      preco: numero(form.elements.preco.value) ?? 0,
      disponivel: form.elements.disponivel.checked,
      promo_qtd: numero(form.elements.promo_qtd.value),
      promo_preco: numero(form.elements.promo_preco.value),
      sabores,
    };
  }

  async function salvar() {
    mostrarErro('');
    const dados = coletar();
    if (dados.sabores.some((s) => Number.isNaN(s.preco)) || [dados.preco, dados.promo_qtd, dados.promo_preco].some(Number.isNaN)) {
      mostrarErro('Confira os números: use só dígitos e vírgula (ex.: 8,50).');
      return;
    }
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = 'Salvando…';
    try {
      await salvarProdutoPainel(produto?.id, dados);
      fechar();
      toast(novo ? 'Produto criado' : 'Alterações salvas');
      aoSalvar();
    } catch (e) {
      if (e.status === 401) { fechar(); sairDoPainel(); aoExpirar(); return; }
      mostrarErro(e.message || 'Não foi possível salvar.');
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = 'Salvar';
    }
  }

  fundo.addEventListener('click', (evento) => {
    if (evento.target === fundo) { fechar(); return; }
    const alvo = evento.target.closest('[data-acao]');
    if (!alvo) return;
    const { acao } = alvo.dataset;
    if (acao === 'fechar') fechar();
    if (acao === 'salvar') salvar();
    if (acao === 'add-sabor') {
      fundo.querySelector('[data-sabores]').insertAdjacentHTML('beforeend', saborLinhaHTML());
      fundo.querySelector('[data-sabores]').lastElementChild.querySelector('input').focus();
    }
    if (acao === 'tirar-sabor') alvo.closest('[data-sabor]').remove();
  });
  form.addEventListener('submit', (evento) => { evento.preventDefault(); salvar(); });

  document.addEventListener('keydown', aoTeclar);
  janela.focus();
}

function renderCardapio({ el, aoExpirar }) {
  let produtos = [];
  let ativo = true;

  el.innerHTML = `
    <header class="painel-topo">
      <div class="painel-topo-interno">
        <div>
          <h1 class="painel-titulo">Cardápio</h1>
          <p class="painel-sub">Mudanças aparecem na hora para quem abrir o site.</p>
        </div>
        <div class="painel-topo-acoes">
          <a class="botao botao-secundario botao-pequeno" href="#/painel">Pedidos</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/loja">Loja e horário</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/vendas">Vendas</a>
          <button type="button" class="botao botao-fantasma botao-pequeno" data-acao="senha">Senha</button>
          <button type="button" class="botao botao-fantasma botao-pequeno" data-acao="sair">Sair</button>
          <a class="botao botao-fantasma botao-pequeno" href="#/">${icone('loja')} Ver loja</a>
        </div>
      </div>
    </header>
    <div class="gestao">
      <div class="gestao-topo">
        <button type="button" class="botao botao-primario botao-pequeno" data-acao="novo">${icone('mais')} Novo produto</button>
      </div>
      <div data-lista>${carregandoHTML('Carregando cardápio')}</div>
    </div>`;

  const lista = el.querySelector('[data-lista]');
  const categorias = () => [...new Set(produtos.map((p) => p.categoria))];

  function desenhar() {
    lista.innerHTML = produtos.length
      ? `<div class="gestao gestao-lista">${produtos.map(itemHTML).join('')}</div>`
      : estadoHTML({ titulo: 'Nenhum produto ainda', texto: 'Toque em "Novo produto" para começar.' });
  }

  async function carregar() {
    try {
      const dados = await listarProdutosPainel();
      if (!ativo) return;
      produtos = dados;
      desenhar();
    } catch (erro) {
      if (!ativo) return;
      if (erro.status === 401) { sairDoPainel(); aoExpirar(); return; }
      lista.innerHTML = estadoHTML({
        titulo: 'Não deu para carregar o cardápio',
        texto: esc(erro.message),
        acao: '<button type="button" class="botao botao-primario" data-acao="recarregar">Tentar de novo</button>',
      });
    }
  }

  el.addEventListener('click', async (evento) => {
    const alvo = evento.target.closest('[data-acao]');
    if (!alvo || !el.contains(alvo)) return;
    const { acao, id } = alvo.dataset;
    const produto = produtos.find((p) => p.id === id);

    if (acao === 'senha') { abrirAlterarSenha(aoExpirar); return; }
    if (acao === 'sair') { sairDoPainel(); aoExpirar(); return; }
    if (acao === 'recarregar') { lista.innerHTML = carregandoHTML('Carregando cardápio'); carregar(); }
    if (acao === 'novo') abrirFormulario(null, categorias(), carregar, aoExpirar);
    if (acao === 'editar' && produto) abrirFormulario(produto, categorias(), carregar, aoExpirar);

    if (acao === 'alternar' && produto) {
      alvo.disabled = true;
      try {
        await salvarProdutoPainel(produto.id, { disponivel: !produto.disponivel });
        toast(produto.disponivel ? `${produto.nome}: fora do cardápio` : `${produto.nome}: de volta ao cardápio`);
        await carregar();
      } catch (erro) {
        if (erro.status === 401) { sairDoPainel(); aoExpirar(); return; }
        toast(erro.message || 'Não foi possível alterar.', 'erro');
        alvo.disabled = false;
      }
    }
  });

  carregar();
  return () => { ativo = false; };
}

export function render({ el }) {
  return renderComLogin(el, renderCardapio);
}
