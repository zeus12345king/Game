const { EmbedBuilder } = require('discord.js');
const db = require('../database.js');

module.exports = {
  name: 'تحويل',
  aliases: ['transfer', 'give'],
  execute(message, args) {
    if (args.length < 2) {
      return message.reply('❌ | الاستخدام الصحيح: `-تحويل @المستخدم <عدد النقاط>`');
    }

    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) {
      return message.reply('❌ | يجب عليك ذكر المستخدم الذي تريد تحويل النقاط إليه');
    }

    if (mentionedUser.id === message.author.id) {
      return message.reply('❌ | لا يمكنك تحويل النقاط لنفسك');
    }

    const pointsToTransfer = parseInt(args[1]);
    if (isNaN(pointsToTransfer) || pointsToTransfer <= 0) {
      return message.reply('❌ | يجب أن يكون عدد النقاط رقماً صحيحاً أكبر من صفر');
    }

    const result = db.transferPoints(message.author.id, mentionedUser.id, pointsToTransfer);

    if (!result.success) {
      return message.reply(`❌ | ${result.error}`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ | تم التحويل بنجاح')
      .setDescription(
        `تم تحويل **${pointsToTransfer}** نقطة${pointsToTransfer !== 1 ? 'ات' : ''} من <@${message.author.id}> إلى <@${mentionedUser.id}>\n\n` +
        `نقاطك المتبقية: **${result.fromRemaining}**\n` +
        `نقاط ${mentionedUser.username}: **${result.toTotal}**`
      )
      .setTimestamp();

    message.reply({ embeds: [embed] });
  }
};

