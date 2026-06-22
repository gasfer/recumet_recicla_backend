
let decimal = 0; 

const loadDecimals = async ()  =>{
  try {
    const { Company } = require('../database/config');
    const company = await Company.findOne({
      where: { id: 1 },
      attributes: ['decimals'],
    });
        
    decimal = company.decimals;
    console.log(`Decimales cargados: ${decimal}`);
  } catch (error) {
    console.error('Error al cargar los decimales:', error);
    process.exit(1); // Detener la aplicación 
  }
}

const getDecimalPlaces = () => {
  return decimal;
}

module.exports = {
  loadDecimals,
  getDecimalPlaces
};