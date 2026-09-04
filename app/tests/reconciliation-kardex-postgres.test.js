'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { explicitKardexFunctionSql, useExplicitReconciliationMovements,
  removeExplicitReconciliationMovements } = require('../helpers/reconciliation-kardex-view');

test('Kardex PostgreSQL cuenta devolución y clasificación una vez sin alterar operaciones normales', {
  skip: process.env.RUN_KARDEX_POSTGRES_TEST !== '1',
}, async () => {
  const { sequelize } = require('../database/config');
  const transaction = await sequelize.transaction();
  const query = (sql, replacements = {}) => sequelize.query(sql, { transaction, replacements, logging: false });
  try {
    await query("SET LOCAL statement_timeout = '15s'");
    const [views] = await query("SELECT pg_get_viewdef('view_kardex_detalle'::regclass, true) AS definition");
    const originalDefinition = views[0].definition;
    // Temporary copies have no constraints, triggers or defaults, so fixtures
    // cannot affect real rows, sequences, inventory or notifications.
    for (const table of ['details_inputs', 'inputs', 'providers', 'details_transfers', 'transfers',
      'sucursals', 'details_classifieds', 'classifieds', 'products', 'details_outputs', 'outputs',
      'clients', 'kardex_movements', 'transfer_review_resolution_actions', 'transfer_review_action_movements']) {
      await query(`CREATE TEMP TABLE ${table} ON COMMIT DROP AS SELECT * FROM ${table} WITH NO DATA`);
    }
    await query("INSERT INTO pg_temp.products (id,name) VALUES (1,'Origen'),(2,'Destino')");
    await query("INSERT INTO pg_temp.sucursals (id,name) VALUES (1,'Sucursal A'),(2,'Sucursal B')");
    await query(`INSERT INTO pg_temp.transfers
      (id,cod,registry_number,status,date_send,date_received,id_sucursal_send,id_storage_send,id_sucursal_received,id_storage_received)
      VALUES (10,'TEST-T','TEST-T','PENDING','2026-08-01','2026-08-02',1,1,2,2)`);
    await query('INSERT INTO pg_temp.details_transfers (id,id_transfer,id_product,quantity,quantity_received,cost) VALUES (11,10,1,8,8,3)');
    await query(`INSERT INTO pg_temp.classifieds
      (id,cod,number_registry,status,date_classified,id_product,quantity_product,cost_product,id_sucursal,id_storage)
      VALUES (20,'TEST-C','TEST-C','ACTIVE','2026-08-01',1,6,3,1,1)`);
    await query('INSERT INTO pg_temp.details_classifieds (id,id_classified,id_product,quantity,cost) VALUES (21,20,2,6,3)');
    await query(explicitKardexFunctionSql('pg_temp.reconciliation_has_explicit_kardex'));
    const changed = useExplicitReconciliationMovements(originalDefinition, 'pg_temp.reconciliation_has_explicit_kardex');
    await query(`CREATE TEMP VIEW reconciliation_kardex_test AS ${changed}`);
    const totals = async () => {
      const [rows] = await query(`SELECT id_product, id_sucursal, SUM(quantity_input-quantity_output)::float AS balance,
        COUNT(*)::integer AS rows FROM pg_temp.reconciliation_kardex_test GROUP BY id_product,id_sucursal ORDER BY id_product,id_sucursal`);
      return rows;
    };
    const ordinary = await totals();
    assert.deepEqual(ordinary, [
      { id_product: 1, id_sucursal: 1, balance: -14, rows: 2 },
      { id_product: 2, id_sucursal: 1, balance: 6, rows: 1 },
    ]);

    await query(`INSERT INTO pg_temp.transfer_review_resolution_actions
      (id,operation_mode,operation_type,operation_id,operation_status)
      VALUES (30,'CREATED_AUTOMATICALLY','TRANSFER',10,'ACTIVE'),
        (31,'CREATED_AUTOMATICALLY','CLASSIFIED',20,'ACTIVE'),
        (32,'CREATED_AUTOMATICALLY','CONFIRMATION',NULL,'ACTIVE')`);
    // A document without linked explicit movements must retain its normal legs.
    assert.deepEqual(await totals(), ordinary);
    await query(`INSERT INTO pg_temp.kardex_movements
      (id,id_product,id_sucursal,id_storage,type,quantity,cost,date,status,details,registry_number)
      VALUES (40,1,1,1,'OUTPUT',8,3,'2026-08-01',true,'TEST transfer','TEST-T'),
        (41,1,1,1,'OUTPUT',6,3,'2026-08-01',true,'TEST classification output','TEST-C'),
        (42,2,1,1,'INPUT',6,3,'2026-08-01',true,'TEST classification input','TEST-C')`);
    await query(`INSERT INTO pg_temp.transfer_review_action_movements
      (id,id_transfer_review_resolution_action,id_kardex_movement,movement_role)
      VALUES (50,30,40,'ORIGINAL'),(51,31,41,'ORIGINAL'),(52,31,42,'ORIGINAL')`);
    assert.deepEqual(await totals(), ordinary, 'Automatic documents must not double stock movements');
    await query('UPDATE pg_temp.kardex_movements SET status=false');
    assert.deepEqual(await totals(), ordinary, 'Inactive explicit movements do not hide the ordinary document');
    await query('UPDATE pg_temp.kardex_movements SET status=true');

    await query("UPDATE pg_temp.transfers SET status='RECEIVED' WHERE id=10");
    assert.deepEqual(await totals(), [ordinary[0],
      { id_product: 1, id_sucursal: 2, balance: 8, rows: 1 }, ordinary[1]],
    'Actual transfer receipt remains visible');
    await query("UPDATE pg_temp.transfers SET status='PENDING' WHERE id=10");
    await query("UPDATE pg_temp.transfer_review_resolution_actions SET operation_mode='VERIFIED_EXISTING' WHERE id IN (30,31)");
    assert.deepEqual((await totals()).map(({ balance }) => balance), [-28,12], 'Manual verification does not suppress document legs');
    await query("UPDATE pg_temp.transfer_review_resolution_actions SET operation_mode='CREATED_AUTOMATICALLY', operation_status='REVERSED' WHERE id IN (30,31)");
    await query("UPDATE pg_temp.transfers SET status='ANULADO' WHERE id=10");
    await query("UPDATE pg_temp.classifieds SET status='INACTIVE' WHERE id=20");
    await query(`INSERT INTO pg_temp.kardex_movements
      (id,id_product,id_sucursal,id_storage,type,quantity,cost,date,status,details)
      VALUES (60,1,1,1,'INPUT',8,3,'2026-08-03',true,'TEST reversal transfer'),
        (61,1,1,1,'INPUT',6,3,'2026-08-03',true,'TEST reversal source'),
        (62,2,1,1,'OUTPUT',6,3,'2026-08-03',true,'TEST reversal destination')`);
    assert.deepEqual(await totals(), [
      { id_product: 1, id_sucursal: 1, balance: 0, rows: 4 },
      { id_product: 2, id_sucursal: 1, balance: 0, rows: 2 },
    ], 'Reversal keeps both originals and compensations with zero net balance');
    const [normalized] = await query("SELECT pg_get_viewdef('pg_temp.reconciliation_kardex_test'::regclass,true) AS definition");
    const restored = removeExplicitReconciliationMovements(normalized[0].definition);
    await query(`CREATE OR REPLACE TEMP VIEW reconciliation_kardex_test AS ${restored}`);
    await query('DROP FUNCTION pg_temp.reconciliation_has_explicit_kardex(text,integer)');
    assert.equal(restored.includes('reconciliation_has_explicit_kardex'), false);
    await query('DELETE FROM pg_temp.kardex_movements WHERE id IN (60,61,62)');
    await query("UPDATE pg_temp.transfers SET status='PENDING' WHERE id=10");
    await query("UPDATE pg_temp.classifieds SET status='ACTIVE' WHERE id=20");
    assert.deepEqual((await totals()).map(({ balance }) => balance), [-28,12],
      'Migration reversal restores the exact former accounting behavior');
  } finally {
    await transaction.rollback();
    await sequelize.close();
  }
});
