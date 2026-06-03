const fs = require('fs');
const path = './inventory.json';

function load() {
  try {
    if (!fs.existsSync(path)) fs.writeFileSync(path, '{}');
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (_) { return {}; }
}

function save(data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

function addItem(userId, item) {
  const inv = load();
  if (!inv[userId]) inv[userId] = {};
  inv[userId][item] = (inv[userId][item] || 0) + 1;
  save(inv);
}

function getItems(userId) {
  const inv = load();
  return inv[userId] || {};
}

function useItem(userId, item) {
  const inv = load();
  if (!inv[userId] || !inv[userId][item] || inv[userId][item] <= 0) return false;
  inv[userId][item]--;
  if (inv[userId][item] === 0) delete inv[userId][item];
  save(inv);
  return true;
}

function hasItem(userId, item) {
  const inv = load();
  return (inv[userId]?.[item] || 0) > 0;
}

function resetAll() {
  save({});
}

module.exports = { addItem, getItems, useItem, hasItem, resetAll };
