// db/seed.js — Seeds admin account + sample products
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./database');

console.log('🌱 Seeding CovenantBuys database...\n');

// ── 1. Admin user ──────────────────────────────────────────────────────────────
const adminEmail = process.env.ADMIN_EMAIL || 'danielcovennt98@gmail.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@Covenant2026';

const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);

if (!existingAdmin) {
  const hash = bcrypt.hashSync(adminPassword, 10);
  const result = db.prepare(`
    INSERT INTO users (name, email, password, role, is_verified)
    VALUES (?, ?, ?, 'admin', 1)
  `).run(process.env.ADMIN_NAME || 'Daniel Ojimaojo', adminEmail, hash);
  console.log(`✅ Admin created: ${adminEmail} (id: ${result.lastInsertRowid})`);
} else {
  console.log(`ℹ️  Admin already exists: ${adminEmail}`);
}

// ── 2. Demo vendor account ─────────────────────────────────────────────────────
let demoVendorUserId;
const demoVendorEmail = 'bookhub@veritas.edu.ng';
const existingVendor = db.prepare('SELECT id FROM users WHERE email = ?').get(demoVendorEmail);

if (!existingVendor) {
  const hash = bcrypt.hashSync('Vendor@123', 10);
  const r = db.prepare(`
    INSERT INTO users (name, email, password, role, is_verified)
    VALUES ('BookHub Veritas', ?, ?, 'vendor', 1)
  `).run(demoVendorEmail, hash);
  demoVendorUserId = r.lastInsertRowid;
  db.prepare(`
    INSERT INTO vendors (user_id, store_name, description, is_approved)
    VALUES (?, 'BookHub Veritas', 'Your #1 source for academic textbooks on campus', 1)
  `).run(demoVendorUserId);
  console.log('✅ Demo vendor created: BookHub Veritas');
} else {
  demoVendorUserId = existingVendor.id;
  console.log('ℹ️  Demo vendor already exists');
}

// ── 3. Second demo vendor ──────────────────────────────────────────────────────
let vendor2Id;
const vendor2Email = 'mamachef@veritas.edu.ng';
const existingV2 = db.prepare('SELECT id FROM users WHERE email = ?').get(vendor2Email);

if (!existingV2) {
  const hash = bcrypt.hashSync('Vendor@123', 10);
  const r = db.prepare(`
    INSERT INTO users (name, email, password, role, is_verified)
    VALUES ('MamaChef Campus', ?, ?, 'vendor', 1)
  `).run(vendor2Email, hash);
  vendor2Id = r.lastInsertRowid;
  db.prepare(`
    INSERT INTO vendors (user_id, store_name, description, is_approved)
    VALUES (?, 'MamaChef Campus', 'Hot campus meals delivered fresh daily', 1)
  `).run(vendor2Id);
  console.log('✅ Demo vendor created: MamaChef Campus');
} else {
  vendor2Id = existingV2.id;
}

// Get vendor DB IDs
const vendor1 = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(demoVendorUserId);
const vendor2 = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(vendor2Id);

// ── 4. Sample products ─────────────────────────────────────────────────────────
const products = [
  { vendor_id: vendor1?.id, name: 'Engineering Mathematics Textbook', description: 'Stroud Engineering Mathematics 7th Edition — essential for 100-400L Engineering students.', category: 'books', price: 4500, stock: 8, image_emoji: '📐', tag: 'Bestseller' },
  { vendor_id: vendor1?.id, name: 'Data Structures & Algorithms Notes', description: 'Comprehensive handwritten and typed notes covering all DSA topics for Computer Engineering.', category: 'books', price: 1500, stock: 20, image_emoji: '📒', tag: null },
  { vendor_id: vendor1?.id, name: 'Calculus for Engineers (2nd Ed.)', description: 'Complete calculus textbook covering differentiation, integration, and multivariable calculus.', category: 'books', price: 3200, stock: 5, image_emoji: '📗', tag: null },
  { vendor_id: vendor2?.id, name: 'Jollof Rice + Chicken Combo', description: 'Smoky party jollof rice with a full chicken piece and coleslaw. Made fresh every afternoon.', category: 'food', price: 900, stock: 30, image_emoji: '🍱', tag: 'Hot 🔥' },
  { vendor_id: vendor2?.id, name: 'Shawarma Wrap (Large)', description: 'Loaded chicken shawarma with cabbage, carrots, mayo and special sauce in a soft tortilla.', category: 'food', price: 700, stock: 25, image_emoji: '🌯', tag: null },
  { vendor_id: vendor1?.id, name: 'Laptop Cooling Pad (USB)', description: 'Quiet dual-fan cooling pad compatible with 14-17 inch laptops. USB powered.', category: 'electronics', price: 6500, stock: 10, image_emoji: '💻', tag: null },
  { vendor_id: vendor1?.id, name: 'Type-C Fast Charger Cable 2m', description: '65W fast charging USB-C cable, 2 metres long, braided for durability.', category: 'electronics', price: 2200, stock: 15, image_emoji: '🔌', tag: null },
  { vendor_id: vendor1?.id, name: 'Veritas Branded Hoodie', description: 'Official Veritas University Abuja hoodie — navy blue with gold embroidery. Sizes S-XL.', category: 'clothing', price: 8000, stock: 12, image_emoji: '👕', tag: 'New' },
  { vendor_id: vendor2?.id, name: 'Assignment Typing & Printing', description: 'Professional typing and colour/b&w printing service. Per-page pricing. Same day delivery.', category: 'services', price: 200, stock: 999, image_emoji: '🖨️', tag: 'Popular' },
  { vendor_id: vendor1?.id, name: 'Stationery Bundle Pack', description: 'Includes 2 ballpens, 1 highlighter, sticky notes, and a mini notebook.', category: 'stationery', price: 650, stock: 40, image_emoji: '✏️', tag: null },
  { vendor_id: vendor2?.id, name: 'C++ Programming Tutorial (4 weeks)', description: 'One-on-one or group C++ tutoring sessions with a 400L Computer Engineering student.', category: 'services', price: 5000, stock: 5, image_emoji: '🖥️', tag: 'New' },
  { vendor_id: vendor1?.id, name: 'Custom Sneakers (Unisex)', description: 'Hand-painted custom sneakers — send us your design or choose from our catalogue.', category: 'clothing', price: 12000, stock: 3, image_emoji: '👟', tag: 'Trending' },
];

const insertProduct = db.prepare(`
  INSERT OR IGNORE INTO products (vendor_id, name, description, category, price, stock, image_emoji, tag, rating, review_count)
  VALUES (@vendor_id, @name, @description, @category, @price, @stock, @image_emoji, @tag, @rating, @review_count)
`);

let productCount = 0;
for (const p of products) {
  if (!p.vendor_id) continue;
  const exists = db.prepare('SELECT id FROM products WHERE name = ?').get(p.name);
  if (!exists) {
    insertProduct.run({ ...p, rating: (3.5 + Math.random() * 1.5).toFixed(1), review_count: Math.floor(Math.random() * 60) + 5 });
    productCount++;
  }
}

console.log(`✅ ${productCount} products seeded`);
console.log('\n🎉 Seeding complete!\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Admin login:');
console.log(`  Email:    ${adminEmail}`);
console.log(`  Password: ${adminPassword}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
