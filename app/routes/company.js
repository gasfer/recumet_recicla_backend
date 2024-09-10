const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { updateCompany, getCompanyPaginate } = require('../controllers/company.controller');

const router = Router();

router.get('/',[
    validarJWT,
],getCompanyPaginate );

router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
],updateCompany );


module.exports = router;