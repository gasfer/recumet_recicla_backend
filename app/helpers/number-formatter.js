
const { getDecimalPlaces } = require('./decimals-value'); 


const formattedDecimalSetter = (value) => {
    const decimalPlaces = getDecimalPlaces();
    const formattedValue = Number(value).toFixed(decimalPlaces);
    return Number(formattedValue);
};

const formattedDecimalQuantitySetter = (value) => {
    const decimalPlaces = 2; //Solo para cantidad solo 2 decimales
    const formattedValue =  Number(value).toFixed(decimalPlaces);
    return Number(formattedValue);
};

module.exports = {
    formattedDecimalSetter,
    formattedDecimalQuantitySetter
}