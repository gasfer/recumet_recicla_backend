const { sendReportPdf } = require('../../../services/pdf/report-pdf.service');
const { buildMultiplePaymentVoucher } = require('../../../helpers/generator-pdf/financial-voucher.document');
const { AccountsPayable, AbonosAccountsPayableMultiple, AbonosAccountsPayable} = require('../../../database/config');
const { Op } = require("sequelize");
const { getNumberDecimal } = require("../../../helpers/company");
const path = require('path');
const fs = require('fs');
const { getReportLogoPath } = require('../../../helpers/report-logo');
const imagePath = getReportLogoPath();
const moment = require('moment');
moment.locale('es'); 
const NumeroALetras = require("../../../helpers/numeros-aletras");


const printAbonoMultipleAccountPayableVoucher = async (req = request, res = response) =>{
    try {
        const { id_abono_account_payable_multiple } = req.params;
        const abono_account_payable = await AbonosAccountsPayableMultiple.findByPk(id_abono_account_payable_multiple,{
            include: [ 
                { association: 'provider'},
                { association: 'sucursal'},
                { association: 'abonosMultipleDestination' },
                { association: 'abonosMultipleOrigin' },
            ]
        });
        const accountsPayables = await AccountsPayable.findAll({order: [['id','ASC']],where: {id: {[Op.in]: abono_account_payable.ids_account_payables }}, 
            include: [ 
                { association: 'sucursal', include:{ association: 'company'}},
                { association: 'input', include: [
                        { association: 'detailsInput', 
                            include: [
                                {   association: 'product',
                                    include: [{ association:'unit'}]
                                }
                            ]
                        },
                    ]
                },
                {
                    association: 'abonosAccountsPayable',
                },
            ]
        });
        const decimal = await getNumberDecimal();
        await sendReportPdf(res, buildMultiplePaymentVoucher(abono_account_payable, accountsPayables, { payable: true, decimal }), 'abono-multiple-payable-' + abono_account_payable.id + '.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'No se pudo generar el PDF. Intente nuevamente.' });
    }
}

module.exports = {
    printAbonoMultipleAccountPayableVoucher,

}
