const config = require('../config.js');

const defaults = {
  join: '✅',
  leave: '🚪',
  player: '👤',
  timer: '⏳',
  winner: '🏆',
  points: '⭐',
  games: '🎮',
  shop: '🛒',
  stop: '🛑',
  stats: '📊',
  vote: '🗳️',
  mode: '⚙️',
};

module.exports = new Proxy(defaults, {
  get(target, prop) {
    return config.emojis?.[prop] || target[prop] || '';
  },
});
