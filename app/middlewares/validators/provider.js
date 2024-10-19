const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { nameExistProvider, idExistProvider, idExistCategory, idExistSector, nameExistSector, idTypeProvider } = require('./database');

const validationSchema =  {
    full_names: {
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
        custom: { options: nameExistProvider }
    },
    id_sector: {
        isEmpty: {
            negated: true, errorMessage: "La sector es obligatorio",
        },
        custom: { options: idExistSector },
    },
    id_type_provider: {
        isEmpty: {
            negated: true, errorMessage: "La tipo es obligatorio",
        },
        custom: { options: idTypeProvider },
    },
    mayorista: {
        isBoolean: {
            errorMessage: "Si es o no mayorista debe ser de tipo boolean [false, true]",
        }
    },
    id_category: {
        isEmpty: {
            negated: true, errorMessage: "La categoría es obligatorio",
        },
        custom: { options: idExistCategory },
    },
    status: {
        isBoolean: {
            errorMessage: "El estado debe ser de tipo boolean [false, true]",
        }
    }
};

const validationSchemaSector =  {
    name: {
        isEmpty: {
            negated: true, errorMessage: "El nombre es obligatorio",
        },
        isLength: {
            errorMessage: 'El nombre debe tener mínimo a 2 caracteres y máximo 174 caracteres',
            options: { min: 2, max: 174},
        },
        custom: { options: nameExistSector },
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

const getValidateCreateSector = [
    checkSchema(validationSchemaSector),
    validatedResponse
];

const getValidateUpdate= [
    checkSchema({
        id: {
            custom: { options: idExistProvider},
        },
        ...validationSchema
    }),
    validatedResponse
];

const validateDelete = [
    checkSchema({
        id: { custom: { options: idExistProvider} },
        status: {
            isBoolean: {
                errorMessage: "El estado debe ser de tipo boolean [false, true]",
            }
        }
    }),
    validatedResponse
]

const validateDeleteSector = [
    checkSchema({
        id: { custom: { options: idExistSector} },
    }),
    validatedResponse
]


module.exports = {
    getValidateCreate,
    getValidateUpdate,
    validateDelete,
    getValidateCreateSector,
    validateDeleteSector
}

