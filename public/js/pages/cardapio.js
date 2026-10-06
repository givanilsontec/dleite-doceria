import { listarProdutos } from '../api.js';
import { loja } from '../loja.js';
import { carrinho, chaveDe, LIMITE_POR_ITEM } from '../cart.js';
import { abrirModalProduto } from '../modal.js';
import { ligarCarrosseis } from '../carrossel.js';
import { esc, dinheiro, icone, midiaProduto, classeCategoria, textoPromo, precoVaria, precoMinimo, estadoHTML, toast } from '../ui.js';

const ORDEM_CATEGORIAS = ['Pudim', 'Bolo de Pote', 'Brownie', 'Bombom de Brownie', 'Mousse'];

function posicaoCategoria(categoria) {
  const i = ORDEM_CATEGORIAS.indexOf(categoria);
  return i === -1 ? ORDEM_CATEGORIAS.length : i;
}

// Doce com sabores ou adicionais abre a janela de escolha; os outros entram direto no pedido.
function precisaEscolher(produto) {
  return produto.sabores.length > 0 || produto.adicionais.length > 0;
}

function controleHTML(produto) {
  if (produto.preco === null) return '';
  // Loja fechada: só para olhar. Nada de "+" ou "Escolher".
  if (!loja.aberta) return '<span class="selo-fechado">Fechado agora</span>';

  if (precisaEscolher(produto)) {
    const qtd = carrinho.quantidadeDe(produto.id);
    return `<button type="button" class="botao botao-secundario botao-escolher" data-acao="escolher" data-id="${esc(produto.id)}"
      aria-label="Escolher opções de ${esc(produto.nome)}${qtd ? `, ${qtd} no pedido` : ''}">
      ${qtd ? `<span class="escolher-qtd">${qtd}</span>` : ''}Escolher
    </button>`;
  }

  const chave = chaveDe(produto.id, null, []);
  const qtd = carrinho.quantidadeDaChave(chave);
  if (qtd > 0) {
    return `<div class="stepper" role="group" aria-label="Quantidade de ${esc(produto.nome)}">
      <button type="button" data-acao="menos" data-chave="${esc(chave)}" aria-label="Diminuir">${icone('menos')}</button>
      <span class="stepper-qtd">${qtd}</span>
      <button type="button" data-acao="mais" data-chave="${esc(chave)}" aria-label="Aumentar" ${qtd >= LIMITE_POR_ITEM ? 'disabled' : ''}>${icone('mais')}</button>
    </div>`;
  }
  return `<button class="botao-adicionar" type="button" data-acao="adicionar" data-id="${esc(produto.id)}" aria-label="Adicionar ${esc(produto.nome)} ao pedido">${icone('mais')}</button>`;
}

function cardHTML(produto) {
  const nSabores = produto.sabores.length;
  const texto = produto.descricao || (nSabores ? `${nSabores} sabores: ${produto.sabores.join(', ')}` : '');
  return `<article class="produto">
    <div class="produto-imagem ${classeCategoria(produto.categoria)}">${midiaProduto(produto)}</div>
    <div class="produto-corpo">
      <h2 class="produto-nome">${esc(produto.nome)}</h2>
      ${texto ? `<p class="produto-descricao">${esc(texto)}</p>` : ''}
      ${produto.preco !== null && textoPromo(produto) ? `<span class="selo-promo">Promoção: ${textoPromo(produto)}</span>` : ''}
      <div class="produto-rodape">
        ${produto.preco !== null
          ? `<span class="preco">${precoVaria(produto) ? '<span class="preco-prefixo">a partir de</span> ' : ''}${dinheiro(precoMinimo(produto))}</span>`
          : '<span class="selo-breve">Preço em breve</span>'}
        <div class="produto-controle" data-controle="${esc(produto.id)}">${controleHTML(produto)}</div>
      </div>
    </div>
  </article>`;
}

function esqueletos(quantidade) {
  return Array.from({ length: quantidade }, () => `
    <div class="esqueleto" aria-hidden="true">
      <div class="esqueleto-img"></div>
      <div class="esqueleto-linha"></div>
      <div class="esqueleto-linha curta"></div>
    </div>`).join('');
}

export function render({ el }) {
  let produtos = [];
  let filtro = 'Todos';
  let ativo = true;

  el.innerHTML = `
    <div class="pagina">
      <div class="aviso aviso-erro aviso-loja" data-aviso-loja role="status" hidden></div>
      <section class="intro">
        <h1 class="titulo-pagina">Escolha seus doces</h1>
        <p class="texto-apoio">Monte o pedido por aqui e envie pelo WhatsApp para a doceria confirmar.</p>
      </section>
      <div class="chips" data-chips role="group" aria-label="Filtrar por categoria"></div>
      <div class="grade-produtos" data-grade aria-busy="true">${esqueletos(4)}</div>
    </div>`;

  const carrosseis = ligarCarrosseis(el);
  const chips = el.querySelector('[data-chips]');
  const grade = el.querySelector('[data-grade]');

  function desenharChips() {
    const categorias = [...new Set(produtos.map((p) => p.categoria))]
      .sort((a, b) => posicaoCategoria(a) - posicaoCategoria(b) || a.localeCompare(b, 'pt-BR'));
    chips.hidden = categorias.length < 2;
    chips.innerHTML = ['Todos', ...categorias]
      .map((c) => `<button type="button" class="chip" data-acao="filtrar" data-categoria="${esc(c)}" aria-pressed="${c === filtro}">${esc(c)}</button>`)
      .join('');
  }

  function desenharGrade() {
    grade.setAttribute('aria-busy', 'false');
    if (produtos.length === 0) {
      grade.innerHTML = estadoHTML({
        titulo: 'Nenhum doce disponível agora',
        texto: 'O cardápio está sendo atualizado. Volte daqui a pouco.',
      });
      return;
    }
    const lista = (filtro === 'Todos' ? produtos : produtos.filter((p) => p.categoria === filtro))
      .map((p, i) => ({ p, i }))
      .sort((a, b) => posicaoCategoria(a.p.categoria) - posicaoCategoria(b.p.categoria) || a.i - b.i)
      .map(({ p }) => p);
    grade.innerHTML = lista.map(cardHTML).join('');
    carrosseis.iniciar();
  }

  function atualizarControles() {
    const porId = new Map(produtos.map((p) => [String(p.id), p]));
    el.querySelectorAll('[data-controle]').forEach((controle) => {
      const produto = porId.get(controle.dataset.controle);
      if (produto) controle.innerHTML = controleHTML(produto);
    });
  }

  function focarControle(produtoId, seletor) {
    const controle = [...el.querySelectorAll('[data-controle]')].find((c) => c.dataset.controle === String(produtoId));
    controle?.querySelector(seletor)?.focus();
  }

  async function carregar() {
    grade.setAttribute('aria-busy', 'true');
    grade.innerHTML = esqueletos(4);
    try {
      produtos = await listarProdutos();
      if (!ativo) return;
      const removidos = carrinho.sincronizar(produtos);
      if (removidos > 0) toast('Alguns doces mudaram no cardápio e foram tirados do pedido', 'erro');
      desenharChips();
      desenharGrade();
    } catch (erro) {
      if (!ativo) return;
      grade.setAttribute('aria-busy', 'false');
      grade.innerHTML = estadoHTML({
        titulo: 'Não deu para carregar o cardápio',
        texto: esc(erro.message),
        acao: '<button type="button" class="botao botao-primario" data-acao="recarregar">Tentar de novo</button>',
      });
    }
  }

  el.addEventListener('click', (evento) => {
    const alvo = evento.target.closest('[data-acao]');
    if (!alvo || !el.contains(alvo)) return;
    const { acao, id, chave } = alvo.dataset;

    if (acao === 'recarregar') {
      carregar();
      return;
    }

    if (acao === 'filtrar') {
      filtro = alvo.dataset.categoria;
      desenharChips();
      desenharGrade();
      [...chips.querySelectorAll('.chip')].find((c) => c.dataset.categoria === filtro)?.focus();
      return;
    }

    // Com a loja fechada, nenhum botão de pedir funciona (proteção extra além de escondê-los).
    if (!loja.aberta && ['escolher', 'adicionar', 'mais'].includes(acao)) {
      toast(loja.aviso, 'erro');
      return;
    }

    if (acao === 'escolher') {
      const produto = produtos.find((p) => String(p.id) === id);
      if (!produto) return;
      abrirModalProduto(produto, {
        aoAdicionar: (escolha) => {
          if (!loja.aberta) { toast(loja.aviso, 'erro'); return; } // fechou com a janela aberta
          if (carrinho.adicionar(produto, escolha)) toast('Adicionado ao pedido');
        },
        // O botão foi redesenhado ao adicionar: devolve o foco ao novo botão.
        aoFechar: () => focarControle(produto.id, '[data-acao="escolher"]'),
      });
      return;
    }

    if (acao === 'adicionar') {
      const produto = produtos.find((p) => String(p.id) === id);
      if (produto && carrinho.adicionar(produto)) {
        toast('Adicionado ao pedido');
        focarControle(produto.id, '[data-acao="mais"]');
      }
      return;
    }

    if (acao === 'mais' || acao === 'menos') {
      const produtoId = chave.split('|')[0];
      carrinho.alterar(chave, acao === 'mais' ? 1 : -1);
      focarControle(produtoId, carrinho.quantidadeDaChave(chave) > 0 ? `[data-acao="${acao}"]` : '[data-acao="adicionar"]');
    }
  });

  const cancelarAssinatura = carrinho.assinar(atualizarControles);
  carregar();
  // Aviso no topo + cardápio acinzentado enquanto a loja estiver fechada; volta sozinho quando abrir.
  const cancelarLoja = loja.assinar((estado) => {
    if (!ativo) return;
    const fechada = estado.aberta === false;
    const aviso = el.querySelector('[data-aviso-loja]');
    aviso.textContent = fechada ? `${loja.aviso} Você pode ver o cardápio, mas os pedidos estão pausados.` : '';
    aviso.hidden = !fechada;
    grade.classList.toggle('loja-fechada', fechada);
    atualizarControles();
  });

  return () => {
    ativo = false;
    cancelarAssinatura();
    cancelarLoja();
  };
}
