const { Provider, ProviderBranch, ProviderContact, ProviderBankAccount, ProviderMaterial, Product, Bank, sequelize } = require('../database/config');
const { Op } = require('sequelize');

const COMMERCIAL_FIELDS = [
  'full_names', 'number_document', 'cellphone', 'id_sector', 'id_category', 'id_sucursal',
  'commercial_name', 'entity_type', 'origin_channel', 'relationship_status', 'negotiation_condition',
  'commercial_observations', 'requires_certificate', 'requires_traceability_report', 'service_mode',
  'general_observations', 'frequency', 'id_commercial_user', 'department', 'zone',
  'certificate_file_name', 'traceability_file_name', 'frequency_mode'
];
const PROFILE_FIELDS = [...new Set([...COMMERCIAL_FIELDS, 'direction', 'mayorista', 'name_contact', 'companyContacts', 'workAreaOrPositionOrUnit', 'cellphone_contact', 'id_type_provider', 'status'])];

const DETAIL_MODELS = {
  branches: { model: ProviderBranch, primaryField: 'is_main', mirror: 'branch' },
  contacts: { model: ProviderContact, primaryField: 'is_main_contact', mirror: 'contact', naturalKey: ['full_name', 'cellphone'] },
  bankAccounts: { model: ProviderBankAccount, primaryField: 'is_main', naturalKey: ['id_bank', 'account_number'] },
  materials: { model: ProviderMaterial, naturalKey: ['id_product'] },
};

class ProviderService {
  async createProfile(data) {
    return sequelize.transaction(async (transaction) => {
      const provider = await Provider.create(this.pick(data, PROFILE_FIELDS), { transaction });

      await this.syncMainBranch(provider, data, transaction);
      await this.syncMainContact(provider, data, transaction);
      await this.syncMainMaterial(provider, data, transaction);
      await this.syncMainBankAccount(provider, data, transaction);

      return this.getProviderDetails(provider.id, transaction);
    });
  }

  async findAutocompleteProviders(query = '') {
    return Provider.findAll({
      attributes: ['id', 'full_names', 'number_document', 'estado_registro'],
      where: { status: true, [Op.or]: [{ full_names: { [Op.iLike]: `%${query}%` } }, { number_document: { [Op.iLike]: `%${query}%` } }] },
      include: [{ association: 'type', attributes: ['code'] }],
      limit: 20,
    });
  }

  async preRegisterProvider(data, idSucursal) {
    return sequelize.transaction((transaction) => Provider.create({
      full_names: data.full_names,
      number_document: data.number_document || null,
      cellphone: data.cellphone || null,
      id_sucursal: idSucursal,
      id_sector: data.id_sector || null,
      id_category: data.id_category || null,
      id_type_provider: 6,
      estado_registro: 'PENDIENTE',
      origin_channel: data.origin_channel || 'BALANZA',
      status: true,
    }, { transaction }));
  }

  async findDuplicate({ number_document, cellphone }) {
    const matches = [];
    if (number_document) matches.push({ number_document });
    if (cellphone) matches.push({ cellphone: String(cellphone) });
    if (!matches.length) return null;
    return Provider.findOne({
      attributes: ['id', 'full_names', 'number_document', 'cellphone', 'estado_registro'],
      where: { [Op.or]: matches }, order: [['id', 'ASC']],
    });
  }

  async validateCommercial(providerId, data, commercialUserId) {
    const typeId = Number(data.id_type_provider);
    if (!Number.isInteger(typeId) || typeId < 1 || typeId > 5) throw new Error('La clasificación comercial debe ser una categoría entre A y E');
    if (typeId === 1) this.validateTypeA(data);
    return sequelize.transaction(async (transaction) => {
      const provider = await this.requireProvider(providerId, transaction);
      await provider.update({ ...this.pick(data, COMMERCIAL_FIELDS), id_type_provider: typeId, estado_registro: 'VALIDADO', id_commercial_user: commercialUserId }, { transaction });
      await this.syncDetails(provider, data, transaction);
      return this.getProviderDetails(provider.id, transaction);
    });
  }

  async updateProfile(providerId, data) {
    return sequelize.transaction(async (transaction) => {
      const provider = await this.requireProvider(providerId, transaction);
      await provider.update(this.pick(data, PROFILE_FIELDS), { transaction });

      await this.syncMainBranch(provider, data, transaction);
      await this.syncMainContact(provider, data, transaction);
      await this.syncMainMaterial(provider, data, transaction);
      await this.syncMainBankAccount(provider, data, transaction);

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
    return Provider.findByPk(providerId, {
      include: [
        { association: 'sector', attributes: ['id', 'name'], required: false },
        { association: 'type', attributes: ['id', 'name', 'code'], required: false },
        { association: 'category', attributes: ['id', 'name'], required: false },
        { association: 'sucursal', attributes: ['id', 'name', 'city'], required: false },
        { association: 'commercialUser', attributes: ['id', 'full_names'], required: false },
        { association: 'company', required: false, include: [{ association: 'operatingProviders', attributes: ['id', 'full_names', 'number_document', 'direction', 'site_role', 'status'], required: false }] },
        { association: 'branches', where: { status: true }, required: false },
        { association: 'contacts', where: { status: true }, required: false },
        { association: 'bankAccounts', where: { status: true }, required: false, include: [{ association: 'bank' }] },
        { association: 'materials', where: { status: true }, required: false, include: [{ association: 'category' }, { association: 'product' }] },
      ], transaction,
    });
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
    const fields = ['department', 'province', 'city', 'zone', 'direction', 'latitude', 'longitude', 'geolocation_text', 'google_maps_url'];
    if (!fields.some((field) => this.hasValue(data[field]))) return;
    const branch = await ProviderBranch.findOne({ where: { id_provider: provider.id, is_main: true }, transaction });
    const values = {
      branch_name: branch?.branch_name || 'SEDE PRINCIPAL',
      department: this.blankToNull(data.department),
      province: this.blankToNull(data.province),
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
    if (!branch || !branch.department || !branch.city || !branch.address) missing.push('sede_principal');
    const contact = (data.contacts || []).find((item) => item.is_main_contact && item.status !== false);
    if (!contact || !contact.full_name || !contact.position_area || !contact.cellphone) missing.push('contacto_principal');
    if (!Array.isArray(data.materials) || !data.materials.some((item) => item.status !== false && item.id_category)) missing.push('materials');
    if (missing.length) throw new Error(`Faltan datos obligatorios de Tipo A: ${missing.join(', ')}`);
  }
}

module.exports = new ProviderService();
