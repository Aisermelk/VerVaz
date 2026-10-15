-- Atelier (VeroVaz / Alquimia) — esquema D1. Rode:
--   npx wrangler d1 execute v8adminuniversal-db --remote --file=worker/schema.sql
-- Todas as tabelas têm prefixo atelier_ e coluna tenant (multi-loja).

CREATE TABLE IF NOT EXISTS atelier_settings (
  tenant TEXT PRIMARY KEY,
  data   TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS atelier_products (
  id            TEXT PRIMARY KEY,
  tenant        TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  price_cents   INTEGER,                      -- NULL = "preço a cadastrar"
  stock         INTEGER NOT NULL DEFAULT 0,
  category_name TEXT NOT NULL DEFAULT '',
  image_url     TEXT NOT NULL DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1,
  kind          TEXT NOT NULL DEFAULT 'decoration', -- tile | fixed | decoration
  size_id       TEXT,                         -- só para kind=tile (10x20, 15x20, 20x30)
  meta          TEXT NOT NULL DEFAULT '{}',   -- print, gallery, material, finish, color, care, productionDays...
  weight_g      INTEGER,
  width_cm      REAL,
  height_cm     REAL,
  length_cm     REAL,
  sort          INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_atelier_products_tenant ON atelier_products(tenant, active);

CREATE TABLE IF NOT EXISTS atelier_sessions (
  id         TEXT PRIMARY KEY,
  tenant     TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  revision   INTEGER NOT NULL DEFAULT 0,
  items      TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_atelier_sessions_exp ON atelier_sessions(expires_at);

CREATE TABLE IF NOT EXISTS atelier_artworks (
  id           TEXT PRIMARY KEY,
  tenant       TEXT NOT NULL,
  session_id   TEXT NOT NULL,
  order_id     TEXT,
  r2_key       TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_atelier_artworks_session ON atelier_artworks(session_id);

CREATE TABLE IF NOT EXISTS atelier_quotes (
  id           TEXT PRIMARY KEY,
  tenant       TEXT NOT NULL,
  postal_code  TEXT NOT NULL,
  fingerprint  TEXT NOT NULL,
  options      TEXT NOT NULL,
  production_days INTEGER NOT NULL DEFAULT 0,
  expires_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS atelier_orders (
  id             TEXT PRIMARY KEY,
  tenant         TEXT NOT NULL,
  session_id     TEXT NOT NULL,
  revision       INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',   -- pending|paid|production|shipped|delivered|payment_review|cancelled
  payment_status TEXT NOT NULL DEFAULT 'pending',
  subtotal_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL,
  total_cents    INTEGER NOT NULL,
  shipping       TEXT NOT NULL,                      -- JSON do serviço escolhido
  address        TEXT NOT NULL,                      -- JSON
  customer_name  TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  tracking_code  TEXT,
  checkout_url   TEXT,
  mp_payment_id  TEXT,
  stock_applied  INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE(session_id, revision)
);
CREATE INDEX IF NOT EXISTS idx_atelier_orders_tenant ON atelier_orders(tenant, created_at);

CREATE TABLE IF NOT EXISTS atelier_order_items (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL,
  product_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  unit_cents INTEGER NOT NULL,
  quantity   INTEGER NOT NULL,
  art        TEXT
);
CREATE INDEX IF NOT EXISTS idx_atelier_items_order ON atelier_order_items(order_id);
