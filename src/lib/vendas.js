// Resumo de vendas para o painel (puro, sem banco: recebe os pedidos já lidos e devolve os números).
// Conta só pedidos aceitos pela doceria: "Novo" ainda não confirmado e "Cancelado" ficam de fora.

const FUSO = 'America/Recife';
const PERIODOS = [7, 30, 90];
const STATUS_FORA = ['recebido', 'cancelado'];

const centavos = (v) => Math.round(Number(v) * 100);

// '2026-10-05' no horário de Recife.
function diaNoFuso(data) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(data));
}

// Lista dos últimos `dias` dias (o mais antigo primeiro), terminando hoje.
function diasDoPeriodo(dias, agora = new Date()) {
  const hoje = diaNoFuso(agora);
  const base = new Date(`${hoje}T12:00:00Z`); // meio-dia evita pular dia por fuso
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - (dias - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

function valorItem(i) {
  return centavos(i.preco_unitario) * Number(i.quantidade) - centavos(i.desconto || 0);
}

// pedidos: [{ status, criado_em, taxa_entrega, itens: [{ nome, quantidade, preco_unitario, desconto }] }]
function resumoVendas(pedidos, { dias = 30, agora = new Date() } = {}) {
  const lista = diasDoPeriodo(dias, agora);
  const hoje = lista[lista.length - 1];
  const porDia = new Map(lista.map((d) => [d, { dia: d, faturamento: 0, pedidos: 0 }]));
  const porProduto = new Map();

  for (const p of pedidos) {
    if (STATUS_FORA.includes(p.status)) continue;
    const dia = porDia.get(diaNoFuso(p.criado_em));
    if (!dia) continue; // fora do período
    const totalItens = (p.itens || []).reduce((s, i) => s + valorItem(i), 0);
    dia.faturamento += totalItens + centavos(p.taxa_entrega || 0);
    dia.pedidos += 1;
    for (const i of p.itens || []) {
      const prod = porProduto.get(i.nome) || { nome: i.nome, quantidade: 0, faturamento: 0 };
      prod.quantidade += Number(i.quantidade);
      prod.faturamento += valorItem(i);
      porProduto.set(i.nome, prod);
    }
  }

  const serie = [...porDia.values()];
  const total = serie.reduce((s, d) => s + d.faturamento, 0);
  const totalPedidos = serie.reduce((s, d) => s + d.pedidos, 0);
  const comVenda = serie.filter((d) => d.pedidos > 0);
  const melhor = comVenda.reduce((m, d) => (!m || d.faturamento > m.faturamento ? d : m), null);
  const pior = comVenda.reduce((m, d) => (!m || d.faturamento < m.faturamento ? d : m), null);
  const reais = (c) => c / 100;

  return {
    dias,
    hoje: { faturamento: reais(porDia.get(hoje).faturamento), pedidos: porDia.get(hoje).pedidos },
    periodo: {
      faturamento: reais(total),
      pedidos: totalPedidos,
      media_por_dia: reais(Math.round(total / dias)),
      ticket_medio: totalPedidos ? reais(Math.round(total / totalPedidos)) : 0,
      melhor_dia: melhor ? { dia: melhor.dia, faturamento: reais(melhor.faturamento) } : null,
      pior_dia: pior ? { dia: pior.dia, faturamento: reais(pior.faturamento) } : null,
    },
    por_dia: serie.map((d) => ({ ...d, faturamento: reais(d.faturamento) })),
    // Ordem alfabética fixa: a cor de cada doce no gráfico não muda quando muda o período.
    por_produto: [...porProduto.values()]
      .map((p) => ({ ...p, faturamento: reais(p.faturamento) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}

module.exports = { PERIODOS, resumoVendas, diaNoFuso, diasDoPeriodo };
