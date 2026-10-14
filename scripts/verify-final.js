const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const otp = require('otplib');
const QRCode = require('qrcode');
const { getEnvironment } = require('../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { User, Role, Store, Product, AuthChallenge, OAuthState } = require('../src/models');
const { decryptSecret, encryptSecret, digest } = require('../src/services/encryption.service');
const { seedDemo } = require('../src/services/demo.service');
const { verifyAccessToken } = require('../src/services/token.service');
const app = require('../src/app');

const marker = `__TECHSTORE_TEST_${randomUUID().replace(/-/g, '')}`;
const root = path.resolve(__dirname, '..');
const password = `T!${randomBytes(20).toString('hex')}9`;
const userIds = [];
const storeIds = [];
const emails = [];
const oauthStateIds = [];
const originalFetch = global.fetch;
const originalQr = QRCode.toBuffer;
let server;
let baseUrl;
let currentCheck = 'Inicio';
let passed = 0;
let snapshot;

function check(condition, label) {
  currentCheck = label;
  assert.ok(condition, label);
  passed += 1;
  console.log(`OK · ${label}`);
}

async function request(route, { token, challenge, method = 'GET', body, cookie, status = 200 } = {}) {
  currentCheck = `${method} ${route} → HTTP ${status}`;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (challenge) headers.Authorization = `MFA ${challenge}`;
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await originalFetch(`${baseUrl}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, status);
  const type = response.headers.get('content-type') || '';
  const data = type.includes('json') ? await response.json() : null;
  return { response, data };
}

function noSecrets(value) {
  return !/mfaSecretEncrypted|mfaLastStep|googleId|githubId|password|tokenVersion|lockUntil|failedLoginAttempts/.test(JSON.stringify(value));
}

async function registerAccount(label) {
  const email = `${marker.toLowerCase()}-${label}@example.invalid`;
  emails.push(email);
  const body = { fullName: `${marker} ${label}`, email, password, confirmPassword: password, store: String(storeIds[0]) };
  const { data } = await request('/api/auth/register', { method: 'POST', body, status: 201 });
  userIds.push(new mongoose.Types.ObjectId(data.user.id));
  return { id: data.user.id, email, body };
}

async function login(account, status = 200) {
  return (await request('/api/auth/login', { method: 'POST', body: { email: account.email, password }, status })).data;
}

async function secretFor(pending) {
  const challenge = await AuthChallenge.findOne({ tokenHash: digest(pending.challengeToken) }).select('+secretEncrypted');
  if (challenge.type === 'setup') return decryptSecret(challenge.secretEncrypted);
  const user = await User.findById(challenge.user).select('+mfaSecretEncrypted');
  return decryptSecret(user.mfaSecretEncrypted);
}

async function validCode(pending, previousPeriod = false) {
  if (previousPeriod && Math.floor(Date.now() / 1000) % 30 >= 28) await new Promise((resolve) => setTimeout(resolve, 3100));
  return otp.generate({ secret: await secretFor(pending), epoch: Math.floor(Date.now() / 1000) - (previousPeriod ? 30 : 0), digits: 6, period: 30 });
}

async function complete(pending, previousPeriod = true) {
  const code = await validCode(pending, previousPeriod);
  return (await request('/api/auth/mfa/verify', { method: 'POST', challenge: pending.challengeToken, body: { code } })).data;
}

async function wrongCode(pending) {
  const secret = await secretFor(pending);
  for (let candidate = 0; candidate < 10; candidate += 1) {
    const code = String(candidate).padStart(6, '0');
    if (!(await otp.verify({ secret, token: code, epochTolerance: [30, 0] })).valid) return code;
  }
  throw new Error('No se pudo preparar una comprobación temporal.');
}

async function snapshotData() {
  const collections = ['users', 'stores', 'products'];
  const records = {};
  for (const name of collections) records[name] = await mongoose.connection.db.collection(name).find({}).toArray();
  return { records, env: fs.existsSync(path.join(root, '.env')) ? fs.readFileSync(path.join(root, '.env')) : null };
}

async function verifyPreserved() {
  if (!snapshot) return;
  for (const [name, records] of Object.entries(snapshot.records)) {
    for (const before of records) {
      const after = await mongoose.connection.db.collection(name).findOne({ _id: before._id });
      currentCheck = `Conservación de documentos existentes en ${name}`;
      assert.deepEqual(after, before);
    }
    check(true, `Todos los documentos previos de ${name} permanecen idénticos`);
  }
  if (snapshot.env) check(snapshot.env.equals(fs.readFileSync(path.join(root, '.env'))), '.env permanece idéntico');
}

async function oauthTests(accounts) {
  for (const provider of ['google', 'github']) {
    const prefix = provider.toUpperCase();
    process.env[`${prefix}_CLIENT_ID`] = randomBytes(16).toString('hex');
    process.env[`${prefix}_CLIENT_SECRET`] = randomBytes(32).toString('hex');
    process.env[`${prefix}_CALLBACK_URL`] = `http://localhost:3000/api/auth/oauth/${provider}/callback`;
    const account = await registerAccount(`oauth-${provider}`);
    const providerId = provider === 'google' ? randomBytes(12).toString('hex') : Number.parseInt(randomBytes(5).toString('hex'), 16);
    const accessToken = randomBytes(32).toString('base64url');
    let exchanges = 0;
    global.fetch = async (url, options) => {
      if (String(url).includes('/token') || String(url).includes('/access_token')) {
        check(typeof options.body.get('code_verifier') === 'string' && options.body.get('code_verifier').length >= 43, `${provider}: intercambio con PKCE`);
        exchanges += 1;
        return Response.json({ access_token: accessToken });
      }
      if (String(url).includes('userinfo')) return Response.json({ sub: providerId, email: account.email, email_verified: true });
      if (String(url).endsWith('/user/emails')) return Response.json([{ email: account.email, verified: true, primary: true }]);
      if (String(url).endsWith('/user')) return Response.json({ id: providerId });
      return originalFetch(url, options);
    };
    for (const configured of [false, true]) {
      const started = await request(`/api/auth/oauth/${provider}`, { status: 302 });
      const authorization = new URL(started.response.headers.get('location'));
      const cookie = started.response.headers.get('set-cookie').split(';')[0];
      const state = authorization.searchParams.get('state');
      const document = await OAuthState.findOne({ stateHash: digest(state) });
      oauthStateIds.push(document._id);
      check(authorization.searchParams.get('code_challenge_method') === 'S256' && authorization.searchParams.get('code_challenge'), `${provider}: estado aleatorio y S256`);
      const failed = await request(`/api/auth/oauth/${provider}/callback?state=${state}&code=temporary`, { status: 302 });
      check(failed.response.headers.get('location') === '/login?oauth=failed', `${provider}: callback sin cookie rechazado`);
      const result = await request(`/api/auth/oauth/${provider}/callback?state=${state}&code=temporary`, { cookie, status: 302 });
      check(result.response.headers.get('location') === (configured ? '/mfa' : '/mfa/setup'), `${provider}: OAuth obliga MFA ${configured ? 'configurado' : 'inicial'}`);
      const handoffCookie = result.response.headers.get('set-cookie').split(/, (?=techstore\.)/).find((entry) => entry.startsWith('techstore.mfa.handoff='))?.split(';')[0];
      check(Boolean(handoffCookie), `${provider}: handoff HttpOnly, sin JWT en URL`);
      const pending = (await request('/api/auth/oauth/handoff', { cookie: handoffCookie })).data;
      check(!pending.token && pending.type === (configured ? 'verify' : 'setup'), `${provider}: sin JWT antes del TOTP`);
      await request('/api/auth/oauth/handoff', { status: 401 });
      await request(`/api/auth/oauth/${provider}/callback?state=${state}&code=temporary`, { cookie, status: 302 });
      if (!configured) {
        const resultMfa = await complete(pending);
        accounts[`oauth-${provider}`] = { ...account, token: resultMfa.token };
      }
    }
    check(exchanges === 2, `${provider}: callbacks consumidos no intercambian de nuevo`);
    const stored = await User.findById(account.id).select('+password');
    check(await bcrypt.compare(password, stored.password), `${provider}: contraseña original conservada`);
    global.fetch = originalFetch;
    delete process.env[`${prefix}_CLIENT_ID`];
    delete process.env[`${prefix}_CLIENT_SECRET`];
    delete process.env[`${prefix}_CALLBACK_URL`];
  }
}

async function main() {
  try {
    process.env.NODE_ENV = 'test';
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    await connectDatabase(getEnvironment().mongodbUri);
    snapshot = await snapshotData();
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const roles = await Role.find();
    check(['ADMIN', 'GERENTE', 'EMPLEADO', 'AUDITOR'].every((role) => roles.some((entry) => entry.name === role)), 'Cuatro roles existentes disponibles');
    for (const label of ['A', 'B']) {
      const store = await Store.create({ name: `${marker} ${label}`, address: 'Datos temporales de verificación', active: true });
      storeIds.push(store._id);
    }
    await request('/api/health/ready');
    check(true, 'Express y MongoDB disponibles sin reiniciar MongoDB');
    const invalidBody = { fullName: '', email: 'invalido', password: 'weak', confirmPassword: 'different', store: 'bad' };
    await request('/api/auth/register', { method: 'POST', body: invalidBody, status: 422 });
    const accounts = {};
    const individualSecrets = new Set();
    for (const name of ['ADMIN', 'GERENTE', 'EMPLEADO', 'AUDITOR']) {
      const account = await registerAccount(name.toLowerCase());
      const stored = await User.findById(account.id).select('+password');
      check(stored.password !== password && await bcrypt.compare(password, stored.password), `${name}: contraseña almacenada con bcrypt`);
      check((await stored.populate('role')).role.name === 'EMPLEADO', `${name}: registro público siempre EMPLEADO`);
      await request('/api/auth/register', { method: 'POST', body: account.body, status: 409 });
      await request('/api/auth/register', { method: 'POST', body: { ...account.body, role: 'ADMIN' }, status: 400 });
      await User.updateOne({ _id: stored._id }, { $set: { role: roles.find((entry) => entry.name === name)._id } });
      const pending = await login(account);
      check(pending.mfaRequired && pending.type === 'setup' && !pending.token && jwt.decode(pending.challengeToken) === null, `${name}: contraseña correcta no concede JWT`);
      await request('/api/auth/me', { token: pending.challengeToken, status: 401 });
      await request('/api/auth/mfa/qr', { status: 401 });
      const secret = await secretFor(pending);
      individualSecrets.add(secret);
      let validUri = false;
      QRCode.toBuffer = async (uri, options) => {
        const parsed = new URL(uri);
        validUri = parsed.protocol === 'otpauth:' && parsed.hostname === 'totp' && parsed.searchParams.get('issuer') === 'TechStore' && (parsed.searchParams.get('digits') || '6') === '6' && (parsed.searchParams.get('period') || '30') === '30' && parsed.searchParams.get('secret') === secret;
        return originalQr(uri, options);
      };
      const qr = await request('/api/auth/mfa/qr', { challenge: pending.challengeToken });
      const png = Buffer.from(await qr.response.arrayBuffer());
      QRCode.toBuffer = originalQr;
      check(validUri && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${name}: QR PNG y URI TOTP de 6 dígitos/30 segundos`);
      check(!(await User.findById(stored._id)).mfaEnabled, `${name}: mostrar QR no activa MFA`);
      const result = await complete(pending);
      const claims = verifyAccessToken(result.token);
      check(claims.mfa === true && claims.role === name && noSecrets(claims), `${name}: JWT definitivo solo después del TOTP`);
      check(noSecrets(result.user), `${name}: respuesta sin secretos`);
      await request('/api/auth/mfa/qr', { challenge: pending.challengeToken, status: 401 });
      await request('/api/auth/mfa/verify', { method: 'POST', challenge: pending.challengeToken, body: { code: await otp.generate({ secret }) }, status: 401 });
      const me = (await request('/api/auth/me', { token: result.token })).data;
      check(me.user.mfaEnabled && noSecrets(me), `${name}: /me indica MFA sin exponer secreto`);
      const encrypted = (await User.findById(stored._id).select('+mfaSecretEncrypted')).mfaSecretEncrypted;
      check(encrypted.startsWith('v1.') && !encrypted.includes(secret) && decryptSecret(encrypted) === secret, `${name}: secreto cifrado con AES-256-GCM`);
      accounts[name] = { ...account, token: result.token, pending };
    }
    check(individualSecrets.size === 4, 'Secreto TOTP individual para cada usuario');
    const tampered = encryptSecret('temporary-sensitive-value');
    let rejected = false;
    try { decryptSecret(`${tampered.slice(0, -4)}AAAA`); } catch { rejected = true; }
    check(rejected, 'AES-GCM rechaza contenido alterado');
    const forged = jwt.sign({ role: 'ADMIN', store: String(storeIds[0]), ver: 0 }, process.env.JWT_SECRET, { subject: accounts.ADMIN.id, issuer: 'techstore', audience: 'techstore-web', expiresIn: '1h' });
    await request('/api/auth/me', { token: forged, status: 401 });
    check(true, 'JWT previo sin evidencia MFA no permite acceso');
    const badSignature = jwt.sign({ mfa: true, ver: 0 }, randomBytes(32), { subject: accounts.ADMIN.id, issuer: 'techstore', audience: 'techstore-web', expiresIn: '1h' });
    await request('/api/auth/me', { token: badSignature, status: 401 });
    const expiredToken = jwt.sign({ mfa: true, ver: 0 }, process.env.JWT_SECRET, { subject: accounts.ADMIN.id, issuer: 'techstore', audience: 'techstore-web', expiresIn: -1 });
    await request('/api/auth/me', { token: expiredToken, status: 401 });
    check(true, 'Firma y expiración JWT verificadas');

    const invalidMfa = await login(accounts.EMPLEADO);
    check(invalidMfa.type === 'verify' && !invalidMfa.token, 'Login posterior exige TOTP sin volver a mostrar QR');
    await request('/api/auth/mfa/qr', { challenge: invalidMfa.challengeToken, status: 403 });
    await request('/api/auth/mfa/verify', { method: 'POST', challenge: invalidMfa.challengeToken, body: { code: '12345' }, status: 422 });
    const wrong = await wrongCode(invalidMfa);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await request('/api/auth/mfa/verify', { method: 'POST', challenge: invalidMfa.challengeToken, body: { code: wrong }, status: attempt === 3 ? 401 : 422 });
      check(result.data.error.remainingAttempts === 3 - attempt, `MFA incorrecto: intento ${attempt}, contador independiente`);
    }
    await request('/api/auth/mfa/verify', { method: 'POST', challenge: invalidMfa.challengeToken, body: { code: await validCode(invalidMfa) }, status: 401 });
    check((await User.findById(accounts.EMPLEADO.id)).failedLoginAttempts === 0, 'Tres fallos MFA no modifican contador de contraseña');
    const fresh = await login(accounts.EMPLEADO);
    check(fresh.challengeToken !== invalidMfa.challengeToken, 'Tras tres fallos se requiere un nuevo login');
    await AuthChallenge.updateOne({ tokenHash: digest(fresh.challengeToken) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await request('/api/auth/mfa/challenge', { challenge: fresh.challengeToken, status: 401 });
    check(true, 'Desafío MFA expirado rechazado');

    const locked = await registerAccount('lock');
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request('/api/auth/login', { method: 'POST', body: { email: locked.email, password: `${password}!wrong` }, status: 401 });
      check((await User.findById(locked.id)).failedLoginAttempts === attempt, `Contraseña incorrecta: fallo ${attempt}`);
    }
    const lockedUser = await User.findById(locked.id);
    check(lockedUser.lockUntil > new Date(), 'Quinto fallo bloquea temporalmente');
    await login(locked, 401);
    await User.updateOne({ _id: locked.id }, { $set: { lockUntil: new Date(Date.now() - 1000) } });
    await request('/api/auth/login', { method: 'POST', body: { email: locked.email, password: `${password}!wrong` }, status: 401 });
    check((await User.findById(locked.id)).failedLoginAttempts === 1, 'Bloqueo vencido reinicia contador de fallos');
    await login(locked);
    check((await User.findById(locked.id)).failedLoginAttempts === 0, 'Contraseña correcta reinicia fallos');
    await Promise.all(Array.from({ length: 5 }, () => request('/api/auth/login', { method: 'POST', body: { email: locked.email, password: `${password}!wrong` }, status: 401 })));
    check((await User.findById(locked.id)).failedLoginAttempts === 5 && (await User.findById(locked.id)).lockUntil > new Date(), 'Cinco fallos concurrentes se conservan y bloquean');

    const firstBody = { name: `${marker} Producto A`, sku: `${marker}-A`, description: 'Prueba identificable', price: 12.5, stock: 15, store: String(storeIds[0]), active: true };
    const secondBody = { ...firstBody, name: `${marker} Producto B`, sku: `${marker}-B`, store: String(storeIds[1]), stock: 0 };
    const first = (await request('/api/products', { token: accounts.ADMIN.token, method: 'POST', body: firstBody, status: 201 })).data.product;
    const second = (await request('/api/products', { token: accounts.ADMIN.token, method: 'POST', body: secondBody, status: 201 })).data.product;
    check(Boolean(await Product.findById(first._id)), 'ADMIN crea producto real en MongoDB');
    await request('/api/products', { token: accounts.ADMIN.token, method: 'POST', body: firstBody, status: 409 });
    await request(`/api/products/${second._id}`, { token: accounts.ADMIN.token, method: 'PATCH', body: { price: 20, description: 'Actualizado' } });
    await request(`/api/products/${second._id}/stock`, { token: accounts.ADMIN.token, method: 'PATCH', body: { stock: 5 } });
    check((await Product.findById(second._id)).price === 20, 'ADMIN edita precios y stock en cualquier tienda');
    const own = (await request('/api/products', { token: accounts.GERENTE.token, method: 'POST', body: { ...firstBody, sku: `${marker}-M`, stock: 8 }, status: 201 })).data.product;
    await request(`/api/products/${own._id}`, { token: accounts.GERENTE.token, method: 'PATCH', body: { price: 22 } });
    await request(`/api/products/${own._id}/stock`, { token: accounts.GERENTE.token, method: 'PATCH', body: { stock: 9 } });
    check((await Product.findById(own._id)).price === 22, 'GERENTE crea y modifica precio/stock de su tienda');
    for (const [method, suffix, body] of [['GET', '', undefined], ['PATCH', '', { price: 1 }], ['PATCH', '/stock', { stock: 1 }], ['DELETE', '', undefined]]) await request(`/api/products/${second._id}${suffix}`, { token: accounts.GERENTE.token, method, body, status: 403 });
    await request('/api/products', { token: accounts.GERENTE.token, method: 'POST', body: { ...secondBody, sku: `${marker}-FORBIDDEN` }, status: 403 });
    await request(`/api/products/${own._id}`, { token: accounts.GERENTE.token, method: 'PATCH', body: { store: String(storeIds[1]) }, status: 403 });
    await request(`/api/reports?store=${storeIds[1]}`, { token: accounts.GERENTE.token, status: 403 });
    check(true, 'GERENTE: tienda ajena rechazada con HTTP 403 en lectura/escritura/reportes');
    for (const name of ['EMPLEADO', 'AUDITOR']) {
      const token = accounts[name].token;
      await request('/api/products', { token });
      await request('/api/products', { token, method: 'POST', body: { ...firstBody, sku: `${marker}-${name}` }, status: 403 });
      await request(`/api/products/${first._id}`, { token, method: 'PATCH', body: { price: 1 }, status: 403 });
      await request(`/api/products/${first._id}`, { token, method: 'DELETE', status: 403 });
      await request('/api/stores', { token, method: 'POST', body: { name: marker, address: marker }, status: 403 });
      await request(`/api/stores/${storeIds[0]}`, { token, method: 'PATCH', body: { name: marker }, status: 403 });
      await request(`/api/users/${accounts.GERENTE.id}/role`, { token, method: 'PATCH', body: { role: 'ADMIN' }, status: 403 });
      check(true, `${name}: modificaciones y escalada de privilegios rechazadas`);
    }
    await request(`/api/products/${first._id}/stock`, { token: accounts.EMPLEADO.token, method: 'PATCH', body: { stock: 7 } });
    await request(`/api/products/${first._id}/stock`, { token: accounts.EMPLEADO.token, method: 'PATCH', body: { stock: 7, price: 1 }, status: 403 });
    await request(`/api/products/${first._id}/stock`, { token: accounts.EMPLEADO.token, method: 'PATCH', body: { stock: 7, store: String(storeIds[1]) }, status: 403 });
    await request(`/api/products/${second._id}/stock`, { token: accounts.EMPLEADO.token, method: 'PATCH', body: { stock: 7 }, status: 403 });
    check((await Product.findById(first._id)).stock === 7 && (await Product.findById(first._id)).price === 12.5, 'EMPLEADO actualiza solo stock, nunca precio ni tienda');
    await request(`/api/products/${first._id}/stock`, { token: accounts.AUDITOR.token, method: 'PATCH', body: { stock: 1 }, status: 403 });
    await request('/api/reports', { token: accounts.AUDITOR.token });
    check(true, 'AUDITOR consulta reportes y no puede cambiar stock');
    await request('/api/reports', { token: accounts.EMPLEADO.token, status: 403 });
    await request('/api/users', { token: accounts.GERENTE.token, status: 403 });
    await request('/api/roles', { token: accounts.EMPLEADO.token, status: 403 });
    await request('/api/products/not-an-object-id', { token: accounts.ADMIN.token, status: 400 });
    await request('/api/products?store=invalid', { token: accounts.ADMIN.token, status: 422 });
    await request(`/api/products/${first._id}`, { token: accounts.ADMIN.token, method: 'PATCH', body: { stock: -1 }, status: 422 });
    check(true, 'Identificadores, entradas y acceso a secciones administrativas validados');
    const report = (await request(`/api/reports?store=${storeIds[0]}`, { token: accounts.ADMIN.token })).data.report;
    check(report.products === 2 && report.stock === 16 && report.lowStock === 2 && report.noStock === 0 && report.value === 285.5, 'Reporte por tienda calcula SUM(precio × stock) y umbrales reales');
    const storeReport = (await request('/api/stores', { token: accounts.ADMIN.token })).data.stores.find((entry) => entry._id === String(storeIds[0]));
    check(storeReport.products === report.products && storeReport.stock === report.stock, 'Tiendas muestran cantidad de productos y stock real');
    await request(`/api/stores/${storeIds[1]}`, { token: accounts.ADMIN.token, method: 'PATCH', body: { address: 'Actualización temporal' } });
    const newStore = (await request('/api/stores', { token: accounts.ADMIN.token, method: 'POST', body: { name: `${marker} C`, address: 'Tienda temporal' }, status: 201 })).data.store;
    storeIds.push(new mongoose.Types.ObjectId(newStore._id));
    check(true, 'ADMIN crea y edita tiendas');
    const changed = await registerAccount('role-change');
    const changedLogin = await complete(await login(changed));
    await request(`/api/users/${changed.id}/role`, { token: accounts.ADMIN.token, method: 'PATCH', body: { role: 'AUDITOR', store: null } });
    await request('/api/auth/me', { token: changedLogin.token, status: 401 });
    check((await User.findById(changed.id).populate('role')).role.name === 'AUDITOR', 'ADMIN cambia rol; sesión anterior revocada');
    await request(`/api/users/${accounts.ADMIN.id}/role`, { token: accounts.ADMIN.token, method: 'PATCH', body: { role: 'EMPLEADO' }, status: 400 });
    const users = (await request('/api/users', { token: accounts.ADMIN.token })).data;
    check(noSecrets(users), 'API de usuarios no revela hashes ni secretos TOTP');
    const deleted = (await request('/api/products', { token: accounts.ADMIN.token, method: 'POST', body: { ...firstBody, sku: `${marker}-DELETE` }, status: 201 })).data.product;
    await request(`/api/products/${deleted._id}`, { token: accounts.ADMIN.token, method: 'DELETE', status: 204 });
    check(!await Product.exists({ _id: deleted._id }), 'ADMIN elimina únicamente el producto temporal solicitado');
    const found = (await request(`/api/products?q=${encodeURIComponent(firstBody.sku)}&limit=1`, { token: accounts.ADMIN.token })).data;
    check(found.products.length === 1 && found.total === 1 && found.pages === 1, 'Búsqueda SKU y paginación conectadas a MongoDB');
    const employeeScope = (await request('/api/products', { token: accounts.EMPLEADO.token })).data;
    check(employeeScope.products.every((entry) => entry.store._id === String(storeIds[0])), 'EMPLEADO ve exclusivamente su tienda');

    const demoFirst = await seedDemo();
    const demoSecond = await seedDemo();
    check(demoSecond.inserted === 0 && demoSecond.existing === 5, 'Seed idempotente: segunda ejecución sin duplicados');
    check(demoFirst.inserted + demoFirst.existing === 5, 'Seed completa cinco SKUs sin sobrescribir datos existentes');
    for (const provider of ['google', 'github']) {
      const prefix = provider.toUpperCase();
      delete process.env[`${prefix}_CLIENT_ID`];
      delete process.env[`${prefix}_CLIENT_SECRET`];
      const data = (await request(`/api/auth/oauth/${provider}`, { status: 503 })).data;
      check(data.error.code === 'OAUTH_NOT_CONFIGURED', `${provider}: ausencia de configuración manejada sin romper servidor`);
    }
    await oauthTests(accounts);
    const follow = await registerAccount('subsequent-login');
    const initial = await complete(await login(follow));
    await request('/api/auth/logout', { token: initial.token, method: 'POST', status: 204 });
    await request('/api/auth/me', { token: initial.token, status: 401 });
    const nextPending = await login(follow);
    const usedCode = await validCode(nextPending);
    const nextLogin = (await request('/api/auth/mfa/verify', { method: 'POST', challenge: nextPending.challengeToken, body: { code: usedCode } })).data;
    await request('/api/dashboard', { token: nextLogin.token });
    check(nextPending.type === 'verify' && Boolean(nextLogin.token), 'Logout → nuevo login → TOTP → JWT → dashboard verificado');
    const replay = await login(follow);
    await request('/api/auth/mfa/verify', { method: 'POST', challenge: replay.challengeToken, body: { code: usedCode }, status: 422 });
    check(true, 'Código TOTP ya utilizado no se acepta de nuevo');
    const browserAccount = await registerAccount('browser');
    const { verifyBrowser } = require('./verify-browser');
    await verifyBrowser({ baseUrl, marker, root, password, browserAccount, accounts, storeIds, User, Product, secretFor, validCode, request, check });
  } catch {
    console.error(`FALLO en comprobación: ${currentCheck}. No se muestran secretos ni valores sensibles.`);
    process.exitCode = 1;
  } finally {
    global.fetch = originalFetch;
    QRCode.toBuffer = originalQr;
    if (mongoose.connection.readyState === 1) {
      const registered = await User.find({ email: { $in: emails } }).select('_id');
      const ownedIds = [...userIds, ...registered.map((entry) => entry._id)];
      await AuthChallenge.deleteMany({ user: { $in: ownedIds } });
      await OAuthState.deleteMany({ _id: { $in: oauthStateIds } });
      await Product.deleteMany({ store: { $in: storeIds }, sku: { $regex: `^${marker.toUpperCase()}` } });
      await User.deleteMany({ _id: { $in: ownedIds }, email: { $in: emails } });
      await Store.deleteMany({ _id: { $in: storeIds }, name: { $regex: `^${marker}` } });
      console.log('Limpieza limitada a IDs de cuentas, desafíos, productos y tiendas temporales de esta ejecución.');
      if (process.exitCode !== 1) {
        check(await Product.countDocuments({ store: { $in: storeIds }, sku: { $regex: `^${marker.toUpperCase()}` } }) === 0, 'Ningún producto temporal permanece después de la limpieza');
        check(await User.countDocuments({ _id: { $in: ownedIds } }) === 0, 'Ningún usuario temporal permanece después de la limpieza');
        check(await Store.countDocuments({ _id: { $in: storeIds } }) === 0, 'Ninguna tienda temporal permanece después de la limpieza');
        await verifyPreserved();
        console.log(`RESULTADO: ${passed} comprobaciones satisfactorias. OAuth externo probado con respuestas simuladas, no con cuentas reales.`);
      }
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDatabase();
  }
}

main().catch(() => { console.error('No se pudo finalizar la verificación de forma segura.'); process.exitCode = 1; });
