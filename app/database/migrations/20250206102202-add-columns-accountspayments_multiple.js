'use strict';
const { DataTypes } = require('sequelize');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('abonos_accounts_payables', 'from_pay_multiple', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
    await queryInterface.addColumn('abonos_accounts_receivable', 'from_pay_multiple', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
    await queryInterface.createTable('abonos_accounts_payables_multiple', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      ids_account_payables: {
        type: Sequelize.ARRAY(DataTypes.INTEGER),
      },
      ids_abonos_payables: {
        type: Sequelize.ARRAY(DataTypes.INTEGER),
      },
      codes_input: {
        type: Sequelize.ARRAY(DataTypes.STRING),
      },
      date_abono: {
        type: Sequelize.DATE
      },
      monto_abono: {
        type: Sequelize.DECIMAL
      },
      id_user: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id'
        },
      },
      id_provider: {
        type: Sequelize.INTEGER,
        references: {
          model: 'providers',
          key: 'id'
        },
      },
      status: {
        type: Sequelize.BOOLEAN
      },
      comments: {
        type: Sequelize.TEXT
      },
      type_payment: {
        type: Sequelize.STRING
      },
      account_output: {
        type: Sequelize.STRING
      },
      id_bank: {
        type: Sequelize.INTEGER,
        references: {
          model: 'banks',
          key: 'id'
        },
      },
      id_sucursal: {
        type: Sequelize.INTEGER,
        references: {
          model: 'sucursals',
          key: 'id'
        },
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.createTable('abonos_accounts_receivables_multiple', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      ids_account_receivables: {
        type: Sequelize.ARRAY(DataTypes.INTEGER),
      },
      ids_abonos_receivables: {
        type: Sequelize.ARRAY(DataTypes.INTEGER),
      },
      codes_output: {
        type: Sequelize.ARRAY(DataTypes.STRING),
      },
      date_abono: {
        type: Sequelize.DATE
      },
      monto_abono: {
        type: Sequelize.DECIMAL
      },
      id_user: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id'
        },
      },
      id_client: {
        type: Sequelize.INTEGER,
        references: {
          model: 'clients',
          key: 'id'
        },
      },
      status: {
        type: Sequelize.BOOLEAN
      },
      comments: {
        type: Sequelize.TEXT
      },
      type_payment: {
        type: Sequelize.STRING
      },
      account_input: {
        type: Sequelize.STRING
      },
      id_bank: {
        type: Sequelize.INTEGER,
        references: {
          model: 'banks',
          key: 'id'
        },
      },
      id_sucursal: {
        type: Sequelize.INTEGER,
        references: {
          model: 'sucursals',
          key: 'id'
        },
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });


    await queryInterface.sequelize.query(`
      CREATE VIEW view_abonos_accounts_payables_all AS
      SELECT  abonos_accounts_payables.id,array[id_account_payable] AS ids_account_payables, array[abonos_accounts_payables.id]  as ids_abonos_payables, date_abono, monto_abono, abonos_accounts_payables.id_user,
            abonos_accounts_payables.comments, abonos_accounts_payables.type_payment, account_output, abonos_accounts_payables.id_bank,
            ap.id_provider, abonos_accounts_payables."createdAt",abonos_accounts_payables."updatedAt",
            array[i.cod] AS codes_input, ap.id_sucursal, false as from_pay_multiple
      FROM abonos_accounts_payables
      JOIN accounts_payables ap on ap.id = abonos_accounts_payables.id_account_payable
      join inputs i on i.id = ap.id_input
      WHERE from_pay_multiple = false AND abonos_accounts_payables.status = true

      UNION

      SELECT id, ids_account_payables AS ids_account_payables, ids_abonos_payables,date_abono, monto_abono,
            id_user, comments, type_payment, account_output,
            id_bank, id_provider,"createdAt","updatedAt",
            codes_input,
            id_sucursal, true as from_pay_multiple
      FROM abonos_accounts_payables_multiple
      WHERE abonos_accounts_payables_multiple.status = true;
    `);

    await queryInterface.sequelize.query(`
      CREATE VIEW view_abonos_accounts_receivables_all AS
      SELECT  abonos_accounts_receivable.id,array[id_account_receivable] AS ids_account_receivables, array[abonos_accounts_receivable.id]  as ids_abonos_receivables, date_abono, monto_abono, abonos_accounts_receivable.id_user,
            abonos_accounts_receivable.comments, abonos_accounts_receivable.type_payment, account_input,
            abonos_accounts_receivable.id_bank, ar.id_client ,abonos_accounts_receivable."createdAt",abonos_accounts_receivable."updatedAt",
            array[o.cod] as codes_output, ar.id_sucursal, false as from_pay_multiple
      FROM abonos_accounts_receivable
      JOIN accounts_receivable ar on ar.id = abonos_accounts_receivable.id_account_receivable
      JOIN outputs o on ar.id_output = o.id
      WHERE from_pay_multiple = false AND abonos_accounts_receivable.status = true

      UNION

      SELECT id, ids_account_receivables AS ids_account_payables, ids_abonos_receivables,date_abono, monto_abono,
            id_user, comments, type_payment, account_input,
            id_bank, id_client ,"createdAt","updatedAt",
            codes_output, id_sucursal, true as from_pay_multiple
      FROM abonos_accounts_receivables_multiple
      WHERE abonos_accounts_receivables_multiple.status = true;
    `);

  },
  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS view_abonos_accounts_payables_all;');
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS view_abonos_accounts_receivables_all;');
    await queryInterface.dropTable('abonos_accounts_payables_multiple');
    await queryInterface.dropTable('abonos_accounts_receivables_multiple');
    await queryInterface.removeColumn('abonos_accounts_receivable', 'from_pay_multiple');
    await queryInterface.removeColumn('abonos_accounts_payables', 'from_pay_multiple');

  }
};