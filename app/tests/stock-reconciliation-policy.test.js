'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { STOCK_RECONCILIATION_STRATEGIES: STRATEGIES } = require('../constants/stock-reconciliation');
const { investigationErrors, buildPreview, assertStatusTransition } = require('../services/stock-reconciliation-policy.service');

test('una regularización exige conteo, causa, responsable y evidencia', () => {
  const errors = investigationErrors({ strategy: STRATEGIES.ADJUST_STOCK_BY_COUNT, evidences: [] });
  assert.ok(errors.length >= 4);
});

test('un conteo vacío no se interpreta como cero', () => {
  const errors = investigationErrors({
    physicalCount: null, cause: 'Conteo físico', notes: 'Conteo verificado en planta',
    strategy: STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT, assignedUserId: 7,
    evidences: [{ evidence_type: 'CONTEO_FISICO' }],
  });
  assert.match(errors.join(' '), /conteo físico válido/i);
});

test('registrar Kardex omitido sólo cambia Kardex y muestra el efecto', () => {
  const result = buildPreview({ strategy: STRATEGIES.REGISTER_MISSING_KARDEX, stock: 12, kardex: 10, physicalCount: 12, sourceReferenceCode: 'COMP-1' });
  assert.equal(result.stock_after, 12);
  assert.equal(result.kardex_after, 12);
  assert.equal(result.movement.type, 'INPUT');
  assert.equal(result.movement.quantity, 2);
});

test('ajustar Stock requiere que el conteo confirme Kardex', () => {
  assert.throws(() => buildPreview({ strategy: STRATEGIES.ADJUST_STOCK_BY_COUNT, stock: 12, kardex: 10, physicalCount: 12 }), /conteo físico/i);
  const result = buildPreview({ strategy: STRATEGIES.ADJUST_STOCK_BY_COUNT, stock: 12, kardex: 10, physicalCount: 10 });
  assert.equal(result.stock_after, 10);
  assert.equal(result.kardex_after, 10);
  assert.deepEqual(result.stock_adjustment, { type: 'DECREASE', quantity: 2 });
});

test('muestra el resultado final del caso 3196 / 2617.25 con conteo 2617.25', () => {
  const result = buildPreview({
    strategy: STRATEGIES.ADJUST_STOCK_BY_COUNT,
    stock: 3196,
    kardex: 2617.25,
    physicalCount: 2617.25,
  });
  assert.equal(result.stock_after, 2617.25);
  assert.equal(result.kardex_after, 2617.25);
  assert.equal(result.difference_after, 0);
  assert.deepEqual(result.stock_adjustment, { type: 'DECREASE', quantity: 578.75 });
  assert.equal(result.movement, null);
});

test('el ajuste físico lleva ambos libros al conteo, incluso cuando es un tercer saldo', () => {
  const scenarios = [
    { stock: 12, kardex: 10, count: 12, type: 'INPUT', quantity: 2 },
    { stock: 8, kardex: 10, count: 8, type: 'OUTPUT', quantity: 2 },
    { stock: 12, kardex: 10, count: 9, type: 'OUTPUT', quantity: 1 },
  ];
  for (const scenario of scenarios) {
    const preview = buildPreview({ strategy: STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT, stock: scenario.stock, kardex: scenario.kardex, physicalCount: scenario.count });
    assert.equal(preview.stock_after, scenario.count);
    assert.equal(preview.kardex_after, scenario.count);
    assert.equal(preview.difference_after, 0);
    assert.deepEqual(preview.movement, { type: scenario.type, quantity: scenario.quantity });
  }
});

test('el ciclo de vida acepta avances sustentados y rechaza saltos inválidos', () => {
  assert.doesNotThrow(() => assertStatusTransition('DETECTADA', 'EN_INVESTIGACION'));
  assert.doesNotThrow(() => assertStatusTransition('DETECTADA', 'LISTA_PARA_REGULARIZAR'));
  assert.doesNotThrow(() => assertStatusTransition('LISTA_PARA_REGULARIZAR', 'RESUELTA'));
  assert.throws(() => assertStatusTransition('DETECTADA', 'RESUELTA'), /No se permite/);
  assert.throws(() => assertStatusTransition('RESUELTA', 'EN_INVESTIGACION'), /No se permite/);
});

test('la política deriva acciones compatibles para ambas direcciones de diferencia', () => {
  const scenarios = [
    { stock: 12, kardex: 10, physicalCount: 12, movementType: 'INPUT', quantity: 2 },
    { stock: 8, kardex: 10, physicalCount: 8, movementType: 'OUTPUT', quantity: 2 },
  ];

  for (const scenario of scenarios) {
    const preview = buildPreview({
      strategy: STRATEGIES.REGISTER_MISSING_KARDEX,
      stock: scenario.stock,
      kardex: scenario.kardex,
      physicalCount: scenario.physicalCount,
      sourceReferenceCode: 'DOC-1',
    });
    assert.deepEqual(preview.movement, { type: scenario.movementType, quantity: scenario.quantity });
    assert.equal(preview.difference_after, 0);

    const stockPreview = buildPreview({
      strategy: STRATEGIES.ADJUST_STOCK_BY_COUNT,
      stock: scenario.stock,
      kardex: scenario.kardex,
      physicalCount: scenario.kardex,
    });
    assert.equal(stockPreview.stock_after, scenario.kardex);
    assert.equal(stockPreview.difference_after, 0);
  }
});
