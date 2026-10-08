const PDFDocument = require('pdfkit');
const fs = require('fs');
const { getReportLogoPath } = require('../helpers/report-logo');
function validateSheet(sheet) {
    const text = (value, max) => typeof value === 'string' && value.length <= max;
    const fields = values => Array.isArray(values) && values.length <= 40 && values.every(field => field && text(field.label, 160) && text(field.value, 6000));
    if (!sheet || !text(sheet.name, 200) || !text(sheet.reference, 100) || !text(sheet.status, 20) || !Array.isArray(sheet.sections) || sheet.sections.length > 8 || !sheet.sections.length) return false;
    return sheet.sections.every(section => section && Number.isInteger(section.id) && section.id >= 1 && section.id <= 8 && text(section.title, 160) && fields(section.fields) && Array.isArray(section.records) && section.records.length <= 100 && section.records.every(record => record && text(record.title, 200) && fields(record.fields)));
}

function createRegistrationPdf(sheet) {
    const printableFields = fields => fields.filter(field => field.label !== 'Enlace de Google Maps');
    sheet = { ...sheet, sections: sheet.sections.map(section => ({ ...section, fields: printableFields(section.fields), records: section.records.map(record => ({ ...record, fields: printableFields(record.fields) })) })) };
    const doc = new PDFDocument({ size: 'A4', margins: { top: 74, left: 36, right: 36, bottom: 52 }, bufferPages: true, info: { Title: 'Ficha técnica y registro de proveedor', Author: 'RECUMET' } });
    const left = 36;
    const width = doc.page.width - left * 2;
    const bottom = doc.page.height - 62;
    const colors = { green: '#00a96b', navy: '#0b1324', ink: '#1e293b', muted: '#64748b', border: '#e2e8f0', pale: '#f8fafc' };
    const logoPath = getReportLogoPath();
    const hasLogo = fs.existsSync(logoPath);
    const findValue = label => sheet.sections.flatMap(section => section.fields).find(field => field.label === label)?.value || 'Sin registrar';
    const emittedAt = new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const write = (text, x, y, size = 9, color = colors.ink, bold = false, options = {}) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(text, x, y, options);
    };
    const box = (x, y, w, h, fill = colors.pale, border = colors.border) => {
        doc.roundedRect(x, y, w, h, 4).lineWidth(.5).fillAndStroke(fill, border);
    };
    const room = height => { if (doc.y + height > bottom) doc.addPage(); };
    const heading = (title, continued = false) => {
        const label = title.toUpperCase() + (continued ? ' · CONTINUACIÓN' : '');
        doc.font('Helvetica-Bold').fontSize(9);
        const height = doc.heightOfString(label, { width: width - 20 }) + 13;
        room(height + 40);
        const y = doc.y;
        doc.rect(left, y, width, height).fill('#f1f5f9');
        doc.rect(left, y, 2.5, height).fill(colors.green);
        write(label, left + 9, y + 6, 9, '#065f46', true, { width: width - 20 });
        doc.y = y + height + 6;
        doc.x = left;
    };

    doc.rect(0, 0, doc.page.width, 5).fill(colors.green);
    if (hasLogo) doc.image(logoPath, left, 36, { fit: [190, 58] });
    else write('RECUMET', left, 40, 22, colors.navy, true);
    write('GESTIÓN DE PROVEEDORES', left, 101, 8, colors.muted, true, { width: 210 });
    const metaX = left + width - 222;
    write('FICHA TÉCNICA DE PROVEEDOR', metaX, 36, 12, colors.navy, true, { width: 222, align: 'right' });
    write('Registro de proveedor · Formato A4', metaX, 55, 8, colors.muted, false, { width: 222, align: 'right' });
    box(metaX, 73, 222, 52);
    write('REFERENCIA', metaX + 9, 82, 7, colors.muted, true);
    write(sheet.reference, metaX + 87, 82, 8, colors.ink, true, { width: 126, align: 'right' });
    write('EMITIDO', metaX + 9, 101, 7, colors.muted, true);
    write(emittedAt, metaX + 70, 101, 8, colors.ink, false, { width: 143, align: 'right' });
    doc.moveTo(left, 136).lineTo(left + width, 136).lineWidth(1).stroke(colors.green);

    const identityTextWidth = width - 86;
    doc.font('Helvetica-Bold').fontSize(13);
    const nameHeight = doc.heightOfString(sheet.name, { width: identityTextWidth });
    const type = findValue('Tipo proveedor');
    doc.font('Helvetica').fontSize(8);
    const documentNumber = sheet.sections.find(section => section.id === 1)?.fields.find(field => /\b(CI|NIT)\b/.test(field.label))?.value || 'Sin registrar';
    const detail = `${type} · ${sheet.status}\nCI / NIT: ${documentNumber} · ${findValue('Departamento')}`;
    const detailHeight = doc.heightOfString(detail, { width: identityTextWidth });
    const identityHeight = Math.max(68, nameHeight + detailHeight + 24);
    box(left, 148, width, identityHeight, '#f0fdf8', '#ccebe0');
    box(left + 11, 160, 43, 43, '#065f46', '#065f46');
    const initials = sheet.name.trim().split(/\s+/).slice(0, 2).map(word => word[0] || '').join('');
    write(initials, left + 11, 174, 14, '#ffffff', true, { width: 43, align: 'center' });
    write(sheet.name, left + 66, 160, 13, colors.navy, true, { width: identityTextWidth });
    write(detail, left + 66, 164 + nameHeight, 8, '#475569', false, { width: identityTextWidth });
    doc.y = 148 + identityHeight + 12;
    doc.x = left;

    const rowsFor = fields => {
        const rows = [];
        for (let index = 0; index < fields.length;) {
            const first = fields[index++];
            rows.push(first.full ? [first] : [first, ...(fields[index] && !fields[index].full ? [fields[index++]] : [])]);
        }
        return rows;
    };
    const measureRow = row => {
        const cellWidth = row.length === 2 ? (width - 8) / 2 : width;
        const cells = row.map(field => {
            doc.font('Helvetica').fontSize(7);
            const labelHeight = doc.heightOfString(field.label.toUpperCase(), { width: cellWidth - 16 });
            doc.font('Helvetica-Bold').fontSize(9);
            return { field, labelHeight, valueHeight: doc.heightOfString(field.value, { width: cellWidth - 16 }) };
        });
        return { cells, cellWidth, height: Math.max(...cells.map(cell => cell.labelHeight + cell.valueHeight + 19)) };
    };
    const firstRowHeight = fields => fields.length ? Math.min(630, measureRow(rowsFor(fields)[0]).height + 6) : 20;
    const renderFields = (fields, sectionTitle) => {
        for (const row of rowsFor(fields)) {
            const { cells, cellWidth, height } = measureRow(row);
            if (height > bottom - 74) {
                for (const cell of cells) {
                    room(50);
                    write(cell.field.label.toUpperCase(), left, doc.y, 7, colors.muted, true, { width });
                    write(cell.field.value, left, doc.y + 4, 9, colors.ink, false, { width });
                    doc.y += 8;
                }
                continue;
            }
            if (doc.y + height + 6 > bottom) { doc.addPage(); heading(sectionTitle, true); }
            const y = doc.y;
            cells.forEach((cell, column) => {
                const x = left + column * (cellWidth + 8);
                const empty = cell.field.value === 'Sin registrar';
                box(x, y, cellWidth, height);
                write(cell.field.label.toUpperCase(), x + 8, y + 7, 7, colors.muted, false, { width: cellWidth - 16 });
                write(cell.field.value, x + 8, y + 11 + cell.labelHeight, 9, empty ? colors.muted : colors.ink, !empty, { width: cellWidth - 16 });
            });
            doc.y = y + height + 6;
            doc.x = left;
        }
    };
    for (const section of sheet.sections) {
        const title = `${section.id}. ${section.title}`;
        room(30 + firstRowHeight(section.fields.length ? section.fields : section.records[0]?.fields || []));
        heading(title);
        renderFields(section.fields, title);
        for (const record of section.records) {
            if (doc.y + 22 + firstRowHeight(record.fields) > bottom) { doc.addPage(); heading(title, true); }
            write(record.title, left + 2, doc.y, 8, '#065f46', true, { width: width - 4 });
            doc.y += 6;
            renderFields(record.fields, title);
        }
        if (section.id === 7 && !section.records.length) write('Sin cuentas bancarias registradas.', left, doc.y, 8, colors.muted, false, { width });
        doc.y += 6;
    }
    const pages = doc.bufferedPageRange();
    for (let page = 0; page < pages.count; page++) {
        doc.switchToPage(page);
        const bottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        if (page > 0) {
            doc.rect(0, 0, doc.page.width, 5).fill(colors.green);
            if (hasLogo) doc.image(logoPath, left, 24, { fit: [105, 31] });
            else write('RECUMET', left, 27, 14, colors.navy, true);
            write('FICHA TÉCNICA DE PROVEEDOR', left + 150, 27, 9, colors.navy, true, { width: width - 150, align: 'right' });
            write(sheet.reference, left + 150, 43, 8, colors.muted, false, { width: width - 150, align: 'right' });
            doc.moveTo(left, 63).lineTo(left + width, 63).lineWidth(.5).stroke(colors.border);
        }
        const footerY = doc.page.height - 38;
        doc.moveTo(left, footerY - 9).lineTo(left + width, footerY - 9).lineWidth(.5).stroke(colors.border);
        write('RECUMET · Registro de proveedor', left, footerY, 7, colors.muted, false, { width: width - 70, lineBreak: false });
        write(`${page + 1} / ${pages.count}`, left + width - 60, footerY, 8, colors.muted, true, { width: 60, align: 'right', lineBreak: false });
        doc.page.margins.bottom = bottomMargin;
    }
    return doc;
}

module.exports = { validateSheet, createRegistrationPdf };
