'use strict';

const COLUMNS = {
  estado_registro: { type: 'ENUM', values: ['PENDIENTE', 'VALIDADO'] },
  commercial_name: { type: 'STRING' },
  entity_type: { type: 'STRING' },
  id_commercial_user: { type: 'INTEGER' },
  origin_channel: { type: 'STRING' },
  relationship_status: { type: 'STRING' },
  negotiation_condition: { type: 'TEXT' },
  commercial_observations: { type: 'TEXT' },
  requires_certificate: { type: 'BOOLEAN' },
  requires_traceability_report: { type: 'BOOLEAN' },
  service_mode: { type: 'STRING' },
  general_observations: { type: 'TEXT' },
};

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const [name, definition] of Object.entries(COLUMNS)) {
      const type = definition.type === 'ENUM'
        ? Sequelize.ENUM(...definition.values)
        : Sequelize[definition.type];
      const options = { type, allowNull: true };

      if (name === 'estado_registro') {
        options.allowNull = false;
        options.defaultValue = 'VALIDADO';
      }

      await queryInterface.addColumn('providers', name, options);
    }
  },

  async down(queryInterface) {
    for (const name of Object.keys(COLUMNS)) {
      await queryInterface.removeColumn('providers', name);
    }
  },
};
