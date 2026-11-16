# Proyecto GPIS - Backend

Backend de una plataforma de compraventa y comunidad llamada GPIS. Está
implementado con Node.js, Express y Sequelize, con persistencia compatible con
MySQL y PostgreSQL.

## Funcionamiento

La API gestiona usuarios, roles, categorías, productos, fotografías,
favoritos, incidencias, apelaciones, reportes, conversaciones, mensajes,
notificaciones y calificaciones de vendedores. Usa JWT y bcrypt para
autenticación, Multer para archivos, Nodemailer para correo y WebSockets para
actualizaciones de mensajería y notificaciones. Swagger documenta los
endpoints.

## Requisitos e instalación

- Node.js 18 o posterior.
- MySQL o PostgreSQL.
- Credenciales SMTP si se activan correos.

```bash
git clone https://github.com/Reclax/Proyecto-GPIS-Backend.git
cd Proyecto-GPIS-Backend
npm install
```

Crea `.env` con los valores que consumen `src/config/database.js`,
`src/utils/jwt.js` y la configuración de correo. Ejecuta:

```bash
npm run dev
```

Para producción usa `npm start`.

## Estructura

- `src/controllers`: lógica HTTP por recurso.
- `src/models`: modelos Sequelize.
- `src/middlewares`: autenticación.
- `src/config`: base de datos y Swagger.
- `src/utils`: JWT, correo y eventos WebSocket.