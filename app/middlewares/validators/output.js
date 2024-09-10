const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistScala, idExistStorage, idExistSucursal, idExistBank, idExistProduct, idExistClient, idExistOutput } = require('./database');

const validationSchema =  {
    output_data: {
        isObject: true,
        isEmpty: {
            negated: true, errorMessage: "La venta es obligatorio",
        },
        errorMessage: 'El objeto de output_data debe ser un objecto valido con datos de la venta'
    },
    'output_data.type_voucher': {
        isEmpty: {  negated: true, errorMessage: "El tipo de voucher es obligatorio" },
    },
    'output_data.type_registry': {
        isEmpty: {
            negated: true, errorMessage: "El tipo de registro es obligatorio",
        },
    },
    'output_data.number_registry': {
        isEmpty: {
            negated: true, errorMessage: "El numero de registro es obligatorio",
        },
        optional:{ options: {nullable: true}},
    },
    'output_data.id_scale': {
        custom: { options: idExistScala },
    },
    'output_data.id_sucursal': {
        custom: { options: idExistSucursal },
    },
    'output_data.id_storage': {
        custom: { options: idExistStorage },
    },
    'output_data.pay_to_credit': {
        isBoolean: {
            errorMessage: "Si es pago a crédito debe ser de tipo boolean [false, true]",
        }
    },
    'output_data.on_account': {
        isDecimal: {
            bail: true, errorMessage: "El monto a cuenta tiene que ser un valor numérico",
        },
    },
    'output_data.sub_total': {
        isDecimal: {
            bail: true, errorMessage: "El total sumas tiene que ser un valor numérico",
        },
    },
    'output_data.discount': {
        isDecimal: {
            bail: true, errorMessage: "El descuento tiene que ser un valor numérico",
        },
    },
    'output_data.total': {
        isDecimal: {
            bail: true, errorMessage: "El total tiene que ser un valor numérico",
        },
    },
    'output_data.type_payment': {
        isEmpty: {  negated: true, errorMessage: "El tipo de pago es obligatorio" },
    },
    'output_data.comments': {
        optional:{ options: {nullable: true}},
        isLength: {
            errorMessage: 'Los comentarios debe tener máximo 500 caracteres',
            options: {  max: 500},
        },
    },
    'output_data.id_bank': {
        optional:{ options: {nullable: true}},
        custom: { options: idExistBank },
    },
    'output_data.account_output': {
        isLength: {
            errorMessage: 'La cuenta debe tener máximo 20 caracteres',
            options: {  max: 20},
        },
    }, 
    'output_data.id_client': {
        optional:{ options: {nullable: true}},
        custom: { options: idExistClient },
    },
    'output_data.status': {
        isEmpty: {
            negated: true, errorMessage: "El estado es obligatorio",
        },
    },
    output_details: {
        isArray: true,
        errorMessage: 'Los detalles son requeridos',
        isLength: {
            errorMessage: 'Mínimo un producto',
            options: { min: 1 },
        },
    },
    'output_details.*': {
        isObject: true,
        errorMessage: 'El objeto de items debe ser un objecto valido con detalle'
    },
    'output_details.*.quantity': {
        isEmpty: {
            negated: true, errorMessage: "La cantidad es necesario",
        },
        isDecimal: {
            bail: true, errorMessage: "tiene que ser un valor numérico",
        },
    },
    'output_details.*.cost': {
        isEmpty: {
            negated: true, errorMessage: "El costo es necesario",
        },
        isDecimal: {
            bail: true, errorMessage: "tiene que ser un valor numérico",
        },
    },
    'output_details.*.price': {
        isEmpty: {
            negated: true, errorMessage: "El precio es necesario",
        },
        isDecimal: {
            bail: true, errorMessage: "tiene que ser un valor numérico",
        },
    },
    'output_details.*.total': {
        isEmpty: {
            negated: true, errorMessage: "El total es necesario",
        },
        isDecimal: {
            bail: true, errorMessage: "El total sumas tiene que ser un valor numérico",
        },
    },
    'output_details.*.id_product': {
        custom: { options: idExistProduct },
    },
    'output_details.*.status': {
        isEmpty: {
            negated: true, errorMessage: "El estado es obligatorio",
        },
    },
};

const getValidateCreate = [
    checkSchema(validationSchema),
    validatedResponse
];

const getValidateUpdate= [
    checkSchema({
        id_output: {
            custom: { options: idExistOutput},
        },
        ...validationSchema
    }),
    validatedResponse
];

const validateIdOutput = [
    checkSchema({
        id_output: { custom: { options: idExistOutput} },
    }),
    validatedResponse
]


module.exports = {
    getValidateCreate,
    getValidateUpdate,
    validateIdOutput
}

