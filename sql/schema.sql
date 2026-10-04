-- Esquema completo do banco (Supabase > SQL Editor). Pode rodar mais de uma vez:
-- tudo usa "if not exists", então não apaga nem duplica nada.
-- Se você já tem as tabelas produtos, pedidos e itens_pedido, ele só acrescenta o que falta.

create extension if not exists pgcrypto;

create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  preco numeric(10,2) not null default 0,
  categoria text not null default 'Outros',
  disponivel boolean not null default true
);
alter table produtos add column if not exists sabores text[] not null default '{}';
-- Carrossel: uma foto por sabor. Ex.: [{ "sabor": "Chocotudo", "url": "img/bolo-chocotudo.jpg" }]
alter table produtos add column if not exists galeria jsonb not null default '[]';
alter table produtos add column if not exists imagem_url text;
-- Sabores que acabaram (somem do cardápio sem perder o preço deles).
alter table produtos add column if not exists sabores_esgotados text[] not null default '{}';
-- Preço diferente por sabor. Ex.: {"Ninho": 10, "Maracujá": 10}. Sabor fora da lista usa produtos.preco.
alter table produtos add column if not exists precos_sabor jsonb not null default '{}';
-- Promoção por quantidade: a cada promo_qtd unidades o grupo custa promo_preco (ex.: 2 pudins por 12,00).
alter table produtos add column if not exists promo_qtd integer check (promo_qtd is null or promo_qtd >= 2);
alter table produtos add column if not exists promo_preco numeric(10,2) check (promo_preco is null or promo_preco > 0);  -- foto do produto (ex.: img/brownie.jpg)

create table if not exists adicionais (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id) on delete cascade,
  nome text not null,
  preco numeric(10,2) not null check (preco >= 0),
  disponivel boolean not null default true
);

create table if not exists taxas_entrega (
  id uuid primary key default gen_random_uuid(),
  bairro text not null unique,
  taxa numeric(10,2) not null check (taxa >= 0)
);

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  status text not null default 'recebido'
    check (status in ('recebido','confirmado','producao','pronto','despachado','entregue','cancelado')),
  cliente_nome text not null,
  cliente_whatsapp text not null,
  endereco_rua text,                      -- vazio quando é retirada
  endereco_bairro text,
  endereco_cidade text,
  endereco_complemento text,
  forma_pagamento text not null check (forma_pagamento in ('pix','cartao_entrega','dinheiro')),
  observacoes text,
  taxa_entrega numeric(10,2),            -- null = a combinar
  chave_idempotencia text unique,        -- evita pedido duplicado quando o cliente reenvia
  criado_em timestamptz not null default now()
);
alter table pedidos add column if not exists taxa_entrega numeric(10,2);
alter table pedidos add column if not exists chave_idempotencia text unique;
alter table pedidos add column if not exists tipo_entrega text not null default 'entrega'
  check (tipo_entrega in ('entrega','retirada'));
alter table pedidos alter column endereco_rua drop not null;
alter table pedidos drop constraint if exists pedidos_status_check;
alter table pedidos add constraint pedidos_status_check
  check (status in ('recebido','confirmado','producao','pronto','despachado','entregue','cancelado'));

create table if not exists itens_pedido (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references pedidos(id) on delete cascade,
  produto_id uuid references produtos(id) on delete set null,
  nome text not null default '',          -- nome do doce no momento do pedido
  sabor text,
  adicionais jsonb not null default '[]', -- [{ nome, preco }] no momento do pedido
  quantidade integer not null check (quantidade >= 1),
  preco_unitario numeric(10,2) not null,  -- preço + adicionais, gravado no momento do pedido
  desconto numeric(10,2) not null default 0
);
alter table itens_pedido add column if not exists nome text not null default '';
alter table itens_pedido add column if not exists sabor text;
alter table itens_pedido add column if not exists adicionais jsonb not null default '[]';
alter table itens_pedido add column if not exists desconto numeric(10,2) not null default 0;  -- desconto de promoção da linha

-- Painel da cozinha: senha (criptografada) e registro de acessos.
create table if not exists painel_config (
  chave text primary key,
  valor text not null
);
create table if not exists painel_acessos (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  ip text,
  agente text
);

create index if not exists idx_pedidos_status on pedidos (status, criado_em desc);
create index if not exists idx_itens_pedido on itens_pedido (pedido_id);
create index if not exists idx_adicionais_produto on adicionais (produto_id);

-- O acesso é feito só pelo servidor (conexão direta). Ligando o RLS sem políticas,
-- ninguém consegue ler/escrever pelas chaves públicas da API do Supabase.
alter table produtos enable row level security;
alter table adicionais enable row level security;
alter table taxas_entrega enable row level security;
alter table pedidos enable row level security;
alter table itens_pedido enable row level security;
alter table painel_config enable row level security;
alter table painel_acessos enable row level security;

-- As chaves públicas do Supabase (anon/authenticated) não precisam de nada: só o servidor acessa o banco.
-- O RLS não bloqueia TRUNCATE, por isso as permissões também são retiradas.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Cardápio inicial (rode só se a tabela produtos estiver vazia). Preço 0 = "Preço em breve".
insert into produtos (nome, preco, categoria, sabores)
select * from (values
  ('Brownie 50% Cacau Nobre', 5.00, 'Brownie', '{}'::text[]),
  ('Bolo de Pote', 0.00, 'Bolo de Pote', array['Chocotudo','Prestígio','Abacaxi','Maracujá','Dois Amores']),
  ('Pudim', 0.00, 'Pudim', '{}'::text[]),
  ('Mousse', 0.00, 'Mousse', array['Dois Amores','Maracujá com Chocolate'])
) as v(nome, preco, categoria, sabores)
where not exists (select 1 from produtos);
