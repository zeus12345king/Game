const { ContainerBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const settings = require('../settings.js');

module.exports = {
  name: 'setchat',
  execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ | تحتاج صلاحية مدير لاستخدام هذا الأمر!');
    }
    const channel = message.mentions.channels.first() || message.channel;
    settings.addChannel(channel.id);
    const container = new ContainerBuilder()
      .setAccentColor(0x00FF00)
      .addTextDisplayComponents(t => t.setContent(`✅ | تم تعيين <#${channel.id}> كقناة للألعاب.`));
    message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
};
