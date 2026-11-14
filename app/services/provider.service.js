const { Provider, ProviderCompany, ProviderBranch, ProviderContact, ProviderBankAccount, ProviderMaterial, Product, Bank, Sucursal, TypesProvider, sequelize } = require('../database/config');
const { Op, QueryTypes } = require('sequelize');
const { WHOLESALE_FIELDS, validateWholesaleProfile } = require('./provider-wholesale-profile');
const { validateRegistrationFields } = require('./provider-registration-validation');
const providerAvailability = require('./provider-sucursal-availability.service');
const {
  isProviderCatalogValue,
  PROVIDER_TYPE_CODES,
  COMMERCIAL_PROVIDER_TYPE_CODES,
  UNCLASSIFIED_PROVIDER_TYPE_CODE,
} = require('../constants/provider-commercial.constants');

const COMMERCIAL_FIELDS = [
  'full_names', 'number_document', 'cellphone', 'id_sector', 'id_category', 'id_sucursal',
  'commercial_name', 'entity_type', 'origin_channel', 'relationship_status', 'negotiation_condition',
  'commercial_observations', 'requires_certificate', 'requires_traceability_report', 'service_mode',
  'general_observations', 'frequency', 'id_commercial_user', 'department', 'city', 'zone',
  'certificate_file_name', 'traceability_file_name', 'frequency_mode', 'operating_departments', 'has_branches', ...WHOLESALE_FIELDS
];
const PROFILE_FIELDS = [...new Set([...COMMERCIAL_FIELDS, 'id_sucursal', 'direction', 'mayorista', 'name_contact', 'companyContacts', 'workAreaOrPositionOrUnit', 'cellphone_contact', 'id_type_provider', 'status', 'operating_departments', 'has_branches'])];

const DETAIL_MODELS = {
  branches: { model: ProviderBranch, primaryField: 'is_main', mirror: 'branch' },
  contacts: { model: ProviderContact, primaryField: 'is_main_contact', mirror: 'contact', naturalKey: ['full_name', 'cellphone'] },
  bankAccounts: { model: ProviderBankAccount, primaryField: 'is_main', naturalKey: ['id_bank', 'account_number'] },
  materials: { model: ProviderMaterial, naturalKey: ['id_product'] },
};

const normalizeProviderDocument = value => String(value || '').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
const normalizeProviderName = value => String(value || '').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
const normalizeProviderPhone = value => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('591') ? digits.slice(3) : digits;
};

class ProviderService {
  async createProfile(data, user) {
    await this.validateProfile(data);
    return sequelize.transaction(async (transaction) => {
      await this.lockProviderIdentity(data, transaction);
      await this.assertIdentityAvailable(data, {}, transaction);
      await this.assertProviderTypeChangeAllowed(null, data.id_type_provider, user, transaction);
      const registrationBranch = await providerAvailability.assertBranchAccess(data.id_sucursal, user, transaction);
      const profile = this.pick(data, PROFILE_FIELDS);
      const type = data.id_type_provider ? await this.getCurrentProviderType(data.id_type_provider, transaction) : null;
      if (type?.code === UNCLASSIFIED_PROVIDER_TYPE_CODE) profile.estado_registro = 'PENDIENTE';
      const provider = await Provider.create({ ...profile, id_sucursal: registrationBranch }, { transaction });
      await providerAvailability.enableInitial(provider.id, registrationBranch, user, transaction);

      await this.syncMainBranch(provider, data, transaction);
      await this.syncMainContact(provider, data, transaction);
      await this.syncMainMaterial(provider, data, transaction);
      await this.syncMainBankAccount(provider, data, transaction);
      await this.syncDetails(provider, data, transaction);

      return this.getProviderDetails(provider.id, transaction);
    });
  }

  async findAutocompleteProviders(query = '') {
    const conditions = query
      ? [{ [Op.or]: [{ full_names: { [Op.iLike]: `%${query}%` } }, { number_document: { [Op.iLike]: `%${query}%` } }] }]
      : [];
    return Provider.findAll({
      attributes: ['id', 'full_names', 'number_document', 'estado_registro'],
      where: { status: true, ...(conditions.length ? { [Op.and]: conditions } : {}) },
      include: [{ association: 'type', attributes: ['code'] }],
      limit: 20,
    });
  }

  async findAvailableProvidersForPurchase(query = '', branchId, user) {
    return providerAvailability.findAvailableProviders(String(query).slice(0, 150), branchId, user);
  }

  async preRegisterProvider(data, idSucursal, user) {
    const branchId = Number(idSucursal);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw this.validationError('Seleccione una sucursal activa antes de registrar el proveedor');
    }
    if (user?.role !== 'ADMINISTRADOR' && !(user?.assign_sucursales || []).some(
      (assignment) => assignment.status !== false && Number(assignment.id_sucursal) === branchId,
    )) {
      const error = new Error('No tiene acceso a la sucursal seleccionada');
      error.statusCode = 403;
      throw error;
    }
    return sequelize.transaction(async (transaction) => {
      await this.lockProviderIdentity(data, transaction);
      const sucursal = await Sucursal.findByPk(branchId, { transaction });
      if (!sucursal || !sucursal.status) throw this.validationError('La sucursal seleccionada no existe o está inactiva');
      const duplicate = await this.findDuplicate({ full_names: data.full_names, number_document: data.number_document, cellphone: data.cellphone }, transaction);
      if (duplicate) {
        const matchName = duplicate.full_names || duplicate.commercial_name || 'proveedor';
        const message = duplicate.match_quality === 'APPROXIMATE'
          ? `Encontramos una ficha con un nombre parecido (${matchName}). Verifique si ya existe antes de continuar.`
          : `Ya existe una ficha coincidente (${matchName}). Selecciónela para continuar o complete un CI/NIT o celular distinto si se trata de otra persona o empresa.`;
        throw Object.assign(new Error(message), {
          statusCode: 409,
          duplicateProvider: duplicate,
        });
      }
      const unclassifiedType = await TypesProvider.findOne({
        where: { code: UNCLASSIFIED_PROVIDER_TYPE_CODE, status: true }, transaction,
      });
      if (!unclassifiedType) throw this.validationError('No está disponible el tipo F para pre-registros sin clasificar');
      const provider = await Provider.create({
      full_names: data.full_names,
      number_document: data.number_document || null,
      cellphone: data.cellphone || null,
      id_sucursal: sucursal.id,
      id_sector: data.id_sector || null,
      id_category: data.id_category || null,
      id_type_provider: unclassifiedType.id,
      estado_registro: 'PENDIENTE',
      origin_channel: data.origin_channel || 'BALANZA',
      status: true,
      }, { transaction });
      await providerAvailability.enableInitial(provider.id, sucursal.id, user, transaction);
      await this.syncMainBranch(provider, { city: sucursal.city }, transaction);
      return this.getProviderDetails(provider.id, transaction);
    });
  }

  async findIdentityDuplicates({ full_names, commercial_name, number_document, cellphone, corporate_cellphone, exclude_provider_id, exclude_company_id } = {}, transaction) {
    const document = normalizeProviderDocument(number_document);
    const phone = normalizeProviderPhone(cellphone || corporate_cellphone);
    const names = [...new Set([full_names, commercial_name].map(normalizeProviderName).filter(Boolean))];
    const phoneVariants = phone.length === 8 ? [phone, `591${phone}`] : [phone];
    const providerId = Number(exclude_provider_id) || null;
    const companyId = Number(exclude_company_id) || null;
    const providerScope = (match) => ({ [Op.and]: [
      match,
      ...(providerId ? [{ id: { [Op.ne]: providerId } }] : []),
      ...(companyId ? [{ [Op.or]: [{ id_provider_company: null }, { id_provider_company: { [Op.ne]: companyId } }] }] : []),
    ] });
    const companyScope = (match) => ({ [Op.and]: [
      match,
      ...(companyId ? [{ id: { [Op.ne]: companyId } }] : []),
    ] });
    const documentProviderMatch = document && sequelize.where(
      sequelize.fn('UPPER', sequelize.fn('REGEXP_REPLACE', sequelize.fn('TRIM', sequelize.col('number_document')), '[^[:alnum:]]', '', 'g')),
      document,
    );
    const documentCompanyMatch = document && sequelize.where(
      sequelize.fn('UPPER', sequelize.fn('REGEXP_REPLACE', sequelize.fn('TRIM', sequelize.col('number_document')), '[^[:alnum:]]', '', 'g')),
      document,
    );
    const providerPhoneMatch = phone && sequelize.where(
      sequelize.fn('REGEXP_REPLACE', sequelize.cast(sequelize.col('cellphone'), 'TEXT'), '[^[:digit:]]', '', 'g'),
      { [Op.in]: phoneVariants },
    );
    const companyPhoneMatch = phone && sequelize.where(
      sequelize.fn('REGEXP_REPLACE', sequelize.fn('TRIM', sequelize.col('corporate_cellphone')), '[^[:digit:]]', '', 'g'),
      { [Op.in]: phoneVariants },
    );
    const normalizedName = field => sequelize.fn('UPPER', sequelize.fn('REGEXP_REPLACE', sequelize.fn('TRIM', sequelize.col(field)), '[^[:alnum:]]', '', 'g'));
    const nameMatches = fields => ({ [Op.or]: fields.flatMap(field => names.map(name => sequelize.where(normalizedName(field), name))) });
    const providerNameMatch = names.length ? nameMatches(['full_names', 'commercial_name']) : null;
    const companyNameMatch = names.length ? nameMatches(['full_names', 'commercial_name']) : null;
    const [documentProvider, documentCompany, phoneProvider, phoneCompany, nameProvider, nameCompany] = await Promise.all([
      documentProviderMatch ? Provider.findOne({ attributes: ['id', 'full_names', 'number_document', 'cellphone'], where: providerScope(documentProviderMatch), order: [['id', 'ASC']], transaction }) : null,
      documentCompanyMatch ? ProviderCompany.findOne({ attributes: ['id', 'full_names', 'number_document', 'corporate_cellphone'], where: companyScope(documentCompanyMatch), order: [['id', 'ASC']], transaction }) : null,
      providerPhoneMatch ? Provider.findOne({ attributes: ['id', 'full_names', 'number_document', 'cellphone'], where: providerScope(providerPhoneMatch), order: [['id', 'ASC']], transaction }) : null,
      companyPhoneMatch ? ProviderCompany.findOne({ attributes: ['id', 'full_names', 'number_document', 'corporate_cellphone'], where: companyScope(companyPhoneMatch), order: [['id', 'ASC']], transaction }) : null,
      providerNameMatch ? Provider.findOne({ attributes: ['id', 'full_names', 'commercial_name', 'number_document', 'cellphone'], where: providerScope(providerNameMatch), order: [['id', 'ASC']], transaction }) : null,
      companyNameMatch ? ProviderCompany.findOne({ attributes: ['id', 'full_names', 'commercial_name', 'number_document', 'corporate_cellphone'], where: companyScope(companyNameMatch), order: [['id', 'ASC']], transaction }) : null,
    ]);
    const exactNameMatch = nameCompany || nameProvider;
    let similarNameMatch = null;
    if (!exactNameMatch && names.length) {
      try {
        similarNameMatch = await this.findSimilarProviderName(names, { providerId, companyId }, transaction);
      } catch (error) {
        const databaseCode = error?.original?.code || error?.parent?.code;
        if (databaseCode !== '42883') throw error;
        // Keep exact CI/NIT, phone, and name checks available if pg_trgm has not
        // been installed by the database migration yet. Approximate matching
        // resumes automatically once the extension is present.
        console.warn('pg_trgm no está disponible; se omite temporalmente la comparación aproximada de nombres.');
      }
    }
    const serialize = (record, kind) => record ? {
      ...(typeof record.get === 'function' ? record.get({ plain: true }) : record),
      kind: record.kind || kind,
    } : null;
    const documentMatch = documentCompany || documentProvider;
    const phoneMatch = phoneProvider || phoneCompany;
    const nameMatch = exactNameMatch || similarNameMatch;
    return {
      number_document: serialize(documentMatch, documentCompany ? 'company' : 'provider'),
      cellphone: serialize(phoneMatch, phoneProvider ? 'provider' : 'company'),
      full_names: serialize(nameMatch, nameCompany ? 'company' : 'provider'),
      duplicate: serialize(documentMatch || phoneMatch || (!document && !phone ? nameMatch : null), documentMatch ? (documentCompany ? 'company' : 'provider') : phoneMatch ? (phoneProvider ? 'provider' : 'company') : nameCompany ? 'company' : 'provider'),
    };
  }

  async findSimilarProviderName(names, exclusions = {}, transaction) {
    const candidates = [];
    for (const name of names) {
      if (name.length < 5) continue;
      const rows = await sequelize.query(`
        WITH candidates AS (
          SELECT p.id, p.full_names, p.number_document, p.cellphone::text AS cellphone,
                 p.commercial_name, 'provider'::text AS kind,
                 GREATEST(
                   similarity(UPPER(REGEXP_REPLACE(COALESCE(p.full_names, ''), '[^[:alnum:]]', '', 'g')), :name),
                   similarity(UPPER(REGEXP_REPLACE(COALESCE(p.commercial_name, ''), '[^[:alnum:]]', '', 'g')), :name),
                   word_similarity(UPPER(REGEXP_REPLACE(COALESCE(p.full_names, ''), '[^[:alnum:]]', '', 'g')), :name),
                   word_similarity(UPPER(REGEXP_REPLACE(COALESCE(p.commercial_name, ''), '[^[:alnum:]]', '', 'g')), :name),
                   word_similarity(:name, UPPER(REGEXP_REPLACE(COALESCE(p.full_names, ''), '[^[:alnum:]]', '', 'g'))),
                   word_similarity(:name, UPPER(REGEXP_REPLACE(COALESCE(p.commercial_name, ''), '[^[:alnum:]]', '', 'g')))
                 ) AS score
          FROM providers p
          WHERE (:provider_id IS NULL OR p.id <> :provider_id)
            AND (:company_id IS NULL OR p.id_provider_company IS DISTINCT FROM :company_id)
            AND (
              UPPER(REGEXP_REPLACE(COALESCE(p.full_names, ''), '[^[:alnum:]]', '', 'g')) % :name
              OR UPPER(REGEXP_REPLACE(COALESCE(p.commercial_name, ''), '[^[:alnum:]]', '', 'g')) % :name
              OR UPPER(REGEXP_REPLACE(COALESCE(p.full_names, ''), '[^[:alnum:]]', '', 'g')) <% :name
              OR UPPER(REGEXP_REPLACE(COALESCE(p.commercial_name, ''), '[^[:alnum:]]', '', 'g')) <% :name
              OR :name <% UPPER(REGEXP_REPLACE(COALESCE(p.full_names, ''), '[^[:alnum:]]', '', 'g'))
              OR :name <% UPPER(REGEXP_REPLACE(COALESCE(p.commercial_name, ''), '[^[:alnum:]]', '', 'g'))
            )
          UNION ALL
          SELECT pc.id, pc.full_names, pc.number_document, pc.corporate_cellphone AS cellphone,
                 pc.commercial_name, 'company'::text AS kind,
                 GREATEST(
                   similarity(UPPER(REGEXP_REPLACE(COALESCE(pc.full_names, ''), '[^[:alnum:]]', '', 'g')), :name),
                   similarity(UPPER(REGEXP_REPLACE(COALESCE(pc.commercial_name, ''), '[^[:alnum:]]', '', 'g')), :name),
                   word_similarity(UPPER(REGEXP_REPLACE(COALESCE(pc.full_names, ''), '[^[:alnum:]]', '', 'g')), :name),
                   word_similarity(UPPER(REGEXP_REPLACE(COALESCE(pc.commercial_name, ''), '[^[:alnum:]]', '', 'g')), :name),
                   word_similarity(:name, UPPER(REGEXP_REPLACE(COALESCE(pc.full_names, ''), '[^[:alnum:]]', '', 'g'))),
                   word_similarity(:name, UPPER(REGEXP_REPLACE(COALESCE(pc.commercial_name, ''), '[^[:alnum:]]', '', 'g')))
                 ) AS score
          FROM provider_companies pc
          WHERE (:company_id IS NULL OR pc.id <> :company_id)
            AND (
              UPPER(REGEXP_REPLACE(COALESCE(pc.full_names, ''), '[^[:alnum:]]', '', 'g')) % :name
              OR UPPER(REGEXP_REPLACE(COALESCE(pc.commercial_name, ''), '[^[:alnum:]]', '', 'g')) % :name
              OR UPPER(REGEXP_REPLACE(COALESCE(pc.full_names, ''), '[^[:alnum:]]', '', 'g')) <% :name
              OR UPPER(REGEXP_REPLACE(COALESCE(pc.commercial_name, ''), '[^[:alnum:]]', '', 'g')) <% :name
              OR :name <% UPPER(REGEXP_REPLACE(COALESCE(pc.full_names, ''), '[^[:alnum:]]', '', 'g'))
              OR :name <% UPPER(REGEXP_REPLACE(COALESCE(pc.commercial_name, ''), '[^[:alnum:]]', '', 'g'))
            )
        )
        SELECT id, full_names, number_document, cellphone, commercial_name, kind, score
        FROM candidates
        WHERE score >= 0.48
        ORDER BY score DESC, id ASC
        LIMIT 1
      `, {
        replacements: { name, provider_id: exclusions.providerId || null, company_id: exclusions.companyId || null },
        type: QueryTypes.SELECT,
        transaction,
        logging: false,
      });
      if (rows[0]) candidates.push({ ...rows[0], match_quality: 'APPROXIMATE' });
    }
    return candidates.sort((left, right) => Number(right.score) - Number(left.score))[0] || null;
  }

  async findDuplicate(data, transaction) {
    const duplicates = await this.findIdentityDuplicates(data, transaction);
    return duplicates.duplicate;
  }

  async assertIdentityAvailable(data, exclusions = {}, transaction) {
    const duplicates = await this.findIdentityDuplicates({
      number_document: data.number_document,
      cellphone: data.cellphone || data.corporate_cellphone,
      full_names: data.full_names,
      commercial_name: data.commercial_name,
      exclude_provider_id: exclusions.providerId,
      exclude_company_id: exclusions.companyId,
    }, transaction);
    const messages = [];
    if (duplicates.number_document) messages.push(`El CI/NIT ya está asignado a ${duplicates.number_document.full_names || 'otro proveedor'}`);
    if (duplicates.cellphone) messages.push(`El celular ya está asignado a ${duplicates.cellphone.full_names || 'otro proveedor'}`);
    const hasDocumentOrPhone = normalizeProviderDocument(data.number_document)
      || normalizeProviderPhone(data.cellphone || data.corporate_cellphone);
    if (!hasDocumentOrPhone && duplicates.full_names) {
      const matchName = duplicates.full_names.full_names || duplicates.full_names.commercial_name || 'proveedor';
      messages.push(duplicates.full_names.match_quality === 'APPROXIMATE'
        ? `El nombre o razón social es parecido al de una ficha existente (${matchName})`
        : `El nombre o razón social ya figura en una ficha de ${matchName}`);
    }
    if (!messages.length) return;
    const error = new Error(messages.join('. '));
    error.statusCode = 409;
    error.field = duplicates.number_document ? 'number_document'
      : duplicates.cellphone ? (data.corporate_cellphone ? 'corporate_cellphone' : 'cellphone')
      : 'full_names';
    throw error;
  }

  async lockProviderIdentity(data, transaction) {
    const keys = [...new Set([
      normalizeProviderDocument(data.number_document) && `provider-document:${normalizeProviderDocument(data.number_document)}`,
      normalizeProviderPhone(data.cellphone || data.corporate_cellphone) && `provider-phone:${normalizeProviderPhone(data.cellphone || data.corporate_cellphone)}`,
      ...[data.full_names, data.commercial_name].map(normalizeProviderName).filter(Boolean).map(name => `provider-name:${name}`),
    ].filter(Boolean))].sort();
    for (const key of keys) {
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
        replacements: { key }, transaction, logging: false,
      });
    }
  }

  async validateCommercial(providerId, data, user) {
    if (!this.canManageProviderClassification(user)) throw this.classificationPermissionError();
    const typeId = Number(data.id_type_provider);
    return sequelize.transaction(async (transaction) => {
      const type = Number.isInteger(typeId) && typeId > 0
        ? await TypesProvider.findOne({ where: { id: typeId, status: true }, attributes: ['id', 'code'], transaction })
        : null;
      if (!type || !COMMERCIAL_PROVIDER_TYPE_CODES.includes(type.code)) {
        throw this.validationError('La clasificación comercial debe ser A, B, C o D');
      }
      if (type.code === 'A') this.validateTypeA(data);
      const provider = await this.requireProvider(providerId, transaction);
      await this.lockProviderIdentity(provider, transaction);
      await this.assertIdentityAvailable(provider, { providerId: provider.id, companyId: provider.id_provider_company }, transaction);
      await provider.update({ ...this.pick(data, COMMERCIAL_FIELDS), id_type_provider: type.id, estado_registro: 'VALIDADO', id_commercial_user: user?.id || user }, { transaction });
      if (Array.isArray(data.enabled_sucursal_ids)) {
        await providerAvailability.syncAuthorized(provider.id, data.enabled_sucursal_ids, user, transaction);
      }
      await this.syncDetails(provider, data, transaction);
      return this.getProviderDetails(provider.id, transaction);
    });
  }

  async updateProfile(providerId, data, user) {
    return sequelize.transaction(async (transaction) => {
      const provider = await this.requireProvider(providerId, transaction);
      await this.lockProviderIdentity(data, transaction);
      await this.assertIdentityAvailable(data, { providerId: provider.id, companyId: provider.id_provider_company }, transaction);
      if (Object.prototype.hasOwnProperty.call(data, 'id_type_provider')) {
        await this.assertProviderTypeChangeAllowed(provider.id_type_provider, data.id_type_provider, user, transaction);
      }
      await this.validateProfile({ ...data, id_type_provider: data.id_type_provider ?? provider.id_type_provider }, transaction);
      const profileData = this.pick(data, PROFILE_FIELDS);
      const nextType = data.id_type_provider ? await this.getCurrentProviderType(data.id_type_provider, transaction) : null;
      if (nextType && Number(data.id_type_provider) !== Number(provider.id_type_provider)) {
        profileData.estado_registro = nextType.code === UNCLASSIFIED_PROVIDER_TYPE_CODE ? 'PENDIENTE' : 'VALIDADO';
      }
      delete profileData.id_sucursal;
      await provider.update(profileData, { transaction });
      if (Array.isArray(data.enabled_sucursal_ids)) {
        await providerAvailability.syncAuthorized(provider.id, data.enabled_sucursal_ids, user, transaction);
      }

      await this.syncMainBranch(provider, data, transaction);
      await this.syncMainContact(provider, data, transaction);
      await this.syncMainMaterial(provider, data, transaction);
      await this.syncMainBankAccount(provider, data, transaction);
      await this.syncDetails(provider, data, transaction);

      return this.getProviderDetails(provider.id, transaction);
    });
  }

  async saveDetail(providerId, kind, data, detailId = null) {
    const config = DETAIL_MODELS[kind];
    if (!config) throw new Error('Tipo de detalle de proveedor no válido');
    return sequelize.transaction(async (transaction) => {
      const provider = await this.requireProvider(providerId, transaction);
      let detail;
      if (detailId) {
        detail = await config.model.findOne({ where: { id: detailId, id_provider: provider.id }, transaction });
        if (!detail) throw new Error('El detalle del proveedor no existe');
        await detail.update(data, { transaction });
      } else detail = await config.model.create({ ...data, id_provider: provider.id }, { transaction });
      await this.normalizePrimary(provider, config, detail, transaction);
      return detail.reload({ transaction });
    });
  }

  async deleteDetail(providerId, kind, detailId) {
    const config = DETAIL_MODELS[kind];
    if (!config) throw new Error('Tipo de detalle de proveedor no válido');
    return sequelize.transaction(async (transaction) => {
      await this.requireProvider(providerId, transaction);
      const detail = await config.model.findOne({ where: { id: detailId, id_provider: providerId }, transaction });
      if (!detail) throw new Error('El detalle del proveedor no existe');
      await detail.update({ status: false, ...(config.primaryField ? { [config.primaryField]: false } : {}) }, { transaction });
    });
  }

  async getProviderDetails(providerId, transaction) {
    const provider = await Provider.findByPk(providerId, {
      include: [
        { association: 'sector', attributes: ['id', 'name'], required: false },
        { association: 'type', attributes: ['id', 'name', 'code'], required: false },
        { association: 'category', attributes: ['id', 'name'], required: false },
        { association: 'sucursal', attributes: ['id', 'name', 'city'], required: false },
        { association: 'commercialUser', attributes: ['id', 'full_names'], required: false },
        { association: 'company', required: false, include: [{ association: 'operatingProviders', attributes: ['id', 'full_names', 'number_document', 'direction', 'site_role', 'status'], required: false }] },
        { association: 'branches', where: { status: true }, required: false },
        // Incluye inactivos para que edición permita reactivarlos y conserve su estado.
        { association: 'contacts', required: false },
        { association: 'bankAccounts', where: { status: true }, required: false, include: [{ association: 'bank' }] },
        { association: 'materials', where: { status: true }, required: false, include: [{ association: 'category' }, { association: 'product' }] },
      ], transaction,
    });
    if (!provider) return null;
    provider.setDataValue('enabled_sucursal_ids', await providerAvailability.enabledBranchIds(providerId, transaction));
    return provider;
  }

  async syncDetails(provider, data, transaction) {
    for (const [kind, config] of Object.entries(DETAIL_MODELS)) {
      if (!Array.isArray(data[kind])) continue;
      const existing = await config.model.findAll({ where: { id_provider: provider.id }, transaction });
      const receivedIds = [];
      const incomingMain = config.primaryField && data[kind].find((item) => item[config.primaryField] && item.status !== false);
      if (incomingMain) {
        await config.model.update(
          { [config.primaryField]: false },
          { where: { id_provider: provider.id, [config.primaryField]: true }, transaction },
        );
      }
      for (const item of data[kind]) {
        if (kind === 'bankAccounts' && item.status !== false) {
          const bank = await Bank.findByPk(item.id_bank, { transaction });
          if (!bank || !bank.status) throw this.validationError('El banco seleccionado no existe o está inactivo');
        }
        if (kind === 'materials' && item.status !== false && item.id_product) {
          const product = await Product.findByPk(item.id_product, { transaction });
          if (!product) throw this.validationError('El producto seleccionado no existe');
          item.id_category = product.id_category;
        }
        const existingDetail = (item.id && existing.find((detail) => Number(detail.id) === Number(item.id)))
          || this.findByNaturalKey(existing, item, config.naturalKey);
        const values = { ...item };
        delete values.id;
        if (existingDetail) {
          await existingDetail.update({ ...values, status: item.status !== false }, { transaction });
          receivedIds.push(Number(existingDetail.id));
        } else {
          const created = await config.model.create({ ...values, id_provider: provider.id, status: item.status !== false }, { transaction });
          receivedIds.push(Number(created.id));
        }
      }
      for (const detail of existing.filter((item) => !receivedIds.includes(Number(item.id)))) {
        await detail.update({ status: false, ...(config.primaryField ? { [config.primaryField]: false } : {}) }, { transaction });
      }
      if (config.primaryField) {
        const main = await config.model.findOne({ where: { id_provider: provider.id, [config.primaryField]: true, status: true }, transaction });
        if (main) await this.normalizePrimary(provider, config, main, transaction);
      }
    }
  }

  findByNaturalKey(existing, item, fields = []) {
    if (!fields.length) return null;
    return existing.find((detail) => fields.every((field) => String(detail[field] ?? '') === String(item[field] ?? ''))) || null;
  }

  async normalizePrimary(provider, config, detail, transaction) {
    if (!config.primaryField || !detail[config.primaryField]) return;
    await config.model.update({ [config.primaryField]: false }, { where: { id_provider: provider.id, id: { [Op.ne]: detail.id } }, transaction });
    if (config.mirror === 'branch') await provider.update({ direction: detail.address || detail.city || null }, { transaction });
    if (config.mirror === 'contact') await provider.update({ name_contact: detail.full_name, cellphone_contact: detail.cellphone || null }, { transaction });
  }

  async syncMainBranch(provider, data, transaction) {
    const fields = ['department', 'city', 'zone', 'direction', 'latitude', 'longitude', 'geolocation_text', 'google_maps_url'];
    if (!fields.some((field) => this.hasValue(data[field]))) return;
    const branch = await ProviderBranch.findOne({ where: { id_provider: provider.id, is_main: true }, transaction });
    const values = {
      branch_name: branch?.branch_name || 'SEDE PRINCIPAL',
      department: this.blankToNull(data.department),
      city: this.blankToNull(data.city),
      zone: this.blankToNull(data.zone),
      address: this.blankToNull(data.direction),
      latitude: this.blankToNull(data.latitude),
      longitude: this.blankToNull(data.longitude),
      geolocation_text: this.blankToNull(data.geolocation_text),
      google_maps_url: this.blankToNull(data.google_maps_url),
      is_main: true,
      status: true,
    };
    if (branch) await branch.update(values, { transaction });
    else await ProviderBranch.create({ ...values, id_provider: provider.id }, { transaction });
  }

  async syncMainContact(provider, data, transaction) {
    const fields = ['name_contact', 'workAreaOrPositionOrUnit', 'cellphone_contact', 'contact_email'];
    if (!fields.some((field) => this.hasValue(data[field]))) return;
    if (!this.hasValue(data.name_contact)) throw this.validationError('El nombre del contacto es obligatorio cuando se registra información de contacto');
    const contact = await ProviderContact.findOne({ where: { id_provider: provider.id, is_main_contact: true }, transaction });
    const values = {
      full_name: data.name_contact,
      position_area: this.blankToNull(data.workAreaOrPositionOrUnit),
      cellphone: this.blankToNull(data.cellphone_contact),
      email: this.blankToNull(data.contact_email),
      is_main_contact: true,
      status: true,
    };
    if (contact) await contact.update(values, { transaction });
    else await ProviderContact.create({ ...values, id_provider: provider.id }, { transaction });
  }

  async syncMainMaterial(provider, data, transaction) {
    if (!this.hasValue(data.id_category)) return;
    const material = await ProviderMaterial.findOne({ where: { id_provider: provider.id, id_category: data.id_category }, transaction });
    if (material) await material.update({ status: true }, { transaction });
    else await ProviderMaterial.create({ id_provider: provider.id, id_category: data.id_category, status: true }, { transaction });
  }

  async syncMainBankAccount(provider, data, transaction) {
    const fields = ['id_bank', 'account_holder', 'account_number'];
    if (!fields.some((field) => this.hasValue(data[field]))) return;
    if (!fields.every((field) => this.hasValue(data[field]))) throw this.validationError('Complete banco, titular y número de cuenta para registrar la cuenta bancaria');
    const bank = await Bank.findByPk(data.id_bank, { transaction });
    if (!bank || !bank.status) throw this.validationError('El banco seleccionado no existe o está inactivo');
    const account = await ProviderBankAccount.findOne({ where: { id_provider: provider.id, is_main: true }, transaction });
    const values = {
      id_bank: data.id_bank,
      account_holder: data.account_holder,
      account_number: data.account_number,
      account_type: data.account_type || account?.account_type || 'OTRA',
      currency: data.currency || account?.currency || 'BOB',
      qr_file_name: this.blankToNull(data.qr_file_name) || account?.qr_file_name,
      qr_original_name: this.blankToNull(data.qr_original_name) || account?.qr_original_name,
      is_main: true,
      status: true,
    };
    if (account) await account.update(values, { transaction });
    else await ProviderBankAccount.create({ ...values, id_provider: provider.id }, { transaction });
  }

  async requireProvider(id, transaction) {
    const provider = await Provider.findByPk(id, { transaction });
    if (!provider) throw new Error('El proveedor no existe');
    return provider;
  }

  pick(source, keys) {
    return Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]]));
  }

  async validateProfile(data, transaction) {
    validateRegistrationFields(data);
    const type = data.id_type_provider
      ? await this.getCurrentProviderType(data.id_type_provider, transaction)
      : null;
    if (type && data.full_names != null) {
      for (const field of ['department', 'id_commercial_user', 'origin_channel', 'relationship_status', 'frequency', 'service_mode']) {
        if (!this.hasValue(data[field])) throw this.validationError(`El campo ${field} es obligatorio`);
      }
      if (!isProviderCatalogValue('origin_channel', data.origin_channel)) {
        throw this.validationError('El valor de origin_channel no pertenece al catálogo permitido');
      }
      if (Array.isArray(data.materials) && !data.materials.some(item => item.status !== false)) throw this.validationError('Seleccione al menos un producto');
      if (type.code === 'B' && !(data.contacts || []).some(item => item.status !== false)) throw this.validationError('Registre al menos un contacto comercial');
    }
    validateWholesaleProfile(data, type?.code);
  }

  canManageProviderClassification(user) {
    return ['COMERCIAL', 'ADMINISTRADOR'].includes(user?.role);
  }

  async getCurrentProviderType(typeId, transaction) {
    const type = await TypesProvider.findOne({
      where: { id: Number(typeId), status: true },
      attributes: ['id', 'code'],
      transaction,
    });
    if (!type) throw this.validationError('El tipo de proveedor no existe o está inactivo');
    if (!PROVIDER_TYPE_CODES.includes(type.code)) {
      throw this.validationError('El tipo de proveedor no pertenece al catálogo vigente (A, B, C, D, F)');
    }
    return type;
  }

  async assertProviderTypeChangeAllowed(currentTypeId, nextTypeId, user, transaction) {
    const [currentType, nextType] = await Promise.all([
      currentTypeId ? TypesProvider.findByPk(currentTypeId, { attributes: ['code'], transaction }) : null,
      nextTypeId ? TypesProvider.findByPk(nextTypeId, { attributes: ['code'], transaction }) : null,
    ]);
    if ((currentType?.code || null) === (nextType?.code || null)) return;
    if (this.canManageProviderClassification(user)) return;
    if (!currentType && nextType?.code === UNCLASSIFIED_PROVIDER_TYPE_CODE) return;
    throw this.classificationPermissionError();
  }

  classificationPermissionError() {
    return Object.assign(new Error('Solo el Área Comercial puede asignar o cambiar la clasificación del proveedor.'), { statusCode: 403 });
  }

  hasValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
  }

  blankToNull(value) {
    return this.hasValue(value) ? value : null;
  }

  validationError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
  }

  validateTypeA(data) {
    const missing = [];
    const required = ['full_names', 'number_document', 'entity_type', 'frequency', 'service_mode', 'origin_channel', 'relationship_status'];
    required.forEach((field) => { if (!data[field]) missing.push(field); });
    if (typeof data.requires_certificate !== 'boolean') missing.push('requires_certificate');
    if (typeof data.requires_traceability_report !== 'boolean') missing.push('requires_traceability_report');
    const branch = (data.branches || []).find((item) => item.is_main && item.status !== false);
    if (!branch || !branch.department || !branch.address) missing.push('sede_principal');
    const contact = (data.contacts || []).find((item) => item.is_main_contact && item.status !== false);
    if (!contact || !contact.full_name || !contact.cellphone) missing.push('contacto_principal');
    if (!Array.isArray(data.materials) || !data.materials.some((item) => item.status !== false && item.id_category)) missing.push('materials');
    if (missing.length) throw new Error(`Faltan datos obligatorios de Tipo A: ${missing.join(', ')}`);
  }
}

module.exports = new ProviderService();
