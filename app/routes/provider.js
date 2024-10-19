const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getProviderPaginate, newProvider, updateProvider, activeInactiveProvider, getAllSectorProvider, newSectorProvider, deleteSectorProvider, getProviderByProductPaginate, getAllTypesProvider } = require('../controllers/provider.controller');
const { getValidateCreate, getValidateUpdate, validateDelete, getValidateCreateSector, validateDeleteSector } = require('../middlewares/validators/provider');

const router = Router();


router.get('/',[
    validarJWT,
],getProviderPaginate );

router.get('/product',[
    validarJWT,
],getProviderByProductPaginate );

router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newProvider );

router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
],updateProvider );

router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
],activeInactiveProvider );

router.get('/sectors',[
    validarJWT,
],getAllSectorProvider);

router.post('/sector', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreateSector
],newSectorProvider );

router.delete('/sector/destroy/:id', [
    validarJWT,
    validateDeleteSector
],deleteSectorProvider );

router.get('/types', [
    validarJWT,
],getAllTypesProvider );


module.exports = router;