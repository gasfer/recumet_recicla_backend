const test = require('node:test');
const assert = require('node:assert/strict');
const { KARDEX_HISTORY_ATTRIBUTES, classifyKardexEvent, attachKardexEventMetadata } = require('../services/kardex-event.service');

test('el contrato histórico expone identidad, trazabilidad y saldos del producto', () => {
  for (const field of ['id_product', 'type', 'date', 'type_movement', 'registry_number', 'detail', 'sub_detail', 'quantity_input', 'quantity_output', 'saldo']) {
    assert.ok(KARDEX_HISTORY_ATTRIBUTES.includes(field), `Falta ${field} en el contrato.`);
  }
});

test('clasifica todos los orígenes conocidos y conserva una opción de respaldo', () => {
  assert.equal(classifyKardexEvent({ type: 'INPUT', type_movement: 'INPUT' }).event_type, 'PURCHASE');
  assert.equal(classifyKardexEvent({ type: 'OUTPUT', type_movement: 'OUTPUT' }).event_type, 'SALE');
  assert.equal(classifyKardexEvent({ type: 'INPUT', type_movement: 'TRANSFER' }).event_type, 'TRANSFER_RECEIVED');
  assert.equal(classifyKardexEvent({ type: 'OUTPUT', type_movement: 'TRANSFER' }).event_type, 'TRANSFER_SENT');
  assert.equal(classifyKardexEvent({ type: 'INPUT', type_movement: 'CLASIFIED' }).event_type, 'CLASSIFICATION');
  assert.equal(classifyKardexEvent({ type: 'INPUT', type_movement: 'UNKNOWN' }).event_type, 'OTHER');
});

test('distingue ajustes, conciliaciones y reversiones de movimientos manuales', () => {
  assert.equal(classifyKardexEvent({ type: 'INPUT', type_movement: 'KMOVEMENT', detail: 'AJUSTE KARDEX FÍSICO-PRODUCCIÓN' }).event_type, 'PHYSICAL_ADJUSTMENT');
  assert.equal(classifyKardexEvent({ type: 'INPUT', type_movement: 'KMOVEMENT', detail: 'EXCEDENTE CONCILIACIÓN' }).event_type, 'RECONCILIATION');
  const reversal = classifyKardexEvent({ type: 'OUTPUT', type_movement: 'KMOVEMENT', detail: 'REVERSIÓN TRASLADO' });
  assert.equal(reversal.event_type, 'REVERSAL');
  assert.equal(reversal.is_reversal, true);
});

test('adjunta metadatos tanto a objetos planos como a instancias Sequelize', () => {
  const plain = attachKardexEventMetadata({ type: 'OUTPUT', type_movement: 'OUTPUT' });
  assert.equal(plain.event_label, 'VENTA / SALIDA');

  const sequelizeRow = { dataValues: { type: 'INPUT', type_movement: 'TRANSFER' } };
  attachKardexEventMetadata(sequelizeRow);
  assert.equal(sequelizeRow.dataValues.event_label, 'TRASLADO RECIBIDO');
});
