const { ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../database.js');

module.exports = {
  name: 'button',
  aliases: ['زر'],
  execute(message, args, callback) {
    startGame(message, callback);
  }
};

async function startGame(context, callback) {
  try {
    const delay = Math.floor(Math.random() * 8000) + 3000;

    const wait = new ContainerBuilder()
      .setAccentColor(0xFF0000)
      .addTextDisplayComponents(t => t.setContent('## 🔴 لعبة الزر\n**استعد! سيظهر الزر قريباً...**\nأول من يضغط يفوز!'));

    await context.channel.send({ components: [wait], flags: MessageFlags.IsComponentsV2 });

    await new Promise(r => setTimeout(r, delay));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('press_button').setLabel('اضغط الآن! 🟢').setStyle(ButtonStyle.Success)
    );

    const startTime = Date.now();

    const gameContainer = new ContainerBuilder()
      .setAccentColor(0x00FF00)
      .addTextDisplayComponents(t => t.setContent('## 🟢 اضغط الزر الآن!'))
      .addActionRowComponents(r => r.setComponents(
        new ButtonBuilder().setCustomId('press_button').setLabel('اضغط الآن! 🟢').setStyle(ButtonStyle.Success)
      ));

    const gameMsg = await context.channel.send({ components: [gameContainer], flags: MessageFlags.IsComponentsV2 });

    const collector = gameMsg.createMessageComponentCollector({
      filter: (i) => i.customId === 'press_button' && !i.user.bot,
      time: 10000,
      max: 1
    });

    collector.on('collect', async (i) => {
      const timeTaken = (Date.now() - startTime) / 1000;
      const points = timeTaken < 1 ? 10 : timeTaken < 2 ? 8 : timeTaken < 3 ? 6 : timeTaken < 5 ? 4 : 2;

      await db.addPoints(i.user.id, points);
      const total = db.getUserPoints(i.user.id);

      const doneContainer = new ContainerBuilder()
        .setAccentColor(0x00FF00)
        .addTextDisplayComponents(t => t.setContent('## 🟢 تم الضغط!'))
        .addActionRowComponents(r => r.setComponents(
          new ButtonBuilder().setCustomId('press_button').setLabel('تم الضغط ✅').setStyle(ButtonStyle.Success).setDisabled(true)
        ));

      await i.update({ components: [doneContainer], flags: MessageFlags.IsComponentsV2 });

      const win = new ContainerBuilder()
        .setAccentColor(0x00FF00)
        .addTextDisplayComponents(t => t.setContent(
          `## 🏆 فاز!\n<@${i.user.id}> ضغط الزر أولاً!\n\n` +
          `⚡ **الوقت:** ${timeTaken.toFixed(3)} ثانية\n` +
          `💰 **النقاط:** ${points}\n` +
          `💎 **الإجمالي:** ${total}`
        ));

      await context.channel.send({ components: [win], flags: MessageFlags.IsComponentsV2 });
      callback(i.user.id, true, timeTaken, null);
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'limit') return;

      const expiredContainer = new ContainerBuilder()
        .setAccentColor(0xFF0000)
        .addTextDisplayComponents(t => t.setContent('## ⏰ انتهى الوقت!'))
        .addActionRowComponents(r => r.setComponents(
          new ButtonBuilder().setCustomId('press_button').setLabel('انتهى الوقت').setStyle(ButtonStyle.Danger).setDisabled(true)
        ));

      await gameMsg.edit({ components: [expiredContainer], flags: MessageFlags.IsComponentsV2 });
      callback(null, false, 10, null);
    });

  } catch (error) {
    console.error('[زر] Error:', error);
    callback(null, false, 0, null);
  }
}
