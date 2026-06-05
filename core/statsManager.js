const PlayerStats = require('../models/PlayerStats.js');
const GameStats = require('../models/GameStats.js');

async function ensurePlayer(userId) {
  return PlayerStats.findOneAndUpdate({ userId }, { $setOnInsert: { userId } }, { upsert: true, new: true });
}

async function recordPoints(userId, points, gameName) {
  const amount = Number(points) || 0;
  const inc = { pointsEarned: amount };
  if (gameName) inc[`perGame.${gameName}.pointsEarned`] = amount;
  await PlayerStats.updateOne({ userId }, { $inc: inc, $setOnInsert: { userId } }, { upsert: true });
}

async function finalizeGame({ gameName, type = 'group', participants = [], winners = [] }) {
  const uniqueParticipants = [...new Set(participants.filter(Boolean))];
  const uniqueWinners = [...new Set(winners.filter(Boolean))];
  await GameStats.updateOne(
    { gameName },
    { $inc: { runs: 1, participations: uniqueParticipants.length }, $set: { type }, $setOnInsert: { gameName } },
    { upsert: true }
  );

  for (const userId of uniqueParticipants) {
    const won = uniqueWinners.includes(userId);
    const inc = {
      gamesPlayed: 1,
      wins: won ? 1 : 0,
      losses: won ? 0 : 1,
      [`perGame.${gameName}.played`]: 1,
      [`perGame.${gameName}.wins`]: won ? 1 : 0,
      [`perGame.${gameName}.losses`]: won ? 0 : 1,
    };
    await PlayerStats.updateOne({ userId }, { $inc: inc, $setOnInsert: { userId } }, { upsert: true });
  }
}

async function getPlayerStats(userId) {
  const row = await ensurePlayer(userId);
  const data = row.toObject ? row.toObject() : row;
  data.winRate = data.gamesPlayed > 0 ? Math.round((data.wins / data.gamesPlayed) * 10000) / 100 : 0;
  return data;
}

async function getTopStats(limit = 10) {
  const [points, played, wins, singlePlayed, groupPlayed, runs, participations] = await Promise.all([
    PlayerStats.find({}).sort({ pointsEarned: -1 }).limit(limit).lean(),
    PlayerStats.find({}).sort({ gamesPlayed: -1 }).limit(limit).lean(),
    PlayerStats.find({}).sort({ wins: -1 }).limit(limit).lean(),
    GameStats.find({ type: 'single' }).sort({ participations: -1 }).limit(limit).lean(),
    GameStats.find({ type: 'group' }).sort({ participations: -1 }).limit(limit).lean(),
    GameStats.find({}).sort({ runs: -1 }).limit(limit).lean(),
    GameStats.find({}).sort({ participations: -1 }).limit(limit).lean(),
  ]);
  return { points, played, wins, singlePlayed, groupPlayed, runs, participations };
}

module.exports = { recordPoints, finalizeGame, getPlayerStats, getTopStats };
