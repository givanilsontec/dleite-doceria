// Tudo que o site guarda no navegador do cliente passa por aqui.
// O try/catch existe porque alguns navegadores (aba anônima, por exemplo)
// bloqueiam o localStorage, e o site precisa continuar funcionando mesmo assim.

export const CHAVES = {
  carrinho: 'atelier:carrinho',
  cliente: 'atelier:cliente',
};

export function lerLocal(chave, padrao) {
  try {
    const valor = localStorage.getItem(chave);
    return valor === null ? padrao : JSON.parse(valor);
  } catch {
    return padrao;
  }
}

export function gravarLocal(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Armazenamento indisponível: segue sem salvar.
  }
}
