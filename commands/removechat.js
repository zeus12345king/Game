const { ContainerBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const settings = require('../settings.js');

module.exports = {
  name: 'removechat',
  execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ | تحتاج صلاحية مدير لاستخدام هذا الأمر!');
    }
    const channel = message.mentions.channels.first() || message.channel;
    if (!settings.isChannelAllowed(channel.id)) {
      return message.reply('❌ | هذه القناة غير مسجلة كقناة ألعاب.');
    }
    settings.removeChannel(channel.id);
    const container = new ContainerBuilder()
      .setAccentColor(0xFF0000)
      .addTextDisplayComponents(t => t.setContent(`❌ | تم إزالة <#${channel.id}> من قنوات الألعاب.`));
    message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
};
