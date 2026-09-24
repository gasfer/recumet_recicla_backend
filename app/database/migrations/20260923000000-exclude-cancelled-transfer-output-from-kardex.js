'use strict';

const isTransferOutputStates = (values) => (
  /'PENDING'/i.test(values) && /'RECEIVED'/i.test(values) && /'ANULADO'/i.test(values)
);

const removeCancelledState = (values) => values
  .replace(/,?\s*'ANULADO'(?:\s*::\s*character varying\s*::\s*text)?\s*,?/gi, ',')
  .replace(/^\s*,|,\s*$/g, '');

const excludeCancelledTransferOutputs = (definition) => definition.replace(
  /(\bstatus\b(?:::\w+)*\s*=\s*ANY\s*\(\s*ARRAY\[)([^\]]*)(\]\s*\))/gi,
  (match, prefix, values, suffix) => (
    isTransferOutputStates(values) ? `${prefix}${removeCancelledState(values)}${suffix}` : match
  ),
);

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(
        "SELECT pg_get_viewdef('view_kardex_detalle'::regclass, true) AS definition",
        { transaction },
      );
      const definition = excludeCancelledTransferOutputs(rows[0].definition);
      if (definition === rows[0].definition) {
        throw new Error('La vista Kardex no contiene la salida de traslados anulados esperada. Revise su definición antes de migrar.');
      }
      await queryInterface.sequelize.query(`CREATE OR REPLACE VIEW view_kardex_detalle AS ${definition}`, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(
        "SELECT pg_get_viewdef('view_kardex_detalle'::regclass, true) AS definition",
        { transaction },
      );
      const definition = rows[0].definition.replace(
        /(\bstatus\b(?:::\w+)*\s*=\s*ANY\s*\(\s*ARRAY\[)([^\]]*)(\]\s*\))/gi,
        (match, prefix, values, suffix) => (
          /'PENDING'/i.test(values) && /'RECEIVED'/i.test(values) && !/'ANULADO'/i.test(values)
            ? `${prefix}${values.trim()}, 'ANULADO'::character varying::text${suffix}`
            : match
        ),
      );
      await queryInterface.sequelize.query(`CREATE OR REPLACE VIEW view_kardex_detalle AS ${definition}`, { transaction });
    });
  },

  excludeCancelledTransferOutputs,
};
