'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  replaceTransferReceiptBranch,
  revertTransferReceiptBranch,
} = require('../database/migrations/20260908210100-exclude-pending-transfer-receipts-from-kardex');

test('Kardex conserva históricos y excluye sólo recepciones pendientes (SQL crudo)', () => {
  const definition = "SELECT 1 WHERE tr.status = 'RECEIVED' UNION ALL SELECT 2";
  const updated = replaceTransferReceiptBranch(definition);
  assert.match(updated, /COALESCE\(dt\.accounting_status, 'CONTABILIZADO'\)/);
  assert.match(updated, /<> 'PENDIENTE_CONCILIACION'/);
});

test('Kardex maneja formato decompilado de PostgreSQL con casts de texto', () => {
  const definition = "SELECT 1 WHERE tr.status::text = 'RECEIVED'::text UNION ALL SELECT 2";
  const updated = replaceTransferReceiptBranch(definition);
  assert.match(updated, /tr\.status::text = 'RECEIVED'::text AND COALESCE\(dt\.accounting_status, 'CONTABILIZADO'\)/);
  assert.match(updated, /<> 'PENDIENTE_CONCILIACION'/);

  const reverted = revertTransferReceiptBranch(updated);
  assert.equal(reverted.includes('PENDIENTE_CONCILIACION'), false);
  assert.match(reverted, /tr\.status::text = 'RECEIVED'::text/);
});
