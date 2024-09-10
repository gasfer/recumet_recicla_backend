const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistCategory, nameExistCategory } = require('./database');

const validationSchema =  {
    name: {
        isEmpty: {
            negated: true, errorMessage: "El nombre es obligatorio",
        },
        isInt: {
            bail: true, negated: true, errorMessage: "El nombre tiene que ser un valor alfabético",
        },
        isLength: {
            errorMessage: 'El nombre debe tener mínimo a 2 caracteres y máximo 174 caracteres',
            options: { min: 2, max: 174},
        },
        custom: { options: nameExistCategory }
    },
    description: {
        isEmpty: {
            negated: true, errorMessage: "La descripcion es obligatorio",
        },
        isInt: {
            bail: true, negated: true, errorMessage: "La descripcion tiene que ser un valor alfabético",
        },
        isLength: {
            errorMessage: 'La descripcion debe tener mínimo a 4 caracteres y máximo 254 caracteres',
            options: { min: 4, max: 254},
        },
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
            custom: { options: idExistCategory},
        },
        ...validationSchema
    }),
    validatedResponse
];

const validateDelete = [
    checkSchema({
        id: { custom: { options: idExistCategory} },
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

