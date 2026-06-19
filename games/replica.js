const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  InteractionWebhook,
  AttachmentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const db = require('../database.js');
const config = require('../config.js');
const path = require("path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const fetch = require("node-fetch"); // تأكد من تثبيت node-fetch إذا كنت تستخدم إصدار Node أقل من 18

// ======================== الإيموجيات الموحدة ========================
const EMOJI = {
  LOBBY: '🔠',                              // يستخدم في عنوان اللوبي وأيقونة اللعبة
  JOIN: '<:z1:1511780346008436946>',        // زر الدخول في اللوبي (أخضر)
  LEAVE: '<:z2:1511780387506880542>',       // زر الخروج في اللوبي (أحمر)
  WARNING: '<:z16:1515274356845056162>',    // تنبيه / تحذير (مثل لاعب موجود مسبقاً)
  SUCCESS: '<:z3:1511872921142825040>',     // نجاح العملية (توزيع الأدوار، بدء الجولة)
  ERROR: '<:z4:1511873048557387977>',       // خطأ (اللعبة ممتلئة، لم تكن في اللعبة...)
  TIMER: '<:z15:1515273469389181071>',      // التوقيت المتبقي / مؤقت
  KICK: '<:z6:1512127272184975360>',        // طرد / إقصاء لاعب
  SKIP: '⏭️',                               // تخطي (عند تعادل التصويت)
  WIN: '🏆',                                 // فوز
  LOSE: '💀',                               // خسارة
  VOTE: '<:z20:1515282515982815282>',       // أيقونة التصويت (غير مستخدمة هنا، محجوزة)
  OK: '<:z1:1515940737760362648>',          // موافقة / تم
  ANNOUNCE: '📢',                           // إعلان
};

// ======================== أيقونات أرقام مخصصة للوبي فقط ========================
const LOBBY_NUMBER_EMOJIS = [
  '<:z2:1515948329975021608>',  // 0
  '<:zn1:1515295486704353340>', // 1
  '<:zn2:1515294909572059168>', // 2
  '<:zn3:1515295579746336849>', // 3
  '<:zn4:1515295655889731685>', // 4
  '<:zn5:1515295717063659600>', // 5
  '<:zn6:1515295780670537828>', // 6
  '<:zn7:1515295840376197240>', // 7
  '<:zn8:1515295897339170836>', // 8
  '<:zn9:1515295978494759032>', // 9
];

function lobbyNumberEmoji(num) {
  if (num === 0) return LOBBY_NUMBER_EMOJIS[0];
  let str = '';
  let n = num;
  while (n > 0) {
    const digit = n % 10;
    str = LOBBY_NUMBER_EMOJIS[digit] + str;
    n = Math.floor(n / 10);
  }
  return str;
}

// دالة لاستخراج معلومات الإيموجي المخصص
function parseCustomEmoji(emojiString) {
  const match = emojiString.match(/^<a?:\w+:(\d+)>$/);
  if (match) {
    return { id: match[1], name: emojiString.split(':')[1], animated: emojiString.startsWith('<a:') };
  }
  return null;
}

// ======================== إعدادات اللعبة ========================
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 15;
const TIME_TO_START = config.lobbyTime.replica;
const TIME_TO_ANSWER = 15000; // 15 ثانية للإجابة

const ARABIC_LETTERS = [
  'أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص',
  'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'
];

const CATEGORIES = ['اسم إنسان', 'اسم حيوان', 'اسم نبات', 'اسم جماد', 'اسم دولة'];

let GAME_ACTIVE = false;
let players = [];
let usedWords = []; // لتتبع الكلمات المستخدمة ومنع التكرار

// ======================== نقطة البداية ========================
module.exports = {
  name: 'replica',
  aliases: ["ريبلكا"],
  async execute(message, args, callback) {
    if (GAME_ACTIVE) {
      message.reply(`> **${EMOJI.ERROR} | لقد بدأت لعبة أخرى بالفعل. الرجاء الانتظار حتى انتهاء اللعبة الحالية.**`);
      callback();
      return;
    }

    GAME_ACTIVE = true;
    const nowTime = Math.floor(Date.now() / 1000);
    startGame(message, nowTime, callback);
  }
};

function resetGameData() {
  GAME_ACTIVE = false;
  players = [];
  usedWords = [];
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function getRandomWinPoints() {
  const pts = config.winPoints.replica;
  if (typeof pts === 'object') return Math.floor(Math.random() * (pts.max - pts.min + 1)) + pts.min;
  return pts;
}

async function win(playerId, context) {
  try {
    const points = getRandomWinPoints();
    await db.addPoints(playerId, points);
    await context.channel.send(`${EMOJI.WIN} | <@${playerId}> فاز بـ **${points}** نقطة!`).catch(() => {});
  } catch (e) {
    console.error(`[Replica] Failed to apply win points: ${e}`);
  }
}
async function lose(playerId, context) {
  // لا خسارة نقاط حالياً
}

// ======================== التحقق بواسطة الذكاء الاصطناعي ========================
async function isValidWord(word, letter, category) {
  // نرسل طلباً إلى خدمة الذكاء الاصطناعي المحددة في config
  const apiKey = config.ai?.apiKey;
  const endpoint = config.ai?.endpoint || "https://api.openai.com/v1/chat/completions";
  const model = config.ai?.model || "gpt-4o-mini";

  if (!apiKey) {
    // في حالة عدم وجود إعدادات الذكاء الاصطناعي، نعتمد على قواعد بسيطة كحل مؤقت
    console.warn("[Replica] No AI config found, using fallback logic (not recommended).");
    // تحقق بسيط: الحرف الأول مطابق والكلمة على الأقل 2 أحرف
    if (!word.startsWith(letter) || word.length < 2) return false;
    // تحقق بدائي من التصنيف (يمكن إزالته لاحقاً بعد تفعيل AI)
    if (category === 'اسم نبات') return !['بصل', 'تفاح', 'جزر', 'زيتون'].includes(word); // مجرد مثال
    return true;
  }

  try {
    const prompt = `
    أنت مدقق لغوي دقيق. هل الكلمة "${word}" (تكتب بالأحرف العربية) تبدأ فعلاً بحرف "${letter}" وتنتمي حقيقةً إلى فئة "${category}"؟
    أجب بـ "yes" إذا كانت الإجابة صحيحة، أو "no" إذا كانت خاطئة، مع تفسير مختصر.
    ملاحظة: لا تعتبر الكلمة صحيحة إذا كانت تنتمي إلى فئة مختلفة (مثلاً نبات لا يصبح جماداً، والعكس).
    `;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "أنت مساعد مفيد." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 10
      })
    });

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim();
    return answer === 'yes';
  } catch (e) {
    console.error("[Replica] AI validation error:", e);
    // في حال فشل الاتصال، نرفض الكلمة حفاظاً على نزاهة اللعبة
    return false;
  }
}

// ======================== بناء واجهة اللوبي (بنفس تصميم المافيا) ========================
function buildLobbyEmbed(guildName, nowTime, lobbyPlayers) {
  const embed = new EmbedBuilder()
    .setColor(config.colors.replica || 0x9B59B6)
    .setTitle(guildName)
    .setDescription(
      `__**شرح اللعبة:**__\n` +
      `1- انضم للعبة عبر الضغط على زر دخول ${EMOJI.JOIN} الموجود في الأسفل.\n` +
      `2- تبدأ اللعبة باختيار حرف عربي، ثم يحصل كل لاعب على فئة (إنسان، حيوان، نبات، جماد، دولة).\n` +
      `3- يجب على كل لاعب في دوره أن يكتب كلمة تبدأ بالحرف المختار وتنتمي للفئة المخصصة له.\n` +
      `4- يتم التحقق من صحة الكلمة بالذكاء الاصطناعي، ولا يسمح بتكرار الكلمات. من يخطئ يخرج، والفائز آخر لاعب متبقٍ.\n\n` +
      `> ${EMOJI.TIMER} الوقت المتبقي: <t:${nowTime + TIME_TO_START / 1000}:R>\n\n` +
      `> **(${lobbyPlayers.length}/${MAX_PLAYERS})**\n\n` +
      `**المشاركين حاليا:**\n` +
      (lobbyPlayers.length
        ? lobbyPlayers.map((p, i) => `> ${lobbyNumberEmoji(i + 1)} <@${p.id}>`).join('\n')
        : `> لا يوجد لاعبين بعد`)
    );

  const lobbyImage = config.lobbyImages.replica;
  if (lobbyImage) embed.setImage(lobbyImage);

  return embed;
}

function buildLobbyButtons() {
  const joinEmoji = parseCustomEmoji(EMOJI.JOIN);
  const leaveEmoji = parseCustomEmoji(EMOJI.LEAVE);

  const joinButton = new ButtonBuilder()
    .setCustomId('join')
    .setLabel('دخول')
    .setStyle(ButtonStyle.Secondary);
  if (joinEmoji) joinButton.setEmoji({ id: joinEmoji.id, name: joinEmoji.name, animated: false });

  const leaveButton = new ButtonBuilder()
    .setCustomId('exit')
    .setLabel('خروج')
    .setStyle(ButtonStyle.Secondary);
  if (leaveEmoji) leaveButton.setEmoji({ id: leaveEmoji.id, name: leaveEmoji.name, animated: false });

  return new ActionRowBuilder().addComponents(joinButton, leaveButton);
}

// ======================== دالة بدء اللعبة (اللوبي ثم الجولات) ========================
async function startGame(context, nowTime, callback) {
  players = [];
  usedWords = [];
  const guildName = context.guild.name;

  const embed = buildLobbyEmbed(guildName, nowTime, players);
  const buttons = buildLobbyButtons();

  let sentMessage;
  try {
    sentMessage = await context.reply({
      embeds: [embed],
      components: [buttons],
      fetchReply: true,
    });

    const filter = (i) => i.customId === "join" || i.customId === "exit";
    const collector = sentMessage.createMessageComponentCollector({ filter, time: TIME_TO_START });

    collector.on("collect", async (i) => {
      if (i.customId === "join") {
        if (players.length < MAX_PLAYERS) {
          if (!players.some(p => p.id === i.user.id)) {
            players.push({
              id: i.user.id,
              displayName: i.member?.displayName || i.user.displayName,
              avatarURL: i.user.displayAvatarURL({ extension: "png", forceStatic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png",
            });
            await i.update({ embeds: [buildLobbyEmbed(guildName, nowTime, players)], components: [buildLobbyButtons()] });
          } else {
            await i.reply({ content: `${EMOJI.WARNING} أنت بالفعل في اللعبة!`, ephemeral: true });
          }
        } else {
          await i.reply({ content: `${EMOJI.KICK} اللعبة ممتلئة!`, ephemeral: true });
        }
      } else if (i.customId === "exit") {
        if (players.some(p => p.id === i.user.id)) {
          players = players.filter(p => p.id !== i.user.id);
          await i.update({ embeds: [buildLobbyEmbed(guildName, nowTime, players)], components: [buildLobbyButtons()] });
        } else {
          await i.reply({ content: `${EMOJI.ERROR} لم تكن في اللعبة.`, ephemeral: true });
        }
      }
    });

    collector.on("end", async () => {
      if (players.length < MIN_PLAYERS) {
        await context.channel.send(`${EMOJI.KICK} لم يكن هناك عدد كافٍ من اللاعبين لبدء اللعبة.`);
        resetGameData();
        callback(null, false, 0, "Not enough players");
        return;
      }

      // ====== رسالة بداية اللعبة (تصميم مافيا لكن بدون فريقين) ======
      await context.channel.send(`${EMOJI.SUCCESS} | تم تسجيل اللاعبين، ستبدأ الجولة الأولى بعد قليل...`);
      const playersList = players.map(p => `<@${p.id}>`).join(' ');
      await context.channel.send(`**اللاعبون المشاركون:**\n${playersList}`);
      await sleep(3000);

      // ====== بدء الجولات ======
      await gameRoundLoop(context, players, callback);
    });

  } catch (error) {
    console.error("Error starting the game:", error);
    resetGameData();
    callback(null, false, 0, "Error starting game");
    if (context.channel) {
      await context.channel.send(`${EMOJI.ERROR} حدث خطأ أثناء بدء اللعبة. يرجى المحاولة مرة أخرى.`);
    }
  }
}

// ======================== الحلقة الرئيسية للجولات ========================
async function gameRoundLoop(context, currentPlayers, callback) {
  // ترتيب اللاعبين حسب دخولهم (كما هم)
  let alivePlayers = [...currentPlayers];
  let letterIndex = 0; // ابدأ من أول حرف (الألف)

  // نستخدم ترتيب ثابت للحروف حسب ARABIC_LETTERS
  while (alivePlayers.length > 1 && letterIndex < ARABIC_LETTERS.length) {
    const currentLetter = ARABIC_LETTERS[letterIndex];
    await context.channel.send(`\n${EMOJI.ANNOUNCE} | **الحرف الجديد: ${currentLetter}**`);

    // نوزع الفئات على اللاعبين الأحياء (تكرار القائمة حسب الحاجة)
    const categoriesForRound = [];
    for (let i = 0; i < alivePlayers.length; i++) {
      categoriesForRound.push(CATEGORIES[i % CATEGORIES.length]);
    }

    // نمر على كل لاعب ونجعله يجيب
    for (let i = 0; i < alivePlayers.length; i++) {
      const player = alivePlayers[i];
      const category = categoriesForRound[i];

      // إرسال تحدي للاعب
      const challengeMsg = await context.channel.send(
        `<@${player.id}> ${EMOJI.TIMER} | دورك! الفئة: **${category}** - الحرف: **${currentLetter}**\nاكتب كلمة تبدأ بالحرف وتنتمي للفئة خلال ${TIME_TO_ANSWER / 1000} ثانية:`
      );

      // انتظار رد اللاعب
      let answered = false;
      let valid = false;
      try {
        const collected = await context.channel.awaitMessages({
          filter: m => m.author.id === player.id && !m.author.bot,
          max: 1,
          time: TIME_TO_ANSWER,
          errors: ['time'],
        });
        const answerMessage = collected.first();
        const answerWord = answerMessage.content.trim();

        // التحقق من أن الكلمة تبدأ بالحرف الصحيح وتنتمي للفئة (AI)
        valid = await isValidWord(answerWord, currentLetter, category);

        // التأكد من عدم تكرار الكلمة
        if (valid && usedWords.includes(answerWord)) {
          valid = false;
          await context.channel.send(`${EMOJI.ERROR} الكلمة "${answerWord}" سبق استخدامها!`);
        }

        if (valid) {
          usedWords.push(answerWord);
          await answerMessage.react('✅');
          answered = true;
        } else {
          await answerMessage.react('❌');
        }
      } catch (e) {
        // انتهى الوقت أو لم يرسل شيئاً
        await context.channel.send(`${EMOJI.TIMER} انتهى الوقت!`);
      }

      if (!answered || !valid) {
        // اللاعب يخرج
        await context.channel.send(`${EMOJI.KICK} <@${player.id}> خرج من اللعبة!`);
        alivePlayers = alivePlayers.filter(p => p.id !== player.id);
        if (alivePlayers.length <= 1) break; // فوز مبكر
      }

      await sleep(1000); // وقفة بين اللاعبين
    }

    letterIndex++; // الحرف التالي بعد انتهاء الجولة
  }

  // ==== الإعلان عن الفائز ====
  if (alivePlayers.length === 1) {
    const winner = alivePlayers[0];
    await win(winner.id, context);
    await context.channel.send(`${EMOJI.WIN} | **<@${winner.id}> هو الفائز الأخير! مبروك!**`);
    // إرسال ملخص اللاعبين
    const allPlayers = currentPlayers;
    const msg = `# ${EMOJI.WIN} نهاية اللعبة\n${allPlayers.map(p => `- <@${p.id}>`).join('\n')}\n\n${EMOJI.WIN} الفائز: <@${winner.id}>`;
    await context.channel.send(msg);
  } else {
    await context.channel.send(`${EMOJI.SKIP} انتهت جميع الحروف دون فائز وحيد.`);
  }

  resetGameData();
  callback(null, false, 0, "Game finished");
}