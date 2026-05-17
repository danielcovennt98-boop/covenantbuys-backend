# CovenantBuys — Backend API
**Veritas University Abuja Campus Marketplace**
*Final Year Project 2026 — Daniel Covenant Ojimaojo (VUG/CEG/21/5337)*

---

## 🗂 Project Structure

```
covenantbuys-backend/
├── server.js              ← Express app entry point
├── package.json
├── .env.example           ← Copy this to .env
├── Procfile               ← For Railway/Heroku deployment
├── covenant-buys.html     ← Your frontend (updated to use API)
│
├── db/
│   ├── database.js        ← SQLite setup & schema
│   └── seed.js            ← Seeds admin + demo products
│
├── routes/
│   ├── auth.js            ← Register, login, profile
│   ├── products.js        ← Browse, create, update products
│   ├── cart.js            ← Cart management
│   ├── orders.js          ← Order creation + Paystack init
│   ├── payments.js        ← Paystack webhook + verification
│   ├── vendor.js          ← Vendor dashboard API
│   ├── wishlist.js        ← Wishlist toggle
│   └── admin.js           ← Admin management panel
│
├── middleware/
│   └── auth.js            ← JWT verification + role guards
│
└── utils/
    ├── paystack.js        ← Paystack API helpers
    └── email.js           ← Nodemailer email templates
```

---

## 🚀 Quick Start (Local)

### Step 1 — Install dependencies
```bash
cd covenantbuys-backend
npm install
```

### Step 2 — Set up environment variables
```bash
cp .env.example .env
```
Edit `.env` — your Paystack keys are already filled in. Just set `SMTP_PASS` if you want emails.

### Step 3 — Seed the database
```bash
npm run seed
```
This creates:
- ✅ Your admin account (`danielcovennt98@gmail.com` / `Admin@Covenant2026`)
- ✅ 2 demo vendor accounts
- ✅ 12 sample products

### Step 4 — Start the server
```bash
npm run dev       # development (auto-restarts)
npm start         # production
```

Server runs at: **http://localhost:3000**

### Step 5 — Open the frontend
Open `covenant-buys.html` in a browser (or use Live Server in VS Code).

The `API_URL` at the top of the script is set to `http://localhost:3000` — matches the backend.

---

## ☁️ Deployment to Railway (Recommended — Free)

Railway gives you a free Node.js server + persistent volume.

### Steps:
1. Go to **https://railway.app** → Sign up with GitHub
2. Click **"New Project" → "Deploy from GitHub repo"**
3. Push this folder to a GitHub repo first:
   ```bash
   git init
   git add .
   git commit -m "CovenantBuys backend"
   git remote add origin https://github.com/YOUR_USERNAME/covenantbuys-backend.git
   git push -u origin main
   ```
4. In Railway, select your repo → it auto-detects Node.js
5. Go to **Variables** tab → add all variables from `.env.example`
6. Go to **Settings → Volumes** → add a volume mounted at `/app/db` (to persist SQLite)
7. In Variables, set `DB_PATH=/app/db/covenantbuys.db`
8. After deploy, open the Railway terminal and run: `npm run seed`
9. Copy your Railway URL (e.g. `https://covenantbuys.up.railway.app`)
10. **Update `covenant-buys.html`**: change `API_URL` to your Railway URL
11. Set `FRONTEND_URL` in Railway variables to wherever your HTML is hosted

### Setting Paystack Webhook:
1. Go to https://dashboard.paystack.com → Settings → API Keys & Webhooks
2. Set Webhook URL to: `https://YOUR-RAILWAY-URL.railway.app/api/payments/webhook`
3. Copy the webhook secret and add it as `PAYSTACK_WEBHOOK_SECRET` in Railway variables

---

## 📡 API Reference

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Login → returns JWT |
| GET | `/api/auth/me` | JWT | Get own profile |
| PATCH | `/api/auth/me` | JWT | Update profile/password |

### Products
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/products` | — | List products (filter: `?category=books&q=search`) |
| GET | `/api/products/:id` | — | Single product + reviews |
| POST | `/api/products` | vendor | Create product |
| PUT | `/api/products/:id` | vendor | Update product |
| DELETE | `/api/products/:id` | vendor | Soft-delete product |
| POST | `/api/products/:id/review` | buyer | Submit review |

### Cart
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/cart` | JWT | Get cart |
| POST | `/api/cart` | JWT | Add item `{product_id, quantity}` |
| PATCH | `/api/cart/:id` | JWT | Update quantity |
| DELETE | `/api/cart/:id` | JWT | Remove item |
| DELETE | `/api/cart` | JWT | Clear cart |

### Orders & Payments
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/orders/initiate` | JWT | Create order → get Paystack details |
| GET | `/api/orders` | JWT | Buyer's order history |
| GET | `/api/orders/:id` | JWT | Single order |
| GET | `/api/payments/verify/:ref` | — | Verify Paystack payment |
| POST | `/api/payments/webhook` | Paystack | Paystack webhook (auto) |

### Vendor Dashboard
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/vendor/dashboard` | vendor | Stats + recent activity |
| GET | `/api/vendor/products` | vendor | Own products |
| GET | `/api/vendor/orders` | vendor | Orders for vendor's items |
| GET | `/api/vendor/earnings` | vendor | Revenue breakdown |
| PATCH | `/api/vendor/profile` | vendor | Update store info |

### Admin
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/dashboard` | admin | Platform-wide stats |
| GET | `/api/admin/users` | admin | All users |
| PATCH | `/api/admin/users/:id` | admin | Change role/verify |
| GET | `/api/admin/orders` | admin | All orders |
| GET | `/api/admin/vendors` | admin | All vendors |
| GET | `/api/admin/paystack/transactions` | admin | Paystack transactions |

---

## 💳 How Paystack Works in This App

1. **Buyer clicks "Pay with Paystack"** → frontend calls `POST /api/orders/initiate`
2. **Backend** creates the order in DB (status: `pending`) and calls Paystack API
3. **Paystack popup** opens in the browser with the correct amount
4. **Buyer pays** using card/bank transfer/USSD
5. **Paystack fires a webhook** to `POST /api/payments/webhook`
6. **Backend verifies** the payment with Paystack, marks order as `paid`, deducts stock, clears cart, sends emails
7. **Frontend also calls** `GET /api/payments/verify/:ref` to confirm and show success message

### 5% Commission Split
- Buyer pays the full product price
- In the database, each `order_item` records:
  - `vendor_amount` = 95% of item total (what vendor earns)
  - `platform_cut` = 5% (your earnings)
- Paystack collects the full amount to your account
- You pay vendors their 95% share (via bank transfer or Paystack Transfer API)

---

## 🔐 Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | danielcovennt98@gmail.com | Admin@Covenant2026 |
| Vendor | bookhub@veritas.edu.ng | Vendor@123 |
| Vendor | mamachef@veritas.edu.ng | Vendor@123 |

---

## 📧 Email Setup (Optional but recommended)

1. Go to your Google Account → Security → App Passwords
2. Generate a password for "Mail"
3. Add to `.env`:
   ```
   SMTP_USER=danielcovennt98@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx   ← your app password
   ```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | SQLite (via better-sqlite3) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Payments | Paystack |
| Email | Nodemailer (Gmail) |
| Hosting | Railway |

---

*CovenantBuys © 2026 — Veritas University Abuja*
