
let decimal = 2;

const normalizeDecimalPlaces = (value) => {
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
    const { Company } = require('../database/config');
    const company = await Company.findByPk(1, { attributes: ['decimals'] });
    if (!company) throw new Error('No existe la empresa operativa para cargar los decimales.');
    return setDecimalPlaces(company.decimals);
  } catch (error) {
    console.error('Error al cargar los decimales:', error);
    throw error;
  }
}

const getDecimalPlaces = () => {
  return decimal;
}

module.exports = {
  loadDecimals,
  getDecimalPlaces,
  normalizeDecimalPlaces,
  setDecimalPlaces
};
