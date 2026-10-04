// Carrinho do cliente. Fica só no navegador (localStorage):
// a API só é chamada quando o cliente confirma o pedido.
//
// Cada LINHA do carrinho é um doce + sabor + adicionais. Dois Bolos de Pote de
// sabores diferentes são duas linhas; dois do mesmo sabor viram uma linha com quantidade 2.

import { CHAVES, lerLocal, gravarLocal } from './storage.js';
import { fotoDoItem, descontoPromo, precoDoSabor } from './ui.js';

export const LIMITE_POR_ITEM = 20;

// Identifica a linha: produto + sabor + adicionais (em ordem fixa).
export function chaveDe(produtoId, sabor, adicionais = []) {
  const ids = adicionais.map((a) => String(a.id ?? a)).sort().join(',');
  return `${produtoId}|${sabor || ''}|${ids}`;
}

function precoUnitario(item) {
  return item.preco_base + item.adicionais.reduce((soma, a) => soma + a.preco, 0);
}

function descontoDe(item) {
  return descontoPromo(item.preco_base, item.quantidade, item.promo_qtd, item.promo_preco);
}

function totalLinha(item) {
  return Math.round((item.quantidade * precoUnitario(item) - descontoDe(item)) * 100) / 100;
}

function itemValido(i) {
  return Boolean(i)
    && typeof i.chave === 'string'
    && i.produto_id != null
    && Number(i.quantidade) > 0
    && Number(i.preco_base) > 0
    && Array.isArray(i.adicionais);
}

function estadoInicial() {
  const salvo = lerLocal(CHAVES.carrinho, null);
  if (salvo && Array.isArray(salvo.itens)) {
    return {
      itens: salvo.itens.filter(itemValido), // carrinhos salvos no formato antigo são descartados
      observacoes: typeof salvo.observacoes === 'string' ? salvo.observacoes : '',
    };
  }
  return { itens: [], observacoes: '' };
}

let estado = estadoInicial();
const ouvintes = new Set();

function salvar({ avisar = true } = {}) {
  gravarLocal(CHAVES.carrinho, estado);
  if (avisar) ouvintes.forEach((fn) => fn());
}

function encontrar(chave) {
  return estado.itens.find((i) => i.chave === chave);
}

// Cópia pronta para exibir, já com o preço unitário (base + adicionais).
function paraExibir(item) {
  return { ...item, adicionais: item.adicionais.map((a) => ({ ...a })), preco_unitario: precoUnitario(item), desconto: descontoDe(item), total_linha: totalLinha(item) };
}

export const carrinho = {
  get itens() {
    return estado.itens.map(paraExibir);
  },

  get observacoes() {
    return estado.observacoes;
  },

  // Quantos deste doce há no carrinho, somando todos os sabores.
  quantidadeDe(produtoId) {
    return estado.itens
      .filter((i) => String(i.produto_id) === String(produtoId))
      .reduce((soma, i) => soma + i.quantidade, 0);
  },

  quantidadeDaChave(chave) {
    return encontrar(chave)?.quantidade ?? 0;
  },

  totalItens() {
    return estado.itens.reduce((soma, i) => soma + i.quantidade, 0);
  },

  totalValor() {
    return estado.itens.reduce((soma, i) => soma + totalLinha(i), 0);
  },

  // Produto sem preço não entra no carrinho.
  adicionar(produto, { sabor = null, adicionais = [], quantidade = 1 } = {}) {
    if (!(Number(produto.preco) > 0)) return false;

    const ads = adicionais.map((a) => ({ id: a.id, nome: a.nome, preco: Number(a.preco) || 0 }));
    const chave = chaveDe(produto.id, sabor, ads);
    const existente = encontrar(chave);

    if (existente) {
      existente.quantidade = Math.min(existente.quantidade + quantidade, LIMITE_POR_ITEM);
    } else {
      estado.itens.push({
        chave,
        produto_id: produto.id,
        nome: produto.nome,
        categoria: produto.categoria,
        imagem_url: fotoDoItem(produto, sabor),
        promo_qtd: produto.promo_qtd || null,
        promo_preco: produto.promo_preco || null,
        sabor: sabor || null,
        adicionais: ads,
        preco_base: Number(precoDoSabor(produto, sabor)),
        quantidade: Math.min(quantidade, LIMITE_POR_ITEM),
      });
    }
    salvar();
    return true;
  },

  alterar(chave, delta) {
    const item = encontrar(chave);
    if (!item) return;
    item.quantidade = Math.min(item.quantidade + delta, LIMITE_POR_ITEM);
    if (item.quantidade <= 0) estado.itens = estado.itens.filter((i) => i !== item);
    salvar();
  },

  remover(chave) {
    estado.itens = estado.itens.filter((i) => i.chave !== chave);
    salvar();
  },

  // Não avisa os ouvintes para não redesenhar a tela a cada tecla digitada.
  definirObservacoes(texto) {
    estado.observacoes = String(texto).slice(0, 500);
    salvar({ avisar: false });
  },

  // Confere o carrinho com o cardápio mais recente: atualiza nome e preços e tira
  // o que saiu do cardápio, perdeu o preço ou teve o sabor/adicional removido.
  // Retorna quantas linhas foram removidas.
  sincronizar(produtos) {
    const porId = new Map(produtos.map((p) => [String(p.id), p]));
    const antes = estado.itens.length;
    let mudou = false;

    estado.itens = estado.itens.filter((item) => {
      const produto = porId.get(String(item.produto_id));
      if (!produto || produto.preco === null) return false;
      if (item.sabor && !produto.sabores.includes(item.sabor)) return false;

      for (const ad of item.adicionais) {
        const atual = produto.adicionais.find((a) => String(a.id) === String(ad.id));
        if (!atual) return false;
        if (atual.preco !== ad.preco || atual.nome !== ad.nome) {
          ad.preco = atual.preco;
          ad.nome = atual.nome;
          mudou = true;
        }
      }

      if (precoDoSabor(produto, item.sabor) !== item.preco_base || produto.nome !== item.nome || produto.categoria !== item.categoria
        || fotoDoItem(produto, item.sabor) !== (item.imagem_url || null)
        || (produto.promo_qtd || null) !== (item.promo_qtd || null) || (produto.promo_preco || null) !== (item.promo_preco || null)) {
        item.preco_base = precoDoSabor(produto, item.sabor);
        item.nome = produto.nome;
        item.categoria = produto.categoria;
        item.imagem_url = fotoDoItem(produto, item.sabor);
        item.promo_qtd = produto.promo_qtd || null;
        item.promo_preco = produto.promo_preco || null;
        mudou = true;
      }
      return true;
    });

    const removidos = antes - estado.itens.length;
    if (removidos > 0 || mudou) salvar();
    return removidos;
  },

  limpar() {
    estado = { itens: [], observacoes: '' };
    salvar();
  },

  assinar(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
  },
};
