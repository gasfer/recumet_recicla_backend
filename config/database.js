require('dotenv').config();

module.exports = {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host:     process.env.DB_HOST,
    port:     Number(process.env.DB_PORT || 5432),
    dialect:  process.env.DB_DIALECT?.trim(),
    logging:  process.env.DB_LOGGING === 'true' ? console.log : false,
    dialectOptions:{
        useUTC:false,
        timezone:'America/La_Paz'
    },
    timezone: 'America/La_Paz'
}
