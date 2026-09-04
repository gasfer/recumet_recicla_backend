const { VOUCHER_THEME } = require('./voucher-theme');

module.exports = {
    text: {
        fontSize: 10,
        color: VOUCHER_THEME.colors.valueColor,
    },
    fechaDoc: {
        fontSize: 8,
        alignment: 'right',
        color: VOUCHER_THEME.colors.muted,
    },
    fechaDocDetails: {
        fontSize: 7,
        alignment: 'right',
        color: VOUCHER_THEME.colors.muted,
    },
    title: {
        bold: true,
        fontSize: 12,
        margin: [0, 50, 0, 0],
        alignment: 'center',
        color: '#000000',
    },
    title2: {
        bold: true,
        fontSize: 12,
        margin: [0, 25, 0, 0],
        alignment: 'center',
        color: '#000000',
    },
    subTitle: {
        alignment: 'center',
    },
    titleDetails: {
        bold: true,
        fontSize: 8,
        margin: [0, 20, 0, 0],
        alignment: 'center',
        color: '#000000',
    },
    tableReport: {
        margin: [0, 0, 0, 0],
    },
    // Estilos requeridos por comprobantes y boletas existentes
    tableExample: {
        margin: [0, 2, 0, 0],
    },
    datos_person: {
        fontSize: 8.5,
        bold: true,
        color: VOUCHER_THEME.colors.sectionText,
        margin: [0, 4, 0, 2],
    },
    sonBs: {
        fontSize: 8,
        bold: true,
        color: VOUCHER_THEME.colors.labelColor,
    },
    headerTitle: {
        fontSize: 13,
        bold: true,
        alignment: 'center',
        color: VOUCHER_THEME.colors.sectionText,
    }
};