const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistUser, idExistSucursal } = require('./database');

const validationSchema =  {
    sucursales: {
        isArray: {
            bail:true,
            options: {
              min: 1,
            },
        }
    },
    'sucursales.*.id_user': {
        isEmpty: {
            negated: true, errorMessage: "El id_user es obligatorio",
        },
        custom: { options: idExistUser }
    },
    'sucursales.*.id_sucursal': {
        isEmpty: {
            negated: true, errorMessage: "El id_sucursal es obligatorio",
        },
        custom: { options: idExistSucursal }
    },
    'sucursales.*.status': {
        isBoolean: {
            errorMessage: "El estado debe ser de tipo boolean [false, true]",
        }
    }
};

const validateUpdateAssignSucursales = [
    checkSchema(validationSchema),
    validatedResponse
];




module.exports = {
    validateUpdateAssignSucursales,
}

