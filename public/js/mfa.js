(() => {
  'use strict';
  const session = TechStoreSession;
  const form = document.querySelector('#mfa-form');
  const button = document.querySelector('#mfa-submit');
  const message = document.querySelector('#mfa-message');
  const input = document.querySelector('#mfa-code');
  let qrUrl;
  let expiryTimer;

  function showMessage(text, success = false) {
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('is-success', success);
  }

  function ended(text) {
    session.clearChallenge();
    clearTimeout(expiryTimer);
    button.disabled = true;
    input.disabled = true;
    document.querySelector('#mfa-setup').hidden = true;
    if (qrUrl) URL.revokeObjectURL(qrUrl);
    showMessage(text);
    document.querySelector('#mfa-back').textContent = 'Iniciar sesión nuevamente';
    setTimeout(() => window.location.replace('/login?mfa=1'), 3000);
  }

  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
  document.querySelector('#mfa-back').addEventListener('click', () => session.clearChallenge());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled || !/^\d{6}$/.test(input.value)) return;
    button.disabled = true;
    try {
      const result = await session.challengeRequest('/api/auth/mfa/verify', { body: { code: input.value } });
      clearTimeout(expiryTimer);
      session.clearChallenge();
      session.setToken(result.token);
      if (qrUrl) URL.revokeObjectURL(qrUrl);
      showMessage(result.message, true);
      window.location.replace('/dashboard?mfa=success');
    } catch (error) {
      input.value = '';
      if (error.status === 401 || !session.pendingChallenge()) { ended(error.message); return; }
      showMessage(error.name === 'TimeoutError' || error instanceof TypeError ? 'No fue posible conectar. Intenta nuevamente.' : error.message);
      if (Number.isInteger(error.remainingAttempts)) document.querySelector('#mfa-attempts').textContent = `Te ${error.remainingAttempts === 1 ? 'queda 1 intento' : `quedan ${error.remainingAttempts} intentos`}.`;
      button.disabled = false;
      input.focus();
    }
  });

  async function start() {
    session.clear();
    if (!session.pendingChallenge()) {
      const handoff = await session.request('/api/auth/oauth/handoff', { privateRequest: false });
      session.setChallenge(handoff);
    }
    const data = await session.challengeRequest('/api/auth/mfa/challenge');
    const setup = data.type === 'setup';
    const expectedPath = setup ? '/mfa/setup' : '/mfa';
    if (window.location.pathname !== expectedPath) { window.location.replace(expectedPath); return; }
    document.querySelector('#mfa-title').textContent = setup ? 'Protege tu cuenta' : 'Verificación en dos pasos';
    document.querySelector('#mfa-description').textContent = setup ? 'Vincula tu aplicación de autenticación antes de entrar a TechStore.' : 'Abre tu aplicación de autenticación e ingresa el código actual.';
    document.querySelector('#mfa-content').hidden = false;
    document.querySelector('#mfa-setup').hidden = !setup;
    button.textContent = setup ? 'Activar MFA' : 'Verificar código';
    document.querySelector('#mfa-attempts').textContent = `Te ${data.remainingAttempts === 1 ? 'queda 1 intento' : `quedan ${data.remainingAttempts} intentos`}.`;
    document.querySelector('#mfa-expiry').textContent = 'Este intento es válido durante 5 minutos.';
    expiryTimer = setTimeout(() => ended('El intento de autenticación expiró. Inicia sesión nuevamente.'), Math.max(0, Date.parse(data.expiresAt) - Date.now()));
    if (setup) {
      const blob = await session.challengeRequest('/api/auth/mfa/qr', { image: true });
      qrUrl = URL.createObjectURL(blob);
      const image = document.querySelector('#mfa-qr');
      image.src = qrUrl;
      image.hidden = false;
      document.querySelector('#qr-loading').hidden = true;
    }
    input.focus();
  }
  window.addEventListener('pagehide', () => { if (qrUrl) URL.revokeObjectURL(qrUrl); clearTimeout(expiryTimer); });
  window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
  start().catch((error) => ended(error.status === 401 ? 'El intento de autenticación expiró. Inicia sesión nuevamente.' : 'No fue posible preparar MFA. Vuelve a iniciar sesión.'));
})();
