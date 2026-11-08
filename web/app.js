/* AUTH-NOW web interface. All trusted state and authenticity decisions come from the API. */
'use strict';

const API_STORAGE_KEY = 'auth-now-api-url';
const state = { products: [], lots: [], codes: [] };
const labels = { dashboard: 'Visão geral', products: 'Produtos', lots: 'Lotes', qrcodes: 'QR Codes', verify: 'Verificar produto', settings: 'Configurações' };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let toastTimer;

function apiBase() {
  return (localStorage.getItem(API_STORAGE_KEY) || '').trim().replace(/\/+$/, '');
}
function escapeText(value) { return String(value ?? ''); }
function showToast(message, isError = false) {
  const node = $('#toast'); node.textContent = message; node.classList.toggle('error', isError); node.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3500);
}
function setConnection() {
  const ready = Boolean(apiBase());
  $('#connection-label').textContent = ready ? 'API configurada' : 'Servidor não configurado';
  $('.connection').classList.toggle('online', ready);
}
function setBusy(form, busy, label) {
  const button = $('button[type="submit"]', form);
  if (!button) return;
  if (busy) { button.dataset.originalText = button.textContent; button.textContent = label || 'Aguarde…'; button.disabled = true; }
  else { button.textContent = button.dataset.originalText || 'Enviar'; button.disabled = false; }
}
async function request(path, options = {}) {
  const base = apiBase();
  if (!base) throw new Error('Configure a URL do servidor em Configurações antes de continuar.');
  let response;
  try {
    response = await fetch(`${base}${path}`, { ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  } catch (error) {
    throw new Error('Não foi possível conectar ao servidor. Verifique a URL e a conexão.');
  }
  let body = null;
  try { body = await response.json(); } catch (_) { /* A successful response must still have a valid JSON body where required. */ }
  if (!response.ok) throw new Error((body && typeof body.message === 'string' && body.message) || `O servidor respondeu com erro (${response.status}).`);
  return body;
}
function listFrom(data, key) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[key])) return data[key];
  return [];
}
function cell(value, className = '') {
  const td = document.createElement('td'); td.textContent = escapeText(value) || '—'; if (className) td.className = className; return td;
}
function emptyRow(body, columns, message) {
  body.replaceChildren(); const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = columns; td.className = 'empty-cell'; td.textContent = message; tr.append(td); body.append(tr);
}
function productTitle(product) { return product.name || product.title || product.productName || 'Produto'; }
function productId(product) { return product.id ?? product.productId ?? ''; }
function renderProducts() {
  const rows = state.products;
  $('#product-count').textContent = `${rows.length} ${rows.length === 1 ? 'item' : 'itens'}`;
  $('#stat-products').textContent = String(rows.length);
  const table = $('#products-table'); table.replaceChildren();
  if (!rows.length) emptyRow(table, 5, 'Nenhum produto cadastrado.');
  rows.forEach(product => {
    const tr = document.createElement('tr'); tr.append(cell(productTitle(product), 'product-name'), cell(product.category), cell(product.brand), cell(product.sku));
    const status = document.createElement('td'); const pill = document.createElement('span'); pill.className = 'status-pill'; pill.textContent = product.status || 'Cadastrado'; status.append(pill); tr.append(status); table.append(tr);
  });
  const recent = $('#recent-products'); recent.replaceChildren();
  if (!rows.length) emptyRow(recent, 4, 'Nenhum produto cadastrado.');
  rows.slice(0, 5).forEach(product => { const tr = document.createElement('tr'); tr.append(cell(productTitle(product), 'product-name'), cell(product.category), cell(product.lotCode || product.lot || '—')); const td = document.createElement('td'); const pill = document.createElement('span'); pill.className = 'status-pill'; pill.textContent = product.status || 'Cadastrado'; td.append(pill); tr.append(td); recent.append(tr); });
  const select = $('#lot-product-select'); select.replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = rows.length ? 'Selecione um produto' : 'Cadastre um produto primeiro'; select.append(placeholder);
  rows.forEach(product => { const option = document.createElement('option'); option.value = productId(product); option.textContent = productTitle(product); select.append(option); });
}
function lotTitle(lot) { return lot.code || lot.lotCode || lot.name || lot.id || 'Lote'; }
function renderLots() {
  const rows = state.lots; $('#lot-count').textContent = `${rows.length} ${rows.length === 1 ? 'item' : 'itens'}`; $('#stat-lots').textContent = String(rows.length);
  const table = $('#lots-table'); table.replaceChildren();
  if (!rows.length) emptyRow(table, 5, 'Nenhum lote cadastrado.');
  rows.forEach(lot => { const tr = document.createElement('tr'); const product = state.products.find(item => String(productId(item)) === String(lot.productId ?? lot.product_id)); tr.append(cell(lotTitle(lot), 'product-name'), cell(lot.productName || (product && productTitle(product))), cell(lot.quantity), cell(lot.manufacturedAt || lot.manufactured_at), cell(lot.expiresAt || lot.expires_at)); table.append(tr); });
  const select = $('#qrcode-lot-select'); select.replaceChildren(); const option = document.createElement('option'); option.value = ''; option.textContent = rows.length ? 'Selecione um lote' : 'Cadastre um lote primeiro'; select.append(option);
  rows.forEach(lot => { const item = document.createElement('option'); item.value = lot.id ?? lot.lotId ?? ''; item.textContent = lotTitle(lot); select.append(item); });
}
async function loadProducts() {
  const data = await request('/admin/products'); state.products = listFrom(data, 'products'); renderProducts();
  return state.products;
}
async function loadLots() {
  const data = await request('/admin/lots'); state.lots = listFrom(data, 'lots'); renderLots();
  return state.lots;
}
async function refreshData() {
  if (!apiBase()) { showToast('Configure o servidor em Configurações para carregar os dados.', true); return; }
  try { await Promise.all([loadProducts(), loadLots()]); showToast('Dados atualizados.'); }
  catch (error) { showToast(error.message, true); }
}
function navigate(view) {
  if (!labels[view]) return;
  $$('.view').forEach(section => section.classList.toggle('active', section.id === `view-${view}`));
  $$('.nav-link[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#breadcrumb-current').textContent = labels[view]; $('#sidebar').classList.remove('open'); window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'settings') $('#settings-form').elements.apiUrl.value = apiBase();
  if (view === 'products' && apiBase()) loadProducts().catch(error => showToast(error.message, true));
  if (view === 'lots' && apiBase()) Promise.all([loadProducts(), loadLots()]).catch(error => showToast(error.message, true));
  if (view === 'qrcodes' && apiBase()) loadLots().catch(error => showToast(error.message, true));
}
function formObject(form) { return Object.fromEntries(new FormData(form).entries()); }
function openForm(id) { $(`#${id}`).classList.remove('hidden'); $(`#${id}`).scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function closeForm(id) { $(`#${id}`).classList.add('hidden'); }

$$('.nav-link[data-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
$$('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go)));
$$('[data-close]').forEach(button => button.addEventListener('click', () => closeForm(button.dataset.close)));
$('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#open-product-form').addEventListener('click', () => openForm('product-form-card'));
$('#open-lot-form').addEventListener('click', async () => { if (apiBase()) try { await loadProducts(); } catch (error) { showToast(error.message, true); } openForm('lot-form-card'); });
$('#refresh-products').addEventListener('click', () => loadProducts().then(() => showToast('Produtos atualizados.')).catch(error => showToast(error.message, true)));
$('#refresh-lots').addEventListener('click', () => Promise.all([loadProducts(), loadLots()]).then(() => showToast('Lotes atualizados.')).catch(error => showToast(error.message, true)));

$('#settings-form').addEventListener('submit', event => {
  event.preventDefault(); const raw = event.currentTarget.elements.apiUrl.value.trim();
  if (raw && (!/^https:\/\//i.test(raw) || /\s/.test(raw))) { showToast('Informe uma URL HTTPS válida.', true); return; }
  if (raw) localStorage.setItem(API_STORAGE_KEY, raw.replace(/\/+$/, '')); else localStorage.removeItem(API_STORAGE_KEY);
  setConnection(); showToast(raw ? 'URL do servidor salva neste navegador.' : 'Conexão removida.');
  if (raw) refreshData();
});
$('#clear-api').addEventListener('click', () => { localStorage.removeItem(API_STORAGE_KEY); $('#settings-form').elements.apiUrl.value = ''; setConnection(); state.products = []; state.lots = []; renderProducts(); renderLots(); showToast('Conexão removida deste navegador.'); });

$('#product-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true, 'Salvando…');
  try {
    const data = await request('/admin/products', { method: 'POST', body: JSON.stringify(formObject(form)) });
    if (!data || !(data.id || data.product?.id || data.productId)) throw new Error('O servidor não confirmou o cadastro do produto.');
    form.reset(); closeForm('product-form-card'); await loadProducts(); showToast('Produto cadastrado pelo servidor.');
  } catch (error) { showToast(error.message, true); }
  finally { setBusy(form, false); }
});
$('#lot-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true, 'Salvando…');
  try {
    const data = await request('/admin/lots', { method: 'POST', body: JSON.stringify(formObject(form)) });
    if (!data || !(data.id || data.lot?.id || data.lotId)) throw new Error('O servidor não confirmou o cadastro do lote.');
    form.reset(); closeForm('lot-form-card'); await loadLots(); showToast('Lote cadastrado pelo servidor.');
  } catch (error) { showToast(error.message, true); }
  finally { setBusy(form, false); }
});

function renderCodes(codes) {
  const grid = $('#qrcode-grid'); grid.replaceChildren();
  codes.forEach((item, index) => {
    const value = typeof item === 'string' ? item : (item.token || item.code || item.value || item.url || '');
    if (!value) return;
    const card = document.createElement('article'); card.className = 'qr-item'; const qr = document.createElement('div'); qr.className = 'qr-canvas';
    if (typeof window.QRCode === 'function') new window.QRCode(qr, { text: value, width: 112, height: 112, correctLevel: window.QRCode.CorrectLevel?.M });
    else { const unavailable = document.createElement('span'); unavailable.textContent = 'Biblioteca de QR indisponível'; unavailable.className = 'qr-code-value'; qr.append(unavailable); }
    const code = document.createElement('div'); code.className = 'qr-code-value'; code.textContent = value;
    const number = document.createElement('small'); number.textContent = `Código ${index + 1}`; card.append(qr, code, number); grid.append(card);
  });
  $('#qrcode-result').classList.toggle('hidden', grid.children.length === 0);
}
$('#qrcode-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; const values = formObject(form); const lotId = encodeURIComponent(values.lotId); setBusy(form, true, 'Solicitando…');
  try {
    const data = await request(`/admin/lots/${lotId}/qrcodes`, { method: 'POST', body: JSON.stringify({ quantity: Number(values.quantity) }) });
    const codes = listFrom(data, 'codes');
    if (!codes.length) throw new Error('O servidor não retornou QR Codes. Nenhum código foi criado localmente.');
    state.codes = codes; $('#stat-codes').textContent = String(codes.length); renderCodes(codes); showToast(`${codes.length} QR Code(s) recebidos do servidor.`);
  } catch (error) { showToast(error.message, true); }
  finally { setBusy(form, false); }
});
$('#print-qrcodes').addEventListener('click', () => window.print());

$('#verify-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget; const token = form.elements.token.value.trim(); const result = $('#verify-result');
  result.className = 'verify-result error'; result.textContent = 'Consultando servidor…'; result.classList.remove('hidden');
  setBusy(form, true, 'Verificando…');
  try {
    const data = await request('/auth/verify', { method: 'POST', body: JSON.stringify({ token }) });
    result.replaceChildren();
    /* Critical safety invariant: never display “PRODUTO ORIGINAL” unless HTTP succeeded and JSON explicitly says ok === true. */
    if (data && data.ok === true) {
      result.className = 'verify-result valid'; const heading = document.createElement('strong'); heading.textContent = 'PRODUTO ORIGINAL';
      const message = document.createElement('span'); message.textContent = typeof data.message === 'string' ? data.message : 'Autenticidade confirmada pelo servidor.'; result.append(heading, message);
    } else {
      result.className = 'verify-result invalid'; const heading = document.createElement('strong'); heading.textContent = 'NÃO FOI POSSÍVEL CONFIRMAR';
      const message = document.createElement('span'); message.textContent = data && typeof data.message === 'string' ? data.message : 'O servidor não confirmou a autenticidade deste produto.'; result.append(heading, message);
    }
    $('#stat-checks').textContent = '✓';
  } catch (error) {
    result.className = 'verify-result error'; result.textContent = `Verificação indisponível. ${error.message}`;
  } finally { result.classList.remove('hidden'); setBusy(form, false); }
});

setConnection();
renderProducts();
renderLots();
if (apiBase()) refreshData();
