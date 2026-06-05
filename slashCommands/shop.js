const { SlashCommandBuilder } = require('discord.js');
const { createMessageAdapter } = require('../core/slashAdapter.js');

module.exports = {
  name: 'shop',
  data: new SlashCommandBuilder().setName('shop').setDescription('عرض المتجر الموحد'),
  async execute(interaction) {
    const command = interaction.client.commands.get('متجر') || interaction.client.commands.get('shop');
    if (!command) return interaction.reply({ content: 'المتجر غير متاح.', ephemeral: true });
    return command.execute(createMessageAdapter(interaction), []);
  },
};
