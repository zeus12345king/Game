const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const statsManager = require('../core/statsManager.js');
const emojis = require('../core/emojis.js');

async function mentionList(rows, valueKey) {
  if (!rows.length) return 'لا توجد بيانات.';
  return rows.map((row, index) => `**${index + 1}.** <@${row.userId}> — **${row[valueKey] || 0}**`).join('\n');
}
function gameList(rows, valueKey) {
  if (!rows.length) return 'لا توجد بيانات.';
  return rows.map((row, index) => `**${index + 1}.** ${row.gameName} — **${row[valueKey] || 0}**`).join('\n');
}

module.exports = {
  name: 'top',
  data: new SlashCommandBuilder().setName('top').setDescription('عرض التوب والإحصائيات العامة'),
  async execute(interaction) {
    const data = await statsManager.getTopStats(5);
    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle(`${emojis.stats} التوب العام`)
      .addFields(
        { name: `${emojis.points} أكثر اللاعبين حصولًا على النقاط`, value: await mentionList(data.points, 'pointsEarned') },
        { name: `${emojis.games} أكثر اللاعبين لعبًا`, value: await mentionList(data.played, 'gamesPlayed') },
        { name: `${emojis.winner} أكثر اللاعبين فوزًا`, value: await mentionList(data.wins, 'wins') },
        { name: 'أكثر الألعاب الفردية لعبًا', value: gameList(data.singlePlayed, 'participations') },
        { name: 'أكثر الألعاب الجماعية لعبًا', value: gameList(data.groupPlayed, 'participations') },
        { name: 'أكثر لعبة تم تشغيلها', value: gameList(data.runs, 'runs') },
        { name: 'أكثر لعبة تمت المشاركة فيها', value: gameList(data.participations, 'participations') },
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  },
};
