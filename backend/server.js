/**
 * Point d’entrée du serveur HTTP
 */
require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const { env } = require('./src/utils/env');
const logger = require('./src/utils/logger');

const PORT = env.PORT || 3000;

const server = http.createServer(app);

server.listen(PORT, () => {
  logger.info(`Dynamite API running on port ${PORT} (${env.NODE_ENV})`);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', err);
  process.exit(1);
});
