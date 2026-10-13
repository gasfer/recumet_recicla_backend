const { spawnSync } = require('node:child_process');
const inspectPdf = buffer => {
 const python = process.env.PDF_QA_PYTHON;
 if (!python) throw new Error('Configure PDF_QA_PYTHON para inspección de PDF');
 const script = 'import io,json,sys; from pypdf import PdfReader; p=PdfReader(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps([{ "text": x.extract_text(), "width":float(x.mediabox.width), "height":float(x.mediabox.height)} for x in p.pages]))';
 const result = spawnSync(python, ['-c', script], { input: buffer, maxBuffer: 10 * 1024 * 1024 });
 if (result.status) throw new Error(result.stderr.toString());
 return JSON.parse(result.stdout.toString());
};
module.exports = { inspectPdf };
