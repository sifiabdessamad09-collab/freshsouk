PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  neighborhood TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  items_json TEXT NOT NULL,
  subtotal REAL NOT NULL CHECK (subtotal >= 0),
  delivery_fee REAL NOT NULL CHECK (delivery_fee >= 0),
  discount REAL NOT NULL DEFAULT 0 CHECK (discount = 0),
  total REAL NOT NULL CHECK (total >= 0),
  delivery_slot TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'website' CHECK (source IN ('website','subscription')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','out_for_delivery','delivered','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  changed_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  neighborhood TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  pack_product_id TEXT NOT NULL,
  pack_quantity REAL NOT NULL CHECK (pack_quantity > 0 AND pack_quantity <= 20),
  frequency_weeks INTEGER NOT NULL CHECK (frequency_weeks IN (1,2)),
  delivery_weekday INTEGER NOT NULL CHECK (delivery_weekday BETWEEN 0 AND 6),
  delivery_slot TEXT NOT NULL,
  next_delivery_date TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_date ON subscriptions(status, next_delivery_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_phone ON subscriptions(phone);

CREATE TABLE IF NOT EXISTS subscription_reminders (
  id TEXT PRIMARY KEY NOT NULL,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  delivery_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','confirmed','skipped')),
  confirmed_order_id TEXT REFERENCES orders(id),
  UNIQUE(subscription_id, delivery_date)
);
CREATE INDEX IF NOT EXISTS idx_subscription_reminders_sub_date ON subscription_reminders(subscription_id, delivery_date DESC);

-- Loyalty is deliberately disabled until the owner approves the example rules.
CREATE TABLE IF NOT EXISTS loyalty_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  points_per_dh REAL NOT NULL DEFAULT 1,
  redemption_threshold INTEGER NOT NULL DEFAULT 500,
  reward_dh REAL NOT NULL DEFAULT 20,
  validity_days INTEGER NOT NULL DEFAULT 365,
  promotion_stacking TEXT NOT NULL DEFAULT 'owner_review_required',
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO loyalty_config (id,enabled,points_per_dh,redemption_threshold,reward_dh,validity_days,promotion_stacking,updated_at)
VALUES (1,0,1,500,20,365,'owner_review_required','2026-10-22T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  customer_phone TEXT NOT NULL UNIQUE,
  points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id),
  points_delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(order_id, reason)
);
