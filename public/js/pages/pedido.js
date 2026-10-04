// Confirmação do pedido: mostra o resumo e leva o cliente ao WhatsApp da doceria.
// O andamento (preparo, saída para entrega) é combinado direto pelo WhatsApp.

import { buscarPedido } from '../api.js';
import { linkPedidoWhatsApp } from '../whatsapp.js';
import {
  esc, dinheiro, icone, horario, primeiroNome, rotuloPagamento, precoLinha, subtotalPedido,
  metaItemHTML, enderecoCompleto, estadoHTML, carregandoHTML, toast,
} from '../ui.js';

function quandoFoiFeito(iso) {
  const quando = horario(iso);
  if (!quando) return '';
  return quando.startsWith('Hoje') ? `Feito hoje às ${quando.slice(6)}.` : `Feito em ${quando.replace(', ', ' às ')}.`;
}

function textoEntrega(taxa) {
  if (taxa === null) return 'A combinar';
  return Number(taxa) > 0 ? dinheiro(taxa) : 'Grátis';
}

export function render({ el, params, query }) {
  const codigo = params[0];
  const novo = query.get('novo') === '1';
  let ativo = true;
  let pedidoAtual = null;

  el.innerHTML = `<div class="pagina pagina-estreita" data-conteudo>${carregandoHTML('Carregando pedido')}</div>`;
  const conteudo = el.querySelector('[data-conteudo]');

  function desenhar(p) {
    const linkWhats = linkPedidoWhatsApp(p);
    conteudo.innerHTML = `
      ${novo ? `
        <section class="sucesso">
          <div class="sucesso-selo">${icone('check')}</div>
          <h1 class="titulo-pagina">Pedido recebido</h1>
          <p class="texto-apoio centro">Obrigado, ${esc(primeiroNome(p.cliente_nome))}! Envie o pedido no WhatsApp para a doceria confirmar com você.</p>
        </section>` : `
        <h1 class="titulo-pagina">Seu pedido</h1>
        <p class="texto-apoio">${quandoFoiFeito(p.criado_em)}</p>`}

      <div class="codigo-bloco ${novo ? '' : 'esquerda'}">
        <div class="codigo-pedido">
          <span>
            <span class="codigo-rotulo">Código </span>
            <span class="codigo-valor">${esc(p.codigo)}</span>
          </span>
          <button type="button" class="botao-copiar" data-acao="copiar" aria-label="Copiar código do pedido">${icone('copiar')}</button>
        </div>
      </div>

      <div class="pilha espaco-topo">
        ${linkWhats ? `
          <a class="botao botao-menta botao-bloco" href="${esc(linkWhats)}">${icone('whatsapp')} Enviar pedido pelo WhatsApp</a>` : ''}

        <section class="cartao">
          <h2 class="cartao-titulo">Resumo</h2>
          ${p.itens.map((i) => `
            <div class="resumo-item">
              <div class="resumo-item-nome">
                <span>${i.quantidade}x ${esc(i.nome || 'Item')}</span>
                ${metaItemHTML(i)}
              </div>
              <span>${dinheiro(precoLinha(i))}</span>
            </div>`).join('')}
          ${p.observacoes ? `<p class="resumo-obs">${esc(p.observacoes)}</p>` : ''}
          <div class="resumo-linha espaco-topo-sm"><span>Doces</span><span>${dinheiro(subtotalPedido(p))}</span></div>
          ${p.tipo_entrega === 'retirada' ? '<div class="resumo-linha"><span>Retirada na doceria</span><span>Sem taxa</span></div>' : `<div class="resumo-linha"><span>Entrega</span><span>${textoEntrega(p.taxa_entrega)}</span></div>`}
          <div class="resumo-total">
            <span>Total</span>
            <strong>${dinheiro(p.total)}</strong>
          </div>
          <div class="dados-entrega">
            <p class="dado">${icone('local')}<span>${esc(enderecoCompleto(p)) || 'Endereço não informado'}</span></p>
            <p class="dado">${icone('cartao')}<span>${esc(rotuloPagamento(p.forma_pagamento))}</span></p>
          </div>
        </section>

        <a class="botao botao-secundario botao-bloco" href="#/">Voltar ao cardápio</a>
      </div>`;
  }

  async function carregar() {
    try {
      const pedido = await buscarPedido(codigo);
      if (!ativo) return;
      pedidoAtual = pedido;
      desenhar(pedido);
      abrirWhatsAppUmaVez(pedido);
    } catch (erro) {
      if (!ativo) return;
      conteudo.innerHTML = erro.status === 404
        ? estadoHTML({
          titulo: `Pedido ${esc(codigo)}`,
          texto: 'Os detalhes do pedido aparecem só no aparelho e na aba em que ele foi feito. Qualquer dúvida, fale com a doceria pelo WhatsApp.',
          acao: '<a class="botao botao-primario" href="#/">Ver cardápio</a>',
        })
        : estadoHTML({
          titulo: 'Não deu para carregar o pedido',
          texto: esc(erro.message),
          acao: '<button type="button" class="botao botao-primario" data-acao="recarregar">Tentar de novo</button>',
        });
    }
  }

  // Pedido recém-feito: abre o WhatsApp da doceria com a mensagem pronta (uma única vez por pedido).
  // O cliente só precisa apertar "enviar" lá. O botão da tela continua valendo se algo falhar.
  function abrirWhatsAppUmaVez(pedido) {
    if (!novo || !linkPedidoWhatsApp(pedido)) return;
    const marca = `atelier:wa-aberto:${pedido.codigo}`;
    try {
      if (sessionStorage.getItem(marca)) return;
      sessionStorage.setItem(marca, '1');
    } catch {
      return; // sem como lembrar: não redireciona, o botão basta
    }
    setTimeout(() => {
      if (ativo) location.href = linkPedidoWhatsApp(pedido);
    }, 1800);
  }

  el.addEventListener('click', async (evento) => {
    const alvo = evento.target.closest('[data-acao]');
    if (!alvo || !el.contains(alvo)) return;

    if (alvo.dataset.acao === 'recarregar') {
      conteudo.innerHTML = carregandoHTML('Carregando pedido');
      carregar();
    }

    if (alvo.dataset.acao === 'copiar') {
      try {
        await navigator.clipboard.writeText(pedidoAtual?.codigo || codigo);
        toast('Código copiado');
      } catch {
        toast(`Anote o código: ${pedidoAtual?.codigo || codigo}`);
      }
    }
  });

  carregar();

  return () => {
    ativo = false;
  };
}
