
const get_num_request = (valueText, number, numberCeros,z = '0') => {
    try {
        z = z || '0'; 
        number = number + ''; 
        const numberResp = number.length >= numberCeros ? number : new Array(numberCeros - number.length + 1).join(z) + number;
        return valueText + numberResp;
    } catch (error) {
        console.log(error);
    }
}

module.exports = get_num_request;
