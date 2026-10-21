// Uso: node test.js
const assert = require('assert');
const C = require('./scale-core.js');

const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);

// parseNumber
assert.strictEqual(C.parseNumber('2,5'), 2.5);
assert.strictEqual(C.parseNumber('2.5'), 2.5);
assert.strictEqual(C.parseNumber('10.000'), 10000);
assert.strictEqual(C.parseNumber('0.500'), 0.5);
assert.strictEqual(C.parseNumber('1.234.567,89'), 1234567.89);
assert.ok(Number.isNaN(C.parseNumber('abc')));
assert.ok(Number.isNaN(C.parseNumber('')));

// parseScale
near(C.parseScale('1:50.000').factor, 1 / 50000);
near(C.parseScale('5:1').factor, 5);
near(C.parseScale('50000').factor, 1 / 50000);
near(C.parseScale('1/100').factor, 0.01);
assert.strictEqual(C.parseScale('1:0'), null);
assert.strictEqual(C.parseScale('1:2:3'), null);
assert.strictEqual(C.parseScale('x'), null);
assert.strictEqual(C.parseScale('1:50.000').label, '1:50.000');
assert.strictEqual(C.invertScale(C.parseScale('1:50')).label, '50:1');

// 1 km em 1:50.000 = 2 cm
const f = C.parseScale('1:50.000').factor;
near(C.fromMeters(C.realToScaled(C.toMeters(1, 'km'), f), 'cm'), 2);
// 2,5 km em 1:50.000 = 5 cm
assert.strictEqual(C.formatLength(C.realToScaled(2500, f)).text, '5 cm');
// 5 cm no mapa 1:100.000 = 5 km reais
assert.strictEqual(C.formatLength(C.scaledToReal(0.05, 1 / 100000)).text, '5 km');
// Ampliação 5:1: 2 mm viram 10 mm
near(C.realToScaled(0.002, 5), 0.01);
// Descobrir escala: 2,5 km ↔ 5 cm = 1:50.000
assert.strictEqual(C.scaleFromFactor(C.findFactor(2500, 0.05)).label, '1:50.000');
assert.strictEqual(C.scaleFromFactor(C.findFactor(0.002, 0.01)).label, '5:1');

// Formatação
assert.strictEqual(C.formatNumber(1234567), '1.234.567');
assert.strictEqual(C.formatNumber(0.05), '0,05');
assert.strictEqual(C.formatNumber(5.000000000000001), '5');
assert.strictEqual(C.formatNumber(0), '0');

// Escala gráfica: sempre ≥ 20 mm e < 60 mm no desenho
for (const n of [20, 50, 1000, 50000, 1e6]) {
  const fac = 1 / n;
  const mm = C.niceBarDistance(fac) * fac * 1000;
  assert.ok(mm >= 30 && mm < 75, `1:${n} → ${mm} mm`);
}
assert.ok(C.niceBarDistance(10) * 10 * 1000 >= 30);

// Referências de comparação
const p = C.pickReferences(0.05);
assert.strictEqual(p.smaller.name, 'Moeda de R$ 1');
assert.strictEqual(p.larger.name, 'Cartão de crédito');
assert.strictEqual(p.nearest.name, 'Cartão de crédito');
assert.ok(p.axis > 0.0856);
assert.strictEqual(C.pickReferences(1e9).larger, null);
assert.strictEqual(C.pickReferences(1e-9).smaller, null);
assert.ok(C.pickReferences(1e9).axis >= 1e9);

// Caixa isométrica: cubo de lado 100 → largura (w+d)·cos30, altura 100 + (w+d)·0,5
const box = C.isoBox(1, 1, 1);
near(box.bbox.maxX - box.bbox.minX, 200 * Math.sqrt(3) / 2);
near(box.bbox.maxY - box.bbox.minY, 200);
const flat = C.isoBox(10, 10, 0);
assert.ok(flat.bbox.maxY - flat.bbox.minY > 100); // profundidade 0 continua visível

console.log('OK — todos os testes passaram');
