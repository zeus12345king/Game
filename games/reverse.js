const {
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ContainerBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../database.js");
const config = require("../config.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const GIFEncoder = require("gif-encoder-2");

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 20;

let GAME_ACTIVE = false;

module.exports = {
  name: "عكسي",
  aliases: ["reverse"],
  execute(message, args, callback) {
    if (GAME_ACTIVE) {
      message.reply("> **❌ | لقد بدأت لعبة أخرى بالفعل.**");
      callback();
      return;
    }
    GAME_ACTIVE = true;
    startGame(message, Math.floor(Date.now() / 1000), callback);
  },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function resetGame() { GAME_ACTIVE = false; }
function clampLabel(s, max = 13) {
  s = String(s || "");
  return s.length > max ? s.slice(0, max - 2) + ".." : s;
}

function buildLobby(nowTime, players) {
  const TIME_TO_START = config.lobbyTime.reverse;
  const list = players.length
    ? players.map((p, i) => `> **${i + 1}.** <@${p.id}>`).join("\n")
    : "> لا يوجد لاعبين بعد";
  return new ContainerBuilder()
    .setAccentColor(config.colors.reverse)
    .addTextDisplayComponents(t => t.setContent(
      `## 🔄 لعبة العكسي\n> الوقت المتبقي: <t:${nowTime + TIME_TO_START / 1000}:R>\n\n` +
      `**اللاعبون (${players.length}/${MAX_PLAYERS}):**\n${list}`
    ))
    .addMediaGalleryComponents(g => { const img = config.lobbyImages.reverse; if (img) g.addItems(i => i.setURL(img)); return g; })
    .addActionRowComponents(r => r.setComponents(
      new ButtonBuilder().setCustomId("join").setLabel("دخول").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("exit").setLabel("خروج").setStyle(ButtonStyle.Danger)
    ));
}

async function startGame(context, nowTime, callback) {
  let players = [];
  const TIME_TO_START = config.lobbyTime.reverse;

  const sent = await context.reply({
    components: [buildLobby(nowTime, players)],
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true,
  });

  const collector = sent.createMessageComponentCollector({
    filter: i => i.customId === "join" || i.customId === "exit",
    time: TIME_TO_START,
  });

  collector.on("collect", async i => {
    if (i.customId === "join") {
      if (players.some(p => p.id === i.user.id)) { await i.reply({ content: "أنت بالفعل في اللعبة!", ephemeral: true }); return; }
      if (players.length >= MAX_PLAYERS) { await i.reply({ content: "اللعبة ممتلئة!", ephemeral: true }); return; }
      players.push({ id: i.user.id, username: i.user.username || i.user.tag.split("#")[0] });
      await i.update({ components: [buildLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
    } else {
      players = players.filter(p => p.id !== i.user.id);
      await i.update({ components: [buildLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
    }
  });

  collector.on("end", async () => {

    try {
      const closed = new ContainerBuilder()
        .setAccentColor(config.colors.reverse)
        .addTextDisplayComponents(t => t.setContent(
          `## 🔄 لعبة العكسي\n**انتهى وقت الانضمام!**\n\nاللاعبون: ${players.map(p => `<@${p.id}>`).join(', ') || 'لا يوجد'}`
        ))
        .addActionRowComponents(r => r.setComponents(
          new ButtonBuilder().setCustomId("join").setLabel("دخول").setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId("exit").setLabel("خروج").setStyle(ButtonStyle.Danger).setDisabled(true)
        ));
      await sent.edit({ components: [closed], flags: MessageFlags.IsComponentsV2 });
    } catch (_) {}

    if (players.length < MIN_PLAYERS) {
      await context.channel.send("❌ | لم يكتمل عدد اللاعبين.");
      resetGame(); callback(); return;
    }

    await context.channel.send("▶️ | اللعبة تبدأ الآن!");
    await sleep(2000);
    await gameRound(context, players, callback);
  });
}

async function gameRound(context, players, callback) {
  if (players.length === 1) {
    const winner = players[0];
    const pts = config.winPoints.reverse;
    await db.addPoints(winner.id, pts);
    await context.channel.send(`🏆 | <@${winner.id}> فاز باللعبة بـ **${pts}** نقطة!`);
    resetGame(); callback(); return;
  }
  if (players.length === 0) {
    await context.channel.send("❌ | لم يفز أحد.");
    resetGame(); callback(); return;
  }

  await context.channel.send(`🔄 | العجلة تدور... (${players.length} لاعب متبقي)`);

  const eliminated = players[Math.floor(Math.random() * players.length)];

  try {
    const gif = await createRouletteGIF(players, eliminated.id, context.guild);
    const attachment = new AttachmentBuilder(gif, { name: "reverse.gif" });
    await context.channel.send({ files: [attachment] });
  } catch (e) {
    console.error("[Reverse] GIF error:", e);
  }

  await sleep(2000);
  await context.channel.send(`💥 | تم طرد <@${eliminated.id}>!`);
  const remaining = players.filter(p => p.id !== eliminated.id);
  await sleep(2000);
  await gameRound(context, remaining, callback);
}

function clampLabelGif(s, max = 13) {
  s = String(s || "");
  return s.length > max ? s.slice(0, max - 2) + ".." : s;
}

function drawFrame(ctx, size, players, eliminatedId, rotation, isLastFrame, guildIcon) {
  const cx = size / 2, cy = size / 2;
  const wheelRadius = size * 0.44;
  const innerRadius = wheelRadius * 0.26;
  const num = players.length || 1;
  const anglePer = (2 * Math.PI) / num;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.translate(-cx, -cy);

  for (let i = 0; i < num; i++) {
    const start = -Math.PI / 2 + i * anglePer;
    const end = start + anglePer;
    const mid = (start + end) / 2;
    const player = players[i];
    const isChosen = player.id === eliminatedId;
    const baseColor = i % 2 === 0 ? "#2e3338" : "#424a54";

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, wheelRadius, start, end);
    ctx.closePath();
    ctx.fillStyle = isChosen && isLastFrame ? "#e53935" : baseColor;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    const textRadius = innerRadius + (wheelRadius - innerRadius) * 0.60;
    const tx = cx + Math.cos(mid) * textRadius;
    const ty = cy + Math.sin(mid) * textRadius;
    ctx.translate(tx, ty);
    ctx.rotate(mid);
    if (mid > Math.PI / 2 && mid < (3 * Math.PI) / 2) ctx.rotate(Math.PI);
    const label = clampLabelGif(player.username);
    const fontSize = Math.max(11, Math.min(17, 150 / Math.max(label.length, 1)));
    ctx.font = `bold ${fontSize}px IBM`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  if (guildIcon) {
    ctx.clip();
    ctx.drawImage(guildIcon, cx - innerRadius, cy - innerRadius, innerRadius * 2, innerRadius * 2);
  } else {
    ctx.fillStyle = "#111316";
    ctx.fill();
  }
  ctx.strokeStyle = isLastFrame ? "#e53935" : "#888888";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  const needleY = cy - wheelRadius - 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 11, needleY - 20);
  ctx.lineTo(cx + 11, needleY - 20);
  ctx.lineTo(cx, needleY + 8);
  ctx.closePath();
  ctx.fillStyle = "#e53935";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

async function createRouletteGIF(players, eliminatedId, guild) {
  let guildIcon = null;
  try {
    const iconURL = guild?.iconURL({ extension: 'png', size: 128 });
    if (iconURL) guildIcon = await loadImage(iconURL);
  } catch (_) {}

  const size = 500;
  const num = players.length || 1;
  const anglePer = (2 * Math.PI) / num;
  const chosenIdx = players.findIndex(p => p.id === eliminatedId);
  const targetAngle = -(chosenIdx + 0.5) * anglePer;
  const totalRotation = targetAngle + 7 * 2 * Math.PI;

  const SPIN_FRAMES = 60;
  const HOLD_FRAMES = 6;
  const easeOut = t => 1 - Math.pow(1 - t, 4);

  const encoder = new GIFEncoder(size, size, "neuquant", true);
  encoder.setRepeat(-1);
  encoder.setQuality(3);
  encoder.start();

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  for (let f = 0; f < SPIN_FRAMES; f++) {
    const t = f / (SPIN_FRAMES - 1);
    const rot = totalRotation * easeOut(t);
    encoder.setDelay(f < SPIN_FRAMES * 0.4 ? 20 : Math.round(20 + (f / SPIN_FRAMES) * 90));
    drawFrame(ctx, size, players, eliminatedId, rot, false, guildIcon);
    encoder.addFrame(ctx.getImageData(0, 0, size, size).data);
  }

  encoder.setDelay(1500);
  for (let h = 0; h < HOLD_FRAMES; h++) {
    drawFrame(ctx, size, players, eliminatedId, totalRotation, true, guildIcon);
    encoder.addFrame(ctx.getImageData(0, 0, size, size).data);
  }

  encoder.finish();
  return Buffer.from(encoder.out.getData());
}
