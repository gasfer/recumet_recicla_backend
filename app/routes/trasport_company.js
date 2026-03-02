const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getTrasportCompanyPaginate, newTrasportCompany, updateTrasportCompany, newChauffeur, deleteChauffeur, activeInactiveTrasportCompany, newCargoTrucks, deleteCargoTrucks } = require('../controllers/trasport_company');
const { validateDelete, getValidateUpdate, getValidateCreate, validateDeleteChauffeur, getValidateCreateChauffeur, getValidateCreateCargoTruck, validateDeleteCargoTruck } = require('../middlewares/validators/trasport_company');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: TransportCompany
 *   description: Gestión de empresas de transporte
 */

/**
 * @swagger
 * /transport_company:
 *   get:
 *     summary: Obtener empresas de transporte paginadas
 *     tags: [TransportCompany]
 *     responses:
 *       200:
 *         description: Lista de empresas de transporte
 */
router.get('/', [
    validarJWT,
], getTrasportCompanyPaginate);

/**
 * @swagger
 * /transport_company:
 *   post:
 *     summary: Crear nueva empresa de transporte
 *     tags: [TransportCompany]
 *     responses:
 *       201:
 *         description: Empresa creada
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newTrasportCompany);

/**
 * @swagger
 * /transport_company/{id}:
 *   put:
 *     summary: Actualizar empresa de transporte
 *     tags: [TransportCompany]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Empresa actualizada
 */
router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
], updateTrasportCompany);

/**
 * @swagger
 * /transport_company/destroyAndActive/{id}:
 *   put:
 *     summary: Activar/Desactivar empresa de transporte
 *     tags: [TransportCompany]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado de la empresa actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
], activeInactiveTrasportCompany);

/**
 * @swagger
 * /transport_company/chauffeur:
 *   post:
 *     summary: Crear nuevo chofer
 *     tags: [TransportCompany]
 *     responses:
 *       201:
 *         description: Chofer creado
 */
router.post('/chauffeur', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreateChauffeur
], newChauffeur);

/**
 * @swagger
 * /transport_company/chauffeur/{id}:
 *   delete:
 *     summary: Eliminar chofer
 *     tags: [TransportCompany]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chofer eliminado
 */
router.delete('/chauffeur/:id', [
    validarJWT,
    validateDeleteChauffeur
], deleteChauffeur);

/**
 * @swagger
 * /transport_company/cargo_truck:
 *   post:
 *     summary: Crear nuevo camión de carga
 *     tags: [TransportCompany]
 *     responses:
 *       201:
 *         description: Camión creado
 */
router.post('/cargo_truck', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreateCargoTruck
], newCargoTrucks);

/**
 * @swagger
 * /transport_company/cargo_truck/{id}:
 *   delete:
 *     summary: Eliminar camión de carga
 *     tags: [TransportCompany]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Camión eliminado
 */
router.delete('/cargo_truck/:id', [
    validarJWT,
    validateDeleteCargoTruck
], deleteCargoTrucks);


module.exports = router;