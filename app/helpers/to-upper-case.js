const toUpperCase = (data=  {}) => {
    for (let i in data) {
        if (typeof data[i] === 'string' && i != 'email' && i != 'password' && i != 'password' && i != 'img') {
          data[i] = data[i].toUpperCase().trim().replace(/\s\s+/g, ' ');
        } else if (typeof data[i] === "object") {
            toUpperCase(data[i]);
        }
    }
    return data;
}

module.exports = toUpperCase;