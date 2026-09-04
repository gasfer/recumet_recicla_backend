'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTransferVoucherReconciliation } = require('../helpers/transfer-voucher-reconciliation');

test('construye excedentes y faltantes con producto destino y precisión decimal', () => {
  const excessProduct = { cod: 'AL-01', name: 'ALUMINIO' };
  const shortageProduct = { cod: 'CO-01', name: 'COBRE' };
  const shortageDestination = { cod: 'ME-01', name: 'MERMA COBRE' };
  const notes = [
    {
      type: 'EXCEDENTE_PARA_REVISION', reconciliation_status: 'COMPLETADO',
      assignedUser: { full_names: 'OPERADOR UNO' },
      details: [{ product: excessProduct, quantity_sent: '10.125', quantity_received: '10.375',
        quantity_difference: '0.25', quantity_resolved: '0.25', resolutionActions: [] }],
    },
    {
      type: 'FALTANTE_PARA_REVISION', reconciliation_status: 'COMPLETADO',
      registeredProduct: shortageDestination,
      details: [{ product: shortageProduct, quantity_sent: '8.75', quantity_received: '8.625',
        quantity_difference: '0.125', quantity_resolved: '0.125', resolutionActions: [
          { movementLinks: [{ id_kardex_movement: 94 }] },
        ] }],
    },
  ];

  const result = buildTransferVoucherReconciliation(notes);

  assert.deepEqual(result.totals, { excess: 0.25, shortage: 0.125 });
  assert.deepEqual(result.rows.map(({ type, sent, received, difference, destinationProduct }) => ({
    type, sent, received, difference, destinationProduct,
  })), [
    { type: 'EXCEDENTE', sent: 10.125, received: 10.375, difference: 0.25, destinationProduct: 'AL-01 - ALUMINIO' },
    { type: 'FALTANTE', sent: 8.75, received: 8.625, difference: 0.125, destinationProduct: 'ME-01 - MERMA COBRE' },
  ]);
  assert.equal(result.rows[1].movementReferences, '#94');
});

test('sin notas no fabrica movimientos ni filas de conciliación', () => {
  assert.deepEqual(buildTransferVoucherReconciliation([]), {
    rows: [], totals: { excess: 0, shortage: 0 },
  });
});
