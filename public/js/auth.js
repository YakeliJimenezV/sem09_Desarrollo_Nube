(() => {
  'use strict';
  const form = document.querySelector('#auth-form');
  const registration = form.dataset.mode === 'register';
  const message = document.querySelector('#form-message');
  const submit = document.querySelector('#auth-submit');
  let loadingStores = registration;

  function showMessage(text, success = false) {
    message.textContent = text;
    message.classList.toggle('is-success', success);
    message.hidden = false;
  }

  function showFields(fields = {}) {
    for (const input of form.querySelectorAll('input, select')) {
      const error = document.querySelector(`#${input.name}-error`);
      input.setAttribute('aria-invalid', String(Boolean(fields[input.name])));
      if (error) error.textContent = fields[input.name] || '';
    }
  }

  function validate(data) {
    const fields = {};
    if (!data.email || data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) fields.email = 'Ingresa un email válido.';
    if (!data.password) fields.password = 'Ingresa tu contraseña.';
    if (registration) {
      if (!data.fullName || data.fullName.length < 2 || data.fullName.length > 120) fields.fullName = 'Ingresa tu nombre completo (2–120 caracteres).';
      if (data.password.length < 8 || !/[A-Z]/.test(data.password) || !/[0-9]/.test(data.password) || !/[^\p{L}\p{N}\s]/u.test(data.password)) fields.password = 'Usa al menos 8 caracteres, una mayúscula, un número y un carácter especial.';
      if (!data.confirmPassword || data.confirmPassword !== data.password) fields.confirmPassword = 'Las contraseñas deben coincidir.';
      if (!data.store) fields.store = 'Selecciona tu tienda asignada.';
    }
    if (new TextEncoder().encode(data.password).length > 72) fields.password = 'La contraseña no puede superar 72 bytes UTF-8.';
    return fields;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (loadingStores || submit.disabled) return;
    message.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    data.email = data.email.trim();
    if (registration) data.fullName = data.fullName.trim();
    const fields = validate(data);
    showFields(fields);
    if (Object.keys(fields).length) { form.elements[Object.keys(fields)[0]].focus(); return; }
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = registration ? 'Creando cuenta…' : 'Iniciando sesión…';
    try {
      const result = await TechStoreSession.request(`/api/auth/${registration ? 'register' : 'login'}`, { method: 'POST', body: data, privateRequest: false });
      form.reset();
      if (registration) window.location.assign('/login?registered=1');
      else { TechStoreSession.setChallenge(result); window.location.assign(result.type === 'setup' ? '/mfa/setup' : '/mfa'); }
    } catch (error) {
      showFields(error.fields);
      showMessage(error.name === 'TimeoutError' || error instanceof TypeError ? 'No fue posible conectar. Intenta nuevamente.' : error.message);
      if (error.fields) form.elements[Object.keys(error.fields)[0]]?.focus();
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });

  for (const button of document.querySelectorAll('[data-password-toggle]')) {
    button.addEventListener('click', () => {
      const input = document.querySelector(`#${button.dataset.passwordToggle}`);
      const showing = input.type === 'password';
      input.type = showing ? 'text' : 'password';
      button.textContent = showing ? 'Ocultar' : 'Mostrar';
      button.setAttribute('aria-pressed', String(showing));
    });
  }

  if (registration) {
    submit.disabled = true;
    TechStoreSession.request('/api/auth/stores', { privateRequest: false }).then(({ stores }) => {
      const select = form.elements.store;
      for (const store of stores) { const option = new Option(store.name, store._id); select.append(option); }
      if (!stores.length) showMessage('Todavía no hay tiendas disponibles. Contacta al administrador.');
      submit.disabled = !stores.length;
    }).catch(() => showMessage('No fue posible cargar las tiendas. Intenta nuevamente más tarde.')).finally(() => { loadingStores = false; });
  }
  const parameters = new URLSearchParams(window.location.search);
  const oauthMessages = {
    google: 'El inicio de sesión con Google requiere configuración.', github: 'El inicio de sesión con GitHub requiere configuración.',
    register: 'Primero registra tu cuenta TechStore con el mismo email verificado de Google/GitHub y una tienda asignada.',
    failed: 'No se pudo completar el inicio de sesión social. Intenta nuevamente.',
    'mfa-config': 'La autenticación en dos pasos requiere configuración del servidor. Contacta al administrador.',
  };
  for (const button of document.querySelectorAll('[data-oauth]')) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const config = await TechStoreSession.request('/api/auth/oauth/config', { privateRequest: false });
        if (!config[button.dataset.oauth]) { showMessage(oauthMessages[button.dataset.oauth]); return; }
        TechStoreSession.clearChallenge();
        window.location.assign(`/api/auth/oauth/${button.dataset.oauth}`);
      } catch { showMessage('No fue posible conectar con el servidor. Intenta nuevamente.'); }
      finally { button.disabled = false; }
    });
  }
  if (parameters.has('registered')) showMessage('Cuenta creada correctamente. Inicia sesión con tus datos.', true);
  else if (parameters.has('expired')) showMessage('Tu sesión finalizó. Inicia sesión nuevamente.');
  else if (parameters.has('mfa')) showMessage('El intento de autenticación finalizó. Inicia sesión nuevamente.');
  else if (parameters.has('oauth')) showMessage(oauthMessages[parameters.get('oauth')] || oauthMessages.failed);
  if (TechStoreSession.token() && !TechStoreSession.expired()) {
    TechStoreSession.request('/api/auth/me').then(() => window.location.replace('/dashboard')).catch(() => {});
  }
})();
