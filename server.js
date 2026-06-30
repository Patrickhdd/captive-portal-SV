'use strict';

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { store, driver } = require('./storage');
const { PAYMENT_METHODS } = require('./storage/defaults');

const app = express();
const PORT = process.env.PORT || 3000;

// Where guests are sent after they sign up / log in and pick a plan.
const OFFICIAL_WEBSITE = process.env.OFFICIAL_WEBSITE_URL || 'https://www.your-hotel.com';

// Simple shared secret to view the marketing dashboard. Override in production.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function paymentById(id) {
  return PAYMENT_METHODS.find((m) => m.id === id) || null;
}

// ---------------------------------------------------------------------------
// Password hashing (built-in crypto, no native deps)
// ---------------------------------------------------------------------------
function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, useSalt, 100000, 64, 'sha512').toString('hex');
  return { salt: useSalt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Event logging (powers the marketing dashboard)
// ---------------------------------------------------------------------------
async function logEvent(req, { type, username, plan, payment, amount }) {
  await store.addEvent({
    type,
    username: username || null,
    plan: plan || null,
    payment: payment || null,
    amount: typeof amount === 'number' ? amount : null,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null
  });
}

// Wraps an async route so rejected promises become a clean 500 instead of
// crashing the process.
function asyncRoute(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: 'Server error. Please try again.' });
    });
  };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
app.get(
  '/api/config',
  asyncRoute(async (req, res) => {
    const plans = await store.listPlans({ activeOnly: true });
    res.json({ plans, paymentMethods: PAYMENT_METHODS, officialWebsite: OFFICIAL_WEBSITE });
  })
);

app.post(
  '/api/signup',
  asyncRoute(async (req, res) => {
    const { username, password, fullName, roomNumber } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }

    const existing = await store.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }

    const { salt, hash } = hashPassword(String(password));
    const user = await store.createUser({
      username: String(username),
      passwordHash: hash,
      salt,
      fullName: fullName ? String(fullName) : null,
      roomNumber: roomNumber ? String(roomNumber) : null
    });

    await logEvent(req, { type: 'signup', username: user.username });
    res.json({ ok: true, username: user.username });
  })
);

app.post(
  '/api/login',
  asyncRoute(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await store.getUserByUsername(username);
    if (!user || !verifyPassword(String(password), user.salt, user.passwordHash)) {
      await logEvent(req, { type: 'login_failed', username: String(username) });
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    await logEvent(req, { type: 'login', username: user.username });
    res.json({ ok: true, username: user.username });
  })
);

app.post(
  '/api/select-plan',
  asyncRoute(async (req, res) => {
    const { username, planId, paymentId } = req.body || {};

    const plan = await store.getPlan(planId);
    if (!plan || !plan.active) {
      return res.status(400).json({ error: 'Please choose a valid plan.' });
    }

    // Paid (fiber) plans require a payment method; free WiFi does not.
    let paymentName = null;
    if (plan.type !== 'free') {
      const method = paymentById(paymentId);
      if (!method) {
        return res.status(400).json({ error: 'Please choose a payment method.' });
      }
      paymentName = method.name;
    }

    await logEvent(req, {
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
  })
);

// ---------------------------------------------------------------------------
// Admin API (password protected)
// ---------------------------------------------------------------------------
function checkAdmin(req, res, next) {
  const provided = req.headers['x-admin-password'] || req.query.key;
  if (provided !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

app.get('/api/admin/stats', checkAdmin, asyncRoute(async (req, res) => {
  res.json(await store.getStats());
}));

// --- Guest accounts --------------------------------------------------------
app.get('/api/admin/users', checkAdmin, asyncRoute(async (req, res) => {
  res.json({ users: await store.listUsers() });
}));

app.post('/api/admin/users', checkAdmin, asyncRoute(async (req, res) => {
  const { username, password, fullName, roomNumber } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (await store.getUserByUsername(username)) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }
  const { salt, hash } = hashPassword(String(password));
  const user = await store.createUser({
    username: String(username),
    passwordHash: hash,
    salt,
    fullName: fullName ? String(fullName) : null,
    roomNumber: roomNumber ? String(roomNumber) : null
  });
  res.json({ ok: true, id: user.id, username: user.username });
}));

app.delete('/api/admin/users/:id', checkAdmin, asyncRoute(async (req, res) => {
  const ok = await store.deleteUser(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Guest not found.' });
  res.json({ ok: true });
}));

// --- Plans (editable catalogue) -------------------------------------------
app.get('/api/admin/plans', checkAdmin, asyncRoute(async (req, res) => {
  res.json({ plans: await store.listPlans() });
}));

app.post('/api/admin/plans', checkAdmin, asyncRoute(async (req, res) => {
  const { id, name, type, speed, amount, description, sortOrder, active } = req.body || {};
  if (!id || !name || !type) {
    return res.status(400).json({ error: 'id, name and type are required.' });
  }
  if (!['free', 'fiber'].includes(type)) {
    return res.status(400).json({ error: 'type must be "free" or "fiber".' });
  }
  const plan = await store.upsertPlan({
    id: String(id).trim(),
    name: String(name),
    type,
    speed: speed ? String(speed) : '',
    amount: Number(amount) || 0,
    description: description ? String(description) : '',
    sortOrder: Number(sortOrder) || 0,
    active: active === false ? 0 : 1
  });
  res.json({ ok: true, plan });
}));

app.delete('/api/admin/plans/:id', checkAdmin, asyncRoute(async (req, res) => {
  const ok = await store.deletePlan(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Plan not found.' });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Demo guest account, seeded on first run so the portal can be tried straight
// away. Disable with SEED_DEMO_USER=false.
// ---------------------------------------------------------------------------
async function seedDemoUser() {
  if (process.env.SEED_DEMO_USER === 'false') return;
  if ((await store.countUsers()) > 0) return;

  const username = process.env.DEMO_USERNAME || 'guest';
  const password = process.env.DEMO_PASSWORD || 'guest123';
  const { salt, hash } = hashPassword(password);
  await store.createUser({
    username,
    passwordHash: hash,
    salt,
    fullName: 'Demo Guest',
    roomNumber: '101'
  });
  console.log(`Seeded demo guest account -> username: ${username}  password: ${password}`);
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function start() {
  try {
    await store.init();
  } catch (err) {
    console.error('\n[Database error] Could not connect to the database.');
    console.error('Driver:', driver);
    if (driver === 'mysql') {
      console.error(
        'Make sure MySQL is running (e.g. start MySQL in the XAMPP Control Panel) and that\n' +
          'DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME are correct.\n' +
          'The portal already tried ports 3306 and 3307 automatically.\n' +
          'If your MySQL uses a different port, set DB_PORT to it.\n' +
          'Tip: to run without a database, set DB_DRIVER=json\n'
      );
    }
    console.error('Details:', err.message, '\n');
    process.exit(1);
  }

  await seedDemoUser();

  app.listen(PORT, () => {
    console.log(`Hotel captive portal running on http://localhost:${PORT}`);
    console.log(`Marketing dashboard at   http://localhost:${PORT}/admin`);
    console.log(`Storage driver: ${driver}`);
  });
}

start();
