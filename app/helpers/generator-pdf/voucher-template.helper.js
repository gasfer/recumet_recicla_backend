/**
 * voucher-template.helper.js
 * Funciones constructoras puras para bloques PDF de comprobantes RECUMET.
 */

const { VOUCHER_THEME } = require('./voucher-theme');
const { getReportLogoBase64 } = require('../report-logo');

const HALF_LETTER_MAX_DETAIL_ROWS = 6;

/**
 * Selecciona el papel para comprobantes: media carta cuando el detalle cabe
 * razonablemente y carta cuando necesita más espacio. Los comprobantes largos
 * conservan la paginación normal de PDFMake en carta.
 */
const getVoucherPageOptions = ({ detailCount = 0, orientation = 'portrait' } = {}) => {
    const useHalfLetter = Number(detailCount) <= HALF_LETTER_MAX_DETAIL_ROWS;
    const pageSize = useHalfLetter
        ? orientation === 'landscape' ? { width: 612, height: 396 } : { width: 396, height: 612 }
        : 'LETTER';
    return {
        pageSize,
        pageOrientation: orientation,
        pageMargins: useHalfLetter ? [18, 14, 18, 14] : [18, 14, 18, 14],
    };
};

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
    compact = true,
    subtitle = '',
    receipt = false,
    compactFontSize,
}) => {
    const logoImg = getLogoBase64(customLogoPath);
    const effectiveLogoWidth = compact ? Math.min(logoWidth, 72) : Math.max(logoWidth, 92);
    const companyLines = [
        company.city ? { text: company.city, bold: true, color: VOUCHER_THEME.colors.labelColor } : null,
        company.nit ? { text: `NIT: ${company.nit}` } : null,
        company.phone ? { text: `Tel: ${company.phone}` } : null,
        company.email ? { text: company.email } : null,
    ].filter(Boolean);
    
    const headerFontSize = compactFontSize || VOUCHER_THEME.fonts.tiny;
    const companyStack = {
        fontSize: headerFontSize,
        color: VOUCHER_THEME.colors.muted,
        stack: companyLines,
    };

    const leftHeader = logoImg
        ? companyLines.length > 0 ? {
            columns: [
                { image: logoImg, width: effectiveLogoWidth, margin: [0, 1, 0, 1] },
                { ...companyStack, width: '*', margin: [3, 1, 0, 0] },
            ],
        } : { image: logoImg, width: effectiveLogoWidth, margin: [0, 1, 0, 1] }
        : companyStack;

    // Columna central: Título del documento
    const centerColumn = {
        stack: [
            {
                text: title,
                bold: true,
                fontSize: compact ? Math.min(VOUCHER_THEME.fonts.headerTitle, compactFontSize ? 9 : 10) : VOUCHER_THEME.fonts.headerTitle,
                alignment: 'center',
                color: VOUCHER_THEME.colors.sectionText,
                noWrap: false,
            },
            ...(company.branchName ? [{
                text: company.branchName,
                fontSize: headerFontSize,
                bold: true,
                alignment: 'center',
                color: VOUCHER_THEME.colors.primary,
                margin: [0, 1, 0, 0],
            }] : []),
            ...(subtitle ? [{
                text: subtitle,
                fontSize: headerFontSize,
                alignment: 'center',
                color: VOUCHER_THEME.colors.muted,
                margin: [0, 1, 0, 0],
            }] : []),
        ],
        alignment: 'center',
        margin: [0, compact ? 2.5 : 1.5, 0, 0],
    };

    // Columna derecha: Código correlativo, fecha y badge opcional
    const rightStack = [];
    if (codePrefix && codeValue !== undefined && codeValue !== null) {
        rightStack.push({
            alignment: 'right',
            table: {
                widths: ['auto'],
                body: [[{
                    text: `${codePrefix}: ${codeValue}`,
                    bold: true,
                    fontSize: compact ? headerFontSize : VOUCHER_THEME.fonts.body,
                    color: VOUCHER_THEME.colors.primary,
                    fillColor: VOUCHER_THEME.colors.primaryLight,
                    margin: [2, 1, 2, 1],
                }]],
            },
            layout: 'noBorders',
        });
    }

    if (dateValue) {
        rightStack.push({
            text: `${dateLabel}: ${dateValue}`,
            fontSize: compact ? headerFontSize : VOUCHER_THEME.fonts.small,
            alignment: 'right',
            color: VOUCHER_THEME.colors.muted,
            margin: [0, 1, 0, 0],
        });
    }

    if (statusBadge) {
        rightStack.push({
            margin: [0, 1.5, 0, 0],
            alignment: 'right',
            table: {
                body: [[
                    {
                        text: statusBadge.text || 'PENDIENTE',
                        fontSize: headerFontSize,
                        bold: true,
                        color: statusBadge.textColor || VOUCHER_THEME.colors.badgePendingText,
                        fillColor: statusBadge.bgColor || VOUCHER_THEME.colors.badgePendingBg,
                        alignment: 'center',
                        margin: [2, 0.5, 2, 0.5],
                        border: [false, false, false, false],
                    }
                ]]
            },
            layout: 'noBorders'
        });
    }

    if (receipt) {
        return {
            stack: [
                ...(logoImg ? [{ image: logoImg, width: effectiveLogoWidth, alignment: 'center' }] : []),
                { ...companyStack, alignment: 'center' },
                centerColumn,
                ...rightStack.map(block => ({ ...block, alignment: 'center' })),
            ],
            margin: [0, 0, 0, 2.5],
        };
    }

    return {
        margin: [0, 0, 0, 1],
        layout: 'noBorders',
        table: {
            widths: compact ? (rightStack.length ? ['30%', '40%', '30%'] : ['15%', '70%', '15%']) : [logoImg ? effectiveLogoWidth + 125 : 125, '*', 130],
            body: [[
                leftHeader,
                centerColumn,
                { stack: rightStack, margin: [0, 2, 0, 0] },
            ]],
        },
    };
};

/**
 * Encabezado compartido para reportes. Conserva cinco posiciones antes de la
 * tabla principal porque algunos reportes añaden filas mediante dataPdf[5].
 */
const buildStandardReportHeader = ({ title, auth, details = '', company = {} }) => {
    const printedAt = new Intl.DateTimeFormat('es-BO', {
        timeZone: 'America/La_Paz',
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date());
    const author = [auth?.full_names, auth?.number_document].filter(Boolean).join(' / ');
    const subtitle = [details, author ? `Impreso por: ${author}` : '', printedAt].filter(Boolean).join(' · ');
    const headerCompany = { branchName: company.branchName || 'CASA MATRIZ', ...company };
    return [
        buildHeader({ title, subtitle, logoWidth: 56, compact: true, company: headerCompany }),
        buildHr([0, 0, 0, 0]),
        { text: '' },
        { text: '' },
        { text: '' },
    ];
};

/**
 * Línea separadora horizontal sutil.
 */
const buildHr = (margin = [0, 0.5, 0, 1.5]) => ({
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
const buildSectionTitle = (text, margin = [1, 1.5, 0, 0.5]) => ({
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
 * Paneles de información agrupada con fondo neutro, bordes sutiles y acento verde.
 * groups: array de 1 o 2 grupos [{ title, rows: [{ label, value }] }]
 */
const buildInfoPanel = (groups, { fixedHeight = false } = {}) => {
    if (!groups || groups.length === 0) return { text: '' };

    const renderGroupContent = (group) => {
        const stack = [];
        if (group.title) {
            stack.push({
                text: group.title,
                bold: true,
                fontSize: VOUCHER_THEME.fonts.tiny,
                color: VOUCHER_THEME.colors.primary,
                margin: [0, 0, 0, fixedHeight ? 1 : 1.5],
            });
        }
        if (group.rows && Array.isArray(group.rows)) {
            group.rows.forEach(r => {
                stack.push({
                    margin: [0, fixedHeight ? 0 : 0.5, 0, fixedHeight ? 0 : 0.5],
                    columns: [
                        { text: r.label, bold: true, fontSize: r.fontSize || VOUCHER_THEME.fonts.small, width: r.labelWidth || 65, color: VOUCHER_THEME.colors.muted },
                        { text: r.value || '', bold: true, fontSize: r.fontSize || VOUCHER_THEME.fonts.body, color: VOUCHER_THEME.colors.valueColor, noWrap: Boolean(fixedHeight), width: '*', characterSpacing: fixedHeight ? 0 : undefined },
                    ]
                });
            });
        }
        return {
            table: {
                widths: ['*'],
                body: [[{
                    stack,
                    fillColor: VOUCHER_THEME.colors.sectionBg,
                    border: [true, true, true, true],
                    borderColor: [VOUCHER_THEME.colors.border, VOUCHER_THEME.colors.border, VOUCHER_THEME.colors.border, VOUCHER_THEME.colors.border],
                    margin: fixedHeight ? [3, 2, 3, 2] : [3.5, 2.5, 3.5, 2.5],
                }]],
            },
            layout: {
                hLineWidth: () => 0.6,
                vLineWidth: () => 0.6,
                hLineColor: () => VOUCHER_THEME.colors.border,
                vLineColor: () => VOUCHER_THEME.colors.border,
            },
        };
    };

    if (groups.length === 1) {
        return { margin: [0, 1, 0, 1], ...renderGroupContent(groups[0]) };
    }

    return {
        margin: [0, 1, 0, 1],
        columns: [
            { width: '49%', ...renderGroupContent(groups[0]) },
            { width: '2%', text: '' },
            { width: '49%', ...renderGroupContent(groups[1]) },
        ],
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
        color: VOUCHER_THEME.colors.sectionText,
            margin: [1, 0.5, 1, 0.5],
    }));

    return {
        margin,
        table: {
            widths,
            headerRows: 1,
            keepWithHeaderRows: 1,
            dontBreakRows: true,
            body: [
                headerRow,
                ...rows,
            ],
        },
        layout: {
            hLineWidth: (index, node) => index === 0 || index === 1 || index === node.table.body.length ? 0.9 : 0.55,
            vLineWidth: (index, node) => index === 0 || index === node.table.widths.length ? 0.9 : 0.55,
            hLineColor: (index, node) => index === 0 || index === 1 || index === node.table.body.length
                ? VOUCHER_THEME.colors.labelColor
                : VOUCHER_THEME.colors.tableBorder,
            vLineColor: () => VOUCHER_THEME.colors.tableBorder,
            paddingLeft: () => 2,
            paddingRight: () => 2,
            paddingTop: rowIndex => rowIndex === 0 ? 2 : 1.5,
            paddingBottom: rowIndex => rowIndex === 0 ? 2 : 1.5,
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
    margin = [0, 2, 0, 0],
    signatureSpace = 12.5,
    signatureFontSize,
    metaFontSize,
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
            margin: [0, 1, 0, 0],
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
                fontSize: m.fontSize || metaFontSize || VOUCHER_THEME.fonts.small,
                width: m.width || 'auto',
                color: VOUCHER_THEME.colors.labelColor,
            });
            metaColumns.push({
                text: m.value || '',
                fontSize: m.fontSize || metaFontSize || VOUCHER_THEME.fonts.small,
                width: m.valueWidth || '*',
            });
        });

        stack.push({
            margin: [0, 1.5, 0, 0],
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
                text: '',
                margin: [6, 0, 6, 0],
                border: [false, true, false, false],
                borderColor: [VOUCHER_THEME.colors.muted],
            });
        });

        signatures.forEach(s => {
            roleCols.push({
                text: s.role,
                bold: true,
                fontSize: signatureFontSize || VOUCHER_THEME.fonts.body,
                alignment: 'center',
                color: VOUCHER_THEME.colors.sectionText,
            });
        });

        signatures.forEach(s => {
            nameCols.push({
                text: s.name || '',
                fontSize: signatureFontSize || VOUCHER_THEME.fonts.small,
                alignment: 'center',
                color: VOUCHER_THEME.colors.muted,
            });
        });

        stack.push({
            margin: [0, signatureSpace, 0, 0],
            table: {
                widths: signatures.map(() => '*'),
                body: [lineCols],
            },
            layout: {
                hLineWidth: index => index === 0 ? 0.6 : 0,
                vLineWidth: () => 0,
                hLineColor: () => VOUCHER_THEME.colors.muted,
            },
        });
        stack.push({
            margin: [0, 1, 0, 0],
            columns: roleCols,
        });
        stack.push({
            margin: [0, 0.5, 0, 0],
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
    getVoucherPageOptions,
    buildHeader,
    buildStandardReportHeader,
    buildHr,
    buildSectionTitle,
    buildInfoRow,
    buildInfoRowDouble,
    buildInfoPanel,
    buildDetailTable,
    buildClosingSection,
    VOUCHER_THEME,
};
