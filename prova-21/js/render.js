// render.js — montagem das questões (interativa e somente leitura) e do arquivo de prova
import { h, esc, fmtDataHora, fmtNota } from './util.js';
import { EntradaTabela, htmlTabela } from './componentes/tabela.js';
import { Adicao, htmlAdicao } from './componentes/adicao.js';
import { Classificar, htmlClassificar } from './componentes/classificar.js';
import { MatrizArrastar, htmlMatrizAumentada } from './componentes/matrizArrastar.js';
import { Escalonador, htmlEscalonamento } from './componentes/escalonador.js';

const LETRAS = 'ABCDE';

export function htmlSistema(equacoes) {
  return '<div class="sistema"><div class="eqs">' + equacoes.map(e => '<div>' + e + '</div>').join('') + '</div></div>';
}

export function htmlFigura(fig) {
  if (!fig) return '';
  if (fig.tipo === 'sistema') return '<div class="figura">' + htmlSistema(fig.equacoes) + '</div>';
  if (fig.tipo === 'matriz') return '<div class="figura">' + htmlMatrizAumentada(fig.valores, { rotLinhas: fig.rotLinhas }) + '</div>';
  return '';
}

/** Indica se um item tem alguma resposta (para o mapa de progresso). */
export function itemRespondido(item, v) {
  if (v === undefined || v === null || v === '') return false;
  switch (item.tipo) {
    case 'tabela': return (v || []).some(l => (l || []).some(c => String(c).trim() !== ''));
    case 'adicao': return ['valor1', 'valor2'].some(k => String(v[k] || '').trim() !== '') || (v.mult || []).some(l => (l || []).some(c => String(c).trim() !== ''));
    case 'classificar': return Object.keys(v).length > 0;
    case 'matriz_arrastar': return Object.keys(v.celulas || {}).length > 0;
    case 'escalonador': return (v.passos || []).length > 0;
    default: return String(v).trim() !== '';
  }
}

export function progressoQuestao(q, respostas) {
  if (q.tipo === 'objetiva') return respostas[q.id] ? 1 : 0;
  if (!q.itens.length) return 0;
  return q.itens.filter(i => itemRespondido(i, respostas[i.id])).length / q.itens.length;
}

function cabecalhoQuestao(q, extraValor = '') {
  return h('div', { class: 'questao-cab' },
    h('span', { class: 'num' }, 'Questão ' + q.numero),
    h('span', { class: 'tit' }, q.titulo || ''),
    h('span', { class: 'valor', html: (q.tipo === 'objetiva' ? 'Objetiva · ' : 'Discursiva · ') + fmtNota(q.valor) + ' ponto(s)' + extraValor }));
}

/* ============================================================
 *  Montagem interativa
 * ============================================================ */

/** ctx: {respostas, aoMudar(itemId, valor), sae} */
export function montarQuestao(cont, q, ctx) {
  cont.innerHTML = '';
  const caixa = h('article', { class: 'questao' });
  caixa.append(cabecalhoQuestao(q), h('div', { class: 'enunciado', html: q.enunciado }));
  if (q.figura) caixa.append(h('div', { html: htmlFigura(q.figura) }));

  if (q.tipo === 'objetiva') {
    const lista = h('div', { class: 'alternativas', role: 'radiogroup' });
    const desenhar = () => {
      lista.innerHTML = '';
      q.alternativas.forEach((a, i) => {
        const marcada = ctx.respostas[q.id] === a.id;
        lista.append(h('label', { class: 'alternativa' + (marcada ? ' marcada' : ''), onclick: () => { ctx.aoMudar(q.id, marcada ? '' : a.id); desenhar(); } },
          h('span', { class: 'letra' }, LETRAS[i]), h('span', { html: a.html })));
      });
    };
    desenhar();
    caixa.append(lista, h('p', { class: 'pequeno mudo', style: { marginTop: '10px' } }, 'Clique novamente na alternativa marcada para desmarcá-la.'));
    cont.append(caixa);
    return;
  }

  const dependentes = {}; // item-fonte -> componentes que precisam ser atualizados quando ele muda
  q.itens.forEach(item => {
    const bloco = h('section', { class: 'item' });
    bloco.append(h('div', { class: 'rotulo', html: item.rotulo + (/ponto\)/.test(item.rotulo) ? '' : ` <span class="valor-item">(${fmtNota(item.valor)})</span>`) }));
    const alvo = h('div');
    bloco.append(alvo);
    const cfg = item.config || {};
    const val = ctx.respostas[item.id];
    const mudar = v => { ctx.aoMudar(item.id, v); (dependentes[item.id] || []).forEach(c => c.atualizar()); };
    switch (item.tipo) {
      case 'texto': {
        const ta = h('textarea', { rows: String(cfg.linhas || 4), spellcheck: 'false' });
        ta.value = val || '';
        ta.addEventListener('input', () => mudar(ta.value));
        alvo.append(ta);
        break;
      }
      case 'linha': {
        const inp = h('input', { type: 'text', spellcheck: 'false' });
        inp.value = val || '';
        inp.addEventListener('input', () => mudar(inp.value));
        alvo.append(inp);
        break;
      }
      case 'escolha': {
        const grupo = h('div', { class: 'alternativas' });
        const desenhar = () => {
          grupo.innerHTML = '';
          (cfg.opcoes || []).forEach((o, i) => {
            const marcada = ctx.respostas[item.id] === o.id;
            grupo.append(h('label', { class: 'alternativa' + (marcada ? ' marcada' : ''), style: { padding: '7px 12px' }, onclick: () => { mudar(marcada ? '' : o.id); desenhar(); } },
              h('span', { class: 'letra' }, String(i + 1)), h('span', {}, o.texto)));
          });
        };
        desenhar();
        alvo.append(grupo);
        break;
      }
      case 'tabela': new EntradaTabela(alvo, { linhas: cfg.linhas, colunas: cfg.colunas, valor: val, aoMudar: mudar }); break;
      case 'adicao': {
        const c = new Adicao(alvo, { vars: cfg.vars, valor: val, obterSistema: () => ctx.respostas[cfg.fonte], aoMudar: mudar });
        (dependentes[cfg.fonte] = dependentes[cfg.fonte] || []).push(c);
        break;
      }
      case 'classificar': new Classificar(alvo, { cartoes: cfg.cartoes, caixas: cfg.caixas, valor: val, aoMudar: mudar }); break;
      case 'matriz_arrastar':
        if (cfg.sistema) alvo.append(h('div', { html: '<div class="figura">' + htmlSistema(cfg.sistema) + '</div>' }));
        { const d = h('div'); alvo.append(d); new MatrizArrastar(d, Object.assign({}, cfg, { valor: val, aoMudar: mudar })); }
        break;
      case 'escalonador': new Escalonador(alvo, { inicial: cfg.inicial, vars: cfg.vars, valor: val, aoMudar: mudar }); break;
    }
    caixa.append(bloco);
  });
  cont.append(caixa);
}

/* ============================================================
 *  Somente leitura (HTML em string)
 * ============================================================ */

export function htmlItemLeitura(item, respostas) {
  const v = respostas[item.id];
  const cfg = item.config || {};
  switch (item.tipo) {
    case 'texto': case 'linha':
      return '<div class="resposta-lida">' + (v ? esc(v) : '<span class="mudo">(em branco)</span>') + '</div>';
    case 'escolha': {
      const o = (cfg.opcoes || []).find(x => x.id === v);
      return '<div class="resposta-lida">' + (o ? esc(o.texto) : '<span class="mudo">(não respondido)</span>') + '</div>';
    }
    case 'tabela': return htmlTabela(cfg.linhas, cfg.colunas, v);
    case 'adicao': return htmlAdicao(v, respostas[cfg.fonte], cfg.vars);
    case 'classificar': return htmlClassificar(cfg, v);
    case 'matriz_arrastar': {
      const cel = (v && v.celulas) || {};
      const g = Array.from({ length: cfg.linhas }, (_, i) => Array.from({ length: cfg.colunas }, (_, j) => (cel[i + ',' + j] === undefined ? null : cfg.fichas[cel[i + ',' + j]])));
      return (cfg.sistema ? '<div class="figura">' + htmlSistema(cfg.sistema) + '</div>' : '') + htmlMatrizAumentada(g, { rotColunas: cfg.rotColunas });
    }
    case 'escalonador': return htmlEscalonamento(cfg.inicial, v, (cfg.vars || ['x', 'y', 'z']).concat(['b']));
    default: return esc(JSON.stringify(v));
  }
}

/** extras: {gabarito, nota, feedback, verificacao, mostrarVerificacao, sae} */
export function htmlQuestaoLeitura(q, respostas, extras = {}) {
  let s = `<article class="questao" style="margin-bottom:18px"><div class="questao-cab"><span class="num">Questão ${q.numero}</span><span class="tit">${esc(q.titulo || '')}</span><span class="valor">${fmtNota(q.valor)} ponto(s)`;
  if (extras.nota !== undefined && extras.nota !== null) s += ` · <b style="color:var(--azul)">nota: ${fmtNota(extras.nota)}</b>`;
  s += '</span></div>';
  s += `<div class="enunciado">${q.enunciado}</div>` + htmlFigura(q.figura);
  if (q.tipo === 'objetiva') {
    s += '<div class="alternativas">';
    q.alternativas.forEach((a, i) => {
      const marcada = respostas[q.id] === a.id;
      let cls = marcada ? ' marcada' : '';
      if (extras.gabarito && q.correta) { if (a.id === q.correta) cls = ' correta'; else if (marcada) cls = ' errada'; }
      s += `<div class="alternativa${cls}"><span class="letra">${LETRAS[i]}</span><span>${a.html}${marcada ? ' <b>(marcada)</b>' : ''}${extras.gabarito && a.id === q.correta ? ' <b style="color:var(--verde)">✓ correta</b>' : ''}</span></div>`;
    });
    s += '</div>';
    if (!respostas[q.id]) s += '<p class="pequeno mudo">Questão não respondida.</p>';
  } else {
    q.itens.forEach(it => { s += `<section class="item"><div class="rotulo">${it.rotulo}${/ponto\)/.test(it.rotulo) ? '' : ` <span class="valor-item">(${fmtNota(it.valor)})</span>`}</div>${htmlItemLeitura(it, respostas)}</section>`; });
  }
  if (extras.verificacao && extras.mostrarVerificacao) s += htmlVerificacao(extras.verificacao);
  if (extras.feedback) s += `<div class="aviso-box" style="margin-top:14px"><b>Comentário do professor:</b><div style="white-space:pre-wrap">${esc(extras.feedback)}</div></div>`;
  return s + '</article>';
}

export function htmlVerificacao(vq) {
  if (!vq || !vq.itens) return '';
  let s = '<table class="verif"><tr><th style="width:34px"></th><th>Verificação</th><th>Resposta</th><th>Esperado</th></tr>';
  vq.itens.forEach(i => {
    const ok = i.ok === true ? '<td class="ok">✔</td>' : i.ok === false ? '<td class="nok">✘</td>' : '<td class="centro">•</td>';
    s += `<tr>${ok}<td>${esc(i.rotulo)}</td><td><pre>${esc(i.obtido)}</pre></td><td><pre>${esc(i.esperado)}</pre></td></tr>`;
  });
  return s + '</table>';
}

/** Cabeçalho + quadro de instruções (modelo das diretrizes SAE; usado também no arquivo da prova). */
export function htmlCabecalhoProva({ config, sessao, logo, data, semInstrucoes }) {
  return `<div class="cab-prova"><div class="cab-prova-topo">${logo ? `<img src="${logo}" alt="CESUPA">` : ''}<div><div class="inst">Centro Universitário do Estado do Pará</div>` +
    `<div class="disc">${esc(config.disciplina || '')}</div></div></div>` +
    `<table class="cab-prova-campos"><tr><td><b>Docente:</b> ${esc(config.professor || '')}</td><td><b>Turma:</b> ${esc(config.turma || '')}</td></tr>` +
    `<tr><td><b>Estudante:</b> ${esc(sessao.nome || '')} (matrícula ${esc(sessao.matricula || '')})</td><td><b>Data:</b> ${esc(data || new Date().toLocaleDateString('pt-BR'))} · <b>Prova tipo ${esc(sessao.tipo || '')}</b></td></tr></table>` +
    (semInstrucoes ? '' : `<div class="quadro-instrucoes"><div class="qi-tit">Instruções para a prova</div><ul>${(config.instrucoes || []).map(i => '<li>' + i + '</li>').join('')}</ul></div>`) + '</div>';
}

/* ============================================================
 *  Arquivo de prova (HTML autocontido para download / Drive)
 * ============================================================ */

export async function gerarArquivoProva({ config, sessao, questoes, respostas, entregueEm, nEventos, logo }) {
  let css = '';
  try { css = await (await fetch('css/style.css')).text(); } catch (e) { css = ''; }
  let corpo = `<main class="pagina${sessao.sae ? ' modo-sae' : ''}">` + htmlCabecalhoProva({ config, sessao, logo, data: fmtDataHora(entregueEm || Date.now()) });
  corpo += `<div class="cartao"><p class="pequeno">Identificador: <b>${esc(sessao.tentativaId)}</b>` + (sessao.codigo ? ` · Código de consulta do resultado: <b style="font-family:monospace;font-size:1.1em">${esc(sessao.codigo)}</b>` : '') +
    `<br>Entregue em: ${fmtDataHora(entregueEm || Date.now())}` + (!sessao.sae && nEventos !== undefined ? ` · Ocorrências registradas (saídas de tela cheia/aba/foco): ${nEventos}` : '') + '</p>' +
    `<p class="pequeno mudo">Arquivo gerado automaticamente pela plataforma de avaliação. Guarde-o junto com o código de consulta.</p></div>`;
  questoes.forEach(q => { corpo += htmlQuestaoLeitura(q, respostas); });
  corpo += '</main>';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prova ${esc(sessao.tipo || '')} — ${esc(sessao.matricula || '')}</title><style>${css}\n.questao{page-break-inside:avoid;margin-bottom:18px}</style></head><body${sessao.sae ? ' class="modo-sae"' : ''}>${corpo}</body></html>`;
}
