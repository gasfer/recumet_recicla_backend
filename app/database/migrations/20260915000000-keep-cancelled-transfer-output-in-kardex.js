'use strict';

const includeCancelledTransfers = (definition) => {
  const hasTransferOutputStates = (values) => (
    /'PENDING'/i.test(values) && /'RECEIVED'/i.test(values) && !/'ANULADO'/i.test(values)
  );

  let updated = definition.replace(
    /(\bstatus\b(?:::\w+)*\s*=\s*ANY\s*\(\s*ARRAY\[)([^\]]*)(\]\s*\))/gi,
    (match, prefix, values, suffix) => hasTransferOutputStates(values)
      ? `${prefix}${values.trim()}, 'ANULADO'::character varying::text${suffix}`
      : match,
  );
  updated = updated.replace(
    /((?:\"?\w+\"?\.)?\"?status\"?)\s+IN\s*\(([^)]*)\)/gi,
    (match, field, values) => hasTransferOutputStates(values)
      ? `${field} IN (${values.trim()}, 'ANULADO')`
      : match,
  );
  return updated;
};

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query("SELECT pg_get_viewdef('view_kardex_detalle'::regclass, true) AS definition", { transaction });
      const definition = includeCancelledTransfers(rows[0].definition);
      if (definition === rows[0].definition) throw new Error('La vista Kardex no contiene un filtro de estado de traslado reconocible; revise su definición antes de migrar.');
      await queryInterface.sequelize.query(`CREATE OR REPLACE VIEW view_kardex_detalle AS ${definition}`, { transaction });
    });
  },
  includeCancelledTransfers,
};
