'use strict';

// Picks the storage backend. Default is MySQL (XAMPP-ready); set
// DB_DRIVER=json to use the zero-setup JSON file store instead.
const driver = (process.env.DB_DRIVER || 'mysql').toLowerCase();

let createStore;
if (driver === 'json') {
  createStore = require('./json');
} else {
  createStore = require('./mysql');
}

module.exports = { store: createStore(), driver };
