// componentes/classificar.js — arrastar cartões para caixas (com alternativa por clique)
import { h } from '../util.js';

const TIPO_DND = 'application/x-prova-cartao';

export function htmlClassificar(cfg, valor) {
  const v = valor || {};
  const grupo = id => cfg.cartoes.filter(c => v[c.id] === id).map(c => `<span class="cartao-eq">${c.html}</span>`).join('') || '<span class="mudo pequeno">(nenhuma)</span>';
  const soltos = cfg.cartoes.filter(c => !v[c.id]);
  return '<div class="class-grade">' + cfg.caixas.map(cx => `<div class="class-caixa"><div class="class-tit">${cx.titulo}</div><div class="class-corpo">${grupo(cx.id)}</div></div>`).join('') + '</div>' +
    (soltos.length ? `<p class="pequeno mudo">Sem classificar: ${soltos.map(c => c.html).join(' · ')}</p>` : '');
}

export class Classificar {
  /** op: {cartoes:[{id,html}], caixas:[{id,titulo}], valor:{cartaoId: caixaId}, leitura, aoMudar} */
  constructor(el, op) {
    this.el = el;
    this.cfg = { cartoes: op.cartoes, caixas: op.caixas };
    this.v = Object.assign({}, op.valor || {});
    this.leitura = !!op.leitura;
    this.aoMudar = op.aoMudar || (() => {});
    this.id = 'cl' + Math.random().toString(36).slice(2, 8);
    this.montar();
  }

  getValor() { return Object.assign({}, this.v); }

  montar() {
    this.el.innerHTML = '';
    if (this.leitura) { this.el.innerHTML = htmlClassificar(this.cfg, this.v); return; }
    this.bandeja = h('div', { class: 'class-bandeja' });
    this.caixas = {};
    const grade = h('div', { class: 'class-grade' });
    this.cfg.caixas.forEach(cx => {
      const corpo = h('div', { class: 'class-corpo' });
      const caixa = h('div', { class: 'class-caixa' }, h('div', { class: 'class-tit' }, cx.titulo), corpo);
      caixa.addEventListener('click', ev => { if (this.escolhido && !ev.target.closest('.cartao-eq')) { this.v[this.escolhido] = cx.id; this.escolhido = null; this.mudou(); } });
      this.alvo(caixa, cx.id);
      this.caixas[cx.id] = corpo;
      grade.append(caixa);
    });
    this.alvo(this.bandeja, null);
    this.el.append(h('div', { class: 'seq-rotulo' }, 'Equações (arraste para uma caixa, ou clique na equação e depois na caixa)'), this.bandeja, grade);
    this.render();
  }

  mudou() { this.render(); this.aoMudar(this.getValor()); }

  render() {
    this.bandeja.innerHTML = '';
    Object.values(this.caixas).forEach(c => { c.innerHTML = ''; });
    this.cfg.cartoes.forEach(c => {
      const el = h('span', { class: 'cartao-eq' + (this.escolhido === c.id ? ' escolhido' : ''), draggable: 'true', html: c.html, title: 'Arraste para uma caixa' });
      el.addEventListener('dragstart', ev => ev.dataTransfer.setData(TIPO_DND, JSON.stringify({ id: this.id, c: c.id })));
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        if (this.v[c.id]) { delete this.v[c.id]; this.escolhido = null; this.mudou(); return; } // clique em cartão classificado devolve à bandeja
        this.escolhido = this.escolhido === c.id ? null : c.id; this.render();
      });
      (this.v[c.id] && this.caixas[this.v[c.id]] ? this.caixas[this.v[c.id]] : this.bandeja).append(el);
    });
    if (!this.bandeja.children.length) this.bandeja.append(h('span', { class: 'mudo pequeno' }, 'Todas as equações foram classificadas ✓ (clique em uma equação para devolvê-la)'));
  }

  alvo(el, caixaId) {
    el.addEventListener('dragover', ev => { if (Array.from(ev.dataTransfer.types).includes(TIPO_DND)) { ev.preventDefault(); el.classList.add('alvo'); } });
    el.addEventListener('dragleave', () => el.classList.remove('alvo'));
    el.addEventListener('drop', ev => {
      el.classList.remove('alvo');
      const raw = ev.dataTransfer.getData(TIPO_DND);
      if (!raw) return;
      ev.preventDefault();
      const d = JSON.parse(raw);
      if (d.id !== this.id) return;
      if (caixaId) this.v[d.c] = caixaId; else delete this.v[d.c];
      this.escolhido = null;
      this.mudou();
    });
  }
}
