// professor.js — painel do professor: monitoramento, correção, configuração e LLM/exportação
import { $, h, esc, toast, confirmar, baixar, fmtDataHora, fmtHora, fmtDuracao, fmtNota, cabecalhoInstitucional } from './util.js';
import { api, agoraServidor } from './api.js';
import { htmlQuestaoLeitura, htmlVerificacao } from './render.js';

const app = $('#app');
const LETRAS = 'ABCDE';
let senha = sessionStorage.getItem('prova_alg_prof_senha') || '';
let cfg = null;
let abaAtual = 'monitor';
let timerMonitor = null;
let selecionada = null;

const adm = (acao, dados = {}, op) => api(acao, Object.assign({ senha }, dados), op);

const ROT_STATUS = { em_andamento: ['Em andamento', 'andamento'], entregue: ['Entregue', 'entregue'], expirada: ['Expirada (auto)', 'expirada'], excluida: ['Excluída', 'cinza'] };
const ROT_EVENTO = { saiu_tela_cheia: 'tela cheia', aba_oculta: 'aba/minimizar', perdeu_foco: 'foco', retomada: 'retomada', recarregou: 'recarga' };

const selo = status => { const r = ROT_STATUS[status] || [status, 'cinza']; return h('span', { class: 'selo ' + r[1] }, r[0]); };
const seloTipo = x => h('span', { class: 'selo ' + (x.sae ? 'expirada' : 'andamento') }, x.sae ? 'SAE' : 'Tipo ' + x.tipo);

/* ---------------- Ocorrências: desfazer / restaurar ---------------- */
/** Lista de eventos de uma tentativa com botões para desfazer (anular) e restaurar ocorrências. */
function listaOcorrencias(id, eventos, aoMudar) {
  const cont = h('div', { class: 'ocorr-lista' });
  const desenhar = evs => {
    cont.innerHTML = '';
    const contaveis = evs.filter(e => e.contavel);
    const validas = contaveis.filter(e => !e.anulado).length;
    cont.append(h('div', { class: 'linha-flex', style: { marginBottom: '8px' } },
      h('span', { class: 'pequeno' }, `${validas} ocorrência(s) válida(s) de ${contaveis.length} registrada(s).`), h('span', { class: 'espaco' }),
      contaveis.some(e => !e.anulado) ? h('button', { class: 'btn sec peq', onclick: () => mudar({ todas: true, anular: true }, 'Desfazer TODAS as ocorrências deste aluno?') }, 'Desfazer todas') : null,
      contaveis.some(e => e.anulado) ? h('button', { class: 'btn sec peq', onclick: () => mudar({ todas: true, anular: false }, 'Restaurar todas as ocorrências desfeitas?') }, 'Restaurar todas') : null));
    if (!evs.length) cont.append(h('p', { class: 'mudo pequeno' }, 'Nenhum evento registrado.'));
    evs.forEach(e => cont.append(h('div', { class: 'ocorr-item' + (e.anulado ? ' anulada' : '') + (e.contavel ? ' contavel' : '') },
      h('span', { class: 'ocorr-hora' }, fmtDataHora(e.ts)),
      h('span', { class: 'ocorr-det' }, e.detalhe + (e.duracaoSeg ? ` (${e.duracaoSeg} s)` : ''), e.anulado ? h('span', { class: 'selo cinza', style: { marginLeft: '6px' } }, 'desfeita') : null),
      e.contavel ? h('button', { class: 'btn peq ' + (e.anulado ? 'sec' : 'fantasma'), onclick: () => mudar({ linha: e.linha, anular: !e.anulado }) }, e.anulado ? '↺ Restaurar' : '✕ Desfazer') : h('span'))));
  };
  const mudar = async (dados, pergunta) => {
    if (pergunta && !(await confirmar({ titulo: 'Confirmar', mensagem: pergunta, ok: 'Confirmar' }))) return;
    try {
      const r = await adm('adminAnularEvento', Object.assign({ id }, dados));
      desenhar(r.eventos);
      toast(dados.anular ? 'Ocorrência desfeita. Total atualizado: ' + r.resumo.nEventos : 'Ocorrência restaurada. Total: ' + r.resumo.nEventos, 'ok');
      aoMudar && aoMudar(r.resumo);
    } catch (e) { falha(e); }
  };
  desenhar(eventos);
  return cont;
}

async function modalOcorrencias(x, aoMudar) {
  let evs;
  try { evs = (await adm('adminEventos', { id: x.id })).eventos; } catch (e) { falha(e); return; }
  const fundo = h('div', { class: 'modal-fundo' });
  fundo.append(h('div', { class: 'modal', style: { maxWidth: '760px' } },
    h('h3', {}, 'Ocorrências — ' + x.nome),
    h('p', { class: 'pequeno mudo' }, 'Desfazer uma ocorrência (por exemplo, um problema técnico ou uma saída autorizada) a retira da contagem; ela continua no histórico marcada como “desfeita” e pode ser restaurada.'),
    listaOcorrencias(x.id, evs, aoMudar),
    h('div', { class: 'acoes' }, h('button', { class: 'btn', onclick: () => fundo.remove() }, 'Fechar'))));
  fundo.addEventListener('click', e => { if (e.target === fundo) fundo.remove(); });
  document.body.append(fundo);
}

/* ---------------- Login ---------------- */
async function login(msg) {
  app.innerHTML = '';
  const inp = h('input', { type: 'password', placeholder: 'Senha do professor', autocomplete: 'current-password' });
  const erro = h('div', { class: 'faixa-estado erro' + (msg ? '' : ' oculto') }, msg || '');
  const entrar = async () => {
    senha = inp.value;
    try { cfg = (await adm('adminLogin')).config; sessionStorage.setItem('prova_alg_prof_senha', senha); painel(); }
    catch (e) { erro.textContent = e.message; erro.classList.remove('oculto'); }
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
  app.append(cabecalhoInstitucional(null), h('div', { class: 'pagina', style: { maxWidth: '460px' } },
    h('div', { class: 'cartao' }, h('h2', {}, 'Área do professor'), erro, h('label', { class: 'campo' }, 'Senha', inp),
      h('button', { class: 'btn', style: { width: '100%' }, onclick: entrar }, 'Entrar'))));
  inp.focus();
}

function painel() {
  app.innerHTML = '';
  const abas = [['monitor', '📡 Monitoramento'], ['correcao', '✍ Correção'], ['config', '⚙ Configuração'], ['llm', '🤖 LLM e exportação']];
  const conteudo = h('div');
  app.append(cabecalhoInstitucional(cfg, h('div', { class: 'linha-flex' }, h('span', { class: 'pequeno mudo' }, 'Painel do professor'),
    h('button', { class: 'btn sec peq', onclick: () => { sessionStorage.removeItem('prova_alg_prof_senha'); senha = ''; login(); } }, 'Sair'))),
  h('div', { class: 'pagina', style: { maxWidth: '1400px' } },
    h('div', { class: 'abas' }, ...abas.map(([id, rot]) => h('button', { class: id === abaAtual ? 'ativa' : '', onclick: () => { abaAtual = id; painel(); } }, rot))),
    conteudo));
  clearInterval(timerMonitor);
  ({ monitor: abaMonitor, correcao: abaCorrecao, config: abaConfig, llm: abaLLM })[abaAtual](conteudo);
}

function falha(e) {
  if (e.codigo === 'NAO_AUTORIZADO') { sessionStorage.removeItem('prova_alg_prof_senha'); login(e.message); return; }
  toast(e.message, 'erro', 6000);
}

/* ---------------- Monitoramento ---------------- */
async function abaMonitor(el) {
  const kpis = h('div', { class: 'kpis' });
  const faixa = h('div', { class: 'faixa-estado info' });
  const tab = h('div', { style: { overflowX: 'auto' } });
  const auto = h('input', { type: 'checkbox', checked: true });
  const excl = h('input', { type: 'checkbox' });
  excl.addEventListener('change', () => carregar());
  el.append(faixa, h('div', { class: 'linha-flex', style: { marginBottom: '10px' } },
    h('label', { class: 'check' }, auto, 'Atualizar automaticamente (20 s)'),
    h('label', { class: 'check' }, excl, 'Mostrar tentativas excluídas'), h('span', { class: 'espaco' }),
    h('button', { class: 'btn sec peq', onclick: () => carregar() }, '↻ Atualizar agora')), kpis, tab);

  async function carregar() {
    let r;
    try { r = await adm('adminListar', { incluirExcluidas: excl.checked }); } catch (e) { falha(e); return; }
    cfg = r.config;
    const ts = r.tentativas;
    const agora = agoraServidor();
    faixa.className = 'faixa-estado ' + ({ aberta: 'aberta', antes: 'antes', encerrada: 'encerrada' }[r.estado] || 'info');
    faixa.textContent = { aberta: 'Prova ABERTA', antes: 'Prova ainda não aberta', encerrada: 'Prazo encerrado (SAE ainda pode entrar)', nao_configurada: 'Horário não configurado (aba Configuração)' }[r.estado] +
      ' · abertura ' + fmtDataHora(cfg.inicio) + ' · horário máximo ' + fmtDataHora(cfg.fim) + ' · duração ' + cfg.duracaoMin + ' min';
    const ativos = ts.filter(t => t.status !== 'excluida');
    kpis.innerHTML = '';
    const k = (n, t) => h('div', { class: 'kpi' }, h('b', {}, String(n)), h('span', {}, t));
    kpis.append(k(ativos.length, 'alunos'), k(ativos.filter(t => t.status === 'em_andamento').length, 'em andamento'),
      k(ativos.filter(t => t.status === 'entregue' || t.status === 'expirada').length, 'entregues'),
      k(ativos.filter(t => t.sae).length, 'prova SAE'),
      k(['A', 'B', 'C'].map(x => x + ': ' + ativos.filter(t => t.tipo === x).length).join(' · '), 'por tipo'),
      k(ativos.reduce((a, t) => a + t.nEventos, 0), 'ocorrências registradas'));
    const t = h('table', { class: 'dados' });
    t.append(h('tr', {}, ...['Aluno', 'Prova', 'Status', 'Início', 'Tempo', 'Último salvamento', 'Ocorrências', 'Objetivas', 'Final', 'Ações'].map(x => h('th', {}, x))));
    ts.sort((a, b) => a.criadoEm - b.criadoEm).forEach(x => {
      const oc = Object.entries(x.resumoEventos || {}).map(([k2, v]) => (ROT_EVENTO[k2] || k2) + ': ' + v).join(' · ');
      const opcoes = x.status === 'excluida'
        ? [['restaurar', 'Restaurar tentativa']]
        : [['estender:10', '+10 min'], ['estender:30', '+30 min'], ['forcarEntrega', 'Forçar entrega'], ['novoCodigo', 'Gerar novo código'],
          ...(x.sae ? [] : [['tornarSAE', 'Converter em prova SAE (apaga respostas)']]), ['excluir', 'Excluir tentativa']];
      const acoes = h('select', { style: { width: 'auto', margin: 0, padding: '4px 6px' } }, h('option', { value: '' }, 'Ações…'), ...opcoes.map(([v, l]) => h('option', { value: v }, l)));
      acoes.addEventListener('change', async () => {
        const [op, min] = acoes.value.split(':');
        const rotulo = acoes.options[acoes.selectedIndex].text;
        acoes.value = '';
        if (!op) return;
        if (!(await confirmar({ titulo: 'Confirmar ação', mensagem: `Aplicar “${rotulo}” para ${x.nome}?`, perigo: ['excluir', 'forcarEntrega', 'tornarSAE'].includes(op) }))) return;
        try { await adm('adminAcao', { id: x.id, op, minutos: Number(min || 0) }); toast('Ação aplicada.', 'ok'); carregar(); } catch (e) { falha(e); }
      });
      let tempo;
      if (x.status !== 'em_andamento') tempo = x.entregueEm ? 'entregue ' + fmtHora(x.entregueEm) : '—';
      else if (x.prazo === null) tempo = h('span', { class: 'selo expirada' }, 'tempo livre');
      else { const rest = x.prazo - agora; tempo = h('span', { style: { fontFamily: 'var(--mono)', color: rest < 600000 ? 'var(--vermelho)' : '' } }, rest > 0 ? fmtDuracao(rest) : 'esgotado'); }
      t.append(h('tr', {},
        h('td', {}, h('b', {}, x.nome), h('div', { class: 'pequeno mudo' }, x.matricula + ' · ' + x.id + ' · código ' + x.codigo)),
        h('td', {}, seloTipo(x)),
        h('td', {}, selo(x.status)),
        h('td', {}, fmtHora(x.criadoEm)),
        h('td', {}, tempo, x.extraMin ? h('div', { class: 'pequeno mudo' }, '+' + x.extraMin + ' min') : null),
        h('td', {}, x.ultimoSalvamento ? 'há ' + fmtDuracao(agora - x.ultimoSalvamento) : '—'),
        h('td', {}, x.sae ? h('span', { class: 'pequeno mudo' }, 'não se aplica') : h('button', { class: 'selo-botao', title: 'Ver, desfazer ou restaurar ocorrências', onclick: () => modalOcorrencias(x, () => carregar()) },
          x.nEventos ? h('span', { class: 'selo vermelho' }, String(x.nEventos)) : h('span', { class: 'selo cinza' }, '0'), h('span', { class: 'pequeno' }, ' gerenciar')), oc && !x.sae ? h('div', { class: 'pequeno mudo' }, oc) : null),
        h('td', {}, fmtNota(x.notaObj)),
        h('td', {}, h('b', {}, fmtNota(x.notaFinal)), h('div', { class: 'pequeno mudo' }, x.liberado ? 'liberada' : x.statusCorrecao)),
        h('td', {}, acoes, ' ', x.status !== 'excluida' ? h('button', { class: 'btn sec peq', onclick: () => { selecionada = x.id; abaAtual = 'correcao'; painel(); } }, 'Abrir') : null)));
    });
    tab.innerHTML = '';
    tab.append(ts.length ? t : h('div', { class: 'cartao mudo' }, 'Nenhum aluno iniciou a prova ainda.'));
  }
  carregar();
  timerMonitor = setInterval(() => { if (auto.checked) carregar(); }, 20000);
}

/* ---------------- Correção ---------------- */
async function abaCorrecao(el) {
  const lista = h('div', { class: 'lista-correcao' });
  const det = h('div');
  el.append(h('div', { class: 'correcao-layout' }, lista, det));
  let ts = [];
  try { ts = (await adm('adminListar')).tentativas; } catch (e) { falha(e); return; }
  ts.sort((a, b) => a.nome.localeCompare(b.nome));
  const desenharLista = () => {
    lista.innerHTML = '';
    if (!ts.length) lista.append(h('div', { style: { padding: '14px' }, class: 'mudo' }, 'Nenhuma prova.'));
    ts.forEach(x => lista.append(h('button', { class: x.id === selecionada ? 'ativo' : '', onclick: () => { selecionada = x.id; desenharLista(); abrir(x.id); } },
      h('b', {}, x.nome), ' ', seloTipo(x),
      h('small', {}, (ROT_STATUS[x.status] || [x.status])[0] + ' · ' + (x.statusCorrecao === 'corrigida' ? '✔ corrigida' : x.statusCorrecao === 'rascunho' ? '✎ rascunho' : 'pendente') + (x.liberado ? ' · liberada' : '') + ' · nota ' + fmtNota(x.notaFinal)))));
  };
  desenharLista();
  if (selecionada) abrir(selecionada); else det.append(h('div', { class: 'cartao mudo' }, 'Selecione um aluno à esquerda.'));

  async function abrir(id) {
    det.innerHTML = '';
    det.append(h('div', { class: 'cartao' }, 'Carregando…'));
    let d;
    try { d = await adm('adminTentativa', { id }); } catch (e) { falha(e); return; }
    det.innerHTML = '';
    const R = d.resumo, cor = d.correcao || {};
    const discs = d.questoes.filter(q => q.tipo === 'discursiva');
    const objs = d.questoes.filter(q => q.tipo === 'objetiva');
    const valorObj = objs.reduce((a, q) => a + q.valor, 0);
    const notas = {};
    const totalEl = h('b', { style: { fontSize: '1.4rem', color: 'var(--azul)' } });
    const recalcular = () => {
      let s = d.objetivas.nota;
      discs.forEach(q => { const v = parseFloat(String(notas[q.id].nota.value).replace(',', '.')); if (!isNaN(v)) s += v; });
      totalEl.textContent = fmtNota(s);
    };
    det.append(h('div', { class: 'cartao' },
      h('div', { class: 'linha-flex' }, h('h2', { style: { margin: 0 } }, R.nome), seloTipo(R), selo(R.status), R.liberado ? h('span', { class: 'selo entregue' }, 'resultado liberado') : null,
        h('span', { class: 'espaco' }), h('span', {}, 'Nota final: '), totalEl),
      h('p', { class: 'pequeno mudo' }, `Matrícula ${R.matricula} · id ${R.id} · código ${R.codigo} · início ${fmtDataHora(R.criadoEm)} · entrega ${fmtDataHora(R.entregueEm)}`),
      h('p', { class: 'pequeno' }, R.sae ? 'Prova adaptada (SAE): sem registro de ocorrências e sem limite de tempo. ' : ['Ocorrências: ', h('b', {}, String(R.nEventos)), ' ', Object.entries(R.resumoEventos || {}).map(([k, v]) => (ROT_EVENTO[k] || k) + ': ' + v).join(' · ')],
        R.arquivoUrl ? h('span', {}, ' · ', h('a', { href: R.arquivoUrl, target: '_blank' }, 'arquivo da prova (Drive)')) : null)));

    const tObj = h('table', { class: 'dados' }, h('tr', {}, ...['Questão', 'Tema', 'Marcada', 'Correta', ''].map(x => h('th', {}, x))));
    objs.forEach(q => {
      const o = d.objetivas.detalhes[q.id];
      const letra = idA => { const i = q.alternativas.findIndex(a => a.id === idA); return i >= 0 ? LETRAS[i] : '—'; };
      tObj.append(h('tr', {}, h('td', {}, 'Q' + q.numero), h('td', {}, q.titulo), h('td', {}, letra(o.marcada)), h('td', {}, letra(o.correta)),
        h('td', {}, o.acertou ? h('span', { class: 'selo entregue' }, '✔ +' + fmtNota(q.valor)) : h('span', { class: 'selo vermelho' }, '✘'))));
    });
    det.append(h('div', { class: 'cartao' }, h('div', { class: 'linha-flex' }, h('h3', { style: { margin: 0 } }, 'Objetivas (correção automática)'), h('span', { class: 'espaco' }), h('b', {}, fmtNota(d.objetivas.nota) + ' / ' + fmtNota(valorObj))),
      tObj,
      h('details', { class: 'colapso' }, h('summary', {}, 'Ver as questões objetivas como o aluno viu'),
        h('div', { html: objs.map(q => htmlQuestaoLeitura(q, d.respostas, { gabarito: true })).join('') }))));

    discs.forEach(q => {
      const v = d.verificacao[q.id];
      const atual = (cor.discursivas || {})[q.id] || {};
      const nota = h('input', { type: 'number', min: '0', max: String(q.valor), step: '0.05', style: { width: '110px' } });
      nota.value = atual.nota !== undefined ? atual.nota : '';
      const fb = h('textarea', { rows: '3', placeholder: 'Feedback individual para o aluno (aparece na página de resultado)' });
      fb.value = atual.feedback || '';
      notas[q.id] = { nota, fb, origem: atual.origem || 'manual' };
      nota.addEventListener('input', () => { notas[q.id].origem = 'manual'; recalcular(); });
      fb.addEventListener('input', () => { notas[q.id].origem = 'manual'; });
      det.append(h('div', { class: 'cartao' },
        h('details', { class: 'colapso', open: true }, h('summary', {}, `Q${q.numero} — ${q.titulo} (valor ${fmtNota(q.valor)})`),
          h('div', { html: htmlQuestaoLeitura(q, d.respostas) }),
          h('details', { class: 'colapso' }, h('summary', {}, 'Rubrica'), h('p', { class: 'pequeno' }, q.rubrica)),
          v ? h('div', {}, h('h4', { style: { marginBottom: '4px' } }, 'Verificação automática'),
            h('div', { class: 'pequeno mudo' }, `Pontuação sugerida: ${fmtNota(v.sugestao)} de ${fmtNota(v.sugestaoMax)} pontos verificáveis automaticamente. ${v.obs || ''}`),
            h('div', { html: htmlVerificacao(v) })) : null),
        h('div', { class: 'bloco-nota' },
          h('div', {}, h('label', { class: 'campo' }, 'Nota (0 a ' + fmtNota(q.valor) + ')', nota),
            v ? h('button', { class: 'btn sec peq', type: 'button', onclick: () => { nota.value = Math.min(q.valor, v.sugestao); notas[q.id].origem = 'manual'; recalcular(); } }, `Usar sugestão (${fmtNota(v.sugestao)})`) : null,
            atual.origem === 'llm' ? h('div', { class: 'pequeno', style: { marginTop: '6px' } }, h('span', { class: 'selo expirada' }, 'sugerida pelo LLM')) : null),
          h('label', { class: 'campo' }, 'Feedback', fb))));
    });

    const geral = h('textarea', { rows: '3', placeholder: 'Comentário geral para o aluno' });
    geral.value = cor.feedbackGeral || '';
    const salvar = async liberar => {
      const disc = {};
      discs.forEach(q => { const n = notas[q.id]; if (String(n.nota.value).trim() !== '') disc[q.id] = { nota: parseFloat(String(n.nota.value).replace(',', '.')), feedback: n.fb.value, origem: n.origem }; });
      const completa = Object.keys(disc).length === discs.length;
      try {
        const r = await adm('adminSalvarCorrecao', { id, correcao: { discursivas: disc, feedbackGeral: geral.value, status: completa ? 'corrigida' : 'rascunho' } });
        if (liberar) await adm('adminLiberar', { ids: [id], liberado: true });
        toast('Correção salva. Nota final: ' + fmtNota(r.notaFinal) + (liberar ? ' — resultado liberado.' : ''), 'ok');
        const x = ts.find(t => t.id === id); if (x) { x.notaFinal = r.notaFinal; x.statusCorrecao = completa ? 'corrigida' : 'rascunho'; if (liberar) x.liberado = true; }
        desenharLista();
        if (liberar) abrir(id);
      } catch (e) { falha(e); }
    };
    det.append(h('div', { class: 'cartao' },
      h('label', { class: 'campo' }, 'Comentário geral', geral),
      h('details', { class: 'colapso', open: !R.sae && R.nEventos > 0 }, h('summary', {}, `Eventos e ocorrências (${(d.eventos || []).length}) — desfazer/restaurar`),
        listaOcorrencias(id, d.eventos || [], resumo => { const x = ts.find(t => t.id === id); if (x) x.nEventos = resumo.nEventos; })),
      h('div', { class: 'linha-flex', style: { marginTop: '12px' } },
        h('button', { class: 'btn', onclick: () => salvar(false) }, '💾 Salvar correção'),
        h('button', { class: 'btn sucesso', onclick: () => salvar(true) }, '💾 Salvar e liberar resultado'),
        R.liberado ? h('button', { class: 'btn sec', onclick: async () => { await adm('adminLiberar', { ids: [id], liberado: false }); toast('Resultado ocultado.'); abrir(id); } }, 'Ocultar resultado') : null,
        h('span', { class: 'espaco' }),
        h('button', { class: 'btn sec', onclick: () => { const i = ts.findIndex(t => t.id === id); if (i < ts.length - 1) { selecionada = ts[i + 1].id; desenharLista(); abrir(selecionada); } } }, 'Próximo aluno →'))));
    recalcular();
  }
}

/* ---------------- Configuração ---------------- */
const paraLocal = ms => { if (!ms) return ''; const d = new Date(Number(ms)); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

async function abaConfig(el) {
  try { cfg = (await adm('adminLogin')).config; } catch (e) { falha(e); return; }
  const campos = {};
  const campo = (k, rot, tipo = 'text', dica = '') => {
    const i = h('input', { type: tipo });
    i.value = tipo === 'datetime-local' ? paraLocal(cfg[k]) : (cfg[k] ?? '');
    campos[k] = i;
    return h('label', { class: 'campo' }, rot, dica ? h('span', { class: 'dica' }, ' — ' + dica) : null, i);
  };
  const chk = (k, rot) => { const i = h('input', { type: 'checkbox' }); i.checked = !!cfg[k]; campos[k] = i; return h('label', { class: 'check', style: { marginBottom: '10px' } }, i, rot); };
  const area = (k, rot) => { const i = h('textarea', { rows: '3' }); i.value = cfg[k] || ''; campos[k] = i; return h('label', { class: 'campo' }, rot, i); };
  const salvar = async () => {
    const novo = {};
    for (const [k, i] of Object.entries(campos)) {
      if (i.type === 'checkbox') novo[k] = i.checked;
      else if (i.type === 'datetime-local') novo[k] = i.value ? new Date(i.value).getTime() : 0;
      else if (i.type === 'number') novo[k] = Number(i.value);
      else novo[k] = i.value;
    }
    try { cfg = (await adm('adminSalvarConfig', { config: novo })).config; toast('Configuração salva.', 'ok'); } catch (e) { falha(e); }
  };
  const lista = h('textarea', { rows: '8', placeholder: '202301234;Nome do aluno;\n202305678;Aluno atendido pelo SAE;SAE' });
  adm('adminAlunos').then(r => { lista.value = r.alunos.map(a => [a.matricula, a.nome, a.sae].join(';').replace(/;$/, '')).join('\n'); }).catch(() => {});
  const novaSenha = h('input', { type: 'password', placeholder: 'Nova senha (mín. 6 caracteres)' });
  el.append(h('div', { class: 'grade-2' },
    h('div', {},
      h('div', { class: 'cartao' }, h('h3', {}, 'Horário'),
        campo('inicio', 'Início (abertura do acesso)', 'datetime-local'),
        campo('fim', 'Horário máximo da prova', 'datetime-local', 'após este horário ninguém começa e todos são encerrados (exceto SAE)'),
        campo('duracaoMin', 'Duração (minutos)', 'number'),
        campo('toleranciaEnvioMin', 'Tolerância para o envio automático chegar (min)', 'number'),
        h('button', { class: 'btn', onclick: salvar }, '💾 Salvar configuração')),
      h('div', { class: 'cartao' }, h('h3', {}, 'Prova adaptada (SAE)'),
        campo('codigoSAE', 'Código que o aluno digita na página inicial', 'text', 'padrão: SAE'),
        chk('restringirSAE', 'Aceitar o código só para matrículas marcadas como SAE na lista de alunos'),
        h('p', { class: 'pequeno mudo' }, 'A prova SAE segue as diretrizes do SAE/NAC: 3 objetivas com 4 alternativas, 2 discursivas desmembradas com a pontuação de cada item, cabeçalho e quadro de instruções sempre disponíveis, fonte Arial maior com espaçamento 1,5. Não tem limite de tempo nem registro de ocorrências.'),
        h('button', { class: 'btn', onclick: salvar }, '💾 Salvar configuração'))),
    h('div', {},
      h('div', { class: 'cartao' }, h('h3', {}, 'Identificação e instruções'),
        campo('titulo', 'Título da prova'), campo('disciplina', 'Disciplina'), campo('curso', 'Curso'), campo('turma', 'Turmas'),
        campo('professor', 'Professor'), campo('periodo', 'Período'),
        area('consulta', 'Regra de consulta (aparece no quadro de instruções)'),
        area('instrucoesExtras', 'Instruções extras'),
        h('button', { class: 'btn', onclick: salvar }, '💾 Salvar configuração')),
      h('div', { class: 'cartao' }, h('h3', {}, 'Lista de alunos (opcional)'),
        h('p', { class: 'pequeno mudo' }, 'Uma linha por aluno: matrícula;nome;SAE (terceira coluna só para quem faz a prova adaptada).'),
        chk('usarListaAlunos', 'Restringir o acesso às matrículas desta lista'),
        lista,
        h('div', { class: 'linha-flex', style: { marginTop: '8px' } },
          h('button', { class: 'btn sec', onclick: async () => { try { const r = await adm('adminAlunos', { lista: lista.value }); toast(r.alunos.length + ' aluno(s) salvos.', 'ok'); } catch (e) { falha(e); } } }, 'Salvar lista'),
          h('button', { class: 'btn', onclick: salvar }, '💾 Salvar configuração'))),
      h('div', { class: 'cartao' }, h('h3', {}, 'Senha do professor'), novaSenha,
        h('button', { class: 'btn sec', style: { marginTop: '8px' }, onclick: async () => {
          try { await adm('adminSenha', { novaSenha: novaSenha.value }); senha = novaSenha.value; sessionStorage.setItem('prova_alg_prof_senha', senha); toast('Senha alterada.', 'ok'); } catch (e) { falha(e); }
        } }, 'Alterar senha')))));
}

/* ---------------- LLM e exportação ---------------- */
function abaLLM(el) {
  const nomes = h('input', { type: 'checkbox' });
  const texto = h('textarea', { rows: '10', placeholder: 'Cole aqui a resposta do LLM (array JSON)…' });
  const sobres = h('input', { type: 'checkbox' });
  el.append(h('div', { class: 'grade-2' },
    h('div', {},
      h('div', { class: 'cartao' }, h('h3', {}, '1. Gerar arquivo para correção por LLM'),
        h('p', {}, 'Gera um único arquivo Markdown com as instruções de correção, as rubricas, as respostas discursivas de todos os alunos que entregaram (sistemas, gráficos, matrizes e passos do escalonamento convertidos em texto) e a verificação automática de cada item. As objetivas já são corrigidas automaticamente.'),
        h('label', { class: 'check', style: { marginBottom: '10px' } }, nomes, 'Incluir nomes e matrículas (por padrão o arquivo é anônimo, identificado só pelo id da tentativa)'),
        h('button', { class: 'btn', onclick: async () => {
          try { const r = await adm('adminExportLLM', { incluirNomes: nomes.checked }, { timeout: 300000 }); baixar('correcao_discursivas_algebra.md', r.markdown, 'text/markdown;charset=utf-8'); } catch (e) { falha(e); }
        } }, '⬇ Baixar arquivo (.md)')),
      h('div', { class: 'cartao' }, h('h3', {}, '2. Importar a correção do LLM'),
        h('p', { class: 'pequeno mudo' }, 'Cole o array JSON devolvido pelo LLM. As notas e feedbacks entram como rascunho (marcados “sugerida pelo LLM”) para você revisar na aba Correção antes de liberar.'),
        texto,
        h('label', { class: 'check', style: { margin: '8px 0' } }, sobres, 'Sobrescrever notas que eu já lancei manualmente'),
        h('button', { class: 'btn', onclick: async () => {
          try { const r = await adm('adminImportLLM', { texto: texto.value, sobrescrever: sobres.checked }); toast(`${r.aplicados} nota(s) importada(s); ${r.ignorados} ignorada(s).`, 'ok', 6000); } catch (e) { falha(e); }
        } }, '⬆ Importar'))),
    h('div', {},
      h('div', { class: 'cartao' }, h('h3', {}, 'Notas'),
        h('p', { class: 'pequeno mudo' }, 'Planilha CSV (separador “;”) com tipo de prova, objetivas, cada discursiva e nota final. Na prova SAE as discursivas são Q4 e Q5.'),
        h('button', { class: 'btn sec', onclick: async () => { try { const r = await adm('adminExportCSV'); baixar('notas_algebra.csv', '﻿' + r.csv, 'text/csv;charset=utf-8'); } catch (e) { falha(e); } } }, '⬇ Exportar notas (CSV)')),
      h('div', { class: 'cartao' }, h('h3', {}, 'Liberação dos resultados'),
        h('p', { class: 'pequeno mudo' }, 'Os alunos só veem a correção depois de liberada (matrícula + código de consulta).'),
        h('div', { class: 'linha-flex' },
          h('button', { class: 'btn sucesso', onclick: () => liberarTodas(true) }, 'Liberar todas as corrigidas'),
          h('button', { class: 'btn sec', onclick: () => liberarTodas(false) }, 'Ocultar todas'))))));
}

async function liberarTodas(lib) {
  try {
    const ts = (await adm('adminListar')).tentativas;
    const ids = ts.filter(t => !lib || t.statusCorrecao === 'corrigida').map(t => t.id);
    if (!(await confirmar({ titulo: lib ? 'Liberar resultados?' : 'Ocultar resultados?', mensagem: `${ids.length} prova(s) serão afetadas.`, ok: 'Confirmar' }))) return;
    const r = await adm('adminLiberar', { ids, liberado: lib });
    toast(r.alterados + ' prova(s) atualizadas.', 'ok');
  } catch (e) { falha(e); }
}

if (senha) adm('adminLogin').then(r => { cfg = r.config; painel(); }).catch(e => login(e.message)); else login();
