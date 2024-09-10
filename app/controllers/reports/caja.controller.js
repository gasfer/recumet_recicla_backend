const { CajaSmall } = require('../../database/config');
const PdfPrinter = require('pdfmake');
const fonts = require('../../helpers/generator-pdf/fonts');
const styles = require('../../helpers/generator-pdf/styles');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const imagePath = path.join(__dirname, '../../../uploads/logo.png');
const { response } = require("express");
const { getNumberDecimal } = require("../../helpers/company");
const { getTotalesAndMovements } = require('../caja_small.controller');
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
        total_movements.ingresos.forEach(ingreso => {
            const tableData = [
                {text:ingreso?.description, fontSize:8}, 
                {text:Number(ingreso?.monto).toFixed(decimal), fontSize:8, alignment: 'right'}, 
            ];
            dataPdf[13].table.body.push(tableData);
        });
        dataPdf[13].table.body.push(
            [
                {text:'TOTAL INGRESOS', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                {text:Number(total_movements.total_ingresos).toFixed(decimal), fontSize:8,fillColor: '#eeeeee', bold:true,alignment: 'right'}, 
            ],
        );
        total_movements.gastos.forEach(gasto => {
            const tableData = [
                {text:gasto?.description, fontSize:8}, 
                {text:Number(gasto?.monto).toFixed(decimal), fontSize:8,alignment: 'right'}, 
            ];
            dataPdf[15].table.body.push(tableData);
        });
        dataPdf[15].table.body.push(
            [
                {text:'TOTAL GASTOS', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                {text:Number(total_movements.total_gastos).toFixed(decimal), fontSize:8,fillColor: '#eeeeee', bold:true,alignment: 'right'}, 
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
        const pathImage = path.join(__dirname, `../../../uploads/none-img.jpg`);
        return res.sendFile(pathImage);
    }
}

const dataPdfReturnCajaVoucher = (caja_small,total_movements,decimal) => [
    {
        image: 'data:image/png;base64,'+ fs.readFileSync(imagePath,'base64'),
        width: 60,
        absolutePosition: { x:30, y: 15 }
    },
    {   text: caja_small.sucursal.name, style: 'text',
        absolutePosition: { x:97, y: 25 }
    },
    {   text: 'NIT:', bold:true, style: 'text',
        absolutePosition: { x:97, y: 35 }
    },
    {   text: `${caja_small.sucursal.company.nit}`, style: 'text',
        absolutePosition: { x:120, y: 35 }
    },
    {   text: 'TELÉFONO:',bold:true, style: 'text',
        absolutePosition: { x:97, y: 45 }
    },
    {   text: `${caja_small.sucursal.cellphone}`, style: 'text',
        absolutePosition: { x:155, y: 45 }
    },
    {   text: 'EMAIL:', bold:true, style: 'text',
        absolutePosition: { x:97, y: 55 }
    },
    {   text: `${caja_small.sucursal.email}`, style: 'text',
        absolutePosition: { x:133, y: 55 }
    },
    { text: new Date().toLocaleDateString('es-ES', options),  style: 'fechaDoc', absolutePosition: {  y: 40 }},
    { text: 'ARQUEO DE CAJA', style: 'title',bold:true , fontSize:12},
    {
        margin:[0,5,0,0],
        columns: [
            { text: `Fecha apertura:`, bold:true ,style: 'text',width: 75, },
            { text: `${moment(caja_small.date_apertura).format('DD/MM/YYYY HH:mm:ss')}`, style: 'text',  },
            { text: `Fecha de cierre:`, bold:true ,style: 'text',width: 75, },
            { text: `${caja_small?.date_cierre ? moment(caja_small?.date_cierre).format('DD/MM/YYYY HH:mm:ss'): '- (Caja abierta)'}`, style: 'text',  },
        ]
    },
    {
        margin:[0,5,0,0],
        columns: [
            { text: `Cajero:`, bold:true ,style: 'text',width: 75, },
            { text: `${caja_small.user.full_names}`, style: 'text',  },
            { text: `Monto apertura:`, bold:true ,style: 'text',width: 75, },
            { text: `${Number(caja_small.monto_apertura).toFixed(decimal)}`, style: 'text',  },
        ]
    },
    { text: 'EGRESOS:', style: 'datos_person',bold:true ,fontSize:10, margin:[0,3,0,0] },
    {
        style: 'tableExample',
        table: {
            widths: [ '*', 80],
            body: [
                [
                    {text:'DESCRIPCION', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'MONTO', fontSize:8,fillColor: '#eeeeee', bold:true,alignment: 'center'}, 
                ]
            ]
        }
    },
    { text: 'INGRESOS:', style: 'datos_person',bold:true ,fontSize:10, margin:[0,3,0,0] },
    {
        style: 'tableExample',
        table: {
            widths: [ '*', 80],
            body: [
                [
                    {text:'DESCRIPCION', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'MONTO', fontSize:8,fillColor: '#eeeeee', bold:true,alignment: 'center'}, 
                ]
            ]
        }
    },
    { text: 'SALDOS:', style: 'datos_person',bold:true ,fontSize:10, margin:[0,3,0,0] },
    {
        style: 'tableExample',
        table: {
            widths: [ '*', 80],
            body: [
                // [
                //     {text:'INGRESOS TOTALES', fontSize:8 }, 
                //     {text:Number(total_movements.total_ingresos).toFixed(decimal), fontSize:8, bold:true}, 
                // ],
                // [
                //     {text:'EGRESOS TOTALES', fontSize:8 }, 
                //     {text:Number(total_movements.total_gastos).toFixed(decimal), fontSize:8, bold:true}, 
                // ],
                [
                    {text:'SALDO', fontSize:8 }, 
                    {text:Number(total_movements.saldo).toFixed(decimal), fontSize:8, bold:true}, 
                ],
                [
                    {text:'MONTO INICIAL + SALDO', fontSize:9 ,fillColor: '#eeeeee'}, 
                    {text:Number(total_movements.monto_apertura_mas_saldo).toFixed(decimal), fontSize:9, bold:true}, 
                ],
                [
                    {text:'MONTO DE CIERRE', fontSize:9 ,fillColor: '#eeeeee'}, 
                    {text:caja_small.monto_cierre ? Number(caja_small.monto_cierre).toFixed(decimal) : '- (Caja abierta)', fontSize:9, bold:true}, 
                ]
            ]
        }
    },
    {
        margin: [0,50,0,0],
        columns: [
            { text: `-----------------------------------------`, bold:true, style: 'text', alignment: 'center' },
            { text: `-----------------------------------------`, bold:true, style: 'text',alignment: 'center' },
        ]
    },
    {
        margin: [0,-5,0,0],
        columns: [
            { text: `SUPERVISOR`, bold:true ,style: 'text', alignment: 'center' },
            { text: `${caja_small.user.full_names}`, bold:true,style: 'text',alignment: 'center' },
        ]
    },
];

module.exports = {
    printCaja
}