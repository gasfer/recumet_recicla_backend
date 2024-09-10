require('dotenv').config();

module.exports = {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host:     process.env.DB_HOST,
    dialect:  process.env.DB_DIALECT,
    logging:  process.env.DB_LOGGING == 'true' ? true : false,
    dialectOptions:{
        useUTC:false,
        timezone:'America/La_Paz'
    },
    timezone: 'America/La_Paz'
}
