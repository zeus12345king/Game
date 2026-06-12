'use strict';

// ═══════════════════════════════════════════════════════════════════
//  🕵️  لعبة الجاسوس  — نسخة مُعاد كتابتها بالكامل (مع سجلات الحكم)
// ═══════════════════════════════════════════════════════════════════

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  InteractionWebhook,
  AttachmentBuilder,
} = require('discord.js');

const db     = require('../database.js');
const config = require('../config.js');
const path   = require('path');
const https  = require('https');
const http   = require('http');

// ─── ثوابت ───────────────────────────────────────────────────────
const MIN_PLAYERS   = 3;
const MAX_PLAYERS   = 10;
const LOBBY_TIME    = config.lobbyTime?.outsider ?? 60_000;   // ms

// أوقات الأوضاع
const TIMES = {
  classic:   { hint: 35_000, vote: 25_000, lastGuess: 30_000 },
  questions: { answer: 50_000, vote: 25_000, minRounds: 4 },
  mission:   { discuss: 60_000, vote: 30_000 },
};

// إيموجيات مستعارة من الروليت
const Z1_EMOJI = "<:z1:1511780346008436946>";
const Z2_EMOJI = "<:z2:1511780387506880542>";

// ─── الكلمات مُصنَّفة ─────────────────────────────────────────────
const WORD_BANK = {
  '🐾 حيوانات': [
    'بقرة','قطة','كلب','فيل','أسد','قرد','ببغاء','سمكة','دجاجة','أرنب',
    'نمر','زرافة','حوت','دلفين','تمساح','ذئب','ثعلب','غوريلا','حصان','بطريق',
    'عقرب','نسر','طاووس','خروف','جمل',
  ],
  '🍕 طعام وشراب': [
    'بيتزا','برغر','شوكولاتة','قهوة','شاي','عصير','خبز','جبنة','أيسكريم',
    'كنافة','مندي','مطبق','تمر','رمان','بطيخ','فراولة','سمبوسة','لقيمات',
    'مشاوي','كباب','شاورما','فول','كاري','ماكارون','تشيز كيك',
  ],
  '🏙️ أماكن': [
    'مستشفى','مطعم','مدرسة','مطار','ملعب','سينما','مكتبة','فندق','شاطئ',
    'غابة','صحراء','جبل','قرية','مدينة','مسجد','كنيسة','ميناء','متحف',
    'حديقة','سوق','محطة قطار','ملاهي','مخيم','قلعة','برج',
  ],
  '📱 تقنية وأجهزة': [
    'هاتف','حاسوب','كاميرا','سماعة','تلفزيون','طابعة','ساعة ذكية','لابتوب',
    'جهاز لوحي','روبوت','طائرة مسيّرة','شاحن','سماعات أذن','شاشة','لوحة مفاتيح',
  ],
  '🎮 ترفيه ورياضة': [
    'كرة قدم','سباحة','تنس','كرة سلة','ملاكمة','دراجة','سكيت بورد',
    'شطرنج','ورق اللعب','بلياردو','كريكيت','غولف','رمي الرمح','جودو','سلاح',
  ],
  '🌍 طبيعة وفضاء': [
    'شمس','قمر','نجمة','مطر','ثلج','ريح','زلزال','بركان','نهر','بحيرة',
    'شلال','جليد','قوس قزح','كسوف','مذنب','كوكب','مجرة','سحابة','صاعقة','ضباب',
  ],
  '🏡 منزل وأثاث': [
    'سرير','كرسي','طاولة','باب','نافذة','مطبخ','حمام','مرآة','مصباح',
    'ثلاجة','غسالة','مكيف','تلفاز','ستارة','سجادة',
  ],
};

const ALL_WORDS = Object.values(WORD_BANK).flat();

// ─── حالة اللعبة ─────────────────────────────────────────────────
let GAME_ACTIVE = false;

// ════════════════════════════════════════════════════════════════════
//  أدوات مساعدة
// ════════════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function resetGame() { GAME_ACTIVE = false; }

function randomWord() {
  return ALL_WORDS[Math.floor(Math.random() * ALL_WORDS.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** إرسال DM عبر InteractionWebhook */
async function sendDM(client, player, content) {
  try {
    const wh = new InteractionWebhook(
      client,
      player.msgInfo.applicationId,
      player.msgInfo.interactionToken,
    );
    await wh.send({ content, ephemeral: true });
  } catch (e) {
    console.error(`[Spy] فشل إرسال DM لـ ${player.id}:`, e);
  }
}

// ════════════════════════════════════════════════════════════════════
//  إرسال سجلات الحكم (قناة اللوغات)
// ════════════════════════════════════════════════════════════════════

const JUDGE_CHANNEL_ID = '1351312429354713098'; // نفس قناة المحبس

async function sendJudgeDM(client, content) {
  try {
    const judgeChannel = await client.channels.fetch(JUDGE_CHANNEL_ID);
    if (judgeChannel) {
      await judgeChannel.send(content);
    } else {
      console.error('[Spy Judge] القناة غير موجودة.');
    }
  } catch (e) {
    console.error('[Spy Judge] فشل إرسال التقرير للقناة:', e);
  }
}

// ════════════════════════════════════════════════════════════════════
//  أدوات تحميل الصور (مستعارة من الروليت)
// ════════════════════════════════════════════════════════════════════

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download image, status ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function loadGameImage(imagePathOrUrl, fallbackFileName = 'image.png') {
  if (!imagePathOrUrl) return null;
  try {
    if (imagePathOrUrl.startsWith('http://') || imagePathOrUrl.startsWith('https://')) {
      const buffer = await downloadImage(imagePathOrUrl);
      return new AttachmentBuilder(buffer, { name: fallbackFileName });
    } else {
      return new AttachmentBuilder(imagePathOrUrl, { name: path.basename(imagePathOrUrl) });
    }
  } catch (e) {
    console.error(`Failed to load image from ${imagePathOrUrl}:`, e);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════
//  تصدير الأمر الرئيسي
// ════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'spy',
  aliases: ['الجاسوس', 'outsider', 'براالسالفة', 'برا'],

  async execute(message, args, callback) {
    if (GAME_ACTIVE) {
      await message.reply({
        content: '### ⛔ اللعبة تعمل بالفعل!\nانتظر انتهاء الجولة الحالية ثم حاول مرة أخرى.',
      });
      callback();
      return;
    }

    GAME_ACTIVE = true;
    await runLobby(message, callback);
  },
};

// ════════════════════════════════════════════════════════════════════
//  مرحلة الاستقبال (Lobby) — تصميم روليت معدل
// ════════════════════════════════════════════════════════════════════

async function runLobby(context, callback) {
  const nowTime = Math.floor(Date.now() / 1000);
  const endTime = nowTime + Math.floor(LOBBY_TIME / 1000);

  let players = [];
  let currentMode = 'classic';
  const hostId = context.author?.id ?? context.user?.id;

  // صورة اللوبي (إن وجدت)
  const lobbyImageFile = await loadGameImage(config.lobbyImages?.outsider, 'lobby.png');

  // بناء محتوى البداية
  const buildContent = () =>
    `اللاعبين: **${players.length}/${MAX_PLAYERS}**\n**<t:${endTime}:R>**`;

  // بناء الأزرار
  const buildComponents = () => {
    const rows = [];

    // صف أزرار الدخول والخروج
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('join')
        .setEmoji(Z1_EMOJI)
        .setLabel('دخول')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('exit')
        .setEmoji(Z2_EMOJI)
        .setLabel('خروج')
        .setStyle(ButtonStyle.Secondary),
    );
    rows.push(actionRow);

    // صف قائمة اختيار الوضع (أسفل أزرار الدخول والخروج)
    const modeSelect = new StringSelectMenuBuilder()
      .setCustomId('mode_select')
      .setPlaceholder('🎮 اختر وضع اللعب')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('الكلاسيكي')
          .setDescription('كل لاعب يعطي تلميحاً، والجاسوس يخمن سراً')
          .setValue('classic')
          .setEmoji('🎯')
          .setDefault(currentMode === 'classic'),
        new StringSelectMenuOptionBuilder()
          .setLabel('الأسئلة')
          .setDescription('اللاعبون يسألون بعضهم — اكتشف الجاسوس!')
          .setValue('questions')
          .setEmoji('❓')
          .setDefault(currentMode === 'questions'),
        new StringSelectMenuOptionBuilder()
          .setLabel('المهمة')
          .setDescription('جاسوس يقاوم مجموعة — ومهمة خفية يجب إنجازها')
          .setValue('mission')
          .setEmoji('💣')
          .setDefault(currentMode === 'mission'),
      );
    rows.push(new ActionRowBuilder().addComponents(modeSelect));

    return rows;
  };

  // إرسال رسالة اللوبي الأولية
  const sendOptions = {
    content: buildContent(),
    components: buildComponents(),
    fetchReply: true,
  };
  if (lobbyImageFile) sendOptions.files = [lobbyImageFile];

  const lobbyMsg = await context.reply(sendOptions);

  // تحديث كل 10 ثوانٍ للعداد وعدد اللاعبين
  const updateInterval = setInterval(async () => {
    try {
      await lobbyMsg.edit({ content: buildContent() }).catch(() => {});
    } catch (e) {}
  }, 10_000);

  // جامع الأزرار
  const filter = (i) =>
    i.customId === 'join' ||
    i.customId === 'exit' ||
    i.customId === 'mode_select';

  const collector = lobbyMsg.createMessageComponentCollector({
    filter,
    time: LOBBY_TIME,
  });

  collector.on('collect', async (i) => {
    // ── تغيير الوضع (المضيف فقط) ──
    if (i.customId === 'mode_select') {
      if (i.user.id !== hostId) {
        await i.reply({ content: '⚠️ فقط من بدأ اللعبة يستطيع تغيير الوضع.', ephemeral: true });
        return;
      }
      currentMode = i.values[0];
      await i.update({
        content: buildContent(),
        components: buildComponents(),
        files: lobbyImageFile ? [lobbyImageFile] : [],
      });
      return;
    }

    // ── انضمام ──
    if (i.customId === 'join') {
      if (players.some(p => p.id === i.user.id)) {
        await i.reply({ content: '✅ أنت منضم بالفعل!', ephemeral: true });
        return;
      }
      if (players.length >= MAX_PLAYERS) {
        await i.reply({ content: '⚠️ اللعبة ممتلئة!', ephemeral: true });
        return;
      }
      players.push({
        id: i.user.id,
        displayName: i.member?.displayName ?? i.user.displayName,
        msgInfo: { applicationId: i.applicationId, interactionToken: i.token },
      });
    } else {
      // ── خروج ──
      if (!players.some(p => p.id === i.user.id)) {
        await i.reply({ content: '⚠️ لست في اللعبة أصلاً!', ephemeral: true });
        return;
      }
      players = players.filter(p => p.id !== i.user.id);
    }

    await i.update({
      content: buildContent(),
      components: buildComponents(),
      files: lobbyImageFile ? [lobbyImageFile] : [],
    });
  });

  collector.on('end', async () => {
    clearInterval(updateInterval);
    // إخفاء الأزرار والقائمة
    try {
      await lobbyMsg.edit({ content: '', components: [] }).catch(() => {});
    } catch (_) {}

    // إذا لم يكتمل العدد
    if (players.length < MIN_PLAYERS) {
      await context.channel.send('🚶‍♂️ لم ينضم عدد كافٍ من اللاعبين. انتهى وقت الانضمام.');
      resetGame();
      callback();
      return;
    }

    // بدء اللعبة
    await context.channel.send('<:z3:1511872921142825040> | تم الانتهاء من تسجيل اللاعبين، ستبدأ اللعبة بعد قليل...');
    await sleep(4000);

    const opts = { context, players, callback };
    if      (currentMode === 'questions') await runQuestionsMode(opts);
    else if (currentMode === 'mission')   await runMissionMode(opts);
    else                                   await runClassicMode(opts);
  });
}

// ════════════════════════════════════════════════════════════════════
//  🎯  الوضع الكلاسيكي (بدون تخمين مبكر، مع فرصة أخيرة بعد التصويت)
// ════════════════════════════════════════════════════════════════════

async function runClassicMode({ context, players, callback }) {
  const { hint: HINT_TIME, vote: VOTE_TIME } = TIMES.classic;

  const word        = randomWord();
  const outsiderIdx = Math.floor(Math.random() * players.length);
  const outsider    = players[outsiderIdx];
  const insiders    = players.filter((_, i) => i !== outsiderIdx);
  // التعديل الوحيد: إشراك الجميع (بمن فيهم الجاسوس) في ترتيب التلميحات
  const order       = shuffle(players);

  // ══ إرسال سجل الحكم: بدء الوضع الكلاسيكي ══
  await sendJudgeDM(context.client, `🎯 وضع كلاسيكي:\n- الجاسوس: ${outsider.displayName} (${outsider.id})\n- الكلمة: ${word}\n- اللاعبون: ${players.map(p => p.displayName).join(', ')}`);

  // إرسال الأدوار سراً
  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(config.colors?.outsider ?? 0x6C3483)
        .addTextDisplayComponents(t => t.setContent(
          `## 🕵️‍♂️ بدأت لعبة الجاسوس!\n` +
          `### الوضع الكلاسيكي 🎯\n\n` +
          `📨 جاري توزيع الأدوار بشكل سري...\n\n` +
          `**اللاعبون:**\n${players.map(p => `> <@${p.id}>`).join('\n')}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  for (const player of players) {
    const isOutsider = player.id === outsider.id;
    await sendDM(context.client, player,
      isOutsider
        ? `🕵️‍♂️ **أنت الجاسوس!**\n\nاستمع جيداً لتلميحات الآخرين وحاول تخمين الكلمة السرية.\nتجنب الكشف عن نفسك!`
        : `✅ **أنت من المجموعة!**\n\nالكلمة السرية: **${word}**\n\nلمّح للكلمة دون ذكرها مباشرة — ساعد المجموعة في كشف الجاسوس!`,
    );
  }

  await sleep(4000);

  // مرحلة التلميحات
  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x2ECC71)
        .addTextDisplayComponents(t => t.setContent(
          `## 💬 مرحلة التلميحات\n` +
          `كل لاعب لديه **${HINT_TIME / 1000} ثانية** ليكتب جملة تلميحية.\n` +
          `**لا تذكر الكلمة السرية مباشرة!**\n\n` +
          `ترتيب اللاعبين:\n${order.map((p, i) => `> **${i + 1}.** <@${p.id}>`).join('\n')}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(2000);

  const hints = [];
  for (const player of order) {
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xF39C12)
          .addTextDisplayComponents(t => t.setContent(
            `### 🎤 <@${player.id}> — دورك!\n` +
            `اكتب جملة تلميحية للكلمة السرية.\n` +
            `-# ⏰ لديك ${HINT_TIME / 1000} ثانية`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const hint = await collectMessage(context.channel, player.id, HINT_TIME);
    hints.push({ player, hint });

    if (hint === null) {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xE74C3C)
            .addTextDisplayComponents(t => t.setContent(`⏰ <@${player.id}> لم يكتب تلميحاً — تجاوز.`)),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  }

  const validHints = hints.filter(h => h.hint !== null);
  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x3498DB)
        .addTextDisplayComponents(t => t.setContent(
          `## 📋 ملخص التلميحات\n\n` +
          (validHints.length
            ? validHints.map((h, i) =>
                `> **${i + 1}.** ${h.player.displayName}\n> *"${h.hint}"*`
              ).join('\n\n')
            : '> *لا توجد تلميحات!*'
          ) +
          `\n\n-# الجاسوس بينكم — راقبوا التلميحات وصوّتوا بحذر.`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  // ══ إرسال سجل الحكم: التلميحات ══
  const hintsLog = hints.map(h => `${h.player.displayName}: ${h.hint ?? 'لم يكتب'}`).join('\n');
  await sendJudgeDM(context.client, `📋 تلميحات الكلاسيكي:\n${hintsLog}`);

  await sleep(2000);

  // الانتقال مباشرة للتصويت (بدون تخمين علني مبكر)
  await runVotePhase({ context, players, outsider, word, VOTE_TIME, mode: 'classic', callback });
}

// ════════════════════════════════════════════════════════════════════
//  ❓  وضع الأسئلة (مع إمكانية طلب التصويت بالنص دون قطع الجولة)
// ════════════════════════════════════════════════════════════════════

async function runQuestionsMode({ context, players, callback }) {
  const { answer: ANSWER_TIME, vote: VOTE_TIME, minRounds: MIN_ROUNDS } = TIMES.questions;

  const word        = randomWord();
  const outsiderIdx = Math.floor(Math.random() * players.length);
  const outsider    = players[outsiderIdx];
  const insiders    = players.filter((_, i) => i !== outsiderIdx);

  // ══ سجل الحكم: بدء وضع الأسئلة ══
  await sendJudgeDM(context.client, `❓ وضع الأسئلة:\n- الجاسوس: ${outsider.displayName} (${outsider.id})\n- الكلمة: ${word}\n- اللاعبون: ${players.map(p => p.displayName).join(', ')}`);

  // توزيع الأدوار
  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(config.colors?.outsider ?? 0x6C3483)
        .addTextDisplayComponents(t => t.setContent(
          `## 🕵️‍♂️ لعبة الجاسوس — وضع الأسئلة ❓\n\n` +
          `📨 جاري توزيع الأدوار سراً...\n\n` +
          `**اللاعبون:**\n${players.map(p => `> <@${p.id}>`).join('\n')}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  for (const player of players) {
    const isOutsider = player.id === outsider.id;
    await sendDM(context.client, player,
      isOutsider
        ? `🕵️‍♂️ **أنت الجاسوس!**\n\nاللاعبون سيسألون بعضهم البعض.\nأجب بذكاء لتتجنب الكشف!\nبعد ${MIN_ROUNDS} جولات يمكن طلب التصويت بكتابة \"تصويت\" أو عبر الأزرار.`
        : `✅ **أنت من المجموعة!**\n\nالكلمة السرية: **${word}**\n\nاسأل أسئلة ذكية وراقب الإجابات — الجاسوس لا يعرف الكلمة!\nبعد ${MIN_ROUNDS} جولات يمكنك طلب التصويت بكتابة \"تصويت\".`,
    );
  }

  await sleep(3000);

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x1ABC9C)
        .addTextDisplayComponents(t => t.setContent(
          `## 🔍 مرحلة التحقيق — الأسئلة المتبادلة\n\n` +
          `**القواعد:**\n` +
          `> • البوت يختار أول سائل عشوائياً\n` +
          `> • بعد كل إجابة، المُجيب يختار من يسأل في الجولة التالية\n` +
          `> • بعد **${MIN_ROUNDS}** جولات، يمكن لأي لاعب طلب التصويت\n` +
          `> • لطلب التصويت: اكتب **تصويت** في الشات (ولن يقطع الجولة الحالية)\n` +
          `> • الهدف: اكتشاف الجاسوس من خلال الأسئلة والأجوبة\n\n` +
          `-# استعدوا!`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(2000);

  // جامع رسائل لرصد طلب التصويت بالنص
  let voteRequestedByText = false;
  const textVoteCollector = context.channel.createMessageCollector({
    filter: m => !m.author.bot && players.some(p => p.id === m.author.id) && m.content.trim() === 'تصويت',
  });
  textVoteCollector.on('collect', () => {
    voteRequestedByText = true;
    textVoteCollector.stop();
  });

  let rounds = 0;
  let voteRequested = false;
  let currentAsker = players[Math.floor(Math.random() * players.length)];

  while (!voteRequested) {
    const others = players.filter(p => p.id !== currentAsker.id);
    const target  = others[Math.floor(Math.random() * others.length)];

    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xF39C12)
          .addTextDisplayComponents(t => t.setContent(
            `### ❓ الجولة ${rounds + 1}\n` +
            `<@${currentAsker.id}> — اسأل <@${target.id}> سؤالاً!\n` +
            `-# ⏰ ${ANSWER_TIME / 1000} ثانية للسؤال ثم الإجابة`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const question = await collectMessage(context.channel, currentAsker.id, ANSWER_TIME);

    if (!question) {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x7F8C8D)
            .addTextDisplayComponents(t => t.setContent(`⏰ <@${currentAsker.id}> لم يسأل — تخطي.`)),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      currentAsker = players[Math.floor(Math.random() * players.length)];
      rounds++;
    } else {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x3498DB)
            .addTextDisplayComponents(t => t.setContent(
              `### 💬 <@${target.id}> — أجب!\n` +
              `السؤال: *"${question}"*\n` +
              `-# ⏰ ${ANSWER_TIME / 1000} ثانية`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      const answer = await collectMessage(context.channel, target.id, ANSWER_TIME);
      rounds++;

      if (!answer) {
        await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(0x7F8C8D)
              .addTextDisplayComponents(t => t.setContent(`⏰ <@${target.id}> لم يُجب.`)),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      if (rounds >= MIN_ROUNDS) {
        const chooseRow = new ActionRowBuilder();
        const selectablePlayers = players.filter(p => p.id !== target.id);
        selectablePlayers.slice(0, 4).forEach(p => {
          chooseRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`next_${p.id}`)
              .setLabel(p.displayName.substring(0, 40))
              .setStyle(ButtonStyle.Secondary),
          );
        });
        const controlRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('request_vote').setLabel('🗳️ طلب تصويت').setStyle(ButtonStyle.Danger),
        );

        const chooseMsg = await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(0x9B59B6)
              .addTextDisplayComponents(t => t.setContent(
                `### 🎯 <@${target.id}> — اختر التالي!\n` +
                `من تريد توجيه السؤال له؟\n` +
                `-# يمكنك طلب تصويت (مرت ${rounds} جولات)`,
              ))
              .addActionRowComponents(r => r.setComponents(...chooseRow.components))
              .addActionRowComponents(r => r.setComponents(...controlRow.components)),
          ],
          flags: MessageFlags.IsComponentsV2,
        });

        const choice = await new Promise(resolve => {
          const colChoice = chooseMsg.createMessageComponentCollector({
            filter: i => i.user.id === target.id,
            time: 20_000,
            max: 1,
          });
          colChoice.on('collect', i => {
            i.deferUpdate().catch(() => {});
            resolve(i.customId);
          });
          colChoice.on('end', c => { if (c.size === 0) resolve(null); });
        });

        if (choice === 'request_vote' || choice === null) {
          voteRequested = true;
        } else {
          const nextId = choice.replace('next_', '');
          currentAsker = players.find(p => p.id === nextId) ?? target;
        }

        try { await chooseMsg.delete(); } catch (_) {}
      } else {
        currentAsker = players[Math.floor(Math.random() * players.length)];
        await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(0x2C3E50)
              .addTextDisplayComponents(t => t.setContent(
                `-# 🤖 البوت اختار: <@${currentAsker.id}> سيسأل التالي`,
              )),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    }

    if (voteRequestedByText) voteRequested = true;
    if (rounds >= MIN_ROUNDS + 10) voteRequested = true;
  }

  try { textVoteCollector.stop(); } catch (_) {}

  await runVotePhase({ context, players, outsider, word, VOTE_TIME, mode: 'questions', callback });
}

// ════════════════════════════════════════════════════════════════════
//  💣  وضع المهمة
// ════════════════════════════════════════════════════════════════════

const MISSIONS = [
  'اجعل أحد اللاعبين يذكر كلمة "حار" في إجابته',
  'اجعل أحد اللاعبين يذكر كلمة "ماء" في إجابته',
  'اجعل أحد اللاعبين يذكر كلمة "بعيد" في إجابته',
  'اجعل أحد اللاعبين يذكر كلمة "ضخم" في إجابته',
  'اجعل أحد اللاعبين يضحك (يكتب 😂 أو هههه)',
  'اجعل اللاعبين يتفقون على أن الكلمة السرية في فئة معينة',
  'اجعل أحداً يسألك سؤالاً شخصياً',
  'اجعل اللاعبين يشككون في أحد بعضهم البعض (وليس فيك)',
];

const MISSION_KEYWORDS = {
  'اجعل أحد اللاعبين يذكر كلمة "حار" في إجابته': ['حار', 'ساخن'],
  'اجعل أحد اللاعبين يذكر كلمة "ماء" في إجابته': ['ماء', 'مياه'],
  'اجعل أحد اللاعبين يذكر كلمة "بعيد" في إجابته': ['بعيد', 'بعيدة'],
  'اجعل أحد اللاعبين يذكر كلمة "ضخم" في إجابته': ['ضخم', 'ضخمة', 'كبير جداً'],
  'اجعل أحد اللاعبين يضحك (يكتب 😂 أو هههه)': ['😂', 'هههه', 'ههه', 'lol', 'wkwk'],
};

async function runMissionMode({ context, players, callback }) {
  const { discuss: DISCUSS_TIME, vote: VOTE_TIME } = TIMES.mission;

  const word        = randomWord();
  const outsiderIdx = Math.floor(Math.random() * players.length);
  const outsider    = players[outsiderIdx];
  const insiders    = players.filter((_, i) => i !== outsiderIdx);
  const mission     = MISSIONS[Math.floor(Math.random() * MISSIONS.length)];
  const missionKeys = MISSION_KEYWORDS[mission] ?? [];

  // ══ سجل الحكم: بدء وضع المهمة ══
  await sendJudgeDM(context.client, `💣 وضع المهمة:\n- الجاسوس: ${outsider.displayName} (${outsider.id})\n- الكلمة: ${word}\n- المهمة: ${mission}\n- اللاعبون: ${players.map(p => p.displayName).join(', ')}`);

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(config.colors?.outsider ?? 0x6C3483)
        .addTextDisplayComponents(t => t.setContent(
          `## 💣 لعبة الجاسوس — وضع المهمة\n\n` +
          `📨 جاري توزيع الأدوار...\n\n` +
          `**اللاعبون:**\n${players.map(p => `> <@${p.id}>`).join('\n')}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  for (const player of players) {
    const isOutsider = player.id === outsider.id;
    await sendDM(context.client, player,
      isOutsider
        ? `🕵️‍♂️ **أنت الجاسوس!**\n\n**مهمتك السرية:**\n> ${mission}\n\nأكمل مهمتك أثناء النقاش دون كشف نفسك!\nإذا نجحت قبل انتهاء الوقت أو التصويت — تفوز!\n\n**ملاحظة:** المجموعة تعرف الكلمة السرية وأنت لا تعرفها، فتحدث بحذر.`
        : `✅ **أنت من المجموعة!**\n\nالكلمة السرية: **${word}**\n\nناقشوا الكلمة وحاولوا كشف الجاسوس قبل أن ينجز مهمته السرية!\n\n**تنبيه:** الجاسوس قد يدفع أحدكم لقول كلمات معينة، انتبهوا!`,
    );
  }

  await sleep(3000);

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0xE74C3C)
        .addTextDisplayComponents(t => t.setContent(
          `## 🔥 مرحلة النقاش الحر\n\n` +
          `**قواعد وضع المهمة:**\n` +
          `> • الجاسوس لديه **مهمة سرية** (تظهر له في الخاص) يجب أن ينجزها خلال النقاش\n` +
          `> • المهمة غالباً أن يجعل أحد اللاعبين يقول كلمة محددة أو يتصرف بشكل معين\n` +
          `> • المجموعة تعرف الكلمة السرية والجاسوس لا يعرفها — ناقشوا الكلمة بحرية\n` +
          `> • النقاش مفتوح لمدة **${DISCUSS_TIME / 1000} ثانية**\n` +
          `> • إذا أنجز الجاسوس مهمته قبل نهاية الوقت أو التصويت — **يفوز فوراً**\n` +
          `> • إذا انتهى الوقت دون إنجاز المهمة، يبدأ التصويت\n\n` +
          `-# ابدأوا النقاش الآن!`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  let missionComplete = false;
  let missionCompleter = null;

  const discussCol = context.channel.createMessageCollector({
    filter: m => !m.author.bot && players.some(p => p.id === m.author.id),
    time: DISCUSS_TIME,
  });

  const missionDone = new Promise(resolve => {
    discussCol.on('collect', m => {
      if (missionKeys.length > 0 && m.author.id !== outsider.id) {
        const lower = m.content.toLowerCase();
        if (missionKeys.some(k => lower.includes(k.toLowerCase()))) {
          missionComplete = true;
          missionCompleter = m.author.id;
          discussCol.stop('mission_complete');
          resolve(true);
        }
      }
    });
    discussCol.on('end', () => resolve(false));
  });

  const timerPromise = sleep(DISCUSS_TIME).then(() => false);
  const result = await Promise.race([missionDone, timerPromise]);

  if (!discussCol.ended) discussCol.stop();

  if (missionComplete && missionKeys.length > 0) {
    // ══ سجل الحكم: إنجاز المهمة ══
    await sendJudgeDM(context.client, `💣 مهمة الجاسوس أنجزت بواسطة ذكر الكلمة من <@${missionCompleter}>`);

    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xE74C3C)
          .addTextDisplayComponents(t => t.setContent(
            `## ⚡ أُنجزت المهمة!\n` +
            `<@${missionCompleter}> ذكر الكلمة المطلوبة في رسالته!\n\n` +
            `🏆 **الجاسوس <@${outsider.id}> أنجز مهمته ويفوز!**`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    await db.addPoints(outsider.id, config.winPoints?.outsider ?? 100);
    await revealResults({ context, outsider, word, mission });
    resetGame();
    callback();
    return;
  }

  await runVotePhase({ context, players, outsider, word, VOTE_TIME, mode: 'mission', mission, callback });
}

// ════════════════════════════════════════════════════════════════════
//  🗳️  مرحلة التصويت (مع تحديث حي للأرقام وفرصة أخيرة للكلاسيكي)
// ════════════════════════════════════════════════════════════════════

async function runVotePhase({ context, players, outsider, word, VOTE_TIME, mode, mission, callback }) {
  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x8E44AD)
        .addTextDisplayComponents(t => t.setContent(
          `## 🗳️ مرحلة التصويت\n\n` +
          `من تعتقد أنه **الجاسوس**؟\n` +
          `صوّت بالضغط على اسم اللاعب.\n` +
          `-# ⏰ ${VOTE_TIME / 1000} ثانية للتصويت`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  function buildVoteContainer(votes) {
    const rows = [];
    for (let i = 0; i < players.length; i += 4) {
      const row = new ActionRowBuilder();
      players.slice(i, i + 4).forEach(p => {
        const count = votes.get(p.id) || 0;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`vote_${p.id}`)
            .setLabel(`${p.displayName.substring(0, 30)} (${count})`)
            .setStyle(ButtonStyle.Secondary),
        );
      });
      rows.push(row);
    }
    const noneCount = votes.get('none') || 0;
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('vote_none')
          .setLabel(`لا أشك بأحد 🤷 (${noneCount})`)
          .setStyle(ButtonStyle.Primary),
      ),
    );

    const c = new ContainerBuilder()
      .setAccentColor(0x8E44AD)
      .addTextDisplayComponents(t => t.setContent(`🗳️ صوّت على من تشك أنه الجاسوس:`));
    rows.forEach(row => c.addActionRowComponents(r => {
      row.components.forEach(b => r.addComponents(b));
      return r;
    }));
    return c;
  }

  const votes   = new Map();
  const voters  = new Set();

  let voteMsg = await context.channel.send({
    components: [buildVoteContainer(votes)],
    flags: MessageFlags.IsComponentsV2,
  });

  await new Promise(resolve => {
    const col = voteMsg.createMessageComponentCollector({
      filter: i => i.customId.startsWith('vote_') && players.some(p => p.id === i.user.id),
      time: VOTE_TIME,
    });

    col.on('collect', async i => {
      if (voters.has(i.user.id)) {
        await i.reply({ content: '⚠️ صوّتت بالفعل!', ephemeral: true });
        return;
      }
      const target = i.customId.replace('vote_', '');
      if (target !== 'none' && target === i.user.id) {
        await i.reply({ content: '❌ لا يمكنك التصويت على نفسك!', ephemeral: true });
        return;
      }
      voters.add(i.user.id);
      votes.set(target, (votes.get(target) || 0) + 1);

      try {
        await i.update({ components: [buildVoteContainer(votes)], flags: MessageFlags.IsComponentsV2 });
      } catch (_) {
        await i.reply({ content: '✅ تم تسجيل صوتك.', ephemeral: true });
      }
    });

    col.on('end', resolve);
  });

  try {
    const disabledContainer = new ContainerBuilder()
      .setAccentColor(0x7F8C8D)
      .addTextDisplayComponents(t => t.setContent(`🔒 انتهى وقت التصويت.`));
    await voteMsg.edit({ components: [disabledContainer], flags: MessageFlags.IsComponentsV2 });
  } catch (_) {}

  let mostVoted = null, maxVotes = 0;
  for (const [id, count] of votes) {
    if (id !== 'none' && count > maxVotes) { maxVotes = count; mostVoted = id; }
  }

  const noneVotes = votes.get('none') || 0;
  const voteSummary = [...votes.entries()]
    .filter(([id]) => id !== 'none')
    .sort((a, b) => b[1] - a[1])
    .map(([id, c]) => {
      const p = players.find(pl => pl.id === id);
      return `> <@${id}> (${p?.displayName ?? '?'}) — **${c}** صوت`;
    });
  if (noneVotes > 0) voteSummary.push(`> لا أحد — **${noneVotes}** صوت`);

  const voteCorrect = mostVoted === outsider.id;
  const pts = config.winPoints?.outsider ?? 100;

  let spyWins = false;

  if (mode === 'classic' && voteCorrect) {
    const lastGuessTime = TIMES.classic.lastGuess;
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xE67E22)
          .addTextDisplayComponents(t => t.setContent(
            `## 🎲 فرصة أخيرة للجاسوس!\n` +
            `<@${outsider.id}> تم كشفك بالتصويت!\n` +
            `لديك **${lastGuessTime / 1000} ثانية** لتخمين الكلمة السرية بشكل علني.\n` +
            `إذا كانت تخمينك صحيحًا — تفوز رغم الكشف!\n` +
            `-# اكتب الكلمة الآن في الشات`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const finalGuess = await collectMessage(context.channel, outsider.id, lastGuessTime);
    if (finalGuess) {
      const normalize = s => s.replace(/[\u064B-\u065F]/g, '').trim().toLowerCase();
      if (normalize(finalGuess) === normalize(word)) {
        spyWins = true;
        await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(0x2ECC71)
              .addTextDisplayComponents(t => t.setContent(`✅ **"${finalGuess}"** — إصابة! الجاسوس خمن الكلمة الصحيحة!`)),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      } else {
        await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(0xE74C3C)
              .addTextDisplayComponents(t => t.setContent(`❌ **"${finalGuess}"** — خطأ. الجاسوس فشل في التخمين.`)),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    } else {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x7F8C8D)
            .addTextDisplayComponents(t => t.setContent(`⏰ لم يتم التخمين في الوقت المحدد.`)),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  } else if (mode === 'classic') {
    spyWins = true;
  } else {
    spyWins = !voteCorrect;
  }

  const winner = spyWins ? 'outsider' : 'insiders';
  let resultText;
  if (mode === 'classic') {
    if (voteCorrect && spyWins) {
      resultText = `🕵️ الجاسوس كُشف لكنه خمّن الكلمة الصحيحة — **الجاسوس يفوز!**`;
    } else if (voteCorrect) {
      resultText = `🎯 المجموعة كشفت الجاسوس ولم يخمن الكلمة — **المجموعة تفوز!**`;
    } else {
      resultText = `🕵️ الجاسوس نجا من الكشف — **الجاسوس يفوز!**`;
    }
  } else {
    resultText = voteCorrect
      ? `🎯 المجموعة كشفت الجاسوس — **المجموعة تفوز!**`
      : `🕵️ الجاسوس نجا — **الجاسوس يفوز!**`;
  }

  if (winner === 'outsider') {
    await db.addPoints(outsider.id, pts);
  } else {
    for (const p of players.filter(pl => pl.id !== outsider.id)) {
      await db.addPoints(p.id, pts);
    }
  }

  // ══ سجل الحكم: نتيجة التصويت والنتيجة النهائية ══
  await sendJudgeDM(context.client, `🗳️ نتيجة التصويت (${mode}):\n${voteSummary.join('\n')}\n- الجاسوس الحقيقي: ${outsider.displayName}\n- الفائز: ${winner === 'outsider' ? 'الجاسوس' : 'المجموعة'}`);

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(winner === 'outsider' ? 0xE74C3C : 0x2ECC71)
        .addTextDisplayComponents(t => t.setContent(
          `## 🏆 النتيجة النهائية\n\n` +
          `**الجاسوس كان:** <@${outsider.id}> (${outsider.displayName})\n` +
          `**الكلمة السرية كانت:** ||${word}||\n` +
          (mission ? `**المهمة السرية:** ${mission}\n` : '') +
          `\n${resultText}\n\n` +
          `**نتائج التصويت:**\n${voteSummary.join('\n') || '> لا أحد صوّت'}\n\n` +
          `**النقاط المكتسبة:** 🏅 ${pts} نقطة لكل من ${winner === 'outsider' ? `<@${outsider.id}>` : players.filter(p => p.id !== outsider.id).map(p => `<@${p.id}>`).join(', ')}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  resetGame();
  callback();
}

// ════════════════════════════════════════════════════════════════════
//  كشف النتائج (مساعد)
// ════════════════════════════════════════════════════════════════════

async function revealResults({ context, outsider, word, mode, mission }) {
  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0xF39C12)
        .addTextDisplayComponents(t => t.setContent(
          `## 📊 كشف الأوراق\n\n` +
          `**الجاسوس:** <@${outsider.id}>\n` +
          `**الكلمة السرية:** ||${word}||\n` +
          (mission ? `**المهمة:** ${mission}` : ''),
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
}

// ════════════════════════════════════════════════════════════════════
//  مساعد: جمع رسالة واحدة من مستخدم معين
// ════════════════════════════════════════════════════════════════════

function collectMessage(channel, userId, timeout) {
  return new Promise(resolve => {
    const col = channel.createMessageCollector({
      filter: m => m.author.id === userId,
      time: timeout,
      max: 1,
    });
    col.on('collect', m => resolve(m.content.trim()));
    col.on('end', c => { if (c.size === 0) resolve(null); });
  });
}