const readline = require('node:readline/promises');
const mongoose = require('mongoose');
const { getEnvironment } = require('../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { initializeRoles } = require('../src/services/role.service');
const { validateRegistration } = require('../src/services/validation.service');
const { User, Role, Store } = require('../src/models');

function readSecret(label) {
  if (!process.stdin.isTTY) throw new Error('Ejecuta setup desde una terminal interactiva para ocultar la contraseña.');
  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    let value = '';
    const previousRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const finish = (error) => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(previousRaw);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = (buffer) => {
      for (const character of buffer.toString('utf8')) {
        if (character === '\u0003') { finish(new Error('Configuración cancelada.')); return; }
        if (character === '\r' || character === '\n') { finish(); return; }
        if (character === '\u007f' || character === '\b') {
          if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); }
        } else if (character >= ' ') { value += character; process.stdout.write('*'); }
      }
    };
    process.stdin.on('data', onData);
  });
}

async function setup() {
  const config = getEnvironment();
  await connectDatabase(config.mongodbUri);
  await initializeRoles();
  const role = await Role.findOne({ name: 'ADMIN' });
  if (await User.exists({ role: role._id })) throw new Error('Ya existe un ADMIN. Gestiona las nuevas cuentas desde una sesión administrativa.');
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  let data;
  let name;
  let address;
  try {
    name = (await terminal.question('Nombre de tu primera tienda: ')).trim();
    address = (await terminal.question('Dirección de la tienda: ')).trim();
    data = { fullName: await terminal.question('Nombre completo del administrador: '), email: await terminal.question('Email del administrador: '), store: String(new mongoose.Types.ObjectId()) };
  } finally { terminal.close(); }
  data.password = await readSecret('Contraseña (mínimo 8, mayúscula, número y especial): ');
  data.confirmPassword = await readSecret('Confirmar contraseña: ');
  const validated = validateRegistration(data);
  const store = await Store.create({ name, address });
  try { await User.create({ ...validated, store: store._id, role: role._id }); } catch (error) {
    await Store.deleteOne({ _id: store._id });
    throw error;
  }
  console.log('Primera tienda y administrador creados. Inicia sesión en /login con tus propios datos.');
}

setup().catch((error) => {
  const controlled = error.code === 'CONFIGURATION_ERROR' || ['Ya existe un ADMIN. Gestiona las nuevas cuentas desde una sesión administrativa.', 'Ejecuta setup desde una terminal interactiva para ocultar la contraseña.', 'Configuración cancelada.'].includes(error.message);
  console.error(error.fields ? Object.values(error.fields).join(' ') : (error.code === 11000 ? 'Ese email ya está registrado.' : (controlled ? error.message : 'No se pudo completar setup. Revisa MongoDB y los datos de la tienda.')));
  process.exitCode = 1;
}).finally(disconnectDatabase);
