const { validatedResponse } = require('../validated-response');
const { checkSchema } = require('express-validator');
const { idExistUser } = require('./database');
const {
    PRODUCT_CATEGORY_TYPES,
    PRODUCT_ACCESS_MODULES,
} = require('../../constants/product-category-access');

const validationSchema =  {
    permissions: {
        isArray: {
            bail:true,
            options: {
              min: 1,
            },
        },
        custom: {
            options: (permissions) => {
                const modules = permissions.map(permission => permission.module);
                if (new Set(modules).size !== modules.length) {
                    throw new Error('No se permiten módulos duplicados en la asignación.');
                }
                const userIds = permissions.map(permission => Number(permission.id_user));
                if (new Set(userIds).size !== 1) {
                    throw new Error('Todos los permisos deben pertenecer al mismo usuario.');
                }
                return true;
            }
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
    'permissions.*.allowed_category_types': {
        optional: true,
        custom: {
            options: (types, { req, path }) => {
                if (!Array.isArray(types)) {
                    throw new Error('Los tipos de categoría permitidos deben ser una lista.');
                }
                const index = Number(path.match(/permissions\[(\d+)\]/)?.[1]);
                const module = req.body.permissions?.[index]?.module;
                if (!PRODUCT_ACCESS_MODULES.includes(module) && types.length > 0) {
                    throw new Error('El módulo no admite permisos por tipo de categoría.');
                }
                if (new Set(types).size !== types.length) {
                    throw new Error('No se permiten tipos de categoría duplicados.');
                }
                if (types.some(type => !PRODUCT_CATEGORY_TYPES.includes(type))) {
                    throw new Error('Existe un tipo de categoría no válido.');
                }
                return true;
            }
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

