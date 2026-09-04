'use strict';

const { FUNCTION_NAME, explicitKardexFunctionSql, useExplicitReconciliationMovements,
  removeExplicitReconciliationMovements } = require('../../helpers/reconciliation-kardex-view');

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(
        "SELECT pg_get_viewdef('view_kardex_detalle'::regclass, true) AS definition", { transaction });
      const definition = useExplicitReconciliationMovements(rows[0].definition);
      await queryInterface.sequelize.query(explicitKardexFunctionSql(), { transaction });
      await queryInterface.sequelize.query(`CREATE OR REPLACE VIEW view_kardex_detalle AS ${definition}`, { transaction });
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(
        "SELECT pg_get_viewdef('view_kardex_detalle'::regclass, true) AS definition", { transaction });
      const definition = removeExplicitReconciliationMovements(rows[0].definition);
      await queryInterface.sequelize.query(`CREATE OR REPLACE VIEW view_kardex_detalle AS ${definition}`, { transaction });
      await queryInterface.sequelize.query(`DROP FUNCTION ${FUNCTION_NAME}(text, integer)`, { transaction });
    });
  },
};
