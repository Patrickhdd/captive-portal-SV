'use strict';

/**
 * Tiny JSON-file backed store. No external deps so the portal runs with just
 * Express installed. Reads the whole file into memory and writes it back on
 * every mutation — fine for the scale of a single hotel's captive portal.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY_DB = {
  users: [],   // { id, username, passwordHash, salt, fullName, roomNumber, createdAt }
  events: []   // { id, type, username, plan, payment, amount, ip, userAgent, createdAt }
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DB, null, 2));
  }
}

function read() {
  ensureStore();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      events: Array.isArray(parsed.events) ? parsed.events : []
    };
  } catch (err) {
    // Corrupt file — start clean rather than crashing the portal.
    return JSON.parse(JSON.stringify(EMPTY_DB));
  }
}

function write(db) {
  ensureStore();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function nextId(collection) {
  return collection.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
}

module.exports = { read, write, nextId, DB_FILE };
