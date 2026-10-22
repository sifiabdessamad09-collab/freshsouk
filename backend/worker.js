const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const STATUSES = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"];
let accessKeysCache = { expires: 0, keys: [] };

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { ...JSON_HEADERS, ...headers }
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const sameOrigin = new URL(request.url).origin;
    const allowedOrigins = [env.ALLOWED_ORIGIN, env.ADMIN_ORIGIN, sameOrigin].filter(Boolean);
    const cors = origin && allowedOrigins.includes(origin)
      ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "vary": "Origin" }
      : {};
    if (origin && !allowedOrigins.includes(origin)) return json({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: { ...cors, "access-control-allow-methods": "GET,POST,PATCH,OPTIONS", "access-control-allow-headers": "Content-Type, Idempotency-Key, Cf-Access-Jwt-Assertion", "access-control-max-age": "600" }
    });

    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health" && request.method === "GET") return json({ ok: true }, 200, cors);
      if (url.pathname === "/admin" || url.pathname === "/admin/") {
        await requireAdmin(request, env);
        return env.ASSETS.fetch(new Request(new URL("/backend/admin.html", request.url)));
      }
      if (url.pathname === "/api/orders" && request.method === "POST") return await createOrder(request, env, cors);
      if (url.pathname === "/api/subscriptions" && request.method === "POST") return await createSubscription(request, env, cors);
      if (url.pathname === "/api/catalog" && request.method === "GET") {
        const response = await env.ASSETS.fetch(new Request(new URL("/products.json", request.url)));
        if (!response.ok) throw new Error("Catalog unavailable");
        return new Response(await response.text(), { status: 200, headers: { ...JSON_HEADERS, "access-control-allow-origin": cors["access-control-allow-origin"] || "", ...cors } });
      }
      if (url.pathname === "/api/admin/dashboard" && request.method === "GET") {
        await requireAdmin(request, env);
        return json(await getDashboard(env), 200, cors);
      }
      if (url.pathname === "/api/admin/orders/export.csv" && request.method === "GET") {
        await requireAdmin(request, env);
        const orders = await listOrders(env, url.searchParams);
        return new Response("\uFEFF" + ordersToCsv(orders), {
          status: 200,
          headers: { ...cors, "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="freshsouk-orders.csv"', "cache-control": "no-store" }
        });
      }
      if (url.pathname === "/api/admin/orders" && request.method === "GET") {
        await requireAdmin(request, env);
        return json({ orders: await listOrders(env, url.searchParams) }, 200, cors);
      }
      if (url.pathname === "/api/admin/subscriptions" && request.method === "GET") {
        await requireAdmin(request, env);
        const result = await env.DB.prepare("SELECT s.*, (SELECT COUNT(*) FROM subscription_reminders r WHERE r.subscription_id=s.id) AS reminder_count, (SELECT status FROM subscription_reminders r WHERE r.subscription_id=s.id ORDER BY r.delivery_date DESC LIMIT 1) AS last_reminder_status FROM subscriptions s ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, s.next_delivery_date ASC LIMIT 1000").all();
        return json({ subscriptions: result.results || [] }, 200, cors);
      }
      const subscriptionAction = url.pathname.match(/^\/api\/admin\/subscriptions\/([0-9a-f-]+)\/(reminder|confirm)$/i);
      if (subscriptionAction && request.method === "POST") {
        await requireAdmin(request, env);
        if (subscriptionAction[2] === "reminder") return await prepareSubscriptionReminder(subscriptionAction[1], env, cors);
        return await confirmSubscriptionOrder(subscriptionAction[1], env, cors);
      }
      const subscriptionStatus = url.pathname.match(/^\/api\/admin\/subscriptions\/([0-9a-f-]+)$/i);
      if (subscriptionStatus && request.method === "PATCH") {
        const admin = await requireAdmin(request, env);
        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400, cors); }
        if (body.status !== undefined && !["active", "paused", "cancelled"].includes(body.status)) return json({ error: "Invalid subscription status" }, 400, cors);
        const current = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(subscriptionStatus[1]).first();
        if (!current) return json({ error: "Subscription not found" }, 404, cors);
        const packProductId = body.packProductId === undefined ? current.pack_product_id : String(body.packProductId);
        const packQuantity = body.packQuantity === undefined ? Number(current.pack_quantity) : Number(body.packQuantity);
        const frequencyWeeks = body.frequencyWeeks === undefined ? Number(current.frequency_weeks) : Number(body.frequencyWeeks);
        const nextDeliveryDate = body.nextDeliveryDate === undefined ? current.next_delivery_date : String(body.nextDeliveryDate);
        const response = await env.ASSETS.fetch(new Request(new URL("/products.json", request.url)));
        if (!response.ok) throw new Error("Catalog unavailable");
        const catalog = await response.json();
        if (!catalog.some(item => item.id === packProductId && item.category === "packs") || !Number.isFinite(packQuantity) || packQuantity <= 0 || packQuantity > 20 || ![1, 2].includes(frequencyWeeks) || !isDateOnly(nextDeliveryDate) || (body.nextDeliveryDate !== undefined && nextDeliveryDate <= moroccoDay(new Date()))) return json({ error: "Invalid subscription update" }, 400, cors);
        const now = new Date().toISOString();
        const changedDate = nextDeliveryDate !== current.next_delivery_date;
        await env.DB.batch([
          env.DB.prepare("UPDATE subscriptions SET status = ?, pack_product_id = ?, pack_quantity = ?, frequency_weeks = ?, delivery_weekday = ?, next_delivery_date = ?, updated_at = ? WHERE id = ?")
            .bind(body.status || current.status, packProductId, packQuantity, frequencyWeeks, new Date(nextDeliveryDate + "T00:00:00.000Z").getUTCDay(), nextDeliveryDate, now, subscriptionStatus[1]),
          ...(changedDate || packProductId !== current.pack_product_id || packQuantity !== Number(current.pack_quantity) || frequencyWeeks !== Number(current.frequency_weeks)
            ? [env.DB.prepare("UPDATE subscription_reminders SET status = 'skipped' WHERE subscription_id = ? AND status = 'prepared'").bind(subscriptionStatus[1])]
            : [])
        ]);
        return json({ ok: true, id: subscriptionStatus[1], status: body.status || current.status, changedBy: admin.email }, 200, cors);
      }
      const detail = url.pathname.match(/^\/api\/admin\/orders\/([0-9a-f-]+)$/i);
      if (detail && request.method === "GET") {
        await requireAdmin(request, env);
        const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(detail[1]).first();
        if (!order) return json({ error: "Order not found" }, 404, cors);
        const history = await env.DB.prepare("SELECT old_status,new_status,changed_at,changed_by FROM order_status_history WHERE order_id = ? ORDER BY changed_at DESC").bind(detail[1]).all();
        return json({ order, history: history.results || [] }, 200, cors);
      }
      const change = url.pathname.match(/^\/api\/admin\/orders\/([0-9a-f-]+)\/status$/i);
      if (change && request.method === "PATCH") {
        const admin = await requireAdmin(request, env);
        const body = await request.json();
        if (!STATUSES.includes(body.status)) return json({ error: "Invalid status" }, 400, cors);
        const now = new Date().toISOString();
        const current = await env.DB.prepare("SELECT status FROM orders WHERE id = ?").bind(change[1]).first();
        if (!current) return json({ error: "Order not found" }, 404, cors);
        if (current.status === body.status) return json({ ok: true, id: change[1], status: body.status }, 200, cors);
        await env.DB.batch([
          env.DB.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").bind(body.status, now, change[1]),
          env.DB.prepare("INSERT INTO order_status_history (order_id,old_status,new_status,changed_at,changed_by) VALUES (?,?,?,?,?)").bind(change[1], current.status, body.status, now, admin.email)
        ]);
        return json({ ok: true, id: change[1], status: body.status }, 200, cors);
      }
      return json({ error: "Not found" }, 404, cors);
    } catch (error) {
      return json({ error: error.status ? error.message : "Internal server error" }, error.status || 500, cors);
    }
  }
};

async function createOrder(request, env, cors) {
  if (env.ORDER_LIMITER) {
    const key = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!(await env.ORDER_LIMITER.limit({ key })).success) return json({ error: "Trop de demandes. Réessayez plus tard." }, 429, cors);
  }
  const idem = request.headers.get("Idempotency-Key") || "";
  if (!/^[A-Za-z0-9._:-]{16,100}$/.test(idem)) return json({ error: "Idempotency-Key required" }, 400, cors);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400, cors); }
  const customer = body.customer || {};
  for (const field of ["name", "phone", "city", "address", "slot"]) {
    if (typeof customer[field] !== "string" || !customer[field].trim() || customer[field].length > 240) return json({ error: "Missing or invalid customer details" }, 400, cors);
  }
  if (!/^(?:0[567]\d{8}|\+212[567]\d{8})$/.test(customer.phone.trim())) return json({ error: "Invalid Moroccan phone number" }, 400, cors);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 25) return json({ error: "Invalid order items" }, 400, cors);
  const response = await env.ASSETS.fetch(new Request(new URL("/products.json", request.url)));
  if (!response.ok) throw new Error("Catalog unavailable");
  const catalog = await response.json();
  const items = [];
  for (const line of body.items) {
    const product = catalog.find(item => item.id === line.productId);
    const quantity = Number(line.quantity);
    if (!product || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100) return json({ error: "Invalid product or quantity" }, 400, cors);
    const unitPrice = Number(product.price);
    items.push({ id: product.id, nameFr: product.nameFr, nameAr: product.nameAr, unit: product.unit, quantity, unitPrice, lineTotal: Number((unitPrice * quantity).toFixed(2)) });
  }
  const subtotal = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const fee = Number(env.DELIVERY_FEE || 20);
  const threshold = Number(env.FREE_SHIPPING_THRESHOLD || 200);
  const delivery = subtotal >= threshold ? 0 : fee;
  const discount = 0;
  const total = Number((subtotal + delivery - discount).toFixed(2));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const sql = "INSERT OR IGNORE INTO orders (id,idempotency_key,created_at,updated_at,customer_name,phone,city,neighborhood,address,items_json,subtotal,delivery_fee,discount,total,delivery_slot,note,source,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')";
  await env.DB.prepare(sql).bind(id, idem, now, now, customer.name.trim(), customer.phone.trim(), customer.city.trim(), String(customer.neighborhood || "").slice(0, 240), customer.address.trim(), JSON.stringify(items), subtotal, delivery, discount, total, customer.slot.trim(), String(customer.note || "").slice(0, 1000), "website").run();
  const saved = await env.DB.prepare("SELECT * FROM orders WHERE idempotency_key = ?").bind(idem).first();
  if (saved?.id === id) await env.DB.prepare("INSERT INTO order_status_history (order_id,old_status,new_status,changed_at,changed_by) VALUES (?,'—','pending',?,?)").bind(id, now, "customer").run();
  return json({ ok: true, order: saved }, 201, cors);
}

async function createSubscription(request, env, cors) {
  if (env.ORDER_LIMITER) {
    const key = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!(await env.ORDER_LIMITER.limit({ key })).success) return json({ error: "Trop de demandes. Réessayez plus tard." }, 429, cors);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400, cors); }
  const customer = body.customer || {};
  for (const field of ["name", "phone", "city", "address", "slot"]) {
    if (typeof customer[field] !== "string" || !customer[field].trim() || customer[field].trim().length > 240) return json({ error: "Missing or invalid customer details" }, 400, cors);
  }
  if (!/^(?:0[567]\d{8}|\+212[567]\d{8})$/.test(customer.phone.trim())) return json({ error: "Invalid Moroccan phone number" }, 400, cors);
  if (body.consent !== true) return json({ error: "Explicit subscription consent is required" }, 400, cors);
  const frequency = Number(body.frequencyWeeks), weekday = Number(body.deliveryWeekday), quantity = Number(body.quantity);
  const date = String(body.nextDeliveryDate || "");
  if (![1, 2].includes(frequency) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 20 || !isDateOnly(date) || date <= moroccoDay(new Date()) || new Date(date + "T00:00:00.000Z").getUTCDay() !== weekday) return json({ error: "Invalid subscription schedule" }, 400, cors);
  const catalogResponse = await env.ASSETS.fetch(new Request(new URL("/products.json", request.url)));
  if (!catalogResponse.ok) throw new Error("Catalog unavailable");
  const catalog = await catalogResponse.json();
  const pack = catalog.find(product => product.id === body.packProductId && product.category === "packs");
  if (!pack) return json({ error: "Invalid pack" }, 400, cors);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO subscriptions (id,created_at,updated_at,customer_name,phone,city,neighborhood,address,pack_product_id,pack_quantity,frequency_weeks,delivery_weekday,delivery_slot,next_delivery_date,consent_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')")
    .bind(id, now, now, customer.name.trim(), customer.phone.trim(), customer.city.trim(), String(customer.neighborhood || "").slice(0, 240), customer.address.trim(), pack.id, quantity, frequency, weekday, customer.slot.trim(), date, now).run();
  return json({ ok: true, subscription: { id, status: "active", nextDeliveryDate: date, frequencyWeeks: frequency } }, 201, cors);
}

async function prepareSubscriptionReminder(id, env, cors) {
  const subscription = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(id).first();
  if (!subscription) return json({ error: "Subscription not found" }, 404, cors);
  if (subscription.status !== "active") return json({ error: "Subscription is not active" }, 409, cors);
  const catalogResponse = await env.ASSETS.fetch(new Request("https://assets.invalid/products.json"));
  if (!catalogResponse.ok) throw new Error("Catalog unavailable");
  const catalog = await catalogResponse.json();
  const pack = catalog.find(product => product.id === subscription.pack_product_id);
  if (!pack) throw new Error("Subscription pack missing from catalog");
  const now = new Date().toISOString(), reminderId = crypto.randomUUID();
  await env.DB.prepare("INSERT OR IGNORE INTO subscription_reminders (id,subscription_id,delivery_date,created_at,status) VALUES (?,?,?,?, 'prepared')")
    .bind(reminderId, id, subscription.next_delivery_date, now).run();
  const reminder = await env.DB.prepare("SELECT * FROM subscription_reminders WHERE subscription_id = ? AND delivery_date = ?").bind(id, subscription.next_delivery_date).first();
  if (reminder.status !== "prepared") return json({ error: "This date was already confirmed or skipped" }, 409, cors);
  const phone = subscription.phone.replace(/\D/g, "").replace(/^0/, "212");
  const date = new Date(subscription.next_delivery_date + "T00:00:00.000Z").toLocaleDateString("fr-MA", { timeZone: "Africa/Casablanca" });
  const message = `Salam ${subscription.customer_name} 👋\n\nT9der t2aked lina wach ba9i baghi ${subscription.pack_quantity} × ${pack.nameFr} (${Number(pack.price).toFixed(2)} DH / pack) نهار ${date} مع ${subscription.frequency_weeks === 1 ? 'الاشتراك الأسبوعي' : 'الاشتراك كل جوج سيمانات'}؟\n\nما غاديش نوجدّو الطلب حتى تأكد لينا. جاوبنا بنعم أو لا، شكراً من FreshSOUK.`;
  const whatsappUrl = "https://wa.me/" + phone + "?text=" + encodeURIComponent(message);
  return json({ ok: true, reminder, whatsappUrl }, 200, cors);
}

async function confirmSubscriptionOrder(id, env, cors) {
  const subscription = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(id).first();
  if (!subscription) return json({ error: "Subscription not found" }, 404, cors);
  if (subscription.status !== "active") return json({ error: "Subscription is not active" }, 409, cors);
  const reminder = await env.DB.prepare("SELECT * FROM subscription_reminders WHERE subscription_id = ? AND delivery_date = ?").bind(id, subscription.next_delivery_date).first();
  if (!reminder || reminder.status !== "prepared") return json({ error: "Prepare a reminder first, then confirm only after the client replies yes" }, 409, cors);
  const catalogResponse = await env.ASSETS.fetch(new Request("https://assets.invalid/products.json"));
  if (!catalogResponse.ok) throw new Error("Catalog unavailable");
  const catalog = await catalogResponse.json();
  const product = catalog.find(item => item.id === subscription.pack_product_id && item.category === "packs");
  if (!product) throw new Error("Subscription pack missing from catalog");
  const item = { id: product.id, nameFr: product.nameFr, nameAr: product.nameAr, unit: product.unit, quantity: Number(subscription.pack_quantity), unitPrice: Number(product.price), lineTotal: Number((Number(product.price) * Number(subscription.pack_quantity)).toFixed(2)) };
  const order = await insertOrderRecord(env, { name: subscription.customer_name, phone: subscription.phone, city: subscription.city, neighborhood: subscription.neighborhood, address: subscription.address, slot: subscription.delivery_slot, note: "FreshSOUK Hebdo — le client a confirmé la livraison prévue.", source: "subscription" }, [item], `subscription:${id}:${subscription.next_delivery_date}`);
  const now = new Date().toISOString();
  let nextDate = subscription.next_delivery_date;
  const today = moroccoDay(new Date());
  do { nextDate = addDays(nextDate, Number(subscription.frequency_weeks) * 7); } while (nextDate <= today);
  await env.DB.batch([
    env.DB.prepare("UPDATE subscription_reminders SET status = 'confirmed', confirmed_order_id = ? WHERE id = ? AND status = 'prepared'").bind(order.id, reminder.id),
    env.DB.prepare("UPDATE subscriptions SET next_delivery_date = ?, updated_at = ? WHERE id = ? AND next_delivery_date = ?").bind(nextDate, now, id, subscription.next_delivery_date)
  ]);
  return json({ ok: true, orderId: order.id, nextDeliveryDate: nextDate }, 200, cors);
}

async function insertOrderRecord(env, customer, items, idempotencyKey) {
  const subtotal = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const fee = Number(env.DELIVERY_FEE ?? 20), threshold = Number(env.FREE_SHIPPING_THRESHOLD ?? 200);
  const delivery = subtotal >= threshold ? 0 : fee, total = Number((subtotal + delivery).toFixed(2));
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO orders (id,idempotency_key,created_at,updated_at,customer_name,phone,city,neighborhood,address,items_json,subtotal,delivery_fee,discount,total,delivery_slot,note,source,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')")
    .bind(id, idempotencyKey, now, now, customer.name, customer.phone, customer.city, customer.neighborhood || "", customer.address, JSON.stringify(items), subtotal, delivery, 0, total, customer.slot, customer.note || "", customer.source || "website").run();
  const saved = await env.DB.prepare("SELECT * FROM orders WHERE idempotency_key = ?").bind(idempotencyKey).first();
  if (saved?.id === id) await env.DB.prepare("INSERT INTO order_status_history (order_id,old_status,new_status,changed_at,changed_by) VALUES (?,'—','pending',?,?)").bind(id, now, customer.source === "subscription" ? "FreshSOUK Hebdo" : "customer").run();
  return saved;
}

function addDays(dateText, days) {
  const date = new Date(dateText + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function listOrders(env, params) {
  const status = params.get("status");
  const from = params.get("from");
  const to = params.get("to");
  const search = (params.get("q") || "").trim().slice(0, 100);
  if (status && !STATUSES.includes(status)) throw Object.assign(new Error("Invalid status"), { status: 400 });
  for (const date of [from, to]) if (date && !isDateOnly(date)) throw Object.assign(new Error("Invalid date filter"), { status: 400 });
  let sql = "SELECT * FROM orders WHERE 1=1";
  const args = [];
  if (status) { sql += " AND status = ?"; args.push(status); }
  if (from) { sql += " AND created_at >= ?"; args.push(from + "T00:00:00.000Z"); }
  if (to) { sql += " AND created_at < ?"; const next = new Date(to + "T00:00:00.000Z"); next.setUTCDate(next.getUTCDate() + 1); args.push(next.toISOString()); }
  if (search) { sql += " AND (customer_name LIKE ? OR phone LIKE ? OR city LIKE ? OR neighborhood LIKE ? OR address LIKE ?)"; args.push(...Array(5).fill("%" + search + "%")); }
  sql += " ORDER BY created_at DESC LIMIT 1000";
  const result = await env.DB.prepare(sql).bind(...args).all();
  return result.results || [];
}

async function getDashboard(env) {
  const result = await env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 5000").all();
  const orders = result.results || [];
  const stats = Object.fromEntries(STATUSES.map(status => [status, 0]));
  const today = moroccoDay(new Date());
  const todayOrders = orders.filter(order => moroccoDay(new Date(order.created_at)) === today);
  const delivered = orders.filter(order => order.status === "delivered");
  const popular = new Map();
  for (const order of orders) {
    let items = [];
    try { items = JSON.parse(order.items_json || "[]"); } catch { /* Ignore malformed legacy lines in analytics. */ }
    for (const item of items) popular.set(item.nameFr || item.id, (popular.get(item.nameFr || item.id) || 0) + Number(item.quantity || 0));
  }
  for (const order of orders) if (stats[order.status] !== undefined) stats[order.status]++;
  const revenue = delivered.reduce((sum, order) => sum + Number(order.total || 0), 0);
  return {
    today: todayOrders.length,
    pending: stats.pending,
    statuses: stats,
    deliveredRevenue: Number(revenue.toFixed(2)),
    deliveredAverage: delivered.length ? Number((revenue / delivered.length).toFixed(2)) : 0,
    popularProducts: [...popular.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 5),
    generatedAt: new Date().toISOString(),
    timezone: "Africa/Casablanca"
  };
}

function moroccoDay(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function csvCell(value) {
  let text = String(value ?? "");
  // Excel can execute untrusted CSV cells beginning with formula characters.
  if (/^[\t\r ]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function ordersToCsv(orders) {
  const columns = ["id", "created_at", "customer_name", "phone", "city", "neighborhood", "address", "items_json", "subtotal", "delivery_fee", "discount", "total", "delivery_slot", "status", "note"];
  const lines = [columns.map(csvCell).join(",")];
  for (const order of orders) lines.push(columns.map(column => csvCell(order[column])).join(","));
  return lines.join("\r\n");
}

async function requireAdmin(request, env) {
  const team = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!team || !audience || !token) throw Object.assign(new Error("Admin authentication required"), { status: 401 });
  const parts = token.split(".");
  if (parts.length !== 3) throw Object.assign(new Error("Invalid token"), { status: 401 });
  const decode = value => {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)));
  };
  const header = decode(parts[0]);
  const claims = decode(parts[1]);
  const now = Date.now() / 1000;
  if (header.alg !== "RS256" || claims.iss !== "https://" + team || ![].concat(claims.aud || []).includes(audience) || !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now))) throw Object.assign(new Error("Invalid Access token"), { status: 401 });
  const keys = await getAccessKeys(team);
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) throw Object.assign(new Error("Unknown signing key"), { status: 401 });
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const data = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const signatureBytes = decodeBase64Url(parts[2]);
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signatureBytes, data)) throw Object.assign(new Error("Invalid Access token"), { status: 401 });
  return { email: claims.email || claims.sub || "admin" };
}

async function getAccessKeys(team) {
  if (Date.now() < accessKeysCache.expires && accessKeysCache.keys.length) return accessKeysCache.keys;
  const response = await fetch("https://" + team + "/cdn-cgi/access/certs");
  if (!response.ok) throw new Error("Access signing keys unavailable");
  const keys = (await response.json()).keys || [];
  accessKeysCache = { expires: Date.now() + 10 * 60 * 1000, keys };
  return keys;
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)), char => char.charCodeAt(0));
}
