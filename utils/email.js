// utils/email.js — Email sending via Nodemailer
const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
};

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.SMTP_PASS) {
    console.log(`[Email skipped — SMTP not configured] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || 'CovenantBuys <noreply@covenantbuys.ng>',
      to,
      subject,
      html,
    });
    console.log(`[Email sent] To: ${to} | Subject: ${subject}`);
  } catch (err) {
    console.error('[Email error]', err.message);
  }
};

// ── Email templates ────────────────────────────────────────────────────────────

const sendWelcomeEmail = (user) => sendEmail({
  to: user.email,
  subject: '🎉 Welcome to CovenantBuys!',
  html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0a1628;padding:32px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#f5a623;margin:0;font-size:28px;">CovenantBuys</h1>
        <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;">Veritas University Campus Marketplace</p>
      </div>
      <div style="background:#ffffff;padding:36px;border:1px solid #eef1f6;border-top:none;">
        <h2 style="color:#0a1628;">Welcome, ${user.name}! 👋</h2>
        <p style="color:#555;line-height:1.7;">Your account has been created successfully. You can now browse and purchase products from fellow Veritas students and vendors.</p>
        <div style="background:#fff8ec;border:1px solid #f5a623;border-radius:8px;padding:16px;margin:24px 0;">
          <strong style="color:#0a1628;">Your Account Details</strong><br>
          <span style="color:#555;">Email: ${user.email}</span><br>
          <span style="color:#555;">Role: ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}</span>
        </div>
        <a href="${process.env.FRONTEND_URL}" style="display:inline-block;background:#f5a623;color:#0a1628;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Start Shopping →</a>
      </div>
      <div style="background:#f5f5f5;padding:16px;text-align:center;border-radius:0 0 12px 12px;">
        <p style="color:#999;font-size:12px;margin:0;">© 2026 CovenantBuys · Veritas University Abuja</p>
      </div>
    </div>
  `,
});

const sendOrderConfirmation = (user, order, items) => {
  const itemRows = items.map(i => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #eef1f6;">${i.name}</td>
      <td style="padding:10px;border-bottom:1px solid #eef1f6;text-align:center;">${i.quantity}</td>
      <td style="padding:10px;border-bottom:1px solid #eef1f6;text-align:right;">₦${(i.unit_price * i.quantity).toLocaleString()}</td>
    </tr>
  `).join('');

  return sendEmail({
    to: user.email,
    subject: `✅ Order Confirmed — ${order.reference}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0a1628;padding:32px;text-align:center;border-radius:12px 12px 0 0;">
          <h1 style="color:#f5a623;margin:0;">CovenantBuys</h1>
        </div>
        <div style="background:#ffffff;padding:36px;border:1px solid #eef1f6;border-top:none;">
          <h2 style="color:#1db954;">Payment Confirmed ✅</h2>
          <p style="color:#555;">Hi ${user.name}, your order has been paid successfully!</p>
          <p style="color:#888;font-size:13px;">Reference: <strong>${order.reference}</strong></p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0;">
            <thead>
              <tr style="background:#f5f5f5;">
                <th style="padding:10px;text-align:left;font-size:12px;color:#888;">ITEM</th>
                <th style="padding:10px;text-align:center;font-size:12px;color:#888;">QTY</th>
                <th style="padding:10px;text-align:right;font-size:12px;color:#888;">AMOUNT</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
          <div style="text-align:right;padding-top:12px;border-top:2px solid #0a1628;">
            <strong style="font-size:18px;color:#0a1628;">Total: ₦${order.total_amount.toLocaleString()}</strong>
          </div>
        </div>
        <div style="background:#f5f5f5;padding:16px;text-align:center;border-radius:0 0 12px 12px;">
          <p style="color:#999;font-size:12px;margin:0;">© 2026 CovenantBuys · Veritas University Abuja</p>
        </div>
      </div>
    `,
  });
};

const sendVendorOrderAlert = (vendorEmail, vendorName, orderItems, orderRef) => sendEmail({
  to: vendorEmail,
  subject: `🛍️ New Order Received — ${orderRef}`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0a1628;padding:32px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#f5a623;margin:0;">CovenantBuys</h1>
      </div>
      <div style="background:#ffffff;padding:36px;">
        <h2 style="color:#0a1628;">New order, ${vendorName}! 🎉</h2>
        <p style="color:#555;">You have received a new order. Please fulfill it promptly.</p>
        <p style="color:#888;font-size:13px;">Order Ref: <strong>${orderRef}</strong></p>
        <ul style="color:#333;line-height:2;">
          ${orderItems.map(i => `<li>${i.name} × ${i.quantity} — ₦${(i.unit_price * i.quantity).toLocaleString()}</li>`).join('')}
        </ul>
        <p style="color:#555;">Your payout (95%): <strong>₦${orderItems.reduce((s, i) => s + i.vendor_amount, 0).toLocaleString()}</strong></p>
      </div>
      <div style="background:#f5f5f5;padding:16px;text-align:center;border-radius:0 0 12px 12px;">
        <p style="color:#999;font-size:12px;margin:0;">© 2026 CovenantBuys · Veritas University Abuja</p>
      </div>
    </div>
  `,
});

module.exports = { sendEmail, sendWelcomeEmail, sendOrderConfirmation, sendVendorOrderAlert };
