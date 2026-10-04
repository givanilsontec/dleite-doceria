// Janela de escolha do doce: sabor (obrigatório, se o produto tiver), adicionais e quantidade.
// Abre de baixo no celular e centralizada no computador.

import { LIMITE_POR_ITEM } from './cart.js';
import { esc, dinheiro, icone, midiaProduto, classeCategoria, descontoPromo, precoDoSabor, precoVaria, precoMinimo, fotoDoItem } from './ui.js';

let aberto = false;

const FOCAVEIS = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function abrirModalProduto(produto, { aoAdicionar, aoFechar } = {}) {
  if (aberto) return;
  aberto = true;

  const temSabores = produto.sabores.length > 0;
  const temAdicionais = produto.adicionais.length > 0;
  let quantidade = 1;
  const temFoto = Boolean(fotoDoItem(produto, null));

  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo" tabindex="-1">
      <div class="modal-cabeca">
        ${temFoto ? '' : `<div class="modal-thumb ${classeCategoria(produto.categoria)}" data-midia-modal>${midiaProduto(produto, { carrossel: false })}</div>`}
        <div class="modal-titulo-bloco">
          <h2 id="modal-titulo">${esc(produto.nome)}</h2>
          <p class="modal-preco" data-preco-modal>${precoVaria(produto) ? 'a partir de ' : ''}${dinheiro(precoMinimo(produto))}</p>
        </div>
        <button type="button" class="botao-fechar" data-acao="fechar" aria-label="Fechar">${icone('fechar')}</button>
      </div>
      ${temFoto ? `<div class="modal-foto" data-midia-modal>${midiaProduto(produto, { carrossel: false })}</div>` : ''}

      <form class="modal-corpo" data-form novalidate>
        ${temSabores ? `
          <fieldset class="grupo">
            <legend class="grupo-titulo">Escolha o sabor <span class="selo-obrigatorio">obrigatório</span></legend>
            <div class="opcoes-pagamento">
              ${produto.sabores.map((sabor) => `
                <label class="opcao">
                  <input type="radio" name="sabor" value="${esc(sabor)}" ${produto.sabores.length === 1 ? 'checked' : ''}>
                  <span class="opcao-corpo"><span class="opcao-nome">${esc(sabor)}</span></span>
                  ${precoVaria(produto) ? `<span class="opcao-preco">${dinheiro(precoDoSabor(produto, sabor))}</span>` : ''}
                </label>`).join('')}
            </div>
          </fieldset>` : ''}

        ${temAdicionais ? `
          <fieldset class="grupo">
            <legend class="grupo-titulo">Adicionais <span class="campo-opcional">(opcional)</span></legend>
            <div class="opcoes-pagamento">
              ${produto.adicionais.map((ad) => `
                <label class="opcao">
                  <input type="checkbox" name="adicional" value="${esc(ad.id)}">
                  <span class="opcao-corpo"><span class="opcao-nome">${esc(ad.nome)}</span></span>
                  <span class="opcao-preco">+ ${dinheiro(ad.preco)}</span>
                </label>`).join('')}
            </div>
          </fieldset>` : ''}

        <div class="modal-quantidade">
          <span class="campo-rotulo" id="rotulo-qtd">Quantidade</span>
          <div class="stepper" role="group" aria-labelledby="rotulo-qtd">
            <button type="button" data-acao="menos" aria-label="Diminuir">${icone('menos')}</button>
            <span class="stepper-qtd" data-qtd aria-live="polite">1</span>
            <button type="button" data-acao="mais" aria-label="Aumentar">${icone('mais')}</button>
          </div>
        </div>
      </form>

      <div class="modal-rodape">
        <p class="campo-erro" data-erro role="alert" hidden></p>
        <button type="button" class="botao botao-primario botao-bloco botao-total" data-acao="adicionar">
          <span>Adicionar ao pedido</span>
          <span data-total></span>
        </button>
      </div>
    </div>`;

  document.body.appendChild(fundo);
  document.body.classList.add('modal-aberto');

  const janela = fundo.querySelector('.modal');
  const form = fundo.querySelector('[data-form]');
  const erro = fundo.querySelector('[data-erro]');
  const botaoMenos = fundo.querySelector('[data-acao="menos"]');
  const botaoMais = fundo.querySelector('[data-acao="mais"]');

  function adicionaisEscolhidos() {
    const ids = [...form.querySelectorAll('input[name="adicional"]:checked')].map((i) => i.value);
    return produto.adicionais.filter((a) => ids.includes(String(a.id)));
  }

  // Preço base do sabor marcado (sem sabor marcado, o menor preço do produto).
  function precoBaseAtual() {
    const sabor = form.querySelector('input[name="sabor"]:checked')?.value;
    return sabor ? precoDoSabor(produto, sabor) : precoMinimo(produto);
  }

  function atualizar() {
    const extras = adicionaisEscolhidos().reduce((soma, a) => soma + a.preco, 0);
    const base = precoBaseAtual();
    const saborMarcado = Boolean(form.querySelector('input[name="sabor"]:checked'));
    fundo.querySelector('[data-preco-modal]').textContent = `${precoVaria(produto) && !saborMarcado ? 'a partir de ' : ''}${dinheiro(base)}`;
    fundo.querySelector('[data-total]').textContent = dinheiro((base + extras) * quantidade - descontoPromo(base, quantidade, produto.promo_qtd, produto.promo_preco));
    fundo.querySelector('[data-qtd]').textContent = String(quantidade);
    botaoMenos.disabled = quantidade <= 1;
    botaoMais.disabled = quantidade >= LIMITE_POR_ITEM;
  }

  function mostrarErro(mensagem) {
    erro.textContent = mensagem;
    erro.hidden = !mensagem;
  }

  function fechar() {
    if (!aberto) return;
    aberto = false;
    document.removeEventListener('keydown', aoTeclar);
    window.removeEventListener('hashchange', fechar);
    fundo.remove();
    document.body.classList.remove('modal-aberto');
    aoFechar?.();
  }

  function adicionar() {
    const sabor = temSabores ? form.querySelector('input[name="sabor"]:checked')?.value : null;
    if (temSabores && !sabor) {
      mostrarErro('Escolha um sabor para continuar.');
      form.querySelector('input[name="sabor"]')?.focus();
      return;
    }
    aoAdicionar?.({ sabor: sabor || null, adicionais: adicionaisEscolhidos(), quantidade });
    fechar();
  }

  // Mantém o Tab dentro da janela enquanto ela está aberta.
  function aoTeclar(evento) {
    if (evento.key === 'Escape') {
      fechar();
      return;
    }
    if (evento.key !== 'Tab') return;
    const lista = [...janela.querySelectorAll(FOCAVEIS)];
    if (!lista.length) return;
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

  fundo.addEventListener('click', (evento) => {
    if (evento.target === fundo) {
      fechar();
      return;
    }
    const alvo = evento.target.closest('[data-acao]');
    if (!alvo) return;
    const { acao } = alvo.dataset;
    if (acao === 'fechar') fechar();
    if (acao === 'adicionar') adicionar();
    if (acao === 'mais' && quantidade < LIMITE_POR_ITEM) quantidade += 1;
    if (acao === 'menos' && quantidade > 1) quantidade -= 1;
    atualizar();
  });

  form.addEventListener('change', () => {
    // A miniatura acompanha o sabor escolhido (quando há foto desse sabor).
    const saborEscolhido = form.querySelector('input[name="sabor"]:checked')?.value;
    if (saborEscolhido) fundo.querySelector('[data-midia-modal]').innerHTML = midiaProduto(produto, { carrossel: false, sabor: saborEscolhido });
    mostrarErro('');
    atualizar();
  });
  form.addEventListener('submit', (evento) => evento.preventDefault());

  document.addEventListener('keydown', aoTeclar);
  window.addEventListener('hashchange', fechar);

  atualizar();
  janela.focus();
}
