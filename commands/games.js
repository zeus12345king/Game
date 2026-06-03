const {
  ContainerBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const config = require('../config.js');

const prefix = '-';

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
  { alias: 'مافيا',       emoji: '�️', desc: 'لعبة المافيا' },
  { alias: 'اكس',         emoji: '❌', desc: 'إكس أو' },
  { alias: 'حجرة',        emoji: '�', desc: 'حجرة ورقة مقص' },
  { alias: 'قنبلة',       emoji: '💣', desc: 'لعبة القنبلة' },
  { alias: 'كراسي',       emoji: '🪑', desc: 'لعبة الكراسي' },
  { alias: 'نرد',         emoji: '🎲', desc: 'لعبة النرد' },
  { alias: 'غميضة',       emoji: '🫣', desc: 'لعبة الغميضة' },
  { alias: 'ريبلكا',      emoji: '�', desc: 'نبات جماد حيوان' },
  { alias: 'زر',          emoji: '�', desc: 'لعبة الزر' },
  { alias: 'عكسي',        emoji: '🔄', desc: 'روليت عكسي — آخر واحد يفوز' },
  { alias: 'محبس',        emoji: '💍', desc: 'لعبة المحبس — فريقين' },
  { alias: 'براالسالفة',  emoji: '🕵️', desc: 'لعبة برا السالفة' },
];

const ADMIN_CMDS = [
  { cmd: 'setchat',      desc: 'تعيين قناة للألعاب' },
  { cmd: 'removechat',   desc: 'إزالة قناة من الألعاب' },
  { cmd: 'chaneels',     desc: 'عرض القنوات المسموحة' },
  { cmd: 'resettop',     desc: 'إعادة تعيين النقاط والممتلكات' },
  { cmd: 'عطه',      desc: 'إعطاء نقاط لمستخدم' },
  { cmd: 'خصم',      desc: 'خصم نقاط من مستخدم' },
];

const GENERAL_CMDS = [
  { cmd: 'نقاطي',  desc: 'عرض نقاطك' },
  { cmd: 'توب',    desc: 'قائمة أفضل اللاعبين' },
  { cmd: 'تحويل',  desc: 'تحويل نقاط لشخص آخر' },
  { cmd: 'متجر',   desc: 'متجر قدرات الروليت' },
  { cmd: 'العاب',  desc: 'قائمة الألعاب' },
];

function buildMenuContainer(requesterId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('games_menu')
    .setPlaceholder('اختر القائمة المطلوبة')
    .addOptions([
      { label: 'الأوامر الإدارية', value: 'admin'   },
      { label: 'الأوامر العامة',   value: 'general' },
      { label: 'الألعاب الفردية',  value: 'solo'  },
      { label: 'الألعاب الجماعية', value: 'group' },
    ]);

  return new ContainerBuilder()
    .setAccentColor(config.colors.roulette)
    .addMediaGalleryComponents(g => {
      const img = config.menuImage;
      if (img) g.addItems(item => item.setURL(img));
      return g;
    })
    .addTextDisplayComponents(t => t.setContent(`-# Requested by <@${requesterId}>`))
    .addActionRowComponents(r => r.setComponents(select));
}

function buildListContainer(type) {
  let title, list;

  if (type === 'solo') {
    title = '🎮 الألعاب الفردية';
    list = SOLO_GAMES.map(g => `${g.emoji} \`${prefix}${g.alias}\` — ${g.desc}`).join('\n');
  } else if (type === 'group') {
    title = '👥 الألعاب الجماعية';
    list = GROUP_GAMES.map(g => `${g.emoji} \`${prefix}${g.alias}\` — ${g.desc}`).join('\n');
  } else if (type === 'admin') {
    title = '👤 الأوامر الإدارية';
    list = ADMIN_CMDS.map(c => `\`${prefix}${c.cmd}\` — ${c.desc}`).join('\n');
  } else {
    title = '📋 الأوامر العامة';
    list = GENERAL_CMDS.map(c => `\`${prefix}${c.cmd}\` — ${c.desc}`).join('\n');
  }

  return new ContainerBuilder()
    .setAccentColor(config.colors.roulette)
    .addTextDisplayComponents(t => t.setContent(`## ${title}\n${list}`));
}

module.exports = {
  name: 'العاب',
  aliases: ['games', 'الالعاب', 'menu', 'منيو'],
  async execute(message) {
    const sent = await message.reply({
      components: [buildMenuContainer(message.author.id)],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    });

    const collector = sent.createMessageComponentCollector({
      filter: i => i.customId === 'games_menu' && i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async i => {
      await i.reply({
        components: [buildListContainer(i.values[0])],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      });
    });
  }
};
