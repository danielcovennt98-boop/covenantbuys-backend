// utils/paystack.js — Paystack API helper
const axios = require('axios');

const PAYSTACK_BASE = 'https://api.paystack.co';
const SECRET = process.env.PAYSTACK_SECRET_KEY;

const headers = () => ({
  Authorization: `Bearer ${SECRET}`,
  'Content-Type': 'application/json',
});

/**
 * Initialize a Paystack transaction.
 * Returns { authorization_url, access_code, reference }
 */
const initializePayment = async ({ email, amount, reference, metadata = {}, callback_url }) => {
  const res = await axios.post(
    `${PAYSTACK_BASE}/transaction/initialize`,
    {
      email,
      amount: Math.round(amount * 100), // Paystack uses kobo
      reference,
      metadata,
      callback_url,
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    },
    { headers: headers() }
  );
  return res.data.data;
};

/**
 * Verify a Paystack transaction by reference.
 * Returns full transaction object.
 */
const verifyPayment = async (reference) => {
  const res = await axios.get(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: headers() }
  );
  return res.data.data;
};

/**
 * Get transaction list (admin use).
 */
const listTransactions = async ({ page = 1, perPage = 50 } = {}) => {
  const res = await axios.get(
    `${PAYSTACK_BASE}/transaction?page=${page}&perPage=${perPage}`,
    { headers: headers() }
  );
  return res.data.data;
};

/**
 * Resolve a bank account number.
 * Used when vendors add their bank details.
 */
const resolveAccount = async (accountNumber, bankCode) => {
  const res = await axios.get(
    `${PAYSTACK_BASE}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    { headers: headers() }
  );
  return res.data.data;
};

/**
 * Get list of Nigerian banks from Paystack.
 */
const getBanks = async () => {
  const res = await axios.get(
    `${PAYSTACK_BASE}/bank?country=nigeria`,
    { headers: headers() }
  );
  return res.data.data;
};

module.exports = { initializePayment, verifyPayment, listTransactions, resolveAccount, getBanks };
