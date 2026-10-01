'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const readModel = (name) => fs.readFileSync(path.join(__dirname, '..', 'models', name), 'utf8');
const readService = (name) => fs.readFileSync(path.join(__dirname, '..', 'services', name), 'utf8');

test('compras y cuentas por pagar conservan providers.id como clave operativa', () => {
  const provider = readModel('provider.js');
  const input = readModel('input.js');
  const accountsPayable = readModel('accountsPayable.js');

  assert.match(provider, /hasMany\(models\.Input,\{as: 'input', foreignKey:'id_provider'\}\)/);
  assert.match(provider, /hasMany\(models\.AccountsPayable,\{as: 'accounts_payable', foreignKey:'id_provider'\}\)/);
  assert.match(input, /belongsTo\(models\.Provider,\{as: 'provider', foreignKey:'id_provider'\}\)/);
  assert.match(accountsPayable, /belongsTo\(models\.Provider,\{as: 'provider', foreignKey:'id_provider'\}\)/);
});

test('las consultas comerciales cuentan movimientos por la sede operativa seleccionada', () => {
  const companyService = readService('provider-company.service.js');

  assert.match(companyService, /Input\.count\(\{ where: \{ id_provider: provider\.id \} \}\)/);
  assert.match(companyService, /AccountsPayable\.count\(\{ where: \{ id_provider: provider\.id,/);
});
