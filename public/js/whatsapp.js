// Monta a mensagem do pedido para o WhatsApp da doceria.
// O pedido já está salvo no sistema: a mensagem é um aviso a mais, não o pedido em si.

import { CONFIG } from './config.js';
import { dinheiro, formatarTelefone, linkWhatsApp, rotuloPagamento, precoLinha, subtotalPedido, enderecoCompleto } from './ui.js';

function textoItem(item) {
  const sabor = item.sabor ? ` (${item.sabor})` : '';
  const adicionais = (item.adicionais || []).map((a) => ` + ${a.nome}`).join('');
  const promo = Number(item.desconto) > 0 ? ' (promoção)' : '';
  return `• ${item.quantidade}x ${item.nome}${sabor}${adicionais} - ${dinheiro(precoLinha(item))}${promo}`;
}

export function mensagemPedido(pedido) {
  const linhas = [
    `*Novo pedido ${pedido.codigo}*`,
    '',
    `*Cliente:* ${pedido.cliente_nome}`,
    `*WhatsApp:* ${formatarTelefone(pedido.cliente_whatsapp)}`,
    pedido.tipo_entrega === 'retirada' ? '*Vou retirar na doceria*' : `*Endereço:* ${enderecoCompleto(pedido) || 'não informado'}`,
    '',
    '*Itens*',
    ...pedido.itens.map(textoItem),
  ];

  if (pedido.observacoes) linhas.push('', `*Observações:* ${pedido.observacoes}`);

  linhas.push('', `Doces: ${dinheiro(subtotalPedido(pedido))}`);
  if (pedido.tipo_entrega === 'retirada') linhas.push('Retirada na doceria');
  else if (pedido.taxa_entrega === null) linhas.push('Entrega: a combinar');
  else if (Number(pedido.taxa_entrega) > 0) linhas.push(`Entrega: ${dinheiro(pedido.taxa_entrega)}`);
  else linhas.push('Entrega: grátis');
  linhas.push(`*Total: ${dinheiro(pedido.total)}*`, `Pagamento: ${rotuloPagamento(pedido.forma_pagamento)}`);

  return linhas.join('\n');
}

// null quando o número da doceria ainda não foi configurado em config.js.
export function linkPedidoWhatsApp(pedido) {
  if (!CONFIG.WHATSAPP_DOCERIA) return null;
  return linkWhatsApp(CONFIG.WHATSAPP_DOCERIA, mensagemPedido(pedido));
}

// ---------- Mensagens da doceria para o cliente, conforme o status do pedido ----------

// "Bom dia" / "Boa tarde" / "Boa noite" pelo horário de Recife.
export function saudacao(agora = new Date()) {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Recife', hour: '2-digit', hourCycle: 'h23' }).format(agora));
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// Status em que vale avisar o cliente. "Pronto" só na retirada (na entrega, o aviso é quando sai).
export function statusAvisaCliente(status, tipoEntrega) {
  if (status === 'pronto') return tipoEntrega === 'retirada';
  return ['confirmado', 'producao', 'despachado', 'entregue', 'cancelado'].includes(status);
}

// Texto da mensagem para o status do pedido. enderecoRetirada vem da configuração da loja.
export function mensagemStatus(pedido, { enderecoRetirada = '', agora = new Date() } = {}) {
  const nome = String(pedido.cliente_nome || '').trim().split(/\s+/)[0];
  const ola = `${saudacao(agora)}${nome ? `, ${nome}` : ''}! Aqui é da ${CONFIG.NOME_LOJA}.`;
  const cod = pedido.codigo;
  const retirada = pedido.tipo_entrega === 'retirada';
  const pix = pedido.forma_pagamento === 'pix' ? '\nPara o pagamento via Pix, vamos te enviar a chave em seguida.' : '';

  switch (pedido.status) {
    case 'recebido':
      return `${ola}\nRecebemos seu pedido ${cod}. Já já confirmamos com você!`;
    case 'confirmado':
      return `${ola}\nSeu pedido ${cod} foi aceito! Total: ${dinheiro(pedido.total)}.\nAguarde alguns minutos que já vamos iniciar a produção.${pix}`;
    case 'producao':
      return retirada
        ? `${ola}\nSeu pedido ${cod} está em produção. Avisamos assim que estiver pronto para retirar.`
        : `${ola}\nSeu pedido ${cod} está em produção. Em alguns instantes ele estará saindo para entrega.`;
    case 'pronto':
      return retirada
        ? `${ola}\nSeu pedido ${cod} está pronto! Já pode vir retirar${enderecoRetirada ? `: ${enderecoRetirada}` : ' na doceria'}.`
        : `${ola}\nSeu pedido ${cod} está pronto e logo sai para entrega.`;
    case 'despachado':
      return `${ola}\nSeu pedido ${cod} saiu para entrega!\nSe possível, fique atento ao celular ou em frente à residência para facilitar para o entregador.`;
    case 'entregue':
      return `${ola}\nSeu pedido ${cod} foi entregue. Muito obrigado pela preferência e bom apetite! Esperamos você de novo.`;
    case 'cancelado':
      return `${ola}\nInfelizmente seu pedido ${cod} foi cancelado. Qualquer dúvida, é só responder esta mensagem.`;
    default:
      return `${ola}\nSobre o seu pedido ${cod}:`;
  }
}

// Link do WhatsApp do cliente, já com a mensagem do status.
export function linkAvisoCliente(pedido, opcoes) {
  return linkWhatsApp(pedido.cliente_whatsapp, mensagemStatus(pedido, opcoes));
}
