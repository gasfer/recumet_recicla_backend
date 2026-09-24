'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const migration = require('../database/migrations/20260915000000-keep-cancelled-transfer-output-in-kardex');
test('conserva la salida derivada al anular el traslado', () => {
  const sql = "SELECT 1 FROM transfers tr WHERE tr.status IN ('PENDING', 'RECEIVED')";
  assert.match(migration.includeCancelledTransfers(sql), /'ANULADO'/);
});

test('reconoce la forma normalizada por PostgreSQL sin habilitar una entrada de recepción anulada', () => {
  const sql = `WHERE tr.status::text = 'RECEIVED'::text
    UNION ALL
    WHERE tr.status::text = ANY (ARRAY['PENDING'::character varying::text, 'RECEIVED'::character varying::text])`;
  const result = migration.includeCancelledTransfers(sql);
  assert.match(result, /ANY \(ARRAY\[[^\]]*'ANULADO'/);
  assert.match(result, /status::text = 'RECEIVED'::text/);
  assert.doesNotMatch(result, /status::text IN \('RECEIVED', 'ANULADO'\)/);
});
