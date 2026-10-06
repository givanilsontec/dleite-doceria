// Servidor Express: serve o site (pasta public/) e a API (/produtos, /taxas-entrega, /pedidos, /painel).
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { senhaCorreta, gerarToken, registrarAcesso } = require('./middleware/auth');
const produtos = require('./routes/produtos');
const taxas = require('./routes/taxas');
const pedidos = require('./routes/pedidos');
const painel = require('./routes/painel');
const { router: loja } = require('./routes/loja');
const imagens = require('./routes/imagens');
const db = require('./config/db');
const { agendarLimpeza } = require('./lib/limpeza');

const app = express();

// Atrás de proxy (Render, Railway, Heroku...) o IP real vem no cabeçalho; sem isto o limite por IP não funciona.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

// CSP: o navegador só executa scripts do próprio site. Mesmo que um dia algum texto escape sem querer,
// não roda código injetado (o que poderia roubar a sessão do painel).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ['https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'], // blob: = prévia da foto escolhida no painel
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(express.json({ limit: '50kb' }));

// por padrão só conta o que deu certo (erro de digitação do cliente não bloqueia ninguém);
// no login é o contrário: só contam as tentativas ERRADAS (proteção contra adivinhar a senha).
const limite = (janelaMin, max, erro, { contarFalhas = false } = {}) => rateLimit({
  windowMs: janelaMin * 60 * 1000,
  max,
  skipFailedRequests: !contarFalhas,
  skipSuccessfulRequests: contarFalhas,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro },
});

// ---------- API ----------

app.use('/produtos', produtos);
app.use('/taxas-entrega', taxas);
app.use('/loja', loja);
app.use('/imagens', imagens);

// Freia criação de pedidos falsos.
app.post('/pedidos', limite(10, 15, 'Muitos pedidos em pouco tempo. Tente de novo daqui a alguns minutos.'));
app.use('/pedidos', pedidos);

// Login do painel: troca a senha por um token (12 h, ou 7 dias com "manter conectado").
app.post('/painel/login', limite(15, 10, 'Muitas tentativas. Aguarde alguns minutos.', { contarFalhas: true }), async (req, res, next) => {
  try {
    if (!(await senhaCorreta(req.body?.senha))) return res.status(401).json({ erro: 'Senha incorreta.' });
    const ultimoAcesso = await registrarAcesso(req);
    res.json({ token: await gerarToken({ lembrar: req.body?.lembrar === true }), ultimo_acesso: ultimoAcesso });
  } catch (erro) {
    next(erro);
  }
});
app.post('/painel/senha', limite(15, 10, 'Muitas tentativas. Aguarde alguns minutos.', { contarFalhas: true }));

app.use('/painel', painel);

// Rotas de API que não existem respondem JSON (e não a página do site).
// Atalho fácil para o casal: dleite.com.br/admin abre a tela de senha do painel.
app.get(['/admin', '/admin/'], (req, res) => res.redirect(302, '/#/painel'));

app.use(['/produtos', '/taxas-entrega', '/pedidos', '/painel', '/loja'], (req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

// ---------- Site ----------

// Página, scripts e estilos sempre revalidados (o cliente recebe a versão nova logo após uma atualização);
// fotos podem ficar em cache por mais tempo.
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders(res, arquivo) {
    const ehImagem = /\.(jpe?g|png|webp|svg|ico)$/i.test(arquivo);
    res.setHeader('Cache-Control', ehImagem ? 'public, max-age=86400' : 'no-cache');
  },
}));

// ---------- Erros ----------

// eslint-disable-next-line no-unused-vars
app.use((erro, req, res, next) => {
  if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Corpo da requisição inválido.' });
  if (erro.status && erro.status < 500) return res.status(erro.status).json({ erro: erro.message });
  console.error(erro);
  res.status(500).json({ erro: 'Erro interno. Tente de novo em instantes.' });
});

if (require.main === module) {
  const porta = process.env.PORT || 3000;
  app.listen(porta, () => console.log(`D'Leite em http://localhost:${porta}`));
  agendarLimpeza(db); // apaga dados pessoais de pedidos com mais de 15 dias
}

module.exports = app;
