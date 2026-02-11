'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('categories', 'type', {
            type: Sequelize.ENUM('RAW_MATERIAL', 'FINISHED_PRODUCT', 'RESALE_ITEM'),
            allowNull: false,
            defaultValue: 'RAW_MATERIAL' // Setting default to avoid issues with existing records
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('categories', 'type');
        await queryInterface.sequelize.query('DROP TYPE "enum_categories_type";');
    }
};
