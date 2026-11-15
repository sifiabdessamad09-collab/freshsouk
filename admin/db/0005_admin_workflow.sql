-- Additive migration: existing orders, prices, stock and shipping zones are untouched.
CREATE TABLE order_collections (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  collected_cents INTEGER NOT NULL CHECK(collected_cents BETWEEN 0 AND 100000000),
  remitted_cents INTEGER NOT NULL CHECK(remitted_cents >= 0 AND remitted_cents <= collected_cents),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX orders_delivery_date ON orders(status,updated_at);
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  cursor_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER audit_collection_insert AFTER INSERT ON order_collections BEGIN
  INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details)
  VALUES('collection',NEW.order_id,'created',NEW.updated_by,NEW.updated_at,
    json_object('version',NEW.version,'collected_cents',NEW.collected_cents,'remitted_cents',NEW.remitted_cents));
END;
CREATE TRIGGER audit_collection_update AFTER UPDATE ON order_collections BEGIN
  INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details)
  VALUES('collection',NEW.order_id,'updated',NEW.updated_by,NEW.updated_at,
    json_object('version',NEW.version,'collected_cents',NEW.collected_cents,'remitted_cents',NEW.remitted_cents));
END;
