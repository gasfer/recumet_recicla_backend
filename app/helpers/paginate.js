const { Op } = require("sequelize");

const paginate = async (model, pageSize, pageLimit, type, query, optionsDb = {}) => {
    try {
        const limit = parseInt(pageLimit, 10) || 100;
        const page = parseInt(pageSize, 10) || 1;
        // search obj
        let search = {};
        let where = {};
        if(type) {
            if(type.includes('.')){
                type = '$'+type+'$';
            } 
            if(!isNaN(query)){
                where[type] = { [Op.eq]: `${query}` };
            } else {
                if(new Date(query) != 'Invalid Date'){
                    let date;
                    date = new Date(query) ;
                    where[type] = {
                        [Op.gt]: new Date(query),
                        [Op.lt]: date.setDate(date.getDate() + 1)
                      };
                } else {
                    where[type] = { [Op.iLike]: `%${query}%`};
                }
            }
            try {
                optionsDb.where[Op.and].push(where);
                where = optionsDb.where;
            } catch (error) {
                if(optionsDb.where) {
                    for(const [key, value] of Object.entries(optionsDb.where)){
                        where[key] =  value
                    }
                }
            }
            search = { where}
            delete optionsDb.where;
        }
        // create an options object
        let options = {
            ...optionsDb,
            offset: getOffset(page, limit),
            limit: limit,
            distinct: true
        };
        // check if the search object is empty
        if (Object.keys(search).length) {
            options = {...options, ...search};
        }
        // take in the model, take in the options
        let {count, rows} = await model.findAndCountAll(options);
        return {
            previousPage: getPreviousPage(page),
            currentPage: page,
            nextPage: getNextPage(page, limit, count),
            total: typeof count === 'number'?count: count.length,
            per_page: limit,
            from: getFrom(page, limit),
            to: getNextOffset(page, limit),
            data: rows
        }
    } catch (error) {
        console.log(error);
        return {
            previousPage: 0,
            currentPage: 1,
            nextPage: 0,
            total: 0,
            per_page: 0,
            from: 0,
            to: 0,
            data: []
        }
    }
}

const getFrom = (page, limit) => {
    return getOffset(page, limit) == 0 ? 1 : getOffset(page, limit) + 1;
}

const getNextOffset = (page, limit) => {
    return getOffset(page, limit) + limit;
}

const getOffset = (page, limit) => {
 return (page * limit) - limit;
}

const getNextPage = (page, limit, total) => {
    if ((total/limit) > page) {
        return page + 1;
    }
    return null
}

const getPreviousPage = (page) => {
    if (page <= 1) {
        return null
    }
    return page - 1;
}


module.exports = paginate;