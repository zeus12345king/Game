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
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const path = require("path");

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 30;
const TIME_TO_START = config.lobbyTime.rps;
const TIME_TO_CHOOSE = 20000;

const IMG_PATH = "../img/RPS/";
const BASE_IMAGE_PATH = null; 
const IMG_PATHS = {
    leftRock: path.join(__dirname, IMG_PATH, "leftRock.png"),
    leftPaper: path.join(__dirname, IMG_PATH, "leftPaper.png"),
    leftScissor: path.join(__dirname, IMG_PATH, "leftScissor.png"),
    rightRock: path.join(__dirname, IMG_PATH, "rightRock.png"),
    rightPaper: path.join(__dirname, IMG_PATH, "rightPaper.png"),
    rightScissor: path.join(__dirname, IMG_PATH, "rightScissor.png"),
    leftCrown: path.join(__dirname, IMG_PATH, "leftCrown.png"),
    rightCrown: path.join(__dirname, IMG_PATH, "rightCrown.png"),
};
const EMOJIS = {
    rock: "<:rrock:1436111281202663495>",
    paper: "<:rpaper:1436111333350445066>",
    scissor: "<:rscissor:1436111174419873875>",
};

const COORDS = {
    canvas: { width: 1536, height: 1024 },
    leftAvatar: { x: 405, y: 405, r: 90 },
    rightAvatar: { x: 1270, y: 405, r: 90 },
    leftChoose: { x: 469, y: 735 },
    rightChoose: { x: 1175, y: 720 },
    leftCrown: { x: 405, y: 380 },
    rightCrown: { x: 1175, y: 380 },
};

let GAME_ACTIVE = false;
let players = [];

module.exports = {
  name: 'rps',
  aliases: ["حجرة"],
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
  players = [];
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function getRandomWinPoints() {
    const pts = config.winPoints.rps;
    if (typeof pts === 'object') return Math.floor(Math.random() * (pts.max - pts.min + 1)) + pts.min;
    return pts;
}

async function win(playerId, context) {
  try {
    const points = getRandomWinPoints();
    await db.addPoints(playerId, points);
    if (context) context.channel.send(`🏆 | <@${playerId}> فاز بـ **${points}** نقطة!`).catch(() => {});
  } catch (e) {
    console.error(`[RPS] Failed to apply win points: ${e}`)
  }
}
async function lose(playerId, context) { }

async function startGame(context, nowTime, callback) {
  players = [];

  function buildLobby(time, lobbyPlayers) {
    const list = lobbyPlayers.length ? lobbyPlayers.map((p, i) => `> **${i + 1}.** <@${p.id}>`).join('\n') : '> لا يوجد لاعبين بعد';
    return new ContainerBuilder()
      .setAccentColor(config.colors.rps)
      .addTextDisplayComponents(t => t.setContent(
        `## 🗿 حجرة ورقة مقص\n> الوقت المتبقي: <t:${time + TIME_TO_START / 1000}:R>\n\n**اللاعبون (${lobbyPlayers.length}/${MAX_PLAYERS}):**\n${list}`
      ))
      .addMediaGalleryComponents(g => { const img = config.lobbyImages.rps; if (img) g.addItems(item => item.setURL(img)); return g; })
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
          `## 🗿 حجرة ورقة مقص\n**انتهى وقت الانضمام للعبة!**\n\n**اللاعبون المشاركون (${players.length}):** ${players.length > 0 ? players.map(p => `<@${p.id}>`).join(', ') : 'لا يوجد'}`
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
    await gameRound(context, callback);
  });
}

async function gameRound(context, callback) {
    if (players.length === 1) {
        const winner = players[0];
        await context.channel.send(`👑 - <@${winner.id}> فاز باللعبة!`);
        await win(winner.id, context);
        resetGameData();
        callback();
        return;
    }

    if (players.length === 0) {
        await context.channel.send("❌ تم طرد جميع اللاعبين ، لم يفز أحد.");
        resetGameData();
        callback();
        return;
    }

    const shuffled = [...players].sort(() => 0.5 - Math.random());
    const player1 = shuffled[0];
    const player2 = shuffled[1];

    await context.channel.send(`🆚 | <@${player1.id}> ضد <@${player2.id}>`);
    await sleep(1000);

    const eliminatedPlayers = await runMatch(context, player1, player2);

    players = players.filter(p => !eliminatedPlayers.some(e => e.id === p.id));

    await sleep(4000);
    await gameRound(context, callback);
}

async function runMatch(context, player1, player2) {
    let player1Choice = null;
    let player2Choice = null;
    let eliminated = [];

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rps_rock').setEmoji(EMOJIS.rock).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rps_paper').setEmoji(EMOJIS.paper).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rps_scissor').setEmoji(EMOJIS.scissor).setStyle(ButtonStyle.Secondary)
    );

    const msg = await context.channel.send({
        content: `على <@${player1.id}> و <@${player2.id}> الاختيار! (${TIME_TO_CHOOSE / 1000} ثانية)`,
        components: [row]
    });

    const filter = (i) => i.customId.startsWith('rps_') && (i.user.id === player1.id || i.user.id === player2.id);
    const collector = msg.createMessageComponentCollector({ filter, time: TIME_TO_CHOOSE });

    collector.on('collect', async (i) => {
        const choice = i.customId.split('_')[1];

        if (i.user.id === player1.id) {
            if (player1Choice) {
                await i.reply({ content: 'لقد اخترت بالفعل!', ephemeral: true });
            } else {
                player1Choice = choice;
                await i.reply({ content: `لقد اخترت: ${EMOJIS[choice]}`, ephemeral: true });
            }
        } else if (i.user.id === player2.id) {
            if (player2Choice) {
                await i.reply({ content: 'لقد اخترت بالفعل!', ephemeral: true });
            } else {
                player2Choice = choice;
                await i.reply({ content: `لقد اخترت: ${EMOJIS[choice]}`, ephemeral: true });
            }
        }
    });

    return new Promise(async (resolve) => {
        collector.on('end', async () => {
            row.components.forEach(btn => btn.setDisabled(true));
            await msg.edit({ components: [row] });

            let outcomeMessage = "";
            let winner = null;
            let image = null;

            if (!player1Choice && !player2Choice) {
                outcomeMessage = `💣 | تم طرد <@${player1.id}> و <@${player2.id}> لعدم تفاعلهم في اللعبة`;
                eliminated = [player1, player2];
            } else if (!player1Choice) {
                outcomeMessage = `💣 | تم طرد <@${player1.id}> لعدم تفاعله في اللعبة`;
                eliminated = [player1];
            } else if (!player2Choice) {
                outcomeMessage = `💣 | تم طرد <@${player2.id}> لعدم تفاعله في اللعبة`;
                eliminated = [player2];
            }

            if (player1Choice && player2Choice) {
                if (player1Choice === player2Choice) {
                    winner = 'tie';
                    outcomeMessage = "💣 | بسبب التعادل ، تم طرد كلا اللاعبين";
                    eliminated = [player1, player2];
                } else if (
                    (player1Choice === 'rock' && player2Choice === 'scissor') ||
                    (player1Choice === 'paper' && player2Choice === 'rock') ||
                    (player1Choice === 'scissor' && player2Choice === 'paper')
                ) {
                    winner = player1;
                    outcomeMessage = `💣 | تم طرد <@${player2.id}> من اللعبة`;
                    eliminated = [player2];
                } else {
                    winner = player2;
                    outcomeMessage = `💣 | تم طرد <@${player1.id}> من اللعبة`;
                    eliminated = [player1];
                }

                try {
                    image = await drawRpsImage(player1, player1Choice, player2, player2Choice, winner);
                } catch (e) {
                    console.error("Failed to draw RPS image:", e);
                }
            }

            await context.channel.send({
                content: outcomeMessage,
                files: image ? [image] : []
            });

            resolve(eliminated);
        });
    });
}

async function drawRpsImage(player1, choice1, player2, choice2, winner) {
    const canvas = createCanvas(COORDS.canvas.width, COORDS.canvas.height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#23272A";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#2C2F33";
    ctx.fillRect(canvas.width / 2 - 5, 0, 10, canvas.height);

    const [
        avatar1, avatar2,
        imgChoice1, imgChoice2,
        crownL, crownR
    ] = await Promise.all([
        loadImage(player1.avatarURL).catch(e => loadImage("https://cdn.discordapp.com/embed/avatars/0.png")),
        loadImage(player2.avatarURL).catch(e => loadImage("https://cdn.discordapp.com/embed/avatars/0.png")),
        loadImage(IMG_PATHS[`left${choice1.charAt(0).toUpperCase() + choice1.slice(1)}`]),
        loadImage(IMG_PATHS[`right${choice2.charAt(0).toUpperCase() + choice2.slice(1)}`]),
        loadImage(IMG_PATHS.leftCrown),
        loadImage(IMG_PATHS.rightCrown)
    ]);

    drawCircularImage(ctx, avatar1, COORDS.leftAvatar);
    drawCircularImage(ctx, avatar2, COORDS.rightAvatar);

    drawCenteredImage(ctx, imgChoice1, COORDS.leftChoose);
    drawCenteredImage(ctx, imgChoice2, COORDS.rightChoose);

    if (winner === player1) {
        drawCenteredImage(ctx, crownL, COORDS.leftCrown);
    } else if (winner === player2) {
        drawCenteredImage(ctx, crownR, COORDS.rightCrown);
    }

    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "rps-result.png" });
}

function drawCircularImage(ctx, img, coords) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, coords.r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, coords.x - coords.r, coords.y - coords.r, coords.r * 2, coords.r * 2);
    ctx.restore();
}

function drawCenteredImage(ctx, img, coords) {
    const x = coords.x - img.width / 2;
    const y = coords.y - img.height / 2;
    ctx.drawImage(img, x, y, img.width, img.height);
}