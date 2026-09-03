// server/localDb.js - Zero-Dependency Local DB Mock (Replaces heavy better-sqlite3 native addon)
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
}

const db = {
  exec: () => {},
  pragma: () => {},
  prepare: () => ({
    run: () => ({ changes: 1 }),
    get: () => null,
    all: () => []
  })
};

module.exports = db;
