const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getProviderPaginate, newProvider, updateProvider, activeInactiveProvider, getAllSectorProvider, newSectorProvider, deleteSectorProvider, getProviderByProductPaginate, getAllTypesProvider, getProviderAutocomplete, preRegisterProvider, checkDuplicateProvider, getProviderCommercialDetails, commercialValidationProvider, saveProviderDetail, deleteProviderDetail, resolveGoogleMapsLink, getProviderFrequencyAnalysis } = require('../controllers/provider.controller');
const { getValidateCreate, getValidatePreRegister, getValidateUpdate, validateDelete, getValidateCreateSector, validateDeleteSector } = require('../middlewares/validators/provider');
const { generateExcelProviders } = require('../controllers/reports/providers.controller');

const router = Router();
const expressfileUpload = require('express-fileupload');
const { uploadCertificate } = require('../controllers/provider-certificate.controller');
const { authorizeProviderAccess } = require('../middlewares/authorize-provider-access');
const { authorizeModulePermission } = require('../middlewares/authorize-module-permission');
const management = require('../controllers/provider-management.controller');
const drafts = require('../controllers/provider-draft.controller');
const draftPermission = (req, res, next) => authorizeProviderAccess(req.params.key === 'new' || req.params.key?.endsWith('-newbranch') ? 'create' : 'update')(req, res, next);
router.get('/drafts/:key', [validarJWT, draftPermission], drafts.read);
router.put('/drafts/:key', [validarJWT, draftPermission], drafts.save);
router.delete('/drafts/:key', [validarJWT, draftPermission], drafts.remove);
const { validateSheet, createRegistrationPdf } = require('../services/provider-registration-pdf');

router.post('/registration-sheet', [validarJWT, authorizeProviderAccess('view')], (req, res) => {
    if (!validateSheet(req.body)) return res.status(400).json({ ok: false, msg: 'La ficha de registro no es válida.' });
    const pdf = createRegistrationPdf(req.body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ficha-proveedor.pdf"');
    pdf.pipe(res);
    pdf.end();
});

router.get('/management/catalogs', [validarJWT, authorizeProviderAccess('view')], management.catalogs);
router.get('/management', [validarJWT, authorizeProviderAccess('view')], management.search);


/**
 * @swagger
 * tags:
 *   name: Providers
 *   description: Gestión de proveedores
 */

/**
 * @swagger
 * /provider:
 *   get:
 *     summary: Obtener proveedores paginados
 *     tags: [Providers]
 *     responses:
 *       200:
 *         description: Lista de proveedores
 */
router.get('/', [
    validarJWT,
    authorizeProviderAccess('view'),
], getProviderPaginate);

router.get('/autocomplete', [
    validarJWT,
], getProviderAutocomplete);

router.get('/check-duplicate', [
    validarJWT,
], checkDuplicateProvider);

router.get('/resolve-map-link', [validarJWT], resolveGoogleMapsLink);

router.post('/pre-register', [
    validarJWT,
    authorizeProviderAccess('create'),
    toUpperCaseConvert,
    getValidatePreRegister,
], preRegisterProvider);

router.get('/:id/commercial-details', [
    validarJWT,
], getProviderCommercialDetails);

router.get('/:id/frequency-analysis', [
    validarJWT,
], getProviderFrequencyAnalysis);

router.post('/:id/certificate', [validarJWT, authorizeProviderAccess('update'), expressfileUpload({ limits: { fileSize: 8 * 1024 * 1024 }, abortOnLimit: true })], uploadCertificate);

router.put('/:id/commercial-validation', [
    validarJWT,
    authorizeProviderAccess('update'),
    toUpperCaseConvert,
], commercialValidationProvider);

for (const detail of ['branches', 'contacts', 'bank-accounts', 'materials']) {
    const kind = detail === 'bank-accounts' ? 'bankAccounts' : detail;
    router.post(`/:id/${detail}`, [validarJWT, authorizeProviderAccess('update'), toUpperCaseConvert], saveProviderDetail(kind));
    router.put(`/:id/${detail}/:detailId`, [validarJWT, authorizeProviderAccess('update'), toUpperCaseConvert], saveProviderDetail(kind));
    router.delete(`/:id/${detail}/:detailId`, [validarJWT, authorizeProviderAccess('update')], deleteProviderDetail(kind));
}


/**
 * @swagger
 * /provider/product:
 *   get:
 *     summary: Obtener proveedores por producto
 *     tags: [Providers]
 *     responses:
 *       200:
 *         description: Lista de proveedores
 */
router.get('/product', [
    validarJWT,
], getProviderByProductPaginate);

/**
 * @swagger
 * /provider:
 *   post:
 *     summary: Crear nuevo proveedor
 *     tags: [Providers]
 *     responses:
 *       201:
 *         description: Proveedor creado
 */
router.post('/', [
    validarJWT,
    authorizeProviderAccess('create'),
    toUpperCaseConvert,
    getValidateCreate
], newProvider);

/**
 * @swagger
 * /provider/{id}:
 *   put:
 *     summary: Actualizar proveedor
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Proveedor actualizado
 */
router.put('/:id', [
    validarJWT,
    authorizeProviderAccess('update'),
    toUpperCaseConvert,
    getValidateUpdate
], updateProvider);

/**
 * @swagger
 * /provider/destroyAndActive/{id}:
 *   put:
 *     summary: Activar/Desactivar proveedor
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado del proveedor actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    authorizeProviderAccess('delete'),
    validateDelete
], activeInactiveProvider);

/**
 * @swagger
 * /provider/sectors:
 *   get:
 *     summary: Obtener sectores de proveedores
 *     tags: [Providers]
 *     responses:
 *       200:
 *         description: Lista de sectores
 */
router.get('/sectors', [
    validarJWT,
], getAllSectorProvider);

/**
 * @swagger
 * /provider/sector:
 *   post:
 *     summary: Crear nuevo sector
 *     tags: [Providers]
 *     responses:
 *       201:
 *         description: Sector creado
 */
router.post('/sector', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreateSector
], newSectorProvider);

/**
 * @swagger
 * /provider/sector/destroy/{id}:
 *   delete:
 *     summary: Eliminar sector
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sector eliminado
 */
router.delete('/sector/destroy/:id', [
    validarJWT,
    validateDeleteSector
], deleteSectorProvider);

/**
 * @swagger
 * /provider/types:
 *   get:
 *     summary: Obtener tipos de proveedores
 *     tags: [Providers]
 *     responses:
 *       200:
 *         description: Lista de tipos
 */
router.get('/types', [
    validarJWT,
], getAllTypesProvider);

//reports
router.get('/excel', [
    validarJWT,
], generateExcelProviders);

module.exports = router;
