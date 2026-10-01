const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { nameExistProvider, idExistProvider, idExistCategory, idExistSector, nameExistSector, idTypeProvider, numberDocumentExistClient, numberDocumentExistProvider } = require('./database');

const validationSchema =  {
    full_names: {
        isInt: {
            bail: true, negated: true, errorMessage: "El nombre tiene que ser un valor alfabético",
        },
        isLength: {
            errorMessage: 'El nombre debe tener máximo 174 caracteres',
            options: {  max: 174},
        },
        custom: { options: nameExistProvider }
    },
    number_document: {
        custom: { options: numberDocumentExistProvider }
    },
    id_sector: {
        optional: { options: { nullable: true } },
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

const getValidatePreRegister = [
    checkSchema({
        full_names: {
            trim: true,
            notEmpty: { errorMessage: 'La razón social es obligatoria' },
            isLength: { options: { max: 174 }, errorMessage: 'La razón social debe tener máximo 174 caracteres' },
        },
        number_document: { optional: true, trim: true, isLength: { options: { max: 80 }, errorMessage: 'El CI / NIT debe tener máximo 80 caracteres' } },
        cellphone: { optional: true, trim: true, isLength: { options: { max: 30 }, errorMessage: 'El celular debe tener máximo 30 caracteres' } },
        id_sector: { optional: { options: { nullable: true } }, isInt: { errorMessage: 'El sector no es válido' } },
        id_category: { optional: { options: { nullable: true } }, isInt: { errorMessage: 'La categoría no es válida' } },
    }),
    validatedResponse,
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
        ...validationSchema,
        full_names: {
            trim: true,
            notEmpty: { errorMessage: 'La razón social es obligatoria' },
            isLength: { options: { min: 2, max: 174 }, errorMessage: 'La razón social debe tener entre 2 y 174 caracteres' },
            custom: { options: nameExistProvider },
        },
        number_document: {
            optional: { options: { nullable: true } },
            trim: true,
            isLength: { options: { max: 80 }, errorMessage: 'El CI / NIT debe tener máximo 80 caracteres' },
            custom: { options: numberDocumentExistProvider },
        },
        cellphone: { optional: { options: { nullable: true } }, isLength: { options: { max: 30 }, errorMessage: 'El celular debe tener máximo 30 caracteres' } },
        direction: { optional: { options: { nullable: true } }, isLength: { options: { max: 254 }, errorMessage: 'La dirección debe tener máximo 254 caracteres' } },
        commercial_name: { optional: { options: { nullable: true } }, trim: true, isLength: { options: { max: 174 }, errorMessage: 'El nombre comercial debe tener máximo 174 caracteres' } },
        commercial_observations: { optional: { options: { nullable: true } }, isLength: { options: { max: 2000 }, errorMessage: 'Las observaciones comerciales deben tener máximo 2000 caracteres' } },
        general_observations: { optional: { options: { nullable: true } }, isLength: { options: { max: 2000 }, errorMessage: 'Las observaciones generales deben tener máximo 2000 caracteres' } },
        contact_email: { optional: { options: { nullable: true, checkFalsy: true } }, isEmail: { errorMessage: 'El correo de contacto no es válido' } },
        department: { optional: { options: { nullable: true } }, isLength: { options: { max: 120 }, errorMessage: 'El departamento debe tener máximo 120 caracteres' } },
        province: { optional: { options: { nullable: true } }, isLength: { options: { max: 120 }, errorMessage: 'La provincia debe tener máximo 120 caracteres' } },
        city: { optional: { options: { nullable: true } }, isLength: { options: { max: 120 }, errorMessage: 'La ciudad debe tener máximo 120 caracteres' } },
        zone: { optional: { options: { nullable: true } }, isLength: { options: { max: 120 }, errorMessage: 'La zona debe tener máximo 120 caracteres' } },
        latitude: { optional: { options: { nullable: true, checkFalsy: true } }, isFloat: { options: { min: -90, max: 90 }, errorMessage: 'La latitud no es válida' } },
        longitude: { optional: { options: { nullable: true, checkFalsy: true } }, isFloat: { options: { min: -180, max: 180 }, errorMessage: 'La longitud no es válida' } },
        geolocation_text: { optional: { options: { nullable: true } }, isLength: { options: { max: 500 }, errorMessage: 'La referencia geográfica debe tener máximo 500 caracteres' } },
        google_maps_url: { optional: { options: { nullable: true, checkFalsy: true } }, isURL: { errorMessage: 'El enlace de Google Maps no es válido' }, isLength: { options: { max: 1000 }, errorMessage: 'El enlace de Google Maps debe tener máximo 1000 caracteres' } },
        account_holder: { optional: { options: { nullable: true } }, isLength: { options: { max: 174 }, errorMessage: 'El titular de cuenta debe tener máximo 174 caracteres' } },
        account_number: { optional: { options: { nullable: true } }, isLength: { options: { max: 100 }, errorMessage: 'El número de cuenta debe tener máximo 100 caracteres' } },
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
    getValidatePreRegister,
    getValidateUpdate,
    validateDelete,
    getValidateCreateSector,
    validateDeleteSector
}

