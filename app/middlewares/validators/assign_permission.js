const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistUser } = require('./database');

const validationSchema =  {
    permissions: {
        isArray: {
            bail:true,
            options: {
              min: 1,
            },
        }
    },
    'permissions.*.id_user': {
        isEmpty: {
            negated: true, errorMessage: "El id_user es obligatorio",
        },
        custom: { options: idExistUser }
    },
    'permissions.*.module': {
        isEmpty: {
            negated: true, errorMessage: "El modulo es obligatorio en la lista",
        }
    },
    'permissions.*.view': {
        isBoolean: {
            errorMessage: "El ver debe ser de tipo boolean [false, true]",
        }
    },
    'permissions.*.create': {
        isBoolean: {
            errorMessage: "El crear debe ser de tipo boolean [false, true]",
        }
    },
    'permissions.*.update': {
        isBoolean: {
            errorMessage: "El update debe ser de tipo boolean [false, true]",
        }
    },
    'permissions.*.delete': {
        isBoolean: {
            errorMessage: "El delete debe ser de tipo boolean [false, true]",
        }
    },
    'permissions.*.reports': {
        isBoolean: {
            errorMessage: "El reports debe ser de tipo boolean [false, true]",
        }
    },
    'permissions.*.status': {
        isBoolean: {
            errorMessage: "El estado debe ser de tipo boolean [false, true]",
        }
    }
};

const validateAssignPermission = [
    checkSchema(validationSchema),
    validatedResponse
];




module.exports = {
    validateAssignPermission,
}

