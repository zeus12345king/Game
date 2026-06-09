'use strict';

// ══════════════════════════════════════════════════════════════════════
//  🔢 لعبة التخمين الثنائية  —  نسخة إبداعية مع Canvas كامل
// ══════════════════════════════════════════════════════════════════════

const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');

const db     = require('../database.js');
const config = require('../config.js');
const path   = require('path');

// ─── Canvas ─────────────────────────────────────────────────────────
let createCanvas, loadImage, GlobalFonts;
try {
  ({ createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas'));
} catch (_) {
  createCanvas = null;
}

// ══════════════════════════════════════════════════════════════════════
//  ثوابت اللعبة
// ══════════════════════════════════════════════════════════════════════

const MIN_PLAYERS    = 2;
const MAX_PLAYERS    = 2;
const LOBBY_TIME     = config.lobbyTime?.guess ?? 40_000;
const SECRET_TIMEOUT = 90_000;   // مهلة إدخال الرقم السري
const RPS_TIMEOUT    = 30_000;
const TURN_TIMEOUT   = 15_000;   // مهلة دور اللاعب
const MIN_NUM        = 1;
const MAX_NUM        = 100;

// ألوان اللعبة
const CLR = {
  main    : 0xD48A9C,   // أزرق
  success : 0x2ECC71,
  danger  : 0xE74C3C,
  neutral : 0x2C3E50,
  gold    : 0xF1C40F,
  warn    : 0xE67E22,
};

// ══════════════════════════════════════════════════════════════════════
//  حالة اللعبة (عالمية للقناة)
// ══════════════════════════════════════════════════════════════════════
let GAME_ACTIVE = false;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function resetGame() { GAME_ACTIVE = false; }

// ══════════════════════════════════════════════════════════════════════
//  دوال Canvas الإبداعية
// ══════════════════════════════════════════════════════════════════════

async function ensureFont() {
  if (!GlobalFonts) return;
  try {
    const fontPath = path.resolve(__dirname, '../img/Fonts/IBMBold.ttf');
    if (!GlobalFonts.has('IBM')) GlobalFonts.registerFromPath(fontPath, 'IBM');
  } catch (_) {}
}

function getFont() {
  return (GlobalFonts?.has?.('IBM')) ? 'IBM' : 'sans-serif';
}

// ── لوحة اللوبي ──
async function buildLobbyCanvas(players) {
  if (!createCanvas) return null;
  await ensureFont();
  const FONT = getFont();
  const W = 900, H = 420;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // خلفية متدرجة
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a192f');
  bg.addColorStop(1, '#1b3a5c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // شبكة رقمية خفيفة
  ctx.fillStyle = 'rgba(52,152,219,0.08)';
  for (let x = 0; x < W; x += 40) {
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // إطار
  ctx.strokeStyle = 'rgba(52,152,219,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(15, 15, W - 30, H - 30);

  // عنوان
  ctx.font = `bold 52px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ecf0f1';
  ctx.shadowColor = '#3498db';
  ctx.shadowBlur = 20;
  ctx.fillText('🔢 تخمين الرقم السري', W/2, 90);
  ctx.shadowBlur = 0;

  // وصف
  ctx.font = `24px ${FONT}`;
  ctx.fillStyle = '#bdc3c7';
  ctx.fillText('لعبة الذكاء والمنطق بين لاعبين', W/2, 140);

  // شريط اللاعبين
  const barX = 100, barY = 200, barW = 700, barH = 30;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 15);
  ctx.fill();

  const ratio = players.length / MAX_PLAYERS;
  if (ratio > 0) {
    const grad = ctx.createLinearGradient(barX, 0, barX + barW * ratio, 0);
    grad.addColorStop(0, '#3498db');
    grad.addColorStop(1, '#2ecc71');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * ratio, barH, 15);
    ctx.fill();
  }

  ctx.font = `bold 22px ${FONT}`;
  ctx.fillStyle = '#ecf0f1';
  ctx.fillText(`${players.length} / ${MAX_PLAYERS} لاعبين`, W/2, barY + 22);

  // صور اللاعبين إن وجدوا
  for (let i = 0; i < players.length; i++) {
    try {
      const av = await loadImage(players[i].avatarURL);
      ctx.save();
      const ax = 250 + i * 200, ay = 300;
      ctx.beginPath();
      ctx.arc(ax, ay, 45, 0, Math.PI*2);
      ctx.clip();
      ctx.drawImage(av, ax-45, ay-45, 90, 90);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(ax, ay, 45, 0, Math.PI*2);
      ctx.strokeStyle = '#3498db';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillStyle = '#ecf0f1';
      ctx.textAlign = 'center';
      ctx.fillText(players[i].displayName, ax, ay + 70);
    } catch (_) {}
  }

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'guess_lobby.png' });
}

// ── لوحة نتيجة RPS ──
async function buildRPSCanvas(p1, p2, choice1, choice2, winner) {
  if (!createCanvas) return null;
  await ensureFont();
  const FONT = getFont();
  const W = 800, H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // خلفية
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2c3e50');
  bg.addColorStop(1, '#34495e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.font = `bold 36px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ecf0f1';
  ctx.fillText('⚔️ حجرة · ورقة · مقص', W/2, 60);

  // رسم الاختيارات
  const emojis = { rock: '🪨', paper: '📄', scissors: '✂️' };
  const drawPlayer = async (p, x, choice) => {
    try {
      const av = await loadImage(p.avatarURL);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, 180, 50, 0, Math.PI*2);
      ctx.clip();
      ctx.drawImage(av, x-50, 130, 100, 100);
      ctx.restore();
    } catch (_) {}
    ctx.font = `28px ${FONT}`;
    ctx.fillStyle = '#ecf0f1';
    ctx.fillText(p.displayName, x, 260);
    ctx.font = `60px ${FONT}`;
    ctx.fillText(emojis[choice] || '❓', x, 340);
  };

  await drawPlayer(p1, 250, choice1);
  await drawPlayer(p2, 550, choice2);

  // فاصل VS
  ctx.font = `bold 48px ${FONT}`;
  ctx.fillStyle = '#e74c3c';
  ctx.fillText('VS', W/2, 200);

  // نتيجة
  if (winner) {
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillStyle = '#f1c40f';
    ctx.fillText(`🏆 ${winner.displayName} يبدأ!`, W/2, 380);
  } else {
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillStyle = '#f1c40f';
    ctx.fillText('🔄 تعادل! الإعادة جارية...', W/2, 380);
  }

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'rps_result.png' });
}

// ── لوحة التخمين (أثناء الدور) ──
async function buildGuessCanvas(state, currentPlayerId) {
  if (!createCanvas) return null;
  await ensureFont();
  const FONT = getFont();
  const W = 900, H = 500;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // خلفية
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0f2027');
  bg.addColorStop(0.5, '#203a43');
  bg.addColorStop(1, '#2c5364');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // جزيئات
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let i = 0; i < 50; i++) {
    ctx.beginPath();
    ctx.arc(Math.random()*W, Math.random()*H, Math.random()*4, 0, Math.PI*2);
    ctx.fill();
  }

  const currentPlayer = state.players.find(p => p.id === currentPlayerId);
  const opponent = state.players.find(p => p.id !== currentPlayerId);
  const range = state.ranges[opponent.id] || { min: MIN_NUM, max: MAX_NUM };

  // اللاعب الحالي (يسار)
  try {
    const av = await loadImage(currentPlayer.avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(130, 120, 50, 0, Math.PI*2);
    ctx.clip();
    ctx.drawImage(av, 80, 70, 100, 100);
    ctx.restore();
  } catch (_) {}
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillStyle = '#ecf0f1';
  ctx.textAlign = 'center';
  ctx.fillText(currentPlayer.displayName, 130, 200);
  ctx.fillText('🔍 يسأل', 130, 240);

  // الخصم (يمين)
  try {
    const av = await loadImage(opponent.avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(770, 120, 50, 0, Math.PI*2);
    ctx.clip();
    ctx.drawImage(av, 720, 70, 100, 100);
    ctx.restore();
  } catch (_) {}
  ctx.fillStyle = '#ecf0f1';
  ctx.fillText(opponent.displayName, 770, 200);
  ctx.fillText('🔒 رقم سري', 770, 240);

  // شريط النطاق
  const barX = 200, barY = 330, barW = 500, barH = 30;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 15);
  ctx.fill();

  const totalRange = MAX_NUM - MIN_NUM + 1;
  const leftRatio = (range.min - MIN_NUM) / totalRange;
  const widthRatio = (range.max - range.min + 1) / totalRange;

  if (widthRatio > 0) {
    const grad = ctx.createLinearGradient(barX + leftRatio*barW, 0, barX + (leftRatio+widthRatio)*barW, 0);
    grad.addColorStop(0, '#e74c3c');
    grad.addColorStop(0.5, '#f39c12');
    grad.addColorStop(1, '#2ecc71');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(barX + leftRatio * barW, barY, widthRatio * barW, barH, 15);
    ctx.fill();
  }

  ctx.font = `bold 20px ${FONT}`;
  ctx.fillStyle = '#ecf0f1';
  ctx.textAlign = 'center';
  ctx.fillText(`${range.min}`, barX - 20, barY + 22);
  ctx.fillText(`${range.max}`, barX + barW + 20, barY + 22);
  ctx.fillText('النطاق المتبقي', W/2, barY - 10);

  // جولة
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillStyle = '#bdc3c7';
  ctx.textAlign = 'left';
  ctx.fillText(`الجولة ${state.round}`, 30, 40);

  // آخر سؤال
  if (state.lastQuestion) {
    ctx.font = `20px ${FONT}`;
    ctx.fillStyle = '#ecf0f1';
    ctx.textAlign = 'center';
    ctx.fillText(`آخر سؤال: "${state.lastQuestion}" → ${state.lastAnswer ? 'نعم' : 'لا'}`, W/2, 420);
  }

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'guess_board.png' });
}

// ── لوحة الفوز ──
async function buildWinCanvas(winner, opponent, winnerNumber, opponentNumber, rounds) {
  if (!createCanvas) return null;
  await ensureFont();
  const FONT = getFont();
  const W = 900, H = 450;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1e3c72');
  bg.addColorStop(1, '#2a5298');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // نجوم
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  for (let i = 0; i < 30; i++) {
    ctx.beginPath();
    ctx.arc(Math.random()*W, Math.random()*H, Math.random()*5+1, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.font = `bold 48px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f1c40f';
  ctx.shadowColor = '#f39c12';
  ctx.shadowBlur = 25;
  ctx.fillText('🏆 فائز!', W/2, 80);
  ctx.shadowBlur = 0;

  try {
    const av = await loadImage(winner.avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W/2, 200, 70, 0, Math.PI*2);
    ctx.clip();
    ctx.drawImage(av, W/2-70, 130, 140, 140);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(W/2, 200, 70, 0, Math.PI*2);
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 5;
    ctx.stroke();
  } catch (_) {}

  ctx.font = `bold 36px ${FONT}`;
  ctx.fillStyle = '#ecf0f1';
  ctx.fillText(winner.displayName, W/2, 300);

  ctx.font = `26px ${FONT}`;
  ctx.fillStyle = '#bdc3c7';
  ctx.fillText(`رقم الفائز: ${winnerNumber}  |  رقم الخصم: ${opponentNumber}`, W/2, 360);
  ctx.fillText(`انتهت في ${rounds} جولة`, W/2, 400);

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'guess_win.png' });
}

// ══════════════════════════════════════════════════════════════════════
//  تصدير الأمر
// ══════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'guess',
  aliases: ['تخمين', 'رقم'],

  async execute(message, args, callback) {
    if (GAME_ACTIVE) {
      await message.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(CLR.danger)
            .addTextDisplayComponents(t => t.setContent(
              '### ⛔ لعبة جارية!\nانتظر حتى تنتهي الجولة الحالية.',
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

// ══════════════════════════════════════════════════════════════════════
//  اللوبي
// ══════════════════════════════════════════════════════════════════════

async function runLobby(context, callback) {
  let players = [];

  function buildLobby(ps) {
    const deadline = Math.floor(Date.now() / 1000) + Math.floor(LOBBY_TIME / 1000);
    const bar = ps.length === 0 ? '░░░░░░░░░░' : '█████░░░░░';
    const list = ps.length
      ? ps.map((p, i) => `> \`${String(i + 1).padStart(2, '0')}\` <@${p.id}>`).join('\n')
      : '> *في انتظار المنضمين...*';

    const c = new ContainerBuilder()
      .setAccentColor(CLR.main)
      .addTextDisplayComponents(t => t.setContent(
        `## 🔢 تخمين الرقم السري\n` +
        `⏰ ينتهي الانضمام: <t:${deadline}:R>\n\n` +
        `**اللاعبون \`${ps.length}/${MAX_PLAYERS}\`** \`${bar}\`\n\n` +
        `${list}\n\n` +
        `-# اختر رقماً بين 1-100 ثم خمن رقم خصمك قبل أن يخمن رقمك!`,
      ));

    const img = config.lobbyImages?.guess;
    if (img) c.addMediaGalleryComponents(g => g.addItems(item => item.setURL(img)));

    c.addActionRowComponents(r => r.setComponents(
      new ButtonBuilder().setCustomId('join').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('✋'),
      new ButtonBuilder().setCustomId('exit').setLabel('خروج').setStyle(ButtonStyle.Danger).setEmoji('🚪'),
    ));
    return c;
  }

  const lobbyMsg = await context.reply({
    components: [buildLobby(players)],
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true,
  });

  const col = lobbyMsg.createMessageComponentCollector({
    filter: i => i.customId === 'join' || i.customId === 'exit',
    time: LOBBY_TIME,
  });

  col.on('collect', async i => {
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
        avatarURL: i.user.displayAvatarURL({ extension: 'png', forceStatic: true }),
      });
    } else {
      if (!players.some(p => p.id === i.user.id)) {
        await i.reply({ content: '⚠️ لست في اللعبة!', ephemeral: true });
        return;
      }
      players = players.filter(p => p.id !== i.user.id);
    }
    await i.update({ components: [buildLobby(players)], flags: MessageFlags.IsComponentsV2 });

    // إذا اكتمل العدد، نوقف الكولكتور مبكراً ونبدأ
    if (players.length === MAX_PLAYERS) col.stop('full');
  });

  col.on('end', async (_, reason) => {
    try {
      await lobbyMsg.edit({
        components: [
          new ContainerBuilder()
            .setAccentColor(CLR.neutral)
            .addTextDisplayComponents(t => t.setContent(
              `### 🔒 انتهى الانضمام\nاللاعبون: ${players.map(p => `<@${p.id}>`).join(' • ') || 'لا يوجد'}`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (_) {}

    if (players.length < MIN_PLAYERS) {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(CLR.danger)
            .addTextDisplayComponents(t => t.setContent(
              `### ❌ عدد غير كافٍ\يحتاج **${MIN_PLAYERS}** لاعبين.`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      resetGame();
      callback();
      return;
    }

    // اكتمل العدد -> بدء اللعبة
    const state = {
      players,
      round: 1,
      secretNumbers: {},
      ranges: {},
      starter: null,
      currentTurn: null,
      lastQuestion: null,
      lastAnswer: null,
    };

    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(CLR.main)
          .addTextDisplayComponents(t => t.setContent(
            `## 🔢 بدأت اللعبة!\n\n` +
            `**اللاعبون:**\n${players.map(p => `> <@${p.id}>`).join('\n')}\n\n` +
            `-# سيُطلب منكما إدخال أرقامكما السرية...`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    await sleep(2000);

    // مرحلة إدخال الأرقام السرية
    const secretsSet = await secretInputPhase(context, state);
    if (!secretsSet) {
      resetGame();
      callback();
      return;
    }

    // مرحلة RPS لتحديد البادئ
    const starter = await rpsPhase(context, state);
    if (!starter) {
      resetGame();
      callback();
      return;
    }
    state.starter = starter.id;
    state.currentTurn = starter.id;

    await sleep(1500);

    // بدء حلقة التخمين
    await guessLoop(context, state, callback);
  });
}

// ══════════════════════════════════════════════════════════════════════
//  مرحلة إدخال الأرقام السرية
// ══════════════════════════════════════════════════════════════════════

async function secretInputPhase(context, state) {
  const promises = state.players.map(p => getSecretFromPlayer(context, p, SECRET_TIMEOUT));
  const results = await Promise.all(promises);

  for (let i = 0; i < state.players.length; i++) {
    if (results[i] === null) {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(CLR.danger)
            .addTextDisplayComponents(t => t.setContent(
              `### ⚠️ <@${state.players[i].id}> لم يدخل رقماً في الوقت المحدد!\nانتهت اللعبة.`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      return false;
    }
    state.secretNumbers[state.players[i].id] = results[i];
    state.ranges[state.players[i].id] = { min: MIN_NUM, max: MAX_NUM };
  }

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(CLR.success)
        .addTextDisplayComponents(t => t.setContent(
          `### ✅ تم إدخال الأرقام السرية بنجاح!\nالآن حجرة-ورقة-مقص لتحديد البادئ.`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
  return true;
}

function getSecretFromPlayer(context, player, timeout) {
  return new Promise(async (resolve) => {
    // نرسل رسالة خاصة مع زر
    const msg = await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(CLR.main)
          .addTextDisplayComponents(t => t.setContent(
            `### 🔐 <@${player.id}>\nاضغط الزر لإدخال رقمك السري بين **${MIN_NUM}** و **${MAX_NUM}**`,
          ))
          .addActionRowComponents(r => r.setComponents(
            new ButtonBuilder()
              .setCustomId(`secret_${player.id}`)
              .setLabel('أدخل الرقم السري')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🔢'),
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: false, // للأسف لا يمكن جعلها ephemeral عبر القناة العامة، لذا سنستخدم التفاعل الخاص
    });

    // سنستخدم مكونات تفاعل خاصة: نجعل الرسالة مؤقتة لكل مستخدم عبر الفلتر
    const btnCollector = msg.createMessageComponentCollector({
      filter: i => i.customId === `secret_${player.id}` && i.user.id === player.id,
      time: timeout,
      max: 1,
    });

    btnCollector.on('collect', async i => {
      // عرض Modal
      const modal = new ModalBuilder()
        .setCustomId(`modal_secret_${player.id}`)
        .setTitle('الرقم السري');

      const input = new TextInputBuilder()
        .setCustomId('number_input')
        .setLabel(`أدخل رقماً بين ${MIN_NUM}-${MAX_NUM}`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('مثلاً 42')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(3);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      await i.showModal(modal);

      try {
        const modalSubmit = await i.awaitModalSubmit({
          time: 60000,
          filter: mi => mi.customId === `modal_secret_${player.id}` && mi.user.id === player.id,
        });

        const num = parseInt(modalSubmit.fields.getTextInputValue('number_input').trim(), 10);
        if (isNaN(num) || num < MIN_NUM || num > MAX_NUM) {
          await modalSubmit.reply({ content: `❌ الرقم يجب أن يكون بين ${MIN_NUM} و ${MAX_NUM}. حاول مجدداً بالضغط على الزر.`, ephemeral: true });
          // نعيد تفعيل الزر مرة أخرى بإعادة إرسال الرسالة (تحديثها)
          await msg.edit({
            components: [msg.components[0]], // نفس المكونات
          });
          // ننتظر ضغطة جديدة... للتبسيط، سننهي ونعيد null (يمكن تحسينها لاحقاً)
          resolve(null);
          return;
        }

        await modalSubmit.reply({ content: '✅ تم حفظ رقمك السري!', ephemeral: true });
        resolve(num);
      } catch (e) {
        resolve(null);
      }
    });

    btnCollector.on('end', collected => {
      if (collected.size === 0) resolve(null);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
//  مرحلة حجرة-ورقة-مقص
// ══════════════════════════════════════════════════════════════════════

async function rpsPhase(context, state) {
  const choices = {};

  const getChoice = (player) => {
    return new Promise(async (resolve) => {
      const msg = await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(CLR.main)
            .addTextDisplayComponents(t => t.setContent(
              `### ✊✋✌️ <@${player.id}>\nاختر:`,
            ))
            .addActionRowComponents(r => r.setComponents(
              new ButtonBuilder().setCustomId(`rps_rock_${player.id}`).setLabel('حجرة').setStyle(ButtonStyle.Secondary).setEmoji('🪨'),
              new ButtonBuilder().setCustomId(`rps_paper_${player.id}`).setLabel('ورقة').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
              new ButtonBuilder().setCustomId(`rps_scissors_${player.id}`).setLabel('مقص').setStyle(ButtonStyle.Secondary).setEmoji('✂️'),
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      const col = msg.createMessageComponentCollector({
        filter: i => i.user.id === player.id && i.customId.startsWith('rps_'),
        time: RPS_TIMEOUT,
        max: 1,
      });

      col.on('collect', async i => {
        const choice = i.customId.split('_')[1]; // rock, paper, scissors
        await i.reply({ content: `✅ اخترت!`, ephemeral: true });
        resolve(choice);
      });

      col.on('end', collected => {
        if (collected.size === 0) resolve(null);
      });
    });
  };

  // نطلب من اللاعبين الاختيار (يمكن بالتوازي)
  const [c1, c2] = await Promise.all([
    getChoice(state.players[0]),
    getChoice(state.players[1]),
  ]);

  if (!c1 || !c2) {
    await context.channel.send('❌ أحد اللاعبين لم يختر في الوقت المحدد. انتهت اللعبة.');
    return null;
  }

  // تحديد الفائز
  const outcomes = {
    rock: { rock: null, paper: 'p2', scissors: 'p1' },
    paper: { rock: 'p1', paper: null, scissors: 'p2' },
    scissors: { rock: 'p2', paper: 'p1', scissors: null },
  };

  let winner = null;
  const result = outcomes[c1][c2];
  if (result === 'p1') winner = state.players[0];
  else if (result === 'p2') winner = state.players[1];

  // عرض النتيجة
  const canvas = await buildRPSCanvas(state.players[0], state.players[1], c1, c2, winner);
  await context.channel.send({ files: canvas ? [canvas] : [] });

  if (!winner) {
    // تعادل - نعيد المرحلة
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(CLR.warn)
          .addTextDisplayComponents(t => t.setContent('🔄 تعادل! الإعادة...')),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
    return rpsPhase(context, state); // تكرار
  }

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(CLR.gold)
        .addTextDisplayComponents(t => t.setContent(
          `### 🏆 ${winner.displayName} سيبدأ بطرح الأسئلة!`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  return winner;
}

// ══════════════════════════════════════════════════════════════════════
//  حلقة التخمين الرئيسية
// ══════════════════════════════════════════════════════════════════════

async function guessLoop(context, state, callback) {
  // نتحقق من وجود لاعبين
  if (state.players.length < 2) {
    resetGame();
    callback();
    return;
  }

  const currentPlayer = state.players.find(p => p.id === state.currentTurn);
  const opponent = state.players.find(p => p.id !== state.currentTurn);

  // لوحة التخمين
  const canvas = await buildGuessCanvas(state, currentPlayer.id);
  const msg = await context.channel.send({
    files: canvas ? [canvas] : [],
    components: [
      new ContainerBuilder()
        .setAccentColor(CLR.main)
        .addTextDisplayComponents(t => t.setContent(
          `## 🔍 دور <@${currentPlayer.id}>\nاختر نوع سؤالك:`,
        ))
        .addActionRowComponents(r => r.setComponents(
          new ButtonBuilder().setCustomId('ask_above').setLabel('فوق').setStyle(ButtonStyle.Primary).setEmoji('⬆️'),
          new ButtonBuilder().setCustomId('ask_below').setLabel('تحت').setStyle(ButtonStyle.Primary).setEmoji('⬇️'),
          new ButtonBuilder().setCustomId('ask_equal').setLabel('يساوي').setStyle(ButtonStyle.Success).setEmoji('🎯'),
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  try {
    const turnResult = await handleTurn(context, state, msg, currentPlayer, opponent);
    if (turnResult === 'win') {
      // الفائز هو currentPlayer
      await declareWinner(context, state, currentPlayer, opponent, callback);
      return;
    }
    // وإلا انتقل الدور
    state.currentTurn = opponent.id;
    state.round++;
    await sleep(1500);
    await guessLoop(context, state, callback);
  } catch (e) {
    // انتهت المهلة أو خطأ
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(CLR.danger)
          .addTextDisplayComponents(t => t.setContent('⏰ انتهى الوقت! فوز تلقائي للخصم.')),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
    await declareWinner(context, state, opponent, currentPlayer, callback);
  }
}

function handleTurn(context, state, message, currentPlayer, opponent) {
  return new Promise((resolve, reject) => {
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === currentPlayer.id && ['ask_above', 'ask_below', 'ask_equal'].includes(i.customId),
      time: TURN_TIMEOUT,
      max: 1,
    });

    collector.on('collect', async i => {
      const type = i.customId.replace('ask_', ''); // above, below, equal
      // نعرض Modal لإدخال الرقم
      const modal = new ModalBuilder()
        .setCustomId(`guess_modal_${currentPlayer.id}`)
        .setTitle(type === 'equal' ? 'تخمين الرقم' : 'تحديد الرقم');

      const input = new TextInputBuilder()
        .setCustomId('guess_input')
        .setLabel(type === 'equal' ? 'ما هو رقم الخصم؟' : 'أدخل الرقم للمقارنة')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('أدخل رقماً')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(3);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      await i.showModal(modal);

      try {
        const modalSubmit = await i.awaitModalSubmit({
          time: 30000,
          filter: mi => mi.customId === `guess_modal_${currentPlayer.id}` && mi.user.id === currentPlayer.id,
        });

        const valueStr = modalSubmit.fields.getTextInputValue('guess_input').trim();
        const value = parseInt(valueStr, 10);
        if (isNaN(value) || value < MIN_NUM || value > MAX_NUM) {
          await modalSubmit.reply({ content: `❌ الرقم غير صالح. انتهى دورك.`, ephemeral: true });
          resolve('continue');
          return;
        }

        const secret = state.secretNumbers[opponent.id];
        let answer = false; // نعم/لا

        if (type === 'equal') {
          answer = (value === secret);
        } else if (type === 'above') {
          answer = (secret > value);
        } else if (type === 'below') {
          answer = (secret < value);
        }

        // تحديث النطاق
        const range = state.ranges[opponent.id];
        if (type === 'above') {
          if (answer) range.min = Math.max(range.min, value + 1);
          else range.max = Math.min(range.max, value);
        } else if (type === 'below') {
          if (answer) range.max = Math.min(range.max, value - 1);
          else range.min = Math.max(range.min, value);
        }

        state.lastQuestion = type === 'equal' ? `يساوي ${value}` : (type === 'above' ? `فوق ${value}` : `تحت ${value}`);
        state.lastAnswer = answer;

        await modalSubmit.reply({ content: `✅ سؤالك: "${state.lastQuestion}" → ${answer ? 'نعم' : 'لا'}`, ephemeral: true });

        // رسالة عامة بالإجابة
        await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(answer ? CLR.success : CLR.danger)
              .addTextDisplayComponents(t => t.setContent(
                `### ❓ سؤال <@${currentPlayer.id}>: ${state.lastQuestion}\n` +
                `> الإجابة: **${answer ? 'نعم 👍' : 'لا 👎'}**`,
              )),
          ],
          flags: MessageFlags.IsComponentsV2,
        });

        // حذف أزرار الرسالة السابقة
        try {
          await message.edit({
            components: [
              new ContainerBuilder()
                .setAccentColor(CLR.neutral)
                .addTextDisplayComponents(t => t.setContent('⏳ انتظار...')),
            ],
          });
        } catch (_) {}

        if (type === 'equal' && answer) {
          resolve('win');
        } else {
          resolve('continue');
        }
      } catch (e) {
        resolve('continue');
      }
    });

    collector.on('end', collected => {
      if (collected.size === 0) reject(new Error('timeout'));
    });
  });
}

async function declareWinner(context, state, winner, loser, callback) {
  const winnerNum = state.secretNumbers[winner.id];
  const loserNum = state.secretNumbers[loser.id];
  const pts = (() => {
    const p = config.winPoints?.guess;
    if (!p) return 50;
    if (typeof p === 'object') return Math.floor(Math.random() * (p.max - p.min + 1)) + p.min;
    return p;
  })();
  await db.addPoints(winner.id, pts);

  const winCanvas = await buildWinCanvas(winner, loser, winnerNum, loserNum, state.round);
  await context.channel.send({
    files: winCanvas ? [winCanvas] : [],
    components: [
      new ContainerBuilder()
        .setAccentColor(CLR.gold)
        .addTextDisplayComponents(t => t.setContent(
          `## 👑 انتهت اللعبة!\n\n` +
          `🏆 **<@${winner.id}>** فاز بعد **${state.round}** جولة!\n` +
          `🎖️ حصل على **${pts}** نقطة!\n` +
          `رقم الفائز: **${winnerNum}** | رقم الخصم: **${loserNum}**`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  resetGame();
  callback();
}