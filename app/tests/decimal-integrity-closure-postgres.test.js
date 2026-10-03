'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const enabled = process.env.RUN_INTEGRITY_POSTGRES_TEST === '1';

test('integridad decimal con migraciones reales, rollback y concurrencia PostgreSQL', { skip: !enabled }, async (t) => {
  if (process.env.DB_HOST !== '127.0.0.1' || process.env.DB_DATABASE !== 'integrity_closure_test' || process.env.DB_PORT !== '55439') {
    throw new Error('Las pruebas requieren la base local aislada integrity_closure_test en 55439.');
  }
  const db = require('../database/config');
  const { withDecimalPolicy } = require('../helpers/decimal-operation-context');
  const posting = require('../services/inventory-posting.service');
  const integrity = require('../services/stock-kardex-integrity.service');
  const query = (sql, transaction) => db.sequelize.query(sql, { transaction, logging: false });
  const location = { productId: 910001, sucursalId: 910001, storageId: 910001 };
  try {
    for (const table of ['companies', 'users', 'sucursals', 'storages', 'products']) {
      await query(`INSERT INTO ${table} (id,"createdAt","updatedAt",${table === 'users' ? 'full_names' : 'name'},status) VALUES (910001,NOW(),NOW(),'INTEGRITY TEST',true) ON CONFLICT (id) DO NOTHING`);
    }
    await query('INSERT INTO products (id,"createdAt","updatedAt",name,status) VALUES (910002,NOW(),NOW(),\'INTEGRITY TEST DESTINATION\',true) ON CONFLICT (id) DO NOTHING');
    for (const table of ['sucursals', 'storages']) await query(`INSERT INTO ${table} (id,"createdAt","updatedAt",name,status) VALUES (910002,NOW(),NOW(),'INTEGRITY TEST ORIGIN',true) ON CONFLICT (id) DO NOTHING`);
    await t.test('desfase 0,0004 visible a precisión 0/2/4; tolerancia anterior lo ocultaba', async () => {
      const transaction = await db.sequelize.transaction();
      try {
        await query(`INSERT INTO stocks (stock,id_product,id_sucursal,id_storage,status,"createdAt","updatedAt") VALUES (10.1234,910001,910001,910001,true,NOW(),NOW())`, transaction);
        await query(`INSERT INTO kardex_movements (type,quantity,id_product,id_sucursal,id_storage,status,date,"createdAt","updatedAt") VALUES ('INPUT',10.1230,910001,910001,910001,true,NOW(),NOW(),NOW())`, transaction);
        for (const places of [0, 2, 4]) await withDecimalPolicy({ places, inventory: true }, async () => {
          const result = await integrity.getStockKardexIntegrity({ ...location, transaction });
          assert.equal(result.difference, '0.0004');
          assert.equal(result.physicalDifference, '0.0004');
          assert.equal(result.consistent, false);
          await assert.rejects(integrity.verifyLocationsIntegrity({ locations: [location], transaction }), { code: 'STOCK_KARDEX_PARITY_VIOLATION' });
        });
      } finally { await transaction.rollback(); }
    });
    await t.test('efectos emparejados, precisión histórica, reclasificación y fallo tardío', async () => {
      await withDecimalPolicy({ places: 2, inventory: true }, async () => {
        const transaction = await db.sequelize.transaction();
        try {
          const input = await posting.applyExplicitEffect({ ...location, quantity: '10.1234', direction: 'INPUT', actorUserId: 910001, sourceType: 'TEST', sourceId: '1', sourceDetailId: '1', effectType: 'BASE', date: new Date(), idempotencyKey: 'test-base', transaction });
          assert.equal(input.after, '10.1234');
          const repeated = await posting.applyExplicitEffect({ ...location, quantity: '10.1234', direction: 'INPUT', actorUserId: 910001, sourceType: 'TEST', sourceId: '1', sourceDetailId: '1', effectType: 'BASE', date: new Date(), idempotencyKey: 'test-other-key', transaction });
          assert.equal(repeated.repeated, true);
          await posting.applyExplicitEffect({ ...location, quantity: '1.01', direction: 'OUTPUT', actorUserId: 910001, date: new Date(), transaction });
          await posting.applyExplicitEffect({ ...location, productId: 910002, quantity: '1.01', direction: 'INPUT', actorUserId: 910001, date: new Date(), transaction });
          const results = await integrity.verifyLocationsIntegrity({ locations: [location, { ...location, productId: 910002 }], transaction });
          assert.equal(results[0].physicalStock, '9.1134');
          assert.ok(results.every(({ consistent }) => consistent));
          await assert.rejects(posting.applyExplicitEffect({ ...location, quantity: '9.1135', direction: 'OUTPUT', transaction }), /insuficiente/);
          throw new Error('TEST_LATE_FAILURE');
        } catch (error) { assert.equal(error.message, 'TEST_LATE_FAILURE'); }
        finally { await transaction.rollback(); }
        assert.equal(await db.Stock.count({ where: { id_product: [910001, 910002], id_sucursal: 910001 } }), 0);
        assert.equal(await db.kardexMovements.count({ where: { id_product: [910001, 910002], id_sucursal: 910001 } }), 0);
      });
    });
    await t.test('duplicados compensados no pasan por igualdad de saldo', async () => {
      const transaction = await db.sequelize.transaction();
      try {
        await query('DROP INDEX kardex_movements_source_effect_unique', transaction);
        await query(`INSERT INTO stocks (stock,id_product,id_sucursal,id_storage,status,"createdAt","updatedAt") VALUES (0,910001,910001,910001,true,NOW(),NOW())`, transaction);
        await query(`INSERT INTO kardex_movements (type,quantity,id_product,id_sucursal,id_storage,status,date,source_type,source_id,source_detail_id,effect_type,"createdAt","updatedAt") VALUES ('INPUT',1,910001,910001,910001,true,NOW(),'TEST','duplicate','1','EFFECT',NOW(),NOW()), ('OUTPUT',1,910001,910001,910001,true,NOW(),'TEST','duplicate','1','EFFECT',NOW(),NOW())`, transaction);
        const diagnostic = await integrity.getStockKardexIntegrity({ ...location, transaction });
        assert.equal(diagnostic.difference, '0.0000');
        assert.equal(diagnostic.duplicateEffects, 1);
        assert.equal(diagnostic.consistent, false);
      } finally { await transaction.rollback(); }
    });
    await t.test('recepción 100/110, 100/90 y exacta conserva las tres representaciones', async () => {
      const reception = require('../services/transfer-reception-inventory.service');
      await withDecimalPolicy({ places: 4, inventory: true }, async () => {
        for (const received of ['110', '90', '100', '100.0004']) {
          const transaction = await db.sequelize.transaction();
          try {
            const transfer = await db.Transfers.create({ cod: 'TEST-RECEIPT', registry_number: 'TEST-RECEIPT', status: 'RECEIVED', date_send: new Date(), date_received: new Date(), id_sucursal_send: 910002, id_storage_send: 910002, id_sucursal_received: 910001, id_storage_received: 910001, id_user_received: 910001 }, { transaction });
            const detail = await db.DetailsTransfers.create({ id_transfer: transfer.id, id_product: 910001, quantity: 100, quantity_received: received, cost: 0, status: true, accounting_status: 'CONTABILIZADO' }, { transaction });
            if (received === '90') await reception.applyBlockedShortageReceipt({ transfer, shortageDetails: [{ detail, quantityReceived: received }], mermaProduct: { id: 910002 }, userId: 910001, transaction });
            else if (received === '110') await reception.applyBlockedExcessReceipt({ transfer, detail, quantityReceived: received, userId: 910001, transaction });
            else await reception.applyAcceptedReceipt({ transfer, detail, quantityReceived: received, userId: 910001, transaction });
            const diagnostics = await Promise.all([location, { ...location, productId: 910002 }].map((item) => integrity.getStockKardexIntegrity({ ...item, transaction })));
            assert.ok(diagnostics.every(({ consistent }) => consistent), `${received}: ${JSON.stringify(diagnostics)}`);
            assert.equal(Number(diagnostics[0].physicalStock), Number(received));
            assert.equal(Number(diagnostics[1].physicalStock), received === '90' ? 10 : 0);
          } finally { await transaction.rollback(); }
        }
      });
    });
    await t.test('cierre real bloquea retención, guía pendiente y acciones incompletas', async () => {
      const closure = require('../services/transfer-review-closure.service');
      await withDecimalPolicy({ places: 4, inventory: true }, async () => {
        const transaction = await db.sequelize.transaction();
        try {
          const { movement } = await posting.applyExplicitEffect({ ...location, quantity: '1.0004', direction: 'INPUT', actorUserId: 910001, date: new Date(), transaction });
          const transfer = await db.Transfers.create({ status: 'PENDING' }, { transaction });
          const note = await db.TransferReviewNote.create({ registry_number: 'NTR-TEST', type: 'EXCEDENTE_PARA_REVISION', date: new Date(), id_transfer: transfer.id, id_kardex_movement: movement.id, id_user: 910001, id_product: location.productId, id_sucursal: location.sucursalId, id_storage: location.storageId }, { transaction });
          const detail = await db.TransferReviewNoteDetail.create({ id_transfer_review_note: note.id, id_product: location.productId, quantity_sent: 1, quantity_received: '1.0004', quantity_difference: '0.0004', quantity_resolved: '0.0004', reconciliation_status: 'COMPLETADO' }, { transaction });
          const action = await db.TransferReviewResolutionAction.create({ id_transfer_review_note: note.id, id_transfer_review_note_detail: detail.id, id_user: 910001, idempotency_key: 'closure-fixture', strategy: 'EXCEDENTE_REGULARIZADO_VERIFICADO', quantity: '0.0004', operation_status: 'PENDING_RECEPTION' }, { transaction });
          await assert.rejects(closure.assertReviewClosure({ noteId: note.id, transaction }), /espera recepción/);
          await action.update({ operation_status: 'ACTIVE' }, { transaction });
          const hold = await db.TransferReviewInventoryHold.create({ id_transfer_review_note_detail: detail.id, id_product: location.productId, id_sucursal: location.sucursalId, id_storage: location.storageId, id_created_user: 910001, quantity: '0.0004', disposition: 'EN_REVISION' }, { transaction });
          await assert.rejects(closure.assertReviewClosure({ noteId: note.id, transaction }), /retenciones pendientes/);
          await hold.update({ disposition: 'LIBERADO_POR_AJUSTE' }, { transaction });
          assert.ok((await closure.assertReviewClosure({ noteId: note.id, transaction })).every(({ consistent }) => consistent));
          await action.update({ quantity: '0.0003' }, { transaction });
          await assert.rejects(closure.assertReviewClosure({ noteId: note.id, transaction }), /toda la cantidad/);
        } finally { await transaction.rollback(); }
      });
    });
    await t.test('restricción decimal y auditoría durable después de rollback', async () => {
      await assert.rejects(db.sequelize.transaction((transaction) => query('UPDATE companies SET decimals=5 WHERE id=910001', transaction)), /companies_decimal_policy_range/);
      const transaction = await db.sequelize.transaction();
      await query('UPDATE companies SET decimals=2 WHERE id=910001', transaction);
      await transaction.rollback();
      assert.equal((await db.Company.findByPk(910001)).decimals, 4);
      const { recordInventoryRejection } = require('../services/inventory-rejection-audit.service');
      const result = await recordInventoryRejection(Object.assign(new Error('Ensayo revertido'), { code: 'REVIEW_CLOSURE_REJECTED', statusCode: 409 }), { id: 910001, role: 'ADMINISTRADOR' });
      assert.ok(await db.History.findOne({ where: { id_user: 910001, type: 'INTEGRITY_REJECTED' } }));
      assert.ok(result.correlationId);
    });
    await t.test('concurrencia sobre fila inexistente y reintento preservan un único efecto', async () => {
      await withDecimalPolicy({ places: 4, inventory: true }, async () => {
        const apply = (key) => db.sequelize.transaction(async (transaction) => {
          const result = await posting.applyExplicitEffect({ ...location, quantity: '0.0004', direction: 'INPUT', actorUserId: 910001, date: new Date(), sourceType: 'TEST', sourceId: 'concurrent', sourceDetailId: '1', effectType: 'INPUT', idempotencyKey: key, transaction });
          await integrity.verifyLocationsIntegrity({ locations: [location], transaction });
          return result;
        });
        const results = await Promise.all([apply('concurrent-1'), apply('concurrent-2')]);
        assert.equal(results.filter(({ repeated }) => repeated).length, 1);
        const diagnostic = await integrity.getStockKardexIntegrity(location);
        assert.equal(diagnostic.physicalStock, '0.0004');
        assert.equal(diagnostic.consistent, true);
      });
    });
  } finally {
    await query("DELETE FROM histories WHERE id_user=910001 AND type='INTEGRITY_REJECTED'");
    await query('DELETE FROM kardex_movements WHERE id_product IN (910001,910002) AND id_sucursal=910001');
    await query('DELETE FROM stocks WHERE id_product IN (910001,910002) AND id_sucursal=910001');
    await db.sequelize.close();
  }
});
