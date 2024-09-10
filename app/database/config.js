'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);
const configDB = require('../../config/database');

const db = {};

const sequelize = new Sequelize(configDB);

const dirname = path.join(__dirname, '../models');
fs.readdirSync(dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file !== 'server.js') && (file.slice(-3) === '.js');
  })
  .forEach(file => {
    const model = require(path.join(dirname, file))(sequelize, Sequelize.DataTypes);
    //models in database
    db[model.name] = model;
  });

  //asociations of models
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;

