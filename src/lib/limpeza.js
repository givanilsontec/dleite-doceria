// Privacidade (LGPD): dados pessoais não ficam guardados para sempre.
// Depois de DIAS_DADOS_PESSOAIS, o pedido continua no banco (o que foi vendido e o valor, para histórico),
// mas nome, telefone, endereço e observações do cliente são apagados. Os registros de acesso ao painel
// (que guardam IP) seguem o mesmo prazo.
const DIAS_DADOS_PESSOAIS = 15;
const INTERVALO_MS = 6 * 60 * 60 * 1000; // confere a cada 6 horas

async function apagarDadosAntigos(db) {
  const pedidos = await db.query(
    `update pedidos set
       cliente_nome = '(dados removidos)', cliente_whatsapp = '',
       endereco_rua = null, endereco_bairro = null, endereco_cidade = null, endereco_complemento = null,
       observacoes = null, chave_idempotencia = null, dados_removidos = true
     where dados_removidos = false and criado_em < now() - make_interval(days => $1)`,
    [DIAS_DADOS_PESSOAIS],
  );
  const acessos = await db.query(
    'delete from painel_acessos where quando < now() - make_interval(days => $1)',
    [DIAS_DADOS_PESSOAIS],
  );
  return { pedidos: pedidos.rowCount, acessos: acessos.rowCount };
}

// Roda ao iniciar o servidor e depois a cada 6 horas. Uma falha (banco fora do ar) só é registrada no log.
function agendarLimpeza(db) {
  const rodar = () => apagarDadosAntigos(db)
    .then(({ pedidos, acessos }) => {
      if (pedidos || acessos) console.log(`Privacidade: dados pessoais removidos de ${pedidos} pedido(s) e ${acessos} acesso(s) antigos.`);
    })
    .catch((erro) => console.error('Falha na limpeza de dados antigos:', erro.message));
  rodar();
  return setInterval(rodar, INTERVALO_MS);
}

module.exports = { DIAS_DADOS_PESSOAIS, apagarDadosAntigos, agendarLimpeza };
