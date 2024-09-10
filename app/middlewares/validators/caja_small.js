const {response} = require('express');
const { CajaSmall } = require('../../database/config');
const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistSucursal, idExistBank } = require('./database');
const { whereDateForType } = require('../../helpers/where_range');

const validationSchema =  {
    monto_apertura: {
        in: ['body'],
        isFloat: {
            options: { min: 0 },
            errorMessage: 'El monto de apertura mínimo de 0'
        },
        isDecimal: {
            bail: true, errorMessage: "El monto de apertura tiene que ser un valor numérico",
        },
    },
    id_sucursal: {
        in: ['body'],
        custom: { options: idExistSucursal },
    }
};
const validationSchemaClose =  {
    monto_cierre: {
        in: ['body'],
        isFloat: {
            options: { min: 0 },
            errorMessage: 'El monto de apertura mínimo de 0'
        },
        isDecimal: {
            bail: true, errorMessage: "El monto de apertura tiene que ser un valor numérico",
        },
    },
    id_sucursal: {
        in: ['body'],
        custom: { options: idExistSucursal },
    }
};

const validationSchemaDetail =  {
    type_payment: {
        isEmpty: {
            negated: true, errorMessage: "El tipo de pago es obligatorio",
        },
        isIn: {
            options: [["EFECTIVO", "CHEQUE","TRASFERENCIA"]],
            errorMessage: "El tipo es invalido permitidos: ['EFECTIVO,CHEQUE,TRASFERENCIA']"
        }
    },
    type: {
        isEmpty: {
            negated: true, errorMessage: "El tipo es obligatorio",
        },
        isIn: {
            options: [["GASTO","INGRESO"]],
            errorMessage: "El tipo es invalido permitidos: ['GASTO','INGRESO']"
        }
    },
    id_bak: {
        optional:{ options: {nullable: true}},
        custom: { options: idExistBank },
    },
    account_payment: {
        optional:{ options: {nullable: true}},
        isLength: {
            errorMessage: 'La descripcion debe tener mínimo a 2 caracteres y máximo 175 caracteres',
            options: { min: 2, max: 175},
        },
    },
    description: {
        isEmpty: {
            negated: true, errorMessage: "La descripcion es obligatorio",
        },
        isLength: {
            errorMessage: 'La descripcion debe tener mínimo a 2 caracteres y máximo 255 caracteres',
            options: { min: 2, max: 255},
        },
    },
    monto: {
        isFloat: {
            options: { min: 0 },
            errorMessage: 'El monto mínimo de 0'
        },
        isDecimal: {
            bail: true, errorMessage: "El monto tiene que ser un valor numérico",
        },
    },
    id_sucursal: {
        custom: { options: idExistSucursal },
    }
};


const getValidateOpen = [
    checkSchema(validationSchema),
    validatedResponse
];
const getValidateClose = [
    checkSchema(validationSchemaClose),
    validatedResponse
];
const getValidateDetail = [
    checkSchema(validationSchemaDetail),
    validatedResponse
];


const validaOpenCajaSmall = async (id_sucursal, id_user) => {
    const whereDate = whereDateForType('DAY',new Date());
    const open_caja_small = await CajaSmall.findOne({
        where:{
            id_user, id_sucursal,
            date_apertura: whereDate, status: 'ABIERTO'
        }
    });
    return open_caja_small;
}
// const validaOpenCajaSmall = (id_sucursal) => {
//     return async (req, res = response, next) => {
//         const user = req.userAuth;
//         if(!user){
//             return res.status(401).json({
//                 ok: false,
//                 errors: [{ msg: `Introduce el token en los headers | Authorization`}],
//             });
//         }
        
//         next();
//     }
// }

module.exports = {
    validaOpenCajaSmall,
    getValidateOpen,
    getValidateClose,
    getValidateDetail
}