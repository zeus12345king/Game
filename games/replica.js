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
const { GoogleGenerativeAI } = require("@google/generative-ai");

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 15;
const TIME_TO_START = config.lobbyTime.replica;
const TIME_TO_ANSWER = 15000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI;
let geminiModel;

if (GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
}

let GAME_ACTIVE = false;
let players = [];

const ARABIC_LETTERS = [
    'أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص',
    'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'
];
const CATEGORIES = ['اسم إنسان', 'اسم حيوان', 'اسم نبات', 'اسم جماد', 'اسم دولة'];

module.exports = {
  name: 'replica',
  aliases: ["ريبلكا"],
  execute(message, args, callback) {
    if (!GEMINI_API_KEY) {
        message.reply("⚠️ | عذراً، لم يتم إعداد مفتاح Gemini API لهذه اللعبة. يرجى إضافته إلى ملف `.env`.");
        callback();
        return;
    }
    if (GAME_ACTIVE) {
      message.reply(`> **❌ | لقد بدأت لعبة أخرى بالفعل. الرجاء الانتظار حتى انتهاء اللعبة الحالية.**`);
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
    if (context) context.channel.send(`🏆 | <@${playerId}> فاز بـ **${points}** نقطة!`).catch(() => {});
  } catch (e) {
    console.error(`[Replica] Failed to apply win points: ${e}`)
  }
}
async function lose(playerId, context) { }

async function startGame(context, nowTime, callback) {
  players = [];

  function buildLobby(time, lobbyPlayers) {
    const list = lobbyPlayers.length ? lobbyPlayers.map((p, i) => `> **${i + 1}.** <@${p.id}>`).join('\n') : '> لا يوجد لاعبين بعد';
    return new ContainerBuilder()
      .setAccentColor(config.colors.replica)
      .addTextDisplayComponents(t => t.setContent(
        `## 🔠 لعبة ريبلكا (نبات جماد حيوان)\n> الوقت المتبقي: <t:${time + TIME_TO_START / 1000}:R>\n\n**اللاعبون (${lobbyPlayers.length}/${MAX_PLAYERS}):**\n${list}`
      ))
      .addMediaGalleryComponents(g => { const img = config.lobbyImages.replica; if (img) g.addItems(item => item.setURL(img)); return g; })
      .addActionRowComponents(r => r.setComponents(
        new ButtonBuilder().setCustomId('join').setLabel('دخول').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('exit').setLabel('خروج').setStyle(ButtonStyle.Danger)
      ));
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
          await i.followUp({ content: `لقد انضممت إلى اللعبة! 🎉`, ephemeral: true });
        } else {
          await i.reply({ content: `أنت بالفعل في اللعبة! 🚫`, ephemeral: true });
        }
      } else {
        await i.reply({ content: `اللعبة ممتلئة! 🚪`, ephemeral: true });
      }
    } else if (i.customId === "exit") {
      if (players.some(p => p.id === i.user.id)) {
        players = players.filter((p) => p.id !== i.user.id);
        await i.update({ components: [buildLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
        await i.followUp({ content: `لقد غادرت اللعبة. 👋`, ephemeral: true });
      } else {
        await i.reply({ content: `لم تكن في اللعبة. ❓`, ephemeral: true });
      }
    } else if (i.customId === "explain") {

    }
  });

  collector.on("end", async () => {
    try {
      const endContainer = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(t => t.setContent(
          `## 🔠 لعبة ريبلكا\n**انتهى وقت الانضمام للعبة!**\n\n**اللاعبون المشاركون (${players.length}):** ${players.length > 0 ? players.map(p => `<@${p.id}>`).join(', ') : 'لا يوجد'}`
        ));
      await sentMessage.edit({ components: [endContainer], flags: MessageFlags.IsComponentsV2 });
    } catch (error) { /* ignore */ }

    if (players.length < MIN_PLAYERS) {
      await context.channel.send(`لم يكن هناك عدد كافٍ من اللاعبين لبدء اللعبة. 🚪`);
      resetGameData();
      callback();
      return;
    }

    await context.channel.send(`👥 | اكتمل عدد اللاعبين! اللعبة ستبدأ الآن...`);
    await gameLoop(context, callback);
  });
}

async function gameLoop(context, callback) {
    if (await checkWin(context, callback)) return;

    await runLetterRound(context, callback);

    await sleep(4000);

    await gameLoop(context, callback);
}

async function runLetterRound(context, callback) {
    const letter = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
    await context.channel.send(`🔠 حرف هذه الجولة هو **${letter}**`);
    await sleep(2000);

    let eliminatedThisRound = [];
    let turnOrder = [...players].sort(() => 0.5 - Math.random());

    const turnsToPlay = Math.min(players.length, CATEGORIES.length);

    for (let i = 0; i < turnsToPlay; i++) {
        if (await checkWin(context, callback)) return { eliminatedThisRound, survivors: players };

        const category = CATEGORIES[i];
        const currentPlayer = turnOrder.pop();

        const survived = await askQuestion(context, currentPlayer, letter, category);

        if (!survived) {
            eliminatedThisRound.push(currentPlayer);
            players = players.filter(p => p.id !== currentPlayer.id);
            await lose(currentPlayer.id, context);
        }

        await sleep(2000);
    }

    return { eliminatedThisRound, survivors: players };
}

async function askQuestion(context, player, letter, category) {
    return new Promise(async (resolve) => {
        const questionMsg = await context.channel.send(`<@${player.id}> لديك **${TIME_TO_ANSWER / 1000} ثانية** لإرسال **${category}** يبدأ بحرف **${letter}**.`);

        const filter = m => m.author.id === player.id && m.channel.id === context.channel.id;

        const collector = context.channel.createMessageCollector({ filter, time: TIME_TO_ANSWER, max: 1 });

        collector.on('collect', async (msg) => {
            const answer = msg.content.trim();
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
                await msg.reply(`📌 إجابة <@${player.id}> صحيحة!`);
                resolve(true);
            } else {
                await msg.reply(`💣 | إجابة <@${player.id}> خاطئة! تم طردك من اللعبة.`);
                resolve(false);
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                await questionMsg.reply(`💣 | تم طرد <@${player.id}> لعدم تفاعله في اللعبة.`);
                resolve(false);
            }
        });
    });
}

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
        const result = await geminiModel.generateContent(prompt);

        let text;
        if (result.response?.text) {
            text = result.response.text();
        } else if (result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
            text = result.response.candidates[0].content.parts[0].text;
        } else if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
            text = result.candidates[0].content.parts[0].text;
        } else {
            text = "[No text output found]";
        }

        text = (text || "").trim();

        console.log("\n==============================");
        console.log("🧠 [Gemini Prompt]:", prompt);
        console.log("💬 [Gemini Response]:", text);
        console.log("==============================\n");

        return text.includes("نعم");
    } catch (error) {
        console.error("❌ Error validating with Gemini:", error);
        return false;
    }
}

async function checkWin(context, callback) {
    if (players.length === 1) {
        const winner = players[0];
        await context.channel.send(`👑 - <@${winner.id}> فاز باللعبة!`);
        await win(winner.id, context);
        resetGameData();
        callback();
        return true;
    }

    if (players.length === 0) {
        await context.channel.send("❌ تم طرد جميع اللاعبين ، لم يفز أحد.");
        resetGameData();
        callback();
        return true;
    }

    return false;
}