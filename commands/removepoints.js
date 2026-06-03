const { PermissionFlagsBits } = require('discord.js');
const db     = require('../database.js');
const config = require('../config.js');

const hasAdminPermission = (member) => {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (config.owners.includes(member.id)) return true;
  return member.roles.cache.some(r => config.adminRoles.includes(r.id));
};

module.exports = {
  name: 'خصم',
  aliases: ['rpoints', 'deductpoints', 'تخصيم'],
  async execute(message, args) {
    if (!hasAdminPermission(message.member)) {
      return message.reply('ليس لديك صلاحية لاستخدام هذا الامر.');
    }

    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);

    if (!target) {
      return message.reply('يجب ذكر المستخدم. مثال: `-خصمنقاط @user 50`');
    }

    if (isNaN(amount) || amount <= 0) {
      return message.reply('يجب ادخال كمية صحيحة اكبر من صفر. مثال: `-خصمنقاط @user 50`');
    }

    const before = db.getUserPoints(target.id);

    if (before === 0) {
      return message.reply(`**${target.username}** ما عنده نقاط اصلاً.`);
    }

    db.removePoints(target.id, amount);
    const after = db.getUserPoints(target.id);
    const deducted = before - after;

    await message.reply(
      `تم خصم **${deducted}** نقطة من **${target.username}**\n` +
      `رصيده الان: **${after}** نقطة`
    );
  },
};
