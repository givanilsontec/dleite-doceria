// Funções de apoio usadas por todas as telas.

// ---------- Segurança ----------

// Todo texto que vem do usuário ou da API passa por esc() antes de entrar no HTML.
// Sem isso, alguém poderia digitar <script> no campo de observações e o código
// rodaria no painel da cozinha (ataque chamado XSS).
export function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- Formatação ----------

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function dinheiro(valor) {
  return moeda.format(Number(valor) || 0);
}

export function apenasDigitos(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

export function formatarTelefone(texto) {
  let d = apenasDigitos(texto);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function linkWhatsApp(numero, texto = '') {
  let d = apenasDigitos(numero);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

export function hora(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function horario(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const mesmoDia = data.toDateString() === new Date().toDateString();
  if (mesmoDia) return `Hoje, ${hora(iso)}`;
  return `${data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora(iso)}`;
}

export function haQuanto(iso) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(minutos)) return '';
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.floor(horas / 24)} d`;
}

export function primeiroNome(nome) {
  return String(nome ?? '').trim().split(/\s+/)[0] || '';
}

export function slug(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------- Status do pedido e pagamento ----------
// Os valores (recebido, producao...) são exatamente os aceitos pelo banco.

// Fluxo do pedido. "cancelado" fica fora da sequência (só se chega lá pelo botão Cancelar).
export const STATUS = [
  { valor: 'recebido', rotulo: 'Novo', acao: 'Confirmar pedido' },
  { valor: 'confirmado', rotulo: 'Confirmado', acao: 'Começar produção' },
  { valor: 'producao', rotulo: 'Em produção', acao: 'Marcar como pronto' },
  { valor: 'pronto', rotulo: 'Pronto', acao: 'Saiu para entrega' },
  { valor: 'despachado', rotulo: 'Saiu para entrega', acao: 'Marcar como entregue' },
  { valor: 'entregue', rotulo: 'Entregue', acao: null },
  { valor: 'cancelado', rotulo: 'Cancelado', acao: null },
];
export const STATUS_FINAIS = ['entregue', 'cancelado'];

export function statusInfo(valor) {
  return STATUS.find((s) => s.valor === valor) || STATUS[0];
}

export function indiceStatus(valor) {
  const i = STATUS.findIndex((s) => s.valor === valor);
  return i === -1 ? 0 : i;
}

// Próximo passo do pedido. Retirada pula "Saiu para entrega": de pronto vai direto para entregue.
export function proximoStatus(valor, tipoEntrega = 'entrega') {
  if (STATUS_FINAIS.includes(valor)) return null;
  if (valor === 'pronto' && tipoEntrega === 'retirada') return 'entregue';
  const i = STATUS.findIndex((s) => s.valor === valor);
  return i >= 0 ? STATUS[i + 1].valor : null;
}

// Texto do botão de avançar (muda para retirada).
export function acaoStatus(valor, tipoEntrega = 'entrega') {
  if (valor === 'pronto' && tipoEntrega === 'retirada') return 'Cliente retirou';
  return statusInfo(valor).acao;
}

export const PAGAMENTOS = [
  { valor: 'pix', rotulo: 'Pix', detalhe: 'A doceria envia a chave Pix pelo WhatsApp.' },
  { valor: 'cartao_entrega', rotulo: 'Cartão', detalhe: 'Crédito ou débito na maquininha, na entrega ou na retirada.' },
  { valor: 'dinheiro', rotulo: 'Dinheiro', detalhe: 'Pagamento em espécie, na entrega ou na retirada.' },
];

export function rotuloPagamento(valor) {
  return PAGAMENTOS.find((p) => p.valor === valor)?.rotulo || valor || '';
}

// ---------- Ícones (traço simples, herdam a cor do texto) ----------

const ICONES = {
  mais: '<path d="M12 5v14M5 12h14"/>',
  menos: '<path d="M5 12h14"/>',
  fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
  voltar: '<path d="m15 18-6-6 6-6"/>',
  seguir: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  atualizar: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
  relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  local: '<path d="M12 21s-7-6.2-7-11.2a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>',
  cartao: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
  loja: '<path d="M4 9.5 5.6 5h12.8L20 9.5"/><path d="M4 9.5c0 1.4 1.2 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1.1 2.5 2.6 2.5S20 10.9 20 9.5"/><path d="M5.5 12v7.5h13V12M10 19.5V15h4v4.5"/>',
  sacola: '<path d="M5.5 8h13l-1 12h-11z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
  cardapio: '<path d="M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z"/><path d="M5 16.5a3 3 0 0 1 3-3h11M9 8h6M9 10.8h4"/>',
  busca: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  whatsapp: '<path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.3 18.6z"/><path d="M9.2 9.3c.3 2.4 2.1 4.3 4.6 4.9l1-1.1 1.7.8-.2 1.3c-3.6.4-7.6-3.4-7.3-7.1l1.3-.2.8 1.7z"/>',
  observacao: '<path d="M5 5h14v10l-4 4H5z"/><path d="M15 19v-4h4M8.5 9.5h7M8.5 12.5h4"/>',
};

export function icone(nome, classe = '') {
  return `<svg class="icone ${classe}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome] || ''}</svg>`;
}

// ---------- Ilustrações dos doces ----------
// Desenhos em traço no lugar de fotos, enquanto o casal não manda as imagens reais.

const T = 'stroke="#4A2E1B" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';

const ARTES = {
  brownie: `
    <ellipse cx="80" cy="92" rx="56" ry="10" fill="#FFFDF9" ${T}/>
    <path d="M38 60 94 51l26 10-56 10z" fill="#7A4A2A" ${T}/>
    <path d="M38 60 64 71v17L38 77z" fill="#4A2E1B" ${T}/>
    <path d="M64 71l56-10v17l-56 10z" fill="#5E3920" ${T}/>
    <path d="M55 60.5q5-2.5 10 0M76 56.5q6-2.5 12 0M92 62q5-2 10 .5" fill="none" stroke="#C68B59" stroke-width="2" stroke-linecap="round"/>
    <circle cx="127" cy="88" r="2.4" fill="#4A2E1B"/>
    <circle cx="33" cy="90" r="2" fill="#4A2E1B"/>
    <circle cx="120" cy="95" r="1.6" fill="#4A2E1B"/>`,
  'bolo-de-pote': `
    <ellipse cx="80" cy="101" rx="36" ry="4.5" fill="#4A2E1B" opacity=".1"/>
    <path d="M54 34h52v54a10 10 0 0 1-10 10H64a10 10 0 0 1-10-10z" fill="#FFFDF9"/>
    <path d="M57 79h46v9a7 7 0 0 1-7 7H64a7 7 0 0 1-7-7z" fill="#6B4226"/>
    <path d="M57 67h46v12H57z" fill="#F0B2A8"/>
    <path d="M57 55h46v12H57z" fill="#8A5A36"/>
    <path d="M57 45h46v10H57z" fill="#FBEEDB"/>
    <path d="M57 67q5.75-3 11.5 0t11.5 0 11.5 0 11.5 0M57 55q5.75-3 11.5 0t11.5 0 11.5 0 11.5 0" fill="none" stroke="#FFFDF9" stroke-width="1.8"/>
    <path d="M98 44v32" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    <path d="M54 34h52v54a10 10 0 0 1-10 10H64a10 10 0 0 1-10-10z" fill="none" ${T}/>
    <rect x="50" y="22" width="60" height="13" rx="4" fill="#C68B59" ${T}/>
    <path d="M62 28.5h36" stroke="#FFFDF9" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>`,
  pudim: `
    <ellipse cx="80" cy="92" rx="58" ry="10" fill="#FFFDF9" ${T}/>
    <path d="M44 90q36 9 72 0" fill="none" stroke="#8C4A1E" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M50 87 58 50q22-8 44 0l8 37q-30 8-60 0z" fill="#E9B872" ${T}/>
    <path d="M58 50q22-8 44 0" fill="none" ${T}/>
    <ellipse cx="80" cy="49" rx="22" ry="6" fill="#8C4A1E" ${T}/>
    <path d="M62 52q-2 9 1.5 13 3.5-4 1.5-12M96.5 52q2.5 11-.5 16-3.5-5-1.5-15M79 55q-1 7 1 10 2.2-3 .5-10" fill="#8C4A1E" stroke="#4A2E1B" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M68 47q4-1.6 8-1.8" fill="none" stroke="#FBEEDB" stroke-width="2" stroke-linecap="round" opacity=".8"/>`,
  mousse: `
    <ellipse cx="80" cy="103" rx="24" ry="4" fill="#4A2E1B" opacity=".1"/>
    <path d="M46 42h68l-6 33q-28 12-56 0z" fill="#FFFDF9"/>
    <path d="M48.6 56h62.8l-3.4 19q-28 12-56 0z" fill="#F0B2A8"/>
    <path d="M47.5 49h65l-1.1 7h-62.8z" fill="#6B4226"/>
    <path d="M46 42h68l-6 33q-28 12-56 0z" fill="none" ${T}/>
    <path d="M80 81v16M67 100h26" fill="none" ${T}/>
    <path d="M62 42q3-12 17-12 13 0 16 9-7-4-13-2-6 2-8 5" fill="#FBEEDB" ${T}/>
    <path d="M94 33q8-7 15-3-6 7-15 3z" fill="#6B8E71" stroke="#4A2E1B" stroke-width="1.6" stroke-linejoin="round"/>`,
  outro: `
    <ellipse cx="80" cy="100" rx="30" ry="4.5" fill="#4A2E1B" opacity=".1"/>
    <path d="M56 60h48l-6 36H62z" fill="#F0B2A8" ${T}/>
    <path d="M66 62l2 32M80 62v32M94 62l-2 32" stroke="#4A2E1B" stroke-width="1.4" opacity=".35"/>
    <path d="M52 60q-2-14 12-16 2-12 16-12t16 12q14 2 12 16z" fill="#FBEEDB" ${T}/>
    <circle cx="80" cy="28" r="5" fill="#82524A" stroke="#4A2E1B" stroke-width="1.8"/>`,
};

const COM_ARTE = ['brownie', 'bolo-de-pote', 'pudim', 'mousse'];
// Categorias que reaproveitam o desenho de outra.
const ARTE_DE = { 'bombom-de-brownie': 'brownie' };
const slugArte = (categoria) => ARTE_DE[slug(categoria)] || slug(categoria);

export function classeCategoria(categoria) {
  const s = slugArte(categoria);
  return COM_ARTE.includes(s) ? `cat-${s}` : 'cat-outro';
}

export function ilustracao(categoria) {
  const arte = ARTES[slugArte(categoria)] || ARTES.outro;
  return `<svg viewBox="16 12 128 96" aria-hidden="true" focusable="false">${arte}</svg>`;
}

// Foto real do produto (campo imagem_url) ou, se não houver, a ilustração da categoria.
// Com 2+ fotos na galeria (uma por sabor, por exemplo) vira carrossel.
// { carrossel: false } mostra só uma foto (miniaturas do carrinho e da janela de escolha).
const imgHTML = (url, alt = '') => `<img class="foto-produto" src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;

export function midiaProduto(produto, { carrossel = true, sabor = null } = {}) {
  const galeria = produto.galeria || [];

  if (carrossel && galeria.length > 1) {
    return `<div class="carrossel" data-carrossel>
      <div class="carrossel-faixa" role="group" aria-roledescription="carrossel" aria-label="Fotos de ${esc(produto.nome)}" tabindex="0">
        ${galeria.map((g, i) => `<figure class="slide" role="group" aria-label="${i + 1} de ${galeria.length}">
          ${imgHTML(g.url, g.sabor ? `${produto.nome} ${g.sabor}` : produto.nome)}
          ${g.sabor ? `<figcaption class="slide-legenda">${esc(g.sabor)}</figcaption>` : ''}
        </figure>`).join('')}
      </div>
      <button type="button" class="carrossel-seta anterior" data-carrossel-passo="-1" aria-label="Foto anterior">${icone('voltar')}</button>
      <button type="button" class="carrossel-seta proxima" data-carrossel-passo="1" aria-label="Próxima foto">${icone('seguir')}</button>
      <div class="carrossel-pontos" aria-hidden="true">${galeria.map((_, i) => `<span class="${i === 0 ? 'ativo' : ''}"></span>`).join('')}</div>
    </div>`;
  }

  const url = fotoDoItem(produto, sabor);
  return url ? imgHTML(url) : ilustracao(produto.categoria);
}

// Foto que representa um produto/linha do carrinho: a do sabor escolhido, se houver; senão a do produto.
export function fotoDoItem(produto, sabor) {
  const galeria = produto.galeria || [];
  return galeria.find((g) => g.sabor === sabor)?.url || produto.imagem_url || galeria[0]?.url || null;
}

// ---------- Blocos de estado (vazio, erro, carregando) ----------

export function estadoHTML({ titulo, texto = '', acao = '', categoria = 'pudim' }) {
  return `<div class="estado">
    <div class="estado-arte">${ilustracao(categoria)}</div>
    <h2 class="estado-titulo">${titulo}</h2>
    ${texto ? `<p class="estado-texto">${texto}</p>` : ''}
    ${acao}
  </div>`;
}

export function carregandoHTML(rotulo = 'Carregando') {
  return `<div class="carregando" role="status">
    <span class="carregando-ponto"></span><span class="carregando-ponto"></span><span class="carregando-ponto"></span>
    <span class="visualmente-oculto">${rotulo}</span>
  </div>`;
}

// ---------- Toast (aviso rápido no rodapé) ----------

let timerToast;

export function toast(mensagem, tipo = 'sucesso') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.classList.toggle('erro', tipo === 'erro');
  el.innerHTML = `<span class="toast-icone">${icone(tipo === 'erro' ? 'fechar' : 'check')}</span><span>${esc(mensagem)}</span>`;
  el.classList.add('visivel');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => el.classList.remove('visivel'), 2400);
}


// ---------- Itens do pedido (sabor e adicionais) ----------

export function precoLinha(item) {
  return Math.round(((Number(item.preco_unitario) || 0) * (Number(item.quantidade) || 0) - (Number(item.desconto) || 0)) * 100) / 100;
}

// Promoção por quantidade (ex.: 2 pudins por R$ 12): devolve o desconto da linha, em reais.
// Mesma regra do servidor (src/lib/regras.js); o servidor é quem vale.
export function descontoPromo(precoBase, quantidade, promoQtd, promoPreco) {
  if (!(Number(promoQtd) >= 2) || !(Number(promoPreco) > 0)) return 0;
  const grupos = Math.floor(quantidade / Number(promoQtd));
  const cheio = Math.round(precoBase * 100) * Number(promoQtd);
  return Math.max(0, grupos * (cheio - Math.round(Number(promoPreco) * 100))) / 100;
}

// Preço do doce para o sabor escolhido (alguns sabores custam mais). Sem sabor, o preço base.
export function precoDoSabor(produto, sabor) {
  const especial = Number((produto.precos_sabor || {})[sabor]);
  return especial > 0 ? especial : produto.preco;
}

// O preço muda conforme o sabor? Então o cardápio mostra "a partir de".
export function precoVaria(produto) {
  return (produto.sabores || []).some((s) => precoDoSabor(produto, s) !== produto.preco);
}

export function precoMinimo(produto) {
  return Math.min(produto.preco, ...(produto.sabores || []).map((s) => precoDoSabor(produto, s)));
}

export function textoPromo(produto) {
  return Number(produto.promo_qtd) >= 2 && Number(produto.promo_preco) > 0
    ? `${produto.promo_qtd} por ${dinheiro(produto.promo_preco)}`
    : '';
}

export function subtotalPedido(pedido) {
  return (pedido.itens || []).reduce((soma, i) => soma + precoLinha(i), 0);
}

// Linhas pequenas embaixo do nome do doce: "Sabor: Chocotudo", "+ Cobertura de Nutella".
export function metaItemHTML(item) {
  const linhas = [];
  if (item.sabor) linhas.push(`Sabor: ${esc(item.sabor)}`);
  (item.adicionais || []).forEach((a) => linhas.push(`+ ${esc(a.nome)}`));
  if (!linhas.length) return '';
  return `<span class="item-meta">${linhas.map((l) => `<span>${l}</span>`).join('')}</span>`;
}

export function enderecoCompleto(pedido) {
  if (pedido.tipo_entrega === 'retirada') return 'Retirada na doceria';
  return [pedido.endereco_rua, pedido.endereco_complemento, pedido.endereco_bairro, pedido.endereco_cidade]
    .filter(Boolean)
    .join(', ');
}

// Entrega do pedido, como texto: null = a combinar, 0 = nada a mostrar, >0 = valor.
export function textoEntrega(taxa) {
  if (taxa === null) return 'A combinar';
  return Number(taxa) > 0 ? dinheiro(taxa) : '';
}
