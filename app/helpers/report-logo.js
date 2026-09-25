const fs = require('fs');
const path = require('path');

const frontendAssetLogoPath = path.resolve(
    __dirname,
    '../../../recumet_recicla_frontend/src/assets/img/recumet_logo.png'
);
const uploadedLogoPath = path.resolve(__dirname, '../../uploads/logo.png');

const getReportLogoPath = () => (
    fs.existsSync(frontendAssetLogoPath) ? frontendAssetLogoPath : uploadedLogoPath
);

const getReportLogoBase64 = () => {
    const logoPath = getReportLogoPath();
    return fs.existsSync(logoPath) ? fs.readFileSync(logoPath, 'base64') : null;
};

module.exports = {
    getReportLogoPath,
    getReportLogoBase64,
};
