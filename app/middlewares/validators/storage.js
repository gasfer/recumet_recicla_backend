const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { nameExistStorage, idExistSucursal, idExistStorage } = require('./database');

const validationSchema =  {
    name: {
        isEmpty: {
            negated: true, errorMessage: "El nombre es obligatorio",
        },
        isInt: {
            bail: true, negated: true, errorMessage: "El nombre tiene que ser un valor alfabético",
        },
        isLength: {
            errorMessage: 'El nombre debe tener mínimo a 4 caracteres y máximo 174 caracteres',
            options: { min: 4, max: 174},
        },
        custom: { options: nameExistStorage }
    },
    id_sucursal: {
        isEmpty: {
            negated: true, errorMessage: "El id sucursal es obligatorio",
        },
        custom: { options: idExistSucursal }
    },
    status: {
        isBoolean: { errorMessage: "El estado debe ser de tipo boolean [false, true]"}
    }
};

const getValidateCreate = [
    checkSchema(validationSchema),
    validatedResponse
];

const getValidateUpdate= [
    checkSchema({
        id: {
            custom: { options: idExistStorage},
        },
        ...validationSchema
    }),
    validatedResponse
];

const validateDelete = [
    checkSchema({
        id: { custom: { options: idExistStorage} },
        status: {
            isBoolean: {
                errorMessage: "El estado debe ser de tipo boolean [false, true]",
            }
        }
    }),
    validatedResponse
]


module.exports = {
    getValidateCreate,
    getValidateUpdate,
    validateDelete
}

