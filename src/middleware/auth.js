// Login do painel da cozinha (usado só pelo casal): uma senha única -> token assinado (HMAC),
// de 12 horas ou de 7 dias quando marcam "manter conectado neste aparelho".
//
// A senha pode ser trocada pelo próprio painel. Depois da primeira troca, vale a senha guardada no banco
// (criptografada com scrypt) e a PAINEL_SENHA do .env deixa de funcionar. Cada troca gera uma nova "versão":
// os tokens antigos (de quem estava logado com a senha anterior) param de valer na hora.
const crypto = require('crypto');
const { promisify } = require('util');
const db = require('../config/db');

const scrypt = promisify(crypto.scrypt);
const VALIDADE_MS = 12 * 60 * 60 * 1000;           // login normal: 12 horas
const VALIDADE_LEMBRAR_MS = 7 * 24 * 60 * 60 * 1000; // "manter conectado neste aparelho": 7 dias
const SENHA_MINIMA = 10;

function segredo() {
  const s = process.env.PAINEL_SEGREDO;
  if (!s || s.length < 16) throw new Error('Defina PAINEL_SEGREDO (16+ caracteres) no .env.');
  return s;
}

const assinar = (texto) => crypto.createHmac('sha256', segredo()).update(texto).digest('base64url');

function iguais(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// ---------- Senha guardada no banco ----------

async function lerConfig(chave) {
  const { rows } = await db.query('select valor from painel_config where chave = $1', [chave]);
  return rows[0]?.valor ?? null;
}

async function gravarConfig(chave, valor) {
  await db.query(
    'insert into painel_config (chave, valor) values ($1, $2) on conflict (chave) do update set valor = excluded.valor',
    [chave, valor],
  );
}

async function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(senha, sal, 64)).toString('hex');
  return `${sal}:${hash}`;
}

async function confere(senha, guardado) {
  const [sal, hash] = guardado.split(':');
  const calculado = await scrypt(senha, sal, 64);
  return crypto.timingSafeEqual(calculado, Buffer.from(hash, 'hex'));
}

async function senhaCorreta(senha) {
  const texto = String(senha ?? '');
  const guardado = await lerConfig('senha_hash');
  if (guardado) return confere(texto, guardado);
  const esperada = process.env.PAINEL_SENHA;
  if (!esperada) throw new Error('Defina PAINEL_SENHA no .env.');
  return iguais(texto, esperada);
}

// Valida e grava a nova senha. Troca a "versão", o que derruba as sessões antigas.
async function trocarSenha(nova) {
  await gravarConfig('senha_hash', await hashSenha(nova));
  await gravarConfig('senha_versao', crypto.randomBytes(8).toString('hex'));
}

const versaoAtual = async () => (await lerConfig('senha_versao')) || 'env';

// ---------- Token ----------

async function gerarToken({ lembrar = false } = {}) {
  const exp = Date.now() + (lembrar ? VALIDADE_LEMBRAR_MS : VALIDADE_MS);
  const corpo = Buffer.from(JSON.stringify({ exp, sv: await versaoAtual() })).toString('base64url');
  return `${corpo}.${assinar(corpo)}`;
}

async function tokenValido(token) {
  const [corpo, assinatura] = String(token || '').split('.');
  if (!corpo || !assinatura || !iguais(assinatura, assinar(corpo))) return false;
  try {
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    return dados.exp > Date.now() && dados.sv === (await versaoAtual());
  } catch {
    return false;
  }
}

// Middleware: barra quem não mandou um token válido.
async function exigirPainel(req, res, next) {
  try {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!(await tokenValido(token))) return res.status(401).json({ erro: 'Sessão expirada. Entre no painel de novo.' });
    next();
  } catch (erro) {
    next(erro);
  }
}

// ---------- Registro de acessos ----------

// Guarda o acesso e devolve o anterior (para o painel mostrar "último acesso").
async function registrarAcesso(req) {
  const { rows } = await db.query('select quando, ip from painel_acessos order by quando desc limit 1');
  await db.query('insert into painel_acessos (ip, agente) values ($1, $2)', [req.ip || null, (req.get('user-agent') || '').slice(0, 200)]);
  return rows[0] ? { quando: rows[0].quando, ip: rows[0].ip } : null;
}

module.exports = {
  SENHA_MINIMA, senhaCorreta, trocarSenha, gerarToken, tokenValido, exigirPainel, registrarAcesso,
};
