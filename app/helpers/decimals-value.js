
let decimal = 2;
const { getDecimalPolicy } = require('./decimal-operation-context');

const normalizeDecimalPlaces = (value) => {
  if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '') throw new TypeError('Los decimales deben ser un entero entre 0 y 4.');
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 4) throw new TypeError('Los decimales deben ser un entero entre 0 y 4.');
  return parsed;
};

const setDecimalPlaces = (value) => {
  decimal = normalizeDecimalPlaces(value);
  return decimal;
};

const loadDecimals = async ()  =>{
  try {
    const company = await resolveOperationalCompany();
    if (!company) throw new Error('No existe la empresa operativa para cargar los decimales.');
    return setDecimalPlaces(company.decimals);
  } catch (error) {
    console.error('Error al cargar los decimales:', error);
    throw error;
  }
}

const getDecimalPlaces = () => {
  return getDecimalPolicy()?.places ?? decimal;
}

const resolveOperationalCompany = async ({ companyId, transaction } = {}) => {
  const { Company } = require('../database/config');
  const selectedId = companyId ?? process.env.OPERATIONAL_COMPANY_ID;
  const companies = await Company.findAll({
    where: { status: true, ...(selectedId ? { id: selectedId } : {}) },
    attributes: ['id', 'decimals'], limit: 2, transaction,
  });
  if (companies.length !== 1) throw Object.assign(new Error('Debe existir una única empresa operativa activa o configurarse su identificador.'), { statusCode: 409 });
  normalizeDecimalPlaces(companies[0].decimals);
  return companies[0];
};

module.exports = {
  loadDecimals,
  getDecimalPlaces,
  normalizeDecimalPlaces,
  setDecimalPlaces,
  resolveOperationalCompany
};
