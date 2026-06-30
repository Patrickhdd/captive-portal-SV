'use strict';

/**
 * JSON-file storage driver. Implements the same async interface as the MySQL
 * driver so the app can run with zero database setup (used for local testing
 * and as a fallback). Data lives in data/db.json.
 */

const fs = require('fs');
const path = require('path');
const { DEFAULT_PLANS } = require('./defaults');
const { computeStats } = require('./stats');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY_DB = { users: [], events: [], plans: [] };

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DB, null, 2));
}

function read() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      plans: Array.isArray(parsed.plans) ? parsed.plans : []
    };
  } catch (err) {
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

module.exports = function createJsonStore() {
  return {
    async init() {
      const db = read();
      if (db.plans.length === 0) {
        db.plans = DEFAULT_PLANS.map((p) => ({ ...p }));
        write(db);
      }
    },

    async countUsers() {
      return read().users.length;
    },

    async getUserByUsername(username) {
      const db = read();
      return (
        db.users.find((u) => u.username.toLowerCase() === String(username).toLowerCase()) || null
      );
    },

    async createUser(user) {
      const db = read();
      const record = { id: nextId(db.users), createdAt: new Date().toISOString(), ...user };
      db.users.push(record);
      write(db);
      return record;
    },

    async listUsers() {
      return read()
        .users.map((u) => ({
          id: u.id,
          username: u.username,
          fullName: u.fullName || null,
          roomNumber: u.roomNumber || null,
          createdAt: u.createdAt
        }))
        .sort((a, b) => b.id - a.id);
    },

    async deleteUser(id) {
      const db = read();
      const before = db.users.length;
      db.users = db.users.filter((u) => u.id !== Number(id));
      write(db);
      return db.users.length < before;
    },

    async addEvent(event) {
      const db = read();
      db.events.push({
        id: nextId(db.events),
        createdAt: new Date().toISOString(),
        ...event
      });
      write(db);
    },

    async getStats() {
      const db = read();
      return computeStats(db.events, db.users.length);
    },

    async listPlans({ activeOnly = false } = {}) {
      let plans = read().plans.slice();
      if (activeOnly) plans = plans.filter((p) => p.active);
      return plans.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    },

    async getPlan(id) {
      return read().plans.find((p) => p.id === id) || null;
    },

    async upsertPlan(plan) {
      const db = read();
      const idx = db.plans.findIndex((p) => p.id === plan.id);
      if (idx >= 0) {
        db.plans[idx] = { ...db.plans[idx], ...plan };
      } else {
        db.plans.push(plan);
      }
      write(db);
      return db.plans.find((p) => p.id === plan.id);
    },

    async deletePlan(id) {
      const db = read();
      const before = db.plans.length;
      db.plans = db.plans.filter((p) => p.id !== id);
      write(db);
      return db.plans.length < before;
    }
  };
};
