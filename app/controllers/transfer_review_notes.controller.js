const { request, response } = require('express');
const PdfPrinter = require('pdfmake');
const fonts = require('../helpers/generator-pdf/fonts');
const styles = require('../helpers/generator-pdf/styles');
const { TransferReviewNote } = require('../database/config');

const noteInclude = [
  { association: 'transfer', include: [{ association: 'sucursal_send', attributes: ['name'] }, { association: 'sucursal_received', attributes: ['name'] }] },
  { association: 'registeredProduct', attributes: ['cod', 'name'] },
  { association: 'user', attributes: ['full_names'] },
  { association: 'sucursal', attributes: ['name'] },
  { association: 'storage', attributes: ['name'] },
  { association: 'details', include: [{ association: 'product', attributes: ['cod', 'name'] }] },
];

const getReviewNote = async (req = request, res = response) => {
  try {
    const note = await TransferReviewNote.findByPk(req.params.id, { include: noteInclude });
    if (!note) return res.status(404).json({ ok: false, errors: [{ msg: 'Nota de revisión no encontrada.' }] });
    return res.status(200).json({ ok: true, note });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ ok: false, errors: [{ msg: 'Ocurrió un imprevisto interno | hable con soporte' }] });
  }
};

const printReviewNote = async (req = request, res = response) => {
  try {
    const note = await TransferReviewNote.findByPk(req.params.id, { include: noteInclude });
    if (!note) return res.status(404).json({ ok: false, errors: [{ msg: 'Nota de revisión no encontrada.' }] });
    const isShortage = note.type === 'FALTANTE_PARA_REVISION';
    const title = isShortage ? 'NOTA FALTANTE A REVISAR' : 'NOTA EXCEDENTE A REVISAR';
    const differenceLabel = isShortage ? 'FALTANTE' : 'PESO EXCEDIDO';
    const totalDifference = note.details.reduce(
      (total, detail) => total + Number(detail.quantity_difference || 0),
      0
    );
    const body = [[
      { text: 'PRODUCTO', bold: true }, { text: 'ENVIADO', bold: true }, { text: 'RECIBIDO', bold: true }, { text: differenceLabel, bold: true }
    ], ...note.details.map((detail) => [
      `${detail.product.cod} - ${detail.product.name}`, detail.quantity_sent, detail.quantity_received, detail.quantity_difference
    ])];
    const definition = {
      content: [
        { text: `NOTA DE TRASLADO: #${note.transfer.cod} – ${title}`, style: 'title', bold: true },
        { text: `Correlativo: ${note.registry_number}`, margin: [0, 8, 0, 0] },
        { text: `Fecha: ${new Date(note.date).toLocaleString('es-BO')}` },
        { text: `Origen: ${note.transfer.sucursal_send.name}  |  Destino: ${note.transfer.sucursal_received.name}` },
        { text: `Almacén: ${note.storage.name}  |  Usuario: ${note.user.full_names}` },
        { text: `Producto registrado: ${note.registeredProduct.cod} - ${note.registeredProduct.name}`, margin: [0, 0, 0, 10] },
        { table: { widths: ['*', 70, 70, 70], body } },
        ...(isShortage ? [{ text: `TOTAL FALTANTE: ${totalDifference}`, margin: [0, 8, 0, 0], bold: true }] : []),
        { text: `Observaciones: ${note.observations || '-'}`, margin: [0, 12, 0, 0] },
      ], styles,
    };
    const pdfDoc = new PdfPrinter(fonts).createPdfKitDocument(definition);
    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=${note.registry_number}.pdf`);
      res.send(Buffer.concat(chunks));
    });
    pdfDoc.end();
  } catch (error) {
    console.log(error);
    return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo generar la nota de revisión.' }] });
  }
};

module.exports = { getReviewNote, printReviewNote };
