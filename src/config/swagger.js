import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "API Marketplace",
      version: "1.0.0",
      description: "Documentación de la API",
    },
    servers: [
      {
        url: `http://${process.env.URL || "20.48.177.225"}:${
          process.env.PORT_SWAGGER || process.env.PORT || 4000
        }`,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.js"], // 👈 donde pondremos las anotaciones
};

const swaggerSpec = swaggerJSDoc(options);

export { swaggerSpec, swaggerUi };
