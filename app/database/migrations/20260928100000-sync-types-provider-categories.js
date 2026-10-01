'use strict';

const TYPES = [
  { id: 1, code: 'A', name: 'A - EMPRESAS E INSTITUCIONES' },
  { id: 2, code: 'B', name: 'B - ACOPIADORES / MAYORISTAS' },
  { id: 3, code: 'C', name: 'C - ACOPIADORES / MINORISTAS' },
  { id: 4, code: 'D', name: 'D - OCACIONALES / PARTICULARES' },
  { id: 5, code: 'E', name: 'E - DOMICILIARIOS' },
  { id: 6, code: 'F', name: 'F - NUEVOS (SIN CLASIFICAR)' },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    for (const type of TYPES) {
      const updated = await queryInterface.bulkUpdate('types_provider', {
        code: type.code,
        name: type.name,
        status: true,
        updatedAt: now,
      }, { id: type.id });

      if (updated === 0) {
        await queryInterface.bulkInsert('types_provider', [{
          ...type,
          status: true,
          createdAt: now,
          updatedAt: now,
        }]);
      }
    }
  },

  async down() {
  },
};
