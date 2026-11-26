// componentes/matrizArrastar.js — montar a matriz completa arrastando números para as células
import { h, esc } from '../util.js';

const TIPO_DND = 'application/x-prova-ficha';
export const numTxt = v => (v === null || v === undefined || v === '' ? '' : Number(v) < 0 ? '−' + Math.abs(v) : String(v));

/** HTML de matriz completa (com barra antes da última coluna). valores: matriz de números/strings/null. */
export function htmlMatrizAumentada(valores, { rotColunas, rotLinhas, destaque } = {}) {
  if (!valores || !valores.length) return '<span class="mudo pequeno">(vazia)</span>';
  const nc = valores[0].length;
  let s = '<table class="mat-aum">';
  if (rotColunas) s += '<tr><th></th>' + rotColunas.map((c, j) => `<th class="${j === nc - 1 ? 'barra' : ''}"><i>${esc(c)}</i></th>`).join('') + '</tr>';
  valores.forEach((l, i) => {
    s += '<tr>' + (rotLinhas ? `<th class="lin">${esc(rotLinhas[i])}</th>` : '<th></th>') +
      l.map((v, j) => `<td class="${j === nc - 1 ? 'barra' : ''}${destaque === i ? ' dest' : ''}">${v === null || v === '' ? '<span class="mudo">_</span>' : esc(numTxt(v))}</td>`).join('') + '</tr>';
  });
  return s + '</table>';
}

export class MatrizArrastar {
  /** op: {linhas, colunas, rotColunas, fichas:[n], valor:{celulas:{'i,j': idxFicha}}, leitura, aoMudar} */
  constructor(el, op) {
    this.el = el;
    this.cfg = op;
    this.cel = Object.assign({}, (op.valor && op.valor.celulas) || {});
    this.leitura = !!op.leitura;
    this.aoMudar = op.aoMudar || (() => {});
    this.id = 'ma' + Math.random().toString(36).slice(2, 8);
    this.escolhido = null; // índice da ficha
    this.montar();
  }

  getValor() { return { celulas: Object.assign({}, this.cel) }; }

  grade() {
    const g = [];
    for (let i = 0; i < this.cfg.linhas; i++) { g.push([]); for (let j = 0; j < this.cfg.colunas; j++) { const x = this.cel[i + ',' + j]; g[i].push(x === undefined ? null : this.cfg.fichas[x]); } }
    return g;
  }

  montar() {
    this.el.innerHTML = '';
    if (this.leitura) { this.el.innerHTML = htmlMatrizAumentada(this.grade(), { rotColunas: this.cfg.rotColunas }); return; }
    this.tab = h('table', { class: 'mat-aum editavel' });
    this.bandeja = h('div', { class: 'seq-zona bandeja' });
    this.ligarAlvo(this.bandeja, null);
    this.el.append(h('div', { class: 'linha-flex', style: { alignItems: 'flex-start', gap: '26px' } },
      h('div', {}, this.tab),
      h('div', { style: { flex: '1', minWidth: '240px' } },
        h('div', { class: 'seq-rotulo' }, 'Números disponíveis'), this.bandeja,
        h('p', { class: 'pequeno mudo' }, 'Arraste um número até a célula (ou clique no número e depois na célula). Clique em uma célula preenchida para devolver o número.'),
        h('button', { class: 'btn sec peq', type: 'button', onclick: () => { this.cel = {}; this.escolhido = null; this.mudou(); } }, 'Limpar matriz'))));
    this.render();
  }

  mudou() { this.render(); this.aoMudar(this.getValor()); }

  colocar(idx, pos) {
    for (const k of Object.keys(this.cel)) if (this.cel[k] === idx) delete this.cel[k];
    if (pos) this.cel[pos] = idx;
    this.escolhido = null;
    this.mudou();
  }

  ficha(idx, naCelula) {
    const f = h('span', { class: 'chip' + (naCelula ? ' na-seq' : '') + (this.escolhido === idx ? ' escolhido' : ''), draggable: 'true' }, numTxt(this.cfg.fichas[idx]));
    f.addEventListener('dragstart', ev => ev.dataTransfer.setData(TIPO_DND, JSON.stringify({ id: this.id, idx })));
    return f;
  }

  render() {
    const nc = this.cfg.colunas;
    this.tab.innerHTML = '';
    this.tab.append(h('tr', {}, h('th'), ...this.cfg.rotColunas.map((c, j) => h('th', { class: j === nc - 1 ? 'barra' : '', html: '<i>' + esc(c) + '</i>' }))));
    for (let i = 0; i < this.cfg.linhas; i++) {
      const tr = h('tr', {}, h('th', { class: 'lin' }, 'L' + (i + 1)));
      for (let j = 0; j < nc; j++) {
        const pos = i + ',' + j;
        const td = h('td', { class: 'alvo-celula' + (j === nc - 1 ? ' barra' : '') });
        const idx = this.cel[pos];
        if (idx !== undefined) {
          const f = this.ficha(idx, true);
          f.addEventListener('click', ev => { ev.stopPropagation(); this.colocar(idx, null); });
          td.append(f);
        } else td.append(h('span', { class: 'vazio-celula' }, '·'));
        td.addEventListener('click', () => { if (this.escolhido !== null && this.cel[pos] === undefined) this.colocar(this.escolhido, pos); });
        this.ligarAlvo(td, pos);
        tr.append(td);
      }
      this.tab.append(tr);
    }
    this.bandeja.innerHTML = '';
    const usados = new Set(Object.values(this.cel));
    this.cfg.fichas.forEach((_, idx) => {
      if (usados.has(idx)) return;
      const f = this.ficha(idx, false);
      f.addEventListener('click', () => { this.escolhido = this.escolhido === idx ? null : idx; this.render(); });
      this.bandeja.append(f);
    });
    if (!this.bandeja.children.length) this.bandeja.append(h('span', { class: 'vazio' }, 'Todos os números foram usados.'));
  }

  ligarAlvo(el, pos) {
    el.addEventListener('dragover', ev => { if (Array.from(ev.dataTransfer.types).includes(TIPO_DND)) { ev.preventDefault(); el.classList.add('alvo'); } });
    el.addEventListener('dragleave', () => el.classList.remove('alvo'));
    el.addEventListener('drop', ev => {
      el.classList.remove('alvo');
      const raw = ev.dataTransfer.getData(TIPO_DND);
      if (!raw) return;
      ev.preventDefault();
      const d = JSON.parse(raw);
      if (d.id !== this.id) return;
      if (pos && this.cel[pos] !== undefined && this.cel[pos] !== d.idx) return; // célula ocupada
      this.colocar(d.idx, pos);
    });
  }
}
