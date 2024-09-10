const moment = require('moment');
const { sequelize} = require('../database/config');
const { Op } = require('sequelize');


const whereDateForType = (filterBy,date1, date2, col) => {
    let where;
    switch (filterBy) {
        case 'DAY':
            where = whereFilterByDay(date1);
            break;
        case 'MONTH':
            where = whereFilterByMonth(date1, date2,col);
            break;    
        case 'YEAR':
            where = whereFilterByYear(date1,col);
            break;
        case 'RANGE':
            where = whereFilterByRange(date1, date2);
            break;
        default:
            where = {};
            break;
    }
    return where;    
}


const whereFilterByDay = (date1) => {
    const beginningOfDay = moment(date1, 'DD-MM-YYYY').startOf('day');
    const endOfDay = moment(date1, 'DD-MM-YYYY').endOf('day');
    return  {
        [Op.gte]: beginningOfDay,
        [Op.lte]: endOfDay
    };
}

const whereFilterByRange = (date1, date2) => {
    const beginningOfDay = moment(date1, 'DD-MM-YYYY').startOf('day');
    let endOfDay = date2 ? moment(date2, 'DD-MM-YYYY').endOf('day') : moment(date1, 'DD-MM-YYYY').endOf('day') ;
    return {
        [Op.gte]: beginningOfDay,
        [Op.lte]: endOfDay
    };
}

const whereFilterByMonth = (date1, date2,col) => {
    const month = (moment(date1,'MM').month()) + 1;
    const year = moment(date2).year();
    return {
        [Op.and]: [
            sequelize.where(
                sequelize.literal(`EXTRACT(MONTH FROM ${col})`),
                month
            ),
            sequelize.where(
                sequelize.literal(`EXTRACT(YEAR FROM ${col})`),
                year
            )
        ]
    };
}
const whereFilterByYear = (date1,col) => {
    const year = moment(date1).year();
    return {
        [Op.and]: [
            sequelize.where(
                sequelize.literal(`EXTRACT(YEAR FROM ${col})`),
                year
              )
        ]
    };
}

module.exports = {
    whereDateForType
}