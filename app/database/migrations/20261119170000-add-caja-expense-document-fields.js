'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = {
      register_type: { type: Sequelize.STRING(12), allowNull: false, defaultValue: 'GASTO' },
      expense_date: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      responsible: { type: Sequelize.STRING(160), allowNull: true },
      concept: { type: Sequelize.STRING(200), allowNull: true },
      provider_name: { type: Sequelize.STRING(160), allowNull: true },
      provider_tax_id: { type: Sequelize.STRING(32), allowNull: true },
      receipt_type: { type: Sequelize.STRING(24), allowNull: true },
      receipt_number: { type: Sequelize.STRING(80), allowNull: true },
      receipt_date: { type: Sequelize.DATEONLY, allowNull: true },
      expense_details: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    };
    for (const [name, definition] of Object.entries(columns)) {
      await queryInterface.addColumn('cj_gastos', name, definition);
    }
    await queryInterface.sequelize.query(`
      UPDATE cj_gastos SET concept = LEFT(description, 200), expense_date = COALESCE("createdAt", NOW())
      WHERE concept IS NULL;
      ALTER TABLE cj_gastos DROP CONSTRAINT IF EXISTS cj_gastos_register_type_check;
      ALTER TABLE cj_gastos ADD CONSTRAINT cj_gastos_register_type_check CHECK (register_type IN ('GASTO', 'ACTIVO'));
      CREATE INDEX IF NOT EXISTS ix_cj_gastos_expense_date ON cj_gastos (expense_date);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM cj_gastos WHERE provider_name IS NOT NULL OR provider_tax_id IS NOT NULL OR receipt_type IS NOT NULL OR receipt_number IS NOT NULL OR responsible IS NOT NULL) THEN
          RAISE EXCEPTION 'No se puede revertir: ya hay datos de proveedor, comprobante o responsable; exporte esos datos antes de revertir.';
        END IF;
      END $$;
      DROP INDEX IF EXISTS ix_cj_gastos_expense_date;
      ALTER TABLE cj_gastos DROP CONSTRAINT IF EXISTS cj_gastos_register_type_check;
    `);
    for (const name of ['expense_details', 'receipt_date', 'receipt_number', 'receipt_type', 'provider_tax_id', 'provider_name', 'concept', 'responsible', 'expense_date', 'register_type']) {
      await queryInterface.removeColumn('cj_gastos', name);
    }
  },
};
