const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, StringSelectMenuBuilder, AttachmentBuilder } = require("discord.js");
const db = require("../database.js");
const config = require("../config.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 20;
const TIME_TO_START = config.lobbyTime.bomb;
const TIME_TO_ANSWER = 10000;
const TIME_TO_CHOOSE = 10000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI;
let geminiModel;

if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
}

let GAME_ACTIVE = false;
let players = [];
let holder = null;
let roundNumber = 0;

const ARABIC_LETTERS = ["أ","ب","ت","ث","ج","ح","خ","د","ذ","ر","ز","س","ش","ص","ض","ط","ظ","ع","غ","ف","ق","ك","ل","م","ن","ه","و","ي"];
const LEVELS = ["سهل","متوسط","صعب"];

module.exports = {
  name: "bomb",
  aliases: ["قنبلة"],
  async execute(message, args, callback) {
    if (!GEMINI_API_KEY) {
      await message.reply("⚠️ | عذراً، لم يتم إعداد مفتاح Gemini API لهذه اللعبة. يرجى إضافته إلى ملف `.env`.");
      callback();
      return;
    }
    if (GAME_ACTIVE) {
      await message.reply("> **❌ | لقد بدأت لعبة أخرى بالفعل. الرجاء الانتظار حتى انتهاء اللعبة الحالية.**");
      callback();
      return;
    }
    GAME_ACTIVE = true;
    const nowTime = Math.floor(Date.now() / 1000);
    startGame(message, nowTime, callback);
  },
};

function resetGameData() {
  GAME_ACTIVE = false;
  players = [];
  holder = null;
  roundNumber = 0;
}

function sleep(t) {
  return new Promise((r) => setTimeout(r, t));
}

function getRandomWinPoints() {
  const pts = config.winPoints.bomb;
  if (typeof pts === 'object') return Math.floor(Math.random() * (pts.max - pts.min + 1)) + pts.min;
  return pts;
}

async function win(playerId) {
  try {
    const pts = getRandomWinPoints();
    await db.addPoints(playerId, pts);

  } catch (e) {}
}
async function lose(playerId) {}

async function startGame(context, nowTime, callback) {
  players = [];
  function buildLobby(time, lobbyPlayers) {
    const list = lobbyPlayers.length ? lobbyPlayers.map((p, i) => `> **${i + 1}.** <@${p.id}>`).join('\n') : '> لا يوجد لاعبين بعد';
    return new ContainerBuilder()
      .setAccentColor(config.colors.bomb)
      .addTextDisplayComponents(t => t.setContent(
        `## 💣 لعبة بومب\n> الوقت المتبقي: <t:${time + TIME_TO_START / 1000}:R>\n\n**اللاعبون (${lobbyPlayers.length}/${MAX_PLAYERS}):**\n${list}`
      ))
      .addMediaGalleryComponents(g => { const img = config.lobbyImages.bomb; if (img) g.addItems(item => item.setURL(img)); return g; })
      .addActionRowComponents(r => r.setComponents(
        new ButtonBuilder().setCustomId('join').setLabel('دخول').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('exit').setLabel('خروج').setStyle(ButtonStyle.Danger)
      ));
  }

  const sentMessage = await context.reply({ components: [buildLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2, fetchReply: true });

  const filter = (i) => i.customId === "join" || i.customId === "exit";
  const collector = sentMessage.createMessageComponentCollector({ filter, time: TIME_TO_START });

  collector.on("collect", async (i) => {
    if (i.customId === "join") {
      if (players.length < MAX_PLAYERS) {
        if (!players.some((p) => p.id === i.user.id)) {
          players.push({
            id: i.user.id,
            displayName: i.user.displayName,
            avatarURL:
              i.user.displayAvatarURL({ extension: "png", forceStatic: true }) ||
              "https://cdn.discordapp.com/embed/avatars/0.png",
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
      if (players.some((p) => p.id === i.user.id)) {
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
          `## 💣 لعبة بومب\n**انتهى وقت الانضمام للعبة!**\n\n**اللاعبون المشاركون (${players.length}):** ${players.length > 0 ? players.map(p => `<@${p.id}>`).join(', ') : 'لا يوجد'}`
        ));
      await sentMessage.edit({ components: [endContainer], flags: MessageFlags.IsComponentsV2 });
    } catch (e) {}
    if (players.length < MIN_PLAYERS) {
      await context.channel.send(`لم يكن هناك عدد كافٍ من اللاعبين لبدء اللعبة. 🚪`);
      resetGameData();
      callback();
      return;
    }
    await context.channel.send(`👥 | اكتمل عدد اللاعبين! اللعبة ستبدأ الآن...`);
    holder = players[Math.floor(Math.random() * players.length)];
    await sleep(1000);
    await gameLoop(context, callback);
  });
}

function getLevel() {
  const idx = Math.min(2, Math.floor((roundNumber) / 5));
  return LEVELS[idx];
}

async function gameLoop(context, callback) {
  if (await checkWin(context, callback)) return;
  roundNumber += 1;
  const level = getLevel();
  const pair = await askGeminiForLetters(level);
  const first = pair.first || ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
  const last = pair.last || ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
  await sendDesignImage(context, holder, first, last);
  await context.channel.send(`الحروف: **${first} - ${last}**`);
  const survived = await answerPhase(context, holder, first, last);
  if (!survived) {
    await context.channel.send(`ـ💣 انفجرت القنبلة ، تم طرد <@${holder.id}> من اللعبة ، ستبدا الجولة التالية بعد قليل...`);
    players = players.filter((p) => p.id !== holder.id);
    await lose(holder.id);
    if (await checkWin(context, callback)) return;
    holder = players[Math.floor(Math.random() * players.length)];
    await sleep(2000);
    await gameLoop(context, callback);
    return;
  }
  const next = await choosePhase(context, holder);
  if (!next) {
    await context.channel.send(`ـ💣 لم يتم الاختيار في الوقت المحدد، تم طرد <@${holder.id}> من اللعبة.`);
    players = players.filter((p) => p.id !== holder.id);
    await lose(holder.id);
    if (await checkWin(context, callback)) return;
    holder = players[Math.floor(Math.random() * players.length)];
    await sleep(2000);
    await gameLoop(context, callback);
    return;
  }
  holder = next.player;
  if (next.random) {
    await context.channel.send(`ـ🎲 تم تسليم القنبلة للاعب <@${holder.id}> بشكل عشوائي ، ستبدأ الجولة التالية بعد قليل...`);
  } else {
    await context.channel.send(`ـ✅ تم تسليم القنبلة للاعب <@${holder.id}> ، ستبدأ الجولة التالية بعد قليل...`);
  }
  await sleep(2000);
  await gameLoop(context, callback);
}

async function answerPhase(context, current, first, last) {
  return new Promise(async (resolve) => {
    const askMsg = await context.channel.send(`ـ🎯 <@${current.id}> لديك **${TIME_TO_ANSWER / 1000}** ثوانٍ للإجابة بكلمة تبدأ بـ **${first}** وتنتهي بـ **${last}**.`);
    const filter = (m) => m.author.id === current.id && m.channel.id === context.channel.id;
    const collector = context.channel.createMessageCollector({ filter, time: TIME_TO_ANSWER });
    let passed = false;
    collector.on("collect", async (msg) => {
      if (passed) return;
      const ok = await validateAnswer(first, last, msg.content.trim());
      if (ok) {
        passed = true;
        collector.stop("passed");
        await msg.reply(`ـ✅ اجابة صحيحة! <@${current.id}> ، اختر لاعباً اخر لتمرير القنبلة له...`);
        resolve(true);
      } else {
        try {
          await msg.react("❌");
        } catch (e) {}
      }
    });
    collector.on("end", async (_, reason) => {
      if (reason !== "passed") resolve(false);
    });
  });
}

async function choosePhase(context, chooser) {
  return new Promise(async (resolve) => {
    const others = players.filter((p) => p.id !== chooser.id);
    if (others.length === 0) {
      resolve(null);
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId("choose_player")
      .setPlaceholder("اختر لاعباً")
      .addOptions(
        others.slice(0, 25).map((p) => ({
          label: p.displayName.slice(0, 100),
          value: p.id,
          description: `تسليم القنبلة إلى ${p.displayName}`.slice(0, 100),
        }))
      );
    const row = new ActionRowBuilder().addComponents(menu);
    const randomBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("choose_random").setLabel("اختيار عشوائي").setStyle(ButtonStyle.Secondary)
    );
    const msg = await context.channel.send({
      content: `ـ💣 <@${chooser.id}> لديك **${TIME_TO_CHOOSE / 1000}** ثوانٍ لاختيار لاعب لتسليمه القنبلة.`,
      components: [row, randomBtn],
    });
    const filter = (i) => (i.customId === "choose_player" || i.customId === "choose_random") && i.user.id === chooser.id;
    const collector = msg.createMessageComponentCollector({ filter, time: TIME_TO_CHOOSE, max: 1 });
    collector.on("collect", async (i) => {
      try {
        await i.deferUpdate();
      } catch (e) {}
      try {
        msg.components.forEach((r) => r.components.forEach((c) => c.setDisabled(true)));
        await msg.edit({ components: msg.components });
      } catch (e) {}
      if (i.customId === "choose_random") {
        const target = others[Math.floor(Math.random() * others.length)];
        resolve({ player: target, random: true });
      } else {
        const id = i.values?.[0];
        const target = players.find((p) => p.id === id) || others[Math.floor(Math.random() * others.length)];
        resolve({ player: target, random: false });
      }
    });
    collector.on("end", async (col) => {
      if (col.size === 0) {
        try {
          msg.components.forEach((r) => r.components.forEach((c) => c.setDisabled(true)));
          await msg.edit({ components: msg.components });
        } catch (e) {}
        resolve(null);
      }
    });
  });
}

async function checkWin(context, callback) {
  if (players.length === 1) {
    const winner = players[0];
    const pts = getRandomWinPoints();
    await db.addPoints(winner.id, pts);
    await context.channel.send(`👑 - <@${winner.id}> فاز باللعبة بـ **${pts}** نقطة!`);
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

async function askGeminiForLetters(level) {
  const prompt = `نحن نلعب لعبة بومب ( نجيب حرفين ولازم نكون كلمة تبدا باول حرف وتنتهي باخر حرف مثلا: ن-ر : نار او نور)
اعطينا حرفين للعبة ( اعطينا بس الحرفين بدون اي كلام زيادة وخليهم بالمستوى (level)
level=${level}`;
  try {
    const result = await geminiModel.generateContent(prompt);
    let text;
    if (result.response?.text) text = await result.response.text();
    else if (result.response?.candidates?.[0]?.content?.parts?.[0]?.text)
      text = result.response.candidates[0].content.parts[0].text;
    else if (result?.candidates?.[0]?.content?.parts?.[0]?.text) text = result.candidates[0].content.parts[0].text;
    text = (text || "").replace(/\s+/g, " ").trim();
    const letters = text.match(/[اأإآبتثجحخدذرزسشصضطظعغفقكلمنهوىي]/g) || [];
    if (letters.length >= 2) return { first: letters[0], last: letters[1] };
    if (letters.length === 1) return { first: letters[0], last: ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)] };
    return { first: null, last: null };
  } catch (e) {
    return { first: null, last: null };
  }
}

async function validateAnswer(first, last, answer) {
  const normalizedFirst = normalizeAlif(first);
  const normalizedLast = normalizeTaa(last);
  const nAns = normalizeArabic(answer);
  const fOk = checkStartsWith(nAns, normalizedFirst);
  const lOk = checkEndsWith(nAns, normalizedLast);
  if (!(fOk && lOk)) {
    const prompt = `نحن نلعب لعبة بومب ( نجيب حرفين ولازم نكون كلمة تبدا باول حرف وتنتهي باخر حرف مثلا: ن-ر : نار او نور)
الحرفين هم: ${first}-${last}
والجواب: ${answer}
هل الجواب صحيح؟ جاوب بنعم او لا فقط
تقدر تتغاضى عن بعض القواعد والاشياء مثلا أ تقدر تكتبها ا ، إ  او ال ه وال ة لكن مثلا ال ت و ة مربوطة فلا`;
    try {
      const result = await geminiModel.generateContent(prompt);
      let text;
      if (result.response?.text) text = await result.response.text();
      else if (result.response?.candidates?.[0]?.content?.parts?.[0]?.text)
        text = result.response.candidates[0].content.parts[0].text;
      else if (result?.candidates?.[0]?.content?.parts?.[0]?.text) text = result.candidates[0].content.parts[0].text;
      text = (text || "").trim();
      return text.includes("نعم");
    } catch (e) {
      return false;
    }
  }
  return true;
}

function normalizeArabic(s) {
  return (s || "")
    .replace(/[أإآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[^\u0600-\u06FF\s]/g, "")
    .trim();
}
function normalizeAlif(ch) {
  if (!ch) return ch;
  return ch.replace(/[أإآا]/g, "ا");
}
function normalizeTaa(ch) {
  if (!ch) return ch;
  return ch.replace(/ة/g, "ه");
}
function checkStartsWith(word, ch) {
  if (!word || !ch) return false;
  const first = word.charAt(0);
  if (ch === "ا") return ["ا"].includes(first);
  return first === ch;
}
function checkEndsWith(word, ch) {
  if (!word || !ch) return false;
  const last = word.charAt(word.length - 1);
  if (ch === "ه") return ["ه"].includes(last);
  return last === ch;
}

async function sendDesignImage(context, user, first, last) {
  try {
    try {
      GlobalFonts.registerFromPath(
        path.resolve(__dirname, "../img/Fonts/IBMBold.ttf"),
        "IBM"
      );
    } catch (e) {}
    const canvas = createCanvas(1024, 512);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = "#16213e";
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "#0f3460";
    ctx.fillRect(512, 0, 512, 512);

    try {
      const avatarImg = await loadImage(user.avatarURL);
      ctx.save();
      ctx.beginPath();
      ctx.arc(166 + 64, 147 + 64, 64, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatarImg, 166, 147, 128, 128);
      ctx.restore();
    } catch (e) {}

    const fontName = GlobalFonts.has("IBM") ? "IBM" : "Arial";
    ctx.font = `bold 42px ${fontName}`;
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(user.displayName, 256, 100);

    ctx.font = `bold 180px ${fontName}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#e94560";
    ctx.fillText(first, 768, 320);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(last, 256, 320);

    const buffer = canvas.toBuffer("image/png");
    const attachment = new AttachmentBuilder(buffer, { name: "bomb.png" });
    await context.channel.send({ files: [attachment] });
  } catch (e) {
    console.error("[Bomb] sendDesignImage error:", e);
  }
}