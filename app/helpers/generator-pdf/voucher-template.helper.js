/**
 * voucher-template.helper.js
 * Funciones constructoras puras para bloques PDF de comprobantes RECUMET.
 */

const { VOUCHER_THEME } = require('./voucher-theme');
const { getReportLogoBase64 } = require('../report-logo');

/**
 * Obtiene el base64 del logo de la empresa de forma segura.
 */
const getLogoBase64 = (customPath) => {
    try {
        if (customPath) {
            const fs = require('fs');
            if (fs.existsSync(customPath)) {
                return 'data:image/png;base64,' + fs.readFileSync(customPath, 'base64');
            }
        }
        const logoBase64 = getReportLogoBase64();
        return logoBase64 ? 'data:image/png;base64,' + logoBase64 : null;
    } catch (e) {
        console.error('Error leyendo logo para PDF:', e.message);
    }
    return null;
};

/**
 * Construye el encabezado estándar de 3 columnas (Logo/Empresa, Título, Código/Fecha/Badge).
 * Utiliza layout 'noBorders' para alineación consistente sin solapamientos.
 */
const buildHeader = ({
    title,
    codePrefix,
    codeValue,
    dateLabel = 'Fecha',
    dateValue,
    company = {},
    statusBadge = null,
    logoWidth = 92,
    customLogoPath,
}) => {
    const logoImg = getLogoBase64(customLogoPath);
    const effectiveLogoWidth = Math.max(logoWidth, 92);
    
    const companyStack = {
        fontSize: VOUCHER_THEME.fonts.tiny,
        color: VOUCHER_THEME.colors.muted,
        stack: [
            company.branchName ? { text: company.branchName, bold: true, color: VOUCHER_THEME.colors.labelColor } : null,
            company.nit ? { text: `NIT: ${company.nit}` } : null,
            company.phone ? { text: `Tel: ${company.phone}` } : null,
            company.email ? { text: company.email } : null,
        ].filter(Boolean),
    };

    const leftHeader = logoImg
        ? {
            columns: [
                { image: logoImg, width: effectiveLogoWidth, margin: [0, 1, 0, 1] },
                { ...companyStack, width: '*', margin: [6, 2, 0, 0] },
            ],
        }
        : companyStack;

    // Columna central: Título del documento
    const centerColumn = {
        text: title,
        bold: true,
        fontSize: VOUCHER_THEME.fonts.headerTitle,
        alignment: 'center',
        margin: [0, 5, 0, 0],
        color: VOUCHER_THEME.colors.sectionText,
    };

    // Columna derecha: Código correlativo, fecha y badge opcional
    const rightStack = [];
    if (codePrefix && codeValue !== undefined && codeValue !== null) {
        rightStack.push({
            text: `${codePrefix}: ${codeValue}`,
            bold: true,
            fontSize: VOUCHER_THEME.fonts.body,
            alignment: 'right',
            color: VOUCHER_THEME.colors.sectionText,
        });
    }

    if (dateValue) {
        rightStack.push({
            text: `${dateLabel}: ${dateValue}`,
            fontSize: VOUCHER_THEME.fonts.small,
            alignment: 'right',
            color: VOUCHER_THEME.colors.muted,
            margin: [0, 2, 0, 0],
        });
    }

    if (statusBadge) {
        rightStack.push({
            margin: [0, 3, 0, 0],
            alignment: 'right',
            table: {
                body: [[
                    {
                        text: statusBadge.text || 'PENDIENTE',
                        fontSize: VOUCHER_THEME.fonts.tiny,
                        bold: true,
                        color: statusBadge.textColor || VOUCHER_THEME.colors.badgePendingText,
                        fillColor: statusBadge.bgColor || VOUCHER_THEME.colors.badgePendingBg,
                        alignment: 'center',
                        margin: [4, 1, 4, 1],
                        border: [false, false, false, false],
                    }
                ]]
            },
            layout: 'noBorders'
        });
    }

    return {
        margin: [0, 0, 0, 2],
        layout: 'noBorders',
        table: {
            widths: [logoImg ? effectiveLogoWidth + 125 : 125, '*', 130],
            body: [[
                leftHeader,
                centerColumn,
                { stack: rightStack, margin: [0, 4, 0, 0] },
            ]],
        },
    };
};

/**
 * Línea separadora horizontal sutil.
 */
const buildHr = (margin = [0, 1, 0, 3]) => ({
    margin,
    table: {
        widths: ['*'],
        body: [[
            { text: '', border: [false, true, false, false], borderColor: [VOUCHER_THEME.colors.border] }
        ]]
    },
});

/**
 * Título de sección (ej. ORIGEN, DESTINO, DATOS DEL PROVEEDOR).
 */
const buildSectionTitle = (text, margin = [2, 3, 0, 1]) => ({
    text,
    bold: true,
    fontSize: VOUCHER_THEME.fonts.sectionTitle,
    color: VOUCHER_THEME.colors.sectionText,
    background: VOUCHER_THEME.colors.sectionBg,
    margin,
});

/**
 * Fila simple con clave-valor.
 */
const buildInfoRow = (label, value, fontSize = VOUCHER_THEME.fonts.body, labelWidth = 60) => ({
    margin: [0, 0, 0, 0],
    columns: [
        { text: label, bold: true, fontSize, width: labelWidth, color: VOUCHER_THEME.colors.labelColor },
        { text: value !== undefined && value !== null ? String(value) : '', fontSize, color: VOUCHER_THEME.colors.valueColor },
    ],
});

/**
 * Fila doble con dos pares clave-valor lado a lado.
 */
const buildInfoRowDouble = (
    label1, value1,
    label2, value2,
    fontSize = VOUCHER_THEME.fonts.body,
    label1Width = 60,
    label2Width = 70
) => ({
    margin: [0, 0, 0, 0],
    columns: [
        { text: label1, bold: true, fontSize, width: label1Width, color: VOUCHER_THEME.colors.labelColor },
        { text: value1 !== undefined && value1 !== null ? String(value1) : '', fontSize, color: VOUCHER_THEME.colors.valueColor, width: '*' },
        { text: label2, bold: true, fontSize, width: label2Width, color: VOUCHER_THEME.colors.labelColor },
        { text: value2 !== undefined && value2 !== null ? String(value2) : '', fontSize, color: VOUCHER_THEME.colors.valueColor },
    ],
});

/**
 * Panel de información agrupada (con borde izquierdo de acento verde corporativo estilo ejecutivo).
 * groups: array de 1 o 2 grupos [{ title, rows: [{ label, value }] }]
 */
const buildInfoPanel = (groups) => {
    if (!groups || groups.length === 0) return { text: '' };

    const renderGroupContent = (group) => {
        const stack = [];
        if (group.title) {
            stack.push({
                text: group.title,
                bold: true,
                fontSize: VOUCHER_THEME.fonts.sectionTitle,
                color: VOUCHER_THEME.colors.primary,
                margin: [0, 0, 0, 2],
            });
        }
        if (group.rows && Array.isArray(group.rows)) {
            group.rows.forEach(r => {
                stack.push({
                    margin: [0, 1, 0, 1],
                    columns: [
                        { text: r.label, bold: true, fontSize: VOUCHER_THEME.fonts.body, width: r.labelWidth || 65, color: VOUCHER_THEME.colors.labelColor },
                        { text: r.value || '', fontSize: VOUCHER_THEME.fonts.body, color: VOUCHER_THEME.colors.valueColor },
                    ]
                });
            });
        }
        return {
            table: {
                widths: ['*'],
                body: [[
                    {
                        stack,
                        fillColor: VOUCHER_THEME.colors.primaryLight,
                        border: [true, false, false, false],
                        borderColor: [VOUCHER_THEME.colors.primary],
                        margin: [4, 2, 4, 2],
                    }
                ]]
            },
            layout: {
                hLineWidth: () => 0,
                vLineWidth: (i) => (i === 0 ? 2.5 : 0),
                vLineColor: () => VOUCHER_THEME.colors.primary,
            }
        };
    };

    if (groups.length === 1) {
        return {
            margin: [0, 2, 0, 2],
            ...renderGroupContent(groups[0])
        };
    }

    return {
        margin: [0, 2, 0, 2],
        columns: [
            { width: '49%', ...renderGroupContent(groups[0]) },
            { width: '2%', text: '' },
            { width: '49%', ...renderGroupContent(groups[1]) },
        ]
    };
};

/**
 * Tabla de detalle de ítems con encabezado corporativo.
 */
const buildDetailTable = ({
    widths,
    headers,
    rows = [],
    fontSize = VOUCHER_THEME.fonts.body,
    headerFillColor = VOUCHER_THEME.colors.headerFill,
    margin = [0, 2, 0, 0],
}) => {
    const headerRow = headers.map(h => ({
        text: h.text,
        fontSize: h.fontSize || fontSize,
        bold: true,
        alignment: h.alignment || 'left',
        fillColor: headerFillColor,
    }));

    return {
        margin,
        table: {
            widths,
            headerRows: 1,
            body: [
                headerRow,
                ...rows,
            ],
        },
    };
};

/**
 * Sección de firmas y cierre con observaciones y datos de balanza.
 */
const buildClosingSection = ({
    observations = [],
    meta = [],
    signatures = [],
    margin = [0, 4, 0, 0],
    signatureSpace = 25,
}) => {
    const stack = [];

    // Bloque de observaciones si existen
    if (observations && observations.length > 0) {
        const obsWidths = observations.map(() => '*');
        const obsHeaders = observations.map(o => ({
            text: o.title,
            fontSize: VOUCHER_THEME.fonts.body,
            fillColor: VOUCHER_THEME.colors.headerFill,
            bold: true,
        }));
        const obsValues = observations.map(o => ({
            text: o.text || '',
            fontSize: VOUCHER_THEME.fonts.small,
            margin: [2, 2, 2, 2],
        }));

        stack.push({
            margin: [0, 2, 0, 0],
            table: {
                widths: obsWidths,
                body: [obsHeaders, obsValues],
            },
        });
    }

    // Bloque de metadatos (P/Registro, Balanza, etc.)
    if (meta && meta.length > 0) {
        const metaColumns = [];
        meta.forEach(m => {
            metaColumns.push({
                text: m.label,
                bold: true,
                fontSize: VOUCHER_THEME.fonts.body,
                width: m.width || 'auto',
                color: VOUCHER_THEME.colors.labelColor,
            });
            metaColumns.push({
                text: m.value || '',
                fontSize: VOUCHER_THEME.fonts.body,
                width: m.valueWidth || '*',
            });
        });

        stack.push({
            margin: [0, 3, 0, 0],
            columns: metaColumns,
        });
    }

    // Bloque de firmas
    if (signatures && signatures.length > 0) {
        const lineCols = [];
        const roleCols = [];
        const nameCols = [];

        signatures.forEach(() => {
            lineCols.push({
                text: '─────────────────────────',
                fontSize: VOUCHER_THEME.fonts.body,
                alignment: 'center',
                color: VOUCHER_THEME.colors.muted,
            });
        });

        signatures.forEach(s => {
            roleCols.push({
                text: s.role,
                bold: true,
                fontSize: VOUCHER_THEME.fonts.body,
                alignment: 'center',
                color: VOUCHER_THEME.colors.sectionText,
            });
        });

        signatures.forEach(s => {
            nameCols.push({
                text: s.name || '',
                fontSize: VOUCHER_THEME.fonts.small,
                alignment: 'center',
                color: VOUCHER_THEME.colors.muted,
            });
        });

        stack.push({
            margin: [0, signatureSpace, 0, 0],
            columns: lineCols,
        });
        stack.push({
            margin: [0, 2, 0, 0],
            columns: roleCols,
        });
        stack.push({
            margin: [0, 1, 0, 0],
            columns: nameCols,
        });
    }

    return {
        unbreakable: true,
        margin,
        stack,
    };
};

module.exports = {
    getLogoBase64,
    buildHeader,
    buildHr,
    buildSectionTitle,
    buildInfoRow,
    buildInfoRowDouble,
    buildInfoPanel,
    buildDetailTable,
    buildClosingSection,
    VOUCHER_THEME,
};
