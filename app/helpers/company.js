const { loadDecimals } = require('./decimals-value');

const getNumberDecimal = async () => loadDecimals();

module.exports = {
    getNumberDecimal,
}
