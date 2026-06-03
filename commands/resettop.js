const { ContainerBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const db  = require('../database.js');
const inv = require('../inventory.js');
const config = require('../config.js');

const hasAdminPermission = (member) => {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (config.owners.includes(member.id)) return true;
  return member.roles.cache.some(r => config.adminRoles.includes(r.id));
};

module.exports = {
  name: 'تصفير',
  aliases: ['resettop', 'resetpoints'],
  async execute(message, args) {
    if (!hasAdminPermission(message.member)) {
      return message.reply({ content: '❌ | ليس لديك صلاحية لاستخدام هذا الأمر.' });
    }

    const topUsers = db.getTopUsers(10);
    const client = message.client;

    let listText = '';
    let rank = 1;
    const medals = ['🥇', '🥈', '🥉'];

    for (const [userId, points] of topUsers) {
      try {
        const user = await client.users.fetch(userId);
        const medal = rank <= 3 ? medals[rank - 1] : `**${rank}.**`;
        listText += `${medal} ${user.username} — ${points} نقطة\n`;
      } catch {
        const medal = rank <= 3 ? medals[rank - 1] : `**${rank}.**`;
        listText += `${medal} <@${userId}> — ${points} نقطة\n`;
      }
      rank++;
    }

    const confirmContainer = new ContainerBuilder()
      .setAccentColor(0xFF0000)
      .addTextDisplayComponents(t => t.setContent(
        `## ⚠️ تأكيد التصفير\nسيتم تصفير نقاط **جميع** اللاعبين.\n\n` +
        `**التوب الحالي:**\n${listText || 'لا يوجد لاعبين'}\n` +
        `-# اكتب \`تأكيد\` خلال 15 ثانية للمتابعة`
      ));

    await message.reply({ components: [confirmContainer], flags: MessageFlags.IsComponentsV2 });

    const collector = message.channel.createMessageCollector({
      filter: m => m.author.id === message.author.id,
      time: 15000,
      max: 1
    });

    collector.on('collect', async m => {
      if (m.content.trim() !== 'تأكيد') {
        const cancelContainer = new ContainerBuilder()
          .setAccentColor(0x808080)
          .addTextDisplayComponents(t => t.setContent('## ❌ تم إلغاء التصفير'));
        return message.channel.send({ components: [cancelContainer], flags: MessageFlags.IsComponentsV2 });
      }

      db.resetAllPoints();
      inv.resetAll();

      const doneContainer = new ContainerBuilder()
        .setAccentColor(0x00FF00)
        .addTextDisplayComponents(t => t.setContent(
          `## ✅ تم التصفير\nتم تصفير نقاط وممتلكات جميع اللاعبين بنجاح.\n-# بواسطة <@${message.author.id}>`
        ));
      message.channel.send({ components: [doneContainer], flags: MessageFlags.IsComponentsV2 });
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        const timeoutContainer = new ContainerBuilder()
          .setAccentColor(0x808080)
          .addTextDisplayComponents(t => t.setContent('## ⏰ انتهى الوقت — تم إلغاء التصفير'));
        message.channel.send({ components: [timeoutContainer], flags: MessageFlags.IsComponentsV2 });
      }
    });
  }
};
