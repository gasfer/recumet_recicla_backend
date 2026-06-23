const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require("fs");

const fileMoveAndRemoveOld = (file, fileOldName, idFrom, directory = 'imgs', extensionsAccept = ['png', 'PNG', 'jpg', 'JPG', 'jpeg', 'JPEG', 'webp', 'WEBP']) => {
    return new Promise((resolve, reject) => {
        const nameSplit = file.name.split('.');
        const ext = nameSplit[nameSplit.length - 1];
        if (!extensionsAccept.includes(ext)) {
            return reject(`La extensión ${ext} no es permitida, solo se permiten: ${extensionsAccept}`);
        }
        const nameFileTempo = `${uuidv4()}-${idFrom}.${ext}`;
        const baseUploads = process.env.RESOURCES_PATH 
            ? path.resolve(process.env.RESOURCES_PATH) 
            : path.join(__dirname, '../../uploads');
        const targetDirectory = path.join(baseUploads, directory);

        if (!fs.existsSync(targetDirectory)) {
            fs.mkdirSync(targetDirectory, { recursive: true });
        }

        const uploadPath = path.join(targetDirectory, nameFileTempo);
        file.mv(uploadPath, (err) => {
            if (err) { reject(err); }
            if (fileOldName && fileOldName !== 'NONE') {
                deleteFile(
                    path.join(targetDirectory, fileOldName)
                );
            }
            resolve(nameFileTempo);
        })
    })
}

const deleteFile = (path) => {
    if (fs.existsSync(path) && fs.lstatSync(path).isFile()) {
        fs.unlinkSync(path);
    }
};




module.exports = {
    fileMoveAndRemoveOld,
    deleteFile
}