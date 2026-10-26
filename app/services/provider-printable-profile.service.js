'use strict';

const providerCompanyService = require('./provider-company.service');
const { getProviderPurchaseHistory } = require('./provider-purchase-history.service');

const money = value => `Bs ${Number(value || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const field = (label, value) => ({ label, value: value == null || value === '' ? '—' : String(value) });
const maskAccount = value => {
    const digits = String(value || '').replace(/\s/g, '');
    return digits ? (digits.length <= 4 ? '•'.repeat(digits.length) : `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`) : '—';
};

const buildProviderPrintableProfile = async companyId => {
    const company = await providerCompanyService.details(companyId);
    if (!company) throw Object.assign(new Error('La empresa matriz no existe.'), { statusCode: 404 });
    const sites = (company.operatingProviders || []).filter(site => site.status !== false);
    const primary = sites.find(site => site.site_role === 'HEADQUARTERS') || sites[0];
    const history = primary
        ? await getProviderPurchaseHistory({ providerId: primary.id, page: 1, limit: 50 })
        : { data: [], summary: { purchased_kg: 0, purchased_amount: 0, paid_amount: 0, pending_amount: 0, purchase_count: 0, active_sites: 0 } };
    const sections = [];
    const panels = [{
        title: '1. IDENTIFICACIÓN CORPORATIVA',
        fields: [
            field('Razón social', company.full_names), field('Nombre comercial', company.commercial_name),
            field('NIT', company.number_document), field('Tipo de entidad', company.entity_type),
            field('Teléfono', company.corporate_phone), field('Celular', company.corporate_cellphone),
            field('Correo', company.corporate_email), field('Sitio web', company.website),
        ],
    }];
    panels.push({
        title: '2. UBICACIÓN POR SEDE',
        fields: sites.flatMap(site => [
            field(`${site.site_role === 'HEADQUARTERS' ? 'Casa matriz' : 'Sede'} · ${site.full_names}`, [site.location?.department, site.location?.city].filter(Boolean).join(' · ')),
            field('Dirección', site.location?.address), field('Zona', site.location?.zone),
        ]),
    });
    panels.push({
        title: '3. CONTACTOS POR SEDE',
        fields: sites.flatMap(site => (site.contacts || []).map(contact => field(`${site.full_names} · ${contact.full_name}${contact.is_main_contact ? ' (principal)' : ''}`, [contact.position_area, contact.cellphone, contact.email].filter(Boolean).join(' · ')))),
    });
    panels.push({
        title: '4. OPERACIÓN POR SEDE',
        fields: sites.flatMap(site => [
            field(site.full_names, (site.materials || []).map(material => material.product?.name || material.category?.name).filter(Boolean).join(', ')),
            field('Frecuencia / modalidad', `${site.frequency || '—'} / ${site.service_mode || '—'}`),
        ]),
    });
    panels.push({
        title: '5. GESTIÓN COMERCIAL',
        fields: [field('Canal de origen', company.origin_channel), field('Estado de relación', company.relationship_status), field('Condición de negociación', company.negotiation_condition), field('Responsable', company.commercialUser?.full_names)],
    });
    panels.push({
        title: '6. DOCUMENTOS',
        fields: [
            field('Certificado requerido', company.requires_certificate ? 'Sí' : 'No'),
            field('Certificado', (company.documents || []).find(document => document.document_type === 'CERTIFICATE')?.original_name || 'Sin documento registrado'),
            field('Informe de trazabilidad requerido', company.requires_traceability_report ? 'Sí' : 'No'),
            field('Informe de trazabilidad', (company.documents || []).find(document => document.document_type === 'TRACEABILITY_REPORT')?.original_name || 'Sin documento registrado'),
        ],
    });
    panels.push({
        title: '7. CUENTAS BANCARIAS',
        fields: sites.flatMap(site => (site.bankAccounts || []).map(account => field(`${site.full_names} · ${account.bank?.name || 'Banco'}${account.is_main ? ' (principal)' : ''}`, `${account.account_holder} · ${account.account_type} · ${account.currency} · ${maskAccount(account.account_number)}`))),
    });
    panels.push({ title: '8. OBSERVACIONES', fields: [field('Observaciones generales', company.general_observations), field('Observaciones comerciales', company.commercial_observations)] });

    const rows = history.data.map(purchase => [
        purchase.provider?.full_names || purchase.sucursal?.name || '—',
        purchase.registry_number || purchase.cod || '—',
        purchase.date_voucher ? new Date(purchase.date_voucher).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' }) : '—',
        Number(purchase.total_kg || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 }),
        Number(purchase.average_cost_per_kg || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        money(purchase.cost),
    ]);
    rows.push({ kind: 'total', cells: ['CONSOLIDADO', `${history.summary.purchase_count} boletas`, '', `${Number(history.summary.purchased_kg || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })} kg`, '', money(history.summary.purchased_amount)] });
    sections.push({
        title: 'COMPRAS Y CUENTAS POR PAGAR · SEDES ACTIVAS',
        columns: [{ label: 'SEDE' }, { label: 'BOLETA' }, { label: 'FECHA' }, { label: 'KG', align: 'right' }, { label: 'COSTO PROM. / KG', align: 'right' }, { label: 'TOTAL', align: 'right' }],
        rows,
        footer: { label: `Pagado: ${money(history.summary.paid_amount)} · Pendiente: ${money(history.summary.pending_amount)} · Sedes activas: ${history.summary.active_sites}`, totalLabel: 'Total comprado', total: money(history.summary.purchased_amount) },
    });
    return {
        variant: 'profile', paper: 'A4', title: 'FICHA CORPORATIVA DE PROVEEDOR', reference: `PROVEEDOR ${company.id}`,
        date: new Date().toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' }),
        company: { branchName: 'RECUMET · GESTIÓN DE PROVEEDORES' }, panels, sections,
        observations: 'Documento informativo de solo lectura. Los números de cuenta se muestran parcialmente ocultos.',
    };
};

module.exports = { buildProviderPrintableProfile, maskAccount };
