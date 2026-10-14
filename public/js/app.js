(() => {
  'use strict';

  const { products, stores } = TechStoreDemo;
  const pageSize = 5;
  const lowStockThreshold = 10;
  const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
  const numbers = new Intl.NumberFormat('es-PE');
  const state = { page: 1 };
  const tableBody = document.querySelector('#product-table-body');
  const searchInput = document.querySelector('#product-search');
  const storeFilter = document.querySelector('#store-filter');
  const stockFilter = document.querySelector('#stock-filter');
  const previousPage = document.querySelector('#previous-page');
  const nextPage = document.querySelector('#next-page');
  const sidebar = document.querySelector('#sidebar');
  const sidebarOverlay = document.querySelector('#sidebar-overlay');
  const menuToggle = document.querySelector('#menu-toggle');
  const moduleDialog = document.querySelector('#module-dialog');
  let activeDialog = null;
  let dialogOrigin = null;

  const modules = {
    products: {
      title: 'Gestión de productos',
      description: 'Este catálogo muestra datos de ejemplo. Inicia sesión para consultar tu inventario y actualizar stock según tus permisos.',
      items: ['Crear y editar productos por tienda', 'Registrar movimientos de stock', 'Consultar el inventario guardado en MongoDB'],
    },
    reports: {
      title: 'Reportes que cuentan la historia',
      description: 'Los reportes del inventario están disponibles en el dashboard para administradores, gerentes y auditores.',
      items: ['Resumen de existencias y valor del inventario', 'Filtros por tienda', 'Reportes según los permisos de cada rol'],
    },
    users: {
      title: 'Cada persona, el acceso correcto',
      description: 'La consulta de usuarios y roles está disponible en el dashboard. Los administradores pueden asignar roles y tiendas.',
      items: ['ADMIN · Administración del sistema', 'GERENTE · Gestión de tienda', 'EMPLEADO · Operación de inventario', 'AUDITOR · Consulta y revisión'],
    },
    account: {
      title: 'Tu espacio dentro de TechStore',
      description: 'Inicia sesión para consultar tu información personal. La edición del perfil se incorporará posteriormente.',
      items: ['Información personal y tienda asignada', 'Estado de autenticación en dos pasos', 'Sesiones protegidas con JWT y revocación'],
    },
    auth: {
      title: 'Acceso a TechStore',
      description: 'Inicia sesión para acceder a tu inventario real. Esta portada conserva un catálogo ilustrativo.',
      items: ['Login y registro con contraseña', 'JWT, permisos por rol y MFA con autenticador', 'Google y GitHub disponibles al configurar los proveedores'],
    },
    roadmap: {
      title: 'TechStore, paso a paso',
      description: 'Un proyecto académico para conectar el inventario de una cadena de tiendas de tecnología.',
      items: ['Identidad visual y arquitectura TechStore', 'Login, registro, JWT, roles y bloqueo', 'Inventario visual, tiendas y reportes reales', 'MFA TOTP y acceso con Google / GitHub configurable'],
    },
  };

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `/img/icons.svg#${name}`);
    svg.append(use);
    return svg;
  }

  function normalize(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function filteredProducts() {
    const query = normalize(searchInput.value.trim());
    return products.filter((product) => {
      const matchesQuery = normalize(`${product.name} ${product.sku} ${product.category}`).includes(query);
      const matchesStore = storeFilter.value === 'all' || product.store === storeFilter.value;
      const lowStock = product.stock <= lowStockThreshold;
      const matchesStock = stockFilter.value === 'all'
        || (stockFilter.value === 'low' && lowStock)
        || (stockFilter.value === 'available' && !lowStock);
      return matchesQuery && matchesStore && matchesStock;
    });
  }

  function productRow(product) {
    const row = element('tr');
    const firstCell = element('td');
    const productCell = element('div', 'product-cell');
    const productIcon = element('span', 'product-icon');
    productIcon.append(icon(product.icon));
    const productInfo = element('div');
    productInfo.append(element('div', 'product-name', product.name), element('div', 'product-category', product.category));
    productCell.append(productIcon, productInfo);
    firstCell.append(productCell);

    const stockCell = element('td', 'numeric');
    const lowStock = product.stock <= lowStockThreshold;
    stockCell.append(element('span', `stock-count${lowStock ? ' is-low' : ''}`, numbers.format(product.stock)), element('span', 'stock-unit', 'ud.'));
    const statusCell = element('td');
    statusCell.append(element('span', lowStock ? 'badge badge-cyan' : 'badge badge-blue', lowStock ? 'Stock bajo' : 'Disponible'));

    row.append(firstCell, element('td', 'sku', product.sku), element('td', '', stores.find((store) => store.id === product.store).name.replace('TechStore ', '')), element('td', 'numeric', currency.format(product.price)), stockCell, statusCell);
    return row;
  }

  function renderProducts() {
    const filtered = filteredProducts();
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.page = Math.min(state.page, pageCount);
    const offset = (state.page - 1) * pageSize;
    const pageProducts = filtered.slice(offset, offset + pageSize);
    tableBody.replaceChildren(...pageProducts.map(productRow));

    if (!pageProducts.length) {
      const row = element('tr');
      const cell = element('td', 'empty-table', 'No encontramos productos. Prueba otra búsqueda o limpia los filtros.');
      cell.colSpan = 6;
      row.append(cell);
      tableBody.append(row);
    }

    document.querySelector('#table-summary').textContent = filtered.length
      ? `Mostrando ${offset + 1}–${offset + pageProducts.length} de ${filtered.length} productos de ejemplo`
      : '0 productos coinciden con los filtros';
    document.querySelector('#page-number').textContent = state.page;
    document.querySelector('#page-number').setAttribute('aria-label', `Página ${state.page} de ${pageCount}`);
    previousPage.disabled = state.page <= 1;
    nextPage.disabled = state.page >= pageCount;
  }

  function renderStores() {
    const container = document.querySelector('#store-cards');
    for (const store of stores) {
      const option = element('option', '', store.name.replace('TechStore ', ''));
      option.value = store.id;
      storeFilter.append(option);

      const storeProducts = products.filter((product) => product.store === store.id);
      const stock = storeProducts.reduce((total, product) => total + product.stock, 0);
      const card = element('button', 'store-card');
      card.type = 'button';
      card.setAttribute('aria-label', `Ver productos de ${store.name}`);
      const top = element('span', 'store-card-top');
      const tile = element('span', 'icon-tile');
      tile.append(icon('store'));
      top.append(tile, icon('chevron'));
      const location = element('span', 'store-address');
      location.append(icon('pin'), document.createTextNode(store.location));
      const metrics = element('span', 'store-metrics');
      const references = element('span');
      references.append(element('strong', '', storeProducts.length), document.createTextNode('productos'));
      const units = element('span');
      units.append(element('strong', '', numbers.format(stock)), document.createTextNode('unidades'));
      metrics.append(references, units);
      card.append(top, element('span', 'store-name', store.name), location, metrics);
      card.addEventListener('click', () => {
        storeFilter.value = store.id;
        searchInput.value = '';
        stockFilter.value = 'all';
        state.page = 1;
        renderProducts();
        setActiveNavigation('#inventario');
        document.querySelector('#inventario').scrollIntoView({ block: 'start' });
        searchInput.focus({ preventScroll: true });
      });
      container.append(card);
    }
  }

  function updateScrollLock() {
    document.body.classList.toggle('no-scroll', sidebar.classList.contains('is-open') || moduleDialog.open);
  }

  function setSidebar(open, restoreFocus = true) {
    sidebar.classList.toggle('is-open', open);
    sidebarOverlay.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
    document.querySelector('#main-content').inert = open;
    document.querySelector('#topbar').inert = open;
    if (open) {
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
      document.querySelector('#sidebar-close').focus();
    } else {
      sidebar.removeAttribute('role');
      sidebar.removeAttribute('aria-modal');
      if (restoreFocus) menuToggle.focus();
    }
    updateScrollLock();
  }

  function setActiveNavigation(href) {
    for (const link of document.querySelectorAll('.nav-item[href]')) {
      const active = link.getAttribute('href') === href;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  function updateDialog({ title, description, items, label = 'PRÓXIMAS ETAPAS' }) {
    document.querySelector('#dialog-label').textContent = label;
    document.querySelector('#dialog-title').textContent = title;
    document.querySelector('#dialog-description').textContent = description;
    document.querySelector('#dialog-list').replaceChildren(...items.map((item) => element('li', '', item)));
  }

  function openDialog(key, content, origin) {
    activeDialog = key;
    dialogOrigin = origin;
    if (sidebar.classList.contains('is-open')) setSidebar(false, false);
    updateDialog(content);
    if (!moduleDialog.open) moduleDialog.showModal();
    updateScrollLock();
  }

  for (const button of document.querySelectorAll('[data-module]')) {
    button.addEventListener('click', () => openDialog(button.dataset.module, modules[button.dataset.module], button));
  }
  document.querySelector('#dialog-close').addEventListener('click', () => moduleDialog.close());
  document.querySelector('#dialog-confirm').addEventListener('click', () => moduleDialog.close());
  moduleDialog.addEventListener('close', () => {
    activeDialog = null;
    updateScrollLock();
    if (window.innerWidth < 1024 && dialogOrigin?.closest('.sidebar')) menuToggle.focus();
  });

  document.querySelector('#system-button').addEventListener('click', async (event) => {
    const origin = event.currentTarget;
    openDialog('system', { title: 'Estado del sistema', label: 'TECHSTORE', description: 'Consultando la disponibilidad del servicio…', items: [] }, origin);
    origin.disabled = true;
    let result;
    try {
      const response = await fetch('/api/health', { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      if (!response.ok) throw new Error('Servicio no disponible');
      const health = await response.json();
      const connected = health.database === 'connected';
      result = {
        title: 'Estado del sistema', label: 'TECHSTORE',
        description: connected ? 'El servidor y la conexión con MongoDB están disponibles.' : 'El servidor está disponible. MongoDB no está conectado en esta vista.',
        items: ['Servidor Express · Disponible', `MongoDB · ${connected ? 'Conectado' : 'Sin conexión'}`, 'Catálogo de esta página · Datos demostrativos locales'],
      };
    } catch {
      result = { title: 'Estado del sistema', label: 'TECHSTORE', description: 'No fue posible consultar el servidor. Comprueba la conexión y vuelve a intentarlo.', items: ['La vista demostrativa continúa disponible en el navegador.'] };
    } finally {
      origin.disabled = false;
    }
    if (activeDialog === 'system' && moduleDialog.open) updateDialog(result);
  });

  menuToggle.addEventListener('click', () => setSidebar(true));
  document.querySelector('#sidebar-close').addEventListener('click', () => setSidebar(false));
  sidebarOverlay.addEventListener('click', () => setSidebar(false));
  document.addEventListener('keydown', (event) => {
    if (!sidebar.classList.contains('is-open')) return;
    if (event.key === 'Escape') setSidebar(false);
    if (event.key === 'Tab') {
      const focusable = Array.from(sidebar.querySelectorAll('a[href], button:not(:disabled)')).filter((node) => node.getClientRects().length);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024 && sidebar.classList.contains('is-open')) setSidebar(false, false);
  });

  for (const link of document.querySelectorAll('a[href^="#"]')) {
    link.addEventListener('click', () => {
      const href = link.getAttribute('href');
      if (sidebar.classList.contains('is-open')) setSidebar(false, false);
      if (['#inicio', '#inventario', '#tiendas'].includes(href)) setActiveNavigation(href);
      document.querySelector(href)?.focus({ preventScroll: true });
    });
  }
  for (const control of [searchInput, storeFilter, stockFilter]) {
    control.addEventListener(control === searchInput ? 'input' : 'change', () => {
      state.page = 1;
      renderProducts();
    });
  }
  document.querySelector('#reset-filters').addEventListener('click', () => {
    searchInput.value = '';
    storeFilter.value = 'all';
    stockFilter.value = 'all';
    state.page = 1;
    renderProducts();
    searchInput.focus();
  });
  previousPage.addEventListener('click', () => { state.page -= 1; renderProducts(); });
  nextPage.addEventListener('click', () => { state.page += 1; renderProducts(); });

  const today = new Date();
  const date = document.querySelector('#current-date');
  date.dateTime = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  date.textContent = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }).format(today);
  document.querySelector('#stat-products').textContent = numbers.format(products.length);
  document.querySelector('#stat-stock').textContent = numbers.format(products.reduce((total, product) => total + product.stock, 0));
  document.querySelector('#stat-stores').textContent = numbers.format(stores.length);
  document.querySelector('#stat-low-stock').textContent = numbers.format(products.filter((product) => product.stock <= lowStockThreshold).length);
  renderStores();
  renderProducts();
})();
