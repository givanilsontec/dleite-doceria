# D'Leite: pedidos online para uma doceria artesanal

Sistema de pedidos sob medida para a **D'Leite by Vanessa Rangel** (Carpina, PE), uma doceria que vendia só pelo WhatsApp.
O cliente recebe um link, monta o pedido num cardápio digital e o envia pronto para o WhatsApp da doceria.
O casal acompanha tudo num painel protegido por senha, do pedido novo até a entrega.

> Projeto real, feito para a doceria (em fase de lançamento). Front-end em JavaScript puro (sem framework), API em Node.js/Express e banco PostgreSQL (Supabase).

## O problema

Pedidos feitos só por conversa no WhatsApp geravam idas e vindas: o cliente perguntava o cardápio, os preços e os sabores, e o pedido ficava espalhado em mensagens.
O objetivo foi dar à doceria um cardápio com preços sempre atualizados, um pedido completo e sem erros de conta, e um lugar único para organizar a produção. Tudo isso **sem exigir cadastro do cliente** e sem custo de plataforma de delivery.

## Funcionalidades

### Para o cliente
- **Cardápio** com fotos, filtros por categoria e carrossel de fotos por sabor.
- **Preço por sabor** no mesmo produto (ex.: Bolo no Pote "a partir de R$ 8,00", com sabores de R$ 8 e de R$ 10) e **promoções por quantidade** ("2 pudins por R$ 12").
- **Carrinho** guardado no aparelho, com observações e barra fixa de "Continuar".
- **Checkout** com entrega ou retirada, endereço, pagamento (Pix, cartão ou dinheiro com troco) e conferência do cardápio na hora: se um preço mudou enquanto o cliente escolhia, ele é avisado.
- **Envio pelo WhatsApp**: ao confirmar, o WhatsApp da doceria abre com o pedido inteiro escrito (itens, endereço, total e pagamento).
- **Loja fechada**: fora do horário ou com os pedidos pausados, o site avisa quando abre e não aceita pedidos.

### Para a doceria (painel em `/admin`)
- **Pedidos** com fluxo de status (Novo → Confirmado → Em produção → Pronto → Saiu para entrega → Entregue, ou Cancelado), atualização automática e destaque para pedidos novos.
- **Aviso ao cliente em um toque**: ao mudar o status, o WhatsApp do cliente abre com a mensagem certa ("seu pedido foi aceito", "saiu para entrega"...), com saudação conforme o horário.
- **Gestão do cardápio**: preços, preço por sabor, sabor ou produto esgotado, promoções e produtos novos, sem mexer no código.
- **Loja e horário**: pausar pedidos com mensagem, horário de funcionamento por dia (fuso de Recife), entrega e retirada.
- **Acesso protegido**: senha do casal, troca de senha pelo próprio painel, "manter conectado neste aparelho" e aviso do último acesso (data e IP).

## Decisões técnicas

- **O preço é sempre calculado no servidor.** O navegador envia só ids, sabor e quantidade. Preço por sabor, promoção e total vêm do banco, então mexer no site não muda o valor cobrado. Cada item guarda o preço do momento do pedido.
- **Sem conta de cliente, de propósito.** Cadastro aumenta o abandono e obrigaria a guardar mais dados pessoais. O WhatsApp já identifica o cliente.
- **Dados pessoais só no painel.** Não existe consulta pública de pedido por código. A tela de confirmação usa o pedido guardado apenas na aba de quem comprou. Pedidos de retirada não guardam endereço.
- **Pedido duplicado evitado** com `Idempotency-Key`: se a rede cai depois de gravar, o reenvio devolve o mesmo pedido.
- **Front-end sem framework e sem build.** Módulos ES nativos, servidos direto pelo Express. A página é leve no celular e fácil de manter por uma pessoa só.
- **Regras de negócio puras e testadas.** Validação, preços, promoções, taxa e horário de funcionamento ficam em funções sem banco (`src/lib`), cobertas por testes.
- **Imagens otimizadas por script.** As fotos originais (PNG/JPG grandes) viram JPG 4:3 de cerca de 120 KB com `sharp` (`scripts/otimizar-imagens.js`).

## Segurança

- **Login do painel:** senha guardada com `scrypt` e token assinado com HMAC (12 h, ou 7 dias com "manter conectado"). Trocar a senha invalida todas as sessões. 10 tentativas erradas bloqueiam o login por 15 minutos.
- **Limite de uso por IP** na criação de pedidos e no login (`express-rate-limit`).
- **Content Security Policy** e cabeçalhos de segurança (`helmet`): o navegador só executa scripts do próprio site, e todo texto vindo do usuário é escapado antes de ir para a tela.
- **Banco fechado:** RLS ligado sem políticas e permissões das chaves públicas do Supabase retiradas. Só o servidor acessa as tabelas.
- **Segredos fora do código:** credenciais em variáveis de ambiente (`.env`, nunca versionado).
- Auditoria manual com tentativas de abuso: pedidos com preço adulterado, quantidades inválidas, injeção de SQL, XSS no nome, token forjado e acesso a arquivos do servidor (`/.env`, `../`).

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | HTML, CSS e JavaScript (módulos ES), sem framework |
| Back-end | Node.js 18+, Express 4 |
| Banco | PostgreSQL no Supabase (`pg`) |
| Segurança | helmet (CSP), express-rate-limit, crypto (scrypt + HMAC) |
| Testes | `node:test` (nativo do Node) |
| Imagens | sharp |

## Como rodar localmente

Pré-requisitos: Node.js 18+ e um banco PostgreSQL (o projeto usa o Supabase).

1. Crie as tabelas rodando `sql/schema.sql` no SQL Editor do Supabase. O script pode ser rodado mais de uma vez.
2. Instale e configure:

```bash
npm install
```

```bash
cp .env.example .env
```

Edite o `.env` com `DATABASE_URL`, `PAINEL_SENHA` e `PAINEL_SEGREDO` (as instruções estão no próprio arquivo).

3. Inicie o servidor:

```bash
npm run dev
```

4. Abra `http://localhost:3000` (cardápio) e `http://localhost:3000/admin` (painel, com a senha do `.env`).

Nome, logo e WhatsApp da loja ficam em `public/js/config.js`. Preços, cardápio, horário e entrega/retirada são configurados pelo painel.

### Testes

```bash
npm test
```

Cobrem validação de pedidos, preço por sabor, promoções, taxa de entrega, retirada, horário de funcionamento (com fuso horário) e validação do cardápio editado pelo painel.

### Variáveis de ambiente em produção

Além das três do `.env`, defina `TRUST_PROXY=1` em hospedagens atrás de proxy (Render, Railway…), para o limite por IP usar o IP real do cliente. Use HTTPS.

## Estrutura

```
src/
├── server.js              → Express: site, API, CSP, limites de uso, erros em JSON
├── config/db.js           → conexão com o PostgreSQL
├── middleware/auth.js     → senha do painel (scrypt), token assinado, registro de acessos
├── lib/regras.js          → validação, preço por sabor, promoção, taxa e total (puro, testado)
├── lib/loja.js            → pausa, horário por dia, entrega/retirada (puro, testado)
└── routes/
    ├── produtos.js        → GET /produtos
    ├── taxas.js           → GET /taxas-entrega
    ├── loja.js            → GET /loja
    ├── pedidos.js         → POST /pedidos, GET /pedidos, PATCH /pedidos/:id/status
    └── painel.js          → login, senha, cardápio e loja (exige login)
public/                    → front-end (detalhes em FRONTEND.md)
sql/schema.sql             → tabelas, índices, RLS e permissões
scripts/otimizar-imagens.js
tests/regras.test.js
```

## API

| Rota | Acesso | Descrição |
|---|---|---|
| `GET /produtos` | público | Cardápio disponível (sem sabores esgotados) |
| `GET /taxas-entrega` | público | Taxas por bairro (vazia = entrega grátis) |
| `GET /loja` | público | Aberta/fechada, aviso, entrega/retirada |
| `POST /pedidos` | público, com limite por IP | Cria o pedido; aceita `Idempotency-Key` |
| `POST /painel/login` | senha | Devolve o token do painel |
| `POST /painel/senha` | token | Troca a senha (derruba as outras sessões) |
| `GET /pedidos` | token | Lista os pedidos |
| `PATCH /pedidos/:id/status` | token | Muda o status |
| `GET/POST/PATCH /painel/produtos` | token | Gestão do cardápio |
| `GET/PATCH /painel/loja` | token | Pausa, horário, entrega/retirada |

`GET /admin` redireciona para a tela de senha do painel. Formatos de envio e resposta em [`FRONTEND.md`](FRONTEND.md).

## Próximos passos

- Notificação no celular para pedidos novos (hoje o painel atualiza a cada 15 s e destaca pedidos novos).
- Envio de fotos de produtos pelo painel.
- Resumo de vendas (dia, semana e mês) e mais vendidos.
- Cupons de desconto.
