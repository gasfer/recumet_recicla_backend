const { generateReportPdf } = require('./pdf/report-pdf.service');
const escapeMapValue = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const mapTiles = (latitude, longitude, zoom = 18) => {
    const scale = 2 ** zoom;
    const xPosition = (longitude + 180) / 360 * scale * 256;
    const latitudeRadians = latitude * Math.PI / 180;
    const yPosition = (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale * 256;
    const left = xPosition - 384;
    const top = yPosition - 256;
    const firstTileX = Math.floor(left / 256);
    const firstTileY = Math.floor(top / 256);
    return {
        zoom,
        markerX: ((xPosition - left) / 768) * 100,
        markerY: ((yPosition - top) / 512) * 100,
        tiles: [0, 1].flatMap(row => [-1, 0, 1].map(column => ({
            x: firstTileX + column,
            y: firstTileY + row,
            url: `https://tile.openstreetmap.org/${zoom}/${firstTileX + column}/${firstTileY + row}.png`,
        }))),
    };
};
function validateSheet(sheet) {
    const text = (value, max) => typeof value === 'string' && value.length <= max;
    const fields = values => Array.isArray(values) && values.length <= 40 && values.every(field => field && text(field.label, 160) && text(field.value, 6000));
    if (!sheet || !text(sheet.name, 200) || !text(sheet.reference, 100) || !text(sheet.status, 20) || !Array.isArray(sheet.sections) || sheet.sections.length > 8 || !sheet.sections.length) return false;
    return sheet.sections.every(section => section && Number.isInteger(section.id) && section.id >= 1 && section.id <= 8 && text(section.title, 160) && fields(section.fields) && Array.isArray(section.records) && section.records.length <= 100 && section.records.every(record => record && text(record.title, 200) && fields(record.fields)));
}

const registrationDocument = sheet => ({
    variant: 'profile', panelLayout: 'profile', paper: 'A4', title: 'FICHA TÉCNICA DE PROVEEDOR', reference: sheet.reference,
    date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'medium' }).format(new Date()),
    profileSummary: [
        { label: 'Proveedor', value: sheet.name },
        { label: 'Estado', value: sheet.status },
        ...((sheet.sections.find(section => section.id === 1)?.fields || [])
            .filter(field => /\b(?:tipo proveedor|nit|ci)\b/i.test(field.label))
            .slice(0, 2)),
    ],
    profileMap: (() => {
        const location = sheet.sections.find(section => section.id === 2);
        const latitude = escapeMapValue(location?.fields.find(field => /^latitud$/i.test(field.label))?.value);
        const longitude = escapeMapValue(location?.fields.find(field => /^longitud$/i.test(field.label))?.value);
        return latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
            ? null : mapTiles(latitude, longitude);
    })(),
    profileLocation: (sheet.sections.find(section => section.id === 2)?.fields || [])
        .filter(field => !/\b(?:latitud|longitud|referencia geográfica|enlace de google maps)\b/i.test(field.label)),
    panels: [
        ...sheet.sections.filter(section => section.id === 1).map(section => ({
            title: `${String(section.id).padStart(2, '0')} · ${section.title}`,
            fields: section.fields.filter(field => field.label !== 'Enlace de Google Maps' && !/\b(?:tipo proveedor|nit|ci|latitud|longitud|referencia geográfica)\b/i.test(field.label)),
            layout: 'identity',
            records: section.records,
        })),
        ...sheet.sections.filter(section => section.id === 3).map(section => ({
            title: `${String(section.id).padStart(2, '0')} · ${section.title}`,
            fields: section.fields,
            records: section.records,
            layout: 'contacts',
        })),
        ...sheet.sections.filter(section => section.id >= 4).flatMap(section => [
            {
                title: `${String(section.id).padStart(2, '0')} · ${section.title}`,
                fields: section.fields.filter(field => field.label !== 'Enlace de Google Maps' && !/\b(?:tipo proveedor|nit|ci|latitud|longitud|referencia geográfica)\b/i.test(field.label)),
                layout: section.id === 1 ? 'identity' : section.fields.some(field => field.value.length > 75 || /producto|observaciones|comentarios/i.test(field.label)) ? 'wide' : 'compact',
                records: section.records,
            },
        ]),
    ].filter(panel => panel.fields.length || panel.layout === 'identity'),
});
const createRegistrationPdf = sheet => generateReportPdf(registrationDocument(sheet));
module.exports = { validateSheet, registrationDocument, createRegistrationPdf, createRegistrationHtmlPdf: createRegistrationPdf };
