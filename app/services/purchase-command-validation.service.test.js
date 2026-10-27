'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePurchaseCommand } = require('./purchase-command-validation.service');
const { validatePurchaseCommandRequest } = require('../middlewares/validate-purchase-command');

const command = (overrides = {}) => {
  const { inputData = {}, inputDetails = [{ quantity: '2.00', cost: '12.50', total: '25.00' }], decimalPlaces = 2 } = overrides;
  return {
  inputData: {
    type_registry: 'BOLETA',
    pay_to_credit: true,
    type_payment: 'EFECTIVO',
    is_paid: false,
    referral_sources: 'GOOGLE',
    old_customer: false,
    with_pickup: false,
    sumas: '25.00', discount: '0.00', total: '25.00', on_account: '5.00',
    ...inputData,
  },
  inputDetails,
  decimalPlaces,
  };
};

test('accepts valid cash and credit purchase commands with configured decimals', () => {
  assert.deepEqual(validatePurchaseCommand(command()), []);
  assert.deepEqual(validatePurchaseCommand(command({ inputData: { pay_to_credit: false, on_account: '0' } })), []);
});

test('permite origen vacío cuando la compra pertenece a cliente antiguo', () => {
  assert.deepEqual(validatePurchaseCommand(command({ inputData: { old_customer: true, referral_sources: '' } })), []);
  assert.ok(validatePurchaseCommand(command({ inputData: { old_customer: false, referral_sources: '' } }))
    .some(error => error.path === 'input_data.referral_sources'));
});

test('permite conservar origen vacío en una edición de compra histórica', () => {
  assert.deepEqual(validatePurchaseCommand({
    ...command({ inputData: { old_customer: false, referral_sources: '' } }),
    allowMissingReferralSource: true,
  }), []);
});

test('middleware conserva origen vacío en PUT, pero lo exige al crear compras', () => {
  const values = command({ inputData: { old_customer: false, referral_sources: '' } });
  const makeRequest = method => ({
    method,
    body: { input_data: values.inputData, input_details: values.inputDetails },
    decimalPolicy: { places: values.decimalPlaces },
  });
  let continued = false;
  validatePurchaseCommandRequest(makeRequest('PUT'), { status() { throw Error('PUT no debe rechazarse'); } }, () => { continued = true; });
  assert.equal(continued, true);

  let status;
  let body;
  validatePurchaseCommandRequest(makeRequest('POST'), {
    status(code) { status = code; return this; },
    json(value) { body = value; return this; },
  }, () => { throw Error('POST debe exigir el origen'); });
  assert.equal(status, 422);
  assert.ok(body.errors.some(error => error.path === 'input_data.referral_sources'));
});

test('accepts every purchase registry, payment method, and initial credit amount option', () => {
  for (const type_registry of ['SIN FICHA', 'FICHA', 'BOLETA']) {
    for (const type_payment of ['EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'QR']) {
      const paymentDetails = type_payment === 'EFECTIVO' ? {} : {
        id_bank: 1,
        account_input: type_payment === 'CHEQUE' ? 'CH-001' : 'CTA-001',
        ...(type_payment === 'TRANSFERENCIA' || type_payment === 'QR' ? { number_transaction: 'TX-001' } : {}),
      };
      assert.deepEqual(validatePurchaseCommand(command({ inputData: {
        type_registry, type_payment, registry_number: type_registry === 'SIN FICHA' ? undefined : 'R-001', ...paymentDetails,
      } })), [], `${type_registry} / ${type_payment}`);
    }
  }
  for (const on_account of ['0.00', '12.50', '25.00']) {
    assert.deepEqual(validatePurchaseCommand(command({ inputData: { on_account } })), [], `abono inicial ${on_account}`);
  }
  for (const is_paid of [false, true]) {
    assert.deepEqual(validatePurchaseCommand(command({ inputData: { is_paid } })), [], `factura ${is_paid}`);
  }
  assert.ok(validatePurchaseCommand(command({ inputData: { pay_to_credit: false, on_account: '0.01' } }))
    .some(error => error.path === 'input_data.on_account'));
});

test('rejects unsupported options and missing non-cash payment references', () => {
  const errors = validatePurchaseCommand(command({ inputData: { type_payment: 'QR' } }));
  assert.ok(errors.some((error) => error.path === 'input_data.id_bank'));
  assert.ok(errors.some((error) => error.path === 'input_data.account_input'));
  assert.ok(errors.some((error) => error.path === 'input_data.number_transaction'));
  assert.ok(validatePurchaseCommand(command({ inputData: { type_registry: 'TICKET' } })).some((error) => error.path === 'input_data.type_registry'));
});

test('rejects invalid amounts, inconsistent subtotals, and advances greater than the total', () => {
  const errors = validatePurchaseCommand(command({
    inputData: { sumas: '24.99', total: '26.00', discount: '-0.50', on_account: '26.01' },
  }));
  assert.ok(errors.some((error) => error.path === 'input_data.sumas'));
  assert.ok(errors.some((error) => error.path === 'input_data.total'));
  assert.ok(errors.some((error) => error.path === 'input_data.discount'));
  assert.ok(errors.some((error) => error.path === 'input_data.on_account'));
});

test('rejects detail totals not equal to quantity times cost', () => {
  const errors = validatePurchaseCommand(command({ inputDetails: [{ quantity: '2.00', cost: '12.50', total: '24.00' }] }));
  assert.ok(errors.some((error) => error.path === 'input_details.0.total'));
});
