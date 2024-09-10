const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { nameExistSucursal, idExistSucursal } = require('./database');

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
        custom: { options: nameExistSucursal }
    },
   email: {
        isLength: {
            errorMessage: 'El correo electrónico debe tener máximo 174 caracteres',
            options: { max: 174},
        },
    },
    cellphone: {
        isNumeric: {
            errorMessage: "EL numero de celular debe ser un valor numérico", bail: true,
        },
    },
    type: {
        isEmpty: {
            negated: true, errorMessage: "El tipo es obligatorio",
        },
        isLength: {
            errorMessage: 'El tipo debe tener mínimo a 2 caracteres y máximo 174 caracteres',
            options: { min: 2, max: 174},
        },
    },
    city: {
        isEmpty: {
            negated: true, errorMessage: "La ciudad es obligatorio",
        },
        isLength: {
            errorMessage: 'La ciudad  debe tener mínimo a 2 caracteres y máximo 174 caracteres',
            options: { min: 2, max: 174},
        },
    },
    address: {
        isEmpty: {
            negated: true, errorMessage: "La dirección es obligatorio",
        },
        isLength: {
            errorMessage: 'La dirección debe tener mínimo a 2 caracteres y máximo 174 caracteres',
            options: { min: 2, max: 174},
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
            custom: { options: idExistSucursal},
        },
        ...validationSchema
    }),
    validatedResponse
];

const validateDelete = [
    checkSchema({
        id: { custom: { options: idExistSucursal} },
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

