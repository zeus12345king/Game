const db = require('../database.js');
const inventory = require('../inventory.js');
const config = require('../config.js');

function normalizeItems(gameName, items = []) {
  const costs = config.abilityCosts?.[gameName] || {};
  return items.map((item) => ({ ...item, cost: item.cost ?? costs[item.costKey || item.id] ?? 0 }));
}

async function getBalance(userId) {
  return db.getUserPoints(userId);
}

async function getOwned(userId, itemId) {
  const items = await inventory.getItems(userId);
  return items[itemId] || 0;
}

async function hasItem(userId, itemId) {
  return inventory.hasItem(userId, itemId);
}

async function listItems(gameName, items, userId) {
  const normalized = normalizeItems(gameName, items);
  if (!userId) return normalized;
  const [balance, owned] = await Promise.all([db.getUserPoints(userId), inventory.getItems(userId)]);
  return normalized.map((item) => ({ ...item, owned: owned[item.id] || 0, canAfford: balance >= item.cost, balance }));
}

async function buy({ userId, gameName, itemId, items }) {
  const item = normalizeItems(gameName, items).find((entry) => entry.id === itemId);
  if (!item) return { success: false, error: 'العنصر غير موجود' };
  const balance = await db.getUserPoints(userId);
  if (balance < item.cost) return { success: false, error: `نقاطك غير كافية، تحتاج ${item.cost} نقطة` };
  await db.removePoints(userId, item.cost);
  await inventory.addItem(userId, item.id);
  return { success: true, item, remaining: await db.getUserPoints(userId), owned: await getOwned(userId, item.id) };
}

async function use(userId, itemId) {
  return inventory.useItem(userId, itemId);
}

module.exports = { normalizeItems, getBalance, getOwned, hasItem, listItems, buy, use };
