const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistAccountPayable, idExistAbonoAccountPayable, idExistProvider } = require('./database');

const validationSchema =  {
    id_account_payable: {
        isEmpty: {
            negated: true, errorMessage: "El id_account_payable es obligatorio",
        },
        custom: { options: idExistAccountPayable }
    },
    date_abono: {
        isISO8601: {
            errorMessage: 'El fecha de abono no tiene el formato correcto, enviar con formato ISO8601',
        }
    },
    monto_abono: {
        isDecimal: {
            bail: true, errorMessage: "El monto abono tiene que ser un valor numérico",
        },
    },
};

const validationProvider =  {
    id_provider: {
        isEmpty: {
            negated: true, errorMessage: "El proveedor es obligatorio",
        },
        custom: { options: idExistProvider }
    },
};

const getValidateCreate = [
    checkSchema(validationSchema),
    validatedResponse
];

const getValidateGetForProvider = [
    checkSchema(validationProvider),
    validatedResponse
];

const validateDelete = [
    checkSchema({
        id_abono: { custom: { options: idExistAbonoAccountPayable} },
    }),
    validatedResponse
]


module.exports = {
    getValidateCreate,
    validateDelete,
    getValidateGetForProvider
}

