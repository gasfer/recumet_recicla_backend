const { ViewProviderTotals } = require('../../database/config');
const ExcelJS = require('exceljs');
const moment = require('moment');
moment.locale('es');
const { Op } = require("sequelize");
const { getNumberDecimal } = require('../../helpers/company');

const generateExcelProviders = async (req = request, res = response) => {
  try {
    const providers = await returnDataProviders(req.query);
    const decimal = await getNumberDecimal();
    let output_data = [];
    if (providers.length == 0) {
      output_data.push({
        FECHA_ULTIMA_COMPRA: '',
        COMPRA_KG: '',
        SALDO: '',
        SECTOR: '',
        CATEGORÍA: '',
        FRECUENCIA: '',
        'EMPRESA - TALLER, NEGOCIO': '',
        'CI / NIT': '',
        'DIRECCIÓN - ACOPIADORA': '',
        'CONTACTO': '',
        'PERSONA NOMBRE': '',
        'PERSONA CELULAR': '',
        'MAYORiSTA': '',
      });
    }
    providers.forEach(provider => {
      const tableData = {
        FECHA_ULTIMA_COMPRA: provider.date_last_input? moment(provider.date_last_input).format('DD/MM/YYYY') :'-' ,
        COMPRA_KG: Number(provider.total_products).toFixed(decimal),
        SALDO: Number(provider.saldo_cuentas_por_pagar).toFixed(decimal),
        SECTOR: provider?.sector?.name ?? '-',
        CATEGORÍA: provider?.category?.name ?? '-',
        FRECUENCIA: provider.frequency,
        'EMPRESA - TALLER, NEGOCIO': provider.full_names,
        'CI / NIT': provider.number_document,
        'DIRECCIÓN - ACOPIADORA': provider.direction,
        'CONTACTO': provider.companyContacts,
        'PERSONA NOMBRE': provider.name_contact,
        'PERSONA CELULAR': provider.cellphone_contact,
        'AREA - UNIDAD': provider.workAreaOrPositionOrUnit,
        'MAYORiSTA': provider.mayorista ? 'SI' : 'NO',
      }
      output_data.push(tableData);
    });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Lista proveedores`);
    const headers = Object.keys(output_data[0]);
    worksheet.addRow(headers);
    output_data.forEach(data => {
      const row = [];
      headers.forEach(header => {
        row.push(data[header]);
      });
      worksheet.addRow(row);
    });
    worksheet.getColumn('A').width = 20;
    worksheet.getColumn('B').width = 20;
    worksheet.getColumn('C').width = 25;
    worksheet.getColumn('D').width = 25;
    worksheet.getColumn('E').width = 20;
    worksheet.getColumn('F').width = 20;
    worksheet.getColumn('G').width = 50;
    worksheet.getColumn('H').width = 15;
    worksheet.getColumn('I').width = 50;
    worksheet.getColumn('J').width = 15;
    worksheet.getColumn('K').width = 50;
    worksheet.getColumn('L').width = 50;
    worksheet.getColumn('M').width = 50;
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
      errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
    });
  };
}


const returnDataProviders = async (params) => {
  let {query, type, status, orderNew , id_type_provider} = params;
  let isSearchPos = type === 'pos' ? true : false;   
  let optionsDb = {
      order: [orderNew],
      where: { 
          [Op.and]: [
              { status },
              id_type_provider ? {id_type_provider}: {}
          ]
      },
      include: [ { association: 'category'},{ association: 'sector'}, { association: 'type'}]
  };
  if(isSearchPos) type = null;
  if(isSearchPos) optionsDb.where[Op.or] = [
      { full_names: { [Op.iLike]: `%${query}%`}},
      { number_document: { [Op.iLike]: `%${query}%`}},
      { name_contact: { [Op.iLike]: `%${query}%`}},
  ];
  return await ViewProviderTotals.findAll(optionsDb); 
}

module.exports = {
  generateExcelProviders,
}