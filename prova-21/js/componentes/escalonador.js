// componentes/escalonador.js — escalonamento de Gauss passo a passo
// O aluno escolhe a operação elementar e calcula a nova linha (a plataforma não faz as contas por ele).
// Arrastar a alça "⠿" de uma linha sobre outra cria automaticamente um passo de troca de linhas.
import { h, esc } from '../util.js';
import { htmlMatrizAumentada, numTxt } from './matrizArrastar.js';

const TIPO_DND = 'application/x-prova-linha';

export function textoOp(op) {
  if (!op || !op.tipo) return '(operação não definida)';
  const k = String(op.k || '').trim() || '?';
  if (op.tipo === 'troca') return `L${op.i} ↔ L${op.j}`;
  if (op.tipo === 'mult') return `L${op.i} → (${k})·L${op.i}`;
  return `L${op.i} → L${op.i} + (${k})·L${op.j}`;
}

export function htmlEscalonamento(inicial, valor, rotColunas) {
  const passos = (valor && valor.passos) || [];
  let s = '<div class="esc-leitura"><div class="esc-bloco"><div class="seq-rotulo">Matriz inicial</div>' + htmlMatrizAumentada(inicial, { rotColunas, rotLinhas: ['L1', 'L2', 'L3'] }) + '</div>';
  if (!passos.length) s += '<div class="mudo pequeno">(nenhum passo registrado)</div>';
  passos.forEach((p, n) => {
    s += `<div class="esc-seta">→</div><div class="esc-bloco"><div class="seq-rotulo">Passo ${n + 1}: ${esc(textoOp(p.op))}</div>` +
      htmlMatrizAumentada((p.m || []).map(l => l.map(x => (x === '' ? null : String(x).replace(/^-/, '−')))), { rotLinhas: ['L1', 'L2', 'L3'], destaque: Number((p.op || {}).i) - 1 }) + '</div>';
  });
  return s + '</div>';
}

export class Escalonador {
  /** op: {inicial:[[n]], vars:['x','y','z'], valor:{passos:[{op:{tipo,i,j,k}, m:[[str]]}]}, leitura, aoMudar} */
  constructor(el, op) {
    this.el = el;
    this.inicial = op.inicial;
    this.rotColunas = (op.vars || ['x', 'y', 'z']).concat(['b']);
    this.passos = JSON.parse(JSON.stringify((op.valor && op.valor.passos) || []));
    this.leitura = !!op.leitura;
    this.aoMudar = op.aoMudar || (() => {});
    this.id = 'es' + Math.random().toString(36).slice(2, 8);
    this.montar();
  }

  getValor() { return { passos: JSON.parse(JSON.stringify(this.passos)) }; }
  mudou() { this.aoMudar(this.getValor()); }

  matrizAnterior(n) { // matriz (strings) antes do passo n
    return n === 0 ? this.inicial.map(l => l.map(x => String(x))) : this.passos[n - 1].m.map(l => l.slice());
  }

  /** Prepara a matriz do passo n a partir da anterior: troca aplica direto; nas demais a linha-alvo fica em branco. */
  preparar(n) {
    const p = this.passos[n];
    const m = this.matrizAnterior(n);
    const i = Number(p.op.i) - 1, j = Number(p.op.j) - 1;
    if (p.op.tipo === 'troca') { if (i !== j) { const t = m[i]; m[i] = m[j]; m[j] = t; } }
    else m[i] = m[i].map(() => '');
    p.m = m;
  }

  montar() {
    this.el.innerHTML = '';
    if (this.leitura) { this.el.innerHTML = htmlEscalonamento(this.inicial, { passos: this.passos }, this.rotColunas); return; }
    this.lista = h('div', { class: 'esc-lista' });
    this.el.append(h('div', { class: 'esc' },
      h('div', { class: 'esc-ajuda pequeno' },
        'Para cada passo: escolha a operação elementar, depois ', h('b', {}, 'calcule e digite a nova linha'), ' (aceita inteiros, decimais e frações como −1/2). ',
        'Para trocar duas linhas, você também pode ', h('b', {}, 'arrastar a alça ⠿'), ' de uma linha sobre outra na última matriz.'),
      this.lista,
      h('div', { class: 'linha-flex', style: { marginTop: '10px' } },
        h('button', { class: 'btn peq', type: 'button', onclick: () => this.novoPasso() }, '＋ Novo passo'),
        h('button', { class: 'btn sec peq', type: 'button', onclick: () => { if (this.passos.length) { this.passos.pop(); this.render(); this.mudou(); } } }, '↶ Remover último passo'))));
    this.render();
  }

  novoPasso(op) {
    const n = this.passos.length;
    this.passos.push({ op: op || { tipo: 'comb', i: 2, j: 1, k: '' }, m: [] });
    this.preparar(n);
    this.render();
    this.mudou();
    const inputs = this.lista.querySelectorAll('.esc-passo:last-child input.cel');
    const alvo = Array.from(inputs).find(x => !x.value);
    if (alvo) alvo.focus({ preventScroll: false });
  }

  render() {
    this.lista.innerHTML = '';
    // matriz inicial
    this.lista.append(h('div', { class: 'esc-passo inicial' },
      h('div', { class: 'esc-cab' }, h('b', {}, 'Matriz completa inicial')),
      this.matrizEditavel(this.inicial.map(l => l.map(String)), -1, this.passos.length === 0)));
    this.passos.forEach((p, n) => this.lista.append(this.cartaoPasso(p, n, n === this.passos.length - 1)));
  }

  cartaoPasso(p, n, ultimo) {
    const sel = (opcoes, valor, aoMudar) => {
      const s = h('select', { class: 'esc-sel' }, ...opcoes.map(([v, t]) => h('option', { value: v }, t)));
      s.value = String(valor);
      s.addEventListener('change', () => aoMudar(s.value));
      return s;
    };
    const linhas = [['1', 'L1'], ['2', 'L2'], ['3', 'L3']];
    const refazer = () => { this.preparar(n); this.render(); this.mudou(); };
    const tipo = sel([['comb', 'Lᵢ → Lᵢ + k·Lⱼ (somar múltiplo de outra linha)'], ['mult', 'Lᵢ → k·Lᵢ (multiplicar por constante)'], ['troca', 'Lᵢ ↔ Lⱼ (trocar linhas)']], p.op.tipo, v => { p.op.tipo = v; if (v === 'troca' && p.op.i === p.op.j) p.op.j = p.op.i === 1 ? 2 : 1; refazer(); });
    const iSel = sel(linhas, p.op.i, v => { p.op.i = Number(v); refazer(); });
    const jSel = sel(linhas, p.op.j || 1, v => { p.op.j = Number(v); if (p.op.tipo === 'troca') refazer(); else { this.mudou(); prev.textContent = textoOp(p.op); } });
    const kIn = h('input', { type: 'text', class: 'esc-k', placeholder: 'k (ex.: −2, 1/3)', spellcheck: 'false' });
    kIn.value = p.op.k || '';
    kIn.addEventListener('input', () => { p.op.k = kIn.value; prev.textContent = textoOp(p.op); this.mudou(); });
    const prev = h('span', { class: 'esc-prev' }, textoOp(p.op));
    const campos = h('div', { class: 'esc-op' },
      h('label', {}, 'Operação ', tipo),
      h('label', {}, 'i = ', iSel),
      p.op.tipo !== 'mult' ? h('label', {}, 'j = ', jSel) : null,
      p.op.tipo !== 'troca' ? h('label', {}, 'k = ', kIn) : null,
      prev);
    return h('div', { class: 'esc-passo' },
      h('div', { class: 'esc-cab' }, h('b', {}, 'Passo ' + (n + 1)), h('span', { class: 'pequeno mudo' }, p.op.tipo === 'troca' ? ' (troca aplicada automaticamente)' : ' — mudar a operação limpa a linha calculada')),
      campos,
      this.matrizEditavel(p.m, n, ultimo, Number(p.op.i) - 1));
  }

  matrizEditavel(m, n, ultimo, linhaAlvo) {
    const tab = h('table', { class: 'mat-aum esc-mat' });
    const nc = m[0].length;
    tab.append(h('tr', {}, h('th'), h('th'), ...this.rotColunas.map((c, j) => h('th', { class: j === nc - 1 ? 'barra' : '', html: '<i>' + esc(c) + '</i>' }))));
    m.forEach((l, r) => {
      const alca = h('th', { class: 'alca' + (ultimo ? ' ativa' : ''), title: ultimo ? 'Arraste sobre outra linha para trocá-las' : '' }, ultimo ? '⠿' : '');
      if (ultimo) {
        alca.draggable = true;
        alca.addEventListener('dragstart', ev => ev.dataTransfer.setData(TIPO_DND, JSON.stringify({ id: this.id, r })));
      }
      const tr = h('tr', { class: r === linhaAlvo ? 'alvo-linha' : '' }, alca, h('th', { class: 'lin' }, 'L' + (r + 1)));
      l.forEach((x, c) => {
        let cel;
        if (n < 0) cel = h('td', { class: c === nc - 1 ? 'barra' : '' }, numTxt(x));
        else {
          const inp = h('input', { type: 'text', class: 'cel', spellcheck: 'false', inputmode: 'text' });
          inp.value = x;
          inp.addEventListener('input', () => { this.passos[n].m[r][c] = inp.value.trim(); this.mudou(); });
          cel = h('td', { class: c === nc - 1 ? 'barra' : '' }, inp);
        }
        tr.append(cel);
      });
      if (ultimo) {
        tr.addEventListener('dragover', ev => { if (Array.from(ev.dataTransfer.types).includes(TIPO_DND)) { ev.preventDefault(); tr.classList.add('alvo'); } });
        tr.addEventListener('dragleave', () => tr.classList.remove('alvo'));
        tr.addEventListener('drop', ev => {
          tr.classList.remove('alvo');
          const raw = ev.dataTransfer.getData(TIPO_DND);
          if (!raw) return;
          ev.preventDefault();
          const d = JSON.parse(raw);
          if (d.id !== this.id || d.r === r) return;
          this.novoPasso({ tipo: 'troca', i: d.r + 1, j: r + 1, k: '' });
        });
      }
      tab.append(tr);
    });
    return h('div', { class: 'matriz-wrap' }, tab);
  }
}
