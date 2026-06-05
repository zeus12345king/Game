const Points = require('./models/Points.js');
const statsManager = require('./core/statsManager.js');
const sessionManager = require('./core/sessionManager.js');

// MongoDB-backed replacement for the previous points.json file storage.

const normalizePointValue = (value) => Number(value) || 0;

const readDatabase = async () => {
  try {
    const rows = await Points.find({}).lean();
    return rows.reduce((data, row) => {
      data[row.userId] = normalizePointValue(row.points);
      return data;
    }, {});
  } catch (err) {
    console.error('Error reading database:', err);
    return {};
  }
};

const saveDatabase = async (data) => {
  try {
    await Points.deleteMany({});
    const entries = Object.entries(data || {}).map(([userId, points]) => ({
      userId,
      points: normalizePointValue(points),
    }));
    if (entries.length > 0) await Points.insertMany(entries);
    return true;
  } catch (err) {
    console.error('Error saving to database:', err);
    return false;
  }
};

const getUserPoints = async (userId) => {
  const row = await Points.findOne({ userId }).lean();
  return row ? normalizePointValue(row.points) : 0;
};

const addPoints = async (userId, points = 1) => {
  const amount = normalizePointValue(points);
  await Points.updateOne(
    { userId },
    { $inc: { points: amount }, $setOnInsert: { userId } },
    { upsert: true }
  );
  const session = sessionManager.current();
  if (amount > 0) {
    sessionManager.registerWinner(userId);
    await statsManager.recordPoints(userId, amount, session?.gameName);
  }
  return true;
};

const setPoints = async (userId, points = 0) => {
  await Points.updateOne(
    { userId },
    { $set: { userId, points: normalizePointValue(points) } },
    { upsert: true }
  );
  return true;
};

const resetAllPoints = async () => {
  await Points.deleteMany({});
  return true;
};

const getTopUsers = async (limit = 10) => {
  const rows = await Points.find({}).sort({ points: -1 }).limit(limit).lean();
  return rows.map((row) => [row.userId, normalizePointValue(row.points)]);
};

const removePoints = async (userId, points = 1) => {
  const current = await getUserPoints(userId);
  if (!current) return false;
  await setPoints(userId, Math.max(0, current - normalizePointValue(points)));
  return true;
};

const removePointsFromAll = async (points = 1) => {
  const db = await readDatabase();
  for (const userId in db) {
    db[userId] = Math.max(0, db[userId] - normalizePointValue(points));
  }
  return saveDatabase(db);
};

const transferPoints = async (fromUserId, toUserId, points) => {
  const amount = normalizePointValue(points);
  const fromPoints = await getUserPoints(fromUserId);

  if (fromPoints < amount) {
    return { success: false, error: 'نقاطك غير كافية' };
  }

  if (amount <= 0) {
    return { success: false, error: 'يجب أن تكون النقاط أكبر من صفر' };
  }

  await setPoints(fromUserId, fromPoints - amount);
  await addPoints(toUserId, amount);
  const toTotal = await getUserPoints(toUserId);

  return { success: true, fromRemaining: fromPoints - amount, toTotal };
};

module.exports = {
  readDatabase,
  saveDatabase,
  getUserPoints,
  addPoints,
  setPoints,
  resetAllPoints,
  getTopUsers,
  removePoints,
  removePointsFromAll,
  transferPoints,
};
