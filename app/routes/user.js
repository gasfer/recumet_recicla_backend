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


/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Gestión de usuarios
 */

/**
 * @swagger
 * /user:
 *   get:
 *     summary: Obtener usuarios
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Lista de usuarios
 */
router.get('/', [
    validarJWT,
], getUsers);

/**
 * @swagger
 * /user:
 *   post:
 *     summary: Crear nuevo usuario
 *     tags: [Users]
 *     responses:
 *       201:
 *         description: Usuario creado
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newUser);

/**
 * @swagger
 * /user/{id}:
 *   put:
 *     summary: Actualizar usuario
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuario actualizado
 */
router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
], updateUser);

/**
 * @swagger
 * /user/destroyAndActive/{id}:
 *   put:
 *     summary: Activar/Desactivar usuario
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado del usuario actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
], activeInactiveUser);

/**
 * @swagger
 * /user/assign/permissions:
 *   put:
 *     summary: Asignar permisos a usuario
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Permisos asignados
 */
router.put('/assign/permissions', [
    validarJWT,
    toUpperCaseConvert,
    validateAssignPermission
], updateAssignPermissions);

/**
 * @swagger
 * /user/assign/shift:
 *   put:
 *     summary: Asignar turno a usuario
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Turno asignado
 */
router.put('/assign/shift', [
    validarJWT,
    validateUpdateShifts
], updateAssignShift);

/**
 * @swagger
 * /user/assign/sucursales:
 *   put:
 *     summary: Asignar sucursales a usuario
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Sucursales asignadas
 */
router.put('/assign/sucursales', [
    validarJWT,
    validateUpdateAssignSucursales
], updateAssignSucursales);


module.exports = router;