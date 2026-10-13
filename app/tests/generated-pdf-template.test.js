const test = require('node:test');
const assert = require('node:assert/strict');
const { generateReportPdf, closePdfRenderer } = require('../services/pdf/report-pdf.service');
const { buildCashVoucher } = require('../helpers/generator-pdf/cash-voucher.document');
const { buildOperationVoucher } = require('../helpers/generator-pdf/operation-voucher.document');
const { inspectPdf } = require('./pdf-inspection.helper');
test.after(() => closePdfRenderer());
const options = { skip: !process.env.PDF_QA_PYTHON };
test('reporte largo conserva orientación, logo, título y todas las filas',options, async () => {
 const title='REPORTE DE COMPRAS - DETALLE COSTO PROMEDIO';
 const pdf=await generateReportPdf({title,orientation:'landscape',paper:'LETTER',columns:[{label:'CÓDIGO',width:60},{label:'PRODUCTO',width:300},{label:'IMPORTE',width:80}],rows:Array.from({length:150},(_,i)=>['QA-'+(i+1),'Material reciclable','100.00'])});
 const pages=inspectPdf(pdf); assert.ok(pages.length>1); assert.equal(pages[0].width,792); const text=pages.map(p=>p.text).join(' '); assert.ok(text.includes(title)); for(let i=1;i<=150;i++)assert.ok(text.includes('QA-'+i)); assert.ok(pdf.toString('latin1').includes('/Subtype /Image'));
});
test('arqueo financiero conserva saldos y logo en su formato',options, async () => {
 const document=buildCashVoucher({id:42,date_apertura:'2026-10-09',monto_apertura:100,sucursal:{name:'MATRIZ',company:{nit:'123456'}},user:{full_names:'Cajero QA'}},{saldo:125,monto_apertura_mas_saldo:225,ingresos:[],gastos:[],total_ingresos:50,total_gastos:25},2);
 const pdf=await generateReportPdf(document); const pages=inspectPdf(pdf); assert.equal(pages.length,1); assert.ok(Math.abs(pages[0].width-595.28)<1); assert.match(pages[0].text,/125.00/); assert.match(pages[0].text,/225.00/); assert.doesNotMatch(pages[0].text,/NaN/);
});
test('encabezado compartido cabe en rollo de 80 mm con logo y correlativo',options, async () => {
 const pdf=await generateReportPdf(buildOperationVoucher({cod:'QA-42',date_voucher:'2026-10-09',sucursal:{company:{nit:'123456'},email:'prueba@recumet.com'},detailsInput:[{quantity:10,product:{cod:'P1',name:'Metal',unit:{siglas:'KG'}}}]},{kind:'purchase',format:'rollo',decimal:2}));
 const pages=inspectPdf(pdf); assert.equal(pages.length,1); assert.ok(Math.abs(pages[0].width-226.77)<1); assert.ok(pages[0].text.includes('QA-42')); assert.ok(pages[0].text.includes('Metal'));
});
