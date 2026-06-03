const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags } = require('discord.js');
const db = require('../database.js');
const config = require('../config.js');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 30;
const TIME_TO_START = config.lobbyTime.xo;
const TIME_TO_PLAY = 20000;

let GAME_ACTIVE = false;
let players = [];

module.exports = {
  name: 'xo',
  aliases: ['اكس'],
  execute(message, args, callback) {
    if (GAME_ACTIVE) {
      message.reply({ content: '❌ | لقد بدأت لعبة أخرى بالفعل.' });
      callback();
      return;
    }
    GAME_ACTIVE = true;
    startGame(message, Math.floor(Date.now() / 1000), callback);
  }
};

function resetGameData() { GAME_ACTIVE = false; players = []; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function win(id, context) {
  try {
    const pts = config.winPoints.xo;
    const points = typeof pts === 'object' ? Math.floor(Math.random() * (pts.max - pts.min + 1)) + pts.min : pts;
    await db.addPoints(id, points);
    if (context) context.channel.send(`🏆 | <@${id}> فاز بـ **${points}** نقطة!`).catch(() => {});
  } catch (_) {}
}

function buildLobby(nowTime, playerList) {
  const list = playerList.length ? playerList.map((p, i) => `> **${i + 1}.** <@${p.id}>`).join('\n') : '> لا يوجد لاعبين بعد';
  return new ContainerBuilder()
    .setAccentColor(config.colors.xo)
    .addTextDisplayComponents(t => t.setContent(
      `## ❌⭕ لعبة إكس أو\n> الوقت المتبقي: <t:${nowTime + TIME_TO_START / 1000}:R>\n\n` +
      `**اللاعبين (${playerList.length}/${MAX_PLAYERS}):**\n${list}`
    ))
    .addMediaGalleryComponents(g => {
      const img = config.lobbyImages.xo;
      if (img) g.addItems(item => item.setURL(img));
      return g;
    })
    .addActionRowComponents(r => r.setComponents(
      new ButtonBuilder().setCustomId('join').setLabel('دخول').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('exit').setLabel('خروج').setStyle(ButtonStyle.Danger)
    ));
}

async function startGame(context, nowTime, callback) {
  players = [];
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
      if (players.some(p => p.id === i.user.id)) { await i.reply({ content: 'أنت بالفعل في اللعبة!', ephemeral: true }); return; }
      players.push({ id: i.user.id, displayName: i.user.displayName });
      await i.update({ components: [buildLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
    } else {
      if (!players.some(p => p.id === i.user.id)) { await i.reply({ content: 'لم تكن في اللعبة.', ephemeral: true }); return; }
      players = players.filter(p => p.id !== i.user.id);
      await i.update({ components: [buildLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
    }
  });

  collector.on('end', async () => {
    const closed = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t => t.setContent(
        `## ❌⭕ لعبة إكس أو\n**انتهى وقت الانضمام!**\n\nاللاعبون: ${players.length ? players.map(p => `<@${p.id}>`).join(', ') : 'لا يوجد'}`
      ))
      .addActionRowComponents(r => r.setComponents(
        new ButtonBuilder().setCustomId('join').setLabel('دخول').setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId('exit').setLabel('خروج').setStyle(ButtonStyle.Danger).setDisabled(true)
      ));
    try { await sentMessage.edit({ components: [closed], flags: MessageFlags.IsComponentsV2 }); } catch (_) {}

    if (players.length < MIN_PLAYERS) {
      await context.channel.send({ content: 'لم يكتمل عدد اللاعبين. 🚪' });
      resetGameData(); callback(); return;
    }
    await context.channel.send({ content: '👥 | اللعبة ستبدأ الآن...' });
    await gameRound(context, callback);
  });
}

async function gameRound(context, callback) {
  if (players.length === 1) {
    await win(players[0].id, context);
    await context.channel.send({ content: `👑 <@${players[0].id}> فاز باللعبة!` });
    resetGameData(); callback(); return;
  }
  if (players.length === 0) {
    await context.channel.send({ content: '❌ لم يفز أحد.' });
    resetGameData(); callback(); return;
  }

  const shuffled = [...players].sort(() => 0.5 - Math.random());
  const p1 = shuffled[0], p2 = shuffled[1];

  const lastPlayer = players.length === 3 ? shuffled[2] : null;

  await context.channel.send({ content: `⚔️ ❌ <@${p1.id}> ضد ⭕ <@${p2.id}>` });
  await sleep(1000);

  const eliminated = await runMatch(context, p1, p2);
  players = players.filter(p => !eliminated.some(e => e.id === p.id));

  if (lastPlayer && eliminated.length === 2) {
    await win(lastPlayer.id, context);
    await context.channel.send({ content: `👑 <@${lastPlayer.id}> فاز باللعبة!` });
    resetGameData(); callback(); return;
  }

  await sleep(3000);
  await gameRound(context, callback);
}

async function runMatch(context, p1, p2) {
  return new Promise(async resolve => {
    const board = Array(9).fill(null);
    p1.symbol = '❌'; p2.symbol = '⭕';
    const gameMessage = await context.channel.send({ content: 'جارٍ تجهيز اللوحة...', components: xoButtons(board) });
    takeTurn(p1, p2, p1, board, gameMessage, resolve);
  });
}

async function takeTurn(p1, p2, cur, board, msg, resolve) {
  await msg.edit({
    content: `⚔️ ❌ <@${p1.id}> ضد ⭕ <@${p2.id}>\n<@${cur.id}> (${cur.symbol}) حان دورك — ${TIME_TO_PLAY / 1000} ثانية`,
    components: xoButtons(board)
  });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.customId.startsWith('xo_') && i.user.id === cur.id,
    time: TIME_TO_PLAY, max: 1
  });

  collector.on('collect', async i => {
    await i.deferUpdate();
    board[parseInt(i.customId.split('_')[1])] = cur.symbol;

    if (checkWin(board, cur.symbol)) {
      const loser = cur.id === p1.id ? p2 : p1;
      await msg.edit({ content: `🏆 <@${cur.id}> (${cur.symbol}) فاز! تم طرد <@${loser.id}>.`, components: xoButtons(board, true) });
      resolve([loser]); return;
    }
    if (checkTie(board)) {
      await msg.edit({ content: `💣 تعادل! تم طرد <@${p1.id}> و <@${p2.id}>.`, components: xoButtons(board, true) });
      resolve([p1, p2]); return;
    }
    takeTurn(p1, p2, cur.id === p1.id ? p2 : p1, board, msg, resolve);
  });

  collector.on('end', async collected => {
    if (collected.size === 0) {
      const winner = cur.id === p1.id ? p2 : p1;
      await msg.edit({ content: `💣 تم طرد <@${cur.id}> لعدم تفاعله. <@${winner.id}> يتأهل.`, components: xoButtons(board, true) });
      resolve([cur]);
    }
  });
}

function xoButtons(board, disabled = false) {
  return [0, 1, 2].map(row => {
    const r = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const i = row * 3 + c;
      const btn = new ButtonBuilder().setCustomId('xo_' + i);
      if (board[i]) {
        btn.setEmoji(board[i]).setStyle(board[i] === '❌' ? ButtonStyle.Danger : ButtonStyle.Success).setDisabled(true);
      } else {
        btn.setLabel('\u200b').setStyle(ButtonStyle.Secondary).setDisabled(disabled);
      }
      r.addComponents(btn);
    }
    return r;
  });
}

function checkWin(board, sym) {
  return [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
    .some(c => c.every(i => board[i] === sym));
}
function checkTie(board) {
  return board.every(c => c !== null) && !checkWin(board, '❌') && !checkWin(board, '⭕');
}