'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateWholesaleProfile } = require('../services/provider-wholesale-profile');
const { Provider, ProviderMaterial, Product, sequelize } = require('../database/config');
const service = require('../services/provider.service');

const profile = {
  commercialized_materials: 'Fierro y aluminio', contact_frequency: 'BIWEEKLY',
  usual_service_mode: 'BOTH', logistics_condition: 'BY_VOLUME',
  negotiation_mode: 'PRIOR_QUOTATION', price_policy: 'PREFERRED_PRICE',
  habitual_price_adjustment: 'Según calidad',
  contacts: [{ full_name: 'Ana', position_area: 'Ventas', cellphone: '70000000', is_main_contact: true }],
  bankAccounts: [],
  materials: [
    { id_product: 10, frequency: 'WEEKLY', estimated_volume: 1500.125, service_mode: 'BOTH', status: true },
    { id_product: 20, frequency: 'MONTHLY', estimated_volume: null, service_mode: 'BOTH', status: true },
  ],
};

test('B y C exigen precio minorista o ajuste autorizado y condición logística', () => {
  for (const code of ['B', 'C']) {
    for (const price_policy of ['LIST_PRICE', 'AUTHORIZED_SPECIAL_PRICE']) {
      assert.doesNotThrow(() => validateWholesaleProfile({ price_policy, logistics_condition: 'TO_COORDINATE' }, code));
    }
    assert.throws(() => validateWholesaleProfile({ logistics_condition: 'BY_VOLUME' }, code), /nivel de precio/);
    assert.throws(() => validateWholesaleProfile({ price_policy: 'LIST_PRICE' }, code), /condición logística/);
    assert.throws(() => validateWholesaleProfile({ price_policy: 'PREFERRED_PRICE', logistics_condition: 'BY_VOLUME' }, code), /nivel de precio/);
  }
  assert.doesNotThrow(() => validateWholesaleProfile({}, 'A'));
});

test('acepta frecuencias y volúmenes independientes por material y contacto', () => {
  assert.doesNotThrow(() => validateWholesaleProfile(profile));
  assert.doesNotThrow(() => validateWholesaleProfile({ ...profile, materials: [{ ...profile.materials[0], estimated_volume: 0 }] }));
  assert.doesNotThrow(() => validateWholesaleProfile({}));
});

test('normaliza frecuencias de contacto antiguas y exige los datos de contacto según el tipo', () => {
  for (const code of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const data = { contact_frequency: 'MENSUAL', price_policy: 'LIST_PRICE', logistics_condition: 'BY_VOLUME', contacts: [{ full_name: 'Ana', is_main_contact: true }] };
    if (['A', 'B'].includes(code)) {
      assert.throws(() => validateWholesaleProfile(data, code), /datos de contacts/);
      Object.assign(data.contacts[0], { position_area: 'Ventas', cellphone: '70000000' });
    }
    assert.doesNotThrow(() => validateWholesaleProfile(data, code));
    assert.equal(data.contact_frequency, 'MONTHLY');
  }
  const empty = { contact_frequency: '' };
  validateWholesaleProfile(empty, 'D');
  assert.equal(empty.contact_frequency, null);
});

test('rechaza volúmenes inválidos, productos duplicados y opciones desconocidas', () => {
  for (const volume of [-1, 'abc', Infinity]) {
    assert.throws(() => validateWholesaleProfile({ materials: [{ id_product: 10, estimated_volume: volume }] }), { statusCode: 400 });
  }
  assert.throws(() => validateWholesaleProfile({ materials: [profile.materials[0], profile.materials[0]] }), /duplicados/);
  assert.throws(() => validateWholesaleProfile({ price_policy: 'INVALID' }), /price_policy/);
  assert.throws(() => validateWholesaleProfile({ contact_frequency: 'INVALID' }), /contacto/);
  assert.throws(() => validateWholesaleProfile({ contacts: [{ full_name: 'Ana' }] }), /principal/);
});

test('edición guarda condiciones comerciales y listas en la misma transacción', async t => {
  const transaction = {};
  let saved;
  let collections;
  t.mock.method(sequelize, 'transaction', async callback => callback(transaction));
  t.mock.method(service, 'requireProvider', async () => ({ id: 7, update: async (data, options) => {
    saved = data;
    assert.equal(options.transaction, transaction);
  } }));
  for (const name of ['syncMainBranch', 'syncMainContact', 'syncMainMaterial', 'syncMainBankAccount']) t.mock.method(service, name, async () => {});
  t.mock.method(service, 'syncDetails', async (provider, data, tx) => {
    assert.equal(provider.id, 7);
    assert.equal(tx, transaction);
    collections = data;
  });
  t.mock.method(service, 'getProviderDetails', async () => ({ ...saved, materials: collections.materials }));
  const result = await service.updateProfile(7, profile);
  assert.equal(result.price_policy, 'PREFERRED_PRICE');
  assert.equal(result.habitual_price_adjustment, 'Según calidad');
  assert.equal(result.contact_frequency, 'BIWEEKLY');
  assert.deepEqual(result.materials, profile.materials);
  assert.deepEqual(collections.contacts, profile.contacts);
  assert.deepEqual(collections.bankAccounts, []);
});

test('creación conserva el perfil mayorista y sincroniza sus listas', async t => {
  t.mock.method(sequelize, 'transaction', async callback => callback({}));
  let saved;
  t.mock.method(Provider, 'create', async data => { saved = data; return { id: 7 }; });
  for (const name of ['syncMainBranch', 'syncMainContact', 'syncMainMaterial', 'syncMainBankAccount']) t.mock.method(service, name, async () => {});
  const sync = t.mock.method(service, 'syncDetails', async () => {});
  t.mock.method(service, 'getProviderDetails', async () => saved);
  const result = await service.createProfile(profile);
  assert.equal(result.logistics_condition, 'BY_VOLUME');
  assert.equal(sync.mock.callCount(), 1);
});

test('sincronización actualiza productos existentes y desactiva los retirados', async t => {
  const updates = [];
  const existing = [
    { id: 1, id_product: 10, update: async data => updates.push({ id: 1, ...data }) },
    { id: 2, id_product: 30, update: async data => updates.push({ id: 2, ...data }) },
  ];
  const created = [];
  t.mock.method(ProviderMaterial, 'findAll', async () => existing);
  t.mock.method(ProviderMaterial, 'create', async data => { created.push(data); return { id: 3 }; });
  t.mock.method(Product, 'findByPk', async id => ({ id, id_category: 5 }));
  await service.syncDetails({ id: 7 }, { materials: structuredClone(profile.materials) }, {});
  assert.equal(updates[0].id_category, 5);
  assert.equal(updates[0].estimated_volume, 1500.125);
  assert.equal(updates[0].frequency, 'WEEKLY');
  assert.deepEqual(updates[1], { id: 2, status: false });
  assert.equal(created[0].id_provider, 7);
  assert.equal(created[0].frequency, 'MONTHLY');
  assert.equal(created[0].estimated_volume, null);
});
