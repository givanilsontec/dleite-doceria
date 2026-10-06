const test = require('node:test');
const assert = require('node:assert');
const { validarPedido, montarItens, totalPedido, ErroValidacao } = require('../src/lib/regras');

const P1 = '11111111-1111-4111-8111-111111111111';
const AD = '22222222-2222-4222-8222-222222222222';

const base = () => ({
  cliente_nome: 'Maria', cliente_whatsapp: '(81) 99999-8888', endereco_rua: 'Rua Teste, 10', endereco_bairro: 'Centro',
  forma_pagamento: 'pix', itens: [{ produto_id: P1, quantidade: 2, sabor: 'Chocotudo', adicionais: [AD] }],
});

const catalogo = () => new Map([[P1, {
  nome: 'Bolo de Pote', preco: 12, sabores: ['Chocotudo', 'Prestígio'],
  adicionais: [{ id: AD, nome: 'Nutella', preco: 2.1 }],
}]]);

test('pedido válido passa e limpa o telefone', () => {
  assert.strictEqual(validarPedido(base()).cliente_whatsapp, '81999998888');
});

test('rejeita pagamento, quantidade e id inválidos', () => {
  assert.throws(() => validarPedido({ ...base(), forma_pagamento: 'fiado' }), ErroValidacao);
  const q = base(); q.itens[0].quantidade = 0;
  assert.throws(() => validarPedido(q), ErroValidacao);
  const id = base(); id.itens[0].produto_id = 'abc';
  assert.throws(() => validarPedido(id), ErroValidacao);
  assert.throws(() => validarPedido({ ...base(), itens: [] }), ErroValidacao);
});

test('preço vem do catálogo e soma adicionais sem erro de ponto flutuante', () => {
  const itens = montarItens(validarPedido(base()).itens, catalogo());
  assert.strictEqual(itens[0].preco_unitario, 14.1);
  assert.strictEqual(totalPedido(itens, 6), 34.2);
  assert.strictEqual(totalPedido(itens, null), 28.2);
});

test('rejeita sabor fora da lista e adicional de outro produto', () => {
  const s = base(); s.itens[0].sabor = 'Uva';
  assert.throws(() => montarItens(validarPedido(s).itens, catalogo()), ErroValidacao);
  const a = base(); a.itens[0].adicionais = ['33333333-3333-4333-8333-333333333333'];
  assert.throws(() => montarItens(validarPedido(a).itens, catalogo()), ErroValidacao);
});

test('recusa produto sem preço', () => {
  const c = catalogo(); c.get(P1).preco = 0;
  assert.throws(() => montarItens(validarPedido(base()).itens, c), ErroValidacao);
});

test('promoção: 2 pudins por 12 (preço 7), grupos por quantidade e total do pedido', () => {
  const { calcularDesconto } = require('../src/lib/regras');
  assert.strictEqual(calcularDesconto(7, 1, 2, 12), 0);
  assert.strictEqual(calcularDesconto(7, 2, 2, 12), 2);
  assert.strictEqual(calcularDesconto(7, 3, 2, 12), 2);
  assert.strictEqual(calcularDesconto(7, 5, 2, 12), 4);
  assert.strictEqual(calcularDesconto(7, 4, null, null), 0);
  const c = catalogo();
  c.set(P1, { nome: 'Pudim', preco: 7, sabores: [], promo_qtd: 2, promo_preco: 12, adicionais: [] });
  const itens = montarItens([{ produto_id: P1, quantidade: 3, sabor: null, adicionais: [] }], c);
  assert.strictEqual(itens[0].desconto, 2);
  assert.strictEqual(totalPedido(itens, 0), 19); // 12 + 7
});

test('preço por sabor: Ninho custa 10 e Chocotudo 8 no mesmo produto', () => {
  const c = catalogo();
  c.set(P1, { nome: 'Bolo no Pote', preco: 8, sabores: ['Chocotudo', 'Ninho'], precos_sabor: { Ninho: 10 }, adicionais: [] });
  const preco = (sabor) => montarItens([{ produto_id: P1, quantidade: 2, sabor, adicionais: [] }], c)[0].preco_unitario;
  assert.strictEqual(preco('Chocotudo'), 8);
  assert.strictEqual(preco('Ninho'), 10);
});

test('produto do painel: sabores, preço por sabor, esgotado e promoção', () => {
  const { validarProduto } = require('../src/lib/regras');
  const p = validarProduto({
    nome: ' Bolo no Pote ', categoria: 'Bolo de Pote', preco: '8,00', disponivel: true,
    sabores: [{ nome: 'Chocotudo', preco: '', esgotado: false }, { nome: 'Ninho', preco: '10,50', esgotado: true }],
    promo_qtd: '', promo_preco: '',
  });
  assert.strictEqual(p.nome, 'Bolo no Pote');
  assert.strictEqual(p.preco, 8);
  assert.deepStrictEqual(p.sabores, ['Chocotudo', 'Ninho']);
  assert.deepStrictEqual(p.precos_sabor, { Ninho: 10.5 });
  assert.deepStrictEqual(p.sabores_esgotados, ['Ninho']);
  assert.strictEqual(p.promo_qtd, null);

  const promo = validarProduto({ nome: 'Pudim', categoria: 'Pudim', preco: 7, disponivel: true, promo_qtd: 2, promo_preco: 12 });
  assert.strictEqual(promo.promo_preco, 12);

  assert.throws(() => validarProduto({ nome: '', categoria: 'x', preco: 1, disponivel: true }), ErroValidacao);
  assert.throws(() => validarProduto({ nome: 'A', categoria: 'x', preco: -1, disponivel: true }), ErroValidacao);
  assert.throws(() => validarProduto({ nome: 'A', categoria: 'x', preco: 1, disponivel: true, promo_qtd: 2 }), ErroValidacao);
  assert.throws(() => validarProduto({ nome: 'A', categoria: 'x', preco: 1, disponivel: true, sabores: [{ nome: 'Uva' }, { nome: 'uva' }] }), ErroValidacao);
});

test('loja: pausa, horário no fuso de Recife e próxima abertura', () => {
  const { estadoLoja, validarConfigLoja, agoraNoFuso } = require('../src/lib/loja');
  // 2026-10-05 é segunda-feira. 18:00 UTC = 15:00 em Recife.
  const seg15h = new Date('2026-10-05T18:00:00Z');
  assert.deepStrictEqual(agoraNoFuso(seg15h), { dia: 1, minuto: 15 * 60 });

  assert.strictEqual(estadoLoja(null).aberta, true); // sem configuração: aberta como antes
  assert.strictEqual(estadoLoja({ pausado: true }, seg15h).motivo, 'pausado');

  const horario = { usar_horario: true, horarios: { 1: { abre: '14:00', fecha: '20:00' }, 2: { abre: '14:00', fecha: '20:00' } } };
  assert.strictEqual(estadoLoja(horario, seg15h).aberta, true);
  const seg13h = new Date('2026-10-05T16:00:00Z');
  assert.match(estadoLoja(horario, seg13h).aviso, /hoje às 14:00/);
  const seg21h = new Date('2026-10-06T00:00:00Z');
  assert.match(estadoLoja(horario, seg21h).aviso, /amanhã às 14:00/);
  const ter21h = new Date('2026-10-07T00:00:00Z');
  assert.match(estadoLoja(horario, ter21h).aviso, /segunda às 14:00/);

  const base = { pausado: false, usar_horario: false, aceita_entrega: true, aceita_retirada: false };
  assert.throws(() => validarConfigLoja({ ...base, aceita_entrega: false }), ErroValidacao);
  assert.throws(() => validarConfigLoja({ ...base, usar_horario: true, horarios: { 1: { abre: '20:00', fecha: '14:00' } } }), ErroValidacao);
  assert.throws(() => validarConfigLoja({ ...base, aceita_retirada: true, endereco_retirada: '' }), ErroValidacao);
  assert.strictEqual(validarConfigLoja({ ...base, horarios: { 1: { abre: '09:00', fecha: '18:00' } } }).horarios[1].fecha, '18:00');
});

test('retirada não exige nem guarda endereço', () => {
  const p = validarPedido({ ...base(), tipo_entrega: 'retirada', endereco_rua: '' });
  assert.strictEqual(p.tipo_entrega, 'retirada');
  assert.strictEqual(p.endereco_rua, null);
  assert.throws(() => validarPedido({ ...base(), endereco_rua: '' }), ErroValidacao);
  assert.throws(() => validarPedido({ ...base(), tipo_entrega: 'drone' }), ErroValidacao);
});

test('entrega exige bairro; retirada não', () => {
  assert.throws(() => validarPedido({ ...base(), endereco_bairro: '' }), /bairro/);
  assert.throws(() => validarPedido({ ...base(), endereco_bairro: '  ' }), ErroValidacao);
  assert.strictEqual(validarPedido({ ...base(), tipo_entrega: 'retirada', endereco_bairro: '' }).endereco_bairro, null);
});

test('resumo de vendas: soma por dia no fuso de Recife e por produto, ignorando novos e cancelados', () => {
  const { resumoVendas } = require('../src/lib/vendas');
  const agora = new Date('2026-10-05T15:00:00Z'); // 12:00 em Recife, segunda
  const item = (nome, quantidade, preco, desconto = 0) => ({ nome, quantidade, preco_unitario: preco, desconto });
  const pedidos = [
    { status: 'entregue', criado_em: '2026-10-05T13:00:00Z', taxa_entrega: 0, itens: [item('Pudim', 2, 7, 2)] }, // 12
    { status: 'confirmado', criado_em: '2026-10-05T14:00:00Z', taxa_entrega: 0, itens: [item('Brownie', 1, 5)] }, // 5
    { status: 'recebido', criado_em: '2026-10-05T14:30:00Z', taxa_entrega: 0, itens: [item('Brownie', 9, 5)] }, // não conta
    { status: 'cancelado', criado_em: '2026-10-04T14:30:00Z', taxa_entrega: 0, itens: [item('Pudim', 9, 7)] }, // não conta
    // 02:00 UTC do dia 05 = 23:00 do dia 04 em Recife
    { status: 'entregue', criado_em: '2026-10-05T02:00:00Z', taxa_entrega: 0, itens: [item('Bolo no Pote', 3, 8)] }, // 24
    { status: 'entregue', criado_em: '2026-09-01T12:00:00Z', taxa_entrega: 0, itens: [item('Pudim', 1, 7)] }, // fora do período
  ];
  const r = resumoVendas(pedidos, { dias: 7, agora });
  assert.strictEqual(r.por_dia.length, 7);
  assert.strictEqual(r.por_dia[6].dia, '2026-10-05');
  assert.deepStrictEqual(r.hoje, { faturamento: 17, pedidos: 2 });
  assert.strictEqual(r.por_dia[5].faturamento, 24); // dia 04 em Recife
  assert.strictEqual(r.periodo.faturamento, 41);
  assert.strictEqual(r.periodo.pedidos, 3);
  assert.deepStrictEqual(r.periodo.melhor_dia, { dia: '2026-10-04', faturamento: 24 });
  assert.deepStrictEqual(r.por_produto.map((p) => [p.nome, p.quantidade]), [['Bolo no Pote', 3], ['Brownie', 1], ['Pudim', 2]]);
});

test('foto do painel: vira JPG 1200x900 com a imagem inteira; arquivo inválido é recusado', async () => {
  const sharp = require('sharp');
  const { prepararFoto, ErroFoto } = require('../src/lib/fotos');
  // foto bem comprida (3:1) em PNG transparente
  const png = await sharp({ create: { width: 1500, height: 500, channels: 4, background: { r: 120, g: 40, b: 60, alpha: 1 } } }).png().toBuffer();
  const saida = await prepararFoto(png);
  const info = await sharp(saida).metadata();
  assert.strictEqual(info.format, 'jpeg');
  assert.deepStrictEqual([info.width, info.height], [1200, 900]);
  // foto inteira: o topo tem a margem creme (não foi cortada para preencher)
  const { data } = await sharp(saida).extract({ left: 600, top: 5, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 240 && data[1] > 240, 'margem creme no topo');
  await assert.rejects(prepararFoto(Buffer.from('isto não é uma imagem')), ErroFoto);
  await assert.rejects(prepararFoto(Buffer.alloc(0)), ErroFoto);
});

test('taxa de entrega: bairros de Carpina, valor fixo por cidade e "a combinar"', () => {
  const { montarConfigEntrega, calcularTaxaEntrega, validarTaxaEntrega } = require('../src/lib/entrega');
  const vazio = montarConfigEntrega([]);
  assert.strictEqual(calcularTaxaEntrega(vazio, { cidade: 'Carpina', bairro: 'Centro' }), 0); // nada cadastrado: grátis

  const cfg = montarConfigEntrega([
    { id: '1', cidade: 'Carpina', bairro: 'Centro', taxa: '5.00' },
    { id: '2', cidade: 'Carpina', bairro: 'São José', taxa: '0' },
    { id: '3', cidade: 'Paudalho', bairro: null, taxa: '15.00' },
  ]);
  assert.deepStrictEqual(cfg.bairros.map((b) => b.bairro), ['Centro', 'São José']);
  assert.deepStrictEqual(cfg.cidades.map((c) => c.cidade), ['Paudalho']);
  assert.strictEqual(calcularTaxaEntrega(cfg, { cidade: 'carpina', bairro: ' centro ' }), 5);
  assert.strictEqual(calcularTaxaEntrega(cfg, { cidade: null, bairro: 'Sao Jose' }), 0); // sem cidade = Carpina; sem acento ok
  assert.strictEqual(calcularTaxaEntrega(cfg, { cidade: 'Carpina', bairro: 'Bairro Novo' }), null); // fora da lista: a combinar
  assert.strictEqual(calcularTaxaEntrega(cfg, { cidade: 'Paudalho', bairro: 'Qualquer' }), 15);
  assert.strictEqual(calcularTaxaEntrega(cfg, { cidade: 'Recife', bairro: 'Boa Viagem' }), null); // cidade fora da lista

  assert.deepStrictEqual(validarTaxaEntrega({ tipo: 'bairro', bairro: '  Centro ', taxa: '5,50' }), { cidade: 'Carpina', bairro: 'Centro', taxa: 5.5 });
  assert.deepStrictEqual(validarTaxaEntrega({ tipo: 'cidade', cidade: 'Tracunhaém', taxa: 20 }), { cidade: 'Tracunhaém', bairro: null, taxa: 20 });
  assert.throws(() => validarTaxaEntrega({ tipo: 'cidade', cidade: 'Carpina', taxa: 5 }), ErroValidacao);
  assert.throws(() => validarTaxaEntrega({ tipo: 'bairro', bairro: 'Centro', taxa: -1 }), ErroValidacao);
  assert.throws(() => validarTaxaEntrega({ tipo: 'bairro', bairro: 'Centro', taxa: '' }), ErroValidacao);
  assert.throws(() => validarTaxaEntrega({ tipo: 'bairro', bairro: 'C', taxa: 1 }), ErroValidacao);
});
