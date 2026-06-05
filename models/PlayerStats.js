const mongoose = require('mongoose');

const perGameSchema = new mongoose.Schema({
  played: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  pointsEarned: { type: Number, default: 0 },
}, { _id: false });

const playerStatsSchema = new mongoose.Schema({
  userId: { type: String, unique: true, required: true },
  gamesPlayed: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  pointsEarned: { type: Number, default: 0 },
  perGame: { type: Map, of: perGameSchema, default: {} },
}, { versionKey: false });

module.exports = mongoose.models.PlayerStats || mongoose.model('PlayerStats', playerStatsSchema);
