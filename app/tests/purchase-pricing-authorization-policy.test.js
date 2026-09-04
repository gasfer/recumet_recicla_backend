'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyInitialPricing, isUnpriced } = require('../services/purchase-pricing-authorization-policy.service');

const originalInput = {
  id_provider: 4,
  id_sucursal: 2,
  id_storage: 3,
  id_scales: 1,
  createdAt: '2026-09-03T13:00:00.000Z',
  date_voucher: '2026-09-03T13:46:00.000Z',
  type: 'CONTADO',
  type_payment: 'EFECTIVO',
  type_registry: 'SIN FICHA',
  registry_number: 'SFC-07208',
  discount: 0,
  on_account: 0,
  status: 'ACTIVE',
  accounts_payable: null,
};

const requestedInput = {
  id_provider: 4,
  id_sucursal: 2,
  id_storage: 3,
  id_scales: 1,
  date_voucher: new Date('2026-09-03T13:46:00.000Z'),
  type: 'CONTADO',
  type_payment: 'EFECTIVO',
  type_registry: 'SIN FICHA',
  discount: 0,
  on_account: 0,
  status: 'ACTIVE',
  sumas: 65,
  total: 65,
};

const originalDetails = [
  { id_product: 10, quantity: '5', cost: 0, total: 0 },
  { id_product: 20, quantity: 3, cost: '0', total: '0' },
];

const requestedDetails = [
  { id_product: 10, quantity: 5, cost: 10, total: 50 },
  { id_product: 20, quantity: 3, cost: 5, total: 15 },
];

test('normaliza null, cero numérico y cero textual como precios no asignados', () => {
  for (const value of [null, undefined, '', 0, '0', '0.0000']) assert.equal(isUnpriced(value), true);
  for (const value of [-1, 0.01, '12']) assert.equal(isUnpriced(value), false);
});

test('permite completar una compra totalmente sin precio sin autorización adicional', () => {
  assert.deepEqual(classifyInitialPricing({ originalInput, originalDetails, requestedInput, requestedDetails, now: '2026-09-04T12:59:59.000Z' }), {
    requiresAuthorization: false,
    reason: 'initial-pricing',
  });
});

test('una compra sin detalles requiere autorización', () => {
  assert.equal(classifyInitialPricing({ originalInput, originalDetails: [], requestedInput, requestedDetails }).requiresAuthorization, true);
});

test('permite completar costos pendientes sin alterar los ya valorizados', () => {
  const result = classifyInitialPricing({
    originalInput,
    originalDetails: [{ ...originalDetails[0], cost: 2 }, originalDetails[1]],
    requestedInput: { ...requestedInput, sumas: 25, total: 25 },
    requestedDetails: [{ ...requestedDetails[0], cost: 2, total: 10 }, requestedDetails[1]],
    now: '2026-09-03T14:00:00.000Z',
  });
  assert.equal(result.requiresAuthorization, false);
});

test('permite una regularización parcial y exige completar al menos un costo', () => {
  assert.equal(classifyInitialPricing({
    originalInput,
    originalDetails,
    requestedInput: { ...requestedInput, sumas: 50, total: 50 },
    requestedDetails: [requestedDetails[0], originalDetails[1]],
    now: '2026-09-03T14:00:00.000Z',
  }).requiresAuthorization, false);
  assert.equal(classifyInitialPricing({
    originalInput,
    originalDetails,
    requestedInput: { ...requestedInput, sumas: 0, total: 0 },
    requestedDetails: originalDetails,
    now: '2026-09-03T14:00:00.000Z',
  }).reason, 'no-pending-price-completed');
});

test('exige autorización al vencer 24 horas o si createdAt es inválido o futuro', () => {
  for (const [createdAt, now, reason] of [
    ['2026-09-03T13:00:00.000Z', '2026-09-04T13:00:00.001Z', 'pricing-window-expired'],
    [undefined, '2026-09-03T14:00:00.000Z', 'invalid-pricing-window'],
    ['2026-09-03T15:00:00.000Z', '2026-09-03T14:00:00.000Z', 'future-created-at'],
  ]) {
    const result = classifyInitialPricing({
      originalInput: { ...originalInput, createdAt }, originalDetails, requestedInput, requestedDetails, now,
    });
    assert.equal(result.reason, reason);
    assert.equal(result.requiresAuthorization, true);
  }
});

test('exige autorización si cambia un costo previamente valorizado', () => {
  const result = classifyInitialPricing({
    originalInput,
    originalDetails: [{ ...originalDetails[0], cost: 2 }, originalDetails[1]],
    requestedInput,
    requestedDetails,
    now: '2026-09-03T14:00:00.000Z',
  });
  assert.equal(result.reason, 'previous-price-changed');
});

for (const [name, mutateInput, mutateDetails] of [
  ['cantidad', value => value, details => [{ ...details[0], quantity: 6, total: 60 }, details[1]]],
  ['producto', value => value, details => [{ ...details[0], id_product: 99 }, details[1]]],
  ['proveedor', value => ({ ...value, id_provider: 99 }), value => value],
  ['descuento', value => ({ ...value, discount: 5 }), value => value],
  ['tipo de pago', value => ({ ...value, type_payment: 'CHEQUE' }), value => value],
  ['cuota inicial', value => ({ ...value, on_account: 10 }), value => value],
]) {
  test(`requiere autorización cuando cambia ${name}`, () => {
    const result = classifyInitialPricing({
      originalInput,
      originalDetails,
      requestedInput: mutateInput({ ...requestedInput }),
      requestedDetails: mutateDetails(requestedDetails.map(detail => ({ ...detail }))),
      now: '2026-09-03T14:00:00.000Z',
    });
    assert.equal(result.requiresAuthorization, true);
  });
}

test('requiere autorización cuando los importes enviados no son derivados de cantidad y precio', () => {
  const result = classifyInitialPricing({
    originalInput,
    originalDetails,
    requestedInput,
    requestedDetails: [{ ...requestedDetails[0], total: 999 }, requestedDetails[1]],
    now: '2026-09-03T14:00:00.000Z',
  });
  assert.equal(result.requiresAuthorization, true);
});

test('requiere autorización cuando la solicitud duplica un producto', () => {
  const result = classifyInitialPricing({
    originalInput,
    originalDetails,
    requestedInput,
    requestedDetails: [requestedDetails[0], { ...requestedDetails[1], id_product: 10 }],
    now: '2026-09-03T14:00:00.000Z',
  });
  assert.equal(result.requiresAuthorization, true);
});
