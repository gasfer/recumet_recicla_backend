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
 *     parameters:
 *       - in: query
 *         name: category_type
 *         schema:
 *           type: string
 *           enum: [RAW_MATERIAL, FINISHED_PRODUCT, RESALE_ITEM]
 *         description: Filtrar por tipo de categoría
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Cantidad de elementos por página
 *       - in: query
 *         name: status
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Estado de la categoría
 *       - in: query
 *         name: field_sort
 *         schema:
 *           type: string
 *           default: id
 *         description: Campo para ordenar
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           default: DESC
 *         description: Orden ascendente o descendente (ASC, DESC)
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
 *               type:
 *                 type: string
 *                 enum: [RAW_MATERIAL, FINISHED_PRODUCT, RESALE_ITEM]
 *                 description: Tipo de categoría (RAW_MATERIAL, FINISHED_PRODUCT, RESALE_ITEM)
 *                 example: RAW_MATERIAL
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nombre de la categoría
 *                 example: Metales Editado
 *               description:
 *                 type: string
 *                 description: Descripción de la categoría
 *                 example: Descripción editada
 *               type:
 *                 type: string
 *                 enum: [RAW_MATERIAL, FINISHED_PRODUCT, RESALE_ITEM]
 *                 description: Tipo de categoría
 *                 example: FINISHED_PRODUCT
 *               status:
 *                 type: boolean
 *                 description: Estado de la categoría
 *                 example: true
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: boolean
 *                 description: Nuevo estado de la categoría
 *                 example: false
 *     responses:
 *       200:
 *         description: Estado de categoría actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
], activeInactiveCategory);


module.exports = router;