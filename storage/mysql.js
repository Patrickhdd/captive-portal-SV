'use strict';

/**
 * MySQL / MariaDB storage driver (works with XAMPP out of the box).
 *
 * Connection settings come from environment variables; the defaults match a
 * fresh XAMPP install (localhost, user "root", empty password). On init it
 * creates the database and tables if they don't exist and seeds the default
 * plans, so there's nothing to set up manually in phpMyAdmin.
 */

const mysql = require('mysql2/promise');
const { DEFAULT_PLANS } = require('./defaults');
const { computeStats } = require('./stats');

const CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hotel_portal'
};

// Ports to try, in order. We start with the configured port (3306 by default)
// and fall back to 3307 — the port XAMPP users commonly move MySQL to when
// something else already occupies 3306. Override the whole list with
// DB_PORT_FALLBACKS="3306,3307,3308" if needed.
function candidatePorts() {
  const fallbacks = (process.env.DB_PORT_FALLBACKS || '3307')
    .split(',')
    .map((p) => Number(p.trim()))
    .filter((p) => Number.isInteger(p) && p > 0);
  const ordered = [CONFIG.port, ...fallbacks];
  return [...new Set(ordered)]; // de-dupe, preserve order
}

function toIso(value) {
  if (!value) return null;
  // mysql2 returns JS Date objects for DATETIME columns.
  return value instanceof Date ? value.toISOString() : String(value);
}

module.exports = function createMysqlStore() {
  let pool;
  // The port we actually connected on (resolved at startup across candidates).
  let activePort = CONFIG.port;

  // Tries each candidate port until one accepts a connection. Returns an open
  // "bootstrap" connection (no database selected) on the working port, or
  // throws the last error if every candidate fails.
  async function connectBootstrap() {
    const ports = candidatePorts();
    let lastErr;
    for (const port of ports) {
      try {
        const conn = await mysql.createConnection({
          host: CONFIG.host,
          port,
          user: CONFIG.user,
          password: CONFIG.password,
          connectTimeout: 4000
        });
        activePort = port;
        if (port !== CONFIG.port) {
          console.log(`MySQL: port ${CONFIG.port} unavailable, connected on ${port} instead.`);
        }
        return conn;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  async function ensureDatabase() {
    // Connect without selecting a database so we can create it if missing.
    const bootstrap = await connectBootstrap();
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${CONFIG.database}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await bootstrap.end();
  }

  async function createTables() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(190) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        salt VARCHAR(64) NOT NULL,
        full_name VARCHAR(190) NULL,
        room_number VARCHAR(64) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(32) NOT NULL,
        username VARCHAR(190) NULL,
        plan VARCHAR(190) NULL,
        payment VARCHAR(190) NULL,
        amount DECIMAL(10,2) NULL,
        ip VARCHAR(64) NULL,
        user_agent VARCHAR(512) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_type (type),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(190) NOT NULL,
        type VARCHAR(16) NOT NULL,
        speed VARCHAR(64) NOT NULL,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        description VARCHAR(512) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  async function seedPlans() {
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM plans');
    if (rows[0].n > 0) return;
    for (const p of DEFAULT_PLANS) {
      await pool.query(
        `INSERT INTO plans (id, name, type, speed, amount, description, sort_order, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.name, p.type, p.speed, p.amount, p.description, p.sortOrder, p.active]
      );
    }
  }

  function mapPlan(row) {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      speed: row.speed,
      amount: Number(row.amount),
      description: row.description,
      sortOrder: row.sort_order,
      active: row.active ? 1 : 0
    };
  }

  return {
    async init() {
      await ensureDatabase();
      pool = mysql.createPool({
        host: CONFIG.host,
        port: activePort, // resolved across candidate ports in ensureDatabase()
        user: CONFIG.user,
        password: CONFIG.password,
        database: CONFIG.database,
        waitForConnections: true,
        connectionLimit: 10,
        // Return DECIMAL as JS numbers rather than strings.
        decimalNumbers: true
      });
      await createTables();
      await seedPlans();
    },

    async countUsers() {
      const [rows] = await pool.query('SELECT COUNT(*) AS n FROM users');
      return rows[0].n;
    },

    async getUserByUsername(username) {
      const [rows] = await pool.query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
      if (!rows.length) return null;
      const u = rows[0];
      return {
        id: u.id,
        username: u.username,
        passwordHash: u.password_hash,
        salt: u.salt,
        fullName: u.full_name,
        roomNumber: u.room_number,
        createdAt: toIso(u.created_at)
      };
    },

    async createUser(user) {
      const [result] = await pool.query(
        `INSERT INTO users (username, password_hash, salt, full_name, room_number)
         VALUES (?, ?, ?, ?, ?)`,
        [user.username, user.passwordHash, user.salt, user.fullName || null, user.roomNumber || null]
      );
      return { id: result.insertId, ...user };
    },

    async listUsers() {
      const [rows] = await pool.query(
        'SELECT id, username, full_name, room_number, created_at FROM users ORDER BY id DESC'
      );
      return rows.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        roomNumber: u.room_number,
        createdAt: toIso(u.created_at)
      }));
    },

    async deleteUser(id) {
      const [result] = await pool.query('DELETE FROM users WHERE id = ?', [Number(id)]);
      return result.affectedRows > 0;
    },

    async addEvent(event) {
      await pool.query(
        `INSERT INTO events (type, username, plan, payment, amount, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          event.type,
          event.username || null,
          event.plan || null,
          event.payment || null,
          typeof event.amount === 'number' ? event.amount : null,
          event.ip || null,
          event.userAgent || null
        ]
      );
    },

    async getStats() {
      const [eventRows] = await pool.query(
        'SELECT type, username, plan, payment, amount, created_at FROM events ORDER BY id ASC'
      );
      const events = eventRows.map((e) => ({
        type: e.type,
        username: e.username,
        plan: e.plan,
        payment: e.payment,
        amount: e.amount === null ? null : Number(e.amount),
        createdAt: toIso(e.created_at)
      }));
      const userCount = await this.countUsers();
      return computeStats(events, userCount);
    },

    async listPlans({ activeOnly = false } = {}) {
      const sql = activeOnly
        ? 'SELECT * FROM plans WHERE active = 1 ORDER BY sort_order ASC'
        : 'SELECT * FROM plans ORDER BY sort_order ASC';
      const [rows] = await pool.query(sql);
      return rows.map(mapPlan);
    },

    async getPlan(id) {
      const [rows] = await pool.query('SELECT * FROM plans WHERE id = ? LIMIT 1', [id]);
      return rows.length ? mapPlan(rows[0]) : null;
    },

    async upsertPlan(plan) {
      await pool.query(
        `INSERT INTO plans (id, name, type, speed, amount, description, sort_order, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           type = VALUES(type),
           speed = VALUES(speed),
           amount = VALUES(amount),
           description = VALUES(description),
           sort_order = VALUES(sort_order),
           active = VALUES(active)`,
        [
          plan.id,
          plan.name,
          plan.type,
          plan.speed,
          plan.amount,
          plan.description || null,
          plan.sortOrder || 0,
          plan.active ? 1 : 0
        ]
      );
      return this.getPlan(plan.id);
    },

    async deletePlan(id) {
      const [result] = await pool.query('DELETE FROM plans WHERE id = ?', [id]);
      return result.affectedRows > 0;
    }
  };
};
