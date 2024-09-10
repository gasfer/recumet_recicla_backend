const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getUnitPaginate, newUnit, updateUnit, activeInactiveUnit } = require('../controllers/unit.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/unit');

const router = Router();


router.get('/',[
    validarJWT,
],getUnitPaginate );

router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newUnit );

router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
],updateUnit );

router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
],activeInactiveUnit );


module.exports = router;