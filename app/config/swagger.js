const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Recumet Backend API',
      version: '1.0.0',
      description: 'API documentation for the Recumet recycling system backend.',
      contact: {
        name: 'Ronald J Llusco',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}/api/v1`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./app/routes/*.js', './app/models/*.js'], // Files containing annotations
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
