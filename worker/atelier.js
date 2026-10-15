/**
 * ATELIER — módulo de loja com personalização de azulejo (VeroVaz / Alquimia)
 * Plugável no Worker do V8 Admin Universal. Bindings necessários:
 *   DB (D1) · ATELIER_R2 (R2, privado)
 * Secrets: MP_ACCESS_TOKEN (Mercado Pago) · MELHOR_ENVIO_TOKEN (opcional)
 *          MP_WEBHOOK_SECRET (opcional, valida assinatura) · ATELIER_ADMIN_TOKEN (fallback do admin)
 * Vars:    ATELIER_ALLOWED_ORIGINS (ex.: "https://alquimiaatelie.com.br,https://x.pages.dev")
 *          MELHOR_ENVIO_UA (ex.: "V8 Digital (contato@seudominio.com)")
 *
 * Uso no Worker:
 *   import { handleAtelier, cleanupAtelier } from './atelier.js';
 *   const r = await handleAtelier(request, env, { isAdmin: req => suaValidacaoDeAdmin(req, env) });
 *   if (r) return r;           // dentro do fetch(), antes das suas rotas
 *   // scheduled(): ctx.waitUntil(cleanupAtelier(env));
 */

const SIZES = new Set(['10x20', '15x20', '20x30']);
const ORIENTATIONS = new Set(['portrait', 'landscape']);
const DEFAULT_SETTINGS = { productionDays: 7, draftRetentionDays: 7, maxUploadBytes: 15728640, originPostalCode: '', flatShipping: [] };
const DAY = 86400000;

// ───────────── utilidades ─────────────
class HttpError extends Error { constructor(status, detail) { super(detail); this.status = status; this.detail = detail; } }
const now = () => Date.now();
const uuid = () => crypto.randomUUID();
const digits = v => String(v ?? '').replace(/\D/g, '');
const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');

function corsHeaders(request, env) {
  const allowed = (env.ATELIER_ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const allow = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0] || '');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type, X-Tenant-Id, X-Atelier-Session, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

function tenantOf(request, url) {
  const t = (request.headers.get('X-Tenant-Id') || url.searchParams.get('tenant') || '1b356c5c-c50d-4c4e-a16b-f3f3bafd2e45').toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(t)) throw new HttpError(400, 'Tenant inválido.');
  return t;
}

async function getSettings(env, tenant) {
  const row = await env.V8_D1.prepare('SELECT data FROM atelier_settings WHERE tenant=?').bind(tenant).first();
  return { ...DEFAULT_SETTINGS, ...(row ? parse(row.data, {}) : {}) };
}

// ───────────── produtos ─────────────
// O catálogo é a fonte única de produtos: usa a tabela `products` do V8 Admin.
function productRow(r) {
  const name = String(r.name || '');
  const match = name.match(/(10|15|20)\\s*[x×]\\s*(20|30)/i);
  const sizeId = match ? `${match[1]}x${match[2]}` : null;
  const price = r.price === null || r.price === undefined || r.price === '' ? null : Number(r.price);
  const meta = {};
  return {
    id: r.id, tenant: r.project_id, name, description: r.description || '',
    price_cents: price === null || !Number.isFinite(price) ? null : Math.round(price * 100),
    stock: Number(r.track_stock) ? Number(r.stock || 0) : 999999,
    category_name: r.category_id || '', image_url: r.image || '',
    active: r.status === 'active' ? 1 : 0,
    kind: sizeId ? 'tile' : 'decoration', size_id: sizeId, meta,
    weight_g: Math.round(Number(r.weight || 0) * 1000) || 500,
    width_cm: 20, height_cm: 5, length_cm: 25, sort: Number(r.product_order || 0),
    variations: parse(r.variations_json, [])
  };
}
async function listProducts(env, tenant, { onlyActive = true } = {}) {
  const result = await env.V8_D1.prepare(
    `SELECT * FROM products WHERE project_id=? ${onlyActive ? "AND status='active'" : ''} ORDER BY product_order, name`
  ).bind(tenant).all();
  return (result.results || []).map(productRow);
}
async function productsByIds(env, tenant, ids) {
  const all = await listProducts(env, tenant, { onlyActive: false });
  return new Map(all.filter(p => ids.includes(p.id)).map(p => [p.id, p]));
}
const reais = c => (c === null || c === undefined ? null : c / 100);

function publicProduct(p) {
  return { id: p.id, name: p.name, description: p.description, price: reais(p.price_cents), stock: p.stock, categoryName: p.category_name, imageUrl: p.image_url, active: !!p.active };
}

async function publicConfig(env, tenant) {
  const [s, products] = await Promise.all([getSettings(env, tenant), listProducts(env, tenant)]);
  const tileVariants = [], details = {};
  for (const p of products) {
    const m = p.meta;
    const productionDays = Number.isInteger(m.productionDays) ? m.productionDays : s.productionDays;
    if (p.kind === 'tile' && SIZES.has(p.size_id)) {
      const [w, h] = p.size_id.split('x').map(Number);
      const minimumDpi = m.minimumDpi ?? 150;
      tileVariants.push({ productId: p.id, sizeId: p.size_id, price: reais(p.price_cents), active: !!p.active && p.stock > 0, minimumDpi, productionDays, print: { widthCm: w, heightCm: h, minimumDpi, shape: 'rect' } });
      continue;
    }
    details[p.id] = { kind: p.kind === 'fixed' ? 'fixed' : 'decoration', productionDays, gallery: m.gallery || [], dimensions: m.dimensions, material: m.material, finish: m.finish, color: m.color, care: m.care };
    if (p.kind === 'fixed' && m.print) details[p.id].print = { widthCm: m.print.widthCm, heightCm: m.print.heightCm, minimumDpi: m.print.minimumDpi ?? 150, shape: m.print.shape || 'rect', safeMarginMm: m.print.safeMarginMm };
  }
  return {
    tileVariants, products: details,
    privateDraftsAvailable: !!env.ATELIER_R2,
    personalizationCheckoutAvailable: !!(env.ATELIER_R2 && env.MP_ACCESS_TOKEN),
    draftRetentionDays: s.draftRetentionDays, maxUploadBytes: s.maxUploadBytes, personalizationSchemaVersion: 2,
    homeImages: s.homeImages || {}, contact: s.contact, instagramUrl: s.instagramUrl, whatsAppUrl: s.whatsAppUrl,
    editorialPages: s.editorialPages || {}
  };
}

// ───────────── frete ─────────────
function fingerprint(items) {
  return items.map(i => `${i.productId}x${i.quantity}`).sort().join('|');
}
function validQty(q) { return Number.isSafeInteger(q) && q >= 1 && q <= 99; }

async function quoteShipping(env, tenant, body) {
  const cep = digits(body?.postalCode);
  if (cep.length !== 8) throw new HttpError(422, 'CEP inválido.');
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length || items.length > 50 || items.some(i => !i.productId || !validQty(i.quantity))) throw new HttpError(422, 'Itens inválidos.');
  const products = await productsByIds(env, tenant, [...new Set(items.map(i => i.productId))]);
  let subtotalCents = 0, productionDays = 0;
  const s = await getSettings(env, tenant);
  const meProducts = [];
  for (const it of items) {
    const p = products.get(it.productId);
    if (!p || !p.active) throw new HttpError(422, 'Produto indisponível.');
    if (p.price_cents === null) throw new HttpError(422, 'Este produto ainda não tem preço cadastrado.');
    subtotalCents += p.price_cents * it.quantity;
    productionDays = Math.max(productionDays, Number.isInteger(p.meta.productionDays) ? p.meta.productionDays : s.productionDays);
    meProducts.push({ id: p.id, width: p.width_cm || 20, height: p.height_cm || 5, length: p.length_cm || 25, weight: (p.weight_g || 500) / 1000, insurance_value: p.price_cents / 100, quantity: it.quantity });
  }
  let options = [];
  if (env.MELHOR_ENVIO_TOKEN && digits(s.originPostalCode).length === 8) {
    const res = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.MELHOR_ENVIO_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': env.MELHOR_ENVIO_UA || 'V8 Admin Universal' },
      body: JSON.stringify({ from: { postal_code: digits(s.originPostalCode) }, to: { postal_code: cep }, products: meProducts })
    });
    if (res.ok) {
      const data = await res.json();
      options = (Array.isArray(data) ? data : []).filter(o => !o.error && (o.custom_price ?? o.price)).map(o => ({
        serviceCode: String(o.id), carrier: o.company?.name || 'Transportadora', name: o.name,
        amountCents: Math.round(Number(o.custom_price ?? o.price) * 100),
        minTransitDays: o.delivery_range?.min ?? o.delivery_time ?? 0, maxTransitDays: o.delivery_range?.max ?? o.delivery_time ?? 0
      })).sort((a, b) => a.amountCents - b.amountCents);
    }
  }
  if (!options.length && Array.isArray(s.flatShipping)) options = s.flatShipping.filter(o => Number.isSafeInteger(o.amountCents) && o.amountCents >= 0);
  if (!options.length) throw new HttpError(422, 'Entrega ainda não configurada para este CEP.');
  const id = uuid();
  await env.V8_D1.prepare('INSERT INTO atelier_quotes (id,tenant,postal_code,fingerprint,options,production_days,expires_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id, tenant, cep, fingerprint(items), JSON.stringify(options), productionDays, now() + 15 * 60000).run();
  return { id, productionDays, options };
}

// ───────────── sessão privada / carrinho / artes ─────────────
async function requireSession(request, env, tenant) {
  const token = request.headers.get('X-Atelier-Session');
  if (!token) throw new HttpError(401, 'Sessão privada ausente.');
  const row = await env.V8_D1.prepare('SELECT * FROM atelier_sessions WHERE token_hash=? AND tenant=?').bind(await sha256(token), tenant).first();
  if (!row || row.expires_at < now()) throw new HttpError(401, 'Sessão expirada. Comece novamente.');
  return row;
}

function sniffImage(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ['image/jpeg', 'jpg'];
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return ['image/png', 'png'];
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return ['image/webp', 'webp'];
  return null;
}

async function uploadArtwork(request, env, tenant, session) {
  if (!env.ATELIER_R2) throw new HttpError(503, 'Armazenamento privado indisponível.');
  const s = await getSettings(env, tenant);
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > s.maxUploadBytes + 65536) throw new HttpError(413, 'Imagem maior que o limite permitido.');
  const form = await request.formData();
  const file = form.get('file');
  if (form.get('rightsConsent') !== 'true') throw new HttpError(422, 'Confirme que você tem autorização para usar esta imagem.');
  if (!file || typeof file === 'string' || !file.size) throw new HttpError(422, 'Arquivo ausente.');
  if (file.size > s.maxUploadBytes) throw new HttpError(413, 'Imagem maior que o limite permitido.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) throw new HttpError(415, 'Use JPG, PNG ou WebP.');
  const count = await env.V8_D1.prepare('SELECT COUNT(*) n FROM atelier_artworks WHERE session_id=?').bind(session.id).first();
  if (count.n >= 40) throw new HttpError(429, 'Limite de arquivos desta sessão atingido.');
  const id = uuid(), key = `${tenant}/${session.id}/${id}.${kind[1]}`;
  await env.ATELIER_R2.put(key, bytes, { httpMetadata: { contentType: kind[0] } });
  await env.V8_D1.batch([
    env.V8_D1.prepare('INSERT INTO atelier_artworks (id,tenant,session_id,r2_key,content_type,size,created_at) VALUES (?,?,?,?,?,?,?)').bind(id, tenant, session.id, key, kind[0], bytes.length, now()),
    env.V8_D1.prepare('UPDATE atelier_sessions SET revision=revision+1 WHERE id=?').bind(session.id)  // o front espera +1 por upload
  ]);
  return { id, contentType: kind[0], size: bytes.length };
}

async function saveCart(env, tenant, session, body) {
  if (body?.revision !== session.revision) throw new HttpError(409, 'O carrinho mudou em outra aba. Recarregue a página.');
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 50) throw new HttpError(422, 'Carrinho grande demais.');
  const products = await productsByIds(env, tenant, [...new Set(items.map(i => i.productId))]);
  const arts = (await env.V8_D1.prepare('SELECT id FROM atelier_artworks WHERE session_id=?').bind(session.id).all()).results.map(r => r.id);
  const artSet = new Set(arts);
  const clean = items.map(i => {
    const p = products.get(i.productId);
    if (!p || !p.active) throw new HttpError(422, 'Há um produto indisponível no carrinho.');
    if (!i.id || String(i.id).length > 64 || !validQty(i.quantity)) throw new HttpError(422, 'Item inválido.');
    let art = null;
    if (i.art) {
      const a = i.art;
      if (!artSet.has(a.originalId) || !artSet.has(a.previewId)) throw new HttpError(422, 'Arquivo da arte não encontrado. Reenvie a imagem.');
      if (!ORIENTATIONS.has(a.orientation)) throw new HttpError(422, 'Orientação inválida.');
      if (![0, 90, 180, 270].includes(a.rotation ?? 0)) throw new HttpError(422, 'Rotação inválida.');
      if (!(a.zoom >= 1 && a.zoom <= 3) || !(a.x >= 0 && a.x <= 100) || !(a.y >= 0 && a.y <= 100)) throw new HttpError(422, 'Enquadramento inválido.');
      if (a.approved !== true) throw new HttpError(422, 'Aprove o enquadramento antes de salvar.');
      if (p.kind === 'tile' && a.sizeId !== p.size_id) throw new HttpError(422, 'Tamanho não confere com o produto.');
      art = { originalId: a.originalId, previewId: a.previewId, sizeId: p.kind === 'tile' ? p.size_id : null, orientation: a.orientation, zoom: a.zoom, x: a.x, y: a.y, rotation: a.rotation ?? 0, approved: true };
    } else if (p.kind === 'tile' || p.kind === 'fixed') {
      throw new HttpError(422, 'Este produto exige uma imagem personalizada.');
    }
    return { id: String(i.id), productId: p.id, quantity: i.quantity, art };
  });
  const revision = session.revision + 1;
  const res = await env.V8_D1.prepare('UPDATE atelier_sessions SET items=?, revision=? WHERE id=? AND revision=?').bind(JSON.stringify(clean), revision, session.id, session.revision).run();
  if (!res.meta.changes) throw new HttpError(409, 'O carrinho mudou em outra aba. Recarregue a página.');
  return { revision, items: clean };
}

// ───────────── checkout / Mercado Pago ─────────────
function validateAddress(a) {
  const e = (m) => { throw new HttpError(422, m); };
  if (!a || typeof a !== 'object') e('Endereço ausente.');
  const out = {};
  for (const k of ['name', 'email', 'phone', 'document', 'street', 'number', 'district', 'city', 'state', 'postalCode']) out[k] = String(a[k] ?? '').trim().slice(0, 150);
  out.complement = String(a.complement ?? '').trim().slice(0, 150);
  if (out.name.length < 3) e('Informe o nome completo.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) e('E-mail inválido.');
  out.phone = digits(out.phone); if (out.phone.length < 10 || out.phone.length > 11) e('Celular inválido (DDD + número).');
  out.document = digits(out.document); if (![11, 14].includes(out.document.length)) e('CPF ou CNPJ inválido.');
  out.postalCode = digits(out.postalCode); if (out.postalCode.length !== 8) e('CEP inválido.');
  out.state = out.state.toUpperCase(); if (!/^[A-Z]{2}$/.test(out.state)) e('UF inválida.');
  for (const k of ['street', 'number', 'district', 'city']) if (!out[k]) e('Preencha o endereço completo.');
  return out;
}

async function createPreference(env, request, tenant, order, lines, shipping, address, settings) {
  const origin = settings.siteUrl || request.headers.get('Origin') || '';
  const back = `${origin}/#pedido/${order.id}`;
  const workerOrigin = new URL(request.url).origin;
  const items = lines.map(l => ({ id: l.productId, title: l.name.slice(0, 120), quantity: l.quantity, unit_price: l.unitCents / 100, currency_id: 'BRL' }));
  if (shipping.amountCents > 0) items.push({ id: 'frete', title: `Frete — ${shipping.carrier} ${shipping.name}`.slice(0, 120), quantity: 1, unit_price: shipping.amountCents / 100, currency_id: 'BRL' });
  const body = {
    items, external_reference: order.id,
    payer: { name: address.name, email: address.email, phone: { area_code: address.phone.slice(0, 2), number: address.phone.slice(2) }, identification: { type: address.document.length === 14 ? 'CNPJ' : 'CPF', number: address.document } },
    back_urls: { success: back, pending: back, failure: back }, ...(origin.startsWith('https://') ? { auto_return: 'approved' } : {}),
    notification_url: `${workerOrigin}/atelier/webhooks/mercadopago?tenant=${tenant}`,
    statement_descriptor: (settings.statementDescriptor || 'VEROVAZ').slice(0, 22)
  };
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST', headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': order.id }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new HttpError(502, 'Não foi possível iniciar o pagamento. Tente novamente em instantes.');
  const pref = await res.json();
  return pref.init_point;
}

async function checkout(request, env, tenant, session, body) {
  if (!env.MP_ACCESS_TOKEN) throw new HttpError(503, 'Pagamento ainda não configurado.');
  if (body?.revision !== session.revision) throw new HttpError(409, 'O carrinho mudou. Revise antes de continuar.');
  const settings = await getSettings(env, tenant);
  const existing = await env.V8_D1.prepare('SELECT * FROM atelier_orders WHERE session_id=? AND revision=?').bind(session.id, session.revision).first();
  const items = parse(session.items, []);
  if (!items.length) throw new HttpError(422, 'Carrinho vazio.');
  const address = validateAddress(body.address);
  const products = await productsByIds(env, tenant, [...new Set(items.map(i => i.productId))]);
  const lines = items.map(i => {
    const p = products.get(i.productId);
    if (!p || !p.active) throw new HttpError(422, 'Um item do carrinho não está mais disponível.');
    if (p.price_cents === null) throw new HttpError(422, 'Um item ainda não tem preço cadastrado.');
    if (p.stock < i.quantity) throw new HttpError(422, `Estoque insuficiente: ${p.name}.`);
    return { id: i.id, productId: p.id, name: p.name, unitCents: p.price_cents, quantity: i.quantity, art: i.art };
  });
  if (existing) {  // reenvio seguro (rede caiu depois de criar o pedido)
    let url = existing.checkout_url;
    if (!url) { url = await createPreference(env, request, tenant, existing, lines, parse(existing.shipping, {}), address, settings); await env.V8_D1.prepare('UPDATE atelier_orders SET checkout_url=?, updated_at=? WHERE id=?').bind(url, now(), existing.id).run(); }
    return { orderId: existing.id, checkoutUrl: url };
  }
  const quote = await env.V8_D1.prepare('SELECT * FROM atelier_quotes WHERE id=? AND tenant=?').bind(String(body.quoteId || ''), tenant).first();
  if (!quote || quote.expires_at < now()) throw new HttpError(422, 'A cotação de frete expirou. Consulte novamente.');
  if (quote.postal_code !== address.postalCode) throw new HttpError(422, 'O CEP mudou depois da cotação. Consulte o frete novamente.');
  if (quote.fingerprint !== fingerprint(items)) throw new HttpError(422, 'O carrinho mudou depois da cotação. Consulte o frete novamente.');
  const shipping = parse(quote.options, []).find(o => o.serviceCode === body.serviceCode);
  if (!shipping) throw new HttpError(422, 'Serviço de entrega inválido.');
  const subtotal = lines.reduce((s, l) => s + l.unitCents * l.quantity, 0);
  const total = subtotal + shipping.amountCents;
  const order = { id: uuid() }, t = now();
  const artIds = lines.flatMap(l => l.art ? [l.art.originalId, l.art.previewId] : []);
  const stmts = [
    env.V8_D1.prepare('INSERT INTO atelier_orders (id,tenant,session_id,revision,subtotal_cents,shipping_cents,total_cents,shipping,address,customer_name,customer_email,customer_phone,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(order.id, tenant, session.id, session.revision, subtotal, shipping.amountCents, total, JSON.stringify(shipping), JSON.stringify(address), address.name, address.email, address.phone, t, t),
    ...lines.map(l => env.V8_D1.prepare('INSERT INTO atelier_order_items (id,order_id,product_id,name,unit_cents,quantity,art) VALUES (?,?,?,?,?,?,?)').bind(uuid(), order.id, l.productId, l.name, l.unitCents, l.quantity, l.art ? JSON.stringify(l.art) : null)),
    ...artIds.map(id => env.V8_D1.prepare('UPDATE atelier_artworks SET order_id=? WHERE id=?').bind(order.id, id))
  ];
  await env.V8_D1.batch(stmts);
  const url = await createPreference(env, request, tenant, order, lines, shipping, address, settings);
  await env.V8_D1.prepare('UPDATE atelier_orders SET checkout_url=?, updated_at=? WHERE id=?').bind(url, now(), order.id).run();
  // Espelha a cobrança no módulo Pagamentos existente do V8 Admin Universal.
  const paymentId = `atelier-${order.id}`;
  await env.V8_D1.prepare(`INSERT OR IGNORE INTO payments
    (id, project_id, source_type, source_id, customer_name, customer_email, description, amount, currency, provider, provider_payment_id, status, metadata_json, created_at, updated_at)
    VALUES (?, ?, 'atelier-order', ?, ?, ?, ?, ?, 'BRL', 'mercadopago', ?, 'pending', ?, ?, ?)`)
    .bind(paymentId, tenant, order.id, address.name, address.email, `Pedido do ateliê ${order.id}`, total / 100, order.id, JSON.stringify({ orderId: order.id, shippingCents: shipping.amountCents }), t, t).run();
  return { orderId: order.id, checkoutUrl: url };
}

async function verifyMpSignature(request, env, dataId) {
  if (!env.MP_WEBHOOK_SECRET) return true;
  const sig = request.headers.get('x-signature') || '', reqId = request.headers.get('x-request-id') || '';
  const ts = /ts=([^,]+)/.exec(sig)?.[1], v1 = /v1=([^,]+)/.exec(sig)?.[1];
  if (!ts || !v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.MP_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`id:${id};request-id:${reqId};ts:${ts};`));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === v1;
}

async function mercadoPagoWebhook(request, env, url) {
  let body = {}; try { body = await request.json(); } catch {}
  const type = body.type || url.searchParams.get('type') || url.searchParams.get('topic');
  const paymentId = String(body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || '');
  if (type !== 'payment' || !paymentId) return new Response('ignored', { status: 200 });
  if (!(await verifyMpSignature(request, env, paymentId))) return new Response('bad signature', { status: 401 });
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` } });
  if (!res.ok) return new Response('retry', { status: 502 });   // MP reenvia
  const pay = await res.json();
  const order = await env.V8_D1.prepare('SELECT * FROM atelier_orders WHERE id=?').bind(String(pay.external_reference || '')).first();
  if (!order) return new Response('no order', { status: 200 });
  const t = now();
  if (pay.status === 'approved') {
    if (Math.round(Number(pay.transaction_amount) * 100) !== order.total_cents) {
      await env.V8_D1.prepare("UPDATE atelier_orders SET status='payment_review', payment_status='approved', mp_payment_id=?, updated_at=? WHERE id=?").bind(paymentId, t, order.id).run();
    } else if (!order.stock_applied) {
      const items = (await env.V8_D1.prepare('SELECT product_id, quantity FROM atelier_order_items WHERE order_id=?').bind(order.id).all()).results;
      await env.V8_D1.batch([
        env.V8_D1.prepare("UPDATE atelier_orders SET status=CASE WHEN status IN ('pending','payment_review') THEN 'paid' ELSE status END, payment_status='approved', mp_payment_id=?, stock_applied=1, updated_at=? WHERE id=? AND stock_applied=0").bind(paymentId, t, order.id),
        ...items.map(i => env.V8_D1.prepare('UPDATE products SET stock=MAX(stock-?,0), updated_at=? WHERE id=? AND project_id=? AND track_stock=1').bind(i.quantity, t, i.product_id, order.tenant))
      ]);
    }
  } else {
    await env.V8_D1.prepare("UPDATE atelier_orders SET payment_status=?, updated_at=? WHERE id=? AND payment_status!='approved'").bind(String(pay.status || 'pending'), t, order.id).run();
  }
  const v8PaymentStatus = pay.status === 'approved' ? 'paid' : (pay.status === 'cancelled' || pay.status === 'rejected' ? 'cancelled' : 'pending');
  await env.V8_D1.prepare(`UPDATE payments SET status=?, provider_payment_id=?, paid_at=?, updated_at=?
    WHERE project_id=? AND source_type='atelier-order' AND source_id=?`)
    .bind(v8PaymentStatus, String(paymentId), pay.status === 'approved' ? t : '', t, order.tenant, order.id).run();
  return new Response('ok', { status: 200 });
}

// ───────────── pedidos (público) ─────────────
const orderPublic = o => ({ id: o.id, code: o.id.slice(0, 8).toUpperCase(), status: o.status, paymentStatus: o.payment_status, totalAmount: o.total_cents / 100, trackingCode: o.tracking_code, checkoutUrl: o.checkout_url });

async function trackOrder(env, tenant, url) {
  const code = String(url.searchParams.get('code') || '').trim().toLowerCase().replace(/[^0-9a-f]/g, '');
  const phone = digits(url.searchParams.get('phone'));
  if (code.length < 8 || phone.length < 10) throw new HttpError(404, 'Pedido não encontrado.');
  const row = await env.V8_D1.prepare('SELECT * FROM atelier_orders WHERE tenant=? AND id LIKE ? AND customer_phone=?').bind(tenant, code + '%', phone.slice(-11)).first();
  if (!row) throw new HttpError(404, 'Pedido não encontrado.');
  return orderPublic(row);
}

// ───────────── admin ─────────────
async function requireAdmin(request, env, opts) {
  let ok = false;
  if (opts?.isAdmin) ok = await opts.isAdmin(request);
  else if (env.ATELIER_ADMIN_TOKEN) ok = (request.headers.get('Authorization') || '') === `Bearer ${env.ATELIER_ADMIN_TOKEN}`;
  if (!ok) throw new HttpError(401, 'Não autorizado.');
}
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function adminRoutes(request, env, url, tenant, parts, opts) {
  await requireAdmin(request, env, opts);
  const m = request.method, [res, id] = parts;   // parts = path depois de /api/atelier/admin/
  if (res === 'settings') {
    if (m === 'GET') return json(await getSettings(env, tenant));
    if (m === 'PUT') { const b = await request.json(); await env.V8_D1.prepare('INSERT INTO atelier_settings (tenant,data) VALUES (?,?) ON CONFLICT(tenant) DO UPDATE SET data=excluded.data').bind(tenant, JSON.stringify({ ...(await getSettings(env, tenant)), ...b })).run(); return json({ ok: true }); }
  }
  if (res === 'products') {
    if (m === 'GET') return json((await listProducts(env, tenant, { onlyActive: false })).map(p => ({ ...publicProduct(p), kind: p.kind, sizeId: p.size_id, meta: p.meta, weightG: p.weight_g, widthCm: p.width_cm, heightCm: p.height_cm, lengthCm: p.length_cm, sort: p.sort })));
    return json({ error: 'Produtos são gerenciados no Catálogo do V8 Admin Universal.' }, 409);
  }
  if (res === 'orders') {
    if (m === 'GET' && !id) {
      const st = url.searchParams.get('status');
      const rs = await env.V8_D1.prepare(`SELECT * FROM atelier_orders WHERE tenant=? ${st ? 'AND status=?' : ''} ORDER BY created_at DESC LIMIT 200`).bind(...(st ? [tenant, st] : [tenant])).all();
      return json(rs.results.map(o => ({ ...orderPublic(o), customerName: o.customer_name, createdAt: o.created_at })));
    }
    if (m === 'GET' && id) {
      const o = await env.V8_D1.prepare('SELECT * FROM atelier_orders WHERE id=? AND tenant=?').bind(id, tenant).first();
      if (!o) throw new HttpError(404, 'Pedido não encontrado.');
      const items = (await env.V8_D1.prepare('SELECT * FROM atelier_order_items WHERE order_id=?').bind(id).all()).results.map(i => ({ ...i, art: parse(i.art, null) }));
      return json({ ...orderPublic(o), customerEmail: o.customer_email, customerPhone: o.customer_phone, address: parse(o.address, {}), shipping: parse(o.shipping, {}), subtotalCents: o.subtotal_cents, shippingCents: o.shipping_cents, items });
    }
    if (m === 'PUT' && id) {
      const b = await request.json();
      const allowed = ['pending', 'paid', 'production', 'shipped', 'delivered', 'payment_review', 'cancelled'];
      if (b.status && !allowed.includes(b.status)) throw new HttpError(422, 'Status inválido.');
      await env.V8_D1.prepare('UPDATE atelier_orders SET status=COALESCE(?,status), tracking_code=COALESCE(?,tracking_code), updated_at=? WHERE id=? AND tenant=?').bind(b.status ?? null, b.trackingCode ?? null, now(), id, tenant).run();
      return json({ ok: true });
    }
  }
  if (res === 'artworks' && id && m === 'GET') {
    const a = await env.V8_D1.prepare('SELECT * FROM atelier_artworks WHERE id=? AND tenant=?').bind(id, tenant).first();
    if (!a) throw new HttpError(404, 'Arquivo não encontrado.');
    const obj = await env.ATELIER_R2.get(a.r2_key);
    if (!obj) throw new HttpError(404, 'Arquivo não encontrado.');
    return new Response(obj.body, { headers: { 'Content-Type': a.content_type, 'Content-Disposition': `attachment; filename="${a.id}.${a.content_type.split('/')[1]}"`, 'Cache-Control': 'private, no-store' } });
  }
  throw new HttpError(404, 'Rota não encontrada.');
}

// ───────────── roteador ─────────────
export async function handleAtelier(request, env, opts = {}) {
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '') || '/';
  const own = path === '/products' || path === '/orders/tracking' || path.startsWith('/atelier/') || path.startsWith('/api/atelier/admin/');
  if (!own) return null;
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    if (!env.V8_D1) throw new HttpError(503, 'Binding V8_D1 não configurado.');
    const tenant = tenantOf(request, url), m = request.method;
    let res;
    if (path === '/products' && m === 'GET') res = json((await listProducts(env, tenant)).map(publicProduct));
    else if (path === '/atelier/config' && m === 'GET') res = json(await publicConfig(env, tenant));
    else if (path === '/atelier/shipping/quotes' && m === 'POST') res = json(await quoteShipping(env, tenant, await request.json().catch(() => null)));
    else if (path === '/orders/tracking' && m === 'GET') res = json(await trackOrder(env, tenant, url));
    else if (path === '/atelier/webhooks/mercadopago' && m === 'POST') res = await mercadoPagoWebhook(request, env, url);
    else if (path === '/atelier/private/sessions' && m === 'POST') {
      const s = await getSettings(env, tenant), token = randomToken(), t = now();
      await env.V8_D1.prepare('INSERT INTO atelier_sessions (id,tenant,token_hash,created_at,expires_at) VALUES (?,?,?,?,?)').bind(uuid(), tenant, await sha256(token), t, t + s.draftRetentionDays * DAY).run();
      res = json({ token }, 201);
    } else if (path.startsWith('/atelier/private/')) {
      const sub = path.slice('/atelier/private/'.length), session = await requireSession(request, env, tenant);
      if (sub === 'cart' && m === 'GET') res = json({ revision: session.revision, items: parse(session.items, []) });
      else if (sub === 'cart' && m === 'PUT') res = json(await saveCart(env, tenant, session, await request.json().catch(() => null)));
      else if (sub === 'artworks' && m === 'POST') res = json(await uploadArtwork(request, env, tenant, session), 201);
      else if (sub === 'checkout' && m === 'POST') res = json(await checkout(request, env, tenant, session, await request.json().catch(() => null)));
      else if (sub.startsWith('orders/') && m === 'GET') {
        const o = await env.V8_D1.prepare('SELECT * FROM atelier_orders WHERE id=? AND session_id=?').bind(sub.slice(7), session.id).first();
        if (!o) throw new HttpError(404, 'Pedido não encontrado.');
        res = json(orderPublic(o));
      } else throw new HttpError(404, 'Rota não encontrada.');
    } else if (path.startsWith('/api/atelier/admin/')) {
      res = await adminRoutes(request, env, url, tenant, path.slice('/api/atelier/admin/'.length).split('/'), opts);
    } else throw new HttpError(404, 'Rota não encontrada.');
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error('atelier', err);
    return json({ detail: err instanceof HttpError ? err.detail : 'Erro interno.' }, status, cors);
  }
}

// ───────────── limpeza (chame no scheduled) ─────────────
export async function cleanupAtelier(env) {
  const t = now();
  const stale = (await env.V8_D1.prepare('SELECT a.id, a.r2_key FROM atelier_artworks a JOIN atelier_sessions s ON s.id=a.session_id WHERE a.order_id IS NULL AND s.expires_at<? LIMIT 200').bind(t).all()).results;
  for (const a of stale) { await env.ATELIER_R2?.delete(a.r2_key); await env.V8_D1.prepare('DELETE FROM atelier_artworks WHERE id=?').bind(a.id).run(); }
  await env.V8_D1.prepare('DELETE FROM atelier_sessions WHERE expires_at<? AND id NOT IN (SELECT session_id FROM atelier_orders)').bind(t).run();
  await env.V8_D1.prepare('DELETE FROM atelier_quotes WHERE expires_at<?').bind(t).run();
}
