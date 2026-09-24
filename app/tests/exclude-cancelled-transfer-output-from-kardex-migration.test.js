'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../database/migrations/20260923000000-exclude-cancelled-transfer-output-from-kardex');

test('excluye ANULADO solo de la salida de traslados de Kardex', () => {
  const definition = `
    WHERE tr.status::text = 'RECEIVED'::text
    UNION ALL
    WHERE tr.status::text = ANY (ARRAY['PENDING'::character varying::text, 'RECEIVED'::character varying::text, 'ANULADO'::character varying::text])
  `;

  const result = migration.excludeCancelledTransferOutputs(definition);

  assert.match(result, /status::text = 'RECEIVED'::text/);
  assert.match(result, /ANY \(ARRAY\[[^\]]*'PENDING'/);
  assert.match(result, /ANY \(ARRAY\[[^\]]*'RECEIVED'/);
  assert.doesNotMatch(result, /ANY \(ARRAY\[[^\]]*'ANULADO'/);
});
