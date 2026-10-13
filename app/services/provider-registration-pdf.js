const { generateReportPdf } = require('./pdf/report-pdf.service');
function validateSheet(sheet) {
    const text = (value, max) => typeof value === 'string' && value.length <= max;
    const fields = values => Array.isArray(values) && values.length <= 40 && values.every(field => field && text(field.label, 160) && text(field.value, 6000));
    if (!sheet || !text(sheet.name, 200) || !text(sheet.reference, 100) || !text(sheet.status, 20) || !Array.isArray(sheet.sections) || sheet.sections.length > 8 || !sheet.sections.length) return false;
    return sheet.sections.every(section => section && Number.isInteger(section.id) && section.id >= 1 && section.id <= 8 && text(section.title, 160) && fields(section.fields) && Array.isArray(section.records) && section.records.length <= 100 && section.records.every(record => record && text(record.title, 200) && fields(record.fields)));
}

const registrationDocument = sheet => ({
    variant: 'profile', paper: 'A4', title: 'FICHA TÉCNICA DE PROVEEDOR', reference: sheet.reference,
    date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
    panels: [
        { title: 'IDENTIFICACIÓN', fields: [{ label: 'Proveedor', value: sheet.name }, { label: 'Estado', value: sheet.status }] },
        ...sheet.sections.flatMap(section => [
            { title: section.title, fields: section.fields.filter(field => field.label !== 'Enlace de Google Maps') },
            ...section.records.map(record => ({ title: record.title, fields: record.fields.filter(field => field.label !== 'Enlace de Google Maps') })),
        ]),
    ],
});
const createRegistrationPdf = sheet => generateReportPdf(registrationDocument(sheet));
module.exports = { validateSheet, registrationDocument, createRegistrationPdf, createRegistrationHtmlPdf: createRegistrationPdf };
