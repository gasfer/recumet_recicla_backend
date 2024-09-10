const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getTrasportCompanyPaginate, newTrasportCompany, updateTrasportCompany, newChauffeur, deleteChauffeur, activeInactiveTrasportCompany, newCargoTrucks, deleteCargoTrucks } = require('../controllers/trasport_company');
const { validateDelete, getValidateUpdate, getValidateCreate, validateDeleteChauffeur, getValidateCreateChauffeur, getValidateCreateCargoTruck, validateDeleteCargoTruck } = require('../middlewares/validators/trasport_company');

const router = Router();


router.get('/',[
    validarJWT,
],getTrasportCompanyPaginate );

router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newTrasportCompany );

router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
],updateTrasportCompany );

router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
],activeInactiveTrasportCompany );

router.post('/chauffeur', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreateChauffeur
],newChauffeur );

router.delete('/chauffeur/:id', [
    validarJWT,
    validateDeleteChauffeur
],deleteChauffeur );

router.post('/cargo_truck', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreateCargoTruck
],newCargoTrucks );

router.delete('/cargo_truck/:id', [
    validarJWT,
    validateDeleteCargoTruck
],deleteCargoTrucks );


module.exports = router;