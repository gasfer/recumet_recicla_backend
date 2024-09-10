const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistAccountReceivable, idExistAbonoAccountReceivable } = require('./database');

const validationSchema =  {
    id_account_receivable: {
        isEmpty: {
            negated: true, errorMessage: "El id_account_receivable es obligatorio",
        },
        custom: { options: idExistAccountReceivable }
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

const getValidateCreate = [
    checkSchema(validationSchema),
    validatedResponse
];

const validateDelete = [
    checkSchema({
        id_abono: { custom: { options: idExistAbonoAccountReceivable} },
    }),
    validatedResponse
]


module.exports = {
    getValidateCreate,
    validateDelete
}

