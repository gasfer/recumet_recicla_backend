const { CajaSmall } = require('../../database/config');
const PdfPrinter = require('pdfmake');
const fonts = require('../../helpers/generator-pdf/fonts');
const styles = require('../../helpers/generator-pdf/styles');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const { getReportLogoPath } = require('../../helpers/report-logo');
const imagePath = getReportLogoPath();
const { response } = require("express");
const { getNumberDecimal } = require("../../helpers/company");
const { getTotalesAndMovements } = require('../caja_small.controller');
const {
    buildHeader,
    buildHr,
    buildSectionTitle,
    buildInfoPanel,
    buildDetailTable,
    buildClosingSection,
    VOUCHER_THEME,
} = require('../../helpers/generator-pdf/voucher-template.helper');
const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',hour: "numeric",
minute: "numeric",
second: "numeric", };

moment.locale('es'); 


const printCaja = async (req = request, res = response) =>{
    try {
        const { id_caja_small } = req.params;
        const caja_small = await CajaSmall.findByPk(id_caja_small,{include: [ 
            { association: 'sucursal', include:[{association:'company'}] },
            { association: 'user', attributes: ['full_names','number_document']},
        ]});
        const total_movements = await getTotalesAndMovements(caja_small.id,caja_small.monto_apertura);
        const decimal = await getNumberDecimal();
        let dataPdf = dataPdfReturnCajaVoucher(caja_small,total_movements,decimal); //PDF 
        
        // Tablas dinámicas de ingresos y egresos
        const ingresosTable = dataPdf[4];
        const egresosTable = dataPdf[6];

        total_movements.ingresos.forEach(ingreso => {
            const tableData = [
                {text:ingreso?.description, fontSize:8}, 
                {text:Number(ingreso?.monto).toFixed(decimal), fontSize:8, alignment: 'right'}, 
            ];
            ingresosTable.table.body.push(tableData);
        });
        ingresosTable.table.body.push(
            [
                {text:'TOTAL INGRESOS', fontSize:8 ,fillColor: '#dde3ea', bold:true}, 
                {text:Number(total_movements.total_ingresos).toFixed(decimal), fontSize:8,fillColor: '#dde3ea', bold:true,alignment: 'right'}, 
            ],
        );
        total_movements.gastos.forEach(gasto => {
            const tableData = [
                {text:gasto?.description, fontSize:8}, 
                {text:Number(gasto?.monto).toFixed(decimal), fontSize:8,alignment: 'right'}, 
            ];
            egresosTable.table.body.push(tableData);
        });
        egresosTable.table.body.push(
            [
                {text:'TOTAL GASTOS', fontSize:8 ,fillColor: '#dde3ea', bold:true}, 
                {text:Number(total_movements.total_gastos).toFixed(decimal), fontSize:8,fillColor: '#dde3ea', bold:true,alignment: 'right'}, 
            ],
        );
        let docDefinition = {
            content: dataPdf,
            styles: styles,
        };
        const printer = new PdfPrinter(fonts);
        let pdfDoc =  printer.createPdfKitDocument(docDefinition);
        let chunks = [];
        pdfDoc.on("data", (chunk) => { chunks.push(chunk);});
        pdfDoc.on("end", () => {
            const result = Buffer.concat(chunks);
            res.setHeader('Content-Type', 'application/pdf;');
            res.setHeader('Content-disposition', `filename=report_compras_${new Date()}.pdf`);
            return res.send(result);
        });
        pdfDoc.end();
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el arqueo de caja' });
    }
}

const dataPdfReturnCajaVoucher = (caja_small, total_movements, decimal) => [
    buildHeader({
        title: 'ARQUEO DE CAJA',
        codePrefix: 'CAJA',
        codeValue: caja_small.id,
        dateLabel: 'Fecha',
        dateValue: moment().format('DD/MM/YYYY HH:mm:ss'),
        company: {
            branchName: caja_small.sucursal?.name,
            nit: caja_small.sucursal?.company?.nit,
            phone: caja_small.sucursal?.cellphone,
            email: caja_small.sucursal?.email,
        },
        logoWidth: 55,
    }),
    buildHr([0, 1, 0, 4]),
    buildInfoPanel([
        {
            title: 'DATOS DE APERTURA Y CIERRE',
            rows: [
                { label: 'Fecha apertura:', value: moment(caja_small.date_apertura).format('DD/MM/YYYY HH:mm:ss'), labelWidth: 80 },
                { label: 'Fecha cierre:', value: caja_small?.date_cierre ? moment(caja_small?.date_cierre).format('DD/MM/YYYY HH:mm:ss') : '- (Caja abierta)', labelWidth: 80 },
                { label: 'Cajero:', value: caja_small.user?.full_names || '-', labelWidth: 80 },
                { label: 'Monto apertura:', value: Number(caja_small.monto_apertura).toFixed(decimal), labelWidth: 80 },
            ]
        }
    ]),
    buildSectionTitle('INGRESOS'),
    buildDetailTable({
        widths: ['*', 90],
        headers: [
            { text: 'DESCRIPCIÓN' },
            { text: 'MONTO', alignment: 'center' },
        ],
        rows: [],
    }),
    buildSectionTitle('EGRESOS'),
    buildDetailTable({
        widths: ['*', 90],
        headers: [
            { text: 'DESCRIPCIÓN' },
            { text: 'MONTO', alignment: 'center' },
        ],
        rows: [],
    }),
    buildSectionTitle('RESUMEN DE SALDOS'),
    {
        style: 'tableExample',
        table: {
            widths: ['*', 90],
            body: [
                [
                    { text: 'SALDO', fontSize: 8 }, 
                    { text: Number(total_movements.saldo).toFixed(decimal), fontSize: 8, bold: true, alignment: 'right' }, 
                ],
                [
                    { text: 'MONTO INICIAL + SALDO', fontSize: 9, fillColor: '#dde3ea' }, 
                    { text: Number(total_movements.monto_apertura_mas_saldo).toFixed(decimal), fontSize: 9, bold: true, alignment: 'right', fillColor: '#dde3ea' }, 
                ],
                [
                    { text: 'MONTO DE CIERRE', fontSize: 9, fillColor: '#dde3ea' }, 
                    { text: caja_small.monto_cierre ? Number(caja_small.monto_cierre).toFixed(decimal) : '- (Caja abierta)', fontSize: 9, bold: true, alignment: 'right', fillColor: '#dde3ea' }, 
                ]
            ]
        }
    },
    buildClosingSection({
        signatures: [
            { role: 'SUPERVISOR', name: '' },
            { role: 'CAJERO', name: caja_small.user?.full_names || '' },
        ],
        margin: [0, 10, 0, 0],
        signatureSpace: 35,
    }),
];

module.exports = {
    printCaja,
    dataPdfReturnCajaVoucher,
}
