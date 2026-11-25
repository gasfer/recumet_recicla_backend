'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PlantPersonnel extends Model {
    static associate(models) {
      PlantPersonnel.hasMany(models.PlantPersonnelBranch, { as: 'branchAssignments', foreignKey: 'id_personal' });
      PlantPersonnel.belongsToMany(models.Sucursal, {
        as: 'branches', through: models.PlantPersonnelBranch,
        foreignKey: 'id_personal', otherKey: 'id_sucursal'
      });
    }
  }

  PlantPersonnel.init({
    full_name: DataTypes.STRING,
    ci: DataTypes.STRING,
    record_number: DataTypes.STRING,
    registration_date: DataTypes.DATEONLY,
    birth_date: DataTypes.DATEONLY,
    nationality: DataTypes.STRING,
    cellphone: DataTypes.STRING,
    corporate_phone: DataTypes.STRING,
    home_phone: DataTypes.STRING,
    marital_status: DataTypes.STRING,
    email: DataTypes.STRING,
    corporate_email: DataTypes.STRING,
    address: DataTypes.STRING,
    city: DataTypes.STRING,
    province: DataTypes.STRING,
    zone: DataTypes.STRING,
    has_children: DataTypes.BOOLEAN,
    children: DataTypes.JSONB,
    company_family: DataTypes.JSONB,
    has_company_family: DataTypes.BOOLEAN,
    emergency2_name: DataTypes.STRING,
    emergency2_phone: DataTypes.STRING,
    job_title: DataTypes.STRING,
    area: DataTypes.STRING,
    profession: DataTypes.STRING,
    academic_institution: DataTypes.STRING,
    graduation_year: DataTypes.STRING,
    studying: DataTypes.BOOLEAN,
    study_nationality: DataTypes.STRING,
    general_experience_years: DataTypes.DECIMAL(5, 2),
    specific_experience_years: DataTypes.DECIMAL(5, 2),
    hire_date: DataTypes.DATEONLY,
    retirement_date: DataTypes.DATEONLY,
    salary: DataTypes.DECIMAL(14, 2),
    contract_type: DataTypes.STRING,
    bank_account: DataTypes.STRING,
    bank_name: DataTypes.STRING,
    emergency_name: DataTypes.STRING,
    emergency_phone: DataTypes.STRING,
    emergency_relationship: DataTypes.STRING,
    guarantor_name: DataTypes.STRING,
    guarantor_ci: DataTypes.STRING,
    guarantor_address: DataTypes.STRING,
    guarantor_phone: DataTypes.STRING,
    document_checklist: DataTypes.JSONB,
    observations: DataTypes.TEXT,
    notes: DataTypes.TEXT,
    is_active: DataTypes.BOOLEAN,
    created_by: DataTypes.INTEGER,
  }, { sequelize, modelName: 'PlantPersonnel', tableName: 'rrhh_personal_planta' });
  return PlantPersonnel;
};
