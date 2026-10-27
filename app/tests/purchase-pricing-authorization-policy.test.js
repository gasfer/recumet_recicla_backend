'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyPurchaseEdit } = require('../services/purchase-pricing-authorization-policy.service');

const originalInput = {
  id_provider: 4, id_sucursal: 2, id_storage: 3, id_scales: 1,
  createdAt: '2026-10-20T00:00:00.000Z', date_voucher: '2026-10-20T00:00:00.000Z',
  type: 'CONTADO', type_payment: 'EFECTIVO', type_registry: 'SIN FICHA',
  registry_number: 'SFC-1', discount: 0, status: 'ACTIVE', accounts_payable: null,
};
const originalDetails = [
  { id_product: 10, quantity: 5, cost: 10, total: 50, status: 'ACTIVE' },
  { id_product: 20, quantity: 3, cost: 5, total: 15, status: 'ACTIVE' },
];
const requestedInput = { ...originalInput, sumas: 65, total: 65 };
const priceDetails = [
  { ...originalDetails[0], cost: 12 },
  originalDetails[1],
];
const classify = (options = {}) => classifyPurchaseEdit({
  originalInput, originalDetails, requestedInput, requestedDetails: priceDetails,
  now: '2026-10-27T00:00:00.000Z', ...options,
});

test('Administrators editan precios sin autorización incluso después de siete días', () => {
  const result = classify({ actorRole: 'ADMINISTRADOR' });
  assert.equal(result.requiresAuthorization, false);
  assert.equal(result.reason, 'administrator-price-edit');
});

test('Liquidación y Caja no requiere autorización hasta completar siete días', () => {
  const atBoundary = classify({ actorRole: 'LIQUIDACION_CAJA' });
  assert.equal(atBoundary.requiresAuthorization, false);
  const afterBoundary = classify({
    actorRole: 'LIQUIDACION_CAJA',
    now: '2026-10-27T00:00:00.001Z',
  });
  assert.equal(afterBoundary.requiresAuthorization, true);
});

test('otros roles siempre requieren autorización para cambiar precio', () => {
  for (const actorRole of ['ENCARGADO', 'OPERADOR', 'COMERCIAL']) {
    assert.equal(classify({ actorRole }).requiresAuthorization, true);
  }
});

test('detecta asignación inicial de costo cero y regularización parcial de precios', () => {
  const partlyUnpriced = [
    { ...originalDetails[0], cost: 0, total: 0 },
    originalDetails[1],
  ];
  const result = classifyPurchaseEdit({
    originalInput, originalDetails: partlyUnpriced,
    requestedInput: { ...requestedInput, sumas: 65, total: 65 },
    requestedDetails: [
      { ...partlyUnpriced[0], cost: 10, total: 50 },
      originalDetails[1],
    ],
    actorRole: 'LIQUIDACION_CAJA', now: '2026-10-21T00:00:00.000Z',
  });
  assert.equal(result.hasPriceChanges, true);
  assert.equal(result.requiresAuthorization, false);
});

test('operador de balanza no puede cambiar costo aunque envíe autorización', () => {
  assert.equal(classify({ actorRole: 'OPERADOR_BALANZA' }).forbiddenPriceChange, true);
});

test('todos los roles pueden conservar costo y actualizar solo la cantidad dentro del plazo', () => {
  const quantityOnly = [{ ...originalDetails[0], quantity: 6, total: 60 }, originalDetails[1]];
  for (const actorRole of ['ADMINISTRADOR', 'LIQUIDACION_CAJA', 'OPERADOR_BALANZA', 'ENCARGADO']) {
    const result = classify({
      actorRole,
      requestedInput: { ...requestedInput, sumas: 75, total: 75 },
      requestedDetails: quantityOnly,
      now: '2026-10-27T00:00:00.000Z',
    });
    assert.equal(result.hasPriceChanges, false);
    assert.equal(result.forbiddenPriceChange, false);
    assert.equal(result.forbiddenPurchaseChange, false);
    assert.equal(result.editWindowExpired, false);
  }
});

test('el rol de balanza no puede cambiar encabezado ni otros datos de compra', () => {
  const result = classify({
    actorRole: 'OPERADOR_BALANZA',
    requestedInput: { ...requestedInput, id_provider: 99 },
  });
  assert.equal(result.forbiddenPurchaseChange, true);
});

test('la ventana de edición permite exactamente treinta días y vencida solo acepta precio', () => {
  const atBoundary = classify({ actorRole: 'ADMINISTRADOR', now: '2026-11-19T00:00:00.000Z' });
  assert.equal(atBoundary.editWindowExpired, false);
  const latePriceOnly = classify({ actorRole: 'ADMINISTRADOR', now: '2026-11-19T00:00:00.001Z' });
  assert.equal(latePriceOnly.editWindowExpired, true);
  assert.equal(latePriceOnly.isPriceOnly, true);
  const mixed = classify({
    actorRole: 'ADMINISTRADOR',
    requestedDetails: [{ ...priceDetails[0], quantity: 6, total: 72 }, priceDetails[1]],
    now: '2026-11-19T00:00:00.001Z',
  });
  assert.equal(mixed.hasNonPriceChanges, true);
});

test('cantidad y cabecera se reconocen como cambios distintos al precio', () => {
  assert.equal(classify({ requestedDetails: [{ ...originalDetails[0], quantity: 6 }, originalDetails[1]] }).hasNonPriceChanges, true);
  assert.equal(classify({ requestedInput: { ...requestedInput, id_provider: 9 } }).hasNonPriceChanges, true);
});

test('createdAt inválido o futuro fuerza autorización para roles no administradores', () => {
  for (const createdAt of [undefined, '2026-10-28T00:00:00.000Z']) {
    const result = classify({
      actorRole: 'LIQUIDACION_CAJA',
      originalInput: { ...originalInput, createdAt },
      now: '2026-10-27T00:00:00.000Z',
    });
    assert.equal(result.requiresAuthorization, true);
  }
});
