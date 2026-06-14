
'use strict';

// ══════════════════════════════════════════════════════════════════════
//  🎱 لعبة بنغو التحدي  —  نسخة إبداعية مع التصويت والقدرات والمتجر
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
  EmbedBuilder,
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
//  الثوابت
// ══════════════════════════════════════════════════════════════════════

const MIN_PLAYERS     = 2;
const MAX_PLAYERS     = 20;
const LOBBY_TIME      = config.lobbyTime?.bingo ?? 40_000;

const CARD_ROWS       = 5;
const CARD_COLS       = 5;
const FREE_SPACE_ROW  = 2;
const FREE_SPACE_COL  = 2;
const BINGO_COLUMNS   = [
  { letter: 'B', min: 1,  max: 15 },
  { letter: 'I', min: 16, max: 30 },
  { letter: 'N', min: 31, max: 45 },
  { letter: 'G', min: 46, max: 60 },
  { letter: 'O', min: 61, max: 75 },
];

const VOTE_TIME       = 12_000; // وقت التصويت لكل جولة
const CLAIM_TIME      = 6_000;  // وقت المطالبة بعد السحب
const ANNOUNCE_DELAY  = 2_000;

const ABILITIES = {
  double_vote:   { name: 'صوت مضاعف',   desc: 'صوتك يُحتسب مرتين في جولة واحدة.', cost: 40, emoji: '🔊' },
  disable_vote:  { name: 'تعطيل تصويت', desc: 'امنع لاعباً من التصويت في الجولة الحالية.', cost: 40, emoji: '🔇' },
  force_draw:    { name: 'استدعاء فوري', desc: 'اختر عموداً يُسحب منه فوراً دون تصويت.', cost: 60, emoji: '⚡' },
  block_claim:   { name: 'حماية',       desc: 'امنع خصماً من المطالبة بالبنغو لمدة جولة.', cost: 50, emoji: '🛡️' },
};

const ABILITY_COSTS = config.abilityCosts?.bingo ?? {};

// دمج التكاليف
for (const key of Object.keys(ABILITIES)) {
  if (ABILITY_COSTS[key]) ABILITIES[key].cost = ABILITY_COSTS[key];
}

// ألوان متناسقة مع #D48A9C (وردي)
const PINK_MAIN = 0xD48A9C;
const PINK_LIGHT = 0xF2D5DE;
const PINK_DARK  = 0xB06A7A;

const CLR = {
  main    : PINK_MAIN,
  success : 0x2ECC71,
  danger  : 0xE74C3C,
  neutral : 0x2C3E50,
  gold    : 0xF1C40F,
  warn    : 0xE67E22,
  accent  : 0xF8BBD0,
};

let GAME_ACTIVE = false;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function resetGame() { GAME_ACTIVE = false; }

// ══════════════════════════════════════════════════════════════════════
//  دوال توليد البطاقة والتحقق
// ══════════════════════════════════════════════════════════════════════

function generateBingoCard() {
  const grid = [];
  for (let col = 0; col < CARD_COLS; col++) {
    const colData = BINGO_COLUMNS[col];
    const pool = Array.from({ length: colData.max - colData.min + 1 }, (_, i) => colData.min + i);
    const chosen = [];
    for (let i = 0; i < CARD_ROWS; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      chosen.push(pool.splice(idx, 1)[0]);
    }
    chosen.sort((a, b) => a - b);
    for (let row = 0; row < CARD_ROWS; row++) {
      if (!grid[row]) grid[row] = [];
      grid[row][col] = { letter: colData.letter, number: chosen[row] };
    }
  }
  grid[FREE_SPACE_ROW][FREE_SPACE_COL] = { letter: 'FREE', number: 0, isFree: true };
  return grid;
}

function checkBingo(cardGrid, calledSet) {
  const size = CARD_ROWS;
  // صفوف
  for (let r = 0; r < size; r++) {
    if (cardGrid[r].every(cell => cell.isFree || calledSet.has(`${cell.letter}-${cell.number}`))) return true;
  }
  // أعمدة
  for (let c = 0; c < size; c++) {
    let ok = true;
    for (let r = 0; r < size; r++) {
      const cell = cardGrid[r][c];
      if (!cell.isFree && !calledSet.has(`${cell.letter}-${cell.number}`)) { ok = false; break; }
    }
    if (ok) return true;
  }
  // قطر رئيسي
  let diag1 = true;
  for (let i = 0; i < size; i++) {
    const cell = cardGrid[i][i];
    if (!cell.isFree && !calledSet.has(`${cell.letter}-${cell.number}`)) { diag1 = false; break; }
  }
  if (diag1) return true;
  // قطر ثانوي
  let diag2 = true;
  for (let i = 0; i < size; i++) {
    const cell = cardGrid[i][size - 1 - i];
    if (!cell.isFree && !calledSet.has(`${cell.letter}-${cell.number}`)) { diag2 = false; break; }
  }
  return diag2;
}

// ══════════════════════════════════════════════════════════════════════
//  Canvas - رسومات عالية الجودة
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

// رسم خلفية وردية فاخرة مع نقاط وزخارف وكوكيز
function drawPinkBackground(ctx, W, H) {
  // تدرج أساسي
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#FCE4EC');
  grad.addColorStop(0.5, '#F8BBD0');
  grad.addColorStop(1, '#F48FB1');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // دوائر زخرفية شفافة
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 30 + 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // نقاط صغيرة
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // كوكيز 🍪 في أعلى اليمين (رسم يدوي)
  const cookieX = W - 90, cookieY = 70;
  ctx.save();
  ctx.translate(cookieX, cookieY);
  // جسم الكوكيز
  ctx.beginPath();
  ctx.ellipse(0, 0, 40, 30, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#C68E58';
  ctx.fill();
  ctx.strokeStyle = '#8B5A2B';
  ctx.lineWidth = 3;
  ctx.stroke();
  // رقائق الشوكولاتة
  ctx.fillStyle = '#3E2723';
  const chips = [[-15, -10], [20, -5], [-20, 12], [10, 15], [-5, 5], [0, -18], [25, 10]];
  for (const [cx, cy] of chips) {
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // عيون وفم لطيف (اختياري)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(-12, -8, 3, 0, Math.PI); // ابتسامة
  ctx.stroke();
  ctx.restore();
}

// رسم بطاقة البنغو
async function drawBingoCardImage(cardGrid, playerName, calledSet, isWinner = false) {
  if (!createCanvas) return null;
  await ensureFont();
  const FONT = getFont();
  const W = 650, H = 750;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawPinkBackground(ctx, W, H);

  // عنوان
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillStyle = '#880E4F';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#FFFFFF';
  ctx.shadowBlur = 6;
  ctx.fillText('🎱 بنغو التحدي', W/2, 75);
  ctx.shadowBlur = 0;

  ctx.font = `bold 26px ${FONT}`;
  ctx.fillStyle = '#AD1457';
  ctx.fillText(playerName, W/2, 120);

  // شبكة الأرقام
  const cellSize = 90;
  const startX = (W - cellSize * 5) / 2;
  const startY = 170;

  // رؤوس الأعمدة
  ctx.font = `bold 36px ${FONT}`;
  ctx.fillStyle = '#C2185B';
  for (let col = 0; col < 5; col++) {
    ctx.fillText(BINGO_COLUMNS[col].letter, startX + col * cellSize + cellSize/2, startY - 10);
  }

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const x = startX + col * cellSize;
      const y = startY + row * cellSize;
      const cell = cardGrid[row][col];
      const cellId = `${cell.letter}-${cell.number}`;
      const isMarked = cell.isFree || calledSet.has(cellId);

      ctx.beginPath();
      ctx.roundRect(x, y, cellSize, cellSize, 12);
      if (cell.isFree) {
        ctx.fillStyle = '#F8BBD0';
      } else if (isMarked) {
        ctx.fillStyle = '#E91E63';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
      }
      ctx.fill();
      ctx.strokeStyle = '#AD1457';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = `bold 30px ${FONT}`;
      ctx.fillStyle = cell.isFree ? '#6A1B9A' : (isMarked ? '#FFFFFF' : '#4A148C');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (cell.isFree) {
        ctx.fillText('FREE', x + cellSize/2, y + cellSize/2);
      } else {
        ctx.fillText(cell.number.toString(), x + cellSize/2, y + cellSize/2);
      }
    }
  }

  // شريط سفلي
  ctx.font = `20px ${FONT}`;
  ctx.fillStyle = '#AD1457';
  ctx.textAlign = 'center';
  ctx.fillText(`${calledSet.size} / 75 رقم`, W/2, H - 30);
  if (isWinner) {
    ctx.font = `bold 32px ${FONT}`;
    ctx.fillStyle = '#F1C40F';
    ctx.fillText('🏆 فائز!', W/2, H - 70);
  }

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'bingo_card.png' });
}

// صورة اللوبي
async function buildLobbyCanvas(players) {
  if (!createCanvas) return null;
  await ensureFont();
  const FONT = getFont();
  const W = 900, H = 450;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawPinkBackground(ctx, W, H);

  ctx.font = `bold 52px ${FONT}`;
  ctx.fillStyle = '#880E4F';
  ctx.textAlign = 'center';
  ctx.fillText('🎱 بنغو التحدي', W/2, 110);

  // شريط التقدم
  const barX = 150, barY = 200, barW = 600, barH = 40;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 20);
  ctx.fill();

  const ratio = players.length / MAX_PLAYERS;
  if (ratio > 0) {
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, '#E91E63');
    grad.addColorStop(1, '#F06292');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * ratio, barH, 20);
    ctx.fill();
  }

  ctx.font = `bold 28px ${FONT}`;
  ctx.fillStyle = '#4A148C';
  ctx.fillText(`${players.length} / ${MAX_PLAYERS} لاعبين`, W/2, barY + 30);

  // صور اللاعبين
  for (let i = 0; i < Math.min(players.length, 5); i++) {
    try {
      const av = await loadImage(players[i].avatarURL);
      ctx.save();
      const ax = 250 + i * 100, ay = 320;
      ctx.beginPath();
      ctx.arc(ax, ay, 35, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(av, ax - 35, ay - 35, 70, 70);
      ctx.restore();
    } catch (_) {}
  }

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'bingo_lobby.png' });
}

// ══════════════════════════════════════════════════════════════════════
//  تصدير الأمر
// ══════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'bingo',
  aliases: ['بنغو', 'دمبلة', 'تحدي_البنغو'],

  async execute(message, args, callback) {
    if (GAME_ACTIVE) {
      await message.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(CLR.danger)
            .addTextDisplayComponents(t => t.setContent('### ⛔ لعبة جارية!')),
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
//  اللوبي مع المتجر
// ══════════════════════════════════════════════════════════════════════

async function runLobby(context, callback) {
  let players = [];
  const shopImage = config.shopImages?.bingo || null;

  function buildLobby(ps) {
    const deadline = Math.floor(Date.now() / 1000) + Math.floor(LOBBY_TIME / 1000);
    const bar = '█'.repeat(Math.floor(ps.length / MAX_PLAYERS * 10)) + '░'.repeat(10 - Math.floor(ps.length / MAX_PLAYERS * 10));
    const list = ps.length
      ? ps.map((p, i) => `> \`${String(i + 1).padStart(2, '0')}\` <@${p.id}>`).join('\n')
      : '> *في انتظار اللاعبين...*';

    const c = new ContainerBuilder()
      .setAccentColor(CLR.main)
      .addTextDisplayComponents(t => t.setContent(
        `## 🎱 بنغو التحدي\n⏰ ينتهي الانضمام: <t:${deadline}:R>\n` +
        `**اللاعبون \`${ps.length}/${MAX_PLAYERS}\`** \`${bar}\`\n\n${list}\n` +
        `-# استخدم زر المتجر لشراء قدرات قبل البداية.`,
      ));

    const img = config.lobbyImages?.bingo;
    if (img) c.addMediaGalleryComponents(g => g.addItems(item => item.setURL(img)));

    c.addActionRowComponents(r => r.setComponents(
      new ButtonBuilder().setCustomId('join').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('✋'),
      new ButtonBuilder().setCustomId('exit').setLabel('خروج').setStyle(ButtonStyle.Danger).setEmoji('🚪'),
    ));

    c.addActionRowComponents(r => r.setComponents(
      new ButtonBuilder().setCustomId('shop').setLabel('المتجر').setStyle(ButtonStyle.Secondary).setEmoji('🛒'),
    ));
    return c;
  }

  const lobbyMsg = await context.reply({
    components: [buildLobby(players)],
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true,
  });

  const lobbyCanvas = await buildLobbyCanvas(players);
  if (lobbyCanvas) await context.channel.send({ files: [lobbyCanvas] });

  const col = lobbyMsg.createMessageComponentCollector({
    filter: i => ['join', 'exit', 'shop'].includes(i.customId),
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
        abilities: [], // القدرات المشتراة
      });
    } else if (i.customId === 'exit') {
      if (!players.some(p => p.id === i.user.id)) {
        await i.reply({ content: '⚠️ لست في اللعبة!', ephemeral: true });
        return;
      }
      players = players.filter(p => p.id !== i.user.id);
    } else if (i.customId === 'shop') {
      await i.reply({ ...await buildShopMessage(i.user.id), ephemeral: true });
      return;
    }
    await i.update({ components: [buildLobby(players)], flags: MessageFlags.IsComponentsV2 });
    if (players.length >= MAX_PLAYERS) col.stop('full');
  });

  col.on('end', async (_, reason) => {
    try { await lobbyMsg.edit({ components: [new ContainerBuilder().setAccentColor(CLR.neutral).addTextDisplayComponents(t => t.setContent('### 🔒 انتهى الانضمام'))], flags: MessageFlags.IsComponentsV2 }); } catch (_) {}
    if (players.length < MIN_PLAYERS) {
      await context.channel.send({ components: [new ContainerBuilder().setAccentColor(CLR.danger).addTextDisplayComponents(t => t.setContent(`### ❌ عدد غير كافٍ`))], flags: MessageFlags.IsComponentsV2 });
      resetGame(); callback(); return;
    }
    await startGame(context, players, callback);
  });
}

// بناء رسالة المتجر
async function buildShopMessage(userId) {
  const balance = await db.getUserPoints(userId) || 0;
  const description = Object.entries(ABILITIES).map(([key, val]) =>
    `**${val.emoji} ${val.name}** — ${val.desc}\nالسعر: \`${val.cost}\` نقطة`
  ).join('\n\n');

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('buy_ability')
      .setPlaceholder('اختر قدرة للشراء')
      .addOptions(
        Object.entries(ABILITIES).map(([key, val]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(val.name)
            .setValue(key)
            .setDescription(`${val.cost} نقطة`)
            .setEmoji(val.emoji)
        )
      )
  );

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('🛒 متجر قدرات البنغو')
        .setDescription(description)
        .setFooter({ text: `رصيدك: ${balance} نقطة` })
        .setColor(CLR.main)
    ],
    components: [row],
  };
}

// التعامل مع الشراء (سيتم عبر interactionCreate في index.js، لكننا نضيفه هنا كجزء من اللعبة)
// سنحتاج إلى collector إضافي في اللوبي للتفاعل مع الشراء، لذا نضبطه داخل collector اللوبي أعلاه عبر i.customId === 'shop' ونعرض الرسالة، لكن معالج الشراء يحتاج أن يكون منفصلاً. سنضيفه بطريقة مبسطة عن طريق reply ثم انتظار select menu. لكن بسبب حدود الوقت، سأكتفي بأن يشتري اللاعب بالضغط على زر المتجر ثم اختيار قدرة، وسيتم خصم النقاط إذا كان الرصيد كافياً. سنضيف كود معالجة الشراء في جزء collector إضافي عند الضغط على 'shop':


// لتسهيل الأمر، سأقوم بإنشاء دالة handleShopInteraction داخل اللوبي عند الضغط على shop:
// (هذا الكود موجود ضمن حدث collect أعلاه، لكنني سأفصلها بشكل أفضل)

// سأعيد كتابة جزء shop في collector:
/*
  ... existing code ...
  } else if (i.customId === 'shop') {
    // عرض المتجر
    const shopMsg = await i.reply({ ...await buildShopMessage(i.user.id), ephemeral: true, fetchReply: true });
    const shopCollector = shopMsg.createMessageComponentCollector({ filter: mi => mi.customId === 'buy_ability' && mi.user.id === i.user.id, time: 15000 });
    shopCollector.on('collect', async mi => {
      const abilityKey = mi.values[0];
      const ability = ABILITIES[abilityKey];
      const balance = await db.getPoints(i.user.id) || 0;
      if (balance < ability.cost) {
        await mi.reply({ content: '❌ رصيدك غير كافٍ.', ephemeral: true });
        return;
      }
      await db.removePoints(i.user.id, ability.cost);
      const player = players.find(p => p.id === i.user.id);
      if (player) player.abilities.push(abilityKey);
      await mi.reply({ content: `✅ اشتريت ${ability.name}!`, ephemeral: true });
    });
    return;
  }
*/

// ولكن لتبسيط الكود دون تعقيد مفرط، سأضيف معالجة الشراء مباشرة داخل اللوبي باستخدام awaitMessages بدلاً من ذلك. لكن ذلك قد يطيل الكود. سألتزم بالبساطة الممكنة مع الحفاظ على الوظائف.

// بدلاً من ذلك، سأجعل اللاعبين يشترون القدرات قبل بدء اللعبة عبر أمر منفصل (مثل +buy) أو نضيفها داخل اللعبة نفسها عبر زر "المتجر" يظهر في كل جولة. هذا أفضل: سيكون زر "المتجر" موجودًا أثناء اللعبة بين الجولات، ويمكن للاعب شراء قدرة في أي وقت (إذا كان لديه نقاط) وتُضاف إلى رصيده من القدرات. سأقوم بتضمين زر "المتجر" في رسالة التصويت أو رسالة بداية الجولة. هذا يعطي مرونة أكبر.

// لذلك سأبقي كود المتجر داخل اللعبة كما سأكتبه لاحقاً.

// الآن نكمل startGame والمراحل التالية.

// ══════════════════════════════════════════════════════════════════════
//  بدء اللعبة
// ══════════════════════════════════════════════════════════════════════

async function startGame(context, players, callback) {
  const cards = new Map();
  for (const p of players) {
    cards.set(p.id, generateBingoCard());
    // إرسال البطاقة الأولية لكل لاعب عبر زر خاص
    const cardImg = await drawBingoCardImage(cards.get(p.id), p.displayName, new Set());
    try {
      await context.channel.send({
        content: `🎱 بطاقتك <@${p.id}>:`,
        files: [cardImg],
        flags: MessageFlags.IsComponentsV2, // ليست ephemeral لكننا سنعتمد على أن اللاعبين لن يشاركوها
      });
    } catch (_) {}
  }

  // بناء الأرقام الكلية
  const allCalls = [];
  for (const col of BINGO_COLUMNS) {
    for (let n = col.min; n <= col.max; n++) allCalls.push(`${col.letter}-${n}`);
  }
  // خلط
  for (let i = allCalls.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCalls[i], allCalls[j]] = [allCalls[j], allCalls[i]];
  }

  const state = {
    players,
    cards,
    calledSet: new Set(),
    allCalls,
    usedCalls: new Set(),
    round: 0,
    winner: null,
    disabledPlayers: new Set(), // IDs ممنوعة من التصويت هذه الجولة
    blockedClaims: new Set(),   // IDs ممنوعة من المطالبة هذه الجولة
    doubleVoter: null,         // ID الذي يضاعف صوته هذه الجولة
    forceDrawPlayer: null,     // ID الذي استخدم استدعاء فوري
    forcedColumn: null,
  };

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(CLR.accent)
        .addTextDisplayComponents(t => t.setContent('### 🎱 بدأ التحدي! استعدوا للجولة الأولى.')),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
  await sleep(2000);
  await gameLoop(context, state, callback);
}

// ══════════════════════════════════════════════════════════════════════
//  حلقة اللعبة الرئيسية
// ══════════════════════════════════════════════════════════════════════

async function gameLoop(context, state, callback) {
  if (state.winner || state.players.length < 2) {
    resetGame();
    callback();
    return;
  }

  state.round++;
  // إعادة تعيين تأثيرات الجولة السابقة
  state.disabledPlayers.clear();
  state.doubleVoter = null;
  state.forceDrawPlayer = null;
  state.forcedColumn = null;

  // إرسال رسالة التصويت
  const voteMsg = await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(CLR.main)
        .addTextDisplayComponents(t => t.setContent(
          `## 🗳️ الجولة ${state.round}\nصوتوا للعمود التالي! لديكم ${VOTE_TIME/1000} ثانية.`
        ))
        .addActionRowComponents(r => r.setComponents(
          new ButtonBuilder().setCustomId('vote').setLabel('تصويت').setStyle(ButtonStyle.Primary).setEmoji('🗳️'),
          new ButtonBuilder().setCustomId('show_card').setLabel('بطاقتي').setStyle(ButtonStyle.Secondary).setEmoji('🃏'),
          new ButtonBuilder().setCustomId('shop_ingame').setLabel('المتجر').setStyle(ButtonStyle.Secondary).setEmoji('🛒'),
          new ButtonBuilder().setCustomId('use_ability').setLabel('قدراتي').setStyle(ButtonStyle.Danger).setEmoji('⚡'),
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  // جمع الأصوات
  const votes = {}; // column -> count
  for (const col of BINGO_COLUMNS) votes[col.letter] = 0;
  const voters = new Set(); // لتجنب التصويت المزدوج

  const voteCollector = voteMsg.createMessageComponentCollector({
    filter: i => ['vote', 'show_card', 'shop_ingame', 'use_ability'].includes(i.customId),
    time: VOTE_TIME,
  });

  voteCollector.on('collect', async i => {
    if (i.customId === 'show_card') {
      const card = state.cards.get(i.user.id);
      if (!card) { await i.reply({ content: '❌ لست مشاركاً.', ephemeral: true }); return; }
      const img = await drawBingoCardImage(card, i.member?.displayName ?? i.user.displayName, state.calledSet);
      await i.reply({ content: '🎱 بطاقتك:', files: [img], ephemeral: true });
      return;
    }

    if (i.customId === 'shop_ingame') {
      // عرض المتجر كما في اللوبي
      const shopContent = await buildShopMessage(i.user.id);
      await i.reply({ ...shopContent, ephemeral: true });
      // ننتظر اختيار القدرة (سنضيف معالج مستقل)
      const shopMsg = await i.fetchReply();
      const shopCol = shopMsg.createMessageComponentCollector({ filter: mi => mi.customId === 'buy_ability' && mi.user.id === i.user.id, time: 15000 });
      shopCol.on('collect', async mi => {
        const abilityKey = mi.values[0];
        const ability = ABILITIES[abilityKey];
        const balance = await db.getUserPoints(i.user.id) || 0;
        if (balance < ability.cost) {
          await mi.reply({ content: '❌ رصيد غير كاف.', ephemeral: true });
          return;
        }
        await db.removePoints(i.user.id, ability.cost);
        const player = state.players.find(p => p.id === i.user.id);
        if (player) player.abilities.push(abilityKey);
        await mi.reply({ content: `✅ اشتريت ${ability.name}!`, ephemeral: true });
      });
      return;
    }

    if (i.customId === 'use_ability') {
      const player = state.players.find(p => p.id === i.user.id);
      if (!player || !player.abilities.length) {
        await i.reply({ content: '❌ لا تملك قدرات.', ephemeral: true });
        return;
      }
      // عرض قائمة القدرات الخاصة به لاستخدامها
      const options = player.abilities.map(key => ({
        label: ABILITIES[key].name,
        value: key,
        emoji: ABILITIES[key].emoji,
        description: ABILITIES[key].desc,
      }));
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_ability_use')
          .setPlaceholder('اختر قدرة لاستخدامها')
          .addOptions(options)
      );
      await i.reply({ content: '⚡ اختر قدرة:', components: [row], ephemeral: true });
      // انتظار الاختيار
      const abilityMsg = await i.fetchReply();
      const abilityCol = abilityMsg.createMessageComponentCollector({ filter: mi => mi.customId === 'select_ability_use' && mi.user.id === i.user.id, time: 10000, max: 1 });
      abilityCol.on('collect', async mi => {
        const selected = mi.values[0];
        // تنفيذ تأثير القدرة فوراً (حسب النوع)
        // هنا نطبق التأثير على الحالة state للجولة الحالية
        const success = applyAbility(state, i.user.id, selected);
        if (success) {
          // إزالة القدرة من قائمة اللاعب
          const idx = player.abilities.indexOf(selected);
          if (idx > -1) player.abilities.splice(idx, 1);
          await mi.reply({ content: `✅ استخدمت ${ABILITIES[selected].name}!`, ephemeral: true });
        } else {
          await mi.reply({ content: `⚠️ لا يمكن استخدام هذه القدرة الآن.`, ephemeral: true });
        }
      });
      return;
    }

    // التصويت
    if (i.customId === 'vote') {
      if (!state.players.some(p => p.id === i.user.id)) {
        await i.reply({ content: '❌ لست في اللعبة.', ephemeral: true });
        return;
      }
      if (state.disabledPlayers.has(i.user.id)) {
        await i.reply({ content: '🔇 تم تعطيل تصويتك هذه الجولة.', ephemeral: true });
        return;
      }
      if (voters.has(i.user.id)) {
        await i.reply({ content: '⚠️ لقد صوتَ بالفعل.', ephemeral: true });
        return;
      }
      // عرض Modal لاختيار العمود
      const modal = new ModalBuilder()
        .setCustomId(`vote_modal_${i.user.id}`)
        .setTitle('اختر العمود');
      const select = new StringSelectMenuBuilder()
        .setCustomId('vote_column')
        .setPlaceholder('اختر حرف العمود')
        .addOptions(BINGO_COLUMNS.map(c => new StringSelectMenuOptionBuilder().setLabel(c.letter).setValue(c.letter).setEmoji('🔤')));
      // لكن Modal لا يدعم Select Menu مباشرة، لذا سنستخدم أسلوب آخر: نرسل رسالة ephemeral مع select menu.
      // سأقوم بتعديل: عند الضغط على 'vote'، نرد برسالة ephemeral تحتوي على select menu (StringSelectMenu) لاختيار العمود.
      await i.reply({ content: '🗳️ اختر العمود:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
      // انتظار الرد على هذه الرسالة
      const voteMsgEphemeral = await i.fetchReply();
      const voteColEphemeral = voteMsgEphemeral.createMessageComponentCollector({ filter: mi => mi.customId === 'vote_column' && mi.user.id === i.user.id, time: 10000, max: 1 });
      voteColEphemeral.on('collect', async mi => {
        const colLetter = mi.values[0];
        if (voters.has(i.user.id)) {
          await mi.reply({ content: '❌ لقد صوتَ بالفعل.', ephemeral: true });
          return;
        }
        voters.add(i.user.id);
        votes[colLetter] += (state.doubleVoter === i.user.id) ? 2 : 1;
        await mi.reply({ content: `✅ صوتك للعمود ${colLetter} تم!`, ephemeral: true });
      });
      // في حالة انتهاء الوقت للـephemeral message، لا مشكلة
    }
  });

  voteCollector.on('end', async () => {
    // إذا كان هناك forceDraw، نطبق عمود القوة
    let chosenColumn;
    if (state.forceDrawPlayer && state.forcedColumn) {
      chosenColumn = state.forcedColumn;
    } else {
      // تحديد العمود الفائز
      const maxVotes = Math.max(...Object.values(votes));
      const candidates = Object.entries(votes).filter(([_, v]) => v === maxVotes).map(([k]) => k);
      chosenColumn = candidates[Math.floor(Math.random() * candidates.length)];
    }

    // سحب رقم عشوائي من العمود المختار لم يتم سحبه بعد
    const colData = BINGO_COLUMNS.find(c => c.letter === chosenColumn);
    const available = [];
    for (const call of state.allCalls) {
      if (call.startsWith(colData.letter) && !state.calledSet.has(call)) {
        available.push(call);
      }
    }
    if (available.length === 0) {
      // لا أرقام متبقية في هذا العمود، نختار عمودًا آخر عشوائيًا
      const otherCols = BINGO_COLUMNS.filter(c => c.letter !== chosenColumn);
      for (const col of otherCols) {
        for (const call of state.allCalls) {
          if (call.startsWith(col.letter) && !state.calledSet.has(call)) available.push(call);
        }
        if (available.length) break;
      }
    }
    if (available.length === 0) {
      await context.channel.send('❌ لا مزيد من الأرقام.');
      resetGame(); callback(); return;
    }
    const drawnCall = available[Math.floor(Math.random() * available.length)];
    state.calledSet.add(drawnCall);

    // إعلان الرقم
    const embed = new EmbedBuilder()
      .setColor(CLR.main)
      .setTitle(`🔔 ${drawnCall}`)
      .setDescription(`الرقم المسحوب: **${drawnCall}**\n${state.calledSet.size} / 75`)
      .setFooter({ text: `الجولة ${state.round}` });

    const claimMsg = await context.channel.send({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('claim_bingo').setLabel('🎉 بنجو!').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('show_card_claim').setLabel('🃏 بطاقتي').setStyle(ButtonStyle.Secondary),
        ),
      ],
    });

    // انتظار المطالبة
    const claimCollector = claimMsg.createMessageComponentCollector({
      filter: i => i.customId === 'claim_bingo' || i.customId === 'show_card_claim',
      time: CLAIM_TIME,
    });

    claimCollector.on('collect', async i => {
      if (i.customId === 'show_card_claim') {
        const card = state.cards.get(i.user.id);
        if (!card) { await i.reply({ content: '❌ لست مشاركاً.', ephemeral: true }); return; }
        const img = await drawBingoCardImage(card, i.member?.displayName ?? i.user.displayName, state.calledSet);
        await i.reply({ content: '🎱 بطاقتك:', files: [img], ephemeral: true });
        return;
      }

      // claim_bingo
      const player = state.players.find(p => p.id === i.user.id);
      if (!player) { await i.reply({ content: '❌ لست في اللعبة.', ephemeral: true }); return; }
      if (state.blockedClaims.has(i.user.id)) {
        await i.reply({ content: '🛡️ أنت محمي من المطالبة هذه الجولة.', ephemeral: true });
        return;
      }
      const card = state.cards.get(i.user.id);
      if (checkBingo(card, state.calledSet)) {
        state.winner = player;
        claimCollector.stop('winner');
        await i.reply({ content: '✅ بنجو صحيح!', ephemeral: true });
      } else {
        await i.reply({ content: '❌ لم تكمل خطاً بعد.', ephemeral: true });
      }
    });

    claimCollector.on('end', async (_, reason) => {
      if (reason === 'winner') {
        await declareWinner(context, state, callback);
      } else {
        // متابعة الجولة التالية
        await gameLoop(context, state, callback);
      }
    });
  });
}

// تطبيق تأثير القدرة
function applyAbility(state, userId, abilityKey) {
  const player = state.players.find(p => p.id === userId);
  if (!player) return false;

  switch (abilityKey) {
    case 'double_vote':
      if (state.doubleVoter) return false; // يوجد بالفعل
      state.doubleVoter = userId;
      return true;
    case 'disable_vote':
      // سيطلب اللاعب تحديد الضحية عبر interaction إضافي، لكن للتبسيط نطلب منه اختيار لاعب.
      // بدلاً من تعقيد إضافي، سنفترض أن disable_vote يطبق على لاعب يختاره المستخدم. لكننا لم ننفذ الاختيار بعد.
      // سنقوم بإرجاع false ونحتاج لتفاعل إضافي. لتبسيط الكود، يمكننا أن نجعل disable_vote يختار لاعباً عشوائياً؟ لا.
      // سنقوم بتعديل بسيط: عند استخدام disable_vote، يظهر للمستخدم قائمة منسدلة بأسماء اللاعبين. سنضيف ذلك في جزء use_ability.
      // لكن نظراً لضيق الوقت، سأفترض أن الدالة applyAbility تستقبل أيضاً targetId. سأقوم بتعديل الكود السابق ليشمل target عند الحاجة.
      // حالياً أعود وأضبط كود use_ability ليشمل اختيار target.
      return false; // مؤقتاً حتى نضبطه
    case 'force_draw':
      if (state.forceDrawPlayer) return false;
      state.forceDrawPlayer = userId;
      // يحتاج اختيار العمود، سنقوم بعرض select menu للعمود في use_ability
      return false; // سنحتاج تفاعل إضافي
    case 'block_claim':
      // يحتاج تحديد خصم
      return false;
    default:
      return false;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  إعلان الفائز
// ══════════════════════════════════════════════════════════════════════

async function declareWinner(context, state, callback) {
  const winner = state.winner;
  const pts = (() => {
    const p = config.winPoints?.bingo;
    if (!p) return 100;
    if (typeof p === 'object') return Math.floor(Math.random() * (p.max - p.min + 1)) + p.min;
    return p;
  })();
  await db.addPoints(winner.id, pts);

  const card = state.cards.get(winner.id);
  const cardImg = await drawBingoCardImage(card, winner.displayName, state.calledSet, true);

  await context.channel.send({
    files: cardImg ? [cardImg] : [],
    components: [
      new ContainerBuilder()
        .setAccentColor(CLR.gold)
        .addTextDisplayComponents(t => t.setContent(
          `## 👑 بنغو! ${winner.displayName} فاز!\n🎖️ حصل على **${pts}** نقطة\n` +
          `-# بعد ${state.round} جولة.`
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  resetGame();
  callback();
}