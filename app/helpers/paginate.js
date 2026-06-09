const { Op } = require("sequelize");

const paginate = async (model, pageSize, pageLimit, type, query, optionsDb = {}) => {
    try {
        const limit = parseInt(pageLimit, 10) || 100;
        const page = parseInt(pageSize, 10) || 1;
        // search obj
        let search = {};
        let where = {};
        if (type) {
            if (type.includes('.')) {
                // Separar la relación y la columna
                let [assoc, column] = type.split('.');
                let foundInclude = optionsDb.include?.find(i => i.association === assoc);
                if (foundInclude) {
                    if (!foundInclude.where) foundInclude.where = {};
                    if (!isNaN(query)) {
                        foundInclude.where[column] = { [Op.eq]: `${query}` };
                    } else {
                        foundInclude.where[column] = { [Op.iLike]: `%${query}%` };
                    }
                } else {
                    // Evitar error si la asociación no existe
                    return {
                        previousPage: 0,
                        currentPage: 1,
                        nextPage: 0,
                        total: 0,
                        per_page: 0,
                        from: 0,
                        to: 0,
                        total_all: 0,
                        data: []
                    };
                }
            } else {
                if (!isNaN(query)) {
                    where[type] = { [Op.eq]: `${query}` };
                } else {
                    where[type] = { [Op.iLike]: `%${query}%` };
                }
            }
            try {
                optionsDb.where[Op.and].push(where);
                where = optionsDb.where;
            } catch (error) {
                if (optionsDb.where) {
                    for (const [key, value] of Object.entries(optionsDb.where)) {
                        where[key] = value
                    }
                }
            }
            search = { where }
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
            options = { ...options, ...search };
        }
        // take in the model, take in the options
        let { count, rows } = await model.findAndCountAll(options);
        let total = typeof count === 'number' ? count : count.length;
        return {
            previousPage: getPreviousPage(page),
            currentPage: page,
            nextPage: getNextPage(page, limit, count),
            total: typeof count === 'number' ? count : count.length,
            total_all: total,
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
            total_all: 0,
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
    if ((total / limit) > page) {
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