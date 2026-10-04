import { criarPedido, listarTaxasEntrega, listarProdutos, buscarLoja } from '../api.js';
import { carrinho } from '../cart.js';
import { CHAVES, lerLocal, gravarLocal } from '../storage.js';
import {
  esc, dinheiro, icone, apenasDigitos, formatarTelefone, PAGAMENTOS, metaItemHTML, estadoHTML, carregandoHTML,
} from '../ui.js';

const OUTRO_BAIRRO = '__outro';

function campoHTML({ id, rotulo, valor = '', tipo = 'text', placeholder = '', autocomplete = '', inputmode = '', opcional = false, dica = '', maxlength = 160 }) {
  const descricao = [dica ? `dica-${id}` : '', `erro-${id}`].filter(Boolean).join(' ');
  return `<div class="campo">
    <label class="campo-rotulo" for="${id}">${rotulo}${opcional ? ' <span class="campo-opcional">(opcional)</span>' : ''}</label>
    <input class="entrada" id="${id}" name="${id}" type="${tipo}" value="${esc(valor)}" maxlength="${maxlength}"
      ${placeholder ? `placeholder="${esc(placeholder)}"` : ''}
      ${autocomplete ? `autocomplete="${autocomplete}"` : ''}
      ${inputmode ? `inputmode="${inputmode}"` : ''}
      aria-describedby="${descricao}">
    ${dica ? `<p class="campo-dica" id="dica-${id}">${dica}</p>` : ''}
    <p class="campo-erro" id="erro-${id}" hidden></p>
  </div>`;
}

const VAZIO = (texto) => `<div class="pagina pagina-estreita">${estadoHTML({
  titulo: 'Não há doces no pedido',
  texto,
  acao: '<a class="botao botao-primario" href="#/">Ver cardápio</a>',
})}</div>`;

export function render({ el, navegar }) {
  if (carrinho.totalItens() === 0) {
    el.innerHTML = VAZIO('Escolha os doces no cardápio antes de informar a entrega.');
    return null;
  }

  let ativo = true;
  // Mesma chave se o envio falhar por rede (o servidor não duplica o pedido); nova a cada resposta do servidor.
  let chaveEnvio = crypto.randomUUID?.() || String(Date.now()) + Math.random();
  el.innerHTML = `<div class="pagina pagina-estreita">${carregandoHTML('Preparando a entrega')}</div>`;

  // Busca tudo junto: bairros/taxas, situação da loja e o cardápio atual (para conferir o carrinho).
  // Se alguma consulta falhar, o checkout segue; o servidor confere tudo de novo ao receber o pedido.
  Promise.all([
    listarTaxasEntrega().catch(() => null),
    buscarLoja().catch(() => null),
    listarProdutos().catch(() => null),
  ]).then(([taxas, loja, produtos]) => {
    if (!ativo) return;
    let mudou = false;
    if (produtos) {
      const antes = carrinho.totalValor();
      const removidos = carrinho.sincronizar(produtos);
      mudou = removidos > 0 || carrinho.totalValor() !== antes;
    }
    if (carrinho.totalItens() === 0) {
      el.innerHTML = VAZIO('Os doces do seu pedido saíram do cardápio. Escolha outros, por favor.');
      return;
    }
    montar(taxas || [], taxas === null, loja || { aberta: true, aceita_entrega: true, aceita_retirada: false }, mudou);
  });

  function montar(taxas, falhouTaxas, loja, cardapioMudou) {
    const comTaxas = taxas.length > 0;
    const salvo = lerLocal(CHAVES.cliente, {}) || {};
    const itens = carrinho.itens;
    const observacoesCarrinho = carrinho.observacoes.trim();
    const subtotal = carrinho.totalValor();
    const bairroSalvoNaLista = comTaxas && taxas.some((t) => t.bairro === salvo.endereco_bairro);
    // Bairro salvo que não está na lista: reabre como "Outro bairro", já preenchido.
    const bairroSalvoOutro = comTaxas && Boolean(salvo.endereco_bairro) && !bairroSalvoNaLista;

    const modos = [
      loja.aceita_entrega !== false && { valor: 'entrega', rotulo: 'Entrega', detalhe: 'Levamos até você.' },
      loja.aceita_retirada && { valor: 'retirada', rotulo: 'Retirar na doceria', detalhe: loja.endereco_retirada || 'Combine o horário pelo WhatsApp.' },
    ].filter(Boolean);
    const modoInicial = modos.some((m) => m.valor === salvo.tipo_entrega) ? salvo.tipo_entrega : modos[0].valor;

    const campoBairro = comTaxas ? `
      <div class="campo">
        <label class="campo-rotulo" for="bairro_sel">Bairro</label>
        <select class="entrada" id="bairro_sel" name="bairro_sel" aria-describedby="erro-bairro_sel">
          <option value="">Selecione o bairro</option>
          ${taxas.map((t) => `<option value="${esc(t.bairro)}" ${bairroSalvoNaLista && t.bairro === salvo.endereco_bairro ? 'selected' : ''}>${esc(t.bairro)}: ${t.taxa > 0 ? dinheiro(t.taxa) : 'entrega grátis'}</option>`).join('')}
          <option value="${OUTRO_BAIRRO}" ${bairroSalvoOutro ? 'selected' : ''}>Outro bairro</option>
        </select>
        <p class="campo-erro" id="erro-bairro_sel" hidden></p>
      </div>
      <div data-bairro-outro ${bairroSalvoOutro ? '' : 'hidden'}>
        ${campoHTML({ id: 'bairro_outro', rotulo: 'Qual é o seu bairro?', valor: bairroSalvoOutro ? salvo.endereco_bairro : '', maxlength: 80, dica: 'A taxa de entrega para esse bairro será combinada pelo WhatsApp.' })}
      </div>`
      : campoHTML({ id: 'endereco_bairro', rotulo: 'Bairro', valor: salvo.endereco_bairro, autocomplete: 'address-level3', maxlength: 80 });

    el.innerHTML = `
      <div class="pagina pagina-estreita">
        <a class="link-voltar" href="#/carrinho">${icone('voltar')} Voltar ao pedido</a>
        <h1 class="titulo-pagina">Entrega e pagamento</h1>
        <p class="texto-apoio">Preencha os dados para a cozinha preparar seus doces.</p>

        <form class="pilha espaco-topo" data-form novalidate>
          ${loja.aberta === false ? `<div class="aviso aviso-erro" role="alert">${esc(loja.aviso)}</div>` : ''}
          ${cardapioMudou ? '<div class="aviso aviso-info" role="status">O cardápio foi atualizado enquanto você escolhia. Os valores abaixo já estão corrigidos; confira antes de confirmar.</div>' : ''}
          <div class="aviso aviso-erro" data-erro-geral role="alert" hidden></div>
          ${falhouTaxas ? '<div class="aviso aviso-info">Não conseguimos consultar a taxa de entrega agora. A doceria confirma o valor com você pelo WhatsApp.</div>' : ''}

          <section class="cartao">
            <h2 class="cartao-titulo">Quem vai receber</h2>
            <div class="campos">
              ${campoHTML({ id: 'cliente_nome', rotulo: 'Nome completo', valor: salvo.cliente_nome, autocomplete: 'name', maxlength: 120 })}
              ${campoHTML({
                id: 'cliente_whatsapp', rotulo: 'WhatsApp com DDD', tipo: 'tel', inputmode: 'tel', autocomplete: 'tel-national',
                placeholder: '(00) 00000-0000', valor: formatarTelefone(salvo.cliente_whatsapp), maxlength: 16,
                dica: 'A cozinha usa esse número para falar com você sobre o pedido.',
              })}
            </div>
          </section>

          ${modos.length > 1 ? `
            <section class="cartao">
              <h2 class="cartao-titulo" id="titulo-modo">Como prefere receber?</h2>
              <fieldset class="opcoes-pagamento" aria-labelledby="titulo-modo">
                ${modos.map((m) => `
                  <label class="opcao">
                    <input type="radio" name="tipo_entrega" value="${m.valor}" ${m.valor === modoInicial ? 'checked' : ''}>
                    <span>
                      <span class="opcao-nome">${m.rotulo}</span>
                      <span class="opcao-detalhe">${esc(m.detalhe)}</span>
                    </span>
                  </label>`).join('')}
              </fieldset>
            </section>` : `<input type="hidden" name="tipo_entrega" value="${modoInicial}">`}

          <section class="cartao" data-bloco-retirada ${modoInicial === 'retirada' ? '' : 'hidden'}>
            <h2 class="cartao-titulo">Retirada na doceria</h2>
            <p class="dado">${icone('local')}<span>${esc(loja.endereco_retirada || 'Endereço combinado pelo WhatsApp.')}</span></p>
            <p class="nota">Vamos avisar pelo WhatsApp quando o pedido estiver pronto para retirar.</p>
          </section>

          <section class="cartao" data-bloco-endereco ${modoInicial === 'entrega' ? '' : 'hidden'}>
            <h2 class="cartao-titulo">Endereço de entrega</h2>
            <div class="campos">
              ${campoHTML({ id: 'endereco_rua', rotulo: 'Rua e número', valor: salvo.endereco_rua, autocomplete: 'address-line1', placeholder: 'Ex.: Rua das Flores, 120' })}
              ${campoBairro}
              ${campoHTML({ id: 'endereco_cidade', rotulo: 'Cidade', valor: salvo.endereco_cidade, opcional: true, autocomplete: 'address-level2', maxlength: 80 })}
              ${campoHTML({ id: 'endereco_complemento', rotulo: 'Complemento ou referência', valor: salvo.endereco_complemento, opcional: true, autocomplete: 'address-line2', placeholder: 'Ex.: casa azul, apto 2' })}
            </div>
          </section>

          <section class="cartao">
            <h2 class="cartao-titulo" id="titulo-pagamento">Pagamento</h2>
            <fieldset class="opcoes-pagamento" aria-labelledby="titulo-pagamento" aria-describedby="erro-forma_pagamento">
              ${PAGAMENTOS.map((op) => `
                <label class="opcao">
                  <input type="radio" name="forma_pagamento" value="${op.valor}" ${salvo.forma_pagamento === op.valor ? 'checked' : ''}>
                  <span>
                    <span class="opcao-nome">${op.rotulo}</span>
                    <span class="opcao-detalhe">${op.detalhe}</span>
                  </span>
                </label>`).join('')}
            </fieldset>
            <p class="campo-erro espaco-topo-sm" id="erro-forma_pagamento" hidden></p>
            <div class="campo espaco-topo-sm" data-troco ${salvo.forma_pagamento === 'dinheiro' ? '' : 'hidden'}>
              <label class="campo-rotulo" for="troco">Troco para quanto? <span class="campo-opcional">(opcional)</span></label>
              <input class="entrada" id="troco" name="troco" inputmode="decimal" autocomplete="off" maxlength="10" placeholder="Ex.: 50">
            </div>
          </section>

          <section class="cartao">
            <h2 class="cartao-titulo">Resumo</h2>
            ${itens.map((i) => `
              <div class="resumo-item">
                <div class="resumo-item-nome">
                  <span>${i.quantidade}x ${esc(i.nome)}</span>
                  ${metaItemHTML(i)}
                </div>
                <span>${dinheiro(i.total_linha)}</span>
              </div>`).join('')}
            ${observacoesCarrinho ? `<p class="resumo-obs">${esc(observacoesCarrinho)}</p>` : ''}
            <div data-totais aria-live="polite"></div>
          </section>

          <button type="submit" class="botao botao-primario botao-bloco" data-enviar ${loja.aberta === false ? 'disabled' : ''}>
            ${loja.aberta === false ? 'Loja fechada no momento' : 'Confirmar pedido'}
          </button>
          <p class="campo-dica centro">Seus dados ficam salvos neste aparelho para o próximo pedido.</p>
        </form>
      </div>`;

    const form = el.querySelector('[data-form]');
    const erroGeral = el.querySelector('[data-erro-geral]');
    const botaoEnviar = el.querySelector('[data-enviar]');
    const blocoTroco = el.querySelector('[data-troco]');
    const totais = el.querySelector('[data-totais]');
    const blocoOutro = el.querySelector('[data-bairro-outro]');
    const blocoEndereco = el.querySelector('[data-bloco-endereco]');
    const blocoRetirada = el.querySelector('[data-bloco-retirada]');

    const valor = (nome) => (form.elements[nome]?.value || '').trim();
    const modo = () => form.elements.tipo_entrega.value;

    // Situação da entrega conforme o modo e o bairro escolhido.
    function entregaAtual() {
      if (modo() === 'retirada') return { tipo: 'retirada', valor: 0 };
      if (!comTaxas) return { tipo: 'nenhuma', valor: 0 };
      const escolhido = form.elements.bairro_sel.value;
      if (!escolhido) return { tipo: 'indefinida', valor: 0 };
      if (escolhido === OUTRO_BAIRRO) return { tipo: 'combinar', valor: 0 };
      return { tipo: 'valor', valor: taxas.find((t) => t.bairro === escolhido)?.taxa ?? 0 };
    }

    function desenharTotais() {
      const entrega = entregaAtual();
      const linhaEntrega = {
        retirada: '<div class="resumo-linha"><span>Retirada na doceria</span><span>Sem taxa</span></div>',
        nenhuma: '<div class="resumo-linha"><span>Entrega</span><span>Grátis</span></div>',
        indefinida: '<div class="resumo-linha"><span>Entrega</span><span class="texto-suave">escolha o bairro</span></div>',
        combinar: '<div class="resumo-linha"><span>Entrega</span><span>A combinar</span></div>',
        valor: `<div class="resumo-linha"><span>Entrega</span><span>${entrega.valor > 0 ? dinheiro(entrega.valor) : 'Grátis'}</span></div>`,
      }[entrega.tipo];

      totais.innerHTML = `
        <div class="resumo-linha"><span>Doces</span><span>${dinheiro(subtotal)}</span></div>
        ${linhaEntrega}
        <div class="resumo-total">
          <span>Total</span>
          <strong>${dinheiro(subtotal + entrega.valor)}</strong>
        </div>
        ${entrega.tipo === 'combinar' ? '<p class="nota">Este total não inclui a taxa de entrega, que será combinada pelo WhatsApp.</p>' : ''}`;
    }

    function mostrarErro(nome, mensagem) {
      const msg = el.querySelector(`#erro-${nome}`);
      if (msg) {
        msg.textContent = mensagem || '';
        msg.hidden = !mensagem;
      }
      if (nome === 'forma_pagamento') return;
      form.elements[nome]?.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
    }

    function bairroEscolhido() {
      if (!comTaxas) return valor('endereco_bairro');
      const escolhido = form.elements.bairro_sel.value;
      return escolhido === OUTRO_BAIRRO ? valor('bairro_outro') : escolhido;
    }

    function validar() {
      const erros = {};
      const entrega = modo() === 'entrega';
      if (valor('cliente_nome').length < 2) erros.cliente_nome = 'Informe o nome de quem vai receber.';
      const telefone = apenasDigitos(valor('cliente_whatsapp'));
      if (telefone.length < 10 || telefone.length > 11) erros.cliente_whatsapp = 'Informe o WhatsApp com DDD, como (11) 98765-4321.';
      if (entrega && valor('endereco_rua').length < 3) erros.endereco_rua = 'Informe a rua e o número.';
      if (entrega && !comTaxas && valor('endereco_bairro').length < 2) erros.endereco_bairro = 'Informe o bairro.';
      if (entrega && comTaxas && !form.elements.bairro_sel.value) erros.bairro_sel = 'Escolha o bairro para calcular a entrega.';
      if (entrega && comTaxas && form.elements.bairro_sel.value === OUTRO_BAIRRO && valor('bairro_outro').length < 2) erros.bairro_outro = 'Informe o seu bairro.';
      if (!form.elements.forma_pagamento.value) erros.forma_pagamento = 'Escolha a forma de pagamento.';

      ['cliente_nome', 'cliente_whatsapp', 'endereco_rua', 'endereco_bairro', 'bairro_sel', 'bairro_outro', 'forma_pagamento'].forEach((nome) => {
        if (form.elements[nome] || nome === 'forma_pagamento') mostrarErro(nome, erros[nome]);
      });
      return erros;
    }

    // Máscara do telefone enquanto digita.
    form.elements.cliente_whatsapp.addEventListener('input', (evento) => {
      evento.target.value = formatarTelefone(evento.target.value);
    });

    form.addEventListener('input', (evento) => {
      const nome = evento.target.name;
      if (evento.target.getAttribute('aria-invalid') === 'true') mostrarErro(nome, '');
    });

    form.addEventListener('change', (evento) => {
      const nome = evento.target.name;
      if (nome === 'tipo_entrega') {
        const retirada = evento.target.value === 'retirada';
        blocoEndereco.hidden = retirada;
        blocoRetirada.hidden = !retirada;
        ['endereco_rua', 'endereco_bairro', 'bairro_sel', 'bairro_outro'].forEach((n) => mostrarErro(n, ''));
        desenharTotais();
      }
      if (nome === 'forma_pagamento') {
        mostrarErro('forma_pagamento', '');
        blocoTroco.hidden = evento.target.value !== 'dinheiro';
      }
      if (nome === 'bairro_sel') {
        mostrarErro('bairro_sel', '');
        blocoOutro.hidden = evento.target.value !== OUTRO_BAIRRO;
        desenharTotais();
      }
    });

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      erroGeral.hidden = true;
      if (loja.aberta === false) return;

      const erros = validar();
      const primeiroErro = Object.keys(erros)[0];
      if (primeiroErro) {
        const campo = primeiroErro === 'forma_pagamento'
          ? form.querySelector('input[name="forma_pagamento"]')
          : form.elements[primeiroErro];
        campo?.focus();
        campo?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }

      const forma = form.elements.forma_pagamento.value;
      const troco = forma === 'dinheiro' ? valor('troco') : '';
      const observacoes = [observacoesCarrinho, troco ? `Troco para R$ ${troco}` : ''].filter(Boolean).join('\n');
      const tipo = modo();

      // Guarda o endereço digitado mesmo quando o pedido é retirada (para o próximo pedido com entrega).
      const cliente = {
        cliente_nome: valor('cliente_nome'),
        cliente_whatsapp: apenasDigitos(valor('cliente_whatsapp')),
        endereco_rua: valor('endereco_rua'),
        endereco_bairro: bairroEscolhido() || null,
        endereco_cidade: valor('endereco_cidade') || null,
        endereco_complemento: valor('endereco_complemento') || null,
        forma_pagamento: forma,
        tipo_entrega: tipo,
      };

      const dados = {
        ...cliente,
        observacoes: observacoes || null,
        itens: carrinho.itens.map((i) => ({
          produto_id: i.produto_id,
          quantidade: i.quantidade,
          sabor: i.sabor,
          adicionais: i.adicionais.map((a) => a.id),
        })),
      };

      botaoEnviar.disabled = true;
      botaoEnviar.textContent = 'Enviando pedido…';

      try {
        const pedido = await criarPedido(dados, chaveEnvio);
        gravarLocal(CHAVES.cliente, cliente);
        carrinho.limpar();
        if (ativo) navegar(`/pedido/${encodeURIComponent(pedido.codigo)}?novo=1`);
      } catch (erro) {
        if (erro.status) chaveEnvio = crypto.randomUUID?.() || String(Date.now()) + Math.random();
        if (!ativo) return;
        erroGeral.textContent = erro.message || 'Não foi possível enviar o pedido. Tente de novo.';
        erroGeral.hidden = false;
        erroGeral.scrollIntoView({ block: 'center', behavior: 'smooth' });
        botaoEnviar.disabled = false;
        botaoEnviar.textContent = 'Confirmar pedido';
      }
    });

    desenharTotais();
  }

  return () => {
    ativo = false;
  };
}
