const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { nameExistTrasportCompany, idExistTrasportCompany, idExistChauffeur, idExistCargoTruck, placaExistTrasportCompany } = require('./database');

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
        custom: { options: nameExistTrasportCompany }
    },
    nit: {
        isLength: {
            errorMessage: 'El nit debe tener máximo 20 caracteres',
            options: { max: 20},
        },
    },
    city: {
        isLength: {
            errorMessage: 'La ciudad debe tener máximo 174 caracteres',
            options: { max: 174},
        },
    },
    address: {
        isLength: {
            errorMessage: 'La dirección debe tener máximo 174 caracteres',
            options: { max: 174},
        },
    },
    status: {
        isBoolean: {
            errorMessage: "El estado debe ser de tipo boolean [false, true]",
        }
    }
};
const validationSchemaChauffeur = {
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
        isLength: {
            errorMessage: 'El numero de carnet o nit debe tener máximo 20 caracteres',
            options: { max: 20},
        },
    },
    id_trasport_company: {
        custom: { options: idExistTrasportCompany},
    },
    status: {
        isBoolean: {
            errorMessage: "El estado debe ser de tipo boolean [false, true]",
        }
    }
};

const validationSchemaCargoTruck = {
    placa: {
        isEmpty: {
            negated: true, errorMessage: "El nombre es obligatorio",
        },
        isInt: {
            bail: true, negated: true, errorMessage: "El nombre tiene que ser un valor alfabético",
        },
        isLength: {
            errorMessage: 'El nombre debe tener mínimo a 2 caracteres y máximo 25 caracteres',
            options: { min: 2, max: 25},
        },
        custom: { options: placaExistTrasportCompany},
    },
    id_trasport_company: {
        custom: { options: idExistTrasportCompany},
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

const getValidateCreateChauffeur = [
    checkSchema(validationSchemaChauffeur),
    validatedResponse
];

const getValidateCreateCargoTruck = [
    checkSchema(validationSchemaCargoTruck),
    validatedResponse
];

const getValidateUpdate= [
    checkSchema({
        id: {
            custom: { options: idExistTrasportCompany},
        },
        ...validationSchema
    }),
    validatedResponse
];

const validateDelete = [
    checkSchema({
        id: { custom: { options: idExistTrasportCompany} },
        status: {
            isBoolean: {
                errorMessage: "El estado debe ser de tipo boolean [false, true]",
            }
        }
    }),
    validatedResponse
]

const validateDeleteCargoTruck = [
    checkSchema({
        id: { custom: { options: idExistCargoTruck} },
    }),
    validatedResponse
]

const validateDeleteChauffeur = [
    checkSchema({
        id: { custom: { options: idExistChauffeur} },
    }),
    validatedResponse
]


module.exports = {
    getValidateCreate,
    getValidateUpdate,
    validateDelete,
    validateDeleteChauffeur,
    getValidateCreateChauffeur,
    getValidateCreateCargoTruck,
    validateDeleteCargoTruck
}

