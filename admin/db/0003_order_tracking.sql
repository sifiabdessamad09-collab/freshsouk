-- Additive only. Existing orders and private status history remain unchanged.
CREATE TABLE order_tracking (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  token_hash TEXT UNIQUE CHECK(token_hash IS NULL OR (length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  updated_by TEXT NOT NULL
);
