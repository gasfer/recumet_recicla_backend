'use strict';

const MAX_PDF_SIZE = 8 * 1024 * 1024;

const validateCompanyPdfUpload = file => Boolean(
  file && !Array.isArray(file) && file.mimetype === 'application/pdf' &&
  Number.isInteger(file.size) && file.size > 4 && file.size <= MAX_PDF_SIZE &&
  Buffer.isBuffer(file.data) && file.data.subarray(0, 5).toString() === '%PDF-'
);

const safeOriginalName = name => String(name || '').replace(/\\/g, '/').split('/').pop().slice(0, 255);

module.exports = { MAX_PDF_SIZE, validateCompanyPdfUpload, safeOriginalName };
