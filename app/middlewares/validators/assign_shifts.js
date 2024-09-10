const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistUser } = require('./database');

const validationSchema =  {
    shifts: {
        isArray: {
            bail:true,
            options: { min: 1 },
        }
    },
    'shifts.*.id_user': {
        isEmpty: {
            negated: true, errorMessage: "El id_user es obligatorio",
        },
        custom: { options: idExistUser }
    },
    'shifts.*.number_day': {
        isEmpty: {
            negated: true, errorMessage: "El number_day es obligatorio",
        },
    },
    'shifts.*.day': {
        isEmpty: {
            negated: true, errorMessage: "El dia es obligatorio en la lista",
        }
    },
    'shifts.*.hour_start': {
        isEmpty: {
            negated: true, errorMessage: "El hour_start es obligatorio en la lista",
        }
    },
    'shifts.*.hour_end': {
        isEmpty: {
            negated: true, errorMessage: "El hour_end es obligatorio en la lista",
        }
    },
    'shifts.*.status': {
        isBoolean: {
            errorMessage: "El estado debe ser de tipo boolean [false, true]",
        }
    }
};

const validateUpdateShifts = [
    checkSchema(validationSchema),
    validatedResponse
];




module.exports = {
    validateUpdateShifts,
}

