const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getClassifiedsPaginate, newClassified, destroyClassified, getClassifiedFindOne } = require('../controllers/classified.controller');
const { getValidateCreate, validateIdClassified } = require('../middlewares/validators/classified');
const { printClassifiedVoucher, generatePdfReports, generatePdfDetailsReports, generateExcelReports, generateExcelDetailsReports } = require('../controllers/reports/classified.controller');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Classifieds
 *   description: Gestión de clasificados
 */

/**
 * @swagger
 * /classified:
 *   get:
 *     summary: Obtener clasificados paginados
 *     tags: [Classifieds]
 *     responses:
 *       200:
 *         description: Lista de clasificados
 */
router.get('/', [
    validarJWT,
], getClassifiedsPaginate);

/**
 * @swagger
 * /classified/find/{id_classified}:
 *   get:
 *     summary: Obtener un clasificado por ID
 *     tags: [Classifieds]
 *     parameters:
 *       - in: path
 *         name: id_classified
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detalle del clasificado
 */
router.get('/find/:id_classified', [
    validarJWT,
], getClassifiedFindOne);

/**
 * @swagger
 * /classified:
 *   post:
 *     summary: Crear nuevo clasificado
 *     tags: [Classifieds]
 *     responses:
 *       201:
 *         description: Clasificado creado
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newClassified);

/**
 * @swagger
 * /classified/destroy/{id_classified}:
 *   delete:
 *     summary: Eliminar clasificado
 *     tags: [Classifieds]
 *     parameters:
 *       - in: path
 *         name: id_classified
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Clasificado eliminado
 */
router.delete('/destroy/:id_classified', [
    validarJWT,
    validateIdClassified
], destroyClassified);

//** REPORTS */
/**
 * @swagger
 * /classified/pdf/voucher/{id_classified}:
 *   get:
 *     summary: Imprimir voucher de clasificado
 *     tags: [Classifieds]
 *     parameters:
 *       - in: path
 *         name: id_classified
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Voucher PDF generado
 */
router.get('/pdf/voucher/:id_classified', [
    validarJWT,
    validateIdClassified,
], printClassifiedVoucher);

/**
 * @swagger
 * /classified/pdf:
 *   get:
 *     summary: Generar reporte PDF de clasificados
 *     tags: [Classifieds]
 *     responses:
 *       200:
 *         description: Reporte PDF generado
 */
router.get('/pdf', [
    validarJWT,
], generatePdfReports);

/**
 * @swagger
 * /classified/pdf/details:
 *   get:
 *     summary: Generar reporte PDF detallado de clasificados
 *     tags: [Classifieds]
 *     responses:
 *       200:
 *         description: Reporte PDF detallado generado
 */
router.get('/pdf/details', [
    validarJWT,
], generatePdfDetailsReports);

/**
 * @swagger
 * /classified/excel:
 *   get:
 *     summary: Generar reporte Excel de clasificados
 *     tags: [Classifieds]
 *     responses:
 *       200:
 *         description: Reporte Excel generado
 */
router.get('/excel', [
    validarJWT,
], generateExcelReports);

/**
 * @swagger
 * /classified/excel/details:
 *   get:
 *     summary: Generar reporte Excel detallado de clasificados
 *     tags: [Classifieds]
 *     responses:
 *       200:
 *         description: Reporte Excel detallado generado
 */
router.get('/excel/details', [
    validarJWT,
], generateExcelDetailsReports);


module.exports = router;