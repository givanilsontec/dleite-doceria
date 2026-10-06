// Taxa de entrega: bairros da cidade principal (Carpina) com valor cada um,
// e outras cidades com um valor fixo para a cidade inteira. Funções puras (sem banco), testadas.

const { ErroValidacao, normalizarTexto } = require('./regras');

const CIDADE_PRINCIPAL = 'Carpina';
const TAXA_MAXIMA = 500;

const ehPrincipal = (cidade) => !cidade || normalizarTexto(cidade) === normalizarTexto(CIDADE_PRINCIPAL);

// Linhas do banco ({ id, cidade, bairro, taxa }) -> o que o site precisa.
// Bairro null = valor fixo da cidade inteira (outras cidades).
function montarConfigEntrega(linhas) {
  const porNome = (a, b) => a.localeCompare(b, 'pt-BR');
  const bairros = linhas
    .filter((l) => ehPrincipal(l.cidade) && l.bairro)
    .map((l) => ({ id: l.id, bairro: l.bairro, taxa: Number(l.taxa) }))
    .sort((a, b) => porNome(a.bairro, b.bairro));
  const cidades = linhas
    .filter((l) => !ehPrincipal(l.cidade) && !l.bairro)
    .map((l) => ({ id: l.id, cidade: l.cidade, taxa: Number(l.taxa) }))
    .sort((a, b) => porNome(a.cidade, b.cidade));
  return { cidade_principal: CIDADE_PRINCIPAL, bairros, cidades };
}

// Taxa do pedido. 0 = grátis; número = valor; null = "a combinar" pelo WhatsApp.
// - Nada cadastrado: grátis (como era antes da tela de entrega).
// - Carpina: bairro da lista = valor dele; fora da lista = a combinar; sem bairros cadastrados = grátis.
// - Outra cidade cadastrada = valor fixo; cidade fora da lista = a combinar.
function calcularTaxaEntrega(config, { cidade, bairro }) {
  if (!config.bairros.length && !config.cidades.length) return 0;
  if (ehPrincipal(cidade)) {
    if (!config.bairros.length) return 0;
    const achado = config.bairros.find((b) => normalizarTexto(b.bairro) === normalizarTexto(bairro));
    return achado ? achado.taxa : null;
  }
  const achada = config.cidades.find((c) => normalizarTexto(c.cidade) === normalizarTexto(cidade));
  return achada ? achada.taxa : null;
}

function nomeValido(valor, campo) {
  const t = typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '';
  if (t.length < 2) throw new ErroValidacao(`Informe o nome ${campo}.`);
  if (t.length > 60) throw new ErroValidacao(`O nome ${campo} é longo demais.`);
  return t;
}

// Confere o que o painel envia: { tipo: 'bairro', bairro, taxa } ou { tipo: 'cidade', cidade, taxa }.
function validarTaxaEntrega(corpo) {
  if (!corpo || typeof corpo !== 'object') throw new ErroValidacao('Dados inválidos.');
  const taxa = Number(String(corpo.taxa ?? '').trim().replace(',', '.'));
  if (String(corpo.taxa ?? '').trim() === '' || !Number.isFinite(taxa) || taxa < 0 || taxa > TAXA_MAXIMA) {
    throw new ErroValidacao(`Informe a taxa (de R$ 0,00 a R$ ${TAXA_MAXIMA},00).`);
  }
  const valor = Math.round(taxa * 100) / 100;
  if (corpo.tipo === 'bairro') {
    return { cidade: CIDADE_PRINCIPAL, bairro: nomeValido(corpo.bairro, 'do bairro'), taxa: valor };
  }
  if (corpo.tipo === 'cidade') {
    const cidade = nomeValido(corpo.cidade, 'da cidade');
    if (ehPrincipal(cidade)) throw new ErroValidacao(`Para ${CIDADE_PRINCIPAL}, cadastre os bairros na lista de bairros.`);
    return { cidade, bairro: null, taxa: valor };
  }
  throw new ErroValidacao('Escolha se é um bairro ou uma cidade.');
}

module.exports = { CIDADE_PRINCIPAL, montarConfigEntrega, calcularTaxaEntrega, validarTaxaEntrega };
