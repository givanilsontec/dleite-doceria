// Situação da loja (aberta/fechada) para as telas do cliente.
// Confere ao abrir o site, a cada minuto e quando o cliente volta para a aba; avisa as telas que se inscreveram.
// Se a consulta falhar, a loja é tratada como aberta: o servidor confere de novo ao receber o pedido.

import { buscarLoja } from './api.js';

const INTERVALO_MS = 60 * 1000;

let estado = { aberta: true, aviso: '', carregado: false };
const ouvintes = new Set();
let timer = null;

function avisar() {
  ouvintes.forEach((fn) => fn(estado));
}

async function conferir() {
  try {
    const r = await buscarLoja();
    const mudou = !estado.carregado || r.aberta !== estado.aberta || r.aviso !== estado.aviso;
    estado = { ...r, carregado: true };
    if (mudou) avisar();
  } catch {
    // sem resposta: mantém o último estado conhecido
  }
}

export const loja = {
  get aberta() {
    return estado.aberta !== false;
  },
  get aviso() {
    return estado.aviso || 'Estamos fechados no momento.';
  },
  // Recebe o estado na hora (se já carregado) e a cada mudança. Devolve a função para cancelar.
  assinar(fn) {
    ouvintes.add(fn);
    if (estado.carregado) fn(estado);
    return () => ouvintes.delete(fn);
  },
  iniciar() {
    if (timer) return;
    conferir();
    timer = setInterval(conferir, INTERVALO_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') conferir();
    });
  },
};
