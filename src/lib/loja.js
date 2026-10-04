// Funcionamento da loja: pausa manual, horário por dia da semana, entrega e retirada.
// Funções puras (sem banco), para ficarem fáceis de testar.

const { ErroValidacao } = require('./regras');

const FUSO = 'America/Recife';
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Sem configuração salva: loja aberta o tempo todo, com entrega (o site funciona igual a antes).
const PADRAO = {
  pausado: false,
  mensagem_pausa: '',
  usar_horario: false,
  horarios: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
  aceita_entrega: true,
  aceita_retirada: false,
  endereco_retirada: '',
};

function completar(config) {
  const c = { ...PADRAO, ...(config || {}) };
  c.horarios = { ...PADRAO.horarios, ...(c.horarios || {}) };
  return c;
}

const minutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Dia da semana (0 = domingo) e minuto do dia no horário de Recife.
function agoraNoFuso(agora = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(agora).map((p) => [p.type, p.value]));
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(partes.weekday);
  return { dia, minuto: Number(partes.hour) * 60 + Number(partes.minute) };
}

// Próxima abertura a partir de agora, em texto: "hoje às 14:00", "amanhã às 14:00", "sábado às 14:00".
function proximaAbertura(c, dia, minuto) {
  for (let passo = 0; passo < 7; passo += 1) {
    const d = (dia + passo) % 7;
    const h = c.horarios[d];
    if (!h) continue;
    if (passo === 0 && minutos(h.abre) <= minuto) continue;
    const quando = passo === 0 ? 'hoje' : passo === 1 ? 'amanhã' : DIAS[d];
    return `${quando} às ${h.abre}`;
  }
  return null;
}

// { aberta, motivo: 'pausado' | 'fora_do_horario' | null, aviso } — o aviso é o texto mostrado no site.
function estadoLoja(config, agora = new Date()) {
  const c = completar(config);
  if (c.pausado) {
    return { aberta: false, motivo: 'pausado', aviso: c.mensagem_pausa || 'Estamos com os pedidos pausados no momento. Volte em breve!' };
  }
  if (!c.usar_horario) return { aberta: true, motivo: null, aviso: '' };

  const { dia, minuto } = agoraNoFuso(agora);
  const hoje = c.horarios[dia];
  if (hoje && minuto >= minutos(hoje.abre) && minuto < minutos(hoje.fecha)) {
    return { aberta: true, motivo: null, aviso: '' };
  }
  const prox = proximaAbertura(c, dia, minuto);
  return {
    aberta: false,
    motivo: 'fora_do_horario',
    aviso: prox ? `Estamos fechados agora. Abrimos ${prox}.` : 'Estamos fechados no momento.',
  };
}

// Confere a configuração enviada pelo painel.
function validarConfigLoja(corpo) {
  if (!corpo || typeof corpo !== 'object') throw new ErroValidacao('Configuração inválida.');
  const bool = (v, campo) => {
    if (typeof v !== 'boolean') throw new ErroValidacao(`Valor inválido em ${campo}.`);
    return v;
  };

  const horarios = {};
  for (let d = 0; d < 7; d += 1) {
    const h = corpo.horarios?.[d];
    if (!h) { horarios[d] = null; continue; }
    if (!HORA.test(h.abre || '') || !HORA.test(h.fecha || '')) {
      throw new ErroValidacao(`Horário inválido na ${DIAS[d]}. Use o formato 14:00.`);
    }
    if (minutos(h.fecha) <= minutos(h.abre)) {
      throw new ErroValidacao(`Na ${DIAS[d]}, o horário de fechar precisa ser depois do de abrir.`);
    }
    horarios[d] = { abre: h.abre, fecha: h.fecha };
  }

  const c = {
    pausado: bool(corpo.pausado, 'pausar pedidos'),
    mensagem_pausa: typeof corpo.mensagem_pausa === 'string' ? corpo.mensagem_pausa.trim().slice(0, 200) : '',
    usar_horario: bool(corpo.usar_horario, 'usar horário'),
    horarios,
    aceita_entrega: bool(corpo.aceita_entrega, 'aceita entrega'),
    aceita_retirada: bool(corpo.aceita_retirada, 'aceita retirada'),
    endereco_retirada: typeof corpo.endereco_retirada === 'string' ? corpo.endereco_retirada.trim().slice(0, 200) : '',
  };
  if (!c.aceita_entrega && !c.aceita_retirada) throw new ErroValidacao('Deixe pelo menos entrega ou retirada ativada.');
  if (c.usar_horario && Object.values(horarios).every((h) => !h)) {
    throw new ErroValidacao('Para usar horário, preencha pelo menos um dia.');
  }
  if (c.aceita_retirada && c.endereco_retirada.length < 5) {
    throw new ErroValidacao('Informe o endereço para retirada.');
  }
  return c;
}

module.exports = { PADRAO, DIAS, completar, estadoLoja, validarConfigLoja, agoraNoFuso };
