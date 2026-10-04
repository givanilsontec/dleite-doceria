// Gera as fotos do site (public/img) a partir das originais (fotos-originais/).
// Cada foto sai em 4:3, 1200x900, JPG leve. Onde a foto não é 4:3, as bordas (fundo liso) são
// estendidas em vez de cortar o produto.
//
// Uso: node scripts/otimizar-imagens.js
const path = require('path');
const sharp = require('sharp');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, 'fotos-originais');
const DESTINO = path.join(RAIZ, 'public', 'img');
const L = 1200;
const A = 900;

// box = [esquerda, topo, largura, altura] da região a aproveitar, em pixels da foto original.
const FOTOS = [
  { de: 'pudim.jpg', para: 'pudim.jpg', box: [0, 0, 1536, 1024] },
  { de: 'brownie.jpg', para: 'brownie.jpg', box: [0, 40, 1254, 1170] },
  { de: 'bombom-de-brownie.jpg', para: 'bombom-de-brownie.jpg', box: [0, 150, 1374, 930] },
  { de: 'bolo-chocotudo.jpg', para: 'bolo-chocotudo.jpg', box: [0, 310, 1086, 900] },
  { de: 'bolo-prestigio.jpg', para: 'bolo-prestigio.jpg', box: [0, 170, 1374, 880] },
  { de: 'bolos-empilhados.jpg', para: 'bolos-empilhados.jpg', box: [0, 30, 1145, 1310] },
];

async function gerar({ de, para, box }) {
  const [left, top, width, height] = box;
  const recorte = await sharp(path.join(ORIGEM, de)).extract({ left, top, width, height }).toBuffer();

  // Estende as bordas até a proporção 4:3 (sem cortar o produto).
  const alvoLargura = Math.max(width, Math.round((height * 4) / 3));
  const alvoAltura = Math.max(height, Math.round((width * 3) / 4));
  const dx = alvoLargura - width;
  const dy = alvoAltura - height;

  // Duas etapas: o sharp faz o resize antes do extend se estiverem na mesma cadeia, o que esticaria a foto.
  const estendida = await sharp(recorte)
    .extend({
      left: Math.floor(dx / 2), right: Math.ceil(dx / 2),
      top: Math.floor(dy / 2), bottom: Math.ceil(dy / 2),
      extendWith: 'copy',
    })
    .toBuffer();

  await sharp(estendida)
    .resize(L, A)
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(DESTINO, para));
  console.log('ok', para);
}

(async () => {
  for (const foto of FOTOS) await gerar(foto);
})().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
