const { ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags } = require('discord.js');
const config = require('../config.js');
const emojis = require('./emojis.js');

function buildLobby(options = {}) {
  const gameName = options.gameName || 'game';
  const title = options.title || `لعبة ${gameName}`;
  const players = options.players || [];
  const maxPlayers = options.maxPlayers || 20;
  const minPlayers = options.minPlayers || 2;
  const endsAt = options.endsAt || Math.floor((Date.now() + (options.lobbyTime || config.lobbyTime?.[gameName] || 40000)) / 1000);
  const color = options.color ?? config.colors?.[gameName] ?? config.colors?.neutral ?? 0xFFFFFF;
  const image = options.image ?? config.lobbyImages?.[gameName];
  const playerList = players.length
    ? players.map((p, index) => `> **${index + 1}.** ${emojis.player} <@${p.id || p}>`).join('\n')
    : '> لا يوجد لاعبين بعد';

  const text = [
    `## ${options.emoji || emojis.games} ${title}`,
    `> ${emojis.timer} الوقت المتبقي: <t:${endsAt}:R>`,
    '',
    `**${emojis.player} اللاعبون (${players.length}/${maxPlayers})**`,
    playerList,
    '',
    `> الحد الأدنى: **${minPlayers}**`,
    ...(options.extraInfo || []),
  ].join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents((component) => component.setContent(text));

  if (image) {
    container.addMediaGalleryComponents((gallery) => {
      gallery.addItems((item) => item.setURL(image));
      return gallery;
    });
  }

  const buttons = [
    new ButtonBuilder().setCustomId(options.joinId || 'join').setLabel('دخول').setEmoji(emojis.join).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(options.exitId || 'exit').setLabel('خروج').setEmoji(emojis.leave).setStyle(ButtonStyle.Danger),
  ];
  if (options.hasShop) buttons.push(new ButtonBuilder().setCustomId(options.shopId || `${gameName}:shop`).setLabel('المتجر').setEmoji(emojis.shop).setStyle(ButtonStyle.Secondary));
  if (Array.isArray(options.extraButtons)) buttons.push(...options.extraButtons);
  container.addActionRowComponents((row) => row.setComponents(...buttons.slice(0, 5)));
  return container;
}

module.exports = { buildLobby, lobbyMessageFlags: MessageFlags.IsComponentsV2 };
