// Loja e horário: pausar pedidos, horário de funcionamento por dia, entrega e retirada.

import { lerLojaPainel, salvarLojaPainel, sairDoPainel } from '../api.js';
import { renderComLogin, abrirAlterarSenha } from './painel.js';
import { esc, icone, estadoHTML, carregandoHTML, toast } from '../ui.js';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
// Segunda primeiro, como as pessoas costumam ler a semana.
const ORDEM = [1, 2, 3, 4, 5, 6, 0];

function diaHTML(d, h) {
  return `<div class="dia-linha" data-dia="${d}">
    <label class="dia-nome"><input type="checkbox" name="aberto_${d}" ${h ? 'checked' : ''}> ${DIAS[d]}</label>
    <input class="entrada entrada-hora" type="time" name="abre_${d}" value="${esc(h?.abre || '14:00')}" aria-label="${DIAS[d]}: abre às" ${h ? '' : 'disabled'}>
    <span class="dia-ate">até</span>
    <input class="entrada entrada-hora" type="time" name="fecha_${d}" value="${esc(h?.fecha || '20:00')}" aria-label="${DIAS[d]}: fecha às" ${h ? '' : 'disabled'}>
  </div>`;
}

function renderLoja({ el, aoExpirar }) {
  let ativo = true;

  el.innerHTML = `
    <header class="painel-topo">
      <div class="painel-topo-interno">
        <div>
          <h1 class="painel-titulo">Loja e horário</h1>
          <p class="painel-sub">Quando o site aceita pedidos, e como o cliente recebe.</p>
        </div>
        <div class="painel-topo-acoes">
          <a class="botao botao-secundario botao-pequeno" href="#/painel">Pedidos</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/cardapio">Cardápio</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/vendas">Vendas</a>
          <a class="botao botao-secundario botao-pequeno" href="#/painel/entrega">Entrega</a>
          <button type="button" class="botao botao-fantasma botao-pequeno" data-acao="senha">Senha</button>
          <button type="button" class="botao botao-fantasma botao-pequeno" data-acao="sair">Sair</button>
          <a class="botao botao-fantasma botao-pequeno" href="#/">${icone('loja')} Ver site</a>
        </div>
      </div>
    </header>
    <div class="gestao" data-conteudo>${carregandoHTML('Carregando')}</div>`;

  const conteudo = el.querySelector('[data-conteudo]');

  function desenhar({ config: c, estado }) {
    conteudo.innerHTML = `
      <div class="estado-loja ${estado.aberta ? 'aberta' : 'fechada'}">
        <span>${estado.aberta ? 'Loja aberta agora, recebendo pedidos.' : esc(estado.aviso)}</span>
      </div>

      <form class="pilha" data-form novalidate>
        <section class="cartao">
          <h2 class="cartao-titulo">Pausar pedidos</h2>
          <label class="opcao"><input type="checkbox" name="pausado" ${c.pausado ? 'checked' : ''}>
            <span><span class="opcao-nome">Pedidos pausados</span>
            <span class="opcao-detalhe">Use quando acabar o estoque ou precisar parar. Vale até desmarcar.</span></span></label>
          <div class="campo espaco-topo-sm">
            <label class="campo-rotulo" for="mensagem_pausa">Mensagem no site <span class="campo-opcional">(opcional)</span></label>
            <input class="entrada" id="mensagem_pausa" name="mensagem_pausa" maxlength="200" value="${esc(c.mensagem_pausa)}"
              placeholder="Ex.: Voltamos amanhã às 14h!">
          </div>
        </section>

        <section class="cartao">
          <h2 class="cartao-titulo">Horário de funcionamento</h2>
          <label class="opcao"><input type="checkbox" name="usar_horario" ${c.usar_horario ? 'checked' : ''}>
            <span><span class="opcao-nome">Seguir o horário abaixo</span>
            <span class="opcao-detalhe">Fora do horário o site avisa quando abre e não aceita pedidos. Desmarcado = aberto o tempo todo.</span></span></label>
          <div class="dias" data-dias ${c.usar_horario ? '' : 'hidden'}>
            ${ORDEM.map((d) => diaHTML(d, c.horarios[d])).join('')}
            <p class="campo-dica">Dia desmarcado = fechado. Horário de Recife.</p>
          </div>
        </section>

        <section class="cartao">
          <h2 class="cartao-titulo">Como o cliente recebe</h2>
          <div class="opcoes-pagamento">
            <label class="opcao"><input type="checkbox" name="aceita_entrega" ${c.aceita_entrega ? 'checked' : ''}>
              <span><span class="opcao-nome">Entrega</span></span></label>
            <label class="opcao"><input type="checkbox" name="aceita_retirada" ${c.aceita_retirada ? 'checked' : ''}>
              <span><span class="opcao-nome">Retirada na doceria</span></span></label>
          </div>
          <div class="campo espaco-topo-sm" data-bloco-retirada ${c.aceita_retirada ? '' : 'hidden'}>
            <label class="campo-rotulo" for="endereco_retirada">Endereço para retirada</label>
            <input class="entrada" id="endereco_retirada" name="endereco_retirada" maxlength="200" value="${esc(c.endereco_retirada)}"
              placeholder="Ex.: Rua das Flores, 120, Centro, Carpina">
            <p class="campo-dica">Aparece para o cliente que escolher retirar.</p>
          </div>
        </section>

        <p class="campo-erro" data-erro role="alert" hidden></p>
        <button type="submit" class="botao botao-primario botao-bloco" data-salvar>Salvar</button>
      </form>`;

    const form = conteudo.querySelector('[data-form]');
    const erro = conteudo.querySelector('[data-erro]');
    const botao = conteudo.querySelector('[data-salvar]');

    form.addEventListener('change', (evento) => {
      const { name, checked } = evento.target;
      if (name === 'usar_horario') conteudo.querySelector('[data-dias]').hidden = !checked;
      if (name === 'aceita_retirada') conteudo.querySelector('[data-bloco-retirada]').hidden = !checked;
      if (name.startsWith('aberto_')) {
        const d = name.slice(7);
        form.elements[`abre_${d}`].disabled = !checked;
        form.elements[`fecha_${d}`].disabled = !checked;
      }
    });

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      erro.hidden = true;
      const f = form.elements;
      const horarios = {};
      for (let d = 0; d < 7; d += 1) {
        horarios[d] = f[`aberto_${d}`].checked ? { abre: f[`abre_${d}`].value, fecha: f[`fecha_${d}`].value } : null;
      }
      botao.disabled = true;
      botao.textContent = 'Salvando…';
      try {
        const resposta = await salvarLojaPainel({
          pausado: f.pausado.checked,
          mensagem_pausa: f.mensagem_pausa.value,
          usar_horario: f.usar_horario.checked,
          horarios,
          aceita_entrega: f.aceita_entrega.checked,
          aceita_retirada: f.aceita_retirada.checked,
          endereco_retirada: f.endereco_retirada.value,
        });
        toast('Configuração salva');
        if (ativo) desenhar(resposta);
      } catch (e) {
        if (e.status === 401) { sairDoPainel(); aoExpirar(); return; }
        erro.textContent = e.message || 'Não foi possível salvar.';
        erro.hidden = false;
        botao.disabled = false;
        botao.textContent = 'Salvar';
      }
    });
  }

  async function carregar() {
    try {
      const dados = await lerLojaPainel();
      if (ativo) desenhar(dados);
    } catch (erro) {
      if (!ativo) return;
      if (erro.status === 401) { sairDoPainel(); aoExpirar(); return; }
      conteudo.innerHTML = estadoHTML({ titulo: 'Não deu para carregar', texto: esc(erro.message) });
    }
  }

  el.addEventListener('click', (evento) => {
    const acao = evento.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'senha') abrirAlterarSenha(aoExpirar);
    if (acao === 'sair') { sairDoPainel(); aoExpirar(); }
  });

  carregar();
  return () => { ativo = false; };
}

export function render({ el }) {
  return renderComLogin(el, renderLoja);
}
