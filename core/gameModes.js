const GameMode = require('../models/GameMode.js');
const config = require('../config.js');

const defaults = {
  normal: { modeId: 'normal', label: 'عادي', enabled: true },
  fast: { modeId: 'fast', label: 'سريع', enabled: true, lobbyTime: 20000 },
  long: { modeId: 'long', label: 'طويل', enabled: true, lobbyTime: 60000 },
};

async function seedGameModes(gameName, gameDefaults = []) {
  const modes = gameDefaults.length ? gameDefaults : Object.values(defaults);
  for (const mode of modes) {
    await GameMode.updateOne({ gameName, modeId: mode.modeId }, { $setOnInsert: { gameName, ...mode } }, { upsert: true });
  }
}

async function listModes(gameName) {
  await seedGameModes(gameName);
  return GameMode.find({ gameName }).sort({ modeId: 1 }).lean();
}

async function setModeEnabled(gameName, modeId, enabled) {
  await seedGameModes(gameName);
  return GameMode.findOneAndUpdate({ gameName, modeId }, { $set: { enabled } }, { new: true }).lean();
}

async function getActiveMode(gameName, modeId = 'normal') {
  await seedGameModes(gameName);
  const mode = await GameMode.findOne({ gameName, modeId, enabled: true }).lean();
  if (!mode) return null;
  return {
    ...mode,
    minPlayers: mode.minPlayers,
    maxPlayers: mode.maxPlayers,
    lobbyTime: mode.lobbyTime || config.lobbyTime?.[gameName],
  };
}

module.exports = { seedGameModes, listModes, setModeEnabled, getActiveMode };
