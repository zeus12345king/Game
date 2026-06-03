const fs = require('fs');

if (!fs.existsSync('./settings.json')) {
  fs.writeFileSync('./settings.json', JSON.stringify({ channels: [], disabledCommands: {} }, null, 2));
}

const read = () => {
  try {
    const data = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
    if (!data.channels) data.channels = [];
    if (!data.disabledCommands) data.disabledCommands = {};
    return data;
  } catch { return { channels: [], disabledCommands: {} }; }
};

const save = (data) => {
  try { fs.writeFileSync('./settings.json', JSON.stringify(data, null, 2)); } catch (e) { console.error('settings save error:', e); }
};

const isChannelAllowed    = (id)           => read().channels.includes(id);
const getAllowedChannels   = ()             => read().channels;
const addChannel          = (id)           => { const d = read(); if (!d.channels.includes(id)) { d.channels.push(id); save(d); } };
const removeChannel       = (id)           => { const d = read(); d.channels = d.channels.filter(c => c !== id); save(d); };

const isCommandDisabled   = (channelId, cmd) => { const d = read(); return (d.disabledCommands[channelId] || []).includes(cmd); };
const disableCommand      = (channelId, cmd) => { const d = read(); if (!d.disabledCommands[channelId]) d.disabledCommands[channelId] = []; if (!d.disabledCommands[channelId].includes(cmd)) { d.disabledCommands[channelId].push(cmd); save(d); } };
const enableCommand       = (channelId, cmd) => { const d = read(); if (d.disabledCommands[channelId]) { d.disabledCommands[channelId] = d.disabledCommands[channelId].filter(c => c !== cmd); save(d); } };
const getDisabledCommands = ()             => read().disabledCommands;

module.exports = { isChannelAllowed, getAllowedChannels, addChannel, removeChannel, isCommandDisabled, disableCommand, enableCommand, getDisabledCommands };
