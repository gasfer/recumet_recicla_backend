const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistScala, idExistStorage, idExistSucursal, idExistBank, idExistProduct, idExistClient, idExistOutput, registryNumberExistOutput } = require('./database');

const validationSchema =  {
    output_data: {
        isObject: true,
        isEmpty: {
            negated: true, errorMessage: "La venta es obligatorio",
        },
        errorMessage: 'El objeto de output_data debe ser un objecto valido con datos de la venta'
    },
    'output_data.type_voucher': {
        isIn: { options: [['FACTURA', 'PREVENTA']], errorMessage: 'Seleccione FACTURA o PREVENTA como comprobante.' },
    },
    'output_data.type_registry': {
        isEmpty: {
            negated: true, errorMessage: "El tipo de registro es obligatorio",
        },
    },
    'output_data.date_output': {
        notEmpty: { errorMessage: 'Indique la fecha y hora de la venta.' },
        isISO8601: { bail: true, options: { strict: true }, errorMessage: 'La fecha de venta no es válida. Selecciónela nuevamente en el calendario.' },
    },
   'output_data.number_registry': {
    custom: {
        options: async (value, { req }) => {

            const typeRegistry = req.body.output_data?.type_registry;

            // ✅ SIN FICHA → NO VALIDAR
            if (typeRegistry === 'SIN FICHA') {
                return true;
            }

            // ✅ BOLETA / FICHA → obligatorio
            if (!value || value.trim() === '') {
                throw new Error('El número de registro es obligatorio');
            }

            // ✅ validar duplicados
            return await registryNumberExistOutput(value, { req });
        }
    },
    isLength: { options: { max: 50 }, errorMessage: 'El número de ficha o boleta no puede superar 50 caracteres.' },
},
    'output_data.id_scale': {
        notEmpty: { errorMessage: 'Seleccione la balanza utilizada para el pesaje.' },
        custom: { options: idExistScala },
    },
    'output_data.id_sucursal': {
        notEmpty: { errorMessage: 'No se identificó la sucursal de la venta. Actualice el contexto de trabajo.' },
        custom: { options: idExistSucursal },
    },
    'output_data.id_storage': {
        notEmpty: { errorMessage: 'Seleccione el almacén de salida de los productos.' },
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
        isIn: { options: [['EFECTIVO', 'CHEQUE', 'TRANSFERENCIA']], errorMessage: 'Seleccione efectivo, cheque o transferencia como medio de pago.' },
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

