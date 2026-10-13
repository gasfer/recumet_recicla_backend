const { buildCashVoucher } = require('../../helpers/generator-pdf/cash-voucher.document');
const { sendReportPdf } = require('../../services/pdf/report-pdf.service');
const { companyData, money, field } = require('../../helpers/generator-pdf/operation-voucher.document');
const { CajaSmall } = require('../../database/config');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const { getReportLogoPath } = require('../../helpers/report-logo');
const imagePath = getReportLogoPath();
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
        const document = buildCashVoucher(caja_small, total_movements, decimal);
        await sendReportPdf(res, document, 'arqueo-caja-' + caja_small.id + '.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el arqueo de caja' });
    }
}

module.exports = {
    printCaja,

}
