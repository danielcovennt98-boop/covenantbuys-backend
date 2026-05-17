// routes/orders.js — Order creation and management
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { initializePayment } = require('../utils/paystack');

const router = express.Router();

const COMMISSION = parseFloat(process.env.PLATFORM_COMMISSION || '5') / 100;

// ── POST /api/orders/initiate — Create order + get Paystack URL ───────────────
router.post('/initiate', authenticate, async (req, res) => {
  try {
    const { delivery_note } = req.body;

    // Fetch buyer's cart
    const cartItems = db.prepare(`
      SELECT c.quantity, p.id as product_id, p.name, p.price, p.stock, p.vendor_id, p.is_active,
             v.store_name as vendor_name, u.email as vendor_email
      FROM cart c
      JOIN products p ON c.product_id = p.id
      JOIN vendors v ON p.vendor_id = v.id
      JOIN users u ON v.user_id = u.id
      WHERE c.user_id = ? AND p.is_active = 1
    `).all(req.user.id);

    if (!cartItems.length) return res.status(400).json({ error: 'Your cart is empty.' });

    // Validate stock
    for (const item of cartItems) {
      if (item.quantity > item.stock) {
        return res.status(400).json({ error: `"${item.name}" only has ${item.stock} unit(s) left.` });
      }
    }

    // Calculate amounts
    const subtotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const platformFee = Math.round(subtotal * COMMISSION * 100) / 100;
    const totalAmount = subtotal; // buyer pays subtotal; platform fee is deducted from vendor payout

    const reference = `CB-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    // Get buyer info
    const buyer = db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.user.id);

    // Create order in DB (status: pending until payment confirmed)
    const orderResult = db.prepare(`
      INSERT INTO orders (reference, buyer_id, subtotal, platform_fee, total_amount, status, delivery_note)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(reference, req.user.id, subtotal, platformFee, totalAmount, delivery_note || null);

    const orderId = orderResult.lastInsertRowid;

    // Insert order items
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, vendor_id, name, quantity, unit_price, vendor_amount, platform_cut)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of cartItems) {
      const itemTotal = item.price * item.quantity;
      const platformCut = Math.round(itemTotal * COMMISSION * 100) / 100;
      const vendorAmount = itemTotal - platformCut;
      insertItem.run(orderId, item.product_id, item.vendor_id, item.name, item.quantity, item.price, vendorAmount, platformCut);
    }

    // Initialize Paystack transaction
    const paystackData = await initializePayment({
      email: buyer.email,
      amount: totalAmount,
      reference,
      callback_url: `${process.env.FRONTEND_URL}/payment-success.html?ref=${reference}`,
      metadata: {
        order_id: orderId,
        buyer_name: buyer.name,
        buyer_id: req.user.id,
        items_count: cartItems.length,
        custom_fields: [
          { display_name: 'Order Reference', variable_name: 'order_ref', value: reference },
          { display_name: 'Platform', variable_name: 'platform', value: 'CovenantBuys' },
        ],
      },
    });

    res.json({
      message: 'Order created. Proceed to payment.',
      order: { id: orderId, reference, subtotal, platform_fee: platformFee, total_amount: totalAmount },
      paystack: {
        authorization_url: paystackData.authorization_url,
        access_code: paystackData.access_code,
        reference: paystackData.reference,
        public_key: process.env.PAYSTACK_PUBLIC_KEY,
      },
    });
  } catch (err) {
    console.error('[Order initiate error]', err.message);
    res.status(500).json({ error: 'Could not initiate order. Please try again.' });
  }
});

// ── GET /api/orders — Buyer's order history ────────────────────────────────────
router.get('/', authenticate, (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const orders = db.prepare(`
    SELECT o.*,
           (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
    FROM orders o
    WHERE o.buyer_id = ?
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, parseInt(limit), offset);

  // Attach items to each order
  const result = orders.map(order => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    return { ...order, items };
  });

  const total = db.prepare('SELECT COUNT(*) as c FROM orders WHERE buyer_id = ?').get(req.user.id).c;
  res.json({ orders: result, total });
});

// ── GET /api/orders/:id ────────────────────────────────────────────────────────
router.get('/:id', authenticate, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ order: { ...order, items } });
});

// ── PATCH /api/orders/:id/status — Admin updates order status ─────────────────
router.patch('/:id/status', authenticate, requireRole('admin'), (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'paid', 'delivered', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: `Status must be one of: ${valid.join(', ')}` });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, order.id);
  res.json({ message: `Order status updated to '${status}'` });
});

module.exports = router;
