// componentes/adicao.js — resolução guiada de sistema 2×2 pelo método da adição.
// O sistema exibido é o que o próprio aluno montou no item anterior; ele escolhe a variável
// a eliminar (clicando ou arrastando a ficha), escolhe os multiplicadores e faz todas as contas.
import { h, esc } from '../util.js';

const TIPO_DND = 'application/x-prova-variavel';
const fmt = x => (x === undefined || x === null || String(x).trim() === '' ? '?' : String(x).trim().replace(/^-/, '−'));

function eqTexto(l, vs) {
  if (!l) return '?';
  return `${fmt(l[0])}<i>${vs[0]}</i> + ${fmt(l[1])}<i>${vs[1]}</i> = ${fmt(l[2])}`.replace(/\+ −/g, '− ');
}

/** Sistema (strings) a partir da resposta da tabela do item anterior; null se incompleto. */
function sistemaDe(tab) {
  if (!tab || tab.length < 2) return null;
  const s = [0, 1].map(i => (tab[i] || []).slice(0, 3).map(x => String(x ?? '').trim()));
  return s.every(l => l.length === 3 && l.every(x => x !== '')) ? s : null;
}

export function htmlAdicao(v, tabSistema, vs = ['x', 'y']) {
  v = v || {};
  const sis = sistemaDe(tabSistema);
  const resta = v.elimina === 'x' ? vs[1] : v.elimina === 'y' ? vs[0] : '?';
  const linha = r => `<td>${fmt((r || [])[0])}</td><td><i>${vs[0]}</i> +</td><td>${fmt((r || [])[1])}</td><td><i>${vs[1]}</i> =</td><td>${fmt((r || [])[2])}</td>`;
  return '<div class="adicao-leitura">' +
    `<p><b>Sistema usado (item a):</b> ${sis ? eqTexto(sis[0], vs) + ' ; ' + eqTexto(sis[1], vs) : '<span class="mudo">incompleto</span>'}</p>` +
    `<p><b>Variável eliminada:</b> ${esc(v.elimina || '?')}</p>` +
    `<table class="adicao-conta"><tr><th>Eq. 1 × (${fmt((v.k || [])[0])})</th>${linha((v.mult || [])[0])}</tr>` +
    `<tr><th>Eq. 2 × (${fmt((v.k || [])[1])})</th>${linha((v.mult || [])[1])}</tr>` +
    `<tr class="soma"><th>Soma</th>${linha(v.soma)}</tr></table>` +
    `<p><b>Logo</b>, <i>${resta}</i> = ${fmt(v.valor1)}</p>` +
    `<p><b>Substituição</b> na equação ${esc(v.eqSub || '?')}: ${esc(v.subTexto || '(sem registro)')} ⇒ <i>${esc(v.elimina || '?')}</i> = ${fmt(v.valor2)}</p></div>`;
}

export class Adicao {
  /** op: {vars, valor, obterSistema: () => tabela do item a), leitura, aoMudar} */
  constructor(el, op) {
    this.el = el;
    this.vs = op.vars || ['x', 'y'];
    this.obterSistema = op.obterSistema;
    this.leitura = !!op.leitura;
    this.aoMudar = op.aoMudar || (() => {});
    const v = op.valor || {};
    this.v = {
      elimina: v.elimina || '', k: (v.k || ['', '']).slice(), mult: [0, 1].map(i => ((v.mult || [])[i] || ['', '', '']).slice()),
      soma: (v.soma || ['', '', '']).slice(), valor1: v.valor1 || '', eqSub: v.eqSub || '', subTexto: v.subTexto || '', valor2: v.valor2 || ''
    };
    this.id = 'ad' + Math.random().toString(36).slice(2, 8);
    this.montar();
  }

  getValor() { return JSON.parse(JSON.stringify(this.v)); }
  mudou() { this.aoMudar(this.getValor()); }

  /** Chamado quando o sistema do item a) muda. */
  atualizar() { if (this.sisBox) this.desenharSistema(); }

  campo(valor, aoMudar, attrs = {}) {
    const i = h('input', Object.assign({ type: 'text', class: 'ad-cel', spellcheck: 'false' }, attrs));
    i.value = valor;
    i.addEventListener('input', () => { aoMudar(i.value.trim()); this.mudou(); });
    return i;
  }

  desenharSistema() {
    const sis = sistemaDe(this.obterSistema());
    this.sisBox.innerHTML = sis
      ? `<div class="sistema"><div class="eqs"><div><span class="ad-rot">Eq. 1</span> ${eqTexto(sis[0], this.vs)}</div><div><span class="ad-rot">Eq. 2</span> ${eqTexto(sis[1], this.vs)}</div></div></div>`
      : '<div class="aviso-box ambar">Preencha primeiro o item a): os passos abaixo usam o sistema que você montou.</div>';
  }

  montar() {
    this.el.innerHTML = '';
    if (this.leitura) { this.el.innerHTML = htmlAdicao(this.v, this.obterSistema(), this.vs); return; }
    const vs = this.vs;
    this.sisBox = h('div', { class: 'figura' });
    this.desenharSistema();

    // Passo 1 — variável a eliminar (clique ou arraste a ficha para o alvo)
    const alvo = h('div', { class: 'ad-alvo' });
    const fichas = h('div', { class: 'linha-flex' });
    const desenharP1 = () => {
      fichas.innerHTML = ''; alvo.innerHTML = '';
      vs.forEach(x => {
        const f = h('span', { class: 'chip ad-var' + (this.v.elimina === x ? ' na-seq' : ''), draggable: 'true', html: '<i>' + x + '</i>' });
        f.addEventListener('dragstart', ev => ev.dataTransfer.setData(TIPO_DND, JSON.stringify({ id: this.id, x })));
        f.addEventListener('click', () => { this.v.elimina = this.v.elimina === x ? '' : x; desenharP1(); atualizarRotulos(); this.mudou(); });
        (this.v.elimina === x ? alvo : fichas).append(f);
      });
      if (!this.v.elimina) alvo.append(h('span', { class: 'mudo pequeno' }, 'solte aqui a variável que será eliminada'));
    };
    alvo.addEventListener('dragover', ev => { if (Array.from(ev.dataTransfer.types).includes(TIPO_DND)) { ev.preventDefault(); alvo.classList.add('alvo'); } });
    alvo.addEventListener('dragleave', () => alvo.classList.remove('alvo'));
    alvo.addEventListener('drop', ev => {
      alvo.classList.remove('alvo');
      const raw = ev.dataTransfer.getData(TIPO_DND); if (!raw) return;
      ev.preventDefault();
      const d = JSON.parse(raw); if (d.id !== this.id) return;
      this.v.elimina = d.x; desenharP1(); atualizarRotulos(); this.mudou();
    });

    // Passos 2 e 3 — multiplicação e soma, alinhadas em colunas como na conta armada
    const linhaConta = (rot, arr) => h('tr', {}, h('th', {}, rot),
      h('td', {}, this.campo(arr[0], v => { arr[0] = v; })), h('td', { html: `<i>${vs[0]}</i> +` }),
      h('td', {}, this.campo(arr[1], v => { arr[1] = v; })), h('td', { html: `<i>${vs[1]}</i> =` }),
      h('td', {}, this.campo(arr[2], v => { arr[2] = v; })));
    const k1 = this.campo(this.v.k[0], v => { this.v.k[0] = v; }, { class: 'ad-cel ad-k', placeholder: 'k₁' });
    const k2 = this.campo(this.v.k[1], v => { this.v.k[1] = v; }, { class: 'ad-cel ad-k', placeholder: 'k₂' });
    const conta = h('table', { class: 'adicao-conta' },
      linhaConta(h('span', {}, 'Eq. 1 × ', k1), this.v.mult[0]),
      linhaConta(h('span', {}, 'Eq. 2 × ', k2), this.v.mult[1]),
      h('tr', { class: 'soma' }, ...linhaConta('Soma (+)', this.v.soma).children));

    // Passos 4 e 5
    const rot1 = h('span'), rot2 = h('span');
    const atualizarRotulos = () => {
      const resta = this.v.elimina === vs[0] ? vs[1] : this.v.elimina === vs[1] ? vs[0] : '?';
      rot1.innerHTML = `<i>${resta}</i> =`;
      rot2.innerHTML = `<i>${this.v.elimina || '?'}</i> =`;
    };
    const eqSel = h('select', { class: 'ad-sel' }, h('option', { value: '' }, 'escolha'), h('option', { value: '1' }, 'Eq. 1'), h('option', { value: '2' }, 'Eq. 2'));
    eqSel.value = this.v.eqSub;
    eqSel.addEventListener('change', () => { this.v.eqSub = eqSel.value; this.mudou(); });

    this.el.append(h('div', { class: 'adicao' },
      h('div', { class: 'ad-passo' }, h('div', { class: 'ad-tit' }, 'Sistema montado no item a)'), this.sisBox),
      h('div', { class: 'ad-passo' }, h('div', { class: 'ad-tit' }, 'Passo 1 — Qual variável você vai eliminar?'),
        h('div', { class: 'linha-flex' }, fichas, h('span', { class: 'mudo' }, '→'), alvo),
        h('p', { class: 'pequeno mudo' }, 'Arraste a variável para o quadro (ou clique nela).')),
      h('div', { class: 'ad-passo' }, h('div', { class: 'ad-tit' }, 'Passos 2 e 3 — Multiplique cada equação por um número (k) para que os coeficientes da variável escolhida fiquem opostos; escreva as novas equações e some-as, coluna por coluna.'),
        h('div', { class: 'matriz-wrap' }, conta),
        h('p', { class: 'pequeno mudo' }, 'Aceita inteiros, decimais e frações (ex.: −3, 1/2). Use k = 1 para manter uma equação como está.')),
      h('div', { class: 'ad-passo' }, h('div', { class: 'ad-tit' }, 'Passo 4 — Resolva a equação obtida na soma.'),
        h('div', { class: 'linha-flex' }, h('b', {}, 'Logo, '), rot1, this.campo(this.v.valor1, v => { this.v.valor1 = v; }))),
      h('div', { class: 'ad-passo' }, h('div', { class: 'ad-tit' }, 'Passo 5 — Substitua o valor encontrado em uma das equações para achar a outra variável.'),
        h('div', { class: 'linha-flex' }, 'Equação usada:', eqSel,
          'Substituição:', this.campo(this.v.subTexto, v => { this.v.subTexto = v; }, { class: 'ad-sub', placeholder: 'ex.: 2x + 3·5 = 31' }),
          h('b', {}, '⇒'), rot2, this.campo(this.v.valor2, v => { this.v.valor2 = v; })))));
    desenharP1();
    atualizarRotulos();
  }
}
