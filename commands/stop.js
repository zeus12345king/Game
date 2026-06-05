const sessionManager = require('../core/sessionManager.js');
const emojis = require('../core/emojis.js');

module.exports = {
  name: 'ايقاف',
  aliases: ['stop', 'إيقاف'],
  async execute(message) {
    const stopped = await sessionManager.stop(message.channel.id, 'prefix-stop');
    if (!stopped) return message.reply('لا توجد لعبة نشطة في هذه القناة.');
    return message.reply(`${emojis.stop} | تم إيقاف لعبة **${stopped.gameName}** وتنظيف الجلسة.`);
  },
};
