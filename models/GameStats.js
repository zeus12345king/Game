const mongoose = require('mongoose');

const gameStatsSchema = new mongoose.Schema({
  gameName: { type: String, unique: true, required: true },
  type: { type: String, enum: ['single', 'group'], default: 'group' },
  runs: { type: Number, default: 0 },
  participations: { type: Number, default: 0 },
}, { versionKey: false });

module.exports = mongoose.models.GameStats || mongoose.model('GameStats', gameStatsSchema);
