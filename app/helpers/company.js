const { Company } = require('../database/config');
const { getDecimalPlaces } = require('./decimals-value');

const getNumberDecimal = async () => {
    return getDecimalPlaces();
}

module.exports = {
    getNumberDecimal,
}