// routes/cart.js — Persistent server-side cart
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/cart ─────────────────────────────────────────────────────────────
router.get('/', authenticate, (req, res) => {
  const items = db.prepare(`
    SELECT c.id, c.quantity, c.product_id,
           p.name, p.price, p.image_emoji, p.stock, p.category,
           v.store_name as vendor
    FROM cart c
    JOIN products p ON c.product_id = p.id
    JOIN vendors v ON p.vendor_id = v.id
    WHERE c.user_id = ? AND p.is_active = 1
    ORDER BY c.created_at DESC
  `).all(req.user.id);

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  res.json({ items, subtotal, count: items.reduce((s, i) => s + i.quantity, 0) });
});

// ── POST /api/cart — Add item ─────────────────────────────────────────────────
router.post('/', authenticate, [
  body('product_id').isInt({ min: 1 }).withMessage('Valid product_id required'),
  body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be ≥ 1'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { product_id, quantity = 1 } = req.body;

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found or unavailable.' });
  if (product.stock < 1) return res.status(400).json({ error: 'Product is out of stock.' });

  const existing = db.prepare('SELECT * FROM cart WHERE user_id = ? AND product_id = ?').get(req.user.id, product_id);

  if (existing) {
    const newQty = existing.quantity + quantity;
    if (newQty > product.stock) {
      return res.status(400).json({ error: `Only ${product.stock} units available.` });
    }
    db.prepare('UPDATE cart SET quantity = ? WHERE id = ?').run(newQty, existing.id);
  } else {
    if (quantity > product.stock) {
      return res.status(400).json({ error: `Only ${product.stock} units available.` });
    }
    db.prepare('INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)').run(req.user.id, product_id, quantity);
  }

  res.json({ message: `${product.name} added to cart!` });
});

// ── PATCH /api/cart/:id — Update quantity ─────────────────────────────────────
router.patch('/:id', authenticate, [
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be ≥ 1'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const item = db.prepare('SELECT * FROM cart WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Cart item not found.' });

  const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
  if (req.body.quantity > product.stock) {
    return res.status(400).json({ error: `Only ${product.stock} units available.` });
  }

  db.prepare('UPDATE cart SET quantity = ? WHERE id = ?').run(req.body.quantity, item.id);
  res.json({ message: 'Cart updated.' });
});

// ── DELETE /api/cart/:id — Remove item ────────────────────────────────────────
router.delete('/:id', authenticate, (req, res) => {
  const item = db.prepare('SELECT * FROM cart WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Cart item not found.' });
  db.prepare('DELETE FROM cart WHERE id = ?').run(item.id);
  res.json({ message: 'Item removed from cart.' });
});

// ── DELETE /api/cart — Clear entire cart ─────────────────────────────────────
router.delete('/', authenticate, (req, res) => {
  db.prepare('DELETE FROM cart WHERE user_id = ?').run(req.user.id);
  res.json({ message: 'Cart cleared.' });
});

module.exports = router;
