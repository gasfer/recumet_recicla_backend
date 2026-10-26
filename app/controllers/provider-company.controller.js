const service = require('../services/provider-company.service');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { ProviderCompany, ProviderCompanyDocument, sequelize } = require('../database/config');
const { buildProviderPrintableProfile } = require('../services/provider-printable-profile.service');
const { sendReportPdf } = require('../services/pdf/report-pdf.service');
const { validateCompanyPdfUpload, safeOriginalName } = require('../services/provider-company-document.service');
const sendError = (res, error) => res.status(error.statusCode || 500).json({ ok: false, errors: [{ msg: error.statusCode ? error.message : 'No fue posible procesar la empresa matriz' }] });
exports.list = async (req, res) => { try { res.json({ ok: true, ...(await service.list(req.query.query || '')) }); } catch (error) { sendError(res, error); } };
exports.get = async (req, res) => { try { const company = await service.details(req.params.id); if (!company) return res.status(404).json({ ok: false, errors: [{ msg: 'La empresa matriz no existe' }] }); res.json({ ok: true, company }); } catch (error) { sendError(res, error); } };
exports.printableProfile = async (req, res) => {
  try {
    const document = await buildProviderPrintableProfile(req.params.id);
    return await sendReportPdf(res, document, `ficha-proveedor-${req.params.id}.pdf`);
  } catch (error) {
    if (!res.headersSent) return sendError(res, error);
    return undefined;
  }
};
exports.create = async (req, res) => { try { res.status(201).json({ ok: true, company: await service.create(req.body) }); } catch (error) { if (error.name === 'SequelizeUniqueConstraintError') error.statusCode = 400, error.message = 'El NIT ya está asociado a una empresa'; sendError(res, error); } };
exports.update = async (req, res) => { try { res.json({ ok: true, company: await service.update(req.params.id, req.body) }); } catch (error) { sendError(res, error); } };
exports.setProviders = async (req, res) => { try { res.json({ ok: true, company: await service.setProviders(req.params.id, req.body.provider_ids) }); } catch (error) { sendError(res, error); } };
exports.createSite = async (req, res) => { try { res.status(201).json({ ok: true, company: await service.createSite(req.params.id, req.body) }); } catch (error) { sendError(res, error); } };
exports.updateSite = async (req, res) => { try { res.json({ ok: true, site: await service.updateSite(req.params.id, req.params.providerId, req.body) }); } catch (error) { sendError(res, error); } };
exports.transferHeadquarters = async (req, res) => { try { res.json({ ok: true, company: await service.transferHeadquarters(req.params.id, req.params.providerId) }); } catch (error) { sendError(res, error); } };
exports.pendingSummary = async (req, res) => { try { res.json({ ok: true, pending: await service.pendingSummary(req.params.id, req.params.providerId) }); } catch (error) { sendError(res, error); } };
exports.deactivateSite = async (req, res) => { try { res.json({ ok: true, company: await service.deactivateSite(req.params.id, req.params.providerId, req.body.confirm === true) }); } catch (error) { sendError(res, error); } };
exports.replaceCollection = (kind) => async (req, res) => {
  try {
    res.json({ ok: true, [kind]: await service.replaceCollection(req.params.id, req.params.providerId, kind, req.body[kind] || req.body.items) });
  } catch (error) { sendError(res, error); }
};
exports.uploadDocument = async (req, res) => {
  let storedPath;
  try {
    const type = req.params.type;
    if (!['CERTIFICATE', 'TRACEABILITY_REPORT'].includes(type)) return res.status(400).json({ ok: false, errors: [{ msg: 'Tipo documental no válido' }] });
    const file = req.files && Object.values(req.files)[0];
    if (!validateCompanyPdfUpload(file)) {
      return res.status(422).json({ ok: false, errors: [{ msg: 'Adjunte un PDF válido de máximo 8 MB' }] });
    }
    const company = await ProviderCompany.findByPk(req.params.id);
    if (!company) return res.status(404).json({ ok: false, errors: [{ msg: 'La empresa matriz no existe' }] });
    const directory = path.join(process.env.RESOURCES_PATH ? path.resolve(process.env.RESOURCES_PATH) : path.join(__dirname, '../../uploads'), 'provider-company-documents');
    await fs.promises.mkdir(directory, { recursive: true });
    const storedName = `${uuidv4()}-${company.id}.pdf`;
    storedPath = path.join(directory, storedName);
    await file.mv(storedPath);
    const document = await sequelize.transaction(async transaction => {
      await ProviderCompanyDocument.update({ status: false }, { where: { id_provider_company: company.id, document_type: type, status: true }, transaction });
      return ProviderCompanyDocument.create({ id_provider_company: company.id, document_type: type, original_name: safeOriginalName(file.name), stored_name: storedName, mime_type: 'application/pdf', size_bytes: file.size, status: true }, { transaction });
    });
    res.status(201).json({ ok: true, document });
  } catch (error) {
    if (storedPath) await fs.promises.unlink(storedPath).catch(() => {});
    sendError(res, error);
  }
};
