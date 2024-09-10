const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getScalePaginate, newScale, updateScale, activeInactiveScale } = require('../controllers/scalas.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/scala');

const router = Router();


router.get('/',[
    validarJWT,
],getScalePaginate );

router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newScale );

router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
],updateScale );

router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
],activeInactiveScale );


module.exports = router;