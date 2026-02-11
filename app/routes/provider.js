const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getProviderPaginate, newProvider, updateProvider, activeInactiveProvider, getAllSectorProvider, newSectorProvider, deleteSectorProvider, getProviderByProductPaginate, getAllTypesProvider } = require('../controllers/provider.controller');
const { getValidateCreate, getValidateUpdate, validateDelete, getValidateCreateSector, validateDeleteSector } = require('../middlewares/validators/provider');
const { generateExcelProviders } = require('../controllers/reports/providers.controller');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Providers
 *   description: Gestión de proveedores
 */

/**
 * @swagger
 * /provider:
 *   get:
 *     summary: Obtener proveedores paginados
 *     tags: [Providers]
 *     responses:
 *       200:
 *         description: Lista de proveedores
 */
router.get('/', [
    validarJWT,
], getProviderPaginate);

/**
 * @swagger
 * /provider/product:
 *   get:
 *     summary: Obtener proveedores por producto
 *     tags: [Providers]
 *     responses:
 *       200:
 *         description: Lista de proveedores
 */
router.get('/product', [
    validarJWT,
], getProviderByProductPaginate);

/**
 * @swagger
 * /provider:
 *   post:
 *     summary: Crear nuevo proveedor
 *     tags: [Providers]
 *     responses:
 *       201:
 *         description: Proveedor creado
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newProvider);

/**
 * @swagger
 * /provider/{id}:
 *   put:
 *     summary: Actualizar proveedor
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Proveedor actualizado
 */
router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
], updateProvider);

/**
 * @swagger
 * /provider/destroyAndActive/{id}:
 *   put:
 *     summary: Activar/Desactivar proveedor
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado del proveedor actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
], activeInactiveProvider);

/**
 * @swagger
 * /provider/sectors:
 *   get:
 *     summary: Obtener sectores de proveedores
 *     tags: [Providers]
 *     responses:
 *       200:
 *         description: Lista de sectores
 */
router.get('/sectors', [
    validarJWT,
], getAllSectorProvider);

/**
 * @swagger
 * /provider/sector:
 *   post:
 *     summary: Crear nuevo sector
 *     tags: [Providers]
 *     responses:
 *       201:
 *         description: Sector creado
 */
router.post('/sector', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreateSector
], newSectorProvider);

/**
 * @swagger
 * /provider/sector/destroy/{id}:
 *   delete:
 *     summary: Eliminar sector
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sector eliminado
 */
router.delete('/sector/destroy/:id', [
    validarJWT,
    validateDeleteSector
], deleteSectorProvider);

/**
 * @swagger
 * /provider/types:
 *   get:
 *     summary: Obtener tipos de proveedores
 *     tags: [Providers]
 *     responses:
 *       200:
 *         description: Lista de tipos
 */
router.get('/types', [
    validarJWT,
], getAllTypesProvider);

//reports
router.get('/excel', [
    validarJWT,
], generateExcelProviders);

module.exports = router;