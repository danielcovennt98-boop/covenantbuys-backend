// routes/auth.js — Registration, login, profile
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../utils/email');

const router = express.Router();

const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

// ── POST /api/auth/register ────────────────────────────────────────────────────
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required')
      .custom(email => {
        // Allow any email for now; uncomment below to restrict to Veritas
        // if (!email.endsWith('@veritas.edu.ng')) throw new Error('Must use a Veritas University email (@veritas.edu.ng)');
        return true;
      }),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['buyer', 'vendor']).withMessage('Role must be buyer or vendor'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password, role = 'buyer', store_name } = req.body;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

    const passwordHash = bcrypt.hashSync(password, 10);

    const userResult = db.prepare(`
      INSERT INTO users (name, email, password, role, is_verified)
      VALUES (?, ?, ?, ?, 1)
    `).run(name, email.toLowerCase(), passwordHash, role);

    const userId = userResult.lastInsertRowid;

    // If vendor, create vendor profile
    if (role === 'vendor') {
      const sName = store_name || `${name}'s Store`;
      db.prepare(`
        INSERT INTO vendors (user_id, store_name, is_approved)
        VALUES (?, ?, 1)
      `).run(userId, sName);
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const token = signToken(user);

    // Send welcome email (non-blocking)
    sendWelcomeEmail(user).catch(console.error);

    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  }
);

// ── POST /api/auth/login ───────────────────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken(user);
    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  }
);

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  let vendor = null;
  if (user.role === 'vendor') {
    vendor = db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(user.id);
  }

  res.json({ user, vendor });
});

// ── PATCH /api/auth/me — Update profile ───────────────────────────────────────
router.patch('/me', authenticate, [
  body('name').optional().trim().notEmpty(),
  body('password').optional().isLength({ min: 6 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, password } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (password) updates.password = bcrypt.hashSync(password, 10);

  if (Object.keys(updates).length === 0) return res.json({ message: 'Nothing to update.' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), req.user.id);

  res.json({ message: 'Profile updated successfully.' });
});

module.exports = router;
