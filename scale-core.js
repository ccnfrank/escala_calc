/* Lógica pura da calculadora de escalas (sem DOM). Funciona no navegador e no Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScaleCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UNITS = {
    mm: { label: 'mm', name: 'Milímetros', m: 0.001 },
    cm: { label: 'cm', name: 'Centímetros', m: 0.01 },
    m: { label: 'm', name: 'Metros', m: 1 },
    km: { label: 'km', name: 'Quilômetros', m: 1000 },
    in: { label: 'pol', name: 'Polegadas', m: 0.0254 },
    ft: { label: 'pé', name: 'Pés', m: 0.3048 },
    mi: { label: 'mi', name: 'Milhas', m: 1609.344 },
  };

  const toMeters = (v, unit) => v * UNITS[unit].m;
  const fromMeters = (m, unit) => m / UNITS[unit].m;
  const clean = (x) => Number(x.toPrecision(10));

  /** Aceita "2,5", "2.5", "10.000", "1.234.567,89". Retorna NaN se inválido. */
  function parseNumber(input) {
    let s = String(input).trim().replace(/\s+/g, '');
    if (!/^[+-]?[\d.,]+$/.test(s)) return NaN;
    const hasDot = s.includes('.');
    const hasComma = s.includes(',');
    if (hasDot && hasComma) {
      const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
      const thou = dec === ',' ? '.' : ',';
      s = s.split(thou).join('').replace(dec, '.');
    } else if (hasComma) {
      s = s.match(/,/g).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (hasDot && /^[+-]?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function formatNumber(x) {
    if (x === 0 || !Number.isFinite(x)) return '0';
    x = clean(x);
    const a = Math.abs(x);
    let opts;
    if (a >= 1e15 || a < 1e-9) opts = { notation: 'scientific', maximumFractionDigits: 4 };
    else if (a >= 1000) opts = { maximumFractionDigits: 2 };
    else if (a >= 1) opts = { maximumFractionDigits: 4 };
    else opts = { maximumSignificantDigits: 6 };
    return new Intl.NumberFormat('pt-BR', opts).format(x);
  }

  /** a:b = desenho:real. 1:50.000 reduz; 5:1 amplia. */
  function makeScale(a, b) {
    return { a, b, factor: a / b, label: a === 1 ? `1:${formatNumber(b)}` : `${formatNumber(a)}:${formatNumber(b)}` };
  }

  /** "1:50.000", "5:1", "1/100" ou só "50000" (= 1:50000). Retorna null se inválido. */
  function parseScale(input) {
    const s = String(input).trim();
    if (!s) return null;
    const parts = s.split(/[:/]/);
    if (parts.length > 2) return null;
    const [a, b] = parts.length === 2 ? parts.map(parseNumber) : [1, parseNumber(parts[0])];
    if (!(a > 0) || !(b > 0)) return null;
    return makeScale(a, b);
  }

  function scaleFromFactor(f) {
    return f <= 1 ? makeScale(1, clean(1 / f)) : makeScale(clean(f), 1);
  }

  const invertScale = (sc) => makeScale(sc.b, sc.a);
  const realToScaled = (realM, factor) => realM * factor;
  const scaledToReal = (scaledM, factor) => scaledM / factor;
  const findFactor = (realM, drawnM) => drawnM / realM;

  function bestUnit(m) {
    const a = Math.abs(m);
    if (a >= 1000) return 'km';
    if (a >= 1) return 'm';
    if (a >= 0.01) return 'cm';
    return 'mm';
  }

  function formatLength(m) {
    const unit = bestUnit(m);
    const value = fromMeters(m, unit);
    return { unit, value, text: `${formatNumber(value)} ${UNITS[unit].label}` };
  }

  /** Menor distância "redonda" (1, 2, 5 × 10^k) que ocupa pelo menos minMm no desenho. */
  function niceBarDistance(factor, minMm = 30) {
    for (let k = -12; k <= 15; k++) {
      for (const base of [1, 2, 5]) {
        const d = base * Math.pow(10, k);
        if (d * factor * 1000 >= minMm) return d;
      }
    }
    return null;
  }

  /** Objetos conhecidos (tamanho em metros), do menor para o maior. */
  const REFERENCES = [
    { name: 'Fio de cabelo (espessura)', m: 0.00007 },
    { name: 'Grão de areia', m: 0.0005 },
    { name: 'Grão de arroz', m: 0.006 },
    { name: 'Moeda de R$ 1', m: 0.027 },
    { name: 'Cartão de crédito', m: 0.0856 },
    { name: 'Lápis', m: 0.175 },
    { name: 'Folha A4 (lado maior)', m: 0.297 },
    { name: 'Skate', m: 0.8 },
    { name: 'Porta', m: 2.1 },
    { name: 'Carro', m: 4.5 },
    { name: 'Ônibus', m: 12 },
    { name: 'Cristo Redentor', m: 38 },
    { name: 'Campo de futebol', m: 105 },
    { name: 'Torre Eiffel', m: 330 },
    { name: 'Burj Khalifa', m: 828 },
    { name: 'Avenida Paulista', m: 2800 },
    { name: 'Monte Everest (altura)', m: 8849 },
    { name: 'Ponte Rio–Niterói', m: 13290 },
    { name: 'Maratona', m: 42195 },
    { name: 'Distância São Paulo–Rio', m: 430000 },
    { name: 'Brasil (norte a sul)', m: 4395000 },
    { name: 'Circunferência da Terra', m: 40075000 },
  ];

  /** Referência menor e maior que m, mais a mais próxima (em escala logarítmica) e o eixo do gráfico. */
  function pickReferences(m) {
    const smaller = [...REFERENCES].reverse().find((r) => r.m <= m * 0.95) || null;
    const larger = REFERENCES.find((r) => r.m >= m * 1.05) || null;
    const nearest = REFERENCES.reduce((best, r) =>
      Math.abs(Math.log(r.m / m)) < Math.abs(Math.log(best.m / m)) ? r : best);
    return { smaller, larger, nearest, axis: Math.max(m, larger ? larger.m : 0) * 1.05 };
  }

  /**
   * Caixa em projeção isométrica (y para cima, x para a direita, z para a esquerda/frente).
   * Dimensões 0 ou ausentes viram uma espessura mínima para o sólido continuar visível.
   */
  function isoBox(w, h, d, size = 100) {
    const max = Math.max(w, h, d);
    const k = size / max;
    const min = size * 0.06;
    [w, h, d] = [w, h, d].map((v) => Math.max(v * k, min));
    const c = Math.sqrt(3) / 2;
    const P = (x, y, z) => [(x - z) * c, (x + z) * 0.5 - y];
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const faces = {
      top: [P(0, h, 0), P(w, h, 0), P(w, h, d), P(0, h, d)],
      right: [P(w, 0, 0), P(w, 0, d), P(w, h, d), P(w, h, 0)],
      left: [P(0, 0, d), P(w, 0, d), P(w, h, d), P(0, h, d)],
    };
    const pts = [].concat(faces.top, faces.right, faces.left);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return {
      faces,
      labels: { x: mid(P(0, 0, d), P(w, 0, d)), y: mid(P(w, 0, 0), P(w, h, 0)), z: mid(P(w, 0, 0), P(w, 0, d)) },
      bbox: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
    };
  }

  return {
    REFERENCES, pickReferences, isoBox,
    UNITS, toMeters, fromMeters, parseNumber, formatNumber, parseScale, makeScale,
    scaleFromFactor, invertScale, realToScaled, scaledToReal, findFactor,
    bestUnit, formatLength, niceBarDistance,
  };
});
