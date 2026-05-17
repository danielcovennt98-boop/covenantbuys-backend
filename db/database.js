// db/database.js — SQLite setup for CovenantBuys
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './db/covenantbuys.db';

// Ensure DB directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create all tables ─────────────────────────────────────────────────────────

db.exec(`

  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'buyer',   -- buyer | vendor | admin
    is_verified INTEGER NOT NULL DEFAULT 0,
    avatar      TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    store_name   TEXT    NOT NULL,
    description  TEXT,
    bank_name    TEXT,
    account_no   TEXT,
    account_name TEXT,
    is_approved  INTEGER NOT NULL DEFAULT 1,
    total_sales  REAL    NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id    INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    description  TEXT,
    category     TEXT    NOT NULL,
    price        REAL    NOT NULL,
    stock        INTEGER NOT NULL DEFAULT 1,
    image_emoji  TEXT    DEFAULT '📦',
    image_url    TEXT,
    tag          TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1,
    rating       REAL    NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cart (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity   INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    reference       TEXT    NOT NULL UNIQUE,
    buyer_id        INTEGER NOT NULL REFERENCES users(id),
    subtotal        REAL    NOT NULL,
    platform_fee    REAL    NOT NULL,
    total_amount    REAL    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending',  -- pending | paid | delivered | cancelled
    paystack_status TEXT,
    delivery_note   TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    paid_at         TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id    INTEGER NOT NULL REFERENCES products(id),
    vendor_id     INTEGER NOT NULL REFERENCES vendors(id),
    name          TEXT    NOT NULL,
    quantity      INTEGER NOT NULL,
    unit_price    REAL    NOT NULL,
    vendor_amount REAL    NOT NULL,
    platform_cut  REAL    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    buyer_id   INTEGER NOT NULL REFERENCES users(id),
    order_id   INTEGER NOT NULL REFERENCES orders(id),
    rating     INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(product_id, buyer_id)
  );

  CREATE TABLE IF NOT EXISTS wishlist (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id)
  );

`);

module.exports = db;
