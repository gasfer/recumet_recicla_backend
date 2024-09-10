const { Company } = require('../database/config');

const getNumberDecimal = async () => {
    const {decimals} = await Company.findOne({ attributes: ['decimals'] ,where: { id: 1 } });
    return decimals;
}

module.exports = {
    getNumberDecimal,
}