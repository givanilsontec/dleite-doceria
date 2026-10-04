import { carrinho, LIMITE_POR_ITEM } from '../cart.js';
import { buscarLoja } from '../api.js';
import { esc, dinheiro, icone, ilustracao, midiaProduto, classeCategoria, metaItemHTML, estadoHTML } from '../ui.js';

function itemHTML(item) {
  return `<article class="item-carrinho">
    <div class="item-thumb ${classeCategoria(item.categoria)}">${midiaProduto(item)}</div>
    <div class="item-info">
      <h2 class="item-nome">${esc(item.nome)}</h2>
      ${metaItemHTML(item)}
      <p class="item-unit">${dinheiro(item.preco_unitario)} cada</p>
      ${item.desconto > 0 ? `<p class="item-promo">Promoção: -${dinheiro(item.desconto)}</p>` : ''}
    </div>
    <button type="button" class="botao-remover" data-acao="remover" data-chave="${esc(item.chave)}" aria-label="Tirar ${esc(item.nome)} do pedido">${icone('fechar')}</button>
    <div class="item-acoes">
      <div class="stepper" role="group" aria-label="Quantidade de ${esc(item.nome)}">
        <button type="button" data-acao="menos" data-chave="${esc(item.chave)}" aria-label="Diminuir">${icone('menos')}</button>
        <span class="stepper-qtd">${item.quantidade}</span>
        <button type="button" data-acao="mais" data-chave="${esc(item.chave)}" aria-label="Aumentar" ${item.quantidade >= LIMITE_POR_ITEM ? 'disabled' : ''}>${icone('mais')}</button>
      </div>
      <span class="item-subtotal">${dinheiro(item.total_linha)}</span>
    </div>
  </article>`;
}

const VAZIO = estadoHTML({
  titulo: 'Seu pedido está vazio',
  texto: 'Escolha alguns doces no cardápio para começar.',
  acao: '<a class="botao botao-primario" href="#/">Ver cardápio</a>',
  categoria: 'bolo-de-pote',
});

export function render({ el, navegar }) {
  el.innerHTML = '<div class="pagina pagina-estreita" data-conteudo></div>';
  let avisoLoja = '';
  let ativo = true;
  buscarLoja()
    .then((loja) => {
      if (!ativo || loja.aberta) return;
      avisoLoja = `${loja.aviso} Os pedidos estão pausados.`;
      const aviso = el.querySelector('[data-aviso-loja]');
      if (aviso) { aviso.textContent = avisoLoja; aviso.hidden = false; }
    })
    .catch(() => {});
  const conteudo = el.querySelector('[data-conteudo]');

  function montarEstrutura() {
    conteudo.innerHTML = `
      <div class="aviso aviso-erro aviso-loja" data-aviso-loja role="status" ${avisoLoja ? '' : 'hidden'}>${esc(avisoLoja)}</div>
      <h1 class="titulo-pagina">Seu pedido</h1>
      <p class="texto-apoio">Confira os doces, ajuste as quantidades e siga para a entrega.</p>
      <div class="pilha espaco-topo">
        <div class="lista-itens" data-lista></div>
        <a class="botao botao-secundario botao-bloco" href="#/">${icone('mais')} Adicionar mais doces</a>
        <section class="cartao">
          <label class="cartao-titulo" for="observacoes">Observações</label>
          <textarea id="observacoes" class="entrada" data-obs rows="3" maxlength="500"
            placeholder="Ex.: sem calda extra, embalar para presente, entregar depois das 14h"></textarea>
        </section>
        <section class="cartao" data-resumo aria-live="polite"></section>
        <button type="button" class="botao botao-primario botao-bloco" data-acao="continuar">Continuar para entrega</button>
      </div>`;
    conteudo.querySelector('[data-obs]').value = carrinho.observacoes;
  }

  function desenhar() {
    const itens = carrinho.itens;
    if (itens.length === 0) {
      conteudo.innerHTML = VAZIO;
      return;
    }
    if (!conteudo.querySelector('[data-lista]')) montarEstrutura();

    conteudo.querySelector('[data-lista]').innerHTML = itens.map(itemHTML).join('');

    const quantidade = carrinho.totalItens();
    conteudo.querySelector('[data-resumo]').innerHTML = `
      <h2 class="cartao-titulo">Resumo</h2>
      <div class="resumo-linha">
        <span>Doces (${quantidade} ${quantidade === 1 ? 'item' : 'itens'})</span>
        <span>${dinheiro(carrinho.totalValor())}</span>
      </div>
      <div class="resumo-total">
        <span>Total</span>
        <strong>${dinheiro(carrinho.totalValor())}</strong>
      </div>
      <p class="nota">A taxa de entrega, se houver, aparece na próxima etapa.</p>`;
  }

  el.addEventListener('click', (evento) => {
    const alvo = evento.target.closest('[data-acao]');
    if (!alvo || !el.contains(alvo)) return;
    const { acao, chave } = alvo.dataset;

    if (acao === 'continuar') {
      navegar('/checkout');
      return;
    }
    if (acao === 'mais') carrinho.alterar(chave, 1);
    if (acao === 'menos') carrinho.alterar(chave, -1);
    if (acao === 'remover') carrinho.remover(chave);

    // Devolve o foco ao mesmo botão (ou ao título, se a linha saiu da lista).
    const mesmoBotao = el.querySelector(`[data-acao="${acao}"][data-chave="${CSS.escape(chave)}"]`);
    if (mesmoBotao && !mesmoBotao.disabled) mesmoBotao.focus();
    else el.querySelector('.titulo-pagina, .estado-titulo')?.focus?.();
  });

  el.addEventListener('input', (evento) => {
    if (evento.target.matches('[data-obs]')) carrinho.definirObservacoes(evento.target.value);
  });

  const cancelarAssinatura = carrinho.assinar(desenhar);
  desenhar();

  return () => {
    ativo = false;
    cancelarAssinatura();
  };
}
