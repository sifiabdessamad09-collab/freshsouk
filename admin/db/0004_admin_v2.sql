-- Admin V2: preserve all rows and tracking capabilities in one migration transaction.
-- Copy the complete FK graph before replacing tables. Never apply without backup and owner approval.
PRAGMA defer_foreign_keys = ON;

DROP TRIGGER reserve_stock;

DROP TRIGGER check_status_transition;

DROP TRIGGER release_stock;

DROP TRIGGER audit_order_insert;

DROP TRIGGER audit_order_status;

DROP TRIGGER audit_product_insert;

DROP TRIGGER audit_product_update;

CREATE TABLE products_v2 (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 80),
  name_fr TEXT NOT NULL CHECK(length(name_fr) BETWEEN 1 AND 160),
  name_ar TEXT NOT NULL CHECK(length(name_ar) BETWEEN 1 AND 160),
  category TEXT NOT NULL CHECK(category IN ('legumes','fruits','herbes','packs')),
  unit TEXT NOT NULL CHECK(unit IN ('kg','botte','unité','pack')),
  description_fr TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK(price_cents > 0 AND price_cents <= 10000000),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  track_stock INTEGER NOT NULL DEFAULT 0 CHECK(track_stock IN (0,1)),
  stock_milli INTEGER NOT NULL DEFAULT 0 CHECK(stock_milli >= 0),
  low_stock_milli INTEGER NOT NULL DEFAULT 5000 CHECK(low_stock_milli >= 0),
  image_key TEXT NOT NULL DEFAULT 'leaf',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  update_reason TEXT NOT NULL DEFAULT 'Initialisation'
);

INSERT INTO products_v2 SELECT * FROM products;

CREATE TABLE orders_v2 (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  customer_name TEXT NOT NULL CHECK(length(customer_name) BETWEEN 2 AND 160),
  phone TEXT NOT NULL CHECK(length(phone) BETWEEN 10 AND 13),
  city TEXT NOT NULL CHECK(city IN ('Casablanca','Bouskoura','Mohammedia')),
  address TEXT NOT NULL CHECK(length(address) BETWEEN 5 AND 500),
  delivery_slot TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 1000),
  subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents > 0),
  delivery_cents INTEGER NOT NULL CHECK(delivery_cents BETWEEN 0 AND 100000),
  total_cents INTEGER NOT NULL CHECK(total_cents = subtotal_cents + delivery_cents),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','preparing','out_for_delivery','delivered','cancelled')),
  source TEXT NOT NULL CHECK(source IN ('website','admin')),
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL
);

INSERT INTO orders_v2 SELECT * FROM orders;

CREATE TABLE order_items_v2 (
  order_id TEXT NOT NULL REFERENCES orders_v2(id),
  product_id TEXT NOT NULL REFERENCES products_v2(id),
  name_fr TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL CHECK(quantity_milli > 0 AND quantity_milli <= 100000),
  unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents > 0),
  line_cents INTEGER NOT NULL CHECK(line_cents > 0),
  product_version INTEGER NOT NULL,
  reserved_stock INTEGER NOT NULL CHECK(reserved_stock IN (0,1)),
  PRIMARY KEY(order_id,product_id)
);

INSERT INTO order_items_v2 SELECT * FROM order_items;

CREATE TABLE order_tracking_v2 (
  order_id TEXT PRIMARY KEY REFERENCES orders_v2(id),
  token_hash TEXT UNIQUE CHECK(token_hash IS NULL OR (length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  updated_by TEXT NOT NULL
);

INSERT INTO order_tracking_v2 SELECT * FROM order_tracking;

CREATE TABLE admin_v2_migration_guard(ok INTEGER NOT NULL CHECK(ok=1));

INSERT INTO admin_v2_migration_guard VALUES(CASE WHEN (SELECT count(*) FROM products)=(SELECT count(*) FROM products_v2) AND (SELECT count(*) FROM orders)=(SELECT count(*) FROM orders_v2) AND (SELECT count(*) FROM order_items)=(SELECT count(*) FROM order_items_v2) AND (SELECT count(*) FROM order_tracking)=(SELECT count(*) FROM order_tracking_v2) THEN 1 ELSE 0 END);

DROP TABLE admin_v2_migration_guard;

DROP TABLE order_tracking;

DROP TABLE order_items;

DROP TABLE orders;

DROP TABLE products;

ALTER TABLE products_v2 RENAME TO products;

ALTER TABLE orders_v2 RENAME TO orders;

ALTER TABLE order_items_v2 RENAME TO order_items;

ALTER TABLE order_tracking_v2 RENAME TO order_tracking;

CREATE INDEX orders_date ON orders(created_at DESC);

CREATE INDEX orders_status_date ON orders(status,created_at DESC);

CREATE TRIGGER reserve_stock BEFORE INSERT ON order_items BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM products WHERE id=NEW.product_id AND active=1
      AND version=NEW.product_version AND price_cents=NEW.unit_price_cents
      AND track_stock=NEW.reserved_stock
  ) THEN RAISE(ABORT,'CATALOG_CHANGED') END;
  SELECT CASE WHEN NEW.reserved_stock=1 AND
    (SELECT stock_milli FROM products WHERE id=NEW.product_id) < NEW.quantity_milli
    THEN RAISE(ABORT,'INSUFFICIENT_STOCK') END;
  UPDATE products SET stock_milli=stock_milli-NEW.quantity_milli, version=version+1,
    updated_at=(SELECT created_at FROM orders WHERE id=NEW.order_id),
    updated_by='order:'||NEW.order_id, update_reason='Réservation commande'
    WHERE id=NEW.product_id AND NEW.reserved_stock=1;
END;

CREATE TRIGGER check_status_transition BEFORE UPDATE OF status ON orders
WHEN NEW.status != OLD.status BEGIN
  SELECT CASE WHEN NOT (
    (OLD.status='pending' AND NEW.status IN ('confirmed','cancelled')) OR
    (OLD.status='confirmed' AND NEW.status IN ('preparing','cancelled')) OR
    (OLD.status='preparing' AND NEW.status IN ('out_for_delivery','cancelled')) OR
    (OLD.status='out_for_delivery' AND NEW.status IN ('delivered','cancelled'))
  ) THEN RAISE(ABORT,'INVALID_STATUS_TRANSITION') END;
END;

CREATE TRIGGER release_stock AFTER UPDATE OF status ON orders
WHEN NEW.status='cancelled' AND OLD.status!='cancelled' BEGIN
  UPDATE products SET stock_milli=stock_milli+(
    SELECT quantity_milli FROM order_items WHERE order_id=NEW.id AND product_id=products.id
  ), version=version+1, updated_at=NEW.updated_at, updated_by=NEW.updated_by,
    update_reason='Annulation commande '||NEW.id
  WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.id AND reserved_stock=1);
END;

CREATE TRIGGER audit_order_insert AFTER INSERT ON orders BEGIN
  INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details)
  VALUES('order',NEW.id,'created',NEW.updated_by,NEW.created_at,json_object('status',NEW.status,'total_cents',NEW.total_cents));
END;
CREATE TRIGGER audit_order_status AFTER UPDATE OF status ON orders WHEN NEW.status!=OLD.status BEGIN
  INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details)
  VALUES('order',NEW.id,'status',NEW.updated_by,NEW.updated_at,json_object('from',OLD.status,'to',NEW.status));
END;
CREATE TRIGGER audit_product_insert AFTER INSERT ON products BEGIN
  INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details)
  VALUES('product',NEW.id,'created',NEW.updated_by,NEW.updated_at,json_object('price_cents',NEW.price_cents,'stock_milli',NEW.stock_milli));
END;
CREATE TRIGGER audit_product_update AFTER UPDATE ON products BEGIN
  INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details)
  VALUES('product',NEW.id,'updated',NEW.updated_by,NEW.updated_at,json_object(
    'old_price_cents',OLD.price_cents,'price_cents',NEW.price_cents,
    'old_stock_milli',OLD.stock_milli,'stock_milli',NEW.stock_milli,
    'old_track_stock',OLD.track_stock,'track_stock',NEW.track_stock,
    'old_active',OLD.active,'active',NEW.active,'reason',NEW.update_reason));
END;


CREATE INDEX orders_phone ON orders(phone,created_at DESC);
CREATE TABLE admin_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL DEFAULT 1,
 delivery_fee_cents INTEGER NOT NULL DEFAULT 2000 CHECK(delivery_fee_cents BETWEEN 0 AND 100000),
 free_threshold_cents INTEGER NOT NULL DEFAULT 20000 CHECK(free_threshold_cents BETWEEN 1 AND 100000000),
 zones TEXT NOT NULL DEFAULT '["Casablanca"]' CHECK(json_valid(zones)),
 updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
INSERT INTO admin_settings(id,updated_at,updated_by) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'migration');
CREATE TABLE product_costs (
 product_id TEXT PRIMARY KEY REFERENCES products(id), unit_cost_cents INTEGER CHECK(unit_cost_cents BETWEEN 0 AND 10000000),
 version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
CREATE TABLE order_item_costs (
 order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id),
 unit_cost_cents INTEGER NOT NULL CHECK(unit_cost_cents BETWEEN 0 AND 10000000), PRIMARY KEY(order_id,product_id)
);
CREATE TABLE order_operations (
 order_id TEXT PRIMARY KEY REFERENCES orders(id), version INTEGER NOT NULL DEFAULT 1,
 neighborhood TEXT NOT NULL DEFAULT '', courier TEXT NOT NULL DEFAULT '', internal_note TEXT NOT NULL DEFAULT '',
 goods_cost_cents INTEGER CHECK(goods_cost_cents BETWEEN 0 AND 100000000),
 delivery_cost_cents INTEGER CHECK(delivery_cost_cents BETWEEN 0 AND 100000000),
 updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
CREATE TABLE customer_notes (
 phone TEXT PRIMARY KEY, note TEXT NOT NULL CHECK(length(note)<=2000), version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
CREATE TABLE expenses (
 id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 spent_on TEXT NOT NULL, label TEXT NOT NULL CHECK(length(label) BETWEEN 2 AND 240),
 amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),
 created_at TEXT NOT NULL, actor TEXT NOT NULL
);
CREATE INDEX expenses_date ON expenses(spent_on);
CREATE TABLE notification_reads (
 owner TEXT NOT NULL, notification_id TEXT NOT NULL, read_at TEXT NOT NULL, PRIMARY KEY(owner,notification_id)
);
PRAGMA foreign_key_check;
-- V2 audit stays private and separate from public status history.
CREATE TRIGGER audit_v2_settings AFTER UPDATE ON admin_settings BEGIN
 INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details) VALUES('settings','shipping','updated',NEW.updated_by,NEW.updated_at,json_object('version',NEW.version,'fee',NEW.delivery_fee_cents,'threshold',NEW.free_threshold_cents,'zones',NEW.zones));
END;
CREATE TRIGGER audit_v2_cost_insert AFTER INSERT ON product_costs BEGIN
 INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details) VALUES('product_cost',NEW.product_id,'created',NEW.updated_by,NEW.updated_at,json_object('version',NEW.version,'unit_cost_cents',NEW.unit_cost_cents));
END;
CREATE TRIGGER audit_v2_cost_update AFTER UPDATE ON product_costs BEGIN
 INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details) VALUES('product_cost',NEW.product_id,'updated',NEW.updated_by,NEW.updated_at,json_object('version',NEW.version,'unit_cost_cents',NEW.unit_cost_cents));
END;
CREATE TRIGGER audit_v2_ops_insert AFTER INSERT ON order_operations BEGIN
 INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details) VALUES('order_operations',NEW.order_id,'created',NEW.updated_by,NEW.updated_at,json_object('version',NEW.version,'courier',NEW.courier,'neighborhood',NEW.neighborhood,'internal_note',NEW.internal_note,'goods_cost_cents',NEW.goods_cost_cents,'delivery_cost_cents',NEW.delivery_cost_cents));
END;
CREATE TRIGGER audit_v2_ops_update AFTER UPDATE ON order_operations BEGIN
 INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details) VALUES('order_operations',NEW.order_id,'updated',NEW.updated_by,NEW.updated_at,json_object('version',NEW.version,'courier',NEW.courier,'neighborhood',NEW.neighborhood,'internal_note',NEW.internal_note,'goods_cost_cents',NEW.goods_cost_cents,'delivery_cost_cents',NEW.delivery_cost_cents));
END;
CREATE TRIGGER audit_v2_customer_insert AFTER INSERT ON customer_notes BEGIN
 INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details) VALUES('customer_note',NEW.phone,'created',NEW.updated_by,NEW.updated_at,json_object('version',NEW.version));
END;
CREATE TRIGGER audit_v2_customer_update AFTER UPDATE ON customer_notes BEGIN
 INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details) VALUES('customer_note',NEW.phone,'updated',NEW.updated_by,NEW.updated_at,json_object('version',NEW.version));
END;
CREATE TRIGGER audit_v2_expense AFTER INSERT ON expenses BEGIN
 INSERT INTO audit_log(entity,entity_id,action,actor,created_at,details) VALUES('expense',NEW.id,'created',NEW.actor,NEW.created_at,json_object('amount_cents',NEW.amount_cents,'spent_on',NEW.spent_on));
END;
