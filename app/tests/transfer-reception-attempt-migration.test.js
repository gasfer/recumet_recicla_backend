'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../database/migrations/20261116000200-add-transfer-reception-attempt-key');

test('agrega clave por intento y marca las recepciones anteriores sin tocar Stock ni Kardex', async () => {
  let addedColumn;
  const statements = [];
  await migration.up({
    describeTable: async () => ({}),
    addColumn: async (...args) => { addedColumn = args; },
    sequelize: { query: async (sql) => statements.push(sql) },
  }, { STRING: (length) => `STRING(${length})` });

  assert.equal(addedColumn[1], 'reception_attempt_key');
  assert.match(statements[0], /UPDATE transfers[\s\S]*status = 'RECEIVED'/i);
  assert.doesNotMatch(statements.join('\n'), /\b(?:UPDATE|DELETE)\s+(?:stocks|kardex_movements)\b/i);
});
