'use strict';

const DOMICILIARY_TYPE_ID = 5;
const UNIFIED_TYPE_ID = 4;

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkUpdate('providers', {
        id_type_provider: UNIFIED_TYPE_ID,
        updatedAt: now,
      }, { id_type_provider: DOMICILIARY_TYPE_ID }, { transaction });

      await queryInterface.bulkUpdate('types_provider', {
        code: 'D',
        name: 'D - Domiciliarios/ Particulares',
        status: true,
        updatedAt: now,
      }, { id: UNIFIED_TYPE_ID }, { transaction });

      await queryInterface.bulkDelete('types_provider', { id: DOMICILIARY_TYPE_ID }, { transaction });
    });
  },

  async down(queryInterface) {
    const now = new Date();

    await queryInterface.sequelize.transaction(async (transaction) => {
      const [existingType] = await queryInterface.sequelize.query(
        'SELECT "id" FROM "types_provider" WHERE "id" = :id',
        { replacements: { id: DOMICILIARY_TYPE_ID }, transaction },
      );

      if (existingType.length === 0) {
        await queryInterface.bulkInsert('types_provider', [{
          id: DOMICILIARY_TYPE_ID,
          code: 'E',
          name: 'E - DOMICILIARIOS',
          status: true,
          createdAt: now,
          updatedAt: now,
        }], { transaction });
      }

      await queryInterface.bulkUpdate('types_provider', {
        code: 'D',
        name: 'D - OCACIONALES / PARTICULARES',
        status: true,
        updatedAt: now,
      }, { id: UNIFIED_TYPE_ID }, { transaction });
    });
  },
};
