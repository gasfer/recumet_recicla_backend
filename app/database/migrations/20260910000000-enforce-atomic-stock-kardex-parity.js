'use strict';

const { DataTypes, Op } = require('sequelize');
const { revertTransferReceiptBranch } = require('./20260908210100-exclude-pending-transfer-receipts-from-kardex');

const STOCK_INDEX = 'stocks_one_active_location';
const IDEMPOTENCY_INDEX = 'kardex_movements_idempotency_unique';
const SOURCE_EFFECT_INDEX = 'kardex_movements_source_effect_unique';

const preflightSql = Object.freeze({
  unknownTolerance: `SELECT id, tolerance_decision FROM details_transfers
    WHERE tolerance_decision IS NOT NULL
      AND tolerance_decision NOT IN ('ACEPTADO', 'REQUIERE_CONCILIACION', 'NO_EVALUABLE', 'ACCEPTED', 'REQUIRES_REVIEW') LIMIT 20`,
  unknownAccounting: `SELECT id, accounting_status FROM details_transfers
    WHERE accounting_status IS NOT NULL
      AND accounting_status NOT IN ('CONTABILIZADO', 'REVERTIDO', 'PENDIENTE_CONCILIACION', 'ACCOUNTED', 'REVERSED') LIMIT 20`,
  duplicateStock: `SELECT id_product, id_sucursal, id_storage, COUNT(*) AS rows
    FROM stocks WHERE status = true
    GROUP BY id_product, id_sucursal, id_storage HAVING COUNT(*) > 1 LIMIT 20`,
  ambiguousPending: `SELECT id, id_transfer, id_product FROM details_transfers
    WHERE accounting_status = 'PENDIENTE_CONCILIACION' AND quantity_received IS NULL LIMIT 20`,
});

const runPreflight = async (sequelize, transaction) => {
  for (const [name, sql] of Object.entries(preflightSql)) {
    const [rows] = await sequelize.query(sql, { transaction });
    if (rows.length) {
      const error = new Error(`Preflight Stock–Kardex rechazado: ${name}. Se requiere investigación antes de migrar.`);
      error.code = 'STOCK_KARDEX_PREFLIGHT_FAILED';
      error.details = { check: name, rows };
      throw error;
    }
  }
};

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await runPreflight(queryInterface.sequelize, transaction);

      await queryInterface.sequelize.query(`UPDATE details_transfers SET
        tolerance_decision = CASE tolerance_decision
          WHEN 'ACCEPTED' THEN 'ACEPTADO'
          WHEN 'REQUIRES_REVIEW' THEN 'REQUIERE_CONCILIACION'
          ELSE tolerance_decision END,
        accounting_status = CASE accounting_status
          WHEN 'ACCOUNTED' THEN 'CONTABILIZADO'
          WHEN 'REVERSED' THEN 'REVERTIDO'
          WHEN 'PENDIENTE_CONCILIACION' THEN 'CONTABILIZADO'
          ELSE COALESCE(accounting_status, 'CONTABILIZADO') END,
        accounting_applied_at = CASE
          WHEN quantity_received IS NOT NULL THEN COALESCE(accounting_applied_at, "updatedAt", NOW())
          ELSE accounting_applied_at END`, { transaction });

      const [rows] = await queryInterface.sequelize.query(
        "SELECT pg_get_viewdef('view_kardex_detalle'::regclass, true) AS definition",
        { transaction },
      );
      const definition = revertTransferReceiptBranch(rows[0].definition);
      if (definition.includes('PENDIENTE_CONCILIACION')) {
        throw new Error('No fue posible retirar de la vista Kardex el filtro que ocultaba recepciones pendientes.');
      }
      await queryInterface.sequelize.query(`CREATE OR REPLACE VIEW view_kardex_detalle AS ${definition}`, { transaction });

      await queryInterface.addIndex('stocks', ['id_product', 'id_sucursal', 'id_storage'], {
        name: STOCK_INDEX, unique: true, where: { status: true }, transaction,
      });
      await queryInterface.addColumn('kardex_movements', 'source_type', { type: DataTypes.STRING, allowNull: true }, { transaction });
      await queryInterface.addColumn('kardex_movements', 'source_id', { type: DataTypes.STRING, allowNull: true }, { transaction });
      await queryInterface.addColumn('kardex_movements', 'source_detail_id', { type: DataTypes.STRING, allowNull: true }, { transaction });
      await queryInterface.addColumn('kardex_movements', 'effect_type', { type: DataTypes.STRING, allowNull: true }, { transaction });
      await queryInterface.addColumn('kardex_movements', 'idempotency_key', { type: DataTypes.STRING, allowNull: true }, { transaction });
      await queryInterface.addIndex('kardex_movements', ['idempotency_key'], {
        name: IDEMPOTENCY_INDEX, unique: true, where: { idempotency_key: { [Op.ne]: null } }, transaction,
      });
      await queryInterface.addIndex('kardex_movements', ['source_type', 'source_id', 'source_detail_id', 'effect_type'], {
        name: SOURCE_EFFECT_INDEX,
        unique: true,
        where: { source_type: { [Op.ne]: null }, source_id: { [Op.ne]: null }, effect_type: { [Op.ne]: null } },
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex('kardex_movements', SOURCE_EFFECT_INDEX, { transaction });
      await queryInterface.removeIndex('kardex_movements', IDEMPOTENCY_INDEX, { transaction });
      for (const column of ['idempotency_key', 'effect_type', 'source_detail_id', 'source_id', 'source_type']) {
        await queryInterface.removeColumn('kardex_movements', column, { transaction });
      }
      await queryInterface.removeIndex('stocks', STOCK_INDEX, { transaction });
      // La vista no vuelve a ocultar recepciones ya contabilizadas: el rollback seguro es de aplicación, no de datos.
    });
  },
  preflightSql,
  runPreflight,
};
