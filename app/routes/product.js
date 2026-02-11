const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const expressfileUpload = require('express-fileupload');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getProductPaginate, newProduct, updateProduct, activeInactiveProduct, newPriceProduct, deletePriceProduct, uploadFileProduct, getOneProductSucursal, productAssignatSucursals, getProductCostsSucursal, updateProductsCostos, getOneProduct } = require('../controllers/product.controller');
const { getValidateCreate, getValidateUpdate, validateDelete, getValidateCreatePrice, validateDeletePrice } = require('../middlewares/validators/product');
const { filesExist, validateUploadIdProduct, filesValidateSize } = require('../middlewares/validators/validar-files');
const { validatedResponse } = require('../middlewares/validated-response');
const { generateExcelReportsPricesProduct, generatePdfReports } = require('../controllers/reports/products.controller');

const router = Router();
router.use(expressfileUpload());

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Gestión de productos
 */

/**
 * @swagger
 * /product:
 *   get:
 *     summary: Obtener productos paginados
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Lista de productos
 */
router.get('/', [
    validarJWT,
], getProductPaginate);

/**
 * @swagger
 * /product/product:
 *   get:
 *     summary: Obtener un producto
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Detalle del producto
 */
router.get('/product', [
    validarJWT,
], getOneProduct);

/**
 * @swagger
 * /product/sucursals:
 *   get:
 *     summary: Obtener sucursales asignadas a producto
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Lista de sucursales
 */
router.get('/sucursals', [
    validarJWT,
], getOneProductSucursal);

/**
 * @swagger
 * /product/costs:
 *   get:
 *     summary: Obtener costos por sucursal
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Costos
 */
router.get('/costs', [
    validarJWT,
], getProductCostsSucursal);

/**
 * @swagger
 * /product:
 *   post:
 *     summary: Crear nuevo producto
 *     tags: [Products]
 *     responses:
 *       201:
 *         description: Producto creado
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newProduct);

/**
 * @swagger
 * /product/cost:
 *   post:
 *     summary: Actualizar costos de producto
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Costos actualizados
 */
router.post('/cost', [
    validarJWT,
], updateProductsCostos);

/**
 * @swagger
 * /product/sucursals:
 *   post:
 *     summary: Asignar sucursales a producto
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Sucursales asignadas
 */
router.post('/sucursals', [
    validarJWT,
], productAssignatSucursals);

/**
 * @swagger
 * /product/{id}:
 *   put:
 *     summary: Actualizar producto
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Producto actualizado
 */
router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
], updateProduct);

/**
 * @swagger
 * /product/destroyAndActive/{id}:
 *   put:
 *     summary: Activar/Desactivar producto
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado del producto actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
], activeInactiveProduct);

/**
 * @swagger
 * /product/price:
 *   post:
 *     summary: Agregar precio a producto
 *     tags: [Products]
 *     responses:
 *       201:
 *         description: Precio agregado
 */
router.post('/price', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreatePrice
], newPriceProduct);

/**
 * @swagger
 * /product/price/{id}:
 *   delete:
 *     summary: Eliminar precio de producto
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Precio eliminado
 */
router.delete('/price/:id', [
    validarJWT,
    validateDeletePrice
], deletePriceProduct);

/**
 * @swagger
 * /product/upload/img:
 *   put:
 *     summary: Subir imagen de producto
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Imagen subida
 */
router.put('/upload/img', [
    validarJWT,
    filesExist,
    validateUploadIdProduct,
    filesValidateSize,
    validatedResponse
], uploadFileProduct);

//reports
/**
 * @swagger
 * /product/excel/costs:
 *   get:
 *     summary: Generar reporte Excel de costos de productos
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Reporte Excel de costos generado
 */
router.get('/excel/costs', [
    validarJWT,
], generateExcelReportsPricesProduct);

/**
 * @swagger
 * /product/pdf/costs:
 *   get:
 *     summary: Generar reporte PDF de costos de productos
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Reporte PDF de costos generado
 */
router.get('/pdf/costs', [
    validarJWT,
], generatePdfReports);



module.exports = router;