const { Router } = require('express');
const { validatedResponse } = require('../middlewares/validated-response');
const { validateShowFile } = require('../middlewares/validators/validar-files');
const { showFile } = require('../controllers/showfiles.controller');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Files
 *   description: Gestión de archivos e imágenes
 */

/**
 * @swagger
 * /uploads/{type}/{name}:
 *   get:
 *     summary: Obtener archivo/imagen
 *     tags: [Files]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         description: Tipo de archivo (users, products, company)
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         description: Nombre del archivo
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Archivo obtenido
 */
router.get('/:type/:name', [
    validateShowFile,
    validatedResponse
], showFile);

module.exports = router;