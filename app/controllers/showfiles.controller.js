const path = require('path');
const fs = require("fs");


const showFile = async (req, res = response) => {
    try {
        const { type, name } = req.params;
        const baseUploads = process.env.RESOURCES_PATH 
            ? path.resolve(process.env.RESOURCES_PATH) 
            : path.join(__dirname, '../../uploads');

        let pathImagen;
        if (type === 'vouchers') {
            pathImagen = path.join(baseUploads, 'vouchers', name);
        } else {
            pathImagen = path.join(baseUploads, 'imgs', type, name);
        }
        if (fs.existsSync(pathImagen)) {
            return res.sendFile(pathImagen)
        } else {
            let pathImage = path.join(baseUploads, 'none-img.jpg');
            if (!fs.existsSync(pathImage)) {
                pathImage = path.join(__dirname, '../../uploads/none-img.jpg');
            }
            return res.sendFile(pathImage);
        };
    } catch (error) {
        console.log(error);
        let pathImage = process.env.RESOURCES_PATH ? path.join(path.resolve(process.env.RESOURCES_PATH), 'none-img.jpg') : '';
        if (!pathImage || !fs.existsSync(pathImage)) {
            pathImage = path.join(__dirname, '../../uploads/none-img.jpg');
        }
        return res.sendFile(pathImage);
    }
};

module.exports = {showFile};