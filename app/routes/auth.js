const { Router } = require('express');
const { check } = require('express-validator');
const { login, renewToken } = require('../controllers/auth.controller');
const { validatedResponse } = require('../middlewares/validated-response');
const { validarJWT } = require('../middlewares/validators/validar-jwt');

const router = Router();


router.post('/',[
    check('email', 'El email es obligatorio').not().isEmpty().isEmail(),
    check('password', 'El password es obligatorio').not().isEmpty(),
    validatedResponse
], login);

router.post('/refresh',[
    check('Authorization', 'El token es necesario').not().isEmpty(),
    validatedResponse,
    validarJWT
],renewToken);


module.exports = router;