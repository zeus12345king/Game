const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags } = require('discord.js');
const db = require('../database.js');
const config = require('../config.js');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const TIME_TO_START = config.lobbyTime.chairs;

module.exports = {
  name: 'chairs',
  aliases: ['كراسي'],
  execute(message, args, callback) {
    startGame(message, Math.floor(Date.now() / 1000 + TIME_TO_START / 1000), callback);
  }
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildLobby(nowTime, players) {
  const list = players.length ? players.map((id, i) => `> **${i + 1}.** <@${id}>`).join('\n') : '> لا يوجد لاعبين بعد';
  return new ContainerBuilder()
    .setAccentColor(config.colors.chairs)
    .addTextDisplayComponents(t => t.setContent(
      `## 🪑 لعبة الكراسي\n> الوقت المتبقي: <t:${nowTime}:R>\n\n**اللاعبون (${players.length}/${MAX_PLAYERS}):**\n${list}`
    ))
    .addMediaGalleryComponents(g => {
      const img = config.lobbyImages.chairs;
      if (img) g.addItems(item => item.setURL(img));
      return g;
    })
    .addActionRowComponents(r => r.setComponents(
      new ButtonBuilder().setCustomId('join').setLabel('دخول').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('exit').setLabel('خروج').setStyle(ButtonStyle.Danger)
    ));
}

async function startGame(context, nowTime, callback) {
  let players = [];
  const sentMessage = await context.reply({
    components: [buildLobby(nowTime, players)],
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true
  });

  const collector = sentMessage.createMessageComponentCollector({
    filter: i => i.customId === 'join' || i.customId === 'exit',
    time: TIME_TO_START
  });

  collector.on('collect', async i => {
    if (i.customId === 'join') {
      if (players.length >= MAX_PLAYERS) { await i.reply({ content: 'اللعبة ممتلئة!', ephemeral: true }); return; }
      if (players.includes(i.user.id)) { await i.reply({ content: 'أنت بالفعل في اللعبة!', ephemeral: true }); return; }
      players.push(i.user.id);
      await i.update({ components: [buildLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
    } else {
      if (!players.includes(i.user.id)) { await i.reply({ content: 'لم تكن في اللعبة.', ephemeral: true }); return; }
      players = players.filter(id => id !== i.user.id);
      await i.update({ components: [buildLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
    }
  });

  collector.on('end', async () => {
    if (players.length < MIN_PLAYERS) {
      await context.channel.send({ content: '👥 | لا يوجد عدد كافٍ من اللاعبين.' });
      callback(null, false, 0, null); return;
    }
    await context.channel.send({ content: '▶️ | اللعبة تبدأ الآن!' });
    await prepareRound(context, players, new Set(), new Set(), callback);
  });
}

async function prepareRound(context, players, reservedPlayers, eliminatedPlayers, callback) {
  if (players.length === 1) {
    const pts = config.winPoints.chairs;
    const points = typeof pts === 'object' ? Math.floor(Math.random() * (pts.max - pts.min + 1)) + pts.min : pts;
    db.addPoints(players[0], points);
    await context.channel.send({ content: `🏆 | الفائز هو <@${players[0]}>!` });
    callback(null, false, 0, null); return;
  }
  if (players.length === 0) {
    await context.channel.send({ content: '🤷 | لا يوجد فائز.' });
    callback(null, false, 0, null); return;
  }

  const numButtons = players.length - 1;
  const isGreen = Math.random() < 0.5;

  const waitRows = buildButtonRows(numButtons, i => `btn_${i}`, ButtonStyle.Secondary, true);
  const waitMsg = await context.channel.send({ content: '... 3 ...', components: waitRows });

  await sleep(5000);

  const activeRows = buildButtonRows(numButtons,
    i => isGreen ? `greenButton_${i}` : `redButton_${i}`,
    isGreen ? ButtonStyle.Success : ButtonStyle.Danger,
    false
  );

  await waitMsg.edit({
    content: isGreen ? '🟩 | اضغط على الزر الأخضر بأسرع ما يمكن!' : '🟥 | لا تضغط على الزر الأحمر!',
    components: activeRows
  });

  const reservedButtonIds = new Set(isGreen ? activeRows.flatMap(r => r.components.map(b => b.data.custom_id)) : []);
  const allButtonIds = new Set(activeRows.flatMap(r => r.components.map(b => b.data.custom_id)));

  const gameCollector = waitMsg.createMessageComponentCollector({
    filter: i => players.includes(i.user.id) && allButtonIds.has(i.customId),
    time: 5000
  });

  gameCollector.on('collect', async i => {
    if (eliminatedPlayers.has(i.user.id)) {
      await i.reply({ content: 'أنت لست في اللعبة.', ephemeral: true }); return;
    }
    if (i.customId.startsWith('redButton_')) {
      players = players.filter(id => id !== i.user.id);
      eliminatedPlayers.add(i.user.id);
      await i.reply({ content: `❌ | ضغطت على الزر الأحمر وتم استبعادك!`, ephemeral: true });
    } else if (i.customId.startsWith('greenButton_')) {
      if (reservedButtonIds.has(i.customId) && !reservedPlayers.has(i.user.id)) {
        reservedPlayers.add(i.user.id);
        reservedButtonIds.delete(i.customId);
        await i.reply({ content: '✅ | حجزت مكانك!', ephemeral: true });
      } else if (reservedPlayers.has(i.user.id)) {
        await i.reply({ content: '🔒 | حجزت بالفعل!', ephemeral: true });
      } else {
        await i.reply({ content: '🚫 | هذا المكان محجوز!', ephemeral: true });
      }
    }
  });

  gameCollector.on('end', async () => {
    activeRows.forEach(r => r.components.forEach(b => b.setDisabled(true)));
    try { await waitMsg.edit({ components: activeRows }); } catch (_) {}

    const eliminated = Array.from(eliminatedPlayers);
    if (eliminated.length > 0)
      await context.channel.send({ content: `❌ | تم طرد: ${eliminated.map(id => `<@${id}>`).join(', ')}` });

    if (isGreen) {
      const notReserved = players.filter(id => !reservedPlayers.has(id) && !eliminatedPlayers.has(id));
      if (notReserved.length > 0) {
        notReserved.forEach(id => eliminatedPlayers.add(id));
        await context.channel.send({ content: `🚫 | تم طرد لعدم الضغط: ${notReserved.map(id => `<@${id}>`).join(', ')}` });
      }
      players = Array.from(reservedPlayers);
    } else {
      players = players.filter(id => !eliminatedPlayers.has(id));
    }

    reservedPlayers.clear();
    eliminatedPlayers.clear();

    if (players.length <= 1) {
      if (players.length === 1) {
        const pts = config.winPoints.chairs;
        const points = typeof pts === 'object' ? Math.floor(Math.random() * (pts.max - pts.min + 1)) + pts.min : pts;
        db.addPoints(players[0], points);
        await context.channel.send({ content: `🏆 | الفائز هو <@${players[0]}>!` });
      } else {
        await context.channel.send({ content: '🤷 | لا يوجد فائز.' });
      }
      callback(null, false, 0, null); return;
    }

    await context.channel.send({ content: '🕒 | تبدأ الجولة القادمة بعد قليل...' });
    await prepareRound(context, players, reservedPlayers, eliminatedPlayers, callback);
  });
}

function buildButtonRows(count, idFn, style, disabled) {
  const rows = [];
  let row = new ActionRowBuilder();
  for (let i = 0; i < count; i++) {
    if (row.components.length === 5) { rows.push(row); row = new ActionRowBuilder(); }
    row.addComponents(new ButtonBuilder().setCustomId(idFn(i)).setLabel('▫️').setStyle(style).setDisabled(disabled));
  }
  if (row.components.length > 0) rows.push(row);
  return rows;
}