const { Router } = require('express');
const { check } = require('express-validator');
const { login, renewToken } = require('../controllers/auth.controller');
const { validatedResponse } = require('../middlewares/validated-response');
const { validarJWT } = require('../middlewares/validators/validar-jwt');

const router = Router();


/**
 * @swagger
 * /auth:
 *   post:
 *     summary: Iniciar sesión de usuario
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Correo electrónico del usuario
 *                 example: gclaure@gmail.com
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Contraseña del usuario
 *                 example: admin123
 *           examples:
 *             admin:
 *               summary: Login como administrador
 *               value:
 *                 email: gclaure@gmail.com
 *                 password: admin123
 *             usuario:
 *               summary: Login como usuario regular
 *               value:
 *                 email: usuario@example.com
 *                 password: user123
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *                 usuario:
 *                   type: object
 *                   example:
 *                     id: 1
 *                     email: gclaure@gmail.com
 *                     nombre: Gabriel Claure
 *                     rol: admin
 *       400:
 *         description: Credenciales inválidas o datos faltantes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: false
 *                 msg:
 *                   type: string
 *                   example: Email o contraseña incorrectos
 *       500:
 *         description: Error en el servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: false
 *                 msg:
 *                   type: string
 *                   example: Error interno del servidor
 */
router.post('/', [
    check('email', 'El email es obligatorio').not().isEmpty().isEmail(),
    check('password', 'El password es obligatorio').not().isEmpty(),
    validatedResponse
], login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Renovar token de autenticación
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Token renovado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                 usuario:
 *                   type: object
 *       400:
 *         description: Token inválido o expirado
 *       500:
 *         description: Error en el servidor
 */
router.post('/refresh', [
    check('Authorization', 'El token es necesario').not().isEmpty(),
    validatedResponse,
    validarJWT
], renewToken);


module.exports = router;