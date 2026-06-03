const { PermissionFlagsBits } = require('discord.js');
const db     = require('../database.js');
const config = require('../config.js');

const hasAdminPermission = (member) => {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (config.owners.includes(member.id)) return true;
  return member.roles.cache.some(r => config.adminRoles.includes(r.id));
};

module.exports = {
  name: 'عطه',
  aliases: ['add', 'givepoints', 'اعطاء'],
  async execute(message, args) {
    if (!hasAdminPermission(message.member)) {
      return message.reply('ليس لديك صلاحية لاستخدام هذا الامر.');
    }

    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);

    if (!target) {
      return message.reply('يجب ذكر المستخدم. مثال: `-اعطنقاط @user 100`');
    }

    if (isNaN(amount) || amount <= 0) {
      return message.reply('يجب ادخال كمية صحيحة اكبر من صفر. مثال: `-اعطنقاط @user 100`');
    }

    db.addPoints(target.id, amount);
    const newPoints = db.getUserPoints(target.id);

    await message.reply(
      `تم اعطاء **${amount}** نقطة لـ **${target.username}**\n` +
      `رصيده الان: **${newPoints}** نقطة`
    );
  },
};
