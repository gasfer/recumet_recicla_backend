const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistStorage, idExistSucursal, idExistProduct, idExistTransfer, idExistTransferPending } = require('./database');

const validationSchema =  {
    transfer_data: {
        isObject: true,
        isEmpty: {
            negated: true, errorMessage: "El traslado es obligatorio",
        },
        errorMessage: 'El objeto de transfer_data debe ser un objecto valido con datos del traslado'
    },
    'transfer_data.observations_send': {
        optional:{ options: {nullable: true}},
        isLength: {
            errorMessage: 'Los comentarios debe tener máximo 500 caracteres',
            options: {  max: 500},
        },
    },
    'transfer_data.total': {
        isDecimal: {
            bail: true, errorMessage: "El total tiene que ser un valor numérico",
        },
    },
    'transfer_data.id_sucursal_send': {
        custom: { options: idExistSucursal },
    },
    'transfer_data.id_storage_send': {
        custom: { options: idExistStorage },
    },
    'transfer_data.id_sucursal_received': {
        custom: { options: idExistSucursal },
    },
    transfer_details: {
        isArray: true,
        errorMessage: 'Los detalles son requeridos',
        isLength: {
            errorMessage: 'Mínimo un producto',
            options: { min: 1 },
        },
    },
    'transfer_details.*': {
        isObject: true,
        errorMessage: 'El objeto de items debe ser un objecto valido con detalle'
    },
    'transfer_details.*.quantity': {
        isEmpty: {
            negated: true, errorMessage: "La cantidad es necesario",
        },
        isDecimal: {
            bail: true, errorMessage: "tiene que ser un valor numérico",
        },
    },
    'transfer_details.*.cost': {
        isEmpty: {
            negated: true, errorMessage: "El costo es necesario",
        },
        isDecimal: {
            bail: true, errorMessage: "tiene que ser un valor numérico",
        },
    },
    'transfer_details.*.total': {
        isEmpty: {
            negated: true, errorMessage: "El total es necesario",
        },
        isDecimal: {
            bail: true, errorMessage: "El total sumas tiene que ser un valor numérico",
        },
    },
    'transfer_details.*.id_product': {
        custom: { options: idExistProduct },
    },
    'transfer_details.*.status': {
        isEmpty: {
            negated: true, errorMessage: "El estado es obligatorio",
        },
    },
};
const validationSchemaReceived =  {
    id_transfer: {
        custom: { options: idExistTransfer },
    },
    observations_received: {
        optional:{ options: {nullable: true}},
        isLength: {
            errorMessage: 'Los comentarios debe tener máximo 500 caracteres',
            options: {  max: 500},
        },
    },
    id_storage_received: {
        custom: { options: idExistStorage },
    },
};

const getValidateCreate = [
    checkSchema(validationSchema),
    validatedResponse
];

const getValidateReceived = [
    checkSchema(validationSchemaReceived),
    validatedResponse
];

const validateIdTransferPending = [
    checkSchema({
        id_transfer: { custom: { options: idExistTransferPending} },
    }),
    validatedResponse
]

const validateIdTransfer = [
    checkSchema({
        id_transfer: { custom: { options: idExistTransfer} },
    }),
    validatedResponse
]


module.exports = {
    getValidateCreate,
    validateIdTransferPending,
    getValidateReceived,
    validateIdTransfer
}

