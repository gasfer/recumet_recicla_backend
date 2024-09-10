const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require("fs");

const fileMoveAndRemoveOld = (file, fileOldName, idFrom, directory = 'imgs', extensionsAccept = ['png', 'PNG', 'jpg', 'JPG', 'jpeg', 'JPEG']) => {
    return new Promise((resolve, reject) => {
        const nameSplit = file.name.split('.');
        const ext = nameSplit[nameSplit.length - 1];
        if (!extensionsAccept.includes(ext)) {
            return reject(`La extensión ${ext} no es permitida, solo se permiten: ${extensionsAccept}`);
        }
        const nameFileTempo = `${uuidv4()}-${idFrom}.${ext}`;
        const uploadPath = path.join(__dirname, '../../uploads/', directory, nameFileTempo);
        file.mv(uploadPath, (err) => {
            if (err) { reject(err); }
            deleteFile(
                path.join(__dirname, '../../uploads/', directory, fileOldName)
            );
            resolve(nameFileTempo);
        })
    })
}

const deleteFile = (path) => {
    if (fs.existsSync(path)) {
        fs.unlinkSync(path);
    }
};




module.exports = {
    fileMoveAndRemoveOld,
    deleteFile
}