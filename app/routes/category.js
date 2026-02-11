const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getCategoryPaginate, newCategory, updateCategory, activeInactiveCategory } = require('../controllers/category.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/category');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Gestión de categorías
 */

/**
 * @swagger
 * /category:
 *   get:
 *     summary: Obtener categorías paginadas
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: Lista de categorías
 */
router.get('/', [
    validarJWT,
], getCategoryPaginate);

/**
 * @swagger
 * /category:
 *   post:
 *     summary: Crear nueva categoría
 *     tags: [Categories]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nombre de la categoría
 *                 example: Metales
 *               description:
 *                 type: string
 *                 description: Descripción de la categoría
 *                 example: Categoría para todo tipo de metales
 *               status:
 *                 type: boolean
 *                 description: Estado de la categoría
 *                 example: true
 *     responses:
 *       201:
 *         description: Categoría creada
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newCategory);

/**
 * @swagger
 * /category/{id}:
 *   put:
 *     summary: Actualizar categoría
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Categoría actualizada
 */
router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
], updateCategory);

/**
 * @swagger
 * /category/destroyAndActive/{id}:
 *   put:
 *     summary: Activar/Desactivar categoría
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado de categoría actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
], activeInactiveCategory);


module.exports = router;