'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setDecimalPlaces } = require('../helpers/decimals-value');
const {
  decimalAdd,
  decimalCompare,
  decimalDivide,
  decimalMultiply,
  decimalSubtract,
  decimalToNumber,
  decimalToString,
  excelNumberMask,
  formatDecimalEsBo,
} = require('../helpers/number-formatter');
const { reconcileTransferReceipt } = require('../helpers/transfer-reception');
const { Stock, kardexMovements } = require('../database/config');

test.after(() => setDecimalPlaces(2));

test('normaliza y serializa con precisión 0, 2 y 4 sin toFixed', () => {
  setDecimalPlaces(0);
  assert.equal(decimalToString('1234.5'), '1235');
  setDecimalPlaces(2);
  assert.equal(decimalToString('1.005'), '1.01');
  setDecimalPlaces(4);
  assert.equal(decimalToString('1.234,56785'), '1234.5679');
  assert.equal(decimalToNumber('1.234,5678'), 1234.5678);
});

test('la aritmética decimal comercial conserva la diferencia de cuatro decimales', () => {
  setDecimalPlaces(4);
  assert.equal(decimalAdd('10.1234', '0.0006'), 10.124);
  assert.equal(decimalSubtract('10.1234', '10.1230'), 0.0004);
  assert.equal(decimalMultiply('1.2345', '2'), 2.469);
  assert.equal(decimalDivide('1', '3'), 0.3333);
  assert.equal(decimalCompare('10.1234', '10.1230'), 1);
});

test('la recepción mantiene excedente y faltante de 0,0004 kg', () => {
  setDecimalPlaces(4);
  assert.deepEqual(reconcileTransferReceipt('10.0000', '10.0004'), {
    sent: 10, base: 10, excess: 0.0004, shortage: 0, received: 10.0004,
  });
  assert.deepEqual(reconcileTransferReceipt('10.0000', '9.9996'), {
    sent: 10, base: 9.9996, excess: 0, shortage: 0.0004, received: 9.9996,
  });
});

test('los formatos regional y Excel siguen la precisión activa', () => {
  setDecimalPlaces(4);
  assert.equal(formatDecimalEsBo(1234.5), '1.234,5000');
  assert.equal(excelNumberMask(), '#,##0.0000');
});

test('los setters de Stock y Kardex preservan cuatro decimales', () => {
  setDecimalPlaces(4);
  assert.equal(Stock.build({ stock: '10.1234' }).stock, 10.1234);
  assert.equal(kardexMovements.build({ quantity: '0.0004' }).quantity, 0.0004);
});
