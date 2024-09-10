const jwt = require('jsonwebtoken');

const generateJWT = ( id ) => {
    return new Promise((resolve, reject ) => {
        const payload = { id };
        jwt.sign( payload, process.env.JWT_SECRET, { 
            expiresIn: process.env.EXPIREJWT.toString() //time expires JWT
        }, (err, token) => {
            if( err ) {
                console.log(err);
                reject('No se pudo generar jwt');
            } else {
                resolve(token);
            }
        });
    });
}

module.exports = generateJWT;