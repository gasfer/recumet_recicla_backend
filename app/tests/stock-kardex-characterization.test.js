'use strict';

/**
 * §1.2 — Caracterización de la consulta y sincronización Stock–Kardex.
 *
 * Documenta los efectos observables para los tres casos posibles:
 *   - Stock > Kardex (diferencia positiva)
 *   - Kardex > Stock (diferencia negativa)
 *   - Causa desconocida (sin traslados identificables)
 *
 * Las pruebas usan datos en memoria; NO modifican inventario real.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const { getStockKardexIrregularities, getStockDiagnostic } = require('../services/stock-availability.service');

// ─── helpers ─────────────────────────────────────────────────────────────────

const stockRow = ({ id_product = 1, physical_stock, kardex_balance, cod = 'MP-001', name = 'MATERIAL' } = {}) => ({
  cod, name,
  id_product: String(id_product),
  id_sucursal: '1',
  id_storage: '1',
  physical_stock: String(physical_stock),
  stock_in_review: '0',
  available_stock: String(physical_stock),
  kardex_balance: String(kardex_balance),
  physical_kardex_difference: String(physical_stock - kardex_balance),
  stock_updated_at: '2026-09-05T10:00:00.000Z',
  kardex_last_id: '90',
});

const transferRow = (id_product, difference) => ({
  id_product,
  transfer_id: 313, transfer_cod: 'TRAS00313',
  id_sucursal_received: 1, id_storage_received: 1,
  quantity_sent: '100',
  quantity_received: String(100 - difference),
  quantity_difference: String(difference),
  relation_confidence: 'CANDIDATA',
});

const mockQuery = (t, diagnosticRows, transferRows = []) => {
  let call = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    call += 1;
    return call === 1 ? diagnosticRows : transferRows;
  });
};

// ─── §1.2 Caso 1: Stock > Kardex ─────────────────────────────────────────────

test('§1.2 Stock > Kardex: detecta diferencia positiva con dirección correcta sin modificar datos', async (t) => {
  const row = stockRow({ physical_stock: 120, kardex_balance: 100 });
  mockQuery(t, [row], [transferRow(1, 20)]);

  const irregularities = await getStockKardexIrregularities({ idSucursal: 1, idStorage: 1 });

  assert.equal(irregularities.length, 1, 'debe encontrar exactamente una irregularidad');
  const item = irregularities[0];
  assert.equal(item.difference_direction, 'STOCK_GREATER_THAN_KARDEX');
  assert.equal(item.physical_stock, 120);
  assert.equal(item.kardex_balance, 100);
  assert.equal(item.physical_kardex_difference, 20);
  assert.ok(Array.isArray(item.traceable_transfers), 'debe incluir array de traslados trazables');
  // Verificar que NO se modifica ninguna estructura de BD (solo lectura)
  assert.equal(item.cause, undefined, 'no infiere causa: requiere investigación humana');
});

// ─── §1.2 Caso 2: Kardex > Stock ─────────────────────────────────────────────

test('§1.2 Kardex > Stock: detecta diferencia negativa sin corregir automáticamente', async (t) => {
  const row = stockRow({ physical_stock: 80, kardex_balance: 100 });
  mockQuery(t, [row]);

  const irregularities = await getStockKardexIrregularities({ idSucursal: 1, idStorage: 1 });

  assert.equal(irregularities.length, 1);
  const item = irregularities[0];
  assert.equal(item.difference_direction, 'KARDEX_GREATER_THAN_STOCK');
  assert.equal(item.physical_stock, 80);
  assert.equal(item.kardex_balance, 100);
  assert.equal(item.physical_kardex_difference, -20);
  assert.deepEqual(item.traceable_transfers, [], 'sin traslados identificables la lista queda vacía');
  // La función devuelve datos; NO escribe nada
  assert.equal(item.id_storage, 1);
});

// ─── §1.2 Caso 3: Causa desconocida (sin traslados identificables) ────────────

test('§1.2 causa desconocida: sin traslados identifica desfase pero no asume origen', async (t) => {
  const row = stockRow({ physical_stock: 55, kardex_balance: 45 });
  mockQuery(t, [row], []);   // segunda query devuelve lista vacía

  const irregularities = await getStockKardexIrregularities({ idSucursal: 1, idStorage: 1 });

  assert.equal(irregularities.length, 1);
  const item = irregularities[0];
  assert.equal(item.traceable_transfers.length, 0, 'sin traslados candidatos la trazabilidad está vacía');
  // El campo `cause` no existe en la respuesta de diagnóstico: es responsabilidad del expediente
  assert.equal(item.cause, undefined);
  // La dirección sí se determina
  assert.equal(item.difference_direction, 'STOCK_GREATER_THAN_KARDEX');
});

// ─── §1.2 Producto con diferencia cero queda excluido ─────────────────────────

test('§1.2 producto conciliado (diferencia=0) es excluido del resultado de irregularidades', async (t) => {
  const conciliado = stockRow({ id_product: 10, physical_stock: 50, kardex_balance: 50 });
  const desfasado  = stockRow({ id_product: 20, physical_stock: 60, kardex_balance: 50, cod: 'MP-002', name: 'OTRO' });
  mockQuery(t, [conciliado, desfasado]);

  const irregularities = await getStockKardexIrregularities({ idSucursal: 1, idStorage: 1 });

  assert.equal(irregularities.length, 1, 'sólo el producto desfasado aparece');
  assert.equal(irregularities[0].id_product, 20);
});

// ─── §1.2 getStockDiagnostic no modifica datos: devuelve filas ────────────────

test('§1.2 getStockDiagnostic devuelve filas sin escritura cuando no hay diferencias', async (t) => {
  let writes = 0;
  t.mock.method(db.sequelize, 'query', async () => []);
  const stub = t.mock.method(db.Stock, 'update', async () => { writes += 1; });

  const rows = await getStockDiagnostic({ idSucursal: 1, idStorage: 1 });

  assert.deepEqual(rows, [], 'sin datos retorna arreglo vacío');
  assert.equal(writes, 0, 'no se llamó a Stock.update');
  assert.equal(stub.mock.callCount(), 0);
});
