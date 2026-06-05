const mongoose = require('mongoose');

const gameModeSchema = new mongoose.Schema({
  gameName: { type: String, required: true },
  modeId: { type: String, required: true },
  label: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  minPlayers: Number,
  maxPlayers: Number,
  lobbyTime: Number,
  extra: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
}, { versionKey: false });

gameModeSchema.index({ gameName: 1, modeId: 1 }, { unique: true });

module.exports = mongoose.models.GameMode || mongoose.model('GameMode', gameModeSchema);
