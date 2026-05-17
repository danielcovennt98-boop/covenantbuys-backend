// routes/vendor.js — Vendor dashboard: products, orders, earnings, profile
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Helper: get vendor from logged-in user
const getVendor = (userId) => db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(userId);

// ── GET /api/vendor/dashboard — Summary stats ─────────────────────────────────
router.get('/dashboard', authenticate, requireRole('vendor', 'admin'), (req, res) => {
  const vendor = getVendor(req.user.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor profile not found.' });

  const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products WHERE vendor_id = ? AND is_active = 1').get(vendor.id).c;
  const totalOrders = db.prepare("SELECT COUNT(*) as c FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.vendor_id = ? AND o.status = 'paid'").get(vendor.id).c;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(oi.vendor_amount), 0) as total FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.vendor_id = ? AND o.status = 'paid'").get(vendor.id).total;
  const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.vendor_id = ? AND o.status = 'pending'").get(vendor.id).c;

  // Recent orders (last 5)
  const recentOrders = db.prepare(`
    SELECT o.reference, o.created_at, o.status, oi.name, oi.quantity, oi.vendor_amount
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.vendor_id = ?
    ORDER BY o.created_at DESC
    LIMIT 5
  `).all(vendor.id);

  // Top products
  const topProducts = db.prepare(`
    SELECT p.name, p.price, p.stock, p.rating, p.review_count,
           COALESCE(SUM(oi.quantity), 0) as units_sold
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    WHERE p.vendor_id = ? AND p.is_active = 1
    GROUP BY p.id
    ORDER BY units_sold DESC
    LIMIT 5
  `).all(vendor.id);

  res.json({
    vendor: {
      id: vendor.id,
      store_name: vendor.store_name,
      description: vendor.description,
      is_approved: vendor.is_approved,
      total_sales: vendor.total_sales,
      created_at: vendor.created_at,
    },
    stats: { total_products: totalProducts, total_orders: totalOrders, total_revenue: totalRevenue, pending_orders: pendingOrders },
    recent_orders: recentOrders,
    top_products: topProducts,
  });
});

// ── GET /api/vendor/products — Vendor's own products ─────────────────────────
router.get('/products', authenticate, requireRole('vendor', 'admin'), (req, res) => {
  const vendor = getVendor(req.user.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor profile not found.' });

  const products = db.prepare(`
    SELECT p.*,
           COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.product_id = p.id AND o.status = 'paid'), 0) as units_sold
    FROM products p
    WHERE p.vendor_id = ?
    ORDER BY p.created_at DESC
  `).all(vendor.id);

  res.json({ products });
});

// ── GET /api/vendor/orders — Orders containing vendor's products ───────────────
router.get('/orders', authenticate, requireRole('vendor', 'admin'), (req, res) => {
  const vendor = getVendor(req.user.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor profile not found.' });

  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = 'WHERE oi.vendor_id = ?';
  const params = [vendor.id];
  if (status) { where += ' AND o.status = ?'; params.push(status); }

  const orders = db.prepare(`
    SELECT o.id, o.reference, o.status, o.created_at, o.paid_at, o.delivery_note,
           u.name as buyer_name, u.email as buyer_email,
           oi.name as product_name, oi.quantity, oi.unit_price, oi.vendor_amount, oi.platform_cut
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN users u ON o.buyer_id = u.id
    ${where}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM order_items oi JOIN orders o ON oi.order_id = o.id ${where}`).get(...params).c;

  res.json({ orders, total });
});

// ── GET /api/vendor/earnings — Earnings breakdown ─────────────────────────────
router.get('/earnings', authenticate, requireRole('vendor', 'admin'), (req, res) => {
  const vendor = getVendor(req.user.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor profile not found.' });

  const total = db.prepare(`
    SELECT COALESCE(SUM(oi.vendor_amount), 0) as earned, COALESCE(SUM(oi.platform_cut), 0) as platform_cut
    FROM order_items oi JOIN orders o ON oi.order_id = o.id
    WHERE oi.vendor_id = ? AND o.status = 'paid'
  `).get(vendor.id);

  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', o.created_at) as month,
           SUM(oi.vendor_amount) as earned,
           COUNT(DISTINCT o.id) as orders
    FROM order_items oi JOIN orders o ON oi.order_id = o.id
    WHERE oi.vendor_id = ? AND o.status = 'paid'
    GROUP BY month ORDER BY month DESC LIMIT 12
  `).all(vendor.id);

  res.json({ total_earned: total.earned, total_platform_cut: total.platform_cut, monthly });
});

// ── PATCH /api/vendor/profile — Update store profile ─────────────────────────
router.patch('/profile', authenticate, requireRole('vendor', 'admin'), (req, res) => {
  const vendor = getVendor(req.user.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor profile not found.' });

  const { store_name, description, bank_name, account_no, account_name } = req.body;
  const updates = {};
  if (store_name) updates.store_name = store_name;
  if (description !== undefined) updates.description = description;
  if (bank_name) updates.bank_name = bank_name;
  if (account_no) updates.account_no = account_no;
  if (account_name) updates.account_name = account_name;

  if (!Object.keys(updates).length) return res.json({ message: 'Nothing to update.' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE vendors SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), vendor.id);

  res.json({ message: 'Store profile updated.', vendor: db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendor.id) });
});

module.exports = router;
