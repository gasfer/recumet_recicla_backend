/**
 * voucher-theme.js
 * Tokens de diseño corporativo y constantes visuales para todos los comprobantes PDF de RECUMET.
 */

const VOUCHER_THEME = {
    colors: {
        primary: '#2E7D32',      // Verde corporativo RECUMET (headers, acentos)
        primaryLight: '#ecfdf5', // Verde muy suave para totales destacados
        headerFill: '#eef2f6',   // Azul grisáceo sutil para cabeceras de tabla
        sectionBg: '#f8fafc',    // Fondo neutro claro para tarjetas de información
        sectionText: '#0f172a',  // Navy corporativo para títulos y datos
        labelColor: '#334155',   // Etiquetas y texto secundario
        valueColor: '#0f172a',  // Valores principales
        muted: '#64748b',        // Subtítulos, fechas y notas al pie
        border: '#cbd5e1',       // Bordes sutiles
        tableBorder: '#cbd5e1',  // Cuadrícula suave para las tablas
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
            pageSize: { width: 612, height: 396 },
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
