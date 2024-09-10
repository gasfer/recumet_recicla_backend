const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistUnit, idExistCategory, idExistProduct, nameExistProduct, codeExistProduct, idExistPrice, idExistSucursal } = require('./database');

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
        custom: { options: nameExistProduct }
    },
    cod: {
        optional: true,
        isLength: {
            errorMessage: 'El código debe tener máximo 74 caracteres',
            options: { max: 74 },
        },
        custom: { options: codeExistProduct }
    },
    description: {
        isLength: {
            errorMessage: 'La descripcion debe tener máximo 254 caracteres',
            options: {  max: 254},
        },
    },
    costo: {
        isEmpty: {
            negated: true, errorMessage: "El costo es obligatorio",
        }, 
        isFloat: {
            errorMessage: 'El costo debe tener un costo mínimo de 0.1 y de tipo number',
            options: {
              min: 0,
            },
        }
    },
    precio_venta: {
        optional: true,
    },
    margen_utilidad: {
        optional: true,
    },
    inventariable: {
        isBoolean: {
            errorMessage: "El inventariable debe ser de tipo boolean [false, true]",
        }
    },
    id_category: {
        isEmpty: {
            negated: true, errorMessage: "El id categoría es obligatorio",
        },
        custom: { options: idExistCategory }
    },
    id_sucursal: {
        custom: { options: idExistSucursal },
    },
    id_unit: {
        isEmpty: {
            negated: true, errorMessage: "El id unidad es obligatorio",
        },
        custom: { options: idExistUnit }
    },
    status: {
        isBoolean: {
            errorMessage: "El estado debe ser de tipo boolean [false, true]",
        }
    }
};

const validationSchemaPrice = {
    name: {
        isEmpty: {
            negated: true, errorMessage: "El nombre es obligatorio",
        },
        isLength: {
            errorMessage: 'El nombre debe tener mínimo a 2 caracteres y máximo 20 caracteres',
            options: { min: 2, max: 20},
        },
    },
    price: {
        isNumeric: {
            errorMessage: "EL precio debe ser un valor numérico", bail: true,
        },
        isEmpty: {
            negated: true, errorMessage: "El precio de venta es obligatorio",
        }, 
    },
    profit_margin: {
        isNumeric: {
            errorMessage: "EL margen de utilidad debe ser un valor numérico", bail: true,
        },
        isEmpty: {
            negated: true, errorMessage: "El margen de utilidad es obligatorio",
        },    
    },
    id_product: {
        isEmpty: {
            negated: true, errorMessage: "El id producto es obligatorio",
        },
        custom: { options: idExistProduct} 
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
            custom: { options: idExistProduct},
        },
        ...validationSchema
    }),
    validatedResponse
];

const validateDelete = [
    checkSchema({
        id: { custom: { options: idExistProduct} },
        status: {
            isBoolean: {
                errorMessage: "El estado debe ser de tipo boolean [false, true]",
            }
        }
    }),
    validatedResponse
]

const validateDeletePrice = [
    checkSchema({
        id: { custom: { options: idExistPrice} },
    }),
    validatedResponse
]

const getValidateCreatePrice = [
    checkSchema(validationSchemaPrice),
    validatedResponse
];


module.exports = {
    getValidateCreate,
    getValidateUpdate,
    validateDelete,
    getValidateCreatePrice,
    validateDeletePrice
}

