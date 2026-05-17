// routes/admin.js — Admin-only platform management
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { verifyPayment, listTransactions } = require('../utils/paystack');

const router = express.Router();

// ── GET /api/admin/dashboard ───────────────────────────────────────────────────
router.get('/dashboard', authenticate, requireRole('admin'), (req, res) => {
  const totalUsers    = db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'admin'").get().c;
  const totalVendors  = db.prepare('SELECT COUNT(*) as c FROM vendors').get().c;
  const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products WHERE is_active = 1').get().c;
  const totalOrders   = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'paid'").get().c;
  const totalRevenue  = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as t FROM orders WHERE status = 'paid'").get().t;
  const platformEarnings = db.prepare("SELECT COALESCE(SUM(platform_fee), 0) as t FROM orders WHERE status = 'paid'").get().t;
  const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'").get().c;

  const recentOrders = db.prepare(`
    SELECT o.*, u.name as buyer_name, u.email as buyer_email
    FROM orders o JOIN users u ON o.buyer_id = u.id
    ORDER BY o.created_at DESC LIMIT 10
  `).all();

  const recentUsers = db.prepare(`
    SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 10
  `).all();

  res.json({
    stats: { totalUsers, totalVendors, totalProducts, totalOrders, totalRevenue, platformEarnings, pendingOrders },
    recentOrders,
    recentUsers,
  });
});

// ── GET /api/admin/users ───────────────────────────────────────────────────────
router.get('/users', authenticate, requireRole('admin'), (req, res) => {
  const { page = 1, limit = 20, role, q } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conds = [], params = [];
  if (role) { conds.push('role = ?'); params.push(role); }
  if (q) { conds.push('(name LIKE ? OR email LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const users = db.prepare(`SELECT id, name, email, role, is_verified, created_at FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM users ${where}`).get(...params).c;
  res.json({ users, total });
});

// ── PATCH /api/admin/users/:id — Ban / change role ────────────────────────────
router.patch('/users/:id', authenticate, requireRole('admin'), (req, res) => {
  const { role, is_verified } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
  if (is_verified !== undefined) db.prepare('UPDATE users SET is_verified = ? WHERE id = ?').run(is_verified ? 1 : 0, user.id);
  res.json({ message: 'User updated.' });
});

// ── GET /api/admin/orders ──────────────────────────────────────────────────────
router.get('/orders', authenticate, requireRole('admin'), (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const where = status ? 'WHERE o.status = ?' : '';
  const params = status ? [status] : [];
  const orders = db.prepare(`
    SELECT o.*, u.name as buyer_name, u.email as buyer_email
    FROM orders o JOIN users u ON o.buyer_id = u.id
    ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM orders o ${where}`).get(...params).c;
  res.json({ orders, total });
});

// ── GET /api/admin/vendors ─────────────────────────────────────────────────────
router.get('/vendors', authenticate, requireRole('admin'), (req, res) => {
  const vendors = db.prepare(`
    SELECT v.*, u.name, u.email,
      (SELECT COUNT(*) FROM products p WHERE p.vendor_id = v.id AND p.is_active = 1) as product_count
    FROM vendors v JOIN users u ON v.user_id = u.id
    ORDER BY v.created_at DESC
  `).all();
  res.json({ vendors });
});

// ── PATCH /api/admin/vendors/:id/approve ──────────────────────────────────────
router.patch('/vendors/:id/approve', authenticate, requireRole('admin'), (req, res) => {
  const { approved } = req.body;
  db.prepare('UPDATE vendors SET is_approved = ? WHERE id = ?').run(approved ? 1 : 0, req.params.id);
  res.json({ message: `Vendor ${approved ? 'approved' : 'suspended'}.` });
});

// ── GET /api/admin/paystack/transactions ──────────────────────────────────────
router.get('/paystack/transactions', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const data = await listTransactions({ page: req.query.page || 1 });
    res.json({ transactions: data });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch Paystack transactions.' });
  }
});

module.exports = router;
