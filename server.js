'use strict';

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Where guests are sent after they sign up / log in and pick a plan.
const OFFICIAL_WEBSITE = process.env.OFFICIAL_WEBSITE_URL || 'https://www.your-hotel.com';

// Simple shared secret to view the marketing dashboard. Override in production.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ---------------------------------------------------------------------------
// Plan catalogue
// ---------------------------------------------------------------------------
// `amount` is in USD and is informational only — the portal does not process
// real charges; payment is collected via Wish Money Lebanon or cash at the
// reception desk.
const PLANS = [
  {
    id: 'free',
    name: 'Free WiFi',
    type: 'free',
    speed: 'Best effort',
    amount: 0,
    description: 'Complimentary internet access for all guests.'
  },
  {
    id: 'fiber-50',
    name: 'Fiber Optic 50 Mbps',
    type: 'fiber',
    speed: '50 Mbps',
    amount: 5,
    description: 'Dedicated fiber line at 50 Mbps. Great for streaming and video calls.'
  },
  {
    id: 'fiber-70',
    name: 'Fiber Optic 70 Mbps',
    type: 'fiber',
    speed: '70 Mbps',
    amount: 8,
    description: 'Dedicated fiber line at 70 Mbps. Ideal for heavy use and multiple devices.'
  },
  {
    id: 'fiber-open',
    name: 'Fiber Optic Open Speed',
    type: 'fiber',
    speed: 'Unlimited / Open',
    amount: 12,
    description: 'Uncapped fiber connection with maximum available speed.'
  }
];

const PAYMENT_METHODS = [
  { id: 'wish', name: 'Wish Money Lebanon' },
  { id: 'cash', name: 'Cash at Reception' }
];

function planById(id) {
  return PLANS.find((p) => p.id === id) || null;
}

// ---------------------------------------------------------------------------
// Password hashing (built-in crypto, no native deps)
// ---------------------------------------------------------------------------
function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, useSalt, 100000, 64, 'sha512')
    .toString('hex');
  return { salt: useSalt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  // Constant-time compare.
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Event logging (powers the marketing dashboard)
// ---------------------------------------------------------------------------
function logEvent(req, { type, username, plan, payment, amount }) {
  const store = db.read();
  store.events.push({
    id: db.nextId(store.events),
    type,
    username: username || null,
    plan: plan || null,
    payment: payment || null,
    amount: typeof amount === 'number' ? amount : null,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
    createdAt: new Date().toISOString()
  });
  db.write(store);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Friendly URL for the marketing dashboard.
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
app.get('/api/config', (req, res) => {
  res.json({
    plans: PLANS,
    paymentMethods: PAYMENT_METHODS,
    officialWebsite: OFFICIAL_WEBSITE
  });
});

app.post('/api/signup', (req, res) => {
  const { username, password, fullName, roomNumber } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  }

  const store = db.read();
  const exists = store.users.some(
    (u) => u.username.toLowerCase() === String(username).toLowerCase()
  );
  if (exists) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const { salt, hash } = hashPassword(String(password));
  const user = {
    id: db.nextId(store.users),
    username: String(username),
    passwordHash: hash,
    salt,
    fullName: fullName ? String(fullName) : null,
    roomNumber: roomNumber ? String(roomNumber) : null,
    createdAt: new Date().toISOString()
  };
  store.users.push(user);
  db.write(store);

  logEvent(req, { type: 'signup', username: user.username });

  res.json({ ok: true, username: user.username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const store = db.read();
  const user = store.users.find(
    (u) => u.username.toLowerCase() === String(username).toLowerCase()
  );
  if (!user || !verifyPassword(String(password), user.salt, user.passwordHash)) {
    logEvent(req, { type: 'login_failed', username: String(username) });
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  logEvent(req, { type: 'login', username: user.username });
  res.json({ ok: true, username: user.username });
});

app.post('/api/select-plan', (req, res) => {
  const { username, planId, paymentId } = req.body || {};

  const plan = planById(planId);
  if (!plan) {
    return res.status(400).json({ error: 'Please choose a valid plan.' });
  }

  // Paid (fiber) plans require a payment method; free WiFi does not.
  let paymentName = null;
  if (plan.type !== 'free') {
    const method = PAYMENT_METHODS.find((m) => m.id === paymentId);
    if (!method) {
      return res.status(400).json({ error: 'Please choose a payment method.' });
    }
    paymentName = method.name;
  }

  logEvent(req, {
    type: 'plan_selected',
    username: username ? String(username) : null,
    plan: plan.name,
    payment: paymentName,
    amount: plan.amount
  });

  res.json({
    ok: true,
    plan: plan.name,
    payment: paymentName,
    amount: plan.amount,
    redirectUrl: OFFICIAL_WEBSITE
  });
});

// ---------------------------------------------------------------------------
// Admin / marketing dashboard API (password protected)
// ---------------------------------------------------------------------------
function checkAdmin(req, res, next) {
  const provided = req.headers['x-admin-password'] || req.query.key;
  if (provided !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

app.get('/api/admin/stats', checkAdmin, (req, res) => {
  const store = db.read();
  const events = store.events;

  const count = (type) => events.filter((e) => e.type === type).length;

  // Plan popularity.
  const planCounts = {};
  const paymentCounts = {};
  let estimatedRevenue = 0;
  events
    .filter((e) => e.type === 'plan_selected')
    .forEach((e) => {
      if (e.plan) planCounts[e.plan] = (planCounts[e.plan] || 0) + 1;
      if (e.payment) paymentCounts[e.payment] = (paymentCounts[e.payment] || 0) + 1;
      if (typeof e.amount === 'number') estimatedRevenue += e.amount;
    });

  // Signups per day (last 14 days) for a simple trend chart.
  const byDay = {};
  events
    .filter((e) => e.type === 'signup')
    .forEach((e) => {
      const day = (e.createdAt || '').slice(0, 10);
      if (day) byDay[day] = (byDay[day] || 0) + 1;
    });

  const recent = events
    .slice(-50)
    .reverse()
    .map((e) => ({
      type: e.type,
      username: e.username,
      plan: e.plan,
      payment: e.payment,
      amount: e.amount,
      createdAt: e.createdAt
    }));

  res.json({
    totals: {
      users: store.users.length,
      signups: count('signup'),
      logins: count('login'),
      failedLogins: count('login_failed'),
      planSelections: count('plan_selected'),
      estimatedRevenue
    },
    planCounts,
    paymentCounts,
    signupsByDay: byDay,
    recent
  });
});

// ---------------------------------------------------------------------------
// Seed a demo guest account on first run so the portal can be tried straight
// away. Disable by setting SEED_DEMO_USER=false. Real guests still sign up
// normally; this only runs when there are no users yet.
// ---------------------------------------------------------------------------
function seedDemoUser() {
  if (process.env.SEED_DEMO_USER === 'false') return;
  const store = db.read();
  if (store.users.length > 0) return;

  const username = process.env.DEMO_USERNAME || 'guest';
  const password = process.env.DEMO_PASSWORD || 'guest123';
  const { salt, hash } = hashPassword(password);
  store.users.push({
    id: db.nextId(store.users),
    username,
    passwordHash: hash,
    salt,
    fullName: 'Demo Guest',
    roomNumber: '101',
    createdAt: new Date().toISOString()
  });
  db.write(store);
  console.log(`Seeded demo guest account -> username: ${username}  password: ${password}`);
}

seedDemoUser();

app.listen(PORT, () => {
  console.log(`Hotel captive portal running on http://localhost:${PORT}`);
  console.log(`Marketing dashboard at   http://localhost:${PORT}/admin`);
});
