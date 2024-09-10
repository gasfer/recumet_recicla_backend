const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getStoragesPaginate, newStorage, updateStorage, activeInactiveStorage } = require('../controllers/storage.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/storage');

const router = Router();


router.get('/',[
    validarJWT,
],getStoragesPaginate );

router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newStorage );

router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
],updateStorage );

router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
],activeInactiveStorage );


module.exports = router;