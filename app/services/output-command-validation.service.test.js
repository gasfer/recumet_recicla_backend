'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateOutputCommand } = require('./output-command-validation.service');

const validCommand = () => ({
  outputData: {
    voucher: 'MENOR', type_registry: 'BOLETA', number_registry: 'B-100',
    type_payment: 'EFECTIVO', pay_to_credit: false, on_account: 0, status: 'ACTIVE',
    sub_total: 20, discount: 1, total: 19,
  },
  outputDetails: [{ id_product: 1, quantity: 2, cost: 5, price: 10, total: 20, status: 'ACTIVE' }],
  outputBig: {},
});

test('acepta una venta coherente con productos, subtotal, descuento y total', () => {
  assert.deepEqual(validateOutputCommand(validCommand()), []);
});

test('explica la inconsistencia de importes y la falta de cliente en una venta a crédito', () => {
  const command = validCommand();
  command.outputData.pay_to_credit = true;
  command.outputData.total = 25;
  command.outputData.discount = 30;
  command.outputDetails[0].total = 18;

  const errors = validateOutputCommand(command);
  assert.ok(errors.some(({ path, msg }) => path === 'output_data.id_client' && /cliente/.test(msg)));
  assert.ok(errors.some(({ path, msg }) => path === 'output_details.0.total' && /cantidad × precio/.test(msg)));
  assert.ok(errors.some(({ path, msg }) => path === 'output_data.discount' && /superar el subtotal/.test(msg)));
});

test('exige datos de transporte para la venta mayorista y limita el abono al total', () => {
  const command = validCommand();
  command.outputData.voucher = 'MAYOR. NACIONAL';
  command.outputData.on_account = 20;

  const errors = validateOutputCommand(command);
  assert.ok(errors.some(({ path }) => path === 'output_big.id_chauffeur'));
  assert.ok(errors.some(({ path }) => path === 'output_big.id_cargo_truck'));
  assert.ok(errors.some(({ path }) => path === 'output_data.on_account'));
});
