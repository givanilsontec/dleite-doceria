const test = require('node:test');
const assert = require('node:assert');
const { calcularTaxa, validarPedido, montarItens, totalPedido, ErroValidacao } = require('../src/lib/regras');

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

test('taxa: tabela vazia = 0, bairro achado = valor, fora da tabela = null', () => {
  assert.strictEqual(calcularTaxa([], 'Qualquer'), 0);
  const taxas = [{ bairro: 'Jardim São Paulo', taxa: '6.00' }];
  assert.strictEqual(calcularTaxa(taxas, 'jardim sao paulo'), 6);
  assert.strictEqual(calcularTaxa(taxas, 'Centro'), null);
  assert.strictEqual(calcularTaxa(taxas, null), null);
});

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
