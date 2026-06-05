const { SlashCommandBuilder } = require('discord.js');
const { sendStats } = require('../commands/stats.js');

module.exports = {
  name: 'stats',
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('عرض إحصائيات لاعب')
    .addUserOption((option) => option.setName('user').setDescription('اللاعب').setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    return sendStats(interaction, user);
  },
};
