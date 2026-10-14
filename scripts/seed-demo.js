const { getEnvironment } = require('../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { seedDemo } = require('../src/services/demo.service');

async function main() {
  try {
    await connectDatabase(getEnvironment().mongodbUri);
    const result = await seedDemo();
    console.log(`Productos demo: ${result.inserted} insertados; ${result.existing} ya existentes. Datos previos conservados.`);
  } catch (error) {
    console.error(error.code === 'CONFIGURATION_ERROR' || error.message.startsWith('Debe existir') ? error.message : 'No se pudo cargar la demostración. Revisa la conexión y configuración.');
    process.exitCode = 1;
  } finally { await disconnectDatabase(); }
}

main();
