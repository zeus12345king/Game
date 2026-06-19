const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const db = require('../database.js');
const config = require('../config.js');

// ======================== الإيموجيات الموحدة ========================
const EMOJI = {
  LOBBY: '🔠',                              // يستخدم في عنوان اللوبي
  JOIN: '<:z1:1511780346008436946>',        // زر الدخول (أخضر)
  LEAVE: '<:z2:1511780387506880542>',       // زر الخروج (أحمر)
  WARNING: '<:z16:1515274356845056162>',    // تنبيه / تحذير
  SUCCESS: '<:z3:1511872921142825040>',     // نجاح (تسجيل، بدء)
  ERROR: '<:z4:1511873048557387977>',       // خطأ
  TIMER: '<:z15:1515273469389181071>',      // التوقيت / مؤقت
  KICK: '<:z6:1512127272184975360>',        // طرد / إقصاء
  SKIP: '⏭️',                               // تخطي (تعادل أو إنهاء)
  WIN: '🏆',                                 // فوز
  LOSE: '💀',                               // خسارة
  OK: '<:z1:1515940737760362648>',          // موافقة / تم
  ANNOUNCE: '📢',                           // إعلان (حرف جديد مثلاً)
  BULLET: '💥',                             // غير مستخدم حالياً لكنه محجوز
  PLAYER_JOIN: '🎉',                        // رسالة تأكيد انضمام
  PLAYER_LEAVE: '👋',                       // رسالة تأكيد خروج
  QUESTION_MARK: '❓',                      // لم تكن في اللعبة
  FULL_GAME: '🚪',                          // اللعبة ممتلئة
  ALREADY_IN: '🚫',                         // موجود مسبقاً
  PLAYERS: '👥',                            // أيقونة اللاعبين (يمكن استبدالها بإيموجي مخصص من السيرفر)
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
const TIME_TO_ANSWER = 15000;

let GAME_ACTIVE = false;
let players = [];
let usedWords = []; // الكلمات التي سبق استخدامها (لمنع التكرار)

const ARABIC_LETTERS = [
    'أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص',
    'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'
];
const CATEGORIES = ['اسم إنسان', 'اسم حيوان', 'اسم نبات', 'اسم جماد', 'اسم دولة'];

// تخزين نتائج التحقق من وجود دولة لكل حرف (كي لا نكرر النداء)
const countryCache = {};

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
    if (context) context.channel.send(`${EMOJI.WIN} | <@${playerId}> فاز بـ **${points}** نقطة!`).catch(() => {});
  } catch (e) {
    console.error(`[Replica] Failed to apply win points: ${e}`)
  }
}
async function lose(playerId, context) { }

// ======================== بناء واجهة اللوبي (بنفس تصميم المافيا) ========================
async function startGame(context, nowTime, callback) {
  players = [];

  function buildLobby(time, lobbyPlayers) {
    const joinEmoji = parseCustomEmoji(EMOJI.JOIN);
    const leaveEmoji = parseCustomEmoji(EMOJI.LEAVE);

    // شرح اللعبة مثل المافيا
    const description = [
      `__**شرح اللعبة:**__`,
      `1- انضم للعبة عبر الضغط على زر دخول ${EMOJI.JOIN} الموجود في الأسفل.`,
      `2- تبدأ اللعبة باختيار حرف عربي، ثم يحصل كل لاعب على فئة (إنسان، حيوان، نبات، جماد، دولة).`,
      `3- يجب على كل لاعب في دوره أن يكتب كلمة تبدأ بالحرف المختار وتنتمي للفئة المخصصة له.`,
      `4- يتم التحقق من صحة الكلمة بالذكاء الاصطناعي، ولا يسمح بتكرار الكلمات. من يخطئ يخرج، والفائز آخر لاعب متبقٍ.`,
      ``,
      `> ${EMOJI.TIMER} الوقت المتبقي: <t:${time + TIME_TO_START / 1000}:R>`,
      ``,
      `> **(${lobbyPlayers.length}/${MAX_PLAYERS})**`,
      ``,
      `**المشاركين حاليا:**`,
      (lobbyPlayers.length ? lobbyPlayers.map((p, i) => `> ${lobbyNumberEmoji(i + 1)} <@${p.id}>`).join('\n') : `> لا يوجد لاعبين بعد`)
    ].join('\n');

    const container = new ContainerBuilder()
      .setAccentColor(config.colors.replica)
      .addTextDisplayComponents(t => t.setContent(description))
      .addMediaGalleryComponents(g => {
        const img = config.lobbyImages.replica;
        if (img) g.addItems(item => item.setURL(img));
        return g;
      })
      .addActionRowComponents(r => {
        const joinBtn = new ButtonBuilder().setCustomId('join').setLabel('دخول').setStyle(ButtonStyle.Secondary);
        if (joinEmoji) joinBtn.setEmoji({ id: joinEmoji.id, name: joinEmoji.name, animated: false });

        const leaveBtn = new ButtonBuilder().setCustomId('exit').setLabel('خروج').setStyle(ButtonStyle.Secondary);
        if (leaveEmoji) leaveBtn.setEmoji({ id: leaveEmoji.id, name: leaveEmoji.name, animated: false });

        return r.setComponents(joinBtn, leaveBtn);
      });

    return container;
  }

  const sentMessage = await context.reply({
    components: [buildLobby(nowTime, players)],
    flags: MessageFlags.IsComponentsV2,
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
            displayName: i.user.displayName,
            avatarURL: i.user.displayAvatarURL({ extension: "png", forceStatic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png",
          });
          await i.update({ components: [buildLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
          await i.followUp({ content: `${EMOJI.PLAYER_JOIN} لقد انضممت إلى اللعبة!`, ephemeral: true });
        } else {
          await i.reply({ content: `${EMOJI.ALREADY_IN} أنت بالفعل في اللعبة!`, ephemeral: true });
        }
      } else {
        await i.reply({ content: `${EMOJI.FULL_GAME} اللعبة ممتلئة!`, ephemeral: true });
      }
    } else if (i.customId === "exit") {
      if (players.some(p => p.id === i.user.id)) {
        players = players.filter((p) => p.id !== i.user.id);
        await i.update({ components: [buildLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
        await i.followUp({ content: `${EMOJI.PLAYER_LEAVE} لقد غادرت اللعبة.`, ephemeral: true });
      } else {
        await i.reply({ content: `${EMOJI.QUESTION_MARK} لم تكن في اللعبة.`, ephemeral: true });
      }
    }
  });

  collector.on("end", async () => {
    try {
      const endContainer = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(t => t.setContent(
          `## ${EMOJI.LOBBY} لعبة ريبلكا\n**انتهى وقت الانضمام للعبة!**\n\n**اللاعبون المشاركون (${players.length}):** ${players.length > 0 ? players.map(p => `<@${p.id}>`).join(', ') : 'لا يوجد'}`
        ));
      await sentMessage.edit({ components: [endContainer], flags: MessageFlags.IsComponentsV2 });
    } catch (error) { /* ignore */ }

    if (players.length < MIN_PLAYERS) {
      await context.channel.send(`${EMOJI.KICK} لم يكن هناك عدد كافٍ من اللاعبين لبدء اللعبة.`);
      resetGameData();
      callback();
      return;
    }

    // رسالة بداية اللعبة (مثل تصميم المافيا)
    await context.channel.send(`${EMOJI.SUCCESS} | تم تسجيل اللاعبين، ستبدأ الجولة الأولى بعد قليل...`);
    const allPlayersMentions = players.map(p => `<@${p.id}>`).join(' ');
    await context.channel.send(`${EMOJI.PLAYERS} **اللاعبون المشاركون:**\n${allPlayersMentions}`);
    await sleep(3000);

    await context.channel.send(`${EMOJI.OK} | اكتمل عدد اللاعبين! اللعبة ستبدأ الآن...`);
    await gameLoop(context, callback, 0); // نبدأ من الحرف الأول (أ)
  });
}

// ======================== الحلقة الرئيسية (مع ترتيب الحروف) ========================
async function gameLoop(context, callback, letterIndex) {
    if (await checkWin(context, callback)) return;

    const nextIndex = await runLetterRound(context, callback, letterIndex);

    await sleep(4000);

    if (nextIndex < ARABIC_LETTERS.length) {
        await gameLoop(context, callback, nextIndex);
    } else {
        await context.channel.send(`${EMOJI.SKIP} انتهت جميع الحروف دون فائز وحيد.`);
        resetGameData();
        callback();
    }
}

async function runLetterRound(context, callback, letterIndex) {
    const letter = ARABIC_LETTERS[letterIndex];
    await context.channel.send(`${EMOJI.ANNOUNCE} حرف هذه الجولة هو **${letter}**`);
    await sleep(2000);

    // تحديد التصنيفات النشطة (إذا كان للحرف دولة تبدأ به)
    const countryExists = await checkCountryExists(letter);
    const activeCategories = ['اسم إنسان', 'اسم حيوان', 'اسم نبات', 'اسم جماد'];
    if (countryExists) {
        activeCategories.push('اسم دولة');
    }

    // ترتيب اللاعبين بشكل عشوائي ثم التناوب الدائري
    const playerQueue = [...players].sort(() => 0.5 - Math.random());

    for (const category of activeCategories) {
        // إذا لم يبقَ لاعبون نكسر الحلقة
        if (playerQueue.length === 0) break;

        // قبل السؤال عن الفئة، نتحقق من الفوز (لاعب واحد متبقٍ)
        if (await checkWin(context, callback)) return letterIndex + 1;

        // نأخذ اللاعب التالي من الطابور
        const currentPlayer = playerQueue.shift();

        const survived = await askQuestion(context, currentPlayer, letter, category);

        if (!survived) {
            // إخراج اللاعب من القائمة الرئيسية
            players = players.filter(p => p.id !== currentPlayer.id);
            await lose(currentPlayer.id, context);
            // اللاعب الذي خرج لا يعاد إلى الطابور
        } else {
            // إذا أجاب صحيحاً يعاد إلى نهاية الطابور ليمثل في فئات أخرى إن تطلب الأمر
            playerQueue.push(currentPlayer);
        }

        await sleep(2000);
    }

    // رسالة اللاعبين المتبقين بعد نهاية الجولة (إذا لم تنتهِ اللعبة بعد)
    if (players.length > 1) {
        const remainingMentions = players.map(p => `<@${p.id}>`).join(' ');
        await context.channel.send(`${EMOJI.PLAYERS} **اللاعبون المتبقون بعد الجولة:**\n${remainingMentions}`);
    }

    return letterIndex + 1; // الحرف التالي
}

async function askQuestion(context, player, letter, category) {
    return new Promise(async (resolve) => {
        const questionMsg = await context.channel.send(
          `${EMOJI.TIMER} <@${player.id}> لديك **${TIME_TO_ANSWER / 1000} ثانية** لإرسال **${category}** يبدأ بحرف **${letter}**.`
        );

        const filter = m => m.author.id === player.id && m.channel.id === context.channel.id;
        const collector = context.channel.createMessageCollector({ filter, time: TIME_TO_ANSWER, max: 1 });

        collector.on('collect', async (msg) => {
            const answer = msg.content.trim();

            // فحص أولي: إذا كانت الكلمة مستخدمة سابقاً => مرفوضة فوراً
            if (usedWords.includes(answer)) {
                await msg.reply(`${EMOJI.ERROR} الكلمة "${answer}" سبق استخدامها! تم طردك.`);
                resolve(false);
                return;
            }

            let isValid = false;
            const firstLetter = answer.charAt(0);
            let startsWithCorrectLetter = false;

            if (letter === 'أ') {
                startsWithCorrectLetter = (firstLetter === 'أ' || firstLetter === 'إ' || firstLetter === 'آ' || firstLetter === 'ا');
            } else {
                startsWithCorrectLetter = (firstLetter === letter);
            }

            if (startsWithCorrectLetter) {
                isValid = await validateAnswer(letter, category, answer);
            }

            if (isValid) {
                usedWords.push(answer); // تسجيل الكلمة الصحيحة
                await msg.reply(`${EMOJI.OK} إجابة <@${player.id}> صحيحة!`);
                resolve(true);
            } else {
                await msg.reply(`${EMOJI.LOSE} | إجابة <@${player.id}> خاطئة! تم طردك من اللعبة.`);
                resolve(false);
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                await questionMsg.reply(`${EMOJI.KICK} | تم طرد <@${player.id}> لعدم تفاعله في اللعبة.`);
                resolve(false);
            }
        });
    });
}

// ======================== التحقق بالذكاء الاصطناعي (بدون تغيير) ========================
async function validateAnswer(letter, category, answer) {
    const prompt = `
نحن نلعب لعبة "نبات جماد حيوان".
الحرف المطلوب: "${letter}".
التصنيف: "${category}".
الإجابة التي قالها اللاعب: "${answer}".

تحقق إذا كانت الإجابة صحيحة بناءً على الحرف والتصنيف، مع مراعاة ما يلي:

- إذا كان الحرف "${letter}" هو "أ" أو "ا" أو "إ" أو "آ"، فكل هذه تُعتبر صحيحة بنفس المعنى (أي أن الكلمة التي تبدأ بأي منها تعتبر مقبولة).
- تجاهل التشكيل (الحركات).
- لا تكن صارمًا في التطابق الحرفي إن كانت الكلمة صحيحة لغويًا وتبدأ بنفس الصوت.
- يجب أن تكون الكلمة من التصنيف المطلوب (إنسان، حيوان، نبات، جماد، دولة).
- أجب بـ "نعم" فقط إذا كانت الإجابة صحيحة تمامًا ضمن هذه القواعد، أو "لا" إذا كانت خاطئة.
`;

    try {
        const response = await fetch('https://yaniis.alwaysdata.net/api/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "gemini3.1pro",
                question: prompt
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const rawText = await response.text();
        let resultText = rawText;

        try {
            const json = JSON.parse(rawText);
            if (json.response) resultText = json.response;
            else if (json.answer) resultText = json.answer;
            else if (json.text) resultText = json.text;
            else if (json.result) resultText = json.result;
        } catch (_) { }

        console.log("\n==============================");
        console.log("🧠 [AI Prompt]:", prompt);
        console.log("💬 [AI Response]:", resultText);
        console.log("==============================\n");

        return resultText.includes("نعم");
    } catch (error) {
        console.error("❌ Error validating with AI:", error);
        return false;
    }
}

// ======================== التحقق من وجود دولة تبدأ بحرف معين ========================
async function checkCountryExists(letter) {
    // استخدام التخزين المؤقت لتجنب تكرار النداء
    if (countryCache[letter] !== undefined) {
        return countryCache[letter];
    }

    const prompt = `هل توجد دولة تبدأ بحرف "${letter}"؟ أجب بـ "نعم" أو "لا" فقط.`;

    try {
        const response = await fetch('https://yaniis.alwaysdata.net/api/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "gemini3.1pro",
                question: prompt
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const rawText = await response.text();
        let resultText = rawText;

        try {
            const json = JSON.parse(rawText);
            if (json.response) resultText = json.response;
            else if (json.answer) resultText = json.answer;
            else if (json.text) resultText = json.text;
            else if (json.result) resultText = json.result;
        } catch (_) { }

        const exists = resultText.includes("نعم");
        countryCache[letter] = exists;
        return exists;
    } catch (error) {
        console.error("❌ Error checking country existence:", error);
        // في حال الفشل نفترض عدم وجود دولة (أمان)
        countryCache[letter] = false;
        return false;
    }
}

async function checkWin(context, callback) {
    if (players.length === 1) {
        const winner = players[0];
        await context.channel.send(`${EMOJI.WIN} - <@${winner.id}> فاز باللعبة!`);
        await win(winner.id, context);
        resetGameData();
        callback();
        return true;
    }

    if (players.length === 0) {
        await context.channel.send(`${EMOJI.LOSE} تم طرد جميع اللاعبين ، لم يفز أحد.`);
        resetGameData();
        callback();
        return true;
    }

    return false;
}