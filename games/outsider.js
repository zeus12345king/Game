'use strict';

// ═══════════════════════════════════════════════════════════════════
//  🕵️  لعبة الجاسوس  — نسخة مُعاد كتابتها بالكامل
// ═══════════════════════════════════════════════════════════════════

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  InteractionWebhook,
  AttachmentBuilder,
  EmbedBuilder,
} = require('discord.js');

const db     = require('../database.js');
const config = require('../config.js');
const path   = require('path');

// ─── ثوابت ───────────────────────────────────────────────────────
const MIN_PLAYERS   = 3;
const MAX_PLAYERS   = 10;
const LOBBY_TIME    = config.lobbyTime?.outsider ?? 60_000;   // ms

// أوقات الأوضاع
const TIMES = {
  classic:   { hint: 35_000, guess: 45_000, vote: 25_000 },
  questions: { answer: 50_000, vote: 25_000, minRounds: 4 },
  mission:   { discuss: 60_000, vote: 30_000 },
};

const MAX_GUESSES = 3;

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
//  بناء واجهة الاستقبال (Lobby)
// ════════════════════════════════════════════════════════════════════

function buildLobbyContainer(deadline, players, mode, files = []) {
  const modeLabel = {
    classic:   '🎯 الكلاسيكي — تلميحات سرية',
    questions: '❓ الأسئلة — التحقيق المتبادل',
    mission:   '💣 المهمة — فريق ضد فريق',
  }[mode] ?? '🎯 الكلاسيكي';

  const playerList = players.length
    ? players.map((p, i) => `> \`${String(i + 1).padStart(2, '0')}\` <@${p.id}>`).join('\n')
    : '> *لا يوجد لاعبون بعد — كن أول المنضمين!*';

  // صورة اللوبي
  const img = config.lobbyImages?.outsider;
  let mediaSection = null;
  if (img) {
    if (!img.startsWith('http://') && !img.startsWith('https://')) {
      const fileName = path.basename(img);
      files.push(new AttachmentBuilder(img, { name: fileName }));
      mediaSection = `attachment://${fileName}`;
    } else {
      mediaSection = img;
    }
  }

  const bar = '█'.repeat(Math.round((players.length / MAX_PLAYERS) * 10))
            + '░'.repeat(10 - Math.round((players.length / MAX_PLAYERS) * 10));

  const c = new ContainerBuilder().setAccentColor(config.colors?.outsider ?? 0x6C3483);

  if (mediaSection) {
    c.addMediaGalleryComponents(g => g.addItems(item => item.setURL(mediaSection)));
  }

  c.addTextDisplayComponents(t => t.setContent(
    `# 🕵️‍♂️ لعبة الجاسوس\n` +
    `### الوضع: ${modeLabel}\n` +
    `⏰ ينتهي الانضمام: <t:${Math.floor(Date.now() / 1000) + Math.floor(LOBBY_TIME / 1000)}:R>\n\n` +
    `**اللاعبون \`${players.length}/${MAX_PLAYERS}\`**\n` +
    `\`${bar}\`\n\n` +
    `${playerList}`,
  ));

  c.addSeparatorComponents(s => s.setSpacing(1));

  // سلكت منيو لاختيار الوضع
  const modeSelect = new StringSelectMenuBuilder()
    .setCustomId('mode_select')
    .setPlaceholder('🎮 اختر وضع اللعب')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('الكلاسيكي')
        .setDescription('كل لاعب يعطي تلميحاً، والجاسوس يخمن سراً')
        .setValue('classic')
        .setEmoji('🎯')
        .setDefault(mode === 'classic'),
      new StringSelectMenuOptionBuilder()
        .setLabel('الأسئلة')
        .setDescription('اللاعبون يسألون بعضهم — اكتشف الجاسوس!')
        .setValue('questions')
        .setEmoji('❓')
        .setDefault(mode === 'questions'),
      new StringSelectMenuOptionBuilder()
        .setLabel('المهمة')
        .setDescription('جاسوس يقاوم مجموعة — ومهمة خفية يجب إنجازها')
        .setValue('mission')
        .setEmoji('💣')
        .setDefault(mode === 'mission'),
    );

  c.addActionRowComponents(r => r.setComponents(modeSelect));
  c.addActionRowComponents(r => r.setComponents(
    new ButtonBuilder().setCustomId('join').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('✋'),
    new ButtonBuilder().setCustomId('exit').setLabel('خروج').setStyle(ButtonStyle.Danger).setEmoji('🚪'),
  ));

  return c;
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
        content: '',
        components: [
          new ContainerBuilder()
            .setAccentColor(0xE74C3C)
            .addTextDisplayComponents(t => t.setContent(
              '### ⛔ اللعبة تعمل بالفعل!\nانتظر انتهاء الجولة الحالية ثم حاول مرة أخرى.',
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      callback();
      return;
    }

    GAME_ACTIVE = true;
    await runLobby(message, callback);
  },
};

// ════════════════════════════════════════════════════════════════════
//  مرحلة الاستقبال (Lobby)
// ════════════════════════════════════════════════════════════════════

async function runLobby(context, callback) {
  let players = [];
  let currentMode = 'classic';
  const hostId = context.author?.id ?? context.user?.id;

  const files = [];
  const lobbyMsg = await context.reply({
    components: [buildLobbyContainer(Date.now(), players, currentMode, files)],
    flags: MessageFlags.IsComponentsV2,
    files,
    fetchReply: true,
  });

  const col = lobbyMsg.createMessageComponentCollector({
    filter: i =>
      i.customId === 'join' ||
      i.customId === 'exit' ||
      i.customId === 'mode_select',
    time: LOBBY_TIME,
  });

  col.on('collect', async i => {
    // ── تغيير الوضع (المضيف فقط) ──
    if (i.customId === 'mode_select') {
      if (i.user.id !== hostId) {
        await i.reply({ content: '⚠️ فقط من بدأ اللعبة يستطيع تغيير الوضع.', ephemeral: true });
        return;
      }
      currentMode = i.values[0];
      const newFiles = [];
      await i.update({
        components: [buildLobbyContainer(Date.now(), players, currentMode, newFiles)],
        flags: MessageFlags.IsComponentsV2,
        files: newFiles,
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

    const upFiles = [];
    await i.update({
      components: [buildLobbyContainer(Date.now(), players, currentMode, upFiles)],
      flags: MessageFlags.IsComponentsV2,
      files: upFiles,
    });
  });

  col.on('end', async () => {
    // أغلق اللوبي
    try {
      await lobbyMsg.edit({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x7F8C8D)
            .addTextDisplayComponents(t => t.setContent(
              `### 🔒 انتهى وقت الانضمام\nاللاعبون: ${players.map(p => `<@${p.id}>`).join(' • ') || 'لا يوجد'}`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (_) {}

    if (players.length < MIN_PLAYERS) {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xE74C3C)
            .addTextDisplayComponents(t => t.setContent(
              `### ❌ لم يكتمل العدد\nيحتاج الحد الأدنى **${MIN_PLAYERS} لاعبين**.\nاللاعبون المنضمون: ${players.length}`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      resetGame();
      callback();
      return;
    }

    // ابدأ الوضع المناسب
    const opts = { context, players, callback };
    if      (currentMode === 'questions') await runQuestionsMode(opts);
    else if (currentMode === 'mission')   await runMissionMode(opts);
    else                                   await runClassicMode(opts);
  });
}

// ════════════════════════════════════════════════════════════════════
//  🎯  الوضع الكلاسيكي
// ════════════════════════════════════════════════════════════════════

async function runClassicMode({ context, players, callback }) {
  const { hint: HINT_TIME, guess: GUESS_TIME, vote: VOTE_TIME } = TIMES.classic;

  const word        = randomWord();
  const outsiderIdx = Math.floor(Math.random() * players.length);
  const outsider    = players[outsiderIdx];
  const insiders    = players.filter((_, i) => i !== outsiderIdx);
  const order       = shuffle(insiders); // ترتيب عشوائي للتلميحات

  // ── إرسال الأدوار سراً ──
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

  // إرسال الأدوار عبر DM
  for (const player of players) {
    const isOutsider = player.id === outsider.id;
    await sendDM(context.client, player,
      isOutsider
        ? `🕵️‍♂️ **أنت الجاسوس!**\n\nاستمع جيداً لتلميحات الآخرين وحاول تخمين الكلمة السرية.\nتجنب الكشف عن نفسك!`
        : `✅ **أنت من المجموعة!**\n\nالكلمة السرية: **${word}**\n\nلمّح للكلمة دون ذكرها مباشرة — ساعد المجموعة في كشف الجاسوس!`,
    );
  }

  await sleep(4000);

  // ── مرحلة التلميحات ──
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
    const promptMsg = await context.channel.send({
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

  // ── عرض التلميحات ──
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
          ),
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(2000);

  // ── مرحلة التخمين السري ──
  await sendDM(context.client, outsider,
    `## 🎯 دورك للتخمين!\n\n` +
    `التلميحات التي سمعتها:\n${validHints.map((h, i) => `**${i + 1}.** ${h.hint}`).join('\n')}\n\n` +
    `لديك **${MAX_GUESSES}** محاولات.\n` +
    `**أرسل تخمينك الآن عبر الدردشة العامة.**`,
  );

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x8E44AD)
        .addTextDisplayComponents(t => t.setContent(
          `## 🎯 دور الجاسوس!\n` +
          `تم إرسال التلميحات للجاسوس سراً.\n` +
          `<@${outsider.id}> — لديك **${MAX_GUESSES}** محاولات لتخمين الكلمة.\n` +
          `-# اكتب تخمينك في المحادثة الآن`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  // جمع التخمينات
  let guessed = false;
  for (let attempt = 1; attempt <= MAX_GUESSES; attempt++) {
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xE67E22)
          .addTextDisplayComponents(t => t.setContent(
            `### 🎲 المحاولة ${attempt}/${MAX_GUESSES}\n` +
            `<@${outsider.id}> — اكتب تخمينك الآن!\n` +
            `-# ⏰ ${GUESS_TIME / 1000} ثانية`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const guess = await collectMessage(context.channel, outsider.id, GUESS_TIME);

    if (!guess) {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x7F8C8D)
            .addTextDisplayComponents(t => t.setContent(`⏰ انتهى الوقت — المحاولة ${attempt} ضائعة.`)),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      continue;
    }

    // تحقق التطابق (بدون حساسية للشكل والمسافات)
    const normalize = s => s.replace(/[\u064B-\u065F]/g, '').trim().toLowerCase();
    if (normalize(guess) === normalize(word)) {
      guessed = true;
      break;
    }

    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xE74C3C)
          .addTextDisplayComponents(t => t.setContent(
            `❌ **"${guess}"** — خاطئ!\n` +
            `-# تبقى ${MAX_GUESSES - attempt} محاولة`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  // ── مرحلة التصويت ──
  await runVotePhase({ context, players, outsider, word, guessed, VOTE_TIME, mode: 'classic', callback });
}

// ════════════════════════════════════════════════════════════════════
//  ❓  وضع الأسئلة
// ════════════════════════════════════════════════════════════════════

async function runQuestionsMode({ context, players, callback }) {
  const { answer: ANSWER_TIME, vote: VOTE_TIME, minRounds: MIN_ROUNDS } = TIMES.questions;

  const word        = randomWord();
  const outsiderIdx = Math.floor(Math.random() * players.length);
  const outsider    = players[outsiderIdx];
  const insiders    = players.filter((_, i) => i !== outsiderIdx);

  // ── توزيع الأدوار ──
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
        ? `🕵️‍♂️ **أنت الجاسوس!**\n\nاللاعبون سيسألون بعضهم البعض.\nأجب بذكاء لتتجنب الكشف!\nبعد ${MIN_ROUNDS} جولات يفتح التصويت.`
        : `✅ **أنت من المجموعة!**\n\nالكلمة السرية: **${word}**\n\nاسأل أسئلة ذكية وراقب الإجابات — الجاسوس لا يعرف الكلمة!`,
    );
  }

  await sleep(3000);

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x1ABC9C)
        .addTextDisplayComponents(t => t.setContent(
          `## 🔍 مرحلة التحقيق\n\n` +
          `**القواعد:**\n` +
          `> • البوت يختار أول سائل عشوائياً\n` +
          `> • بعد كل إجابة، المُجيب يختار من يسأل التالي\n` +
          `> • بعد **${MIN_ROUNDS} جولات** يفتح زر التصويت\n` +
          `> • أي لاعب يستطيع طلب التصويت في أي وقت بعدها\n\n` +
          `-# استعدوا!`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(3000);

  let rounds = 0;
  let voteRequested = false;
  let currentAsker = players[Math.floor(Math.random() * players.length)];

  while (!voteRequested) {
    // اختر مستجيب (عشوائي غير السائل)
    const others = players.filter(p => p.id !== currentAsker.id);
    const target  = others[Math.floor(Math.random() * others.length)];

    // أرسل رسالة السؤال مع أزرار (فقط للسائل) — لأننا في DM-based game نفعل التصويت علناً
    const questionPromptMsg = await context.channel.send({
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

    // جمع السؤال من السائل
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
      // انتقل لسائل عشوائي آخر
      currentAsker = players[Math.floor(Math.random() * players.length)];
      rounds++;
    } else {
      // انتظر الإجابة
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

      // بعد MIN_ROUNDS، المُجيب يختار من يسأل التالي أو يطلب تصويت
      if (rounds >= MIN_ROUNDS) {
        // عرض أزرار الاختيار
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
        // قبل MIN_ROUNDS، البوت يختار التالي تلقائياً
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

    // تحقق هل جميع اللاعبين طلبوا التصويت
    if (rounds >= MIN_ROUNDS + 10) { voteRequested = true; } // حد أقصى 14 جولة
  }

  // ── مرحلة التصويت ──
  await runVotePhase({ context, players, outsider, word, guessed: false, VOTE_TIME, mode: 'questions', callback });
}

// ════════════════════════════════════════════════════════════════════
//  💣  وضع المهمة
// ════════════════════════════════════════════════════════════════════
// الفكرة: الجاسوس لديه مهمة سرية عليه إنجازها خلال النقاش دون أن يُكشف.
// المجموعة تحاول كشفه قبل أن ينجز مهمته.
// المهام: ذكر كلمة محددة، إقناع شخص معين بشيء، الخ.

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
        ? `🕵️‍♂️ **أنت الجاسوس!**\n\n**مهمتك السرية:**\n> ${mission}\n\nأكمل مهمتك أثناء النقاش دون كشف نفسك!\nإذا نجحت قبل انتهاء الوقت أو التصويت — تفوز!`
        : `✅ **أنت من المجموعة!**\n\nالكلمة السرية: **${word}**\n\nناقشوا الكلمة وحاولوا كشف الجاسوس قبل أن ينجز مهمته السرية!`,
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
          `> • الجاسوس لديه **مهمة سرية** يجب إنجازها\n` +
          `> • المجموعة تعرف الكلمة السرية ومهمتها كشف الجاسوس\n` +
          `> • النقاش حر لمدة **${DISCUSS_TIME / 1000} ثانية**\n` +
          `> • إذا أنجز الجاسوس مهمته — يفوز حتى لو كُشف!\n\n` +
          `-# ابدأوا النقاش الآن!`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  // مراقبة الرسائل للبحث عن إنجاز المهمة
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
    await revealResults({ context, outsider, word, guessed: true, mode: 'mission', mission });
    resetGame();
    callback();
    return;
  }

  // ── مرحلة التصويت ──
  await runVotePhase({ context, players, outsider, word, guessed: false, VOTE_TIME, mode: 'mission', mission, callback });
}

// ════════════════════════════════════════════════════════════════════
//  🗳️  مرحلة التصويت (مشتركة بين الأوضاع)
// ════════════════════════════════════════════════════════════════════

async function runVotePhase({ context, players, outsider, word, guessed, VOTE_TIME, mode, mission, callback }) {
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

  // بناء صفوف التصويت (5 لاعبين كحد أقصى لكل صف)
  const voteComponents = [];
  for (let i = 0; i < players.length; i += 4) {
    const row = new ActionRowBuilder();
    players.slice(i, i + 4).forEach(p => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`vote_${p.id}`)
          .setLabel(p.displayName.substring(0, 40))
          .setStyle(p.id === outsider.id ? ButtonStyle.Danger : ButtonStyle.Secondary),
      );
    });
    voteComponents.push(row);
  }
  voteComponents.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vote_none').setLabel('لا أشك بأحد 🤷').setStyle(ButtonStyle.Primary),
    ),
  );

  const container = new ContainerBuilder()
    .setAccentColor(0x8E44AD)
    .addTextDisplayComponents(t => t.setContent(`🗳️ صوّت على من تشك أنه الجاسوس:`));
  voteComponents.forEach(row => container.addActionRowComponents(r => {
    row.components.forEach(b => r.addComponents(b));
    return r;
  }));

  const voteMsg = await context.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });

  const votes   = new Map();
  const voters  = new Set();

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
      votes.set(target, (votes.get(target) ?? 0) + 1);
      await i.reply({ content: `✅ تم تسجيل صوتك على **${target === 'none' ? 'لا أحد' : players.find(p => p.id === target)?.displayName ?? target}**`, ephemeral: true });
    });

    col.on('end', resolve);
  });

  // تعطيل الأزرار
  try {
    const disabledContainer = new ContainerBuilder()
      .setAccentColor(0x7F8C8D)
      .addTextDisplayComponents(t => t.setContent(`🔒 انتهى وقت التصويت.`));
    await voteMsg.edit({ components: [disabledContainer], flags: MessageFlags.IsComponentsV2 });
  } catch (_) {}

  // حساب النتائج
  let mostVoted = null, maxVotes = 0;
  for (const [id, count] of votes) {
    if (id !== 'none' && count > maxVotes) { maxVotes = count; mostVoted = id; }
  }

  const noneVotes = votes.get('none') ?? 0;
  const voteSummary = [...votes.entries()]
    .filter(([id]) => id !== 'none')
    .sort((a, b) => b[1] - a[1])
    .map(([id, c]) => {
      const p = players.find(pl => pl.id === id);
      return `> <@${id}> (${p?.displayName ?? '?'}) — **${c}** صوت${id === outsider.id ? ' 🕵️' : ''}`;
    });
  if (noneVotes > 0) voteSummary.push(`> لا أحد — **${noneVotes}** صوت`);

  const voteCorrect = mostVoted === outsider.id;
  const pts = config.winPoints?.outsider ?? 100;

  // ── تحديد الفائز ──
  let winner, resultText;

  if (mode === 'classic') {
    if (guessed && voteCorrect) {
      // الجاسوس خمّن لكن تم كشفه — المجموعة تفوز
      winner = 'insiders';
      resultText = `⚖️ الجاسوس خمّن الكلمة لكن المجموعة كشفته بالتصويت — **المجموعة تفوز!**`;
    } else if (guessed) {
      // الجاسوس خمّن ولم يُكشف — الجاسوس يفوز
      winner = 'outsider';
      resultText = `🕵️ الجاسوس خمّن الكلمة ولم يُكشف — **الجاسوس يفوز!**`;
    } else if (voteCorrect) {
      // الجاسوس لم يخمن وتم كشفه — المجموعة تفوز
      winner = 'insiders';
      resultText = `🎯 المجموعة كشفت الجاسوس بالتصويت — **المجموعة تفوز!**`;
    } else {
      // الجاسوس لم يخمن ولم يُكشف — الجاسوس يفوز
      winner = 'outsider';
      resultText = `🕵️ الجاسوس نجا من الكشف — **الجاسوس يفوز!**`;
    }
  } else {
    // أوضاع أخرى: الكشف بالتصويت فقط
    winner = voteCorrect ? 'insiders' : 'outsider';
    resultText = voteCorrect
      ? `🎯 المجموعة كشفت الجاسوس — **المجموعة تفوز!**`
      : `🕵️ الجاسوس نجا — **الجاسوس يفوز!**`;
  }

  // منح النقاط
  if (winner === 'outsider') {
    await db.addPoints(outsider.id, pts);
  } else {
    for (const p of players.filter(pl => pl.id !== outsider.id)) {
      await db.addPoints(p.id, pts);
    }
  }

  // ── عرض النتائج النهائية ──
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

async function revealResults({ context, outsider, word, guessed, mode, mission }) {
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
