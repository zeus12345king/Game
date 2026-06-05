const { SlashCommandBuilder } = require('discord.js');
const { createVote } = require('../commands/vote.js');

module.exports = {
  name: 'vote',
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('إنشاء تصويت لاختيار لعبة')
    .addStringOption((option) => option.setName('games').setDescription('أسماء الألعاب مفصولة بمسافة أو فاصلة').setRequired(true))
    .addIntegerOption((option) => option.setName('seconds').setDescription('مدة التصويت بالثواني').setRequired(false)),
  async execute(interaction) {
    if (!interaction.client.hasAdminPermission(interaction.member)) return interaction.reply({ content: 'هذا الأمر لمسؤولي الفعاليات فقط.', ephemeral: true });
    const names = interaction.options.getString('games').split(/[ ,،]+/).filter(Boolean);
    const selectedGames = names.map((name) => interaction.client.findGame(name)).filter(Boolean).slice(0, 5);
    if (!selectedGames.length) return interaction.reply({ content: 'لم يتم العثور على أي لعبة من الاختيارات.', ephemeral: true });
    return createVote({ target: interaction, author: interaction.user, client: interaction.client, selectedGames, durationSeconds: interaction.options.getInteger('seconds') });
  },
};
