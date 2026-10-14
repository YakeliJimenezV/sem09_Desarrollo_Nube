(() => {
  'use strict';
  const session = TechStoreSession;
  const roleNames = { ADMIN: 'Administrador', GERENTE: 'Gerente', EMPLEADO: 'Empleado', AUDITOR: 'Auditor' };
  const pages = {
    '/dashboard': { title: 'Dashboard', description: 'Una visión clara de tu operación.', icon: 'grid', roles: ['ADMIN', 'GERENTE', 'EMPLEADO', 'AUDITOR'] },
    '/inventory': { title: 'Inventario', description: 'Productos y existencias dentro de tu ámbito de acceso.', icon: 'box', roles: ['ADMIN', 'GERENTE', 'EMPLEADO', 'AUDITOR'] },
    '/stores': { title: 'Tiendas', description: 'Las sedes que forman parte de tu operación.', icon: 'store', roles: ['ADMIN', 'GERENTE', 'AUDITOR'] },
    '/reports': { title: 'Reportes', description: 'Información actual para comprender tu inventario.', icon: 'chart', roles: ['ADMIN', 'GERENTE', 'AUDITOR'] },
    '/users': { title: 'Usuarios', description: 'Personas y accesos dentro de TechStore.', icon: 'users', roles: ['ADMIN', 'AUDITOR'] },
    '/roles': { title: 'Roles', description: 'Cada persona, el acceso correcto.', icon: 'shield', roles: ['ADMIN', 'AUDITOR'] },
    '/account': { title: 'Mi cuenta', description: 'Tu información dentro de TechStore.', icon: 'user', roles: ['ADMIN', 'GERENTE', 'EMPLEADO', 'AUDITOR'] },
  };
  const currentPath = window.location.pathname;
  const page = pages[currentPath];
  const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
  const numbers = new Intl.NumberFormat('es-PE');
  const tableBody = document.querySelector('#resource-body');
  const dialog = document.querySelector('#management-dialog');
  const form = document.querySelector('#management-form');
  const sidebar = document.querySelector('#sidebar');
  const menuToggle = document.querySelector('#menu-toggle');
  let user;
  let productPage = 1;
  let requestVersion = 0;
  let management;
  let availableStores = [];
  const canManageProducts = () => ['ADMIN', 'GERENTE'].includes(user.role);
  function selectedStore() { return document.querySelector('#inventory-store-filter').value; }
  function scopeQuery() { return selectedStore() ? `?${new URLSearchParams({ store: selectedStore() })}` : ''; }

  function node(tag, text, className) {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `/img/icons.svg#${name}`);
    svg.append(use);
    return svg;
  }

  function message(text, success = false) {
    const target = document.querySelector('#dashboard-message');
    target.textContent = text;
    target.hidden = false;
    target.classList.toggle('is-success', success);
  }

  function table(headers, rows) {
    const head = node('tr');
    for (const title of headers) { const cell = node('th', title); cell.scope = 'col'; head.append(cell); }
    document.querySelector('#resource-head').replaceChildren(head);
    tableBody.replaceChildren(...rows);
    if (!rows.length) { const row = node('tr'); const cell = node('td', 'Todavía no hay registros para mostrar.', 'private-empty'); cell.colSpan = headers.length; row.append(cell); tableBody.append(row); }
  }

  function row(values) {
    const result = node('tr');
    for (const value of values) { const cell = node('td'); if (value instanceof Node) cell.append(value); else cell.textContent = value; result.append(cell); }
    return result;
  }

  function action(label, callback) { const button = node('button', label, 'button button-secondary table-action'); button.type = 'button'; button.addEventListener('click', callback); return button; }

  async function statistics() {
    const data = await session.request(`/api/dashboard${scopeQuery()}`);
    for (const [key, id] of [['products', 'stat-products'], ['stock', 'stat-stock'], ['stores', 'stat-stores'], ['stockReview', 'stat-low-stock']]) document.getElementById(id).textContent = numbers.format(data.statistics[key]);
  }

  async function loadProducts() {
    const version = ++requestVersion;
    const query = new URLSearchParams({ page: productPage, limit: 10, q: document.querySelector('#inventory-search').value });
    if (selectedStore()) query.set('store', selectedStore());
    const data = await session.request(`/api/products?${query}`);
    if (version !== requestVersion) return;
    const writable = user.role !== 'AUDITOR';
    if (data.page > data.pages) { productPage = data.pages; return loadProducts(); }
    table(['Producto', 'SKU', 'Tienda', 'Precio', 'Stock', 'Estado', 'Acciones'], data.products.map((product) => {
      const status = node('div', undefined, 'product-status');
      const stockLabel = product.stock === 0 ? 'SIN STOCK' : (product.stock <= 10 ? 'STOCK BAJO' : 'STOCK DISPONIBLE');
      status.append(node('span', stockLabel, `badge ${product.stock === 0 ? 'badge-neutral' : (product.stock <= 10 ? 'badge-cyan' : 'badge-blue')}`));
      if (!product.active) status.append(node('span', 'INACTIVO', 'badge badge-neutral'));
      const productName = node('div', undefined, 'product-name');
      productName.append(node('strong', product.name));
      if (product.description) productName.append(node('small', product.description));
      const actions = node('div', undefined, 'table-actions');
      if (writable) actions.append(action('Stock', () => openManagement('stock', product)));
      if (canManageProducts()) {
        actions.append(action('Editar', () => openManagement('product', product)));
        actions.append(action('Eliminar', () => openManagement('delete', product)));
      }
      if (!writable) actions.textContent = 'Solo lectura';
      const values = [productName, product.sku, product.store?.name || 'Sin tienda', currency.format(product.price), numbers.format(product.stock), status, actions];
      return row(values);
    }));
    document.querySelector('#resource-summary').textContent = `Página ${data.page} de ${data.pages} · ${data.total} productos`;
    document.querySelector('#page-number').textContent = data.page;
    document.querySelector('#previous-page').disabled = data.page <= 1;
    document.querySelector('#next-page').disabled = data.page >= data.pages;
  }

  async function loadResource() {
    document.querySelector('#resource-title').textContent = ['/dashboard', '/inventory'].includes(currentPath) ? 'Inventario' : page.title;
    document.querySelector('#resource-description').textContent = user.role === 'AUDITOR' ? 'Acceso de consulta. Las operaciones de modificación están restringidas.' : 'Datos actuales de tu ámbito de acceso.';
    if (['/dashboard', '/inventory'].includes(currentPath)) {
      document.querySelector('#inventory-toolbar').hidden = false;
      document.querySelector('#inventory-pagination').hidden = false;
      document.querySelector('#inventory-access').textContent = user.role === 'AUDITOR' ? 'Solo lectura' : 'Actualización de stock disponible';
      document.querySelector('#create-product').hidden = !canManageProducts();
      document.querySelector('#store-filter-field').hidden = !['ADMIN', 'AUDITOR'].includes(user.role);
      await loadProducts();
    } else if (currentPath === '/stores') {
      const { stores } = await session.request('/api/stores');
      table(['Tienda', 'Dirección', 'Productos', 'Stock total', 'Estado', 'Acciones'], stores.map((store) => row([store.name, store.address, numbers.format(store.products), numbers.format(store.stock), store.active ? 'Activa' : 'Inactiva', user.role === 'ADMIN' ? action('Editar', () => openManagement('store', store)) : 'Solo lectura'])));
      document.querySelector('#create-store').hidden = user.role !== 'ADMIN';
      document.querySelector('#resource-summary').textContent = `${stores.length} tiendas`;
    } else if (currentPath === '/users') {
      const { users } = await session.request('/api/users');
      table(['Nombre', 'Email', 'Rol', 'Tienda', 'Estado', 'Acciones'], users.map((account) => row([account.fullName, account.email, account.role, account.store?.name || 'Sin tienda', account.active ? 'Activo' : 'Inactivo', user.role === 'ADMIN' ? action('Asignar rol', () => openManagement('role', account)) : 'Solo lectura'])));
      document.querySelector('#resource-summary').textContent = `${users.length} usuarios · máximo 200 en esta vista`;
    } else if (currentPath === '/roles') {
      const { roles } = await session.request('/api/roles');
      const descriptions = { ADMIN: 'Administración de todas las tiendas y recursos.', GERENTE: 'Productos y reportes de su tienda.', EMPLEADO: 'Consulta y actualización de stock de su tienda; sin modificar precios.', AUDITOR: 'Consulta global y reportes; sin modificaciones.' };
      table(['Rol', 'Ámbito de acceso'], roles.map((role) => row([role.name, descriptions[role.name]])));
      document.querySelector('#resource-summary').textContent = 'Los roles se asignan desde Usuarios. La política de acceso se aplica en el servidor.';
    } else if (currentPath === '/reports') {
      document.querySelector('#inventory-toolbar').hidden = false;
      document.querySelector('#product-search-field').hidden = true;
      document.querySelector('#store-filter-field').hidden = !['ADMIN', 'AUDITOR'].includes(user.role);
      document.querySelector('#inventory-access').textContent = 'Reporte de consulta · datos reales';
      const { report, generatedAt } = await session.request(`/api/reports${scopeQuery()}`);
      table(['Indicador', 'Valor'], [row(['Total de productos', numbers.format(report.products)]), row(['Total de unidades en stock', numbers.format(report.stock)]), row(['Productos con stock bajo (1–10)', numbers.format(report.lowStock)]), row(['Productos sin stock', numbers.format(report.noStock)]), row(['Valor total del inventario', currency.format(report.value)])]);
      document.querySelector('#resource-summary').textContent = `Reporte generado: ${new Date(generatedAt).toLocaleString('es-PE')}`;
    } else {
      table(['Información', 'Detalle'], [row(['Nombre completo', user.fullName]), row(['Email', user.email]), row(['Rol', user.role]), row(['Tienda asignada', user.store?.name || 'Sin tienda asignada']), row(['Estado', user.active ? 'Activo' : 'Inactivo']), row(['Autenticación en dos pasos', user.mfaEnabled ? 'ACTIVADA' : 'NO CONFIGURADA'])]);
      document.querySelector('#resource-summary').textContent = 'Tus datos de acceso. El secreto del autenticador nunca se muestra aquí.';
    }
  }

  async function openManagement(kind, resource = {}) {
    management = { kind, resource };
    form.reset();
    document.querySelector('#management-message').hidden = true;
    for (const fieldset of ['stock', 'store', 'role', 'product', 'delete']) {
      const section = document.querySelector(`#${fieldset}-fields`);
      section.hidden = fieldset !== kind;
      for (const input of section.querySelectorAll('input, select, textarea')) input.disabled = fieldset !== kind;
    }
    const titles = { stock: `Stock · ${resource.name}`, store: resource._id ? 'Editar tienda' : 'Nueva tienda', role: `Rol · ${resource.fullName}`, product: resource._id ? 'Editar producto' : 'Nuevo producto', delete: 'Eliminar producto' };
    document.querySelector('#management-title').textContent = titles[kind];
    document.querySelector('#management-save').textContent = kind === 'delete' ? 'Confirmar eliminación' : 'Guardar cambios';
    if (kind === 'stock') { form.elements.stock.value = resource.stock; form.elements.stock.required = true; }
    if (kind === 'store') { form.elements.name.value = resource.name || ''; form.elements.address.value = resource.address || ''; form.elements.storeActive.value = String(resource.active !== false); }
    if (kind === 'delete') document.querySelector('#delete-product-name').textContent = `${resource.name} · ${resource.sku}`;
    if (kind === 'product') {
      try { availableStores = (await session.request('/api/stores')).stores; } catch (error) { message(error.message); return; }
      const select = form.elements.productStore;
      const stores = availableStores.filter((store) => store.active || store._id === resource.store?._id);
      select.replaceChildren(...stores.map((store) => new Option(`${store.name}${store.active ? '' : ' (inactiva)'}`, store._id)));
      if (!stores.length) { message('Crea o activa una tienda antes de agregar productos.'); return; }
      form.elements.productName.value = resource.name || '';
      form.elements.productSku.value = resource.sku || '';
      form.elements.productDescription.value = resource.description || '';
      form.elements.productPrice.value = resource.price ?? '';
      form.elements.productStock.value = resource.stock ?? 0;
      form.elements.productActive.value = String(resource.active !== false);
      select.value = resource.store?._id || (user.role === 'GERENTE' ? user.store.id : stores[0]._id);
      document.querySelector('#product-timestamps').textContent = resource.createdAt ? `Creado: ${new Date(resource.createdAt).toLocaleString('es-PE')} · Actualizado: ${new Date(resource.updatedAt).toLocaleString('es-PE')}` : '';
    }
    if (kind === 'role') {
      try {
        const { stores } = await session.request('/api/stores');
        const select = document.querySelector('#new-store');
        select.replaceChildren(new Option('Sin tienda', ''));
        for (const store of stores.filter((entry) => entry.active)) select.append(new Option(store.name, store._id));
        form.elements.role.value = resource.role;
        select.value = resource.store?.id || '';
      } catch (error) { message(error.message); return; }
    }
    dialog.showModal();
    document.body.classList.add('no-scroll');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.querySelector('#management-save');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const { kind, resource } = management;
      if (kind === 'stock') await session.request(`/api/products/${resource._id}/stock`, { method: 'PATCH', body: { stock: Number(form.elements.stock.value) } });
      if (kind === 'store') await session.request(resource._id ? `/api/stores/${resource._id}` : '/api/stores', { method: resource._id ? 'PATCH' : 'POST', body: { name: form.elements.name.value.trim(), address: form.elements.address.value.trim(), active: form.elements.storeActive.value === 'true' } });
      if (kind === 'role') await session.request(`/api/users/${resource.id}/role`, { method: 'PATCH', body: { role: form.elements.role.value, store: form.elements.store.value || null } });
      if (kind === 'product') {
        const body = { name: form.elements.productName.value.trim(), sku: form.elements.productSku.value.trim(), description: form.elements.productDescription.value.trim(), price: Number(form.elements.productPrice.value), stock: Number(form.elements.productStock.value), active: form.elements.productActive.value === 'true' };
        if (!resource._id || form.elements.productStore.value !== resource.store?._id) body.store = form.elements.productStore.value;
        await session.request(resource._id ? `/api/products/${resource._id}` : '/api/products', { method: resource._id ? 'PATCH' : 'POST', body });
      }
      if (kind === 'delete') await session.request(`/api/products/${resource._id}`, { method: 'DELETE' });
      dialog.close();
      const messages = { stock: 'Stock actualizado.', product: resource._id ? 'Producto actualizado.' : 'Producto creado.', delete: 'Producto eliminado.', store: resource._id ? 'Tienda actualizada.' : 'Tienda creada.', role: 'Rol y tienda asignados correctamente.' };
      message(messages[kind], true);
      await Promise.all([loadResource(), statistics()]);
    } catch (error) { const target = document.querySelector('#management-message'); target.textContent = error.fields ? Object.values(error.fields).join(' ') : error.message; target.hidden = false; }
    finally { button.disabled = false; }
  });
  document.querySelector('#create-store').addEventListener('click', () => openManagement('store'));
  document.querySelector('#create-product').addEventListener('click', () => openManagement('product'));
  document.querySelector('#management-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.body.classList.remove('no-scroll'));

  function setSidebar(open, restore = true) {
    sidebar.classList.toggle('is-open', open);
    document.querySelector('#sidebar-overlay').hidden = !open;
    document.querySelector('#main-content').inert = open;
    document.querySelector('#topbar').inert = open;
    menuToggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('no-scroll', open);
    if (open) { sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true'); document.querySelector('#sidebar-close').focus(); }
    else { sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal'); if (restore) menuToggle.focus(); }
  }
  menuToggle.addEventListener('click', () => setSidebar(true));
  document.querySelector('#sidebar-close').addEventListener('click', () => setSidebar(false));
  document.querySelector('#sidebar-overlay').addEventListener('click', () => setSidebar(false));
  document.addEventListener('keydown', (event) => {
    if (!sidebar.classList.contains('is-open')) return;
    if (event.key === 'Escape') setSidebar(false);
    if (event.key === 'Tab') {
      const focusable = Array.from(sidebar.querySelectorAll('a[href], button')).filter((item) => item.getClientRects().length);
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
    }
  });
  window.addEventListener('resize', () => { if (window.innerWidth >= 1024 && sidebar.classList.contains('is-open')) setSidebar(false, false); });
  document.querySelector('#logout').addEventListener('click', () => session.logout().catch(() => {}));
  document.querySelector('#retry-session').addEventListener('click', () => window.location.reload());
  document.querySelector('#previous-page').addEventListener('click', () => { productPage -= 1; loadProducts().catch((error) => message(error.message)); });
  document.querySelector('#next-page').addEventListener('click', () => { productPage += 1; loadProducts().catch((error) => message(error.message)); });
  let searchTimer;
  document.querySelector('#inventory-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { productPage = 1; loadProducts().catch((error) => message(error.message)); }, 250); });
  document.querySelector('#inventory-store-filter').addEventListener('change', () => { productPage = 1; Promise.all([loadResource(), statistics()]).catch((error) => message(error.message)); });
  window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });

  async function start() {
    if (!session.token()) { window.location.replace('/login'); return; }
    user = (await session.request('/api/auth/me')).user;
    if (!page?.roles.includes(user.role)) { window.location.replace('/dashboard'); return; }
    session.watchExpiry();
    document.querySelector('#page-title').textContent = page.title;
    document.querySelector('#page-description').textContent = page.description;
    document.querySelector('#breadcrumb-page').textContent = page.title;
    document.querySelector('#navbar-name').textContent = user.fullName;
    document.querySelector('#navbar-role').textContent = user.role;
    document.querySelector('#user-avatar').textContent = user.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    document.querySelector('#sidebar-name').textContent = user.fullName;
    document.querySelector('#sidebar-role').textContent = roleNames[user.role];
    document.querySelector('#sidebar-store').textContent = user.store?.name || 'Todas las tiendas';
    document.querySelector('#scope-label').textContent = ['ADMIN', 'AUDITOR'].includes(user.role) ? 'Vista global' : user.store.name;
    document.querySelector('#welcome-name').textContent = `Hola, ${user.fullName.split(/\s+/)[0]}.`;
    document.querySelector('#welcome-scope').textContent = `${roleNames[user.role]} · ${user.store?.name || 'Sin tienda asignada'}`;
    document.querySelector('#dashboard-welcome').hidden = currentPath !== '/dashboard';
    availableStores = (await session.request('/api/stores')).stores;
    const storeFilter = document.querySelector('#inventory-store-filter');
    for (const store of availableStores) storeFilter.append(new Option(`${store.name}${store.active ? '' : ' (inactiva)'}`, store._id));
    document.querySelector('.data-table').classList.toggle('inventory-table', ['/dashboard', '/inventory'].includes(currentPath));
    if (new URLSearchParams(window.location.search).get('mfa') === 'success') message('Autenticación en dos pasos completada correctamente.', true);
    const navigation = document.querySelector('#private-navigation');
    navigation.append(node('p', 'TU WORKSPACE', 'nav-label'));
    for (const [href, entry] of Object.entries(pages)) {
      if (!entry.roles.includes(user.role)) continue;
      const link = node('a', undefined, `nav-item${href === currentPath ? ' is-active' : ''}`);
      link.href = href;
      if (href === currentPath) link.setAttribute('aria-current', 'page');
      link.append(icon(entry.icon), node('span', entry.title));
      navigation.append(link);
    }
    document.querySelector('#session-loading').hidden = true;
    document.querySelector('#private-shell').hidden = false;
    await Promise.all([statistics(), loadResource()]);
  }
  start().catch((error) => {
    if (document.querySelector('#private-shell').hidden) {
      document.querySelector('#session-status').textContent = error.status === 401 ? 'Tu sesión finalizó.' : 'No fue posible verificar la sesión. Intenta nuevamente.';
      document.querySelector('#retry-session').hidden = false;
    } else message(error.message);
  });
})();
