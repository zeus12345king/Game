const { EmbedBuilder } = require('discord.js');
const statsManager = require('../core/statsManager.js');
const db = require('../database.js');
const emojis = require('../core/emojis.js');

async function sendStats(target, user) {
  const stats = await statsManager.getPlayerStats(user.id);
  const points = await db.getUserPoints(user.id);
  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle(`${emojis.stats} إحصائيات اللاعب`)
    .setThumbnail(user.displayAvatarURL?.({ extension: 'png', forceStatic: true }) || null)
    .setDescription(`<@${user.id}>`)
    .addFields(
      { name: `${emojis.games} الألعاب`, value: `${stats.gamesPlayed || 0}`, inline: true },
      { name: `${emojis.winner} الفوز`, value: `${stats.wins || 0}`, inline: true },
      { name: `${emojis.leave} الخسارة`, value: `${stats.losses || 0}`, inline: true },
      { name: `${emojis.points} النقاط المكتسبة`, value: `${stats.pointsEarned || 0}`, inline: true },
      { name: `${emojis.points} الرصيد الحالي`, value: `${points || 0}`, inline: true },
      { name: 'نسبة الفوز', value: `${stats.winRate || 0}%`, inline: true },
    )
    .setTimestamp();
  return target.reply({ embeds: [embed] });
}

module.exports = {
  name: 'احصائياتي',
  aliases: ['stats', 'stat', 'إحصائيات', 'احصائيات'],
  async execute(message) {
    const user = message.mentions.users.first() || message.author;
    return sendStats(message, user);
  },
  sendStats,
};
