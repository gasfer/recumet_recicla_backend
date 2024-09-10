const toUpperCase = require("../helpers/to-upper-case");

const toUpperCaseConvert = async(req, res = response , next) => {
    try {
        req.body = toUpperCase(req.body);
        req.query = toUpperCase(req.query);
        next();
    } catch (error) {
        console.log(error);
    }
}

module.exports = toUpperCaseConvert;