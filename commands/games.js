const { ContainerBuilder, StringSelectMenuBuilder, MessageFlags, ActionRowBuilder } = require('discord.js');
const config = require('../config.js');

const SOLO_GAMES = [
  { alias: 'اسرع',     emoji: '⚡', desc: 'اكتب الكلمة بأسرع ما يمكن' },
  { alias: 'اعلام',    emoji: '🏳️', desc: 'خمن العلم' },
  { alias: 'سؤال',     emoji: '❓', desc: 'سؤال وجواب' },
  { alias: 'حكمة',     emoji: '💡', desc: 'حكمة اليوم' },
  { alias: 'نكتة',     emoji: '😂', desc: 'نكتة عشوائية' },
  { alias: 'كت',       emoji: '🗨️', desc: 'سؤال للتفكير' },
  { alias: 'لوخيروك',  emoji: '🤔', desc: 'لو خيروك بين خيارين' },
];

const GROUP_GAMES = [
  { alias: 'روليت',       emoji: '🎰', desc: 'لعبة الروليت' },
  { alias: 'مافيا',       emoji: '🕵️', desc: 'لعبة المافيا' },
  { alias: 'اكس',         emoji: '❌', desc: 'إكس أو' },
  { alias: 'حجرة',        emoji: '✂️', desc: 'حجرة ورقة مقص' },
  { alias: 'قنبلة',       emoji: '💣', desc: 'لعبة القنبلة' },
  { alias: 'كراسي',       emoji: '🪑', desc: 'لعبة الكراسي' },
  { alias: 'نرد',         emoji: '🎲', desc: 'لعبة النرد' },
  { alias: 'غميضة',       emoji: '🫣', desc: 'لعبة الغميضة' },
  { alias: 'ريبلكا',      emoji: '🐾', desc: 'نبات جماد حيوان' },
  { alias: 'زر',          emoji: '🔘', desc: 'لعبة الزر' },
  { alias: 'عكسي',        emoji: '🔄', desc: 'روليت عكسي — آخر واحد يفوز' },
  { alias: 'محبس',        emoji: '💍', desc: 'لعبة المحبس — فريقين' },
  { alias: 'براالسالفة',  emoji: '🕵️', desc: 'لعبة برا السالفة' },
];

function buildGameContainer(type) {
  let title, list;
  const prefix = config.prefix;

  if (type === 'group') {
    title = '<:z3:1516262248274722897> الألعاب الجماعية';
    list = GROUP_GAMES.map(g => `${g.emoji} \`${prefix}${g.alias}\` — ${g.desc}`).join('\n');
  } else {
    title = '<:z3:1516262248274722897> الألعاب الفردية';
    list = SOLO_GAMES.map(g => `${g.emoji} \`${prefix}${g.alias}\` — ${g.desc}`).join('\n');
  }

  return new ContainerBuilder()
    .setAccentColor(0xD48A9C)
    .addTextDisplayComponents(t => t.setContent(`## ${title}\n${list}`))
    .addMediaGalleryComponents(g => {
      const img = config.‏gamesMenuImage;
      if (img) g.addItems(item => item.setURL(img));
      return g;
    });
}

function buildSelectMenu(type) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('games_switch')
    .setPlaceholder('اختر نوع الألعاب')
    .addOptions([
      { label: 'ألعاب جماعية', value: 'group', emoji: '<:z18:1515279195201339392>', default: type === 'group' },
      { label: 'ألعاب فردية', value: 'solo', emoji: '<:z1:1511780346008436946>', default: type === 'solo' },
    ]);

  return new ActionRowBuilder().addComponents(select);
}

module.exports = {
  name: 'العاب',
  aliases: ['games', 'الالعاب', 'menu', 'منيو'],
  async execute(message) {
    const container = buildGameContainer('group');
    const row = buildSelectMenu('group');

    const sent = await message.reply({
      components: [container, row],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    });

    const collector = sent.createMessageComponentCollector({
      filter: i => i.customId === 'games_switch' && i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async i => {
      const newType = i.values[0];
      const newContainer = buildGameContainer(newType);
      const newRow = buildSelectMenu(newType);
      await i.update({
        components: [newContainer, newRow],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on('end', async () => {
      try {
        await sent.edit({ components: [] });
      } catch (_) {}
    });
  }
};