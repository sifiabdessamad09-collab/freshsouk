import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const products = JSON.parse(await readFile(new URL("../products.json", import.meta.url), "utf8"));
const workerSource = await readFile(new URL("./worker.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript;base64," + Buffer.from(workerSource).toString("base64"))).default;

function mockEnv() {
  const orders = [];
  const history = [];
  const subscriptions = [];
  const DB = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async run() {
          if (sql.startsWith("INSERT OR IGNORE INTO orders")) {
            if (!orders.some(order => order.idempotency_key === args[1])) {
              orders.push({ id: args[0], idempotency_key: args[1], created_at: args[2], updated_at: args[3], customer_name: args[4], phone: args[5], city: args[6], neighborhood: args[7], address: args[8], items_json: args[9], subtotal: args[10], delivery_fee: args[11], discount: args[12], total: args[13], delivery_slot: args[14], note: args[15], source: args[16], status: "pending" });
            }
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("INSERT INTO order_status_history")) { history.push(args); return { meta: { changes: 1 } }; }
          if (sql.startsWith("INSERT INTO subscriptions")) {
            subscriptions.push({ id: args[0], created_at: args[1], updated_at: args[2], customer_name: args[3], phone: args[4], city: args[5], neighborhood: args[6], address: args[7], pack_product_id: args[8], pack_quantity: args[9], frequency_weeks: args[10], delivery_weekday: args[11], delivery_slot: args[12], next_delivery_date: args[13], consent_at: args[14], status: "active" });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
          if (sql.includes("FROM orders WHERE idempotency_key")) return orders.find(order => order.idempotency_key === args[0]) || null;
          return null;
        },
        async all() { return { results: [] }; }
      };
    },
    async batch() { return []; }
  };
  return {
    orders,
    history,
    subscriptions,
    env: {
      DB,
      ALLOWED_ORIGIN: "https://sifiabdessamad09-collab.github.io",
      DELIVERY_FEE: "20",
      FREE_SHIPPING_THRESHOLD: "200",
      ASSETS: { async fetch() { return new Response(JSON.stringify(products), { status: 200, headers: { "content-type": "application/json" } }); } }
    }
  };
}

const validPayload = {
  customer: { name: "Test Client", phone: "0643880485", city: "Casablanca", neighborhood: "Maarif", address: "Rue test", slot: "09h00 - 12h00", note: "" },
  items: [{ productId: "tomates", quantity: 2 }]
};

function orderRequest(payload = validPayload, key = "test-order-key-000001", origin = "https://sifiabdessamad09-collab.github.io") {
  return new Request("https://freshsouk-worker.test/api/orders", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(payload)
  });
}

test("order saves catalog price, delivery and server receipt", async () => {
  const { env, orders, history } = mockEnv();
  const response = await worker.fetch(orderRequest(), env);
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.ok, true);
  assert.equal(result.order.subtotal, 16);
  assert.equal(result.order.delivery_fee, 20);
  assert.equal(result.order.total, 36);
  assert.equal(result.order.status, "pending");
  assert.equal(orders.length, 1);
  assert.equal(history.length, 1);
});

test("same idempotency key returns one order", async () => {
  const { env, orders } = mockEnv();
  const first = await worker.fetch(orderRequest(), env);
  const second = await worker.fetch(orderRequest(), env);
  assert.equal((await first.json()).order.id, (await second.json()).order.id);
  assert.equal(orders.length, 1);
});

test("rejects unknown products and malformed phone without saving", async () => {
  const { env, orders } = mockEnv();
  const unknownProduct = await worker.fetch(orderRequest({ ...validPayload, items: [{ productId: "not-a-product", quantity: 1 }] }), env);
  assert.equal(unknownProduct.status, 400);
  const wrongPhone = await worker.fetch(orderRequest({ ...validPayload, customer: { ...validPayload.customer, phone: "123" } }, "test-order-key-000002"), env);
  assert.equal(wrongPhone.status, 400);
  assert.equal(orders.length, 0);
});

test("keeps private order administration behind a verified Access token", async () => {
  const { env } = mockEnv();
  const response = await worker.fetch(new Request("https://freshsouk-worker.test/api/admin/orders"), env);
  assert.equal(response.status, 401);
});

test("rejects unapproved website origins", async () => {
  const { env } = mockEnv();
  const response = await worker.fetch(orderRequest(validPayload, "test-order-key-000003", "https://attacker.example"), env);
  assert.equal(response.status, 403);
});

test("subscription requires explicit consent and saves the selected schedule", async () => {
  const { env, subscriptions } = mockEnv();
  const day = new Date(); day.setDate(day.getDate() + 7);
  const nextDeliveryDate = [day.getFullYear(), String(day.getMonth() + 1).padStart(2, "0"), String(day.getDate()).padStart(2, "0")].join("-");
  const deliveryWeekday = new Date(nextDeliveryDate + "T00:00:00.000Z").getUTCDay();
  const payload = {
    customer: { name: "Test Client", phone: "0643880485", city: "Casablanca", neighborhood: "Maarif", address: "Rue test", slot: "09h00 - 12h00" },
    packProductId: "pack-couscous-vendredi", quantity: 1, frequencyWeeks: 2, deliveryWeekday, nextDeliveryDate, consent: true
  };
  const makeRequest = body => new Request("https://freshsouk-worker.test/api/subscriptions", { method: "POST", headers: { Origin: "https://sifiabdessamad09-collab.github.io", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const denied = await worker.fetch(makeRequest({ ...payload, consent: false }), env);
  assert.equal(denied.status, 400);
  assert.equal(subscriptions.length, 0);
  const accepted = await worker.fetch(makeRequest(payload), env);
  const result = await accepted.json();
  assert.equal(accepted.status, 201);
  assert.equal(result.subscription.status, "active");
  assert.equal(subscriptions[0].frequency_weeks, 2);
  assert.equal(subscriptions[0].pack_product_id, "pack-couscous-vendredi");
});
