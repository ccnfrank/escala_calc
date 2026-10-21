(() => {
  'use strict';
  const C = window.ScaleCore;
  const $ = (id) => document.getElementById(id);
  const HISTORY_KEY = 'escalas.history.v2';
  const HISTORY_MAX = 10;

  const DIMS = [
    { k: 'y', name: 'Altura (y)', short: 'Alt.', letter: 'A' },
    { k: 'x', name: 'Largura (x)', short: 'Larg.', letter: 'L' },
    { k: 'z', name: 'Profundidade (z)', short: 'Prof.', letter: 'P' },
  ];
  const fieldId = (pfx, d) => pfx + d.k.toUpperCase();
  const ALL_FIELDS = ['a', 'b'].flatMap((p) => DIMS.map((d) => fieldId(p, d))).concat('scaleInput');

  const PRESETS = [
    { group: 'Cartografia', items: ['1:5.000', '1:10.000', '1:25.000', '1:50.000', '1:100.000', '1:250.000', '1:1.000.000'] },
    { group: 'Arquitetura e desenho técnico', items: ['1:20', '1:50', '1:75', '1:100', '1:200', '1:500'] },
    { group: 'Modelismo e miniaturas', items: ['1:12', '1:24', '1:35', '1:48', '1:72', '1:144'] },
    { group: 'Ampliação', items: ['2:1', '5:1', '10:1'] },
  ];
  const ALL_PRESETS = PRESETS.flatMap((g) => g.items).map((s) => C.parseScale(s));

  const MODES = {
    real: { labelA: 'Medida real do objeto', scale: true, b: false, unitA: 'm' },
    draw: { labelA: 'Medida no desenho ou maquete', scale: true, b: false, unitA: 'cm' },
    find: { labelA: 'Medida real do objeto', labelB: 'Medida no desenho ou maquete', scale: false, b: true, unitA: 'm', unitB: 'cm' },
  };

  let mode = 'real';
  let view = 'real'; // rótulos da caixa 3D: 'real' | 'draw'
  let last = null;
  let toastTimer;

  /* ---------- Dimensões ---------- */
  const filled = (m) => DIMS.filter((d) => m[d.k] != null);
  const mapDims = (m, fn) => Object.fromEntries(DIMS.map((d) => [d.k, m[d.k] == null ? null : fn(m[d.k], d.k)]));
  const dimsAuto = (m) => filled(m).map((d) => `${d.letter} ${C.formatLength(m[d.k]).text}`).join(' × ');
  const dimsIn = (m, unit) =>
    filled(m).map((d) => `${d.letter} ${C.formatNumber(C.fromMeters(m[d.k], unit))}`).join(' × ') + ` ${C.UNITS[unit].label}`;

  /* ---------- Cálculo (lê a tela, devolve resultado ou erro) ---------- */
  function readDims(pfx, unitId) {
    const unit = $(unitId).value;
    const m = {};
    let any = false;
    for (const d of DIMS) {
      const id = fieldId(pfx, d);
      const raw = $(id).value.trim();
      if (!raw) { m[d.k] = null; continue; }
      const v = C.parseNumber(raw);
      if (Number.isNaN(v)) return { error: `${d.name}: número inválido. Use dígitos, vírgula ou ponto.`, field: id };
      if (v <= 0) return { error: `${d.name}: informe um valor maior que zero.`, field: id };
      m[d.k] = C.toMeters(v, unit);
      any = true;
    }
    return any ? { m, unit } : { empty: true };
  }

  function compute() {
    const cfg = MODES[mode];
    const a = readDims('a', 'unitA');
    if (a.error) return a;
    let b = null;
    if (cfg.b) {
      b = readDims('b', 'unitB');
      if (b.error) return b;
    }
    let scale = null;
    if (cfg.scale) {
      const raw = $('scaleInput').value.trim();
      if (raw) {
        scale = C.parseScale(raw);
        if (!scale) return { error: 'Escala inválida. Use o formato 1:50.000 ou 5:1.', field: 'scaleInput' };
      }
    }
    if (a.empty || (cfg.b && b.empty) || (cfg.scale && !scale)) return { empty: true };

    let f, realM, drawM, summary;
    if (mode === 'find') {
      const ratios = DIMS.filter((d) => a.m[d.k] != null && b.m[d.k] != null).map((d) => b.m[d.k] / a.m[d.k]);
      if (!ratios.length) {
        return { error: 'Informe ao menos uma mesma dimensão (ex.: altura) nos dois grupos.', field: 'bY' };
      }
      if (Math.max(...ratios) / Math.min(...ratios) > 1.01) {
        return { error: 'As dimensões informadas não seguem a mesma escala.', field: 'bY' };
      }
      f = ratios[0];
      scale = C.scaleFromFactor(f);
      realM = mapDims(a.m, (v) => v);
      DIMS.forEach((d) => { if (realM[d.k] == null && b.m[d.k] != null) realM[d.k] = b.m[d.k] / f; });
      drawM = mapDims(realM, (v) => v * f);
      summary = `${dimsIn(a.m, a.unit)} ÷ ${dimsIn(b.m, b.unit)} → ${scale.label}`;
    } else {
      f = scale.factor;
      if (mode === 'real') {
        realM = a.m;
        drawM = mapDims(a.m, (v) => C.realToScaled(v, f));
        summary = `${dimsIn(a.m, a.unit)} → ${dimsAuto(drawM)} · ${scale.label}`;
      } else {
        drawM = a.m;
        realM = mapDims(a.m, (v) => C.scaledToReal(v, f));
        summary = `${dimsIn(a.m, a.unit)} → ${dimsAuto(realM)} · ${scale.label}`;
      }
    }
    return { ok: true, mode, a, b, scale, f, realM, drawM, summary };
  }

  /* ---------- Resultado ---------- */
  const tile = (label, text) => `<button type="button" class="tile" data-copy="${text}"><small>${label}</small><b>${text}</b></button>`;

  function scaleBar(factor) {
    const dist = C.niceBarDistance(factor);
    if (!dist) return '';
    const px = Math.round(dist * factor * 1000 * 96 / 25.4);
    return `<div class="bar-wrap">
      <div class="bar" style="width:${px}px"><span></span><span></span><span></span><span></span></div>
      <div class="bar-labels" style="width:${px}px"><span>0</span><span>${C.formatLength(dist / 2).text}</span><span>${C.formatLength(dist).text}</span></div>
      <p class="bar-cap">Escala gráfica · tamanho aproximado na tela</p>
    </div>`;
  }

  function hero(eyebrow, value, sentence, note) {
    return `<div>
      <span class="eyebrow">${eyebrow}</span>
      <div class="hero-value"><output>${value}</output><button type="button" class="copy" data-copy="${value}">Copiar</button></div>
      <p class="sentence">${sentence}</p>${note ? `<p class="note">${note}</p>` : ''}
    </div>`;
  }

  function heroDims(eyebrow, m, sentence) {
    const cells = filled(m).map((d) =>
      `<div class="dim-out"><small>${d.name}</small><output>${C.formatLength(m[d.k]).text}</output></div>`).join('');
    return `<div>
      <span class="eyebrow">${eyebrow}</span>
      <div class="dim-outs">${cells}<button type="button" class="copy" data-copy="${dimsAuto(m)}">Copiar</button></div>
      <p class="sentence">${sentence}</p>
    </div>`;
  }

  function renderResult(r) {
    const el = $('result');
    if (!r.ok) {
      el.innerHTML = '<p class="placeholder">Preencha os campos para ver o resultado.</p>';
      return;
    }
    if (r.mode === 'find') {
      const match = ALL_PRESETS.find((p) => Math.abs(p.factor / r.f - 1) < 0.005);
      el.innerHTML =
        hero('Escala encontrada', r.scale.label, `Dimensões reais (${dimsIn(r.a.m, r.a.unit)}) comparadas ao desenho.`,
          match ? `Corresponde à escala padrão ${match.label}.` : '') +
        `<div class="tiles">
          ${tile('1 mm no desenho =', C.formatLength(0.001 / r.f).text)}
          ${tile('1 cm no desenho =', C.formatLength(0.01 / r.f).text)}
          ${tile('1 m real =', C.formatLength(r.f).text)}
          ${tile('Fator', '× ' + C.formatNumber(r.f))}
        </div>` + scaleBar(r.f);
      return;
    }
    const isReal = r.mode === 'real';
    const out = isReal ? r.drawM : r.realM;
    el.innerHTML =
      heroDims(isReal ? `Medidas na escala ${r.scale.label}` : `Medidas reais · escala ${r.scale.label}`, out,
        isReal ? `Dimensões reais (${dimsIn(r.a.m, r.a.unit)}) reduzidas para o desenho ou maquete.`
               : `Dimensões do desenho (${dimsIn(r.a.m, r.a.unit)}) convertidas para a realidade.`) +
      `<div class="tiles">${Object.keys(C.UNITS).map((u) => tile(C.UNITS[u].name, dimsIn(out, u))).join('')}</div>` +
      scaleBar(r.scale.factor);
  }

  /* ---------- Gráfico (caixa 3D + comparações) ---------- */
  function box3d(m) {
    const g = C.isoBox(m.x || 0, m.y || 0, m.z || 0);
    const { minX, maxX, minY, maxY } = g.bbox;
    const padX = 66, padY = 24;
    const vb = [minX - padX, minY - padY, maxX - minX + 2 * padX, maxY - minY + 2 * padY].map((n) => n.toFixed(1)).join(' ');
    const poly = (cls, pts) => `<polygon class="${cls}" points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}"/>`;
    const label = (d, dx, dy, anchor) => m[d.k] == null ? '' :
      `<text x="${(g.labels[d.k][0] + dx).toFixed(1)}" y="${(g.labels[d.k][1] + dy).toFixed(1)}" text-anchor="${anchor}">${d.short} ${C.formatLength(m[d.k]).text}</text>`;
    const [dy, dx, dz] = DIMS;
    return `<svg viewBox="${vb}" role="img" aria-label="Caixa 3D proporcional: ${dimsAuto(m)}">
      ${poly('f-left', g.faces.left)}${poly('f-right', g.faces.right)}${poly('f-top', g.faces.top)}
      ${label(dx, -8, 13, 'end')}${label(dy, 8, 3, 'start')}${label(dz, 9, 12, 'start')}
    </svg>`;
  }

  function chartSection(title, sub, m, meLabel) {
    const { smaller, larger, nearest, axis } = C.pickReferences(m);
    const row = (name, v, me) => `<li${me ? ' class="me"' : ''}>
        <div class="meta"><span>${name}</span><b>${C.formatLength(v).text}</b></div>
        <div class="track"><i style="width:${Math.min(100, (v / axis) * 100).toFixed(2)}%"></i></div>
      </li>`;
    const rows = [larger && row(larger.name, larger.m), row(meLabel, m, true), smaller && row(smaller.name, smaller.m)];
    return `<div class="cmp"><h2>${title}</h2><p class="sub">${sub}</p><ul>${rows.filter(Boolean).join('')}</ul>
      <p class="ratio">≈ ${C.formatNumber(Number((m / nearest.m).toPrecision(2)))} × ${nearest.name}</p></div>`;
  }

  function renderChart(r) {
    const el = $('chart');
    if (!r.ok) {
      el.innerHTML = '<p class="placeholder">O gráfico de tamanho aparece aqui.</p>';
      return;
    }
    const shown = view === 'real' ? r.realM : r.drawM;
    const big = filled(r.realM).reduce((p, d) => (r.realM[d.k] > r.realM[p.k] ? d : p));
    const pressed = (v) => `aria-pressed="${view === v}"`;
    el.innerHTML =
      `<div class="box3d">
        <div class="box-head"><h2>Seu objeto em 3D</h2>
          <div class="seg" role="group" aria-label="Medidas exibidas">
            <button type="button" data-view="real" ${pressed('real')}>Real</button>
            <button type="button" data-view="draw" ${pressed('draw')}>Na escala</button>
          </div>
        </div>
        ${box3d(shown)}
        <p class="sub">Proporções reais de altura (y), largura (x) e profundidade (z).</p>
      </div>` +
      chartSection('Na realidade', `Maior dimensão: ${big.name.toLowerCase()}`, r.realM[big.k], 'Seu objeto') +
      chartSection('No desenho ou maquete', `Maior dimensão na escala ${r.scale.label}`, r.drawM[big.k], 'Na escala');
  }

  function update() {
    const r = compute();
    ALL_FIELDS.forEach((id) => $(id).removeAttribute('aria-invalid'));
    $('error').textContent = r.error || '';
    if (r.error) $(r.field).setAttribute('aria-invalid', 'true');
    last = r.ok ? r : null;
    $('saveBtn').disabled = !last;
    renderResult(r);
    renderChart(r);

    const cur = C.parseScale($('scaleInput').value);
    document.querySelectorAll('.chip').forEach((c) => {
      const p = C.parseScale(c.dataset.scale);
      c.setAttribute('aria-pressed', String(!!cur && Math.abs(p.factor / cur.factor - 1) < 1e-9));
    });
  }

  /* ---------- Modos ---------- */
  function setMode(next, resetUnits) {
    mode = next;
    const cfg = MODES[next];
    document.querySelectorAll('.tabs [role="tab"]').forEach((t) => {
      const on = t.dataset.mode === next;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    $('labelA').textContent = cfg.labelA;
    $('labelB').textContent = cfg.labelB || '';
    $('blockB').hidden = !cfg.b;
    $('blockScale').hidden = !cfg.scale;
    if (resetUnits) {
      $('unitA').value = cfg.unitA;
      if (cfg.unitB) $('unitB').value = cfg.unitB;
    }
    update();
  }

  /* ---------- Histórico ---------- */
  const loadHistory = () => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
  };
  const saveHistory = (list) => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* sem armazenamento */ }
  };

  function renderHistory() {
    const list = loadHistory();
    $('historyCard').hidden = !list.length;
    $('historyList').replaceChildren(...list.map((h) => {
      const li = document.createElement('li');
      const open = document.createElement('button');
      open.type = 'button'; open.className = 'item'; open.textContent = h.summary; open.dataset.id = h.id;
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'del'; del.textContent = '×'; del.dataset.id = h.id;
      del.setAttribute('aria-label', 'Remover do histórico');
      li.append(open, del);
      return li;
    }));
  }

  const readRaw = () => ({
    a: Object.fromEntries(DIMS.map((d) => [d.k, $(fieldId('a', d)).value])), ua: $('unitA').value,
    b: Object.fromEntries(DIMS.map((d) => [d.k, $(fieldId('b', d)).value])), ub: $('unitB').value,
    scale: $('scaleInput').value,
  });

  function applyHistory(h) {
    if (!MODES[h.mode]) return;
    DIMS.forEach((d) => {
      $(fieldId('a', d)).value = (h.a && h.a[d.k]) || '';
      $(fieldId('b', d)).value = (h.b && h.b[d.k]) || '';
    });
    $('unitA').value = h.ua; $('unitB').value = h.ub;
    $('scaleInput').value = h.scale || '';
    setMode(h.mode, false);
  }

  /* ---------- Utilidades ---------- */
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.append(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast(`Copiado: ${text}`);
  }

  /* ---------- Inicialização ---------- */
  function init() {
    const opts = Object.entries(C.UNITS).map(([k, u]) => `<option value="${k}">${u.label}</option>`).join('');
    $('unitA').innerHTML = opts; $('unitB').innerHTML = opts;
    $('unitA').value = 'km'; $('unitB').value = 'cm';

    $('presets').innerHTML = PRESETS.map((g) => `<div class="preset-group"><h3>${g.group}</h3><div class="chips">${
      g.items.map((s) => `<button type="button" class="chip" data-scale="${s}" aria-pressed="false">${s}</button>`).join('')
    }</div></div>`).join('');

    ALL_FIELDS.forEach((id) => $(id).addEventListener('input', update));
    ['unitA', 'unitB'].forEach((id) => $(id).addEventListener('change', update));

    $('presets').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      $('scaleInput').value = chip.dataset.scale;
      update();
    });

    $('swapBtn').addEventListener('click', () => {
      const sc = C.parseScale($('scaleInput').value);
      if (!sc) return toast('Digite uma escala válida primeiro');
      $('scaleInput').value = C.invertScale(sc).label;
      update();
    });

    const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => setMode(t.dataset.mode, true));
      t.addEventListener('keydown', (e) => {
        const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!d) return;
        const n = tabs[(i + d + tabs.length) % tabs.length];
        n.focus(); setMode(n.dataset.mode, true);
      });
    });

    $('result').addEventListener('click', (e) => {
      const c = e.target.closest('[data-copy]');
      if (c) copy(c.dataset.copy);
    });

    $('chart').addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]');
      if (!b) return;
      view = b.dataset.view;
      if (last) renderChart(last);
    });

    $('saveBtn').addEventListener('click', () => {
      if (!last) return;
      const entry = { id: String(Date.now()), mode, summary: last.summary, ...readRaw() };
      saveHistory([entry, ...loadHistory().filter((h) => h.summary !== entry.summary)].slice(0, HISTORY_MAX));
      renderHistory();
      toast('Salvo no histórico');
    });

    $('historyList').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const list = loadHistory();
      if (btn.classList.contains('del')) {
        saveHistory(list.filter((h) => h.id !== btn.dataset.id));
        renderHistory();
      } else {
        const h = list.find((x) => x.id === btn.dataset.id);
        if (h) applyHistory(h);
      }
    });
    $('clearHistory').addEventListener('click', () => { saveHistory([]); renderHistory(); });

    $('themeBtn').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('escalas.theme', next); } catch { /* ignora */ }
    });

    renderHistory();
    setMode('real', false);
  }

  init();
})();
