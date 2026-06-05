const { SlashCommandBuilder } = require('discord.js');
const { createMessageAdapter } = require('../core/slashAdapter.js');

module.exports = {
  name: 'start',
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('بدء لعبة')
    .addStringOption((option) => option.setName('game').setDescription('اسم اللعبة').setRequired(true).setAutocomplete(true))
    .addStringOption((option) => option.setName('mode').setDescription('وضع اللعب').setRequired(false)),
  async execute(interaction) {
    const gameName = interaction.options.getString('game');
    const game = interaction.client.findGame(gameName);
    if (!game) return interaction.reply({ content: '❌ | اللعبة غير موجودة.', ephemeral: true });
    const adapter = createMessageAdapter(interaction);
    return interaction.client.runGame(adapter, game, [interaction.options.getString('mode')].filter(Boolean));
  },
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = [...interaction.client.games.values()].map((game) => game.name).filter((name) => name.toLowerCase().includes(focused)).slice(0, 25);
    return interaction.respond(choices.map((name) => ({ name, value: name })));
  },
};
