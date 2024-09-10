const path = require('path');
const fs = require("fs");


const showFile = async (req, res = response) => {
    try {
        const { type, name } = req.params;
        const pathImagen = path.join(__dirname + "../../../uploads/imgs/", type, name);
        if (fs.existsSync(pathImagen)) {
            return res.sendFile(pathImagen)
        } else {
            const pathImage = path.join(__dirname, `../../uploads/none-img.jpg`);
            return res.sendFile(pathImage);
        };
    } catch (error) {
        console.log(error);
        const pathImage = path.join(__dirname, `../../uploads/none-img.jpg`);
        return res.sendFile(pathImage);
    }
};

module.exports = {showFile};