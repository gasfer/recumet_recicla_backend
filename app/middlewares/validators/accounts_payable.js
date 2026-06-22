const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistAccountPayable, idExistAbonoAccountPayable, idExistProvider, idExistSucursal, idExistAbonoAccountPayableMultiple } = require('./database');

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

const validationProviderGet =  {
    id_provider: {
        isEmpty: {
            negated: true, errorMessage: "El proveedor es obligatorio",
        },
        custom: { options: idExistProvider }
    }
};

const validationProvider =  {
    id_provider: {
        isEmpty: {
            negated: true, errorMessage: "El proveedor es obligatorio",
        },
        custom: { options: idExistProvider }
    },
    id_sucursal: {
        isEmpty: {
            negated: true,
            errorMessage: "El id sucursal es obligatorio",
        },
        custom: { options: idExistSucursal },
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

const getValidateGetForProviderGet = [
    checkSchema(validationProviderGet),
    validatedResponse
];

const validateDelete = [
    checkSchema({
        id_abono: { custom: { options: idExistAbonoAccountPayable} },
    }),
    validatedResponse
]

const validateDeleteMultiple = [
    checkSchema({
        id_abono_multiple: { custom: { options: idExistAbonoAccountPayableMultiple} },
    }),
    validatedResponse
]


module.exports = {
    getValidateCreate,
    validateDelete,
    getValidateGetForProvider,
    getValidateGetForProviderGet,
    validateDeleteMultiple
}

