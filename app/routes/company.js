const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { updateCompany, getCompanyPaginate, uploadCompanyLogo } = require('../controllers/company.controller');
const { filesExist, filesValidateSize } = require('../middlewares/validators/validar-files');
const { authorizeModulePermission } = require('../middlewares/authorize-module-permission');

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
    authorizeModulePermission('EMPRESA', 'update'),
    toUpperCaseConvert,
], updateCompany);
router.put('/:id/logo', [validarJWT, authorizeModulePermission('EMPRESA', 'update'), filesExist, filesValidateSize], uploadCompanyLogo);


module.exports = router;
