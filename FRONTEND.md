# Front-end: D'Leite

HTML, CSS e JavaScript puro. Sem React, sem build, sem dependências: o Express serve a pasta `public/` direto.
O site é **um só**, com dois públicos:

- **Clientes** entram pelo endereço principal (`/`) e caem no cardápio.
- **O casal** entra por `/admin` (atalho para `/#/painel`), que pede a senha.

## Estrutura

```
public/
├── index.html
├── css/styles.css
├── img/                 → fotos e logo (geradas a partir de fotos-originais/, ver scripts/otimizar-imagens.js)
└── js/
    ├── config.js        → AJUSTES (nome, logo, WhatsApp da doceria)
    ├── app.js           → roteador (troca as telas pelo # da URL)
    ├── api.js           → ÚNICO lugar que fala com o back-end
    ├── cart.js          → carrinho (fica no navegador; uma linha = doce + sabor + adicionais)
    ├── modal.js         → janela de escolha de sabor/quantidade
    ├── carrossel.js     → carrossel de fotos do produto
    ├── whatsapp.js      → mensagem do pedido (cliente → doceria) e mensagens de status (doceria → cliente)
    ├── storage.js       → helpers do localStorage
    ├── ui.js            → ícones, ilustrações, formatação, status, pagamentos
    └── pages/
        ├── cardapio.js        /#/
        ├── carrinho.js        /#/carrinho
        ├── checkout.js        /#/checkout
        ├── pedido.js          /#/pedido/AT-123456   (confirmação + WhatsApp)
        ├── painel.js          /#/painel             (pedidos, status, senha)
        ├── painel-cardapio.js /#/painel/cardapio    (preços, esgotados, produtos novos)
        └── painel-loja.js     /#/painel/loja        (pausar pedidos, horário, entrega/retirada)
```

## Ajustes (`public/js/config.js`)

| Opção | Para que serve |
|---|---|
| `NOME_LOJA` / `SLOGAN` / `LOGO` | Nome, frase e logo do topo do site, da tela de senha e das mensagens do WhatsApp. |
| `LOGO_MOSTRA_NOME` | `false` esconde o nome ao lado da logo (para logos que já trazem o nome escrito). |
| `WHATSAPP_DOCERIA` | Número da doceria com DDI e DDD, só dígitos (ex.: `'5581999998888'`). Vazio = o botão "Enviar pedido pelo WhatsApp" não aparece. |
| `API_URL` | Vazio = mesma origem (o Express serve o site e a API juntos). |

Preços, sabores, promoções, horário e entrega/retirada **não ficam no código**: o casal muda tudo pelo painel.

## Fluxo do cliente

1. **Cardápio**: fotos, filtros por categoria, preço "a partir de" quando o sabor muda o preço, selo de promoção. Aviso no topo quando a loja está fechada ou pausada.
2. **Janela do doce**: foto grande, sabores com preço, quantidade.
3. **Carrinho**: quantidades, observações, barra fixa "Continuar".
4. **Checkout**: confere o cardápio de novo (avisa se um preço mudou), nome e WhatsApp, entrega ou retirada, endereço (bairro obrigatório na entrega), pagamento (Pix, cartão, dinheiro com troco). Bloqueado com a loja fechada.
5. **Confirmação**: código do pedido e resumo; o WhatsApp da doceria abre sozinho com o pedido escrito.

A confirmação usa o pedido guardado **só na aba** de quem comprou (sessionStorage). Não existe consulta pública de pedido.

## Painel da cozinha

- **Pedidos**: atualiza a cada 15 s e na hora em que o painel volta a ficar visível. Pedido "Novo" aparece com faixa de destaque, contador no título da aba e aviso rápido (sem som, por enquanto). Fluxo: Novo → Confirmado → Em produção → Pronto → Saiu para entrega → Entregue (retirada: Pronto → "Cliente retirou"); Cancelar com confirmação. Ao mudar o status, abre o WhatsApp do cliente com a mensagem pronta (dá para desligar).
- **Login**: senha única do casal; "Manter conectado neste aparelho" guarda o acesso por 7 dias (sem marcar, vale até fechar a aba). Trocar a senha desconecta todos.
- **Cardápio**: preço, nome, descrição, preço por sabor, sabor esgotado, produto fora do cardápio, promoção "leve N por R$ X", produto novo.
- **Loja e horário**: pausar pedidos com mensagem, horário por dia (fuso de Recife), entrega/retirada e endereço de retirada.

## Contrato da API

| Rota | Acesso | Envia | Recebe |
|---|---|---|---|
| `GET /produtos` | público | | produtos disponíveis (sem sabores esgotados) |
| `GET /taxas-entrega` | público | | `[{ bairro, taxa }]` (vazia = entrega grátis) |
| `GET /loja` | público | | `{ aberta, motivo, aviso, aceita_entrega, aceita_retirada, endereco_retirada }` |
| `POST /pedidos` | público | ver abaixo (+ cabeçalho `Idempotency-Key`) | pedido completo (só para quem enviou) |
| `POST /painel/login` | | `{ senha, lembrar }` | `{ token, ultimo_acesso }` |
| `POST /painel/senha` | token | `{ atual, nova, lembrar }` | `{ token }` |
| `GET /pedidos?status=` | token | | lista de pedidos completos |
| `PATCH /pedidos/:id/status` | token | `{ status }` | pedido atualizado |
| `GET /painel/produtos` / `POST` / `PATCH /painel/produtos/:id` | token | produto | produto |
| `GET` / `PATCH /painel/loja` | token | campos da configuração | `{ config, estado }` |

Token = `Authorization: Bearer <token>`. Erros sempre em JSON: `{ "erro": "mensagem" }`.

Corpo do `POST /pedidos`:

```json
{
  "cliente_nome": "Maria",
  "cliente_whatsapp": "81999998888",
  "tipo_entrega": "entrega",
  "endereco_rua": "Rua Teste, 10",
  "endereco_bairro": "Centro",
  "endereco_cidade": null,
  "endereco_complemento": null,
  "forma_pagamento": "pix",
  "observacoes": null,
  "itens": [
    { "produto_id": "uuid", "quantidade": 2, "sabor": "Chocotudo", "adicionais": [] }
  ]
}
```

`tipo_entrega`: `entrega` ou `retirada` (na retirada o endereço não é exigido nem guardado).
Status: `recebido`, `confirmado`, `producao`, `pronto`, `despachado`, `entregue`, `cancelado`.
Pagamentos: `pix`, `cartao_entrega`, `dinheiro`.

## Regras garantidas pelo servidor

- **Preços são do servidor**: o front manda só ids, sabor e quantidade. Preço por sabor, adicionais e promoção são calculados no banco.
- Sabor precisa existir e não estar esgotado; produto precisa estar disponível e ter preço.
- Loja fechada (pausa ou fora do horário) ou modo de entrega desativado: pedido recusado.
- Entrega exige rua e bairro; retirada tem taxa 0.
- `preco_unitario` e `adicionais` do item são gravados no momento do pedido (mudar o preço depois não altera pedidos antigos).
- `total` = soma das linhas − descontos de promoção + taxa de entrega.
