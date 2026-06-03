const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} = require('discord.js');
const db = require('../database.js');
const config = require('../config.js');

const MAX_PER_TEAM = 10;
const TOTAL_ROUNDS = 10;
const HIDE_TIME    = 20000; 
const GUESS_TIME   = 30000; 

let GAME_ACTIVE = false;

module.exports = {
  name: 'محبس',
  aliases: ['mahbas'],
  execute(message, args, callback) {
    if (GAME_ACTIVE) {
      message.reply('> **❌ | لقد بدأت لعبة أخرى بالفعل.**');
      callback();
      return;
    }
    GAME_ACTIVE = true;
    startGame(message, Math.floor(Date.now() / 1000), callback);
  }
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function resetGame() { GAME_ACTIVE = false; }

function buildLobby(nowTime, teamA, teamB) {
  const listA = teamA.length ? teamA.map((id, i) => `> **${i+1}.** <@${id}>`).join('\n') : '> لا يوجد';
  const listB = teamB.length ? teamB.map((id, i) => `> **${i+1}.** <@${id}>`).join('\n') : '> لا يوجد';
  const TIME_TO_START = config.lobbyTime.mahbas;
  return new ContainerBuilder()
    .setAccentColor(config.colors.mahbas)
    .addTextDisplayComponents(t => t.setContent(
      `## 💍 لعبة المحبس\n> الوقت المتبقي: <t:${nowTime + TIME_TO_START / 1000}:R>\n\n` +
      `**الفريق الأول (${teamA.length}/${MAX_PER_TEAM}):**\n${listA}\n\n` +
      `**الفريق الثاني (${teamB.length}/${MAX_PER_TEAM}):**\n${listB}`
    ))
    .addMediaGalleryComponents(g => { const img = config.lobbyImages.mahbas; if (img) g.addItems(i => i.setURL(img)); return g; })
    .addActionRowComponents(r => r.setComponents(
      new ButtonBuilder().setCustomId('join_a').setLabel('انضم للفريق الأول').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('join_b').setLabel('انضم للفريق الثاني').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('leave').setLabel('خروج').setStyle(ButtonStyle.Danger)
    ));
}

async function startGame(context, nowTime, callback) {
  let teamA = [], teamB = [];
  const TIME_TO_START = config.lobbyTime.mahbas;

  const sent = await context.reply({
    components: [buildLobby(nowTime, teamA, teamB)],
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true,
  });

  const collector = sent.createMessageComponentCollector({
    filter: i => ['join_a','join_b','leave'].includes(i.customId),
    time: TIME_TO_START,
  });

  collector.on('collect', async i => {
    const id = i.user.id;
    if (i.customId === 'join_a') {
      if (teamA.includes(id) || teamB.includes(id)) { await i.reply({ content: 'أنت بالفعل في فريق!', ephemeral: true }); return; }
      if (teamA.length >= MAX_PER_TEAM) { await i.reply({ content: 'الفريق الأول ممتلئ!', ephemeral: true }); return; }
      teamA.push(id);
      await i.update({ components: [buildLobby(nowTime, teamA, teamB)], flags: MessageFlags.IsComponentsV2 });
    } else if (i.customId === 'join_b') {
      if (teamA.includes(id) || teamB.includes(id)) { await i.reply({ content: 'أنت بالفعل في فريق!', ephemeral: true }); return; }
      if (teamB.length >= MAX_PER_TEAM) { await i.reply({ content: 'الفريق الثاني ممتلئ!', ephemeral: true }); return; }
      teamB.push(id);
      await i.update({ components: [buildLobby(nowTime, teamA, teamB)], flags: MessageFlags.IsComponentsV2 });
    } else {
      teamA = teamA.filter(x => x !== id);
      teamB = teamB.filter(x => x !== id);
      await i.update({ components: [buildLobby(nowTime, teamA, teamB)], flags: MessageFlags.IsComponentsV2 });
    }
  });

  collector.on('end', async () => {
    if (teamA.length < 2 || teamB.length < 2) {
      await context.channel.send('❌ | لم يكتمل عدد اللاعبين. يجب لاعبان على الأقل في كل فريق.');
      resetGame(); callback(); return;
    }
    await context.channel.send('▶️ | اللعبة تبدأ الآن!');
    await sleep(2000);
    await gameLoop(context, teamA, teamB, 0, 0, 0, callback);
  });
}

async function gameLoop(context, teamA, teamB, round, scoreA, scoreB, callback) {
  if (round >= TOTAL_ROUNDS) {

    let result;
    if (scoreA > scoreB) result = `🏆 | فاز **الفريق الأول** بنتيجة **${scoreA}** - **${scoreB}**!`;
    else if (scoreB > scoreA) result = `🏆 | فاز **الفريق الثاني** بنتيجة **${scoreB}** - **${scoreA}**!`;
    else result = `🤝 | تعادل! **${scoreA}** - **${scoreB}**`;

    await context.channel.send(result);

    const winners = scoreA > scoreB ? teamA : scoreB > scoreA ? teamB : [...teamA, ...teamB];
    const pts = config.winPoints.mahbas;
    for (const id of winners) await db.addPoints(id, pts);
    if (winners.length > 0 && scoreA !== scoreB)
      await context.channel.send(`🏆 | الفائزون حصلوا على **${pts}** نقطة لكل واحد!`);

    resetGame(); callback(); return;
  }

  const hidingTeam  = round % 2 === 0 ? teamA : teamB;
  const guessingTeam = round % 2 === 0 ? teamB : teamA;
  const hidingName  = round % 2 === 0 ? 'الفريق الأول' : 'الفريق الثاني';
  const guessingName = round % 2 === 0 ? 'الفريق الثاني' : 'الفريق الأول';

  await context.channel.send(
    `---\n## 💍 الجولة ${round + 1} / ${TOTAL_ROUNDS}\n` +
    `📊 النتيجة: **الفريق الأول ${scoreA}** - **${scoreB} الفريق الثاني**\n\n` +
    `🫴 **${hidingName}** يخبي المحبس | 🔍 **${guessingName}** يخمن`
  );
  await sleep(2000);

  const hiderLeader = hidingTeam[0];

  await context.channel.send(`<@${hiderLeader}> | أنت قائد **${hidingName}**! اختر من سيحمل المحبس (DM سيُرسل لك).`);

  const hideRows = buildTeamButtons(hidingTeam, 'hide');
  let hiddenHolder = null;

  try {
    const dmChannel = await (await context.client.users.fetch(hiderLeader)).createDM();
    const dmMsg = await dmChannel.send({
      content: `💍 | اختر من سيحمل المحبس في فريقك (${HIDE_TIME/1000} ثانية):`,
      components: hideRows,
    });

    const dmCollector = dmMsg.createMessageComponentCollector({
      filter: i => i.user.id === hiderLeader && i.customId.startsWith('hide_'),
      time: HIDE_TIME,
      max: 1,
    });

    hiddenHolder = await new Promise(resolve => {
      dmCollector.on('collect', async i => {
        const chosen = i.customId.replace('hide_', '');
        await i.update({ content: `✅ | اخترت <@${chosen}> لحمل المحبس!`, components: [] });
        resolve(chosen);
      });
      dmCollector.on('end', col => { if (col.size === 0) resolve(hidingTeam[Math.floor(Math.random() * hidingTeam.length)]); });
    });
  } catch (e) {

    hiddenHolder = hidingTeam[Math.floor(Math.random() * hidingTeam.length)];
    await context.channel.send(`⚠️ | لم يتمكن القائد من الاختيار، تم الاختيار عشوائياً.`);
  }

  await context.channel.send(`✅ | تم إخفاء المحبس! الآن دور **${guessingName}** للتخمين.`);
  await sleep(2000);

  const guessLeader = guessingTeam[0];
  await context.channel.send(
    `<@${guessLeader}> | أنت قائد **${guessingName}**!\n` +
    `يمكنك التخمين بنفسك أو تفويض أحد من فريقك.\n` +
    `لديك **${GUESS_TIME/1000} ثانية**.`
  );

  const guessRows = buildTeamButtons(hidingTeam, 'guess');

  const delegateRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('delegate').setLabel('فوّض لاعب من فريقك').setStyle(ButtonStyle.Secondary)
  );

  const guessMsg = await context.channel.send({
    content: `🔍 | <@${guessLeader}> اختر من يحمل المحبس في **${hidingName}**:`,
    components: [...guessRows, delegateRow],
  });

  let actualGuesser = guessLeader;
  let guessedId = null;

  const guessCollector = guessMsg.createMessageComponentCollector({
    filter: i => (i.customId.startsWith('guess_') || i.customId === 'delegate') &&
                 (i.user.id === actualGuesser || guessingTeam.includes(i.user.id)),
    time: GUESS_TIME,
  });

  guessedId = await new Promise(resolve => {
    guessCollector.on('collect', async i => {
      if (i.customId === 'delegate' && i.user.id === actualGuesser) {

        const delegateRows = buildTeamButtons(guessingTeam.filter(x => x !== actualGuesser), 'delegate');
        await i.update({ content: `<@${actualGuesser}> اختر من تفوضه:`, components: delegateRows });
        return;
      }
      if (i.customId.startsWith('delegate_') && i.user.id === actualGuesser) {
        actualGuesser = i.customId.replace('delegate_', '');
        await i.update({
          content: `✅ | تم تفويض <@${actualGuesser}> للتخمين!`,
          components: [...guessRows, delegateRow],
        });
        return;
      }
      if (i.customId.startsWith('guess_') && i.user.id === actualGuesser) {
        const chosen = i.customId.replace('guess_', '');
        await i.update({ content: `🔍 | <@${actualGuesser}> اختار <@${chosen}>!`, components: [] });
        guessCollector.stop();
        resolve(chosen);
      }
    });
    guessCollector.on('end', col => {
      if (!col.find(i => i.customId.startsWith('guess_'))) resolve(null);
    });
  });

  let newScoreA = scoreA, newScoreB = scoreB;
  if (!guessedId) {
    await context.channel.send(`⏰ | انتهى الوقت! لم يتم التخمين. نقطة لـ **${hidingName}**!`);
    if (round % 2 === 0) newScoreA++; else newScoreB++;
  } else if (guessedId === hiddenHolder) {
    await context.channel.send(`✅ | إجابة صحيحة! المحبس كان عند <@${hiddenHolder}>! نقطة لـ **${guessingName}**!`);
    if (round % 2 === 0) newScoreB++; else newScoreA++;
  } else {
    await context.channel.send(`❌ | إجابة خاطئة! المحبس كان عند <@${hiddenHolder}>! نقطة لـ **${hidingName}**!`);
    if (round % 2 === 0) newScoreA++; else newScoreB++;
  }

  await sleep(3000);
  await gameLoop(context, teamA, teamB, round + 1, newScoreA, newScoreB, callback);
}

function buildTeamButtons(team, prefix) {
  const rows = [];
  for (let i = 0; i < team.length; i += 5) {
    const row = new ActionRowBuilder();
    team.slice(i, i + 5).forEach(id => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${prefix}_${id}`)
          .setLabel(`لاعب ${team.indexOf(id) + 1}`)
          .setStyle(ButtonStyle.Secondary)
      );
    });
    rows.push(row);
  }
  return rows;
}
