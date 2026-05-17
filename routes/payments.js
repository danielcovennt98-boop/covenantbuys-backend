// routes/payments.js — Paystack webhook handler + verification
const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { verifyPayment } = require('../utils/paystack');
const { sendOrderConfirmation, sendVendorOrderAlert } = require('../utils/email');

const router = express.Router();

// ── POST /api/payments/webhook — Paystack calls this after payment ─────────────
// IMPORTANT: This route needs raw body (not JSON-parsed) for signature verification.
// Must be registered BEFORE express.json() middleware in server.js.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Verify webhook signature
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
  const signature = req.headers['x-paystack-signature'];

  if (hash !== signature) {
    console.warn('[Webhook] Invalid signature — rejected');
    return res.sendStatus(400);
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.sendStatus(400);
  }

  console.log(`[Webhook] Event: ${event.event}`);

  if (event.event === 'charge.success') {
    const { reference, status, amount } = event.data;

    // Find the pending order
    const order = db.prepare("SELECT * FROM orders WHERE reference = ? AND status = 'pending'").get(reference);
    if (!order) {
      console.log(`[Webhook] Order not found or already processed: ${reference}`);
      return res.sendStatus(200); // acknowledge
    }

    // Double-verify with Paystack API
    try {
      const verified = await verifyPayment(reference);
      if (verified.status !== 'success') {
        console.warn(`[Webhook] Payment not confirmed by Paystack: ${reference}`);
        return res.sendStatus(200);
      }

      // Mark order as paid
      db.prepare(`
        UPDATE orders SET status = 'paid', paystack_status = 'success', paid_at = datetime('now')
        WHERE id = ?
      `).run(order.id);

      // Deduct stock
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      const deductStock = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?');
      for (const item of items) {
        deductStock.run(item.quantity, item.product_id);
      }

      // Clear buyer's cart
      db.prepare('DELETE FROM cart WHERE user_id = ?').run(order.buyer_id);

      // Update vendor total_sales
      const vendorSales = {};
      for (const item of items) {
        vendorSales[item.vendor_id] = (vendorSales[item.vendor_id] || 0) + item.vendor_amount;
      }
      const updateVendorSales = db.prepare('UPDATE vendors SET total_sales = total_sales + ? WHERE id = ?');
      for (const [vid, amount] of Object.entries(vendorSales)) {
        updateVendorSales.run(amount, vid);
      }

      console.log(`[Webhook] ✅ Order ${reference} marked as PAID`);

      // Send confirmation emails (non-blocking)
      try {
        const buyer = db.prepare('SELECT name, email FROM users WHERE id = ?').get(order.buyer_id);
        await sendOrderConfirmation(buyer, order, items);

        // Group items by vendor and send alerts
        const byVendor = {};
        for (const item of items) {
          if (!byVendor[item.vendor_id]) byVendor[item.vendor_id] = [];
          byVendor[item.vendor_id].push(item);
        }
        for (const [vid, vItems] of Object.entries(byVendor)) {
          const vendor = db.prepare(`
            SELECT u.email, v.store_name FROM vendors v JOIN users u ON v.user_id = u.id WHERE v.id = ?
          `).get(vid);
          if (vendor) await sendVendorOrderAlert(vendor.email, vendor.store_name, vItems, reference);
        }
      } catch (emailErr) {
        console.error('[Webhook] Email error:', emailErr.message);
      }

    } catch (verifyErr) {
      console.error('[Webhook] Verify error:', verifyErr.message);
    }
  }

  res.sendStatus(200); // Always acknowledge to Paystack
});

// ── GET /api/payments/verify/:reference — Frontend verifies payment ────────────
router.get('/verify/:reference', async (req, res) => {
  const { reference } = req.params;

  try {
    const data = await verifyPayment(reference);

    if (data.status !== 'success') {
      return res.json({ paid: false, message: 'Payment not completed yet.', status: data.status });
    }

    // Update order in DB (in case webhook hasn't fired yet)
    const order = db.prepare("SELECT * FROM orders WHERE reference = ?").get(reference);
    if (order && order.status === 'pending') {
      db.prepare(`UPDATE orders SET status = 'paid', paystack_status = 'success', paid_at = datetime('now') WHERE reference = ?`).run(reference);

      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      const deductStock = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?');
      for (const item of items) deductStock.run(item.quantity, item.product_id);
      db.prepare('DELETE FROM cart WHERE user_id = ?').run(order.buyer_id);
    }

    const finalOrder = db.prepare("SELECT * FROM orders WHERE reference = ?").get(reference);
    res.json({
      paid: true,
      message: 'Payment verified successfully!',
      order: finalOrder,
      paystack: {
        amount: data.amount / 100,
        paid_at: data.paid_at,
        channel: data.channel,
        currency: data.currency,
      },
    });
  } catch (err) {
    console.error('[Verify error]', err.message);
    res.status(500).json({ error: 'Could not verify payment. Please contact support.' });
  }
});

module.exports = router;
