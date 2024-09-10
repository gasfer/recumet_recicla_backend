const { Router } = require('express');
const { validateDelete, getValidateCreate, getValidateUpdate } = require('../middlewares/validators/user');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const { validarIsAdmin } = require('../middlewares/validators/validar-is-admin');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getUsers, newUser, updateUser, activeInactiveUser, updateAssignPermissions, updateAssignShift, updateAssignSucursales } = require('../controllers/user.controller');
const { validateAssignPermission } = require('../middlewares/validators/assign_permission');
const { validateUpdateShifts } = require('../middlewares/validators/assign_shifts');
const { validateUpdateAssignSucursales } = require('../middlewares/validators/assign_sucursales');

const router = Router();


router.get('/',[
    validarJWT,
    validarIsAdmin
],getUsers );

router.post('/', [
    validarJWT,
    validarIsAdmin,
    toUpperCaseConvert,
    getValidateCreate
],newUser );

router.put('/:id', [
    validarJWT,
    validarIsAdmin,
    toUpperCaseConvert,
    getValidateUpdate
],updateUser );

router.put('/destroyAndActive/:id', [
    validarJWT,
    validarIsAdmin,
    validateDelete
],activeInactiveUser );

router.put('/assign/permissions', [
    validarJWT,
    toUpperCaseConvert,
    validateAssignPermission
],updateAssignPermissions );

router.put('/assign/shift', [
    validarJWT,
    validateUpdateShifts
],updateAssignShift );

router.put('/assign/sucursales', [
    validarJWT,
    validateUpdateAssignSucursales
],updateAssignSucursales );


module.exports = router;