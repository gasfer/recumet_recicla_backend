const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getClientPaginate, newClient, updateClient, activeInactiveClient } = require('../controllers/client.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/client');

const router = Router();


router.get('/',[
    validarJWT,
],getClientPaginate );

router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newClient );

router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
],updateClient );

router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
],activeInactiveClient );


module.exports = router;