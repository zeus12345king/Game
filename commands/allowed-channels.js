const { ContainerBuilder, MessageFlags } = require('discord.js');
const settings = require('../settings.js');

module.exports = {
  name: 'channels',
  aliases: ['القنوات', 'القنوات المسموحة'],
  execute(message) {
    const channels = settings.getAllowedChannels();
    const content = channels.length
      ? `## 📋 القنوات المسموحة للألعاب\n${channels.map(id => `<#${id}>`).join('\n')}\n-# إجمالي القنوات: ${channels.length}`
      : '❌ | لا توجد قنوات مسموحة حالياً.';
    const container = new ContainerBuilder()
      .setAccentColor(0x00FF00)
      .addTextDisplayComponents(t => t.setContent(content));
    message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
};
