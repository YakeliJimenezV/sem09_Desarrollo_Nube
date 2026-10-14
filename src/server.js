const app = require('./app');
const { getEnvironment } = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { initializeRoles } = require('./services/role.service');

let server;
let shuttingDown = false;

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();

  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    await disconnectDatabase();
    clearTimeout(timeout);
    process.exitCode = exitCode;
  } catch {
    process.exitCode = 1;
  }
}

async function start() {
  const config = getEnvironment({ preview: process.argv.includes('--preview') });

  if (!config.preview) {
    await connectDatabase(config.mongodbUri);
    await initializeRoles();
    console.log('MongoDB conectado. Roles de TechStore inicializados.');
  }

  server = app.listen({
    port: config.port,
    host: config.preview ? '127.0.0.1' : '0.0.0.0',
  }, () => {
    console.log(`TechStore disponible en http://localhost:${config.port}`);
    if (config.preview) console.log('Vista previa visual: sin conexión a MongoDB. Datos demostrativos.');
  });

  server.on('error', () => {
    console.error('No se pudo iniciar el servidor. Comprueba PORT y si el puerto está ocupado.');
    void shutdown(1);
  });
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

start().catch(async (error) => {
  console.error(error.code === 'CONFIGURATION_ERROR'
    ? error.message
    : 'No se pudo preparar MongoDB. Comprueba la conexión, los permisos y los índices de la base de datos.');
  await shutdown(1);
});
