'use strict';

const TRANSFER_RECEIPT_REGEX = /WHERE\s+\(?\s*tr\.status(?:::text)?\s*=\s*'RECEIVED'(?:::text)?\s*\)?/i;
const ACCOUNTING_FILTER_REGEX = /\s+AND\s+COALESCE\s*\(\s*dt\.accounting_status.*?'PENDIENTE_CONCILIACION'(?:::text)?/i;

const replaceTransferReceiptBranch = (viewDefinition) => {
  if (viewDefinition.includes('PENDIENTE_CONCILIACION')) {
    return viewDefinition;
  }
  if (!TRANSFER_RECEIPT_REGEX.test(viewDefinition)) {
    throw new Error('No se encontró la rama de recepción de traslados en la vista Kardex.');
  }
  return viewDefinition.replace(
    TRANSFER_RECEIPT_REGEX,
    (match) => `${match.trimEnd()} AND COALESCE(dt.accounting_status, 'CONTABILIZADO') <> 'PENDIENTE_CONCILIACION' `
  );
};

const revertTransferReceiptBranch = (viewDefinition) => {
  return viewDefinition.replace(ACCOUNTING_FILTER_REGEX, '');
};

module.exports = {
  async up(queryInterface) {
    const [result] = await queryInterface.sequelize.query(
      "SELECT pg_get_viewdef('view_kardex_detalle'::regclass, true) AS definition;",
    );
    const definition = replaceTransferReceiptBranch(result[0].definition);
    await queryInterface.sequelize.query(`CREATE OR REPLACE VIEW view_kardex_detalle AS ${definition};`);
  },

  async down(queryInterface) {
    const [result] = await queryInterface.sequelize.query(
      "SELECT pg_get_viewdef('view_kardex_detalle'::regclass, true) AS definition;",
    );
    const definition = revertTransferReceiptBranch(result[0].definition);
    await queryInterface.sequelize.query(`CREATE OR REPLACE VIEW view_kardex_detalle AS ${definition};`);
  },
};

module.exports.replaceTransferReceiptBranch = replaceTransferReceiptBranch;
module.exports.revertTransferReceiptBranch = revertTransferReceiptBranch;
