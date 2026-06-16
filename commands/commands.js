const { ContainerBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const config = require('../config.js');

const ADMIN_CMDS = [
  { cmd: 'setchat',      desc: 'تعيين قناة للألعاب' },
  { cmd: 'removechat',   desc: 'إزالة قناة من الألعاب' },
  { cmd: 'channels',     desc: 'عرض القنوات المسموحة' },
  { cmd: 'resettop',     desc: 'إعادة تعيين النقاط والممتلكات' },
  { cmd: 'عطه',          desc: 'إعطاء نقاط لمستخدم' },
  { cmd: 'خصم',          desc: 'خصم نقاط من مستخدم' },
];

const GENERAL_CMDS = [
  { cmd: 'نقاطي',  desc: 'عرض نقاطك' },
  { cmd: 'توب',    desc: 'قائمة أفضل اللاعبين' },
  { cmd: 'تحويل',  desc: 'تحويل نقاط لشخص آخر' },
  { cmd: 'متجر',   desc: 'متجر قدرات الروليت' },
  { cmd: 'العاب',  desc: 'قائمة الألعاب' },
  { cmd: 'اوامر',  desc: 'عرض قائمة الأوامر' },
  { cmd: 'احصائياتي', desc: 'إحصائيات اللاعب' },
  { cmd: 'ممتلكاتي', desc: 'عرض قدراتك' },
  { cmd: 'تصويت',  desc: 'إنشاء تصويت لاختيار لعبة' },
  { cmd: 'ايقاف',  desc: 'إيقاف اللعبة النشطة' },
];

function buildCommandsContainer(type, requesterId) {
  let title, list;
  const prefix = config.prefix;

  if (type === 'admin') {
    title = '👑 الأوامر الإدارية';
    list = ADMIN_CMDS.map(c => `\`${prefix}${c.cmd}\` — ${c.desc}`).join('\n');
  } else {
    title = '📋 الأوامر العامة';
    list = GENERAL_CMDS.map(c => `\`${prefix}${c.cmd}\` — ${c.desc}`).join('\n');
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('commands_switch')
    .setPlaceholder('اختر نوع الأوامر')
    .addOptions([
      { label: 'الأوامر العامة', value: 'general', default: type === 'general' },
      { label: 'الأوامر الإدارية', value: 'admin', default: type === 'admin' },
    ]);

  return new ContainerBuilder()
    .setAccentColor(config.colors.roulette)
    .addMediaGalleryComponents(g => {
      const img = config.menuImage;
      if (img) g.addItems(item => item.setURL(img));
      return g;
    })
    .addTextDisplayComponents(t => t.setContent(`## ${title}\n${list}\n-# طلب بواسطة <@${requesterId}>\n**ملاحظة:** الأوامر الإدارية تتطلب صلاحية مدير أو الرتب المحددة في الإعدادات.`))
    .addActionRowComponents(r => r.setComponents(select));
}

module.exports = {
  name: 'اوامر',
  aliases: ['commands', 'help', 'مساعدة', 'الاوامر'],
  async execute(message) {
    const sent = await message.reply({
      components: [buildCommandsContainer('general', message.author.id)],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    });

    const collector = sent.createMessageComponentCollector({
      filter: i => i.customId === 'commands_switch' && i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async i => {
      const newType = i.values[0];
      await i.update({
        components: [buildCommandsContainer(newType, message.author.id)],
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