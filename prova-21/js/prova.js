// prova.js — página inicial (instruções/identificação) e aplicação da prova
// Modo regular: tela cheia + registro de ocorrências + cronômetro.
// Modo SAE: sem registro de ocorrências, sem tela cheia obrigatória e tempo livre (só copiar/colar bloqueado).
import { $, h, esc, toast, confirmar, baixar, fmtDataHora, fmtHora, fmtDuracao, logoDataUrl, cabecalhoInstitucional } from './util.js';
import { api, apiBeacon, agoraServidor } from './api.js';
import { montarQuestao, progressoQuestao, gerarArquivoProva, htmlCabecalhoProva } from './render.js';
import { criarMonitor, entrarTelaCheia, sairTelaCheia } from './monitor.js';

const app = $('#app');
const CHAVE_SESSAO = 'prova_algebra_sessao';
const INTERVALO_SALVAR = 25000;

const lerSessaoLocal = () => { try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null'); } catch (e) { return null; } };
const gravarSessaoLocal = s => { try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s)); } catch (e) { /* ignore */ } };
const chaveBackup = id => 'prova_algebra_backup_' + id;

/* ============================================================
 *  Página inicial
 * ============================================================ */

let statusServidor = null;
let relogioLanding = null;

async function paginaInicial(msgErro) {
  document.body.classList.remove('em-prova', 'modo-sae');
  app.innerHTML = '';
  app.append(h('div', { class: 'pagina' }, h('div', { class: 'cartao' }, 'Carregando…')));
  try {
    statusServidor = await api('status', {}, { tentativas: 3 });
  } catch (e) {
    app.innerHTML = '';
    app.append(cabecalhoInstitucional(null), h('div', { class: 'pagina' }, h('div', { class: 'faixa-estado erro' }, 'Não foi possível conectar ao servidor da prova: ' + e.message),
      h('button', { class: 'btn', onclick: () => paginaInicial() }, 'Tentar novamente')));
    return;
  }
  const cfg = statusServidor.config;
  document.title = (cfg.titulo || 'Prova') + ' — ' + cfg.disciplina;
  app.innerHTML = '';
  app.append(cabecalhoInstitucional(cfg));

  const faixa = h('div', { class: 'faixa-estado info' });
  const btnIniciar = h('button', { class: 'btn grande', type: 'submit', style: { width: '100%', marginTop: '6px' } }, '▶ Iniciar prova');
  const erro = h('div', { class: 'faixa-estado erro' + (msgErro ? '' : ' oculto') }, msgErro || '');
  const nome = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', maxlength: '80' });
  const mat = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '20' });
  const codigo = h('input', { type: 'text', autocomplete: 'off', maxlength: '20', placeholder: 'Deixe em branco se não tiver', style: { textTransform: 'uppercase' } });
  let tipoEscolhido = '';
  const tipos = h('div', { class: 'tipos' }, ...(cfg.tipos || ['A', 'B', 'C']).map(t => {
    const b = h('button', { type: 'button', class: 'tipo-btn', onclick: () => { tipoEscolhido = t; tipos.querySelectorAll('.tipo-btn').forEach(x => x.classList.toggle('ativo', x === b)); } }, h('small', {}, 'Tipo'), t);
    return b;
  }));
  const blocoTipo = h('div', { class: 'campo' }, h('div', { class: 'rotulo-campo' }, 'Tipo de prova ', h('span', { class: 'dica' }, '— indicado pelo professor')), tipos);
  codigo.addEventListener('input', () => { blocoTipo.classList.toggle('desativado', !!codigo.value.trim()); atualizarFaixa(); });
  const chkConc = h('input', { type: 'checkbox' });

  const sessaoLocal = lerSessaoLocal();
  const cartaoRetomar = sessaoLocal ? h('div', { class: 'cartao', style: { borderColor: 'var(--ambar)' } },
    h('h3', {}, sessaoLocal.entregue ? 'Prova já entregue neste navegador' : 'Há uma prova em andamento neste navegador'),
    h('p', { class: 'pequeno' }, (sessaoLocal.nome || '') + (sessaoLocal.tipo ? ' — prova tipo ' + sessaoLocal.tipo : '')),
    h('div', { class: 'linha-flex' },
      h('button', { class: 'btn ambar', onclick: () => retomar(sessaoLocal) }, sessaoLocal.entregue ? 'Ver comprovante / baixar prova' : '↻ Retomar a prova'),
      h('button', { class: 'btn fantasma peq', onclick: async () => {
        if (await confirmar({ titulo: 'Esquecer esta sessão?', mensagem: 'Use apenas se este computador será usado por outro aluno. A prova continua salva no servidor e pode ser retomada informando a mesma matrícula.', ok: 'Esquecer', perigo: true })) {
          localStorage.removeItem(CHAVE_SESSAO); paginaInicial();
        }
      } }, 'Não sou este aluno'))) : null;

  app.append(h('div', { class: 'pagina' },
    h('div', { class: 'grade-2' },
      h('div', {},
        h('div', { class: 'cartao' },
          h('h1', {}, cfg.titulo || 'Avaliação'),
          h('p', { class: 'mudo', style: { marginTop: '-4px' } }, [cfg.disciplina, 'Turmas ' + cfg.turma, cfg.periodo].filter(Boolean).join(' · ')),
          faixa,
          h('p', { class: 'pequeno mudo' }, 'Abertura: ', h('b', {}, fmtDataHora(cfg.inicio)), ' · Horário máximo: ', h('b', {}, fmtDataHora(cfg.fim))),
          h('h3', { style: { marginTop: '18px' } }, 'Instruções'),
          h('ul', { class: 'regras' }, ...(cfg.instrucoes || []).map((r, i) => h('li', { 'data-i': String(i + 1), html: r }))),
          h('p', { class: 'pequeno mudo', style: { marginTop: '12px' } }, 'Alunos atendidos pelo SAE: digitem o código fornecido no campo “Código”. A prova adaptada tem tempo livre e o quadro de instruções fica disponível durante toda a prova.')),
        h('div', { class: 'linha-flex' }, h('a', { class: 'btn sec', href: 'resultado.html' }, '📝 Consultar resultado'))),
      h('div', {},
        cartaoRetomar,
        h('form', { class: 'cartao', onsubmit: e => { e.preventDefault(); iniciar(); } },
          h('h2', {}, 'Identificação'),
          h('label', { class: 'campo' }, 'Nome completo', nome),
          h('label', { class: 'campo' }, 'Matrícula', mat),
          blocoTipo,
          h('label', { class: 'campo' }, 'Código ', h('span', { class: 'dica' }, '— somente se o professor ou o SAE forneceu um'), codigo),
          h('label', { class: 'check', style: { marginBottom: '14px' } }, chkConc, h('span', {}, 'Li as instruções e estou ciente das regras da prova.')),
          erro, btnIniciar)))),
    h('div', { class: 'rodape' }, 'CESUPA — Centro Universitário do Estado do Pará'));

  function atualizarFaixa() {
    const agora = agoraServidor();
    let est = statusServidor.estado;
    if (cfg.inicio && cfg.fim) est = agora < cfg.inicio ? 'antes' : agora > cfg.fim ? 'encerrada' : 'aberta';
    faixa.className = 'faixa-estado ' + ({ aberta: 'aberta', antes: 'antes', encerrada: 'encerrada' }[est] || 'info');
    if (est === 'nao_configurada') faixa.textContent = 'O professor ainda não definiu o horário desta prova.';
    else if (est === 'antes') { faixa.innerHTML = ''; faixa.append('⏳ A prova abre em ', h('span', { class: 'contagem' }, fmtDuracao(cfg.inicio - agora)), ' (às ' + fmtHora(cfg.inicio) + ').'); }
    else if (est === 'aberta') faixa.textContent = '✅ Prova aberta. Acesso permitido até ' + fmtDataHora(cfg.fim) + '.';
    else faixa.textContent = '⛔ O prazo da prova terminou. Somente alunos com extensão autorizada ou prova adaptada (SAE) podem entrar.';
    const temCodigo = !!codigo.value.trim();
    btnIniciar.disabled = est === 'antes' || est === 'nao_configurada';
    btnIniciar.textContent = est === 'encerrada' && !temCodigo ? '↻ Retomar (somente com extensão autorizada)' : temCodigo ? '▶ Iniciar prova' : '▶ Iniciar prova em tela cheia';
  }
  clearInterval(relogioLanding);
  atualizarFaixa();
  relogioLanding = setInterval(atualizarFaixa, 1000);

  async function iniciar() {
    erro.classList.add('oculto');
    const cod = codigo.value.trim();
    const dados = { nome: nome.value.trim(), matricula: mat.value.trim(), tipo: tipoEscolhido, codigo: cod };
    const falha = msg => { erro.textContent = msg; erro.classList.remove('oculto'); };
    if (!dados.nome || !dados.matricula) return falha('Preencha nome completo e matrícula.');
    if (!/^\d{4,}$/.test(dados.matricula.replace(/\D/g, ''))) return falha('Matrícula inválida: use apenas números.');
    if (!cod && !tipoEscolhido) return falha('Selecione o tipo de prova (A, B ou C) indicado pelo professor.');
    if (!chkConc.checked) return falha('Confirme que leu as instruções.');
    const pedidoTelaCheia = cod ? Promise.resolve(false) : entrarTelaCheia(); // precisa ser chamado dentro do clique
    btnIniciar.disabled = true; btnIniciar.textContent = 'Preparando a prova…';
    try {
      const s = await api('iniciar', dados, { tentativas: 2 });
      if (!s.sae) await pedidoTelaCheia; else sairTelaCheia();
      clearInterval(relogioLanding);
      abrirProva(s);
    } catch (e) {
      sairTelaCheia();
      falha(e.message);
      btnIniciar.disabled = false; atualizarFaixa();
    }
  }
}

async function retomar(local) {
  const pedido = local.entregue || local.sae ? Promise.resolve() : entrarTelaCheia();
  try {
    const s = await api('retomar', { tentativaId: local.tentativaId, token: local.token }, { tentativas: 2 });
    await pedido;
    clearInterval(relogioLanding);
    if (s.status !== 'em_andamento') { sairTelaCheia(); telaFinal(s, { codigo: s.codigo, entregueEm: null }); return; }
    abrirProva(s);
  } catch (e) {
    sairTelaCheia();
    if (e.codigo === 'SESSAO_SUBSTITUIDA' || e.codigo === 'NAO_ENCONTRADA') localStorage.removeItem(CHAVE_SESSAO);
    paginaInicial(e.message);
  }
}

/* ============================================================
 *  Prova
 * ============================================================ */

const P = {};

function abrirProva(s) {
  Object.assign(P, {
    sessao: s, sae: !!s.sae, questoes: s.questoes, respostas: s.respostas || {}, atual: 0, pendentes: new Map(), versao: 0,
    salvando: false, ultimoSalvo: Date.now(), nEventos: s.nEventos || 0, prazo: s.prazo, encerrada: false, filaEventos: [], avisos: {}
  });
  gravarSessaoLocal({ tentativaId: s.tentativaId, token: s.token, nome: s.nome, tipo: s.tipo, sae: P.sae });
  try {
    const bk = JSON.parse(localStorage.getItem(chaveBackup(s.tentativaId)) || 'null');
    if (bk && bk.pendentes) bk.pendentes.forEach(k => { if (bk.respostas[k] !== undefined) { P.respostas[k] = bk.respostas[k]; P.pendentes.set(k, ++P.versao); } });
  } catch (e) { /* ignore */ }

  document.body.classList.add('em-prova');
  document.body.classList.toggle('modo-sae', P.sae);
  montarLayout();
  irPara(0);

  P.monitor = criarMonitor({
    apenasBloqueio: P.sae,
    aoIniciarAusencia: tipo => { if (tipo === 'saiu_tela_cheia') mostrarBloqueioTelaCheia(true); },
    aoFinalizarAusencia: (tipo, dur) => registrarEvento(tipo, dur),
    aoMudarTelaCheia: em => mostrarBloqueioTelaCheia(!em)
  });
  P.monitor.iniciar();
  if (!P.sae && document.fullscreenEnabled === false) registrarEvento('tela_cheia_indisponivel', 0, true);

  P.timer = setInterval(tique, 1000);
  P.timerSalvar = setInterval(() => { if (P.pendentes.size && Date.now() - P.ultimoSalvo >= INTERVALO_SALVAR) salvar(); }, 5000);
  window.addEventListener('pagehide', aoSairDaPagina);
  tique();
  if (P.pendentes.size) salvar();
  if (P.sae) mostrarInstrucoes();
}

function montarLayout() {
  const s = P.sessao;
  app.innerHTML = '';
  P.el = {};
  P.el.relogio = h('div', { class: 'relogio', title: P.sae ? 'Prova adaptada: tempo livre' : 'Tempo restante' }, P.sae ? 'Tempo livre' : '--:--');
  P.el.salvo = h('div', { class: 'status-salvo' }, 'Respostas salvas');
  P.el.ocorr = h('div', { class: 'ocorrencias', title: 'Saídas da tela cheia, trocas de aba e perdas de foco registradas' }, '');
  P.el.nav = h('nav', { class: 'navegacao' });
  P.el.area = h('main', { class: 'area-questao' });
  P.el.corpo = h('div', { class: 'corpo-prova' }, P.el.nav, P.el.area);
  app.append(
    h('div', { class: 'barra-prova' },
      h('img', { class: 'logo-branco', src: 'img/cesupa_logo.png', alt: 'CESUPA' }),
      h('div', { class: 'dupla' }, h('b', {}, s.nome), h('br'), 'Matrícula ' + s.matricula + ' · ', h('b', {}, P.sae ? 'Prova adaptada (SAE)' : 'Prova tipo ' + s.tipo)),
      h('div', { class: 'espaco' }),
      P.el.salvo, P.sae ? null : P.el.ocorr, P.el.relogio,
      h('button', { class: 'btn sec peq', onclick: mostrarInstrucoes }, '📋 Instruções'),
      h('button', { class: 'btn sucesso peq', onclick: () => entregar(false) }, '✔ Entregar prova')),
    P.el.corpo);
  P.el.bloqueio = h('div', { class: 'sobreposicao oculto' },
    h('div', {},
      h('h2', {}, '⚠ Você saiu da tela cheia'),
      h('p', {}, 'Esta ocorrência está sendo registrada (com o tempo que durar). Volte para a tela cheia para continuar a prova.'),
      h('button', { class: 'btn grande', onclick: () => entrarTelaCheia() }, 'Voltar para a tela cheia')));
  app.append(P.el.bloqueio);
  atualizarOcorrencias();
  atualizarNav();
}

function mostrarInstrucoes() {
  confirmar({ titulo: 'Instruções para a prova', html: '<ul class="lista-instrucoes">' + (P.sessao.config.instrucoes || []).map(i => '<li>' + i + '</li>').join('') + '</ul>', ok: 'Entendi', cancelar: null });
}

function mostrarBloqueioTelaCheia(sim) {
  if (!P.el || P.encerrada || P.sae) return;
  P.el.bloqueio.classList.toggle('oculto', !sim);
}

function atualizarOcorrencias() {
  P.el.ocorr.textContent = P.nEventos ? `⚠ ${P.nEventos} ocorrência(s) registrada(s)` : 'Nenhuma ocorrência';
  P.el.ocorr.classList.toggle('tem', P.nEventos > 0);
}

function atualizarNav() {
  const nav = P.el.nav;
  nav.innerHTML = '';
  const objs = P.questoes.filter(q => q.tipo === 'objetiva');
  const discs = P.questoes.filter(q => q.tipo !== 'objetiva');
  const grade = h('div', { class: 'grade-obj n' + objs.length });
  objs.forEach(q => {
    const i = P.questoes.indexOf(q);
    grade.append(h('button', { class: 'nav-item' + (P.respostas[q.id] ? ' respondida' : '') + (i === P.atual ? ' atual' : ''), title: q.titulo, onclick: () => irPara(i) }, String(q.numero)));
  });
  nav.append(h('h4', {}, 'Objetivas'), grade, h('h4', {}, 'Discursivas'));
  discs.forEach(q => {
    const i = P.questoes.indexOf(q);
    const pr = progressoQuestao(q, P.respostas);
    nav.append(h('button', { class: 'nav-item nav-disc' + (pr >= 1 ? ' respondida' : pr > 0 ? ' parcial' : '') + (i === P.atual ? ' atual' : ''), onclick: () => irPara(i) },
      h('b', {}, 'Q' + q.numero + ' '), q.titulo, h('div', { class: 'barra' }, h('i', { style: { width: Math.round(pr * 100) + '%' } }))));
  });
  nav.append(h('div', { class: 'legenda-nav' },
    h('span', { class: 'l-resp' }, 'respondida'), h('span', { class: 'l-parc' }, 'parcialmente respondida'),
    h('div', { style: { marginTop: '8px' } }, `Objetivas respondidas: ${objs.filter(q => P.respostas[q.id]).length}/${objs.length}`)));
}

let navPendente = null;
function agendarNav() { clearTimeout(navPendente); navPendente = setTimeout(atualizarNav, 400); }

function irPara(i) {
  if (i < 0 || i >= P.questoes.length) return;
  P.atual = i;
  renderizarAtual();
  atualizarNav();
  P.el.area.scrollTop = 0;
}

function renderizarAtual() {
  const q = P.questoes[P.atual];
  const cont = h('div');
  if (P.sae) {
    // diretrizes SAE: cabeçalho e quadro de instruções sempre à vista no início de cada questão
    cont.append(h('div', { class: 'questao cab-sae', html: htmlCabecalhoProva({ config: P.sessao.config, sessao: P.sessao, logo: 'img/cesupa_logo.png', semInstrucoes: P.atual !== 0 }) }));
  }
  const qdiv = h('div');
  montarQuestao(qdiv, q, { respostas: P.respostas, sae: P.sae, aoMudar: (id, v) => alterar(id, v) });
  cont.append(qdiv);
  P.el.area.innerHTML = '';
  P.el.area.append(cont, h('div', { class: 'nav-rodape' },
    h('button', { class: 'btn sec', disabled: P.atual === 0, onclick: () => irPara(P.atual - 1) }, '← Anterior'),
    P.atual < P.questoes.length - 1
      ? h('button', { class: 'btn', onclick: () => irPara(P.atual + 1) }, 'Próxima →')
      : h('button', { class: 'btn sucesso', onclick: () => entregar(false) }, '✔ Entregar prova')));
}

function alterar(id, v) {
  if (P.encerrada) return;
  P.respostas[id] = v;
  P.pendentes.set(id, ++P.versao);
  P.el.salvo.textContent = '● Alterações não salvas';
  backupLocal();
  agendarNav();
}

function backupLocal() {
  try { localStorage.setItem(chaveBackup(P.sessao.tentativaId), JSON.stringify({ respostas: P.respostas, pendentes: Array.from(P.pendentes.keys()) })); } catch (e) { /* ignore */ }
}

const cred = () => ({ tentativaId: P.sessao.tentativaId, token: P.sessao.token });

function pacotePendentes() {
  const r = {}, vers = {};
  P.pendentes.forEach((ver, k) => { r[k] = P.respostas[k]; vers[k] = ver; });
  return { r, vers };
}
function confirmarEnviados(vers) {
  Object.entries(vers).forEach(([k, ver]) => { if (P.pendentes.get(k) === ver) P.pendentes.delete(k); });
  backupLocal();
}

async function salvar() {
  if (P.salvando || P.encerrada || !P.pendentes.size) return;
  P.salvando = true;
  const { r, vers } = pacotePendentes();
  P.el.salvo.textContent = '⟳ Salvando…';
  try {
    const res = await api('salvar', Object.assign(cred(), { respostas: r }), { tentativas: 2, timeout: 45000 });
    confirmarEnviados(vers);
    P.ultimoSalvo = Date.now();
    if (res.prazo !== undefined) P.prazo = res.prazo;
    P.el.salvo.textContent = (P.pendentes.size ? '● ' : '✓ Salvo às ') + fmtHora(Date.now());
  } catch (e) {
    P.ultimoSalvo = Date.now() - INTERVALO_SALVAR + 8000;
    if (tratarErroFatal(e)) return;
    P.el.salvo.textContent = '⚠ Sem conexão — respostas guardadas neste computador';
  } finally {
    P.salvando = false;
  }
}

function tratarErroFatal(e) {
  if (e.codigo === 'SESSAO_SUBSTITUIDA') {
    P.encerrada = true;
    encerrarTimers();
    P.monitor && P.monitor.parar();
    localStorage.removeItem(CHAVE_SESSAO);
    app.append(h('div', { class: 'sobreposicao' }, h('div', {}, h('h2', {}, 'Sessão encerrada'), h('p', {}, e.message),
      h('button', { class: 'btn', onclick: () => { sairTelaCheia(); location.reload(); } }, 'Voltar à página inicial'))));
    return true;
  }
  if (e.codigo === 'ENCERRADA' || e.codigo === 'PRAZO') { if (!P.encerrada) entregar(true); return true; }
  return false;
}

/* ---------- Ocorrências (somente modo regular) ---------- */

const SUSPEITOS = ['saiu_tela_cheia', 'aba_oculta', 'perdeu_foco'];

function registrarEvento(tipo, duracaoMs, semContar) {
  if (P.encerrada || P.sae) return;
  if (SUSPEITOS.includes(tipo) && !semContar) { P.nEventos++; atualizarOcorrencias(); }
  P.filaEventos.push(Object.assign(cred(), { tipo, duracaoMs, detalhe: duracaoMs ? 'duração ' + fmtDuracao(duracaoMs) : '' }));
  enviarFilaEventos();
  if (tipo === 'aba_oculta' || tipo === 'perdeu_foco') toast('Ocorrência registrada: ' + (tipo === 'aba_oculta' ? 'troca de aba/minimização' : 'janela fora de foco') + ' (' + fmtDuracao(duracaoMs) + ').', 'erro', 5000);
}

async function enviarFilaEventos() {
  if (P.enviandoEventos) return;
  P.enviandoEventos = true;
  try {
    while (P.filaEventos.length) {
      try {
        const r = await api('evento', P.filaEventos[0], { tentativas: 2, timeout: 30000 });
        P.filaEventos.shift();
        if (r.nEventos !== undefined && r.nEventos > P.nEventos) { P.nEventos = r.nEventos; atualizarOcorrencias(); }
      } catch (e) {
        if (tratarErroFatal(e)) return;
        if (e.doServidor) { P.filaEventos.shift(); continue; }
        setTimeout(enviarFilaEventos, 10000);
        return;
      }
    }
  } finally { P.enviandoEventos = false; }
}

function aoSairDaPagina() {
  if (P.encerrada || !P.monitor) return;
  if (!P.sae) {
    P.monitor.pendentes().forEach(p => apiBeacon('evento', Object.assign(cred(), { tipo: p.tipo, duracaoMs: p.duracaoMs, detalhe: 'página fechada durante a ocorrência' })));
    P.filaEventos.forEach(ev => apiBeacon('evento', ev));
  }
  if (P.pendentes.size) apiBeacon('salvar', Object.assign(cred(), { respostas: pacotePendentes().r }));
}

/* ---------- Tempo ---------- */

function tique() {
  if (P.encerrada || P.sae || P.prazo === null || P.prazo === undefined) return;
  const rest = P.prazo - agoraServidor();
  P.el.relogio.textContent = fmtDuracao(rest);
  P.el.relogio.className = 'relogio' + (rest <= 5 * 60000 ? ' critico' : rest <= 15 * 60000 ? ' alerta' : '');
  if (rest <= 15 * 60000 && rest > 14 * 60000 && !P.avisos.q15) { P.avisos.q15 = true; toast('Faltam 15 minutos para o fim da prova.', 'aviso', 7000); }
  if (rest <= 5 * 60000 && rest > 4 * 60000 && !P.avisos.q5) { P.avisos.q5 = true; toast('Faltam 5 minutos! Revise e entregue a prova.', 'erro', 8000); }
  if (rest <= 0) entregar(true);
}

function encerrarTimers() { clearInterval(P.timer); clearInterval(P.timerSalvar); }

/* ---------- Entrega ---------- */

async function entregar(auto) {
  if (P.encerrada) return;
  if (!auto) {
    const faltam = P.questoes.filter(q => progressoQuestao(q, P.respostas) < 1).map(q => q.numero);
    const ok = await confirmar({
      titulo: 'Entregar a prova agora?',
      html: (faltam.length ? `<div class="aviso-box ambar">Questões sem resposta completa: <b>${faltam.join(', ')}</b>.</div>` : '<p>Todas as questões têm resposta.</p>') +
        '<p>Depois de entregar, não será possível alterar as respostas.</p>',
      ok: 'Entregar definitivamente'
    });
    if (!ok || P.encerrada) return;
  }
  P.encerrada = true;
  encerrarTimers();
  const abertas = P.monitor && !P.sae ? P.monitor.pendentes() : [];
  P.monitor && P.monitor.parar();
  for (const a of abertas) P.filaEventos.push(Object.assign(cred(), { tipo: a.tipo, duracaoMs: a.duracaoMs, detalhe: 'em andamento no momento da entrega' }));
  P.filaEventos.forEach(ev => api('evento', ev).catch(() => apiBeacon('evento', ev)));
  P.filaEventos = [];

  const sobre = h('div', { class: 'sobreposicao' });
  const msg = h('p', {}, 'Enviando suas respostas ao servidor… não feche esta janela.');
  sobre.append(h('div', {}, h('h2', {}, auto ? '⏰ Tempo esgotado' : 'Entregando a prova'), msg));
  app.append(sobre);
  if (P.el.bloqueio) P.el.bloqueio.classList.add('oculto');

  const logo = await logoDataUrl();
  let relatorio = '';
  try { relatorio = await gerarArquivoProva({ config: P.sessao.config, sessao: P.sessao, questoes: P.questoes, respostas: P.respostas, entregueEm: Date.now(), nEventos: P.nEventos, logo }); } catch (e) { relatorio = ''; }

  const enviar = async () => {
    try {
      const r = await api('entregar', Object.assign(cred(), { respostas: P.respostas, auto, relatorioHtml: relatorio }), { tentativas: 2, timeout: 90000 });
      localStorage.removeItem(chaveBackup(P.sessao.tentativaId));
      gravarSessaoLocal({ tentativaId: P.sessao.tentativaId, token: P.sessao.token, nome: P.sessao.nome, tipo: P.sessao.tipo, sae: P.sae, entregue: true, codigo: r.codigo });
      window.removeEventListener('pagehide', aoSairDaPagina);
      telaFinal(P.sessao, { codigo: r.codigo, entregueEm: r.entregueEm, logo, respostas: P.respostas, nEventos: P.nEventos });
    } catch (e) {
      if (e.codigo === 'SESSAO_SUBSTITUIDA') { tratarErroFatal(e); return; }
      msg.innerHTML = '';
      msg.append('Não foi possível enviar (' + e.message + '). Nova tentativa automática em 10 s. ', h('br'), h('br'),
        h('button', { class: 'btn', onclick: () => { clearTimeout(P.retentar); enviar(); } }, 'Tentar agora'), ' ',
        h('button', { class: 'btn', onclick: () => baixar(nomeArquivo(P.sessao), relatorio, 'text/html;charset=utf-8') }, 'Baixar cópia da prova'));
      P.retentar = setTimeout(enviar, 10000);
    }
  };
  enviar();
}

const nomeArquivo = s => 'Prova_AlgebraLinear_' + s.matricula + '_tipo' + s.tipo + '.html';

async function telaFinal(sessao, { codigo, entregueEm, logo, respostas, nEventos }) {
  encerrarTimers();
  document.body.classList.remove('em-prova');
  const cfg = sessao.config;
  const resp = respostas || sessao.respostas || {};
  app.innerHTML = '';
  const baixarProva = async () => {
    const html = await gerarArquivoProva({ config: cfg, sessao: Object.assign({}, sessao, { codigo }), questoes: sessao.questoes, respostas: resp, entregueEm, nEventos: nEventos !== undefined ? nEventos : sessao.nEventos, logo: logo || await logoDataUrl() });
    baixar(nomeArquivo(sessao), html, 'text/html;charset=utf-8');
  };
  app.append(cabecalhoInstitucional(cfg),
    h('div', { class: 'pagina' }, h('div', { class: 'cartao final' },
      h('div', { style: { fontSize: '3rem' } }, '✅'),
      h('h1', {}, 'Prova entregue com sucesso'),
      h('p', {}, sessao.nome + ' — ' + (sessao.sae ? 'prova adaptada (SAE)' : 'prova tipo ' + sessao.tipo)),
      h('p', { class: 'mudo' }, 'Código de consulta do resultado (anote ou fotografe):'),
      h('div', { class: 'codigo-grande' }, codigo || '—'),
      h('p', { class: 'pequeno' }, 'Quando o professor liberar a correção, acesse “Consultar resultado” e informe sua matrícula e este código.'),
      h('div', { class: 'linha-flex', style: { justifyContent: 'center' } },
        h('button', { class: 'btn', onclick: baixarProva }, '⬇ Baixar minha prova (.html)'),
        document.fullscreenElement ? h('button', { class: 'btn sec', onclick: e => { sairTelaCheia(); e.target.remove(); } }, 'Sair da tela cheia') : null,
        h('a', { class: 'btn sec', href: 'resultado.html' }, 'Página de resultado')))));
}

paginaInicial();
