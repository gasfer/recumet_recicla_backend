'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRegistrationFields: validate } = require('../services/provider-registration-validation');
const toUpperCase = require('../helpers/to-upper-case');

test('la conversión de nombres conserva la modalidad de frecuencia del proveedor y sus productos', () => {
  const payload = toUpperCase({ full_names: 'Proveedor', frequency_mode: 'automatic', materials: [{ id_product: 1, frequency_mode: 'manual' }] });
  assert.equal(payload.full_names, 'PROVEEDOR');
  assert.equal(payload.frequency_mode, 'automatic');
  assert.equal(payload.materials[0].frequency_mode, 'manual');
  assert.doesNotThrow(() => validate(payload));
});

test('crear y editar comparten límites, estados, celulares y coordenadas', () => {
  assert.doesNotThrow(() => validate({ full_names: 'PROVEEDOR', commercial_name: 'ACOPIADORA', latitude: 0, longitude: 0, status: false, cellphone: '70000000' }));
  for (const data of [
    { full_names: ' ' }, { commercial_name: 'x'.repeat(175) }, { general_observations: 'x'.repeat(2001) },
    { status: 'ACTIVO' }, { cellphone: '123' }, { latitude: 91, longitude: 0 },
    { latitude: 0 }, { latitude: 'abc', longitude: 0 }, { frequency_mode: 'OTHER' },
  ]) assert.throws(() => validate(data), { statusCode: 400 });
});
