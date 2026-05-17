// routes/wishlist.js
const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/wishlist
router.get('/', authenticate, (req, res) => {
  const items = db.prepare(`
    SELECT w.id, w.created_at, p.id as product_id, p.name, p.price, p.image_emoji, p.category, p.rating, v.store_name as vendor
    FROM wishlist w
    JOIN products p ON w.product_id = p.id
    JOIN vendors v ON p.vendor_id = v.id
    WHERE w.user_id = ? AND p.is_active = 1
    ORDER BY w.created_at DESC
  `).all(req.user.id);
  res.json({ items });
});

// POST /api/wishlist/:product_id — Toggle
router.post('/:product_id', authenticate, (req, res) => {
  const { product_id } = req.params;
  const product = db.prepare('SELECT id, name FROM products WHERE id = ? AND is_active = 1').get(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const existing = db.prepare('SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?').get(req.user.id, product_id);
  if (existing) {
    db.prepare('DELETE FROM wishlist WHERE id = ?').run(existing.id);
    res.json({ wishlisted: false, message: `${product.name} removed from wishlist.` });
  } else {
    db.prepare('INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)').run(req.user.id, product_id);
    res.json({ wishlisted: true, message: `${product.name} saved to wishlist! ❤️` });
  }
});

// DELETE /api/wishlist/:product_id
router.delete('/:product_id', authenticate, (req, res) => {
  db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?').run(req.user.id, req.params.product_id);
  res.json({ message: 'Removed from wishlist.' });
});

module.exports = router;
