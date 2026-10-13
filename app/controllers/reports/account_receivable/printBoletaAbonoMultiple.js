const { sendReportPdf } = require('../../../services/pdf/report-pdf.service');
const { buildMultiplePaymentVoucher } = require('../../../helpers/generator-pdf/financial-voucher.document');
const { AccountsReceivable, AbonosAccountsReceivableMultiple} = require('../../../database/config');
const { Op } = require("sequelize");
const { getNumberDecimal } = require("../../../helpers/company");
const path = require('path');
const fs = require('fs');
const { getReportLogoPath } = require('../../../helpers/report-logo');
const imagePath = getReportLogoPath();
const moment = require('moment');
moment.locale('es'); 
const NumeroALetras = require("../../../helpers/numeros-aletras");


const printAbonoMultipleAccountReceivableVoucher = async (req = request, res = response) =>{
    try {
        const { id_abono_account_receivable_multiple } = req.params;
        const abono_account_receivable = await AbonosAccountsReceivableMultiple.findByPk(id_abono_account_receivable_multiple,{
            include: [ 
                { association: 'client'},
                { association: 'sucursal', include: [{ association: 'company' }] }
            ]
        });
        const accountsReceivables = await AccountsReceivable.findAll({order: [['id','ASC']], where: {id: {[Op.in]: abono_account_receivable.ids_account_receivables }}, 
            include: [ 
                { association: 'sucursal', include:{ association: 'company'}},
                { association: 'output', include: [
                        { association: 'detailsOutput', 
                            include: [
                                {   association: 'product',
                                    include: [{ association:'unit'}]
                                }
                            ]
                        },
                    ]
                },
                {association: 'abonosAccountsReceivable'}
            ]
        });
        const decimal = await getNumberDecimal();
        await sendReportPdf(res, buildMultiplePaymentVoucher(abono_account_receivable, accountsReceivables, { payable: false, decimal }), 'abono-multiple-receivable-' + abono_account_receivable.id + '.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'No se pudo generar el PDF. Intente nuevamente.' });
    }
}


module.exports = {
    printAbonoMultipleAccountReceivableVoucher,

}
