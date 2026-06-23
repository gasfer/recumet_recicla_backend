const { Provider } = require('../database/config');
const { Op } = require('sequelize');

class ProviderService {
  async findAutocompleteProviders(query = '') {
    return await Provider.findAll({
      attributes: ['id', 'full_names', 'number_document'],
      where: {
        status: true,
        [Op.or]: [
          { full_names: { [Op.iLike]: `%${query}%` } },
          { number_document: { [Op.iLike]: `%${query}%` } }
        ]
      },
      include: [
        {
          association: 'type',
          attributes: ['code']
        }
      ],
      limit: 20
    });
  }
}

module.exports = new ProviderService();
