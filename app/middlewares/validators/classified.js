const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistScala, idExistSucursal, idExistStorage, idExistProduct, idExistClassified } = require('./database');

const validationSchema =  {
    classified_data: {
        isObject: true,
        isEmpty: {
            negated: true, errorMessage: "La clasificación es obligatorio",
        },
        errorMessage: 'El objeto de classified_data debe ser un objecto valido con datos de la clasificación'
    },
    'classified_data.id_scale': {
        custom: { options: idExistScala },
    },
    'classified_data.id_sucursal': {
        custom: { options: idExistSucursal },
    },
    'classified_data.id_storage': {
        custom: { options: idExistStorage },
    },
    'classified_data.id_product': {
        custom: { options: idExistProduct },
    },
    'classified_data.type_registry': {
        isEmpty: {
            negated: true, errorMessage: "El tipo de registro es obligatorio",
        },
    },
    'classified_data.number_registry': {
        isEmpty: {
            negated: true, errorMessage: "El numero de registro es obligatorio",
        },
        optional:{ options: {nullable: true}},
    },
    'classified_data.comments': {
        optional:{ options: {nullable: true}},
        isLength: {
            errorMessage: 'Los comentarios debe tener máximo 500 caracteres',
            options: {  max: 500},
        },
    },
    'classified_data.status': {
        isEmpty: {
            negated: true, errorMessage: "El estado es obligatorio",
        },
    },

    classified_details: {
        isArray: true,
        errorMessage: 'Los detalles son requeridos',
        isLength: {
            errorMessage: 'Mínimo un producto',
            options: { min: 1 },
        },
    },
    'classified_details.*': {
        isObject: true,
        errorMessage: 'El objeto de items debe ser un objecto valido con detalle'
    },
    'classified_details.*.quantity': {
        isEmpty: {
            negated: true, errorMessage: "La cantidad es necesario",
        },
        isDecimal: {
            bail: true, errorMessage: "tiene que ser un valor numérico",
        },
    },
    'classified_details.*.cost': {
        isEmpty: {
            negated: true, errorMessage: "El costo es necesario",
        },
        isDecimal: {
            bail: true, errorMessage: "El costo tiene que ser un valor numérico",
        },
    },
    'classified_details.*.id_product': {
        custom: { options: idExistProduct },
    },
    'classified_details.*.status': {
        isEmpty: {
            negated: true, errorMessage: "El estado es obligatorio",
        },
    },
};

const getValidateCreate = [
    checkSchema(validationSchema),
    validatedResponse
];


const validateIdClassified = [
    checkSchema({
        id_classified: { custom: { options: idExistClassified} },
    }),
    validatedResponse
]


module.exports = {
    getValidateCreate,
    validateIdClassified
}

