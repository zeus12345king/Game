const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } = require('discord.js');
const gameModes = require('../core/gameModes.js');
const emojis = require('../core/emojis.js');

module.exports = {
  name: 'gamemode',
  data: new SlashCommandBuilder()
    .setName('gamemode')
    .setDescription('إدارة أوضاع اللعب')
    .addStringOption((option) => option.setName('game').setDescription('اللعبة').setRequired(true).setAutocomplete(true)),
  async execute(interaction) {
    const gameName = interaction.options.getString('game');
    const game = interaction.client.findGame(gameName);
    if (!game) return interaction.reply({ content: 'اللعبة غير موجودة.', ephemeral: true });
    const modes = await gameModes.listModes(game.name);
    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle(`${emojis.mode} أوضاع ${game.name}`)
      .setDescription(modes.map((mode) => `**${mode.label}** \`${mode.modeId}\` — ${mode.enabled ? 'مفعل' : 'معطل'} — اللوبي: ${mode.lobbyTime || 'افتراضي'}`).join('\n'));
    const menu = new StringSelectMenuBuilder()
      .setCustomId('gamemode_select')
      .setPlaceholder('اختر وضعًا')
      .addOptions(modes.map((mode) => ({ label: mode.label, value: mode.modeId, description: mode.enabled ? 'مفعل' : 'معطل' })));
    const row = new ActionRowBuilder().addComponents(menu);
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gamemode_enable').setLabel('تفعيل').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('gamemode_disable').setLabel('تعطيل').setStyle(ButtonStyle.Danger),
    );
    const msg = await interaction.reply({ embeds: [embed], components: [row, buttons], ephemeral: true, fetchReply: true });
    let selected = modes[0]?.modeId;
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 120000 });
    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) return i.reply({ content: 'هذا التحكم ليس لك.', ephemeral: true });
      selected = i.values[0];
      return i.update({ content: `تم اختيار الوضع: **${selected}**`, embeds: [embed], components: [row, buttons] });
    });
    const buttonCollector = msg.createMessageComponentCollector({ time: 120000 });
    buttonCollector.on('collect', async (i) => {
      if (!['gamemode_enable', 'gamemode_disable'].includes(i.customId)) return;
      if (i.user.id !== interaction.user.id) return i.reply({ content: 'هذا التحكم ليس لك.', ephemeral: true });
      const enabled = i.customId === 'gamemode_enable';
      await gameModes.setModeEnabled(game.name, selected, enabled);
      const newModes = await gameModes.listModes(game.name);
      embed.setDescription(newModes.map((mode) => `**${mode.label}** \`${mode.modeId}\` — ${mode.enabled ? 'مفعل' : 'معطل'} — اللوبي: ${mode.lobbyTime || 'افتراضي'}`).join('\n'));
      return i.update({ content: `تم ${enabled ? 'تفعيل' : 'تعطيل'} الوضع **${selected}**.`, embeds: [embed], components: [row, buttons] });
    });
  },
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = [...interaction.client.games.values()].map((game) => game.name).filter((name) => name.toLowerCase().includes(focused)).slice(0, 25);
    return interaction.respond(choices.map((name) => ({ name, value: name })));
  },
};
