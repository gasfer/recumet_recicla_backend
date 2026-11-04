'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../database/migrations/20261104120000-create-provider-sucursal-availability');

function queryInterfaceWith(invalidAssignments = []) {
  const calls = [];
  return {
    calls,
    sequelize: {
      query: async sql => {
        calls.push({ method: 'query', sql });
        return sql.includes('SELECT COALESCE(jsonb_agg')
          ? [[{ invalid_assignments: invalidAssignments }], {}]
          : [[], {}];
      },
    },
    createTable: async (...args) => calls.push({ method: 'createTable', args }),
    addConstraint: async (...args) => calls.push({ method: 'addConstraint', args }),
    addIndex: async (...args) => calls.push({ method: 'addIndex', args }),
    dropTable: async (...args) => calls.push({ method: 'dropTable', args }),
  };
}

test('provider availability migration creates referential and unique branch associations', async () => {
  const qi = queryInterfaceWith();
  await migration.up(qi, {
    INTEGER: 'INTEGER', BOOLEAN: 'BOOLEAN', DATE: 'DATE',
  });

  const table = qi.calls.find(call => call.method === 'createTable');
  const preflight = qi.calls.find(call => call.method === 'query' && call.sql.includes('SELECT COALESCE(jsonb_agg'));
  assert.match(preflight.sql, /ELSE NULL\s+END\s*\) ORDER BY id_provider/);
  assert.equal(table.args[0], 'provider_sucursal_availability');
  assert.deepEqual(table.args[1].id_provider.references, { model: 'providers', key: 'id' });
  assert.deepEqual(table.args[1].id_sucursal.references, { model: 'sucursals', key: 'id' });
  assert.ok(qi.calls.some(call => call.method === 'addConstraint' && call.args[1].type === 'unique'));
  assert.ok(qi.calls.some(call => call.method === 'addIndex' && call.args[1].includes('status')));
  const backfill = qi.calls.find(call => call.method === 'query' && call.sql.includes('INSERT INTO provider_sucursal_availability'));
  assert.match(backfill.sql, /enabled_sucursal_ids IS NULL/);
  assert.match(backfill.sql, /UNION/);
  assert.match(backfill.sql, /JOIN inputs i ON i\.id_provider = p\.id/);
  assert.match(backfill.sql, /i\.status = 'ACTIVE'/);
  assert.match(backfill.sql, /i\.voided_at IS NULL/);
  assert.match(backfill.sql, /SELECT DISTINCT/);
  assert.match(backfill.sql, /ON CONFLICT/);
});

test('provider availability migration refuses unresolved explicit legacy branch IDs before schema changes', async () => {
  const qi = queryInterfaceWith([{ provider_id: 71, branch_id: '999', reason: 'invalid_availability_branch' }]);
  await assert.rejects(() => migration.up(qi, {}), /unresolved legacy data/);
  assert.equal(qi.calls.some(call => call.method === 'createTable'), false);
});

test('rollback rebuilds the legacy list from active associations before dropping the relation', async () => {
  const qi = queryInterfaceWith();
  await migration.down(qi);
  const update = qi.calls.find(call => call.method === 'query');
  assert.match(update.sql, /a\.status = TRUE/);
  assert.match(update.sql, /jsonb_agg/);
  assert.ok(qi.calls.some(call => call.method === 'dropTable' && call.args[0] === 'provider_sucursal_availability'));
});

