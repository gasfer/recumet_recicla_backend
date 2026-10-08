'use strict';

const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const { Provider } = require('../database/config');

function certificateExtension(file) {
  if (!file || Array.isArray(file) || !Buffer.isBuffer(file.data) || file.size > 8 * 1024 * 1024) return null;
  const signatures = [
    ['application/pdf', Buffer.from('%PDF'), '.pdf'],
    ['image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), '.png'],
    ['image/jpeg', Buffer.from([255, 216, 255]), '.jpg'],
  ];
  return signatures.find(([mime, signature]) => file.mimetype === mime && file.data.subarray(0, signature.length).equals(signature))?.[2] || null;
}

async function uploadCertificate(req, res) {
  let storedPath;
  try {
    const file = req.files?.document;
    const extension = certificateExtension(file);
    if (!extension) return res.status(422).json({ ok: false, errors: [{ msg: 'Adjunte un PDF, PNG o JPG válido de máximo 8 MB' }] });
    const provider = await Provider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ ok: false, errors: [{ msg: 'El proveedor no existe' }] });
    const root = process.env.RESOURCES_PATH ? path.resolve(process.env.RESOURCES_PATH) : path.join(__dirname, '../../uploads');
    const directory = path.join(root, 'provider-certificates');
    const storedName = `${randomUUID()}${extension}`;
    await fs.mkdir(directory, { recursive: true });
    storedPath = path.join(directory, storedName);
    await file.mv(storedPath);
    await provider.update({ certificate_file_name: storedName });
    return res.status(201).json({ ok: true, certificate_file_name: storedName, original_name: path.basename(file.name) });
  } catch (error) {
    if (storedPath) await fs.unlink(storedPath).catch(() => {});
    return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo guardar el certificado. Puede volver a adjuntarlo.' }] });
  }
}

module.exports = { certificateExtension, uploadCertificate };
