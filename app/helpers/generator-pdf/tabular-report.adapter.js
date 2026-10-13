const valueText = value => {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(valueText).join('');
    if (typeof value === 'object') return valueText(value.text ?? value.value ?? '');
    return String(value);
};

// Accept formatted table data; presentation flags from callers are deliberately omitted.
const tabularReport = ({ body, widths = [], headerRows = 1 }, metadata) => {
    if (!Array.isArray(body) || !body.length) throw new Error('Tabla de reporte PDF no válida');
    const fixedWidth = widths.filter(width => typeof width === 'number').reduce((sum, width) => sum + width, 0);
    const autoCount = widths.filter(width => typeof width !== 'number').length;
    const autoWidth = autoCount ? Math.max(60, (700 - fixedWidth) / autoCount) : 60;
    const count = Math.max(1, Number(headerRows || 1));
    const labels = Array.from({ length: widths.length || body[0].length }, () => []);
    body.slice(0, count).forEach(row => {
        let skip = 0;
        row.forEach((cell, index) => {
            if (skip) { skip--; return; }
            const text = valueText(cell);
            const span = Number(cell?.colSpan || 1);
            for (let column = index; column < Math.min(labels.length, index + span); column++) if (text) labels[column].push(text);
            skip = span - 1;
        });
    });
    return {
        ...metadata,
        columns: labels.map((label, index) => ({ label: label.join(' / '), width: typeof widths[index] === 'number' ? widths[index] : autoWidth, align: body[0][index]?.alignment })),
        rows: body.slice(count).map(cells => {
            const label = valueText(cells[0]);
            return {
                kind: label.startsWith('PROVEEDOR:') ? 'group' : label.startsWith('SUBTOTAL') ? 'subtotal' : /^(TOTAL|Cantidad Total)/i.test(label) ? 'total' : 'detail',
                cells: cells.map(cell => ({ text: valueText(cell), span: cell?.colSpan, align: cell?.alignment })),
            };
        }),
    };
};
module.exports = { tabularReport, valueText };
