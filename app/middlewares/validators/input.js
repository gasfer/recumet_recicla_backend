const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistScala, idExistStorage, idExistProvider, idExistSucursal, idExistBank, idExistProduct, idExistInput } = require('./database');

const validationSchema =  {
    input_data: {
        isObject: true,
        isEmpty: {
            negated: true, errorMessage: "La compra es obligatorio",
        },
        errorMessage: 'El objeto de input_data debe ser un objecto valido con datos de la compra'
    },
    'input_data.date_voucher': {
        optional:{ options: {nullable: true}},
        isISO8601: {
            errorMessage: 'El fecha del voucher no tiene el formato correcto, enviar con formato ISO8601',
        }
    },
    'input_data.type_payment': {
        isEmpty: {
            negated: true, errorMessage: "El tipo de pago es obligatorio",
        },
    },
    'input_data.type_registry': {
        isEmpty: {
            negated: true, errorMessage: "El tipo de registro es obligatorio",
        },
    },
    'input_data.registry_number': {
        isEmpty: {
            negated: true, errorMessage: "El numero de registro es obligatorio",
        },
    },
    'input_data.account_input': {
        isLength: {
            errorMessage: 'La cuenta debe tener máximo 20 caracteres',
            options: {  max: 20},
        },
    },
    'input_data.pay_to_credit': {
        isBoolean: {
            errorMessage: "Si es pago a crédito debe ser de tipo boolean [false, true]",
        }
    },
    'input_data.on_account': {
        isDecimal: {
            bail: true, errorMessage: "El monto a cuenta tiene que ser un valor numérico",
        },
    },
    'input_data.comments': {
        optional:{ options: {nullable: true}},
        isLength: {
            errorMessage: 'Los comentarios debe tener máximo 500 caracteres',
            options: {  max: 500},
        },
    },
    'input_data.discount': {
        isDecimal: {
            bail: true, errorMessage: "El descuento tiene que ser un valor numérico",
        },
    },
    'input_data.sumas': {
        isDecimal: {
            bail: true, errorMessage: "El total sumas tiene que ser un valor numérico",
        },
    },
    'input_data.total': {
        isDecimal: {
            bail: true, errorMessage: "El total tiene que ser un valor numérico",
        },
    },
    'input_data.is_paid': {
        isEmpty: {
            negated: true, errorMessage: "El is_paid pago es obligatorio",
        },
    },
    'input_data.id_scales': {
        custom: { options: idExistScala },
    },
    'input_data.id_storage': {
        custom: { options: idExistStorage },
    },
    'input_data.id_provider': {
        custom: { options: idExistProvider },
    },
    'input_data.id_bank': {
        optional:{ options: {nullable: true}},
        custom: { options: idExistBank },
    },
    'input_data.id_sucursal': {
        custom: { options: idExistSucursal },
    },
    'input_data.status': {
        isEmpty: {
            negated: true, errorMessage: "El estado es obligatorio",
        },
    },
    input_details: {
        isArray: true,
        errorMessage: 'Los detalles son requeridos',
        isLength: {
            errorMessage: 'Mínimo un producto',
            options: { min: 1 },
        },
    },
    'input_details.*': {
        isObject: true,
        errorMessage: 'El objeto de items debe ser un objecto valido con detalle'
    },
    'input_details.*.quantity': {
        isEmpty: {
            negated: true, errorMessage: "La cantidad es necesario",
        },
        isDecimal: {
            bail: true, errorMessage: "El total sumas tiene que ser un valor numérico",
        },
    },
    'input_details.*.cost': {
        isEmpty: {
            negated: true, errorMessage: "El costo es necesario",
        },
        isDecimal: {
            bail: true, errorMessage: "El costo tiene que ser un valor numérico",
        },
    },
    'input_details.*.total': {
        isEmpty: {
            negated: true, errorMessage: "El total es necesario",
        },
        isDecimal: {
            bail: true, errorMessage: "El total sumas tiene que ser un valor numérico",
        },
    },
    'input_details.*.id_product': {
        custom: { options: idExistProduct },
    },
    'input_details.*.status': {
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
        id_input: {
            custom: { options: idExistInput},
        },
        ...validationSchema
    }),
    validatedResponse
];

const validateIdInput = [
    checkSchema({
        id_input: { custom: { options: idExistInput} },
    }),
    validatedResponse
]


module.exports = {
    getValidateCreate,
    getValidateUpdate,
    validateIdInput
}

