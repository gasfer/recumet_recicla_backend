/**
 * voucher-theme.js
 * Tokens de diseño corporativo y constantes visuales para todos los comprobantes PDF de RECUMET.
 */

const VOUCHER_THEME = {
    colors: {
        primary: '#2E7D32',      // Verde corporativo RECUMET (headers, acentos)
        primaryLight: '#E8F5E9', // Verde muy suave para resaltados/fondos
        headerFill: '#dde3ea',   // Azul acero suave para cabeceras de tabla
        sectionBg: '#f4f6f8',    // Fondo gris claro para etiquetas de sección
        sectionText: '#1a1a1a',  // Texto oscuro de sección
        labelColor: '#333333',   // Etiquetas de campos (negrita/semi-negrita)
        valueColor: '#111111',   // Valores de texto
        muted: '#555555',        // Subtítulos, fechas, notas al pie
        border: '#cccccc',       // Bordes y separadores sutiles
        tableBorder: '#e0e0e0',  // Bordes internos de tabla
        badgePendingBg: '#fff3e0',
        badgePendingText: '#e65100',
        badgeSuccessBg: '#e8f5e9',
        badgeSuccessText: '#2e7d32',
    },
    fonts: {
        headerTitle: 13,
        sectionTitle: 8.5,
        body: 8,
        small: 7.5,
        tiny: 6.5,
    },
    margins: {
        pageDefault: [18, 18, 18, 18],
        pageHalfLetter: [18, 18, 18, 18],
        sectionSpacing: 4,
    },
    pageSizes: {
        halfLetterPortrait: {
            pageSize: { width: 396, height: 612 },
            pageOrientation: 'portrait',
            pageMargins: [18, 18, 18, 18],
        },
        halfLetterLandscape: {
            pageSize: { width: 396, height: 612 },
            pageOrientation: 'landscape',
            pageMargins: [18, 18, 18, 18],
        },
        a4Portrait: {
            pageSize: 'A4',
            pageOrientation: 'portrait',
            pageMargins: [20, 20, 20, 20],
        },
        a5Portrait: {
            pageSize: 'A5',
            pageOrientation: 'portrait',
            pageMargins: [16, 16, 16, 16],
        }
    }
};

module.exports = {
    VOUCHER_THEME,
};
