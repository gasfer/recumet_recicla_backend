'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAutomaticVerification,
  buildHistoricalVerification,
} = require('../services/transfer-reconciliation-registration-verification.service');

const transfer = {
  id: 44,
  cod: 'TRAS00044',
  registry_number: 'ING-000044',
  sucursal_received: { name: 'Central' },
  storage_received: { name: 'Materia prima' },
};

const automaticContext = ({ registeredQuantity = 0, pending = 10 } = {}) => ({
  note: {
    id_sucursal: 2,
    id_storage: 4,
    type: 'EXCEDENTE_PARA_REVISION',
    registry_number: 'NTR-44',
    transfer,
  },
  detail: {
    id: 8,
    quantity_difference: 10,
    product: { id: 5, cod: 'MP-05', name: 'Cobre' },
  },
  pending,
  registeredQuantity,
});

test('permite una diferencia sin registro vigente y conserva la previsualización de solo lectura', () => {
  const verification = buildAutomaticVerification({
    context: automaticContext(),
    actions: [],
    inventory: { before_stock: 12, before_kardex: 10, after_stock: 12, after_kardex: 20 },
  });

  assert.equal(verification.status, 'SIN_REGISTRO_ACTIVO');
  assert.equal(verification.is_blocked, false);
  assert.equal(verification.transfer.number, 'TRAS00044');
  assert.equal(verification.registration.quantity_pending, 10);
  assert.equal(verification.inventory.after_kardex, 20);
});

test('bloquea un registro activo parcial aunque todavía exista remanente', () => {
  const verification = buildAutomaticVerification({
    context: automaticContext({ registeredQuantity: 4, pending: 6 }),
    actions: [{ id: 33, quantity: 4, strategy: 'REGISTER_RECEIPT_SURPLUS', movementLinks: [] }],
    inventory: null,
  });

  assert.equal(verification.status, 'REGISTRO_PARCIAL');
  assert.equal(verification.is_blocked, true);
  assert.equal(verification.registration.quantity_registered, 4);
  assert.equal(verification.registration.quantity_pending, 6);
});

test('bloquea un registro activo que cubre toda la diferencia', () => {
  const verification = buildAutomaticVerification({
    context: automaticContext({ registeredQuantity: 10, pending: 0 }),
    actions: [{ id: 34, quantity: 10, strategy: 'REGISTER_RECEIPT_SURPLUS', movementLinks: [{ id: 91 }] }],
    inventory: null,
  });

  assert.equal(verification.status, 'REGISTRO_EXISTENTE');
  assert.equal(verification.is_blocked, true);
  assert.equal(verification.registration.quantity_registered, 10);
  assert.equal(verification.registration.quantity_pending, 0);
});

test('bloquea evidencia histórica ambigua y permite registros únicamente reversados', () => {
  const item = {
    id: 8,
    difference_type: 'FALTANTE',
    product: { id: 5, cod: 'MP-05', name: 'Cobre' },
    registered_product: { id: 90, cod: 'MER-01', name: 'Mermas' },
    difference_expected: 10,
    difference_covered: 0,
    difference_pending: 10,
    difference_movements: [],
    evidence_confidence: 'AMBIGUA',
  };
  const ambiguous = buildHistoricalVerification({ transfer, item, note: null, inventory: null });
  assert.equal(ambiguous.status, 'EVIDENCIA_AMBIGUA');
  assert.equal(ambiguous.is_blocked, true);

  const reversedOnly = buildHistoricalVerification({
    transfer,
    item: { ...item, evidence_confidence: 'NO_ENCONTRADA' },
    note: null,
    inventory: null,
  });
  assert.equal(reversedOnly.status, 'SIN_REGISTRO_ACTIVO');
  assert.equal(reversedOnly.is_blocked, false);
  assert.equal(reversedOnly.registration.note_assigned_on_confirmation, true);
});
