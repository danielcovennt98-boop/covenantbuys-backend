// routes/products.js — Public product browsing + vendor product management
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../db/database');
const { authenticate, requireRole, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/products — List / search products ─────────────────────────────────
router.get('/', optionalAuth, (req, res) => {
  const { category, q, sort = 'created_at', order = 'desc', page = 1, limit = 20 } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conditions = ['p.is_active = 1'];
  const params = [];

  if (category && category !== 'all') {
    conditions.push('p.category = ?');
    params.push(category);
  }
  if (q) {
    conditions.push('(p.name LIKE ? OR p.description LIKE ? OR p.category LIKE ?)');
    const sq = `%${q}%`;
    params.push(sq, sq, sq);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const validSorts = { price: 'p.price', rating: 'p.rating', created_at: 'p.created_at', name: 'p.name' };
  const sortCol = validSorts[sort] || 'p.created_at';
  const sortDir = order === 'asc' ? 'ASC' : 'DESC';

  const total = db.prepare(`SELECT COUNT(*) as c FROM products p ${where}`).get(...params).c;
  const products = db.prepare(`
    SELECT p.*, v.store_name as vendor_name, v.is_approved as vendor_verified
    FROM products p
    JOIN vendors v ON p.vendor_id = v.id
    ${where}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({ products, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// ── GET /api/products/:id — Single product ─────────────────────────────────────
router.get('/:id', (req, res) => {
  const product = db.prepare(`
    SELECT p.*, v.store_name as vendor_name, v.is_approved as vendor_verified, v.description as vendor_desc
    FROM products p
    JOIN vendors v ON p.vendor_id = v.id
    WHERE p.id = ? AND p.is_active = 1
  `).get(req.params.id);

  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const reviews = db.prepare(`
    SELECT r.*, u.name as buyer_name
    FROM reviews r
    JOIN users u ON r.buyer_id = u.id
    WHERE r.product_id = ?
    ORDER BY r.created_at DESC
    LIMIT 10
  `).all(product.id);

  res.json({ product, reviews });
});

// ── GET /api/products/categories/list — All categories ───────────────────────
router.get('/categories/list', (req, res) => {
  const cats = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM products WHERE is_active = 1
    GROUP BY category ORDER BY count DESC
  `).all();
  res.json({ categories: cats });
});

// ── POST /api/products — Vendor creates product ───────────────────────────────
router.post('/', authenticate, requireRole('vendor', 'admin'), [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('price').isFloat({ min: 1 }).withMessage('Valid price is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('stock').optional().isInt({ min: 0 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  // Get vendor record
  const vendor = db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(req.user.id);
  if (!vendor) return res.status(403).json({ error: 'Vendor profile not found.' });
  if (!vendor.is_approved) return res.status(403).json({ error: 'Your vendor account is pending approval.' });

  const { name, description, category, price, stock = 1, image_emoji = '📦', tag } = req.body;

  const result = db.prepare(`
    INSERT INTO products (vendor_id, name, description, category, price, stock, image_emoji, tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(vendor.id, name, description, category, price, stock, image_emoji, tag || null);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'Product created!', product });
});

// ── PUT /api/products/:id — Vendor updates own product ────────────────────────
router.put('/:id', authenticate, requireRole('vendor', 'admin'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  // Check ownership (admin can edit any)
  if (req.user.role !== 'admin') {
    const vendor = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(req.user.id);
    if (!vendor || product.vendor_id !== vendor.id) {
      return res.status(403).json({ error: 'You can only edit your own products.' });
    }
  }

  const allowed = ['name', 'description', 'category', 'price', 'stock', 'image_emoji', 'tag', 'is_active'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) return res.json({ message: 'Nothing to update.' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE products SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), product.id);

  res.json({ message: 'Product updated.', product: db.prepare('SELECT * FROM products WHERE id = ?').get(product.id) });
});

// ── DELETE /api/products/:id — Vendor deletes own product ────────────────────
router.delete('/:id', authenticate, requireRole('vendor', 'admin'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  if (req.user.role !== 'admin') {
    const vendor = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(req.user.id);
    if (!vendor || product.vendor_id !== vendor.id) {
      return res.status(403).json({ error: 'You can only delete your own products.' });
    }
  }

  // Soft delete
  db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(product.id);
  res.json({ message: 'Product removed from marketplace.' });
});

// ── POST /api/products/:id/review ─────────────────────────────────────────────
router.post('/:id/review', authenticate, [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('comment').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  // Check buyer has actually purchased this product
  const hasPurchased = db.prepare(`
    SELECT oi.id FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.product_id = ? AND o.buyer_id = ? AND o.status = 'paid'
  `).get(product.id, req.user.id);

  if (!hasPurchased) {
    return res.status(403).json({ error: 'You can only review products you have purchased.' });
  }

  const existing = db.prepare('SELECT id FROM reviews WHERE product_id = ? AND buyer_id = ?').get(product.id, req.user.id);
  if (existing) return res.status(409).json({ error: 'You have already reviewed this product.' });

  const { rating, comment, order_id } = req.body;

  db.prepare(`
    INSERT INTO reviews (product_id, buyer_id, order_id, rating, comment)
    VALUES (?, ?, ?, ?, ?)
  `).run(product.id, req.user.id, order_id || hasPurchased.id, rating, comment || null);

  // Update product rating
  const stats = db.prepare(`
    SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE product_id = ?
  `).get(product.id);
  db.prepare('UPDATE products SET rating = ?, review_count = ? WHERE id = ?')
    .run(Math.round(stats.avg * 10) / 10, stats.cnt, product.id);

  res.status(201).json({ message: 'Review submitted! Thank you.' });
});

module.exports = router;
