const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { emailExistUser, idExistUser, number_documentExistUser } = require('./database');

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
        custom: { options: number_documentExistUser },
    },
    cellphone: {
        isNumeric: {
            errorMessage: "EL numero de celular debe ser un valor numérico", bail: true,
        },
        isLength: {
            errorMessage: 'EL numero de celular debe tener mínimo 7 caracteres y máximo 8 caracteres',
            options: { min: 7, max: 8},
        },
    },
    sex: {
        isEmpty: {
            negated: true,
            errorMessage: "El sex es obligatorio",
        },
        isLength: {
            errorMessage: 'mínimo a 1 caracteres y máximo 254 caracteres',
            options: { min: 1, max: 254},
        },
    },
    position: {
        isEmpty: {
            negated: true,
            errorMessage: "La posición es obligatorio",
        },
        isLength: {
            errorMessage: 'Mínimo a 4 caracteres y máximo 254 caracteres',
            options: { min: 4, max: 254},
        },
    },
    email: {
        isEmpty: {
            negated: true, errorMessage: "El correo electrónico es obligatorio",
        },
        isEmail: {
            errorMessage: "El correo electrónico tiene que tener un formato valido",
        },
        isLength: {
            errorMessage: 'El correo electrónico debe tener mínimo a 4 caracteres y máximo 174 caracteres',
            options: { min: 4, max: 174},
        },
        custom: {
            options: emailExistUser,
        },
    },
    password: {
        isEmpty: {
            negated: true, errorMessage: "La contraseña es obligatorio",
        },
        isLength: {
            errorMessage: 'La contraseña debe tener mínimo a 4 caracteres y máximo 174 caracteres',
            options: { min: 4, max: 174},
        },
    },
    role: {
        isEmpty: {
            negated: true,
            errorMessage: "El rol es obligatorio",
        },
        isLength: {
            errorMessage: 'El rol debe tener mínimo a 4 caracteres y máximo 174 caracteres',
            options: { min: 4, max: 174},
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
            custom: { options: idExistUser},
        },
        ...validationSchema
    }),
    validatedResponse
];

const validateDelete = [
    checkSchema({
        id: { custom: { options: idExistUser} },
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

