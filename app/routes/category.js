const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getCategoryPaginate, newCategory, updateCategory, activeInactiveCategory } = require('../controllers/category.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/category');

const router = Router();


router.get('/',[
    validarJWT,
],getCategoryPaginate );

router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newCategory );

router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
],updateCategory );

router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
],activeInactiveCategory );


module.exports = router;