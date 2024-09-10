const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getBankPaginate, newBank, updateBank, activeInactiveBank } = require('../controllers/bank.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/bank');

const router = Router();


router.get('/',[
    validarJWT,
],getBankPaginate );

router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newBank );

router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
],updateBank );

router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
],activeInactiveBank );


module.exports = router;