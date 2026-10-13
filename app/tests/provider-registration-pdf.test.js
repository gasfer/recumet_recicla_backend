const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { validateSheet, registrationDocument, createRegistrationPdf } = require('../services/provider-registration-pdf');
const { renderReportHtml } = require('../helpers/generator-pdf/report-html.template');
const { closePdfRenderer } = require('../services/pdf/report-pdf.service');
const { inspectPdf } = require('./pdf-inspection.helper');
const sheet = { name: 'Proveedor de prueba', reference: 'ID: 123', status: 'Activo', sections: [{ id: 1, title: 'Identificación Legal & Tipo de Proveedor', fields: [{ label: 'CI / NIT', value: '0012345' }], records: [] }] };
after(() => closePdfRenderer());
test('la ficha valida contenido y rechaza estructuras o textos sin límite', () => {
 assert.equal(validateSheet(sheet),true);
 assert.equal(validateSheet({ ...sheet, sections: [{ ...sheet.sections[0], id: '<script>' }] }),false);
 assert.equal(validateSheet({ ...sheet, sections: [{ ...sheet.sections[0], fields: [{ label: 'Nombre', value: 'a'.repeat(6001) }] }] }),false);
 assert.equal(validateSheet({ ...sheet, sections: null }),false);
});
test('omite el enlace de Google Maps sin modificar los datos de origen', () => {
 const source = { ...sheet, sections: [...sheet.sections, { id: 2, title: 'Ubicación', fields: [{ label: 'Enlace de Google Maps', value: 'https://maps.google.com/private-link' }, { label: 'Dirección empresa', value: 'Dirección registrada' }], records: [] }] };
 const html = renderReportHtml(registrationDocument(source));
 assert.ok(html.includes('Dirección registrada')); assert.ok(!html.includes('private-link')); assert.equal(source.sections[1].fields.length,2);
});
test('PDF paginado conserva textos largos, contactos y cuentas sin errores', { skip: !process.env.PDF_QA_PYTHON }, async () => {
 const short = inspectPdf(await createRegistrationPdf(sheet)); assert.equal(short.length,1);
 const records = Array.from({ length:45 }, (_,i) => ({ title: 'Cuenta '+(i+1), fields: [{ label:'N.º de cuenta',value:'000000'+i }, {label:'Titular',value:'Nombre largo '.repeat(20)}] }));
 const pdf = await createRegistrationPdf({ ...sheet, sections:[...sheet.sections,{id:7,title:'Información bancaria de la sede',fields:[],records},{id:8,title:'Observaciones',fields:[{label:'Observaciones generales',value:'Observación '.repeat(450)}],records:[]}] });
 const pages=inspectPdf(pdf); assert.ok(pages.length>1); const text=pages.map(p=>p.text).join(' '); assert.ok(text.includes('00000044')); assert.ok(text.includes('Observaciones generales')); assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
});
