/* Admin-token bridge: prompts on first protected request and retains the token in memory only. */
(() => {
  let adminToken = '';
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!/\/admin\//.test(url)) return originalFetch(input, init);
    const headersFor = token => {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    };
    let response = await originalFetch(input, { ...init, headers: headersFor(adminToken) });
    if (response.status === 401) {
      const entered = window.prompt('Autenticação administrativa. Informe AUTHNOW_ADMIN_TOKEN. O token ficará apenas nesta aba:');
      if (!entered) return response;
      adminToken = entered.trim();
      response = await originalFetch(input, { ...init, headers: headersFor(adminToken) });
      if (response.status === 401) {
        adminToken = '';
        window.alert('Token administrativo inválido.');
      }
    }
    return response;
  };
})();
