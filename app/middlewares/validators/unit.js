const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { nameExistUnit, siglasExistUnit, idExistUnit } = require('./database');

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
        custom: { options: nameExistUnit }
    },
    siglas: {
        isEmpty: {
            negated: true, errorMessage: "La sigla es obligatorio",
        },
        isLength: {
            errorMessage: 'La sigla debe tener mínimo a 2 caracteres y máximo 20 caracteres',
            options: { min: 2, max: 20},
        },
        custom: { options: siglasExistUnit }
    },
    status: {
        isBoolean: {
            errorMessage: "El estado debe ser de tipo boolean [false, true]",
        }
    }
};

const getValidateCreate = [
    checkSchema(validationSchema),
    validatedResponse
];

const getValidateUpdate= [
    checkSchema({
        id: {
            custom: { options: idExistUnit},
        },
        ...validationSchema
    }),
    validatedResponse
];

const validateDelete = [
    checkSchema({
        id: { custom: { options: idExistUnit} },
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

