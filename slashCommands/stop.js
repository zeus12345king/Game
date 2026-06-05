const { SlashCommandBuilder } = require('discord.js');
const sessionManager = require('../core/sessionManager.js');

module.exports = {
  name: 'stop',
  data: new SlashCommandBuilder().setName('stop').setDescription('إيقاف اللعبة الحالية في القناة'),
  async execute(interaction) {
    const stopped = await sessionManager.stop(interaction.channelId, 'slash-stop');
    if (!stopped) return interaction.reply({ content: 'لا توجد لعبة نشطة في هذه القناة.', ephemeral: true });
    return interaction.reply(`${require('../core/emojis.js').stop} | تم إيقاف لعبة **${stopped.gameName}** وتنظيف الجلسة.`);
  },
};
