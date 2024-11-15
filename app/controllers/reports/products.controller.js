const { ProductSucursals, Product,  } = require('../../database/config');
const { Op } = require("sequelize");
const ExcelJS = require('exceljs');
const PdfPrinter = require('pdfmake');
const fonts = require('../../helpers/generator-pdf/fonts');
const styles = require('../../helpers/generator-pdf/styles');
const path = require('path');
const fs = require('fs');
const imagePath = path.join(__dirname, '../../../uploads/logo.png');
const moment = require('moment');
moment.locale('es'); 
const { getNumberDecimal } = require("../../helpers/company");


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
     
      let docDefinition = {
          content: dataPdf,
          pageOrientation: 'landscape',
          footer: function(currentPage, pageCount) { return [
              {
                  text:'Paginas: ' +currentPage.toString() + ' de ' + pageCount,
                  fontSize: 8,alignment: 'center', margin:[10,10,10,10]
              }
          ] },
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

const dataPdfReturn = (auth) => [
  {
      image: 'data:image/png;base64,'+ fs.readFileSync(imagePath,'base64'),
      width: 70,
      absolutePosition: { x:25, y: 15 }
  },
  {   text:`Impreso por: ` + moment().format('LLLL'), style: 'fechaDoc',
      absolutePosition: { y: 16 },
  },
  {   text: `${auth.full_names} / ${auth.number_document}`, style: 'fechaDoc',
      absolutePosition: {  y: 27 }
  },
  { text: 'REPORTE DE PRECIOS', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
  { text: 'Reporte generados con los parámetros establecidos', alignment:'center',absolutePosition: {  y: 73 } },
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