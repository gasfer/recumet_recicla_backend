const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getClientPaginate, newClient, updateClient, activeInactiveClient } = require('../controllers/client.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/client');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Clients
 *   description: Gestión de clientes
 */

/**
 * @swagger
 * /client:
 *   get:
 *     summary: Obtener clientes paginados
 *     tags: [Clients]
 *     responses:
 *       200:
 *         description: Lista de clientes
 */
router.get('/', [
    validarJWT,
], getClientPaginate);

/**
 * @swagger
 * /client:
 *   post:
 *     summary: Crear nuevo cliente
 *     tags: [Clients]
 *     responses:
 *       201:
 *         description: Cliente creado
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newClient);

/**
 * @swagger
 * /client/{id}:
 *   put:
 *     summary: Actualizar cliente
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cliente actualizado
 */
router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
], updateClient);

/**
 * @swagger
 * /client/destroyAndActive/{id}:
 *   put:
 *     summary: Activar/Desactivar cliente
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado del cliente actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
], activeInactiveClient);


module.exports = router;