const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { numberDocumentExistClient, idExistClient, idExistSucursal } = require('./database');

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
    },
    number_document: {
        isEmpty: {
            negated: true, bail: true,
            errorMessage: "El carnet de identidad es obligatorio",
        },
        custom: { options: numberDocumentExistClient },
    },
    razon_social: {
        isInt: {
            bail: true, negated: true, errorMessage: "La razon social tiene que ser un valor alfabético",
        },
        isLength: {
            errorMessage: 'La razon social debe tener mínimo a 2 caracteres y máximo 174 caracteres',
            options: {  max: 174},
        },
    },
    email: {
        optional: true,
        isEmail: {
            errorMessage: "El correo electrónico tiene que tener un formato valido",
        },
    },
    cellphone: {
        optional:{ options: {nullable: true}},
        isNumeric: {
            errorMessage: "EL numero de celular debe ser un valor numérico", bail: true,
        }
    },
    business_name: {
        optional: true,
        isInt: {
            bail: true, negated: true, errorMessage: "El nombre de negocio tiene que ser un valor alfabético",
        },
        isLength: {
            errorMessage: 'El nombre de negocio debe tener mínimo a 4 caracteres y máximo 174 caracteres',
            options: { max: 174},
        },
    },
    address: {
        optional: true,
        isInt: {
            bail: true, negated: true, errorMessage: "La dirección tiene que ser un valor alfabético",
        },
        isLength: {
            errorMessage: 'La dirección debe tener mínimo a 4 caracteres y máximo 174 caracteres',
            options: { min: 4, max: 174},
        },
    },
    type: {
        isEmpty: {
            negated: true,
            errorMessage: "El tipo es obligatorio",
        },
        isLength: {
            errorMessage: 'mínimo a 1 caracteres y máximo 174 caracteres',
            options: { min: 1, max: 174},
        },
    },
    id_sucursal: {
        optional:{ options: {nullable: true}},
        isEmpty: {
            negated: true,
            errorMessage: "El id sucursal es obligatorio",
        },
        custom: { options: idExistSucursal },
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
            custom: { options: idExistClient},
        },
        ...validationSchema
    }),
    validatedResponse
];

const validateDelete = [
    checkSchema({
        id: { custom: { options: idExistClient} },
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

