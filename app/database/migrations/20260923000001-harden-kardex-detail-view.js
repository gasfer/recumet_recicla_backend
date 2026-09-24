'use strict';

const {
  explicitKardexFunctionSql,
  useExplicitReconciliationMovements,
  removeExplicitReconciliationMovements,
} = require('../../helpers/reconciliation-kardex-view');

const activeDetailBranches = [
  { from: /FROM\s+details_inputs\s+di/i, document: /i\.status(?:::\w+)*\s*=\s*'ACTIVE'(?:::\w+)?/i, detail: 'di.status::text = \'ACTIVE\'::text' },
  { from: /FROM\s+details_classifieds\s+dc/i, document: /cl\.status(?:::\w+)*\s*=\s*'ACTIVE'(?:::\w+)?/i, detail: 'dc.status::text = \'ACTIVE\'::text' },
  { from: /FROM\s+details_outputs\s+dot/i, document: /o\.status(?:::\w+)*\s*=\s*'ACTIVE'(?:::\w+)?/i, detail: 'dot.status::text = \'ACTIVE\'::text' },
];

const addActiveDetailFilters = (definition) => {
  let changed = 0;
  const result = definition.split(/\bUNION ALL\b/).map((branch) => {
    const rule = activeDetailBranches.find(({ from }) => from.test(branch));
    if (!rule || branch.includes(rule.detail)) return branch;
    if (!rule.document.test(branch)) throw new Error('No se encontró el filtro de documento activo esperado en la vista Kardex.');
    changed += 1;
    return branch.replace(rule.document, (match) => `${match} AND ${rule.detail}`);
  }).join('UNION ALL');
  if (changed !== activeDetailBranches.length) {
    throw new Error(`Se esperaban ${activeDetailBranches.length} filtros de detalle activo y se aplicaron ${changed}.`);
  }
  return result;
};

const removeActiveDetailFilters = (definition) => activeDetailBranches.reduce(
  (result, { detail }) => result.replace(new RegExp(`\\s+AND\\s+${detail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), ''),
  definition,
);

const hasReconciliationGuard = (definition) => /reconciliation_has_explicit_kardex/i.test(definition);

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(
        "SELECT pg_get_viewdef('view_kardex_detalle'::regclass, true) AS definition",
        { transaction },
      );
      let definition = addActiveDetailFilters(rows[0].definition);
      if (!hasReconciliationGuard(definition)) definition = useExplicitReconciliationMovements(definition);
      await queryInterface.sequelize.query(
        explicitKardexFunctionSql().replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'),
        { transaction },
      );
      await queryInterface.sequelize.query(`CREATE OR REPLACE VIEW view_kardex_detalle AS ${definition}`, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(
        "SELECT pg_get_viewdef('view_kardex_detalle'::regclass, true) AS definition",
        { transaction },
      );
      let definition = removeActiveDetailFilters(rows[0].definition);
      if (hasReconciliationGuard(definition)) definition = removeExplicitReconciliationMovements(definition);
      await queryInterface.sequelize.query(`CREATE OR REPLACE VIEW view_kardex_detalle AS ${definition}`, { transaction });
    });
  },

  addActiveDetailFilters,
  removeActiveDetailFilters,
};
