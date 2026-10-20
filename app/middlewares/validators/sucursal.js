const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { nameExistSucursal, idExistSucursal } = require('./database');
const { Storage } = require('../../database/config');

const storageNamesSchema = {
    storageNames: {
        optional: { options: { nullable: true } },
        isArray: {
            options: { max: 20 },
            errorMessage: 'Puede agregar hasta 20 almacenes por sucursal',
        },
        custom: {
            options: async (names, { req }) => {
                if (!Array.isArray(names)) return true;
                if (names.some(name => typeof name !== 'string' || name.trim().length < 4 || name.trim().length > 174)) {
                    throw new Error('Cada almacén debe tener entre 4 y 174 caracteres');
                }

                const normalized = names.map(name => name.trim().toLocaleUpperCase());
                if (new Set(normalized).size !== normalized.length) {
                    throw new Error('No puede repetir nombres de almacén en la misma solicitud');
                }

                if (req.params.id && normalized.length) {
                    const existingStorages = await Storage.findAll({
                        where: { id_sucursal: req.params.id },
                        attributes: ['name'],
                        raw: true,
                    });
                    const existingNames = new Set(existingStorages.map(storage => String(storage.name || '').trim().toLocaleUpperCase()));
                    if (normalized.some(name => existingNames.has(name))) {
                        throw new Error('El nombre de un almacén ya existe en esta sucursal');
                    }
                }

                return true;
            },
        },
    },
};

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
    checkSchema({ ...validationSchema, ...storageNamesSchema }),
    validatedResponse
];

const getValidateUpdate= [
    checkSchema({
        id: {
            custom: { options: idExistSucursal},
        },
        ...validationSchema,
        ...storageNamesSchema,
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

