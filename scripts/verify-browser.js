const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function verifyBrowser(context) {
  const { baseUrl, marker, root, password, browserAccount, accounts, storeIds, User, Product, validCode, request, check } = context;
  const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((filename) => filename && fs.existsSync(filename));
  if (!chrome) { console.log('UI NO VERIFICADA: instala Chrome o define CHROME_PATH.'); return; }
  const directory = path.join(root, '.verification', marker);
  fs.mkdirSync(directory, { recursive: true });
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${path.join(directory, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  let currentAction = 'Arranque de Chrome';
  let sequence = 0;
  const pending = new Map();
  const browserErrors = [];
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Chrome no respondió.')), 20000);
      child.once('error', reject);
      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
        const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(output);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    const port = new URL(endpoint).port;
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    socket.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        const entry = pending.get(data.id);
        pending.delete(data.id);
        clearTimeout(entry.timer);
        if (data.error) entry.reject(new Error('Chrome rechazó una operación de verificación.'));
        else entry.resolve(data.result);
      }
      if (data.method === 'Runtime.exceptionThrown') browserErrors.push('Excepción JavaScript');
      if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error') browserErrors.push('Error de recurso del navegador');
    });
    function command(method, params = {}) {
      sequence += 1;
      const id = sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Chrome no respondió a una operación.')); }, 15000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate(expression) {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error('Falló una evaluación de la interfaz.');
      return result.result.value;
    }
    async function waitFor(expression, label) {
      currentAction = label;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (await evaluate(expression)) return;
        await pause(100);
      }
      throw new Error('La interfaz no alcanzó el estado esperado.');
    }
    async function navigate(route) {
      await command('Page.navigate', { url: `${baseUrl}${route}` });
      await waitFor(`location.pathname === ${JSON.stringify(route.split('?')[0])} && document.readyState === 'complete'`, `Carga de ${route}`);
    }
    async function asRole(role, route = '/inventory') {
      await evaluate('sessionStorage.clear()');
      await navigate('/login');
      await evaluate(`sessionStorage.setItem('techstore.accessToken', ${JSON.stringify(accounts[role].token)})`);
      await navigate(route);
      await waitFor("document.querySelector('#private-shell') && !document.querySelector('#private-shell').hidden && document.querySelector('#resource-head th')", `${role}: datos visibles`);
    }
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Log.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await navigate('/login');
    for (const role of ['ADMIN', 'GERENTE', 'EMPLEADO', 'AUDITOR']) {
      await asRole(role);
      const visibility = await evaluate("({visible:!document.querySelector('#create-product').hidden,text:document.querySelector('#create-product').textContent,headers:[...document.querySelectorAll('#resource-head th')].map(header=>({size:parseFloat(getComputedStyle(header).fontSize),weight:getComputedStyle(header).fontWeight,color:getComputedStyle(header).color})),overflow:document.documentElement.scrollWidth>innerWidth+1,tableOverflow:document.querySelector('.table-scroll').scrollWidth>document.querySelector('.table-scroll').clientWidth+1,navbar:document.querySelector('#navbar-role').textContent})");
      check(visibility.visible === ['ADMIN', 'GERENTE'].includes(role) && visibility.text.includes('+ Nuevo producto'), `UI ${role}: visibilidad correcta de + Nuevo producto`);
      if (['ADMIN', 'GERENTE'].includes(role)) check(await evaluate("parseFloat(getComputedStyle(document.querySelector('#create-product')).fontSize)>=15 && document.querySelector('#create-product').getBoundingClientRect().height>=44"), `UI ${role}: Nuevo producto grande y claramente visible`);
      check(await evaluate("document.querySelector('#sidebar').scrollWidth <= document.querySelector('#sidebar').clientWidth+1"), `UI ${role}: sidebar sin scroll horizontal`);
      check(visibility.headers.length === 7 && visibility.headers.every((header) => header.size >= 16 && Number(header.weight) >= 700 && header.color === 'rgb(18, 43, 78)'), `UI ${role}: siete encabezados grandes, oscuros y en negrita`);
      check(!visibility.overflow && !visibility.tableOverflow && visibility.navbar === role, `UI ${role}: 1366×768 sin scroll horizontal innecesario`);
      if (role === 'ADMIN') {
        await evaluate("document.querySelector('#create-product').click()");
        await waitFor("document.querySelector('#management-dialog').open", 'Formulario de producto abierto');
        const body = { productName: `${marker} UI`, productSku: `${marker}-UI`, productDescription: 'Creado mediante formulario visual', productPrice: '45.9', productStock: '12', productStore: String(storeIds[0]), productActive: 'true' };
        await evaluate(`(() => { const form = document.querySelector('#management-form'); const data = ${JSON.stringify(body)}; for (const [name,value] of Object.entries(data)) form.elements[name].value=value; form.requestSubmit(); })()`);
        await waitFor("!document.querySelector('#management-dialog').open && document.querySelector('#dashboard-message').textContent.includes('Producto creado')", 'Producto guardado desde UI');
        const product = await Product.findOne({ sku: `${marker}-UI` });
        check(Boolean(product) && product.price === 45.9 && product.stock === 12, 'UI ADMIN: formulario guarda realmente el producto en MongoDB');
        await evaluate(`(() => { const select=document.querySelector('#inventory-store-filter');select.value=${JSON.stringify(String(storeIds[0]))};select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
        await waitFor(`document.querySelector('#resource-body').textContent.includes(${JSON.stringify(`${marker} UI`)})`, 'Tabla actualizada tras creación');
        check(true, 'UI ADMIN: tabla se actualiza tras guardar');
        await evaluate(`(() => { const row=[...document.querySelectorAll('#resource-body tr')].find(entry=>entry.textContent.includes(${JSON.stringify(`${marker} UI`)}));[...row.querySelectorAll('button')].find(button=>button.textContent==='Editar').click(); })()`);
        await waitFor("document.querySelector('#management-dialog').open", 'Edición de producto abierta');
        await evaluate("document.querySelector('#product-price').value='46.9';document.querySelector('#management-form').requestSubmit()");
        await waitFor("!document.querySelector('#management-dialog').open && document.querySelector('#dashboard-message').textContent.includes('Producto actualizado')", 'Precio editado desde UI');
        check((await Product.findById(product._id)).price === 46.9, 'UI ADMIN: editar precio persiste en MongoDB');
        await evaluate(`(() => { const row=[...document.querySelectorAll('#resource-body tr')].find(entry=>entry.textContent.includes(${JSON.stringify(`${marker} UI`)}));[...row.querySelectorAll('button')].find(button=>button.textContent==='Eliminar').click(); })()`);
        await waitFor("document.querySelector('#management-dialog').open", 'Confirmación de eliminación abierta');
        await evaluate("document.querySelector('#management-form').requestSubmit()");
        await waitFor("!document.querySelector('#management-dialog').open && document.querySelector('#dashboard-message').textContent.includes('Producto eliminado')", 'Producto eliminado desde UI');
        check(!await Product.exists({ _id: product._id }), 'UI ADMIN: confirmación elimina solo el producto temporal');
      }
      if (role === 'EMPLEADO') {
        const sku = await evaluate("document.querySelector('#resource-body tr td:nth-child(2)').textContent");
        await evaluate("document.querySelector('#resource-body button').click()");
        await waitFor("document.querySelector('#management-dialog').open", 'Actualización de stock abierta');
        await evaluate("document.querySelector('#stock').value='11';document.querySelector('#management-form').requestSubmit()");
        await waitFor("!document.querySelector('#management-dialog').open && document.querySelector('#dashboard-message').textContent.includes('Stock actualizado')", 'Stock actualizado desde UI');
        check((await Product.findOne({ sku, store: storeIds[0] })).stock === 11, 'UI EMPLEADO: actualización de stock permitida y persistida');
      }
    }
    await asRole('ADMIN');
    for (const route of ['/stores', '/users', '/roles', '/reports', '/account']) {
      await asRole('ADMIN', route);
      check(await evaluate("[...document.querySelectorAll('#resource-head th')].every(header=>parseFloat(getComputedStyle(header).fontSize)>=16 && Number(getComputedStyle(header).fontWeight)>=700) && document.documentElement.scrollWidth<=innerWidth+1"), `UI ${route}: encabezados legibles y sin desbordamiento desktop`);
    }
    await asRole('ADMIN');
    const screenshot = await command('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(root, '.verification', 'inventory-desktop.png'), Buffer.from(screenshot.data, 'base64'));
    for (const width of [390, 320]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      await asRole('ADMIN');
      check(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `UI responsive ${width}px: sin desbordamiento de la página`);
      await evaluate("document.querySelector('#menu-toggle').click()");
      check(await evaluate("document.querySelector('#sidebar').classList.contains('is-open') && document.querySelector('#main-content').inert"), `UI responsive ${width}px: sidebar móvil accesible`);
      await evaluate("document.querySelector('#sidebar-close').click()");
    }
    await command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await evaluate('sessionStorage.clear()');
    await navigate('/login');
    await evaluate("document.querySelector('[data-oauth=google]').click()");
    await waitFor("document.querySelector('#form-message').textContent.includes('requiere configuración')", 'Mensaje de OAuth sin configuración');
    check(true, 'UI Google sin credenciales muestra mensaje amigable');
    async function submitLogin() {
      await evaluate(`document.querySelector('#email').value=${JSON.stringify(browserAccount.email)};document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#auth-form').requestSubmit()`);
    }
    await submitLogin();
    await waitFor("location.pathname==='/mfa/setup' && document.querySelector('#mfa-qr') && !document.querySelector('#mfa-qr').hidden && document.querySelector('#mfa-qr').complete", 'Primer login llega a QR');
    const pendingSetup = await evaluate("JSON.parse(sessionStorage.getItem('techstore.pendingMfa'))");
    check(!await evaluate("sessionStorage.getItem('techstore.accessToken')") && !(await User.findById(browserAccount.id)).mfaEnabled, 'UI primer login: QR visible sin JWT ni MFA activo');
    check(await evaluate("document.querySelector('#mfa-qr').getBoundingClientRect().width >= 250 && document.querySelector('#mfa-qr').naturalWidth === 320"), 'UI QR grande y PNG cargado para escanear con celular');
    const firstCode = await validCode(pendingSetup, true);
    await evaluate(`document.querySelector('#mfa-code').value=${JSON.stringify(firstCode)};document.querySelector('#mfa-form').requestSubmit()`);
    await waitFor("location.pathname==='/dashboard' && document.querySelector('#private-shell') && !document.querySelector('#private-shell').hidden && document.querySelector('#resource-head th')", 'TOTP confirmado llega al dashboard');
    const firstToken = await evaluate("sessionStorage.getItem('techstore.accessToken')");
    check(Boolean(firstToken) && (await User.findById(browserAccount.id)).mfaEnabled, 'UI registro → login → QR → TOTP → JWT → dashboard');
    await evaluate("document.querySelector('#logout').click()");
    await waitFor("location.pathname==='/login' && document.querySelector('#auth-form')", 'Logout vuelve al login');
    await request('/api/auth/me', { token: firstToken, status: 401 });
    await submitLogin();
    await waitFor("location.pathname==='/mfa' && document.querySelector('#mfa-content') && !document.querySelector('#mfa-content').hidden", 'Segundo login llega a TOTP');
    check(await evaluate("document.querySelector('#mfa-setup').hidden && !sessionStorage.getItem('techstore.accessToken')"), 'UI siguiente login: solo código, sin QR ni JWT anticipado');
    const pendingVerify = await evaluate("JSON.parse(sessionStorage.getItem('techstore.pendingMfa'))");
    const secondCode = await validCode(pendingVerify);
    await evaluate(`document.querySelector('#mfa-code').value=${JSON.stringify(secondCode)};document.querySelector('#mfa-form').requestSubmit()`);
    await waitFor("location.pathname==='/dashboard' && document.querySelector('#resource-head th')", 'Segundo TOTP llega al dashboard');
    check(Boolean(await evaluate("sessionStorage.getItem('techstore.accessToken')")), 'UI logout → login → TOTP → JWT → dashboard');
    check(browserErrors.length === 0, 'Navegador sin excepciones JavaScript ni recursos ausentes');
    console.log('Captura de inventario: .verification/inventory-desktop.png. El QR y los secretos no se capturan.');
  } catch (error) {
    console.log(`Diagnóstico UI: ${error.code || error.name}; ${currentAction}.`);
    if (['Chrome no respondió.', 'Chrome rechazó una operación de verificación.', 'Chrome no respondió a una operación.', 'Falló una evaluación de la interfaz.', 'La interfaz no alcanzó el estado esperado.'].includes(error.message)) console.log(error.message);
    check(false, `UI: ${currentAction}`);
  } finally {
    if (socket) socket.close();
    for (const entry of pending.values()) clearTimeout(entry.timer);
    if (!child.killed) child.kill();
  }
}

module.exports = { verifyBrowser };
