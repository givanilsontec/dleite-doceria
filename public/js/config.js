// Configurações do site. Se precisar mudar algo, mude aqui e não nas telas.

export const CONFIG = {
  // Nome que aparece nas mensagens do WhatsApp.
  NOME_LOJA: "D'Leite",

  // Frase curta embaixo do nome, no topo do site. Vazio = não mostra.
  SLOGAN: 'Doces & Sobremesas',

  // Logo no topo: caminho da imagem dentro de public/ (ex.: 'img/logo.png' ou 'img/logo.svg').
  // Vazio = usa o ícone padrão.
  LOGO: 'img/icone.png',
  // Se a logo já traz o nome escrito, ponha false para não repetir o nome ao lado dela.
  LOGO_MOSTRA_NOME: true,

  // WhatsApp da doceria: DDI + DDD + número, só dígitos. Ex.: '5581999998888'.
  // Vazio = o botão "Enviar pelo WhatsApp" não aparece.
  WHATSAPP_DOCERIA: '558192155218',

  // Endereço da API. Vazio = mesma origem (o Express serve o site e a API juntos).
  API_URL: '',
};
