'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateClassifiedCommand } = require('./classified-command-validation.service');

const validCommand = () => ({
  classifiedData: {
    id_product: 1, quantity_product: 0.3, cost_product: 4.5,
    date_classified: '2026-11-14T12:00:00.000Z', type_registry: 'BOLETA',
    number_registry: 'B-104', status: 'ACTIVE',
  },
  classifiedDetails: [
    { id_product: 2, quantity: 0.1, cost: 1, status: 'ACTIVE' },
    { id_product: 3, quantity: 0.2, cost: 2, status: 'ACTIVE' },
  ],
});

test('acepta una clasificación con documento, cantidades iguales y productos activos', () => {
  assert.deepEqual(validateClassifiedCommand(validCommand()), []);
});

test('rechaza origen y detalle con cantidades distintas, cantidades no positivas y costos negativos', () => {
  const command = validCommand();
  command.classifiedDetails[0].quantity = 0;
  command.classifiedDetails[1].cost = -1;
  const errors = validateClassifiedCommand(command);
  assert.ok(errors.some(error => error.path === 'classified_details.0.quantity'));
  assert.ok(errors.some(error => error.path === 'classified_details.1.cost'));
  assert.ok(errors.some(error => error.path === 'classified_details'));
});

test('rechaza documento faltante, estado no activo, origen repetido y productos duplicados', () => {
  const command = validCommand();
  command.classifiedData.type_registry = 'FICHA';
  command.classifiedData.number_registry = '';
  command.classifiedData.status = 'INACTIVE';
  command.classifiedDetails[0].id_product = 1;
  command.classifiedDetails[1].id_product = 2;
  command.classifiedDetails.push({ id_product: 2, quantity: 0, cost: 1, status: 'ACTIVE' });
  const errors = validateClassifiedCommand(command);
  assert.ok(errors.some(error => error.path === 'classified_data.number_registry'));
  assert.ok(errors.some(error => error.path === 'classified_data.status'));
  assert.ok(errors.some(error => error.path === 'classified_details.0.id_product'));
  assert.ok(errors.some(error => error.path === 'classified_details.2.id_product'));
});

test('permite generar automáticamente el número en SIN FICHA y rechaza fecha o tipo inválidos', () => {
  const command = validCommand();
  command.classifiedData.type_registry = 'SIN FICHA';
  command.classifiedData.number_registry = '';
  assert.deepEqual(validateClassifiedCommand(command), []);
  command.classifiedData.type_registry = 'OTRO';
  command.classifiedData.date_classified = 'fecha inválida';
  const errors = validateClassifiedCommand(command);
  assert.ok(errors.some(error => error.path === 'classified_data.type_registry'));
  assert.ok(errors.some(error => error.path === 'classified_data.date_classified'));
});
