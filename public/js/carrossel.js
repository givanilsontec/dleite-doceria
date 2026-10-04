// Carrossel de fotos do produto: rolagem horizontal com "encaixe" (funciona no dedo e no mouse),
// setas e bolinhas. Usa delegação de eventos: um único ouvinte cobre todos os carrosséis da tela.

function faixaDe(carrossel) {
  return carrossel.querySelector('.carrossel-faixa');
}

function atualizarPontos(carrossel) {
  const faixa = faixaDe(carrossel);
  const indice = Math.round(faixa.scrollLeft / faixa.clientWidth) || 0;
  carrossel.querySelectorAll('.carrossel-pontos span').forEach((ponto, i) => ponto.classList.toggle('ativo', i === indice));
  const ultimo = faixa.children.length - 1;
  carrossel.querySelector('.anterior').hidden = indice <= 0;
  carrossel.querySelector('.proxima').hidden = indice >= ultimo;
}

export function ligarCarrosseis(raiz) {
  const aoClicar = (evento) => {
    const botao = evento.target.closest('[data-carrossel-passo]');
    if (!botao || !raiz.contains(botao)) return;
    const faixa = faixaDe(botao.closest('[data-carrossel]'));
    faixa.scrollBy({ left: Number(botao.dataset.carrosselPasso) * faixa.clientWidth, behavior: 'smooth' });
  };

  // O evento "scroll" não borbulha, por isso o ouvinte usa captura.
  const aoRolar = (evento) => {
    const carrossel = evento.target.closest?.('[data-carrossel]');
    if (carrossel) atualizarPontos(carrossel);
  };

  // Setas do teclado quando a faixa está em foco.
  const aoTeclar = (evento) => {
    if (!evento.target.matches?.('.carrossel-faixa')) return;
    const passo = { ArrowRight: 1, ArrowLeft: -1 }[evento.key];
    if (!passo) return;
    evento.preventDefault();
    evento.target.scrollBy({ left: passo * evento.target.clientWidth, behavior: 'smooth' });
  };

  raiz.addEventListener('click', aoClicar);
  raiz.addEventListener('scroll', aoRolar, true);
  raiz.addEventListener('keydown', aoTeclar);

  // Estado inicial das setas (a primeira foto não tem "anterior"). Chamar depois de desenhar a grade.
  return { iniciar: () => raiz.querySelectorAll('[data-carrossel]').forEach(atualizarPontos) };
}
