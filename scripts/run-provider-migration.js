const { sequelize } = require('../app/database/config');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    const sqlPath = path.join(__dirname, 'migrate-provider-frequency-and-documents.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    console.log('Ejecutando migración SQL para proveedores...');
    await sequelize.query(sql);
    console.log('Migración completada exitosamente.');
    process.exit(0);
  } catch (error) {
    console.error('Error al ejecutar migración SQL:', error.message);
    process.exit(1);
  }
}

runMigration();
