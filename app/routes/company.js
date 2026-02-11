const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { updateCompany, getCompanyPaginate } = require('../controllers/company.controller');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Company
 *   description: Gestión de datos de la empresa
 */

/**
 * @swagger
 * /company:
 *   get:
 *     summary: Obtener datos de la empresa
 *     tags: [Company]
 *     responses:
 *       200:
 *         description: Datos de la empresa
 */
router.get('/', [
    validarJWT,
], getCompanyPaginate);

/**
 * @swagger
 * /company/{id}:
 *   put:
 *     summary: Actualizar datos de la empresa
 *     tags: [Company]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Datos actualizados
 */
router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
], updateCompany);


module.exports = router;