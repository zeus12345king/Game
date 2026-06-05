const { EmbedBuilder } = require('discord.js');
const statsManager = require('../core/statsManager.js');
const db = require('../database.js');
const emojis = require('../core/emojis.js');

function userRows(rows, key) {
  if (!rows.length) return 'لا توجد بيانات.';
  return rows.map((row, index) => `**${index + 1}.** <@${row.userId}> — **${row[key] || 0}**`).join('\n');
}

function gameRows(rows, key) {
  if (!rows.length) return 'لا توجد بيانات.';
  return rows.map((row, index) => `**${index + 1}.** ${row.gameName} — **${row[key] || 0}**`).join('\n');
}

module.exports = {
  name: 'توب',
  aliases: ['top', 'leaderboard', 'الترتيب'],
  async execute(message, args) {
    const limit = Math.min(Math.max(parseInt(args[0]) || 5, 1), 10);
    const [stats, pointRows] = await Promise.all([
      statsManager.getTopStats(limit),
      db.getTopUsers(limit),
    ]);

    if (!stats.points.length && !pointRows.length) {
      return message.reply('لا يوجد لاعبين بعد.');
    }

    const legacyPoints = pointRows.map(([userId, points], index) => `**${index + 1}.** <@${userId}> — **${points}**`).join('\n') || 'لا توجد بيانات.';
    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle(`${emojis.stats} التوب والإحصائيات العامة`)
      .addFields(
        { name: `${emojis.points} أكثر اللاعبين حصولًا على النقاط`, value: userRows(stats.points, 'pointsEarned') },
        { name: `${emojis.points} أعلى رصيد حالي`, value: legacyPoints },
        { name: `${emojis.games} أكثر اللاعبين لعبًا`, value: userRows(stats.played, 'gamesPlayed') },
        { name: `${emojis.winner} أكثر اللاعبين فوزًا`, value: userRows(stats.wins, 'wins') },
        { name: 'أكثر الألعاب الفردية لعبًا', value: gameRows(stats.singlePlayed, 'participations') },
        { name: 'أكثر الألعاب الجماعية لعبًا', value: gameRows(stats.groupPlayed, 'participations') },
        { name: 'أكثر لعبة تم تشغيلها', value: gameRows(stats.runs, 'runs') },
        { name: 'أكثر لعبة تمت المشاركة فيها', value: gameRows(stats.participations, 'participations') },
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
