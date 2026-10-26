'use strict';

const {
  ProviderCompany, Provider, ProviderContact, ProviderMaterial, ProviderBankAccount,
  Input, AccountsPayable, Product, ProviderCompanyDocument, sequelize,
} = require('../database/config');
const { Op } = require('sequelize');
const providerService = require('./provider.service');
const { validateRegistrationFields } = require('./provider-registration-validation');
const { isProviderCatalogValue } = require('../constants/provider-commercial.constants');

const COMPANY_FIELDS = Object.freeze([
  'full_names', 'number_document', 'commercial_name', 'corporate_phone', 'corporate_cellphone',
  'corporate_email', 'website', 'entity_type', 'id_type_provider',
  'id_commercial_user', 'origin_channel', 'relationship_status', 'negotiation_condition',
  'commercial_observations', 'contact_priority', 'contact_observations', 'requires_certificate', 'requires_traceability_report',
  'general_observations', 'has_branches', 'status',
  'operational_type', 'operating_departments',
]);

const SITE_FIELDS = Object.freeze([
  'full_names', 'number_document', 'cellphone', 'direction', 'mayorista', 'name_contact',
  'companyContacts', 'workAreaOrPositionOrUnit', 'frequency', 'cellphone_contact',
  'id_category', 'id_type_provider', 'id_sucursal', 'status', 'service_mode', 'general_observations', 'frequency_mode',
  'enabled_sucursal_ids', 'operating_departments',
]);

const COLLECTION_MODELS = Object.freeze({
  contacts: ProviderContact,
  materials: ProviderMaterial,
  bankAccounts: ProviderBankAccount,
});

class ProviderCompanyService {
  async list(query = '') {
    const search = query ? {
      [Op.or]: [
        { full_names: { [Op.iLike]: `%${query}%` } },
        { number_document: { [Op.iLike]: `%${query}%` } },
      ],
    } : {};
    const companies = await ProviderCompany.findAll({
      where: search,
      include: [{
        association: 'operatingProviders', required: false, where: { status: true },
        attributes: ['id', 'full_names', 'number_document', 'direction', 'frequency', 'service_mode', 'site_role', 'status'],
      }],
      order: [['full_names', 'ASC']],
    });
    const ungrouped = await Provider.findAll({
      where: { status: true, id_provider_company: null, ...search },
      attributes: ['id', 'full_names', 'number_document', 'direction', 'frequency', 'service_mode', 'site_role', 'status'],
    });
    return { companies, ungrouped };
  }

  async create(data) {
    const payload = data.company || data;
    this.validateCompany(payload);
    return sequelize.transaction(async (transaction) => {
      const company = await ProviderCompany.create(this.pick(payload, COMPANY_FIELDS), { transaction });
      if (data.headquarters) await this.createSiteRecord(company, { ...data.headquarters, site_role: 'HEADQUARTERS' }, transaction);
      return this.details(company.id, transaction);
    });
  }

  async update(id, data) {
    const payload = data.company || data;
    this.validateCompany(payload);
    return sequelize.transaction(async (transaction) => {
      const company = await this.requireCompany(id, transaction, true);
      await company.update(this.pick(payload, COMPANY_FIELDS), { transaction });
      await this.validateRequiredDocuments(company, transaction);
      if (data.headquarters) {
        await this.validateSite(data.headquarters, false, company.operational_type, transaction);
        const site = await this.requireCompanySite(company.id, data.headquarters.id, transaction, true);
        await site.update(this.pick(data.headquarters, SITE_FIELDS), { transaction });
        await this.syncSiteDetails(site, data.headquarters, transaction);
      }
      return this.details(company.id, transaction);
    });
  }

  async createSite(companyId, data) {
    return sequelize.transaction(async (transaction) => {
      const company = await this.requireCompany(companyId, transaction, true);
      const role = data.site_role || 'BRANCH';
      if (role === 'HEADQUARTERS') await this.ensureNoHeadquarters(company.id, null, transaction);
      await this.createSiteRecord(company, { ...data, site_role: role }, transaction);
      await company.update({ has_branches: await this.hasBranches(company.id, transaction) }, { transaction });
      return this.details(company.id, transaction);
    });
  }

  async updateSite(companyId, providerId, data) {
    return sequelize.transaction(async (transaction) => {
      const company = await this.requireCompany(companyId, transaction, true);
      await this.validateSite(data, false, company.operational_type, transaction);
      const provider = await this.requireCompanySite(company.id, providerId, transaction, true);
      await provider.update(this.pick(data, SITE_FIELDS), { transaction });
      await this.syncSiteDetails(provider, data, transaction);
      return providerService.getProviderDetails(provider.id, transaction);
    });
  }

  async transferHeadquarters(companyId, providerId) {
    return sequelize.transaction(async (transaction) => {
      const company = await this.requireCompany(companyId, transaction, true);
      const target = await this.requireCompanySite(company.id, providerId, transaction, true);
      if (!target.status) throw this.error('No se puede convertir una sede inactiva en casa matriz', 400);
      await Provider.update(
        { site_role: 'BRANCH' },
        { where: { id_provider_company: company.id, site_role: 'HEADQUARTERS', id: { [Op.ne]: target.id } }, transaction },
      );
      await target.update({ site_role: 'HEADQUARTERS' }, { transaction });
      return this.details(company.id, transaction);
    });
  }

  async pendingSummary(companyId, providerId) {
    const company = await this.requireCompany(companyId);
    const provider = await this.requireCompanySite(company.id, providerId);
    const [purchases, pendingAccounts] = await Promise.all([
      Input.count({ where: { id_provider: provider.id } }),
      AccountsPayable.count({ where: { id_provider: provider.id, status: true, status_account: { [Op.ne]: 'PAGADO' } } }),
    ]);
    return {
      provider_id: provider.id,
      purchases,
      pending_accounts: pendingAccounts,
      can_deactivate: provider.site_role !== 'HEADQUARTERS',
    };
  }

  async deactivateSite(companyId, providerId, confirmation) {
    if (confirmation !== true) throw this.error('Debe confirmar la baja lógica de la sede', 400);
    return sequelize.transaction(async (transaction) => {
      const company = await this.requireCompany(companyId, transaction, true);
      const provider = await this.requireCompanySite(company.id, providerId, transaction, true);
      if (provider.site_role === 'HEADQUARTERS') throw this.error('Transfiera primero el rol de casa matriz a otra sede activa', 409);
      await provider.update({ status: false }, { transaction });
      await company.update({ has_branches: await this.hasBranches(company.id, transaction) }, { transaction });
      return this.details(company.id, transaction);
    });
  }

  async replaceCollection(companyId, providerId, kind, items) {
    if (!COLLECTION_MODELS[kind]) throw this.error('Colección de sede no válida', 400);
    if (!Array.isArray(items)) throw this.error('La colección debe ser una lista', 400);
    return sequelize.transaction(async (transaction) => {
      const company = await this.requireCompany(companyId, transaction, true);
      const provider = await this.requireCompanySite(company.id, providerId, transaction, true);
      this.validateCollection(kind, items);
      await providerService.syncDetails(provider, { [kind]: items }, transaction);
      return COLLECTION_MODELS[kind].findAll({ where: { id_provider: provider.id, status: true }, transaction });
    });
  }

  async details(id, transaction) {
    const company = await ProviderCompany.findByPk(id, {
      transaction,
      include: [
        { association: 'commercialUser', attributes: ['id', 'full_names'], required: false },
        { association: 'documents', where: { status: true }, required: false },
        {
          association: 'operatingProviders', required: false,
          include: [
            { association: 'sucursal', attributes: ['id', 'name', 'city'], required: false },
            { association: 'branches', where: { status: true }, required: false },
            { association: 'contacts', where: { status: true }, required: false },
            { association: 'materials', where: { status: true }, required: false, include: [{ association: 'category' }, { association: 'product' }] },
            { association: 'bankAccounts', where: { status: true }, required: false, include: [{ association: 'bank' }] },
          ],
        },
      ],
      order: [
        [{ model: Provider, as: 'operatingProviders' }, 'site_role', 'ASC'],
        [{ model: Provider, as: 'operatingProviders' }, 'id', 'ASC'],
      ],
    });
    if (!company) return null;
    const result = company.toJSON();
    result.operatingProviders = (result.operatingProviders || [])
      .map((site) => ({ ...site, location: (site.branches || []).find((branch) => branch.is_main) || site.branches?.[0] || null }))
      .sort((first, second) => (first.site_role === 'HEADQUARTERS' ? -1 : second.site_role === 'HEADQUARTERS' ? 1 : first.id - second.id));
    return result;
  }

  async setProviders(id, providerIds) {
    return sequelize.transaction(async (transaction) => {
      const company = await this.requireCompany(id, transaction, true);
      const ids = [...new Set((providerIds || []).map(Number).filter(Number.isInteger))];
      const count = await Provider.count({ where: { id: ids }, transaction });
      if (count !== ids.length) throw this.error('Uno o más proveedores no existen', 400);
      await Provider.update({ id_provider_company: null, site_role: null }, { where: { id_provider_company: company.id }, transaction });
      if (ids.length) {
        await Provider.update({ id_provider_company: company.id, site_role: 'BRANCH' }, { where: { id: ids }, transaction });
        await Provider.update({ site_role: 'HEADQUARTERS' }, { where: { id: ids[0] }, transaction });
      }
      await company.update({ has_branches: ids.length > 1 }, { transaction });
      return this.details(company.id, transaction);
    });
  }

  async createSiteRecord(company, data, transaction) {
    await this.validateSite(data, true, company.operational_type, transaction);
    const provider = await Provider.create({
      ...this.pick(data, SITE_FIELDS),
      full_names: data.full_names || company.commercial_name || company.full_names,
      number_document: data.number_document || company.number_document,
      id_type_provider: data.id_type_provider || company.id_type_provider,
      id_provider_company: company.id,
      site_role: data.site_role,
      status: data.status !== false,
      estado_registro: 'VALIDADO',
    }, { transaction });
    await this.syncSiteDetails(provider, data, transaction);
    return provider;
  }

  async syncSiteDetails(provider, data, transaction) {
    const normalized = { ...data };
    if (data.location) {
      normalized.branches = [{
        ...data.location,
        branch_name: data.location.branch_name || data.full_names || 'SEDE PRINCIPAL',
        address: data.location.address || data.location.direction,
        is_main: true,
        status: true,
      }];
      normalized.direction = data.location.address || data.location.direction;
      await provider.update({ direction: normalized.direction || provider.direction }, { transaction });
    }
    await providerService.syncDetails(provider, normalized, transaction);
    const mainBranch = normalized.branches?.find((item) => item.is_main !== false && item.status !== false);
    if (mainBranch) await provider.update({ direction: mainBranch.address || mainBranch.city || null }, { transaction });
    const mainContact = normalized.contacts?.find((item) => item.is_main_contact && item.status !== false);
    if (mainContact) await provider.update({ name_contact: mainContact.full_name, cellphone_contact: mainContact.cellphone }, { transaction });
    const firstMaterial = normalized.materials?.find((item) => item.status !== false);
    if (firstMaterial?.id_category) await provider.update({ id_category: firstMaterial.id_category }, { transaction });
  }

  validateCompany(data) {
    const required = ['full_names', 'number_document', 'entity_type', 'origin_channel', 'relationship_status'];
    const missing = required.filter((field) => !this.hasValue(data[field]));
    if (typeof data.requires_certificate !== 'boolean') missing.push('requires_certificate');
    if (typeof data.requires_traceability_report !== 'boolean') missing.push('requires_traceability_report');
    if (missing.length) throw this.error(`Faltan datos corporativos obligatorios: ${missing.join(', ')}`, 400);
    validateRegistrationFields(data);
    ['entity_type', 'origin_channel', 'relationship_status'].forEach((field) => this.validateCatalog(field, data[field]));
    this.validateCatalog('operational_type', data.operational_type || 'RAW_MATERIAL');
    if (this.hasValue(data.corporate_email) && !/^\S+@\S+\.\S+$/.test(data.corporate_email)) throw this.error('El correo corporativo no es válido', 400);
    if (this.hasValue(data.website) && !/^https?:\/\//i.test(data.website)) throw this.error('El sitio web debe incluir http:// o https://', 400);
    if (this.hasValue(data.negotiation_condition)) this.validateCatalog('negotiation_condition', data.negotiation_condition);
    if (this.hasValue(data.contact_priority) && !['HIGH', 'MEDIUM', 'LOW'].includes(data.contact_priority)) {
      throw this.error('La prioridad de contacto no es válida', 400);
    }
  }

  async validateRequiredDocuments(company, transaction) {
    const requirements = [
      ['requires_certificate', 'CERTIFICATE', 'certificado'],
      ['requires_traceability_report', 'TRACEABILITY_REPORT', 'informe de trazabilidad'],
    ].filter(([field]) => company[field]);
    if (!requirements.length) return;
    const documents = await ProviderCompanyDocument.findAll({
      where: { id_provider_company: company.id, status: true },
      attributes: ['document_type'], transaction, raw: true,
    });
    const available = new Set(documents.map(document => document.document_type));
    const missing = requirements.filter(([, type]) => !available.has(type)).map(([, , label]) => label);
    if (missing.length) throw this.error(`Falta adjuntar el ${missing.join(' y el ')} requerido antes de guardar`, 422);
  }

  async validateSite(data, creating, operationalType = 'RAW_MATERIAL', transaction) {
    if (creating && !Number.isInteger(Number(data.id_sucursal))) throw this.error('La sucursal operativa de RECUMET es obligatoria', 400);
    const location = data.location || (data.branches || []).find((item) => item.is_main !== false && item.status !== false);
    if (!location || !this.hasValue(location.department) || !this.hasValue(location.address || location.direction)) {
      throw this.error('Departamento y dirección son obligatorios para la sede', 400);
    }
    this.validateCoordinates(location.latitude, location.longitude);
    this.validateCollection('contacts', data.contacts || [], operationalType, { requirePositionArea: false });
    this.validateCollection('materials', data.materials || [], operationalType);
    if (Array.isArray(data.bankAccounts)) this.validateCollection('bankAccounts', data.bankAccounts);
    validateRegistrationFields({ ...data, latitude: location.latitude, longitude: location.longitude });
  }

  validateCollection(kind, items, operationalType = 'RAW_MATERIAL', options = {}) {
    const active = items.filter((item) => item.status !== false);
    if (kind === 'contacts') {
      if (!active.length) throw this.error('Registre al menos un contacto para la sede', 400);
      active.forEach((item) => {
        const required = [item.full_name, item.cellphone];
        if (options.requirePositionArea !== false) required.push(item.position_area);
        if (!required.every((value) => this.hasValue(value))) {
          throw this.error(options.requirePositionArea === false ? 'Cada contacto requiere nombre y celular' : 'Cada contacto requiere nombre, cargo/área y celular', 400);
        }
      });
      if (active.filter((item) => item.is_main_contact).length !== 1) throw this.error('Seleccione un único contacto principal', 400);
    }
    if (kind === 'materials') {
      if (operationalType !== 'RAW_MATERIAL' && !active.length) return;
      if (!active.length || active.some((item) => !Number.isInteger(Number(item.id_product)) || !this.hasValue(item.frequency) || !this.hasValue(item.service_mode))) {
        throw this.error('Cada producto MP requiere producto, frecuencia y modalidad de atención', 400);
      }
      active.forEach((item) => {
        this.validateCatalog('frequency', item.frequency);
        this.validateCatalog('service_mode', item.service_mode);
      });
      const keys = active.map((item) => String(item.id_product));
      if (new Set(keys).size !== keys.length) throw this.error('No se permiten materiales duplicados en una sede', 400);
    }
    if (kind === 'bankAccounts') {
      active.forEach((item) => {
        if (![item.id_bank, item.account_holder, item.account_number, item.account_type, item.currency].every((value) => this.hasValue(value))) {
          throw this.error('Complete todos los datos de cada cuenta bancaria', 400);
        }
        this.validateCatalog('account_type', item.account_type);
        this.validateCatalog('currency', item.currency);
      });
      if (active.filter((item) => item.is_main).length > 1) throw this.error('Seleccione como máximo una cuenta principal', 400);
    }
  }

  validateCoordinates(latitude, longitude) {
    if (!this.hasValue(latitude) && !this.hasValue(longitude)) return;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw this.error('Las coordenadas de la sede no son válidas', 400);
    }
  }

  validateCatalog(field, value) {
    if (!isProviderCatalogValue(field, value)) throw this.error(`El valor de ${field} no pertenece al catálogo permitido`, 400);
  }

  async requireCompany(id, transaction, lock = false) {
    const company = await ProviderCompany.findByPk(id, { transaction, ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
    if (!company) throw this.error('La empresa matriz no existe', 404);
    return company;
  }

  async requireCompanySite(companyId, providerId, transaction, lock = false) {
    const provider = await Provider.findOne({
      where: { id: providerId, id_provider_company: companyId }, transaction,
      ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!provider) throw this.error('La sede no pertenece a la empresa indicada', 404);
    return provider;
  }

  async ensureNoHeadquarters(companyId, ignoredId, transaction) {
    const current = await Provider.findOne({
      where: {
        id_provider_company: companyId,
        site_role: 'HEADQUARTERS',
        status: true,
        ...(ignoredId ? { id: { [Op.ne]: ignoredId } } : {}),
      },
      transaction,
    });
    if (current) throw this.error('La empresa ya tiene una casa matriz activa', 409);
  }

  async hasBranches(companyId, transaction) {
    return (await Provider.count({ where: { id_provider_company: companyId, status: true }, transaction })) > 1;
  }

  pick(data, fields) {
    return Object.fromEntries(fields.filter((key) => Object.prototype.hasOwnProperty.call(data, key)).map((key) => [key, data[key]]));
  }

  hasValue(value) { return value !== undefined && value !== null && String(value).trim() !== ''; }

  error(message, statusCode) { return Object.assign(new Error(message), { statusCode }); }
}

module.exports = new ProviderCompanyService();
