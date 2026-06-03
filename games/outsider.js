const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  InteractionWebhook,
  AttachmentBuilder,
} = require('discord.js');
const db = require('../database.js');
const config = require('../config.js');
const path = require('path');

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;
const HINT_TIME   = 30000; 
const GUESS_TIME  = 40000; 
const VOTE_TIME   = 20000; 
const MAX_GUESSES = 3;

const WORDS = [
  'بقرة', 'مدرسة', 'ايسكريم', 'شمس', 'قطة', 'سيارة', 'بحر', 'جبل',
  'تفاحة', 'كتاب', 'هاتف', 'طائرة', 'قطار', 'مطبخ', 'نجمة', 'قمر',
  'كرة', 'شجرة', 'باب', 'نافذة', 'كرسي', 'طاولة', 'حذاء', 'قبعة',
  'دجاجة', 'سمكة', 'فيل', 'أسد', 'قرد', 'ببغاء', 'زهرة', 'نهر',
  'مطر', 'ثلج', 'صحراء', 'غابة', 'مدينة', 'قرية', 'مستشفى', 'مطعم',
  'بيتزا', 'برغر', 'شوكولاتة', 'قهوة', 'شاي', 'عصير', 'خبز', 'جبنة',
  'تلفزيون', 'حاسوب', 'كاميرا', 'سماعة', 'ساعة', 'مرآة', 'مصباح',
];

let GAME_ACTIVE = false;

module.exports = {
  name: 'outsider',
  aliases: ['براالسالفة', 'برا'],
  async execute(message, args, callback) {
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

function buildLobby(nowTime, players, filesArray) {
  const TIME_TO_START = config.lobbyTime.outsider;
  const list = players.length
    ? players.map((p, i) => `> **${i+1}.** <@${p.id}>`).join('\n')
    : '> لا يوجد لاعبين بعد';
  
  const container = new ContainerBuilder()
    .setAccentColor(config.colors.outsider)
    .addTextDisplayComponents(t => t.setContent(
      `## 🕵️ لعبة برا السالفة\n> الوقت المتبقي: <t:${nowTime + TIME_TO_START / 1000}:R>\n\n` +
      `**اللاعبون (${players.length}/${MAX_PLAYERS}):**\n${list}`
    ))
    .addMediaGalleryComponents(g => { 
      const img = config.lobbyImages.outsider; 
      if (img) {
        // Check if the path is local (starts with img/ or similar)
        if (img.startsWith('img/') || img.startsWith('./img/') || (!img.startsWith('http://') && !img.startsWith('https://'))) {
          // Local file - use attachment:// protocol and add to files array
          const fileName = path.basename(img);
          g.addItems(item => item.setURL(`attachment://${fileName}`));
          if (filesArray) filesArray.push(new AttachmentBuilder(img, { name: fileName }));
        } else {
          // External URL
          g.addItems(item => item.setURL(img));
        }
      }
      return g;
    })
    .addActionRowComponents(r => r.setComponents(
      new ButtonBuilder().setCustomId('join').setLabel('دخول').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('exit').setLabel('خروج').setStyle(ButtonStyle.Danger)
    ));
  return container;
}

async function startGame(context, nowTime, callback) {
  let players = [];
  const TIME_TO_START = config.lobbyTime.outsider;

  // Prepare files array for local image
  let filesArray = [];
  const lobbyContainer = buildLobby(nowTime, players, filesArray);
  const sendOptions = {
    components: [lobbyContainer],
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true,
  };
  if (filesArray.length > 0) sendOptions.files = filesArray;

  const sent = await context.reply(sendOptions);

  async function updateLobbyView() {
    try {
      let newFiles = [];
      const newContainer = buildLobby(nowTime, players, newFiles);
      const editOptions = {
        components: [newContainer],
        flags: MessageFlags.IsComponentsV2,
      };
      if (newFiles.length > 0) editOptions.files = newFiles;
      await sent.edit(editOptions);
    } catch (e) {
      console.error("Failed to update lobby view:", e);
    }
  }

  await updateLobbyView();

  const collector = sent.createMessageComponentCollector({
    filter: i => i.customId === 'join' || i.customId === 'exit',
    time: TIME_TO_START,
  });

  collector.on('collect', async i => {
    if (i.customId === 'join') {
      if (players.some(p => p.id === i.user.id)) { await i.reply({ content: 'أنت بالفعل في اللعبة!', ephemeral: true }); return; }
      if (players.length >= MAX_PLAYERS) { await i.reply({ content: 'اللعبة ممتلئة!', ephemeral: true }); return; }
      players.push({
        id: i.user.id,
        displayName: i.user.displayName,
        msgInfo: { applicationId: i.applicationId, interactionToken: i.token },
      });
      await i.update({ components: [buildLobby(nowTime, players, [])], flags: MessageFlags.IsComponentsV2 });
    } else {
      players = players.filter(p => p.id !== i.user.id);
      await i.update({ components: [buildLobby(nowTime, players, [])], flags: MessageFlags.IsComponentsV2 });
    }
  });

  collector.on('end', async () => {
    try {
      const closed = new ContainerBuilder()
        .setAccentColor(config.colors.outsider)
        .addTextDisplayComponents(t => t.setContent(
          `## 🕵️ لعبة برا السالفة\n**انتهى وقت الانضمام!**\n\nاللاعبون: ${players.map(p => `<@${p.id}>`).join(', ') || 'لا يوجد'}`
        ))
        .addActionRowComponents(r => r.setComponents(
          new ButtonBuilder().setCustomId('join').setLabel('دخول').setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId('exit').setLabel('خروج').setStyle(ButtonStyle.Danger).setDisabled(true)
        ));
      await sent.edit({ components: [closed], flags: MessageFlags.IsComponentsV2 });
    } catch (_) {}

    if (players.length < MIN_PLAYERS) {
      await context.channel.send('❌ | لم يكتمل عدد اللاعبين (3 على الأقل).');
      resetGame(); callback(); return;
    }

    await playRound(context, players, callback);
  });
}

async function playRound(context, players, callback) {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const outsiderIdx = Math.floor(Math.random() * players.length);
  const outsider = players[outsiderIdx];

  await context.channel.send('📨 | جاري إرسال الأدوار...');

  for (const player of players) {
    try {
      const webhook = new InteractionWebhook(
        context.client,
        player.msgInfo.applicationId,
        player.msgInfo.interactionToken
      );
      if (player.id === outsider.id) {
        await webhook.send({ content: '🕵️ | أنت **برا السالفة**! استمع لما يقوله الآخرون وحاول تخمين الكلمة السرية.', ephemeral: true });
      } else {
        await webhook.send({ content: `✅ | الكلمة السرية هي: **${word}**\nلمّح للكلمة بجملة قصيرة بدون ذكرها مباشرة!`, ephemeral: true });
      }
    } catch (e) {
      console.error(`[Outsider] Failed to send role to ${player.id}:`, e);
    }
  }

  await sleep(3000);
  await context.channel.send(
    `## 🕵️ بدأت اللعبة!\n` +
    `كل لاعب سيكتب جملة قصيرة تلمّح للكلمة السرية.\n` +
    `**اللاعب برا السالفة** سيحاول التخمين بعد سماع الجمل.\n` +
    `لديك **${HINT_TIME/1000} ثانية** لكل جملة.`
  );

  await sleep(2000);

  const hints = [];
  const insiders = players.filter(p => p.id !== outsider.id);

  for (const player of insiders) {
    await context.channel.send(`💬 | <@${player.id}> اكتب جملة قصيرة تلمّح للكلمة (${HINT_TIME/1000} ثانية):`);

    const hint = await new Promise(resolve => {

      const filter = m => m.author.id === player.id && m.channel.id === context.channel.id;
      const col = context.channel.createMessageCollector({ filter, time: HINT_TIME, max: 1 });
      col.on('collect', m => { resolve(m.content.trim()); });
      col.on('end', (c) => { if (c.size === 0) resolve('(لم يكتب شيئاً)'); });
    });

    hints.push({ player: player.displayName, hint });
    await sleep(500);
  }

  const hintsList = hints.map((h, i) => `**${i+1}.** ${h.player}: "${h.hint}"`).join('\n');
  await context.channel.send(
    `## 📋 الجمل المكتوبة:\n${hintsList}\n\n` +
    `<@${outsider.id}> لديك **${MAX_GUESSES}** محاولات لتخمين الكلمة السرية!`
  );

  let guessed = false;
  for (let attempt = 1; attempt <= MAX_GUESSES; attempt++) {
    await context.channel.send(`🎯 | <@${outsider.id}> المحاولة **${attempt}/${MAX_GUESSES}** — اكتب تخمينك (${GUESS_TIME/1000} ثانية):\n-# (فقط برا السالفة يكتب الآن)`);

    const guess = await new Promise(resolve => {

      const filter = m => m.author.id === outsider.id && m.channel.id === context.channel.id;
      const col = context.channel.createMessageCollector({ filter, time: GUESS_TIME, max: 1 });
      col.on('collect', m => resolve(m.content.trim()));
      col.on('end', c => { if (c.size === 0) resolve(null); });
    });

    if (!guess) {
      await context.channel.send(`⏰ | انتهى الوقت للمحاولة ${attempt}.`);
      continue;
    }

    if (guess.toLowerCase() === word.toLowerCase() || guess === word) {
      guessed = true;
      await context.channel.send(`✅ | <@${outsider.id}> خمّن الكلمة الصحيحة! الكلمة كانت **${word}**`);
      break;
    } else {
      await context.channel.send(`❌ | خطأ! تبقى ${MAX_GUESSES - attempt} محاولة.`);
    }
  }

  await sleep(1000);
  await context.channel.send(`## 🗳️ مرحلة التصويت\nهل تشكون بأحد أنه برا السالفة؟ (${VOTE_TIME/1000} ثانية)`);

  const voteRows = [];
  for (let i = 0; i < players.length; i += 5) {
    const row = new ActionRowBuilder();
    players.slice(i, i + 5).forEach(p => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`vote_${p.id}`)
          .setLabel(p.displayName.substring(0, 80))
          .setStyle(ButtonStyle.Secondary)
      );
    });
    voteRows.push(row);
  }
  voteRows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vote_none').setLabel('لا أشك بأحد').setStyle(ButtonStyle.Primary)
  ));

  const voteMsg = await context.channel.send({ content: '🗳️ | صوّت على من تشك أنه برا السالفة:', components: voteRows });
  const votes = new Map();
  const voters = new Set();

  await new Promise(resolve => {
    const col = voteMsg.createMessageComponentCollector({
      filter: i => i.customId.startsWith('vote_') && players.some(p => p.id === i.user.id),
      time: VOTE_TIME,
    });
    col.on('collect', async i => {
      if (voters.has(i.user.id)) { await i.reply({ content: 'صوّتت بالفعل!', ephemeral: true }); return; }
      const target = i.customId.replace('vote_', '');
      if (target === i.user.id) { await i.reply({ content: '❌ | لا يمكنك التصويت على نفسك!', ephemeral: true }); return; }
      voters.add(i.user.id);
      votes.set(target, (votes.get(target) || 0) + 1);
      await i.reply({ content: '✅ | تم تسجيل صوتك!', ephemeral: true });
    });
    col.on('end', resolve);
  });

  try {
    voteRows.forEach(r => r.components.forEach(b => b.setDisabled(true)));
    await voteMsg.edit({ components: voteRows });
  } catch (_) {}

  let mostVoted = null, maxVotes = 0;
  for (const [id, count] of votes) {
    if (id !== 'none' && count > maxVotes) { maxVotes = count; mostVoted = id; }
  }

  const pts = config.winPoints.outsider;
  if (guessed) {

    await db.addPoints(outsider.id, pts);
    await context.channel.send(
      `## 🏆 نتيجة اللعبة\n` +
      `<@${outsider.id}> كان **برا السالفة** وخمّن الكلمة **${word}** بنجاح!\n` +
      `🏆 <@${outsider.id}> فاز بـ **${pts}** نقطة!`
    );
  } else {

    for (const p of insiders) await db.addPoints(p.id, pts);
    await context.channel.send(
      `## 🏆 نتيجة اللعبة\n` +
      `<@${outsider.id}> كان **برا السالفة** ولم يتمكن من تخمين الكلمة **${word}**!\n` +
      `🏆 فاز اللاعبون الآخرون بـ **${pts}** نقطة لكل واحد!`
    );
  }

  if (mostVoted && mostVoted === outsider.id) {
    await context.channel.send(`🎯 | التصويت كشف **برا السالفة** بشكل صحيح!`);
  } else if (mostVoted) {
    await context.channel.send(`❌ | التصويت أشار خطأً إلى <@${mostVoted}>، لكن **برا السالفة** كان <@${outsider.id}>!`);
  }

  resetGame();
  callback();
}