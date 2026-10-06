// Fotos enviadas pelo painel: o servidor regrava cada uma do zero (nenhum arquivo enviado vai ao ar como veio).
// A foto inteira cabe no formato dos cards (4:3), com margem creme onde sobrar espaço.
const sharp = require('sharp');

const LARGURA = 1200;
const ALTURA = 900;
const MAX_BYTES = 10 * 1024 * 1024;
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];
const CREME = { r: 255, g: 253, b: 249 };

class ErroFoto extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

async function prepararFoto(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ErroFoto('Nenhuma foto recebida.');
  if (buffer.length > MAX_BYTES) throw new ErroFoto('A foto é grande demais (máximo 10 MB).', 413);
  try {
    return await sharp(buffer, { limitInputPixels: 50_000_000 })
      .rotate() // respeita a orientação da câmera do celular
      .resize(LARGURA, ALTURA, { fit: 'contain', background: CREME })
      .flatten({ background: CREME }) // PNG transparente vira fundo creme
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new ErroFoto('Não foi possível ler essa imagem. Envie uma foto em JPG, PNG ou WEBP.', 415);
  }
}

module.exports = { TIPOS_ACEITOS, MAX_BYTES, LARGURA, ALTURA, ErroFoto, prepararFoto };
