module.exports = {
    Roboto: {
        normal: Buffer.from(
            require('pdfmake/build/vfs_fonts.js').pdfMake.vfs['Roboto-Regular.ttf'],
            "base64"
        ),
        bold: Buffer.from(
            require('pdfmake/build/vfs_fonts.js').pdfMake.vfs['Roboto-Medium.ttf'],
            "base64"
        ),
        italics: Buffer.from(
            require('pdfmake/build/vfs_fonts.js').pdfMake.vfs['Roboto-Italic.ttf'],
            "base64"
        ),
		bolditalics: Buffer.from(
            require('pdfmake/build/vfs_fonts.js').pdfMake.vfs['Roboto-MediumItalic.ttf'],
            "base64"
        )
    }
}