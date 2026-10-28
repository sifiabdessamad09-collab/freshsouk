PRAGMA foreign_keys = ON;

CREATE TABLE products (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 80),
  name_fr TEXT NOT NULL CHECK(length(name_fr) BETWEEN 1 AND 160),
  name_ar TEXT NOT NULL CHECK(length(name_ar) BETWEEN 1 AND 160),
  category TEXT NOT NULL CHECK(category IN ('legumes','fruits','packs')),
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

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  customer_name TEXT NOT NULL CHECK(length(customer_name) BETWEEN 2 AND 160),
  phone TEXT NOT NULL CHECK(length(phone) BETWEEN 10 AND 13),
  city TEXT NOT NULL CHECK(city = 'Casablanca'),
  address TEXT NOT NULL CHECK(length(address) BETWEEN 5 AND 500),
  delivery_slot TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 1000),
  subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents > 0),
  delivery_cents INTEGER NOT NULL CHECK(delivery_cents IN (0,2000)),
  total_cents INTEGER NOT NULL CHECK(total_cents = subtotal_cents + delivery_cents),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','preparing','out_for_delivery','delivered','cancelled')),
  source TEXT NOT NULL CHECK(source IN ('website','admin')),
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL
);
CREATE INDEX orders_date ON orders(created_at DESC);
CREATE INDEX orders_status_date ON orders(status, created_at DESC);

CREATE TABLE order_items (
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
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

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  details TEXT NOT NULL
);
CREATE INDEX audit_entity ON audit_log(entity, entity_id, id DESC);

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
