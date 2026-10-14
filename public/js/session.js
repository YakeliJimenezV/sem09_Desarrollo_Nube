const TechStoreSession = (() => {
  const key = 'techstore.accessToken';
  const challengeKey = 'techstore.pendingMfa';
  let expiryTimer;

  function token() { try { return sessionStorage.getItem(key); } catch { return null; } }
  function clear() { try { sessionStorage.removeItem(key); } catch {} clearTimeout(expiryTimer); }
  function expired() {
    try {
      const payload = JSON.parse(atob(token().split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now();
    } catch { return true; }
  }
  function redirect() { clear(); window.location.replace('/login?expired=1'); }

  function setToken(value) {
    try { sessionStorage.setItem(key, value); } catch { throw new Error('El navegador no permite guardar la sesión. Revisa su configuración y vuelve a intentarlo.'); }
  }

  function clearChallenge() { try { sessionStorage.removeItem(challengeKey); } catch {} }
  function pendingChallenge() {
    try {
      const value = JSON.parse(sessionStorage.getItem(challengeKey));
      return value && Date.parse(value.expiresAt) > Date.now() ? value : null;
    } catch { return null; }
  }
  function setChallenge(value) {
    clear();
    try { sessionStorage.setItem(challengeKey, JSON.stringify(value)); }
    catch { throw new Error('El navegador no permite guardar el intento de autenticación.'); }
  }

  async function challengeRequest(url, { body, image = false } = {}) {
    const pending = pendingChallenge();
    if (!pending) throw new Error('El intento de autenticación expiró. Inicia sesión nuevamente.');
    const headers = { Authorization: `MFA ${pending.challengeToken}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (image && response.ok) return response.blob();
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error?.message || 'No se pudo verificar tu identidad.');
      Object.assign(error, { status: response.status, code: data.error?.code, remainingAttempts: data.error?.remainingAttempts });
      throw error;
    }
    return data;
  }

  async function request(url, { method = 'GET', body, privateRequest = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (privateRequest) {
      if (!token() || expired()) { redirect(); throw new Error('La sesión expiró.'); }
      headers.Authorization = `Bearer ${token()}`;
    }
    const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) {
      if (privateRequest && response.status === 401) redirect();
      const error = new Error(data.error?.message || 'No se pudo completar la operación.');
      Object.assign(error, { status: response.status, fields: data.error?.fields });
      throw error;
    }
    return data;
  }

  function watchExpiry() {
    clearTimeout(expiryTimer);
    if (expired()) { redirect(); return; }
    const payload = JSON.parse(atob(token().split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    expiryTimer = setTimeout(watchExpiry, Math.min(payload.exp * 1000 - Date.now(), 2147483647));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && expired()) redirect(); });
  }

  async function logout() {
    try { await request('/api/auth/logout', { method: 'POST' }); } finally {
      clear();
      clearChallenge();
      window.location.replace('/login');
    }
  }

  return { token, clear, setToken, request, watchExpiry, logout, expired, setChallenge, pendingChallenge, clearChallenge, challengeRequest };
})();
