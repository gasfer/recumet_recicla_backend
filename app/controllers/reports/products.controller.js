const { sendReportPdf } = require('../../services/pdf/report-pdf.service');
const { tabularReport } = require('../../helpers/generator-pdf/tabular-report.adapter');
const { ProductSucursals, Product, Sucursal } = require('../../database/config');
const { Op } = require("sequelize");
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { getReportLogoPath } = require('../../helpers/report-logo');
const imagePath = getReportLogoPath();
const moment = require('moment');
moment.locale('es'); 
const { getNumberDecimal } = require("../../helpers/company");
const { buildStandardReportHeader } = require('../../helpers/generator-pdf/voucher-template.helper');


const generatePdfReports = async (req = request, res = response) => {
  try {
      const data = await returnDataPricesProduct(req.query);
      let dataPdf = dataPdfReturn(req.userAuth); //PDF 
      let num = 1;
      const decimal = await getNumberDecimal();
      data.forEach(product => {
          product.num = num++; 
          const tableData = [
              {text:product.num, fontSize:8}, 
              {text:product.name, fontSize:8}, 
              {text:Number(product.productCosts?.cost).toFixed(decimal), fontSize:8}, 
              {text:Number(product.productCosts?.cost_two).toFixed(decimal), fontSize:8}, 
              {text:Number(product.productCosts?.cost_tree).toFixed(decimal), fontSize:8}, 
          ];
          dataPdf[5].table.body.push(tableData);
      });
     
      const tables = dataPdf.filter(node => node?.table?.body?.length && node.table.headerRows > 0);
        const sections = tables.map(table => tabularReport(table.table, {}));
        const branchId = Number(req.query.id_sucursal);
        const branch = Number.isInteger(branchId) && branchId > 0 ? await Sucursal.findByPk(branchId, { include: [{ association: 'company', attributes: ['nit', 'email'] }] }) : null;
        await sendReportPdf(res, {
            title: 'REPORTE DE PRECIOS', paper: 'A4', orientation: 'landscape', sections,
            company: branch ? { branchName: branch.name, city: branch.city, nit: branch.company?.nit, email: branch.email || branch.company?.email } : { branchName: 'CASA MATRIZ' },
            filters: ['Impreso por: ' + (req.userAuth?.full_names || ''), ...Object.entries(req.query).map(([key, value]) => key + ': ' + value)],
        }, 'generatePdfReports.pdf');
  } catch (error) {
      console.log(error);
      return res.status(500).json({ ok: false, msg: 'No se pudo generar el PDF. Intente nuevamente.' });
  }
}

const dataPdfReturn = (auth) => [
  ...buildStandardReportHeader({ title: 'REPORTE DE PRECIOS', auth, details: 'Reporte generado con los parámetros establecidos' }),
  {
      style: 'tableReport',
      absolutePosition: { x:20, y: 95 },
      table: {
          headerRows: 1,
          widths: [60,'*',80,80,80],
          body: [
              [
                  {text:'N', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                  {text:'DESCRIPCION', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                  {text:'EN EL PUESTO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                  {text:'CON RECOJO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                  {text:'OTRO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
              ]
          ],
          layout: 'lightHorizontalLines'
      }
  }
];


const returnDataPricesProduct = async (params) => {
    let { id_sucursal, id_category, orderNew } = params;
    let idsProductBySucursal = await ProductSucursals.findAll({where: {status:true, id_sucursal}});
    idsProductBySucursal = idsProductBySucursal.map(resp => resp.id_product);
    let optionsDb = {
        order: [orderNew],
        attributes: ['id','cod', 'name', 'description', 'costo'],
        where: { 
            [Op.and]: [
                id_category   ? { id_category   } : {},
                {status: true},
                {id: { [Op.in]: idsProductBySucursal }}
            ]
        },
        include: [
            { association: 'productCosts', required: false ,where: {status: true} ,attributes: ['cost_two', 'cost_tree'] },
        ]
    };
    let products = await Product.findAll(optionsDb);
    let num = 1;
    products = products.map((product) => {
      product.num = num++; 
      if(product.productCosts){
          product.productCosts = {cost: product.costo ,...product.productCosts.dataValues};
      } else {
          product.productCosts = {cost: product.costo,cost_two:"0",cost_tree:"0" };
      }
      return product;
    });
    return products;
}

const generateExcelReportsPricesProduct = async (req = request, res = response) => {
    try {
      const productsCosts = await returnDataPricesProduct(req.query);
      let output_data = [];
      if (productsCosts.length == 0) {
        output_data.push({
          N: '',
          DESCRIPCION: '',
          'EN RECUMET': '',
          'CON RECOJO': '',
          'OTRO': '',
        });
      }
      productsCosts.forEach(product => {
        const tableData = {
            N: product.num,
            DESCRIPCION: product.name,
            'EN RECUMET': Number(product.productCosts?.cost),
            'CON RECOJO': Number(product.productCosts?.cost_two),
            'OTRO': Number(product.productCosts?.cost_tree),
        }
        output_data.push(tableData);
      });
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`Lista Precios`);
      // Agregar encabezados
      const headers = Object.keys(output_data[0]);
      worksheet.addRow(headers);
      // Agregar datos
      output_data.forEach(data => {
        const row = [];
        headers.forEach(header => {
          row.push(data[header]);
        });
        worksheet.addRow(row);
      });
      worksheet.getColumn('A').width = 15; 
      worksheet.getColumn('B').width = 20; 
      worksheet.getColumn('C').width = 25; 
      worksheet.getColumn('D').width = 25; 
      worksheet.getColumn('E').width = 20; 
      worksheet.getColumn('F').width = 50; 
      worksheet.getColumn('G').width = 50; 
      worksheet.getColumn('H').width = 15; 
      worksheet.getColumn('I').width = 15; 
      worksheet.getColumn('J').width = 15; 
      worksheet.getColumn('K').width = 15; 
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=precios-report.xlsx`);
      workbook.xlsx.write(res)
        .then(() => {
          res.end();
        })
        .catch(err => {
          console.error('Error generar Excel:', err);
          res.status(500).json({ error: 'Error al crear excel' });
        })
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        ok: false,
        errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
    });
    };
  }


  module.exports = {
    generateExcelReportsPricesProduct,
    generatePdfReports
  }
