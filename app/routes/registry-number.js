'use strict';

const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const { checkRegistryNumber } = require('../controllers/registry-number.controller');

const router = Router();

router.get('/check', [validarJWT], checkRegistryNumber);

module.exports = router;
