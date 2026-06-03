const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  AttachmentBuilder,
} = require("discord.js");
const db = require('../database.js');
const config = require('../config.js');
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 12;
const TIME_TO_START = config.lobbyTime.dice;
const TIME_TO_ROLL = 15000;
const TOTAL_ROUNDS = 3;

const IMG_PATH = "../img/dice/";
const GAME_BOARD_PATH = path.join(__dirname, IMG_PATH, "game.png");
const FONT_PATH = path.join(__dirname, "../img/Fonts/IBMBold.ttf");

const ALL_ROLLS = [
    'number_1', 'number_2', 'number_3', 'number_4', 'number_5', 'number_6',
    'plus_1', 'plus_2', 'plus_3', 'plus_4', 'plus_5', 'plus_6',
    'minus_1', 'minus_2', 'minus_3', 'minus_4', 'minus_5', 'minus_6',
    'zero', 'ban_someone', 'double_2', 'double_3'
];

const COORDS = {
    teamAPoints: { x: 165, y: 100 },
    teamBPoints: { x: 800, y: 100 },
    round: { x: 480, y: 560 },
    teamA: [
        { user: { x: 180, y: 215 }, points: { x: 372, y: 215 } },
{ user: { x: 180, y: 295 }, points: { x: 372, y: 295 } },
{ user: { x: 180, y: 375 }, points: { x: 372, y: 375 } },
{ user: { x: 180, y: 445 }, points: { x: 372, y: 445 } },
{ user: { x: 180, y: 535 }, points: { x: 372, y: 535 } },
{ user: { x: 180, y: 605 }, points: { x: 372, y: 605 } },
    ],
    teamB: [
        { user: { x: 712, y: 215 }, points: { x: 582, y: 215 } },
{ user: { x: 712, y: 295 }, points: { x: 582, y: 295 } },
{ user: { x: 712, y: 375 }, points: { x: 582, y: 375 } },
{ user: { x: 712, y: 455 }, points: { x: 582, y: 455 } },
{ user: { x: 712, y: 535 }, points: { x: 582, y: 535 } },
{ user: { x: 712, y: 605 }, points: { x: 582, y: 605 } },
    ]
};

let GAME_ACTIVE = false;
let teamA = [];
let teamB = [];
let currentRound = 0;
let bannedForRound = new Set();

try {
    GlobalFonts.registerFromPath(FONT_PATH, "IBM");
} catch (e) {
    console.warn("[Dice Game] Could not load custom font. Using default.");
}

module.exports = {
  name: 'dice',
  aliases: ["نرد"],
  /**
   * @param {import('discord.js').Message} message
   * @param {string[]} args
   * @param {function} callback
   */
  execute(message, args, callback) {
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
  teamA = [];
  teamB = [];
  currentRound = 0;
  bannedForRound.clear();
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function getRandomWinPoints() {
    const pts = config.winPoints.dice;
    if (typeof pts === 'object') return Math.floor(Math.random() * (pts.max - pts.min + 1)) + pts.min;
    return pts;
}

async function win(playerId, context) {
  try {
    const points = getRandomWinPoints();
    await db.addPoints(playerId, points);
    if (context) context.channel.send(`🏆 | <@${playerId}> فاز بـ **${points}** نقطة!`).catch(() => {});
  } catch (e) { 
    console.error(`[Dice Game] Failed to apply win points: ${e}`) 
  }
}
async function lose(playerId, context) {}

async function startGame(context, nowTime, callback) {
  let lobbyPlayers = [];
  currentRound = 0;
  bannedForRound.clear();
  teamA = [];
  teamB = [];

  function buildLobby(time, lobbyPlayers) {
    const list = lobbyPlayers.length ? lobbyPlayers.map((p, i) => `> **${i + 1}.** <@${p.id}>`).join('\n') : '> لا يوجد لاعبين بعد';
    const lobbyImg = config.lobbyImages.dice;
    const container = new ContainerBuilder()
      .setAccentColor(config.colors.dice)
      .addTextDisplayComponents(t => t.setContent(
        `## 🎲 لعبة النرد\n> الوقت المتبقي: <t:${time + TIME_TO_START / 1000}:R>\n\n**اللاعبون (${lobbyPlayers.length}/${MAX_PLAYERS}):**\n${list}`
      ))
      .addMediaGalleryComponents(g => { if (lobbyImg) g.addItems(item => item.setURL(lobbyImg)); return g; })
      .addActionRowComponents(r => r.setComponents(
        new ButtonBuilder().setCustomId('join').setLabel('دخول').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('exit').setLabel('خروج').setStyle(ButtonStyle.Danger)
      ));
    return container;
  }

  const sentMessage = await context.reply({
    components: [buildLobby(nowTime, lobbyPlayers)],
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true,
  });

  const filter = (i) => i.customId === "join" || i.customId === "exit";
  const collector = sentMessage.createMessageComponentCollector({ filter, time: TIME_TO_START });

  collector.on("collect", async (i) => {
    if (i.customId === "join") {
      if (lobbyPlayers.length < MAX_PLAYERS) {
        if (!lobbyPlayers.some(p => p.id === i.user.id)) {
          lobbyPlayers.push({
            id: i.user.id,
            displayName: i.user.displayName,
            avatarURL: i.user.displayAvatarURL({ extension: "png", forceStatic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png",
          });
          await i.update({ components: [buildLobby(nowTime, lobbyPlayers)], flags: MessageFlags.IsComponentsV2 });
          await i.followUp({ content: `لقد انضممت إلى اللعبة! 🎉`, ephemeral: true });
        } else {
          await i.reply({ content: `أنت بالفعل في اللعبة! 🚫`, ephemeral: true });
        }
      } else {
        await i.reply({ content: `اللعبة ممتلئة! 🚪`, ephemeral: true });
      }
    } else if (i.customId === "exit") {
      if (lobbyPlayers.some(p => p.id === i.user.id)) {
        lobbyPlayers = lobbyPlayers.filter((p) => p.id !== i.user.id);
        await i.update({ components: [buildLobby(nowTime, lobbyPlayers)], flags: MessageFlags.IsComponentsV2 });
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
        .setAccentColor(0xDAA520)
        .addTextDisplayComponents(t => t.setContent(
          `## 🎲 لعبة النرد\n**انتهى وقت الانضمام للعبة!**\n\n**اللاعبون المشاركون (${lobbyPlayers.length}):** ${lobbyPlayers.length > 0 ? lobbyPlayers.map(p => `<@${p.id}>`).join(', ') : 'لا يوجد'}`
        ));
      await sentMessage.edit({ components: [endContainer], flags: MessageFlags.IsComponentsV2 });
    } catch (error) { /* ignore */ }

    if (lobbyPlayers.length < MIN_PLAYERS) {
      await context.channel.send(`لم يكن هناك عدد كافٍ من اللاعبين لبدء اللعبة. 🚪`);
      resetGameData();
      callback();
      return;
    }

    splitTeams(lobbyPlayers);
    await context.channel.send(`👥 | اكتمل عدد اللاعبين! تم تقسيم الفرق. اللعبة ستبدأ الآن...`);
    await gameLoop(context, callback);
  });
}

function splitTeams(lobbyPlayers) {
    const shuffled = [...lobbyPlayers].sort(() => 0.5 - Math.random());
    const mid = Math.ceil(shuffled.length / 2);
    teamA = shuffled.slice(0, mid).map(p => ({ ...p, points: 0 }));
    teamB = shuffled.slice(mid).map(p => ({ ...p, points: 0 }));
}

async function gameLoop(context, callback) {
    currentRound++;
    bannedForRound.clear();

    await context.channel.send(`--- 🏁 **الجولة ${currentRound} / ${TOTAL_ROUNDS}** 🏁 ---`);
    await sleep(1000);

    try {
        const boardImage = await generateGameImage();
        await context.channel.send({ files: [boardImage] });
    } catch (e) {
        console.error("Failed to generate game board image:", e);
        await context.channel.send("⚠️ | خطأ في عرض لوحة اللعبة.");
    }
    await sleep(4000);

    await context.channel.send("--- 🚩 **دور الفريق الأول** 🚩 ---");
    for (const player of teamA) {
        await runPlayerTurn(player, 'A', context, teamB);
        await sleep(4000);
    }

    await context.channel.send("--- 🚩 **دور الفريق الثاني** 🚩 ---");
    for (const player of teamB) {
        await runPlayerTurn(player, 'B', context, teamA);
        await sleep(4000);
    }

    if (currentRound < TOTAL_ROUNDS) {
        await context.channel.send(`--- ⌛ **نهاية الجولة ${currentRound}** ⌛ ---`);
        await gameLoop(context, callback);
    } else {
        await endGame(context, callback);
    }
}

async function runPlayerTurn(player, teamName, context, opponentTeam) {
    return new Promise(async (resolve) => {
        await sleep(1500);

        if (bannedForRound.has(player.id)) {
            const bannedImgPath = path.join(__dirname, IMG_PATH, teamName, "banned.png");
            try {
                await context.channel.send({
                    content: `🚫 | <@${player.id}> أنت محظور! لا يمكنك اللعب في هذه الجولة.`,
                    files: [bannedImgPath]
                });
            } catch(e) {
                console.error("Failed to load banned.png");
                await context.channel.send(`🚫 | <@${player.id}> أنت محظور! لا يمكنك اللعب في هذه الجولة.`);
            }
            resolve();
            return;
        }

        const basePoints = player.points;
        let turnPoints = 0;
        let roll1_name = "";

        const [roll1Name, roll1File, roll1Points, roll1Type] = rollDice(teamName);
        roll1_name = roll1Name;
        turnPoints = roll1Points;

        if (roll1Type === 'multiplier') turnPoints = 0;
        if (roll1Type === 'special') {
            await sleep(1000);
            await handleBan(player, context, opponentTeam, roll1File); 
        }

        player.points += turnPoints;

        const initialComponents = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('roll_again').setLabel('العب مرة اخرى').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('skip').setLabel('تخطي').setStyle(ButtonStyle.Secondary)
            )
        ];

        const roll1Msg = await context.channel.send({
            content: `🎲 <@${player.id}> لقد حصلت على **${turnPoints} نقاط**
● مجموع نقاطك الحالي : **${player.points}**`,
            files: [roll1File],
            components: initialComponents,
            fetchReply: true
        });

        const filter = (i) => (i.customId === 'roll_again' || i.customId === 'skip') && i.user.id === player.id;
        const collector = roll1Msg.createMessageComponentCollector({ filter, time: TIME_TO_ROLL, max: 1 });

        collector.on('collect', async (i) => {
            try {
            if (i.customId === 'skip') {
                const disabledComponents = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('roll_again').setLabel('العب مرة اخرى').setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId('skip').setLabel('تخطي').setStyle(ButtonStyle.Danger).setDisabled(true)
                    )
                ];
                try {
                    await i.update({
                        content: `🎲 <@${player.id}> قرر التخطي.\n● مجموع نقاطه النهائي : **${player.points}**`,
                        files: [roll1File],
                        components: disabledComponents
                    });
                } catch (_) {}
                return; 
            }

            if (i.customId === 'roll_again') {
                const [roll2Name, roll2File, roll2Points, roll2Type] = rollDice(teamName, turnPoints);

                let finalTurnPoints = 0;
                let message = "";

                if (roll2Type === 'numeric') {
                    finalTurnPoints = roll2Points;
                    player.points = basePoints + finalTurnPoints;
                    message = `🎲 <@${player.id}> (لعب مرة أخرى)\n● حصل على **${finalTurnPoints} نقاط** (بدلاً من ${turnPoints})\n● مجموع نقاطه النهائي : **${player.points}**`;
                } else {
                    finalTurnPoints = turnPoints + roll2Points;
                    player.points = basePoints + finalTurnPoints;
                    message = `🎲 <@${player.id}> (لعب مرة أخرى)\n● حصل على **${roll2Points} نقاط** (إضافة إلى ${turnPoints})\n● مجموع نقاطه النهائي : **${player.points}**`;
                }

                const disabledComponents = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('roll_again').setLabel('العب مرة اخرى').setStyle(ButtonStyle.Success).setDisabled(true),
                        new ButtonBuilder().setCustomId('skip').setLabel('تخطي').setStyle(ButtonStyle.Secondary).setDisabled(true)
                    )
                ];

                try {
                    await i.update({
                        content: `🎲 <@${player.id}> لقد حصلت على **${turnPoints} نقاط**\n● مجموع نقاطك الحالي : **${basePoints + turnPoints}**`,
                        files: [roll1File],
                        components: disabledComponents
                    });
                } catch (_) {}

                await i.channel.send({
                    content: message,
                    files: [roll2File]
                });

                if (roll2Type === 'special') {
                    await sleep(1000);
                    await handleBan(player, context, opponentTeam, roll2File);
                }
            }
            } catch (e) { console.error('[Dice] collect error:', e); }
        });

        collector.on('end', async (collected) => {
            if (!collected.size) {
                const disabledComponents = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('roll_again').setLabel('العب مرة اخرى').setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId('skip').setLabel('تخطي').setStyle(ButtonStyle.Secondary).setDisabled(true)
                    )
                ];
                await roll1Msg.edit({
                    content: `🎲 <@${player.id}> انتهى وقته.
● مجموع نقاطه النهائي : **${player.points}**`,
                    files: [roll1File],
                    components: disabledComponents
                });
            }
            resolve();
        });
    });
}

async function handleBan(player, context, opponentTeam, diceImageFile) {
    return new Promise(async (resolve) => {
        if (opponentTeam.length === 0) {
            resolve();
            return;
        }

        const buttons = opponentTeam.map(p => 
            new ButtonBuilder()
                .setCustomId(`ban_${p.id}`)
                .setLabel(p.displayName.substring(0, 80))
                .setStyle(ButtonStyle.Secondary)
        );
        const rows = [];
        while (buttons.length > 0) {
            rows.push(new ActionRowBuilder().addComponents(...buttons.splice(0, 5)));
        }

        const banMsg = await context.channel.send({
            content: `⚔️ | <@${player.id}>, اختر لاعبًا من الفريق الآخر لحظره لهذه الجولة! (15 ثانية)`,
            files: [diceImageFile],
            components: rows,
            fetchReply: true
        });

        const filter = (i) => i.customId.startsWith('ban_') && i.user.id === player.id;
        const collector = banMsg.createMessageComponentCollector({ filter, time: 15000, max: 1 });

        collector.on('collect', async (i) => {
            const bannedId = i.customId.split('_')[1];
            bannedForRound.add(bannedId);
            await i.update({
                content: `🚫 | <@${player.id}> قام بحظر <@${bannedId}>!`,
                files: [diceImageFile],
                components: []
            });
        });

        collector.on('end', async (collected) => {
            if (!collected.size) {
                await banMsg.edit({
                    content: `⚔️ | <@${player.id}> لم يختر أحدًا.`,
                    files: [diceImageFile],
                    components: []
                });
            }
            resolve();
        });
    });
}

function rollDice(teamName, basePoints = 0) {
    const rollName = ALL_ROLLS[Math.floor(Math.random() * ALL_ROLLS.length)];
    const rollFile = path.join(__dirname, IMG_PATH, teamName, `${rollName}.png`);

    const [type, valStr] = rollName.split('_');
    const val = parseInt(valStr) || 0;

    switch (type) {
        case 'number':
            return [rollName, rollFile, val, 'numeric'];
        case 'plus':
            return [rollName, rollFile, val, 'modifier'];
        case 'minus':
            return [rollName, rollFile, -val, 'modifier'];
        case 'zero':
            return [rollName, rollFile, 0, 'numeric'];
        case 'double':
            const points = basePoints * (val - 1);
            return [rollName, rollFile, points, 'multiplier'];
        case 'ban':
            return [rollName, rollFile, 0, 'special'];
        default:
            return [rollName, rollFile, 0, 'numeric'];
    }
}

async function endGame(context, callback) {
    await context.channel.send(`--- 🏆 **نهاية اللعبة!** 🏆 ---`);
    await sleep(1000);

    try {
        const boardImage = await generateGameImage();
        await context.channel.send({ content: "النتائج النهائية:", files: [boardImage] });
    } catch (e) {
        console.error("Failed to generate final game board image:", e);
    }
    await sleep(4000);

    const teamAScore = teamA.reduce((sum, p) => sum + p.points, 0);
    const teamBScore = teamB.reduce((sum, p) => sum + p.points, 0);

    let winners = [];
    let losers = [];
    let winMessage = "";

    if (teamAScore > teamBScore) {
        winners = teamA;
        losers = teamB;
        winMessage = `:crown: - ${teamA.map(p => `<@${p.id}>`).join(' ')} فازوا باللعبة!`;
    } else if (teamBScore > teamAScore) {
        winners = teamB;
        losers = teamA;
        winMessage = `:crown: - ${teamB.map(p => `<@${p.id}>`).join(' ')} فازوا باللعبة!`;
    } else {
        winMessage = "👑 | تعادل! لا يوجد فائز.";
    }

    await context.channel.send(winMessage);

    for (const player of winners) {
        await win(player.id, context);
    }
    for (const player of losers) {
        await lose(player.id, context);
    }

    resetGameData();
    callback();
}

async function generateGameImage() {
    const W = 960, H = 720;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    const FONT = GlobalFonts.has("IBM") ? "IBM" : "Arial";
    const pad = (n) => String(Math.max(0, n)).padStart(2, '0');

    const teamAScore = teamA.reduce((sum, p) => sum + p.points, 0);
    const teamBScore = teamB.reduce((sum, p) => sum + p.points, 0);

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#0f1923");
    bgGrad.addColorStop(1, "#1a2535");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.025)";
    for (let x = 20; x < W; x += 40)
        for (let y = 20; y < H; y += 40)
            ctx.fillRect(x, y, 2, 2);

    const headerH = 170;

    const gradA = ctx.createLinearGradient(0, 0, W / 2, 0);
    gradA.addColorStop(0, "#1e3a6e");
    gradA.addColorStop(1, "#12223f");
    ctx.fillStyle = gradA;
    ctx.fillRect(0, 0, W / 2, headerH);

    const gradB = ctx.createLinearGradient(W / 2, 0, W, 0);
    gradB.addColorStop(0, "#3f1212");
    gradB.addColorStop(1, "#6e1e1e");
    ctx.fillStyle = gradB;
    ctx.fillRect(W / 2, 0, W / 2, headerH);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(W, headerH);
    ctx.stroke();

    ctx.font = `bold 72px ${FONT}`;
    ctx.fillStyle = "#4fc3f7";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(pad(teamAScore), 60, headerH / 2);

    ctx.fillStyle = "#ef9a9a";
    ctx.textAlign = "right";
    ctx.fillText(pad(teamBScore), W - 60, headerH / 2);

    ctx.font = `bold 18px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.textAlign = "left";
    ctx.fillText("TEAM A", 62, headerH - 22);
    ctx.textAlign = "right";
    ctx.fillText("TEAM B", W - 62, headerH - 22);

    const cx = W / 2;
    const cy = headerH / 2;
    const badgeR = 52;

    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, badgeR + 20);
    glowGrad.addColorStop(0, "rgba(255,210,60,0.3)");
    glowGrad.addColorStop(1, "rgba(255,210,60,0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, badgeR + 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = "#0f1923";
    ctx.fill();
    ctx.strokeStyle = "#f5c518";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = `bold 30px ${FONT}`;
    ctx.fillStyle = "#f5c518";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VS", cx, cy - 10);

    ctx.font = `bold 14px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(`${currentRound}/${TOTAL_ROUNDS}`, cx, cy + 18);

    const barY = headerH + 18;
    const barH = 6;
    const barX = 60;
    const barW = W - 120;

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(barX, barY, barW, barH, 3);
    ctx.fill();

    const prog = barW * (currentRound / TOTAL_ROUNDS);
    const barGrad = ctx.createLinearGradient(barX, 0, barX + prog, 0);
    barGrad.addColorStop(0, "#4fc3f7");
    barGrad.addColorStop(1, "#f5c518");
    ctx.fillStyle = barGrad;
    roundRect(barX, barY, prog, barH, 3);
    ctx.fill();

    const rowStartY = headerH + 50;
    const rowH = 72;
    const rowGap = 6;
    const maxRows = Math.max(teamA.length, teamB.length);
    const margin = 40;
    const midGap = 80;
    const colW = (W - margin * 2 - midGap) / 2;
    const leftColX = margin;
    const rightColX = margin + colW + midGap;

    for (let i = 0; i < maxRows; i++) {
        const ry = rowStartY + i * (rowH + rowGap);

        const pA = teamA[i];
        if (pA) {
            ctx.fillStyle = i % 2 === 0 ? "rgba(79,195,247,0.07)" : "rgba(79,195,247,0.03)";
            roundRect(leftColX, ry, colW, rowH, 10);
            ctx.fill();

            ctx.fillStyle = "#4fc3f7";
            roundRect(leftColX, ry, 4, rowH, 2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(leftColX + 28, ry + rowH / 2, 15, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(79,195,247,0.15)";
            ctx.fill();
            ctx.font = `bold 13px ${FONT}`;
            ctx.fillStyle = "#4fc3f7";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(i + 1, leftColX + 28, ry + rowH / 2);

            ctx.font = `bold 19px ${FONT}`;
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "left";
            ctx.fillText(pA.displayName.substring(0, 15), leftColX + 52, ry + rowH / 2 - 7);

            ctx.font = `13px ${FONT}`;
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.fillText("نقاط", leftColX + 52, ry + rowH / 2 + 14);

            const badgeW = 56;
            const badgeX = leftColX + colW - badgeW - 10;
            ctx.fillStyle = "rgba(79,195,247,0.18)";
            roundRect(badgeX, ry + (rowH - 32) / 2, badgeW, 32, 8);
            ctx.fill();
            ctx.font = `bold 20px ${FONT}`;
            ctx.fillStyle = "#4fc3f7";
            ctx.textAlign = "center";
            ctx.fillText(pad(pA.points), badgeX + badgeW / 2, ry + rowH / 2);
        }

        const pB = teamB[i];
        if (pB) {
            ctx.fillStyle = i % 2 === 0 ? "rgba(239,154,154,0.07)" : "rgba(239,154,154,0.03)";
            roundRect(rightColX, ry, colW, rowH, 10);
            ctx.fill();

            ctx.fillStyle = "#ef9a9a";
            roundRect(rightColX + colW - 4, ry, 4, rowH, 2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(rightColX + colW - 28, ry + rowH / 2, 15, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(239,154,154,0.15)";
            ctx.fill();
            ctx.font = `bold 13px ${FONT}`;
            ctx.fillStyle = "#ef9a9a";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(i + 1, rightColX + colW - 28, ry + rowH / 2);

            ctx.font = `bold 19px ${FONT}`;
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "right";
            ctx.fillText(pB.displayName.substring(0, 15), rightColX + colW - 52, ry + rowH / 2 - 7);

            ctx.font = `13px ${FONT}`;
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.textAlign = "right";
            ctx.fillText("نقاط", rightColX + colW - 52, ry + rowH / 2 + 14);

            const badgeWB = 56;
            const badgeXB = rightColX + 10;
            ctx.fillStyle = "rgba(239,154,154,0.18)";
            roundRect(badgeXB, ry + (rowH - 32) / 2, badgeWB, 32, 8);
            ctx.fill();
            ctx.font = `bold 20px ${FONT}`;
            ctx.fillStyle = "#ef9a9a";
            ctx.textAlign = "center";
            ctx.fillText(pad(pB.points), badgeXB + badgeWB / 2, ry + rowH / 2);
        }
    }

    const divX = leftColX + colW + midGap / 2;
    const lineGrad = ctx.createLinearGradient(divX, rowStartY, divX, rowStartY + maxRows * (rowH + rowGap));
    lineGrad.addColorStop(0,   "rgba(245,197,24,0)");
    lineGrad.addColorStop(0.3, "rgba(245,197,24,0.5)");
    lineGrad.addColorStop(0.7, "rgba(245,197,24,0.5)");
    lineGrad.addColorStop(1,   "rgba(245,197,24,0)");
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(divX, rowStartY);
    ctx.lineTo(divX, rowStartY + maxRows * (rowH + rowGap));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Made By ThailandCodes", W / 2, H - 36);

    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "dice-board.png" });
}