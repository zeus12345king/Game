'use strict';

// ══════════════════════════════════════════════════════════════════════════════
//  💍  لعبة المحبس  —  نسخة احترافية مُعاد بناؤها من الصفر
// ══════════════════════════════════════════════════════════════════════════════
//
//  المراحل لكل جولة:
//  1. HIDE    — الفريق المخبي يتسلم المحبس سراً عبر Ephemeral
//  2. BLUFF   — كل لاعب في الفريق المخبي يختار إيماءة يد (تشويش بصري)
//  3. REVEAL  — تُعرض الإيماءات للجميع علناً + توتر
//  4. DISCUSS — الفريق المخمن يناقش 30 ثانية
//  5. GUESS   — عدد المحاولات يعتمد على حجم الفريق المُخفي
//  6. RESULT  — كشف النتيجة بصرياً
//
//  بطاقات خاصة (Power Cards) — مرة واحدة طوال اللعبة لكل فريق:
//  🔍 تحقيق  — تكشف إيماءة لاعب واحد بشكل حقيقي (مخفية أو ظاهرة)
//  🔄 تبديل  — الفريق المخبي يعيد تمرير المحبس سراً بين أعضائه
//  ⏱️ ضغط    — يضيف 20 ثانية لوقت التخمين (للفريق المخمن)
//
// ══════════════════════════════════════════════════════════════════════════════

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  AttachmentBuilder,
} = require('discord.js');

const db     = require('../database.js');
const config = require('../config.js');
const path   = require('path');

// ─── Canvas اختياري ───────────────────────────────────────────────────────
let createCanvas, loadImage, GlobalFonts;
try { ({ createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas')); } catch (_) {}

// ══════════════════════════════════════════════════════════════════════════════
//  ثوابت
// ══════════════════════════════════════════════════════════════════════════════

const MAX_PER_TEAM  = 8;
const MIN_PER_TEAM  = 2;
const TOTAL_ROUNDS  = 8;
const LOBBY_TIME    = config.lobbyTime?.mahbas ?? 60_000;

const T_HIDE        = 22_000;   // وقت الإخفاء السري
const T_BLUFF       = 18_000;   // وقت اختيار الإيماءة
const T_DISCUSS     = 30_000;   // وقت النقاش
const T_GUESS       = 25_000;   // وقت التخمين
const T_POWER_EXTRA = 20_000;   // إضافة وقت ببطاقة ضغط

// نقاط
const PTS_GUESS_1ST = 2;        // تخمين صحيح أول مرة
const PTS_GUESS_2ND = 1;        // تخمين صحيح ثاني مرة
const PTS_HIDE_WIN  = 3;        // فشل التخمين = نقاط للمخبي

// الإيماءات
const GESTURES = [
  { id: 'fist',    emoji: '✊', label: 'قبضة'    },
  { id: 'open',    emoji: '🖐️', label: 'مفتوحة'  },
  { id: 'cross',   emoji: '🤞', label: 'متشابكة' },
  { id: 'point',   emoji: '☝️', label: 'إشارة'   },
  { id: 'pinch',   emoji: '🤌', label: 'قرصة'    },
];

// ألوان
const CLR = {
  gold   : 0xF5C518,
  red    : 0xE84040,
  blue   : 0x3498DB,
  green  : 0x2ECC71,
  purple : 0x8E44AD,
  dark   : 0x1A1A2E,
  warn   : 0xE67E22,
  silver : 0xBDC3C7,
};

// ══════════════════════════════════════════════════════════════════════════════
//  حالة اللعبة
// ══════════════════════════════════════════════════════════════════════════════

let GAME_ACTIVE = false;

// ══════════════════════════════════════════════════════════════════════════════
//  تصدير الأمر
// ══════════════════════════════════════════════════════════════════════════════

module.exports = {
  name    : 'محبس',
  aliases : ['mahbas', 'ring'],

  async execute(message, args, callback) {
    if (GAME_ACTIVE) {
      await message.reply({
        components: [
          new ContainerBuilder().setAccentColor(CLR.red)
            .addTextDisplayComponents(t => t.setContent(
              '### ⛔ لعبة جارية!\nانتظر انتهاء الجولة الحالية.',
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

// ══════════════════════════════════════════════════════════════════════════════
//  أدوات مساعدة
// ══════════════════════════════════════════════════════════════════════════════

const sleep     = ms => new Promise(r => setTimeout(r, ms));
const resetGame = ()  => { GAME_ACTIVE = false; };
const rnd       = arr => arr[Math.floor(Math.random() * arr.length)];

/**
 * إرسال رسالة خاصة (DM) للاعب مع أزرار تفاعلية
 * تُرجع كائن الرسالة لاستخدامه في الـ Collector
 */
async function sendDM(client, player, content, components = []) {
  try {
    const user = await client.users.fetch(player.id);
    const msg = await user.send({ content, components });
    return msg;
  } catch (e) {
    console.error(`[Mahbas] فشل إرسال DM لـ ${player.id}:`, e);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Canvas — لوحة الجولة
// ══════════════════════════════════════════════════════════════════════════════

async function buildRoundCanvas({ round, scoreA, scoreB, totalRounds, phase, teamAName, teamBName, hidingTeamIdx }) {
  if (!createCanvas) return null;
  try {
    if (GlobalFonts) {
      try { GlobalFonts.registerFromPath(path.resolve(__dirname, '../img/Fonts/IBMBold.ttf'), 'IBM'); } catch (_) {}
    }
    const FONT = GlobalFonts?.has?.('IBM') ? 'IBM' : 'sans-serif';

    const W = 900, H = 380;
    const cv  = createCanvas(W, H);
    const ctx = cv.getContext('2d');

    // ── خلفية فاخرة ──
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0,   '#0a0a14');
    bg.addColorStop(0.5, '#12101e');
    bg.addColorStop(1,   '#0a0a14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // نمط نقاط ذهبية
    ctx.fillStyle = 'rgba(245,197,24,0.04)';
    for (let x = 0; x < W; x += 32) {
      for (let y = 0; y < H; y += 32) {
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // خط ذهبي علوي
    const topLine = ctx.createLinearGradient(0, 0, W, 0);
    topLine.addColorStop(0,   'transparent');
    topLine.addColorStop(0.3, '#F5C518');
    topLine.addColorStop(0.7, '#F5C518');
    topLine.addColorStop(1,   'transparent');
    ctx.fillStyle = topLine;
    ctx.fillRect(0, 0, W, 3);
    ctx.fillRect(0, H - 3, W, 3);

    // ── الخاتم في المنتصف ──
    const cx = W / 2, cy = H / 2;
    // دائرة توهج
    const glowGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 90);
    glowGrad.addColorStop(0,   'rgba(245,197,24,0.2)');
    glowGrad.addColorStop(0.6, 'rgba(245,197,24,0.05)');
    glowGrad.addColorStop(1,   'transparent');
    ctx.fillStyle = glowGrad;
    ctx.beginPath(); ctx.arc(cx, cy, 90, 0, Math.PI * 2); ctx.fill();

    // رسم الخاتم
    ctx.strokeStyle = '#F5C518';
    ctx.lineWidth   = 14;
    ctx.shadowColor = '#F5C518';
    ctx.shadowBlur  = 25;
    ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = '#fff8dc';
    ctx.lineWidth   = 4;
    ctx.shadowBlur  = 0;
    ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2); ctx.stroke();

    // فص الخاتم
    const gemGrad = ctx.createRadialGradient(cx, cy - 30, 2, cx, cy - 30, 14);
    gemGrad.addColorStop(0, '#fff');
    gemGrad.addColorStop(0.4, '#a8e6f0');
    gemGrad.addColorStop(1, '#1a6b8a');
    ctx.fillStyle = gemGrad;
    ctx.beginPath(); ctx.arc(cx, cy - 30, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#F5C518'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy - 30, 14, 0, Math.PI * 2); ctx.stroke();

    // ── فريق A (يسار) ──
    const phaseTxt = phase === 'hide' ? '🫴 يخبي' : phase === 'bluff' ? '🤌 يخدع' : '🤫 ينتظر';
    const guessPh  = phase === 'discuss' ? '💬 يناقش' : phase === 'guess' ? '🔍 يخمن' : '👀 يراقب';

    const drawTeamPanel = (x, name, score, isHiding, phaseLabel, align) => {
      const panelW = 220, panelH = 180;
      const px = align === 'left' ? x : x - panelW;
      const py = (H - panelH) / 2;

      // خلفية الفريق
      const panelGrad = ctx.createLinearGradient(px, py, px + panelW, py + panelH);
      if (isHiding) {
        panelGrad.addColorStop(0, 'rgba(245,197,24,0.12)');
        panelGrad.addColorStop(1, 'rgba(245,197,24,0.04)');
      } else {
        panelGrad.addColorStop(0, 'rgba(52,152,219,0.12)');
        panelGrad.addColorStop(1, 'rgba(52,152,219,0.04)');
      }
      ctx.fillStyle = panelGrad;
      ctx.roundRect(px, py, panelW, panelH, 12);
      ctx.fill();

      // حدود
      ctx.strokeStyle = isHiding ? 'rgba(245,197,24,0.5)' : 'rgba(52,152,219,0.5)';
      ctx.lineWidth   = 1.5;
      ctx.roundRect(px, py, panelW, panelH, 12);
      ctx.stroke();

      // اسم الفريق
      ctx.font         = `bold 20px ${FONT}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = isHiding ? '#F5C518' : '#3498DB';
      ctx.shadowColor  = isHiding ? '#F5C518' : '#3498DB';
      ctx.shadowBlur   = 12;
      ctx.fillText(name, px + panelW / 2, py + 28);
      ctx.shadowBlur   = 0;

      // النقاط
      ctx.font      = `bold 68px ${FONT}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(String(score), px + panelW / 2, py + 100);

      // حالة
      ctx.font      = `18px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(phaseLabel, px + panelW / 2, py + 155);
    };

    const isAHiding = hidingTeamIdx === 0;
    drawTeamPanel(35,    teamAName, scoreA, isAHiding,  isAHiding ? phaseTxt : guessPh, 'left');
    drawTeamPanel(W - 35, teamBName, scoreB, !isAHiding, !isAHiding ? phaseTxt : guessPh, 'right');

    // ── شريط الجولة (أسفل) ──
    const barY    = H - 38;
    const progW   = W - 120;
    const progress = (round - 1) / totalRounds;

    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.roundRect(60, barY, progW, 12, 6); ctx.fill();

    const barGrad = ctx.createLinearGradient(60, 0, 60 + progW * progress, 0);
    barGrad.addColorStop(0, '#F5C518');
    barGrad.addColorStop(1, '#e67e22');
    ctx.fillStyle   = barGrad;
    ctx.shadowColor = '#F5C518';
    ctx.shadowBlur  = 8;
    ctx.roundRect(60, barY, progW * progress, 12, 6); ctx.fill();
    ctx.shadowBlur  = 0;

    ctx.font      = `bold 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`الجولة ${round} / ${totalRounds}`, W / 2, barY - 12);

    // ── رقم الجولة على الخاتم ──
    ctx.font      = `bold 28px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F5C518';
    ctx.shadowColor = '#F5C518'; ctx.shadowBlur = 15;
    ctx.fillText(`${round}`, cx, cy + 22);
    ctx.shadowBlur = 0;

    return new AttachmentBuilder(cv.toBuffer('image/png'), { name: 'mahbas_round.png' });
  } catch (e) {
    console.error('[Mahbas] Canvas error:', e);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  مرحلة الاستقبال (Lobby)
// ══════════════════════════════════════════════════════════════════════════════

async function runLobby(context, callback) {
  let teamA = [], teamB = [];

  const buildLobby = () => {
    const deadline = Math.floor(Date.now() / 1000) + Math.floor(LOBBY_TIME / 1000);
    const fmtTeam  = (t, name, color) => {
      const bar  = '█'.repeat(Math.round((t.length / MAX_PER_TEAM) * 8)) + '░'.repeat(8 - Math.round((t.length / MAX_PER_TEAM) * 8));
      const list = t.length
        ? t.map((p, i) => `> \`${String(i + 1).padStart(2, '0')}\` <@${p.id}>`).join('\n')
        : '> *لا يوجد لاعبون بعد*';
      return `${color} **${name}** \`${t.length}/${MAX_PER_TEAM}\` \`${bar}\`\n${list}`;
    };

    const c = new ContainerBuilder().setAccentColor(CLR.gold)
      .addTextDisplayComponents(t => t.setContent(
        `## 💍 لعبة المحبس\n` +
        `> *لعبة التشويش والذكاء — من يكشف صاحب المحبس؟*\n\n` +
        `⏰ ينتهي الانضمام: <t:${deadline}:R>\n\n` +
        `${fmtTeam(teamA, 'الفريق الأول', '🔴')}\n\n` +
        `${fmtTeam(teamB, 'الفريق الثاني', '🔵')}\n\n` +
        `-# كل فريق يحتاج ${MIN_PER_TEAM}–${MAX_PER_TEAM} لاعبين`,
      ));

    const img = config.lobbyImages?.mahbas;
    if (img) c.addMediaGalleryComponents(g => g.addItems(i => i.setURL(img)));

    c.addActionRowComponents(r => r.setComponents(
      new ButtonBuilder().setCustomId('join_a').setLabel('🔴 الفريق الأول').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('join_b').setLabel('🔵 الفريق الثاني').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('leave').setLabel('خروج').setStyle(ButtonStyle.Secondary),
    ));
    return c;
  };

  const lobbyMsg = await context.reply({
    components: [buildLobby()],
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true,
  });

  const col = lobbyMsg.createMessageComponentCollector({
    filter: i => ['join_a', 'join_b', 'leave'].includes(i.customId),
    time: LOBBY_TIME,
  });

  col.on('collect', async i => {
    const { id, displayName } = i.user;
    const playerData = {
      id,
      displayName : i.member?.displayName ?? displayName,
      avatarURL   : i.user.displayAvatarURL({ extension: 'png', forceStatic: true }),
    };

    const inA = teamA.some(p => p.id === id);
    const inB = teamB.some(p => p.id === id);

    if (i.customId === 'join_a') {
      if (inA) { await i.reply({ content: '✅ أنت في الفريق الأول بالفعل!', flags: MessageFlags.Ephemeral }); return; }
      if (inB) { await i.reply({ content: '⚠️ أنت في الفريق الثاني — اضغط خروج أولاً.', flags: MessageFlags.Ephemeral }); return; }
      if (teamA.length >= MAX_PER_TEAM) { await i.reply({ content: '⚠️ الفريق الأول ممتلئ!', flags: MessageFlags.Ephemeral }); return; }
      teamA.push(playerData);
    } else if (i.customId === 'join_b') {
      if (inB) { await i.reply({ content: '✅ أنت في الفريق الثاني بالفعل!', flags: MessageFlags.Ephemeral }); return; }
      if (inA) { await i.reply({ content: '⚠️ أنت في الفريق الأول — اضغط خروج أولاً.', flags: MessageFlags.Ephemeral }); return; }
      if (teamB.length >= MAX_PER_TEAM) { await i.reply({ content: '⚠️ الفريق الثاني ممتلئ!', flags: MessageFlags.Ephemeral }); return; }
      teamB.push(playerData);
    } else {
      teamA = teamA.filter(p => p.id !== id);
      teamB = teamB.filter(p => p.id !== id);
    }

    await i.update({ components: [buildLobby()], flags: MessageFlags.IsComponentsV2 });
  });

  col.on('end', async () => {
    try {
      await lobbyMsg.edit({
        components: [
          new ContainerBuilder().setAccentColor(CLR.dark)
            .addTextDisplayComponents(t => t.setContent(
              `### 🔒 انتهى الانضمام\n` +
              `🔴 الفريق الأول: ${teamA.map(p => `<@${p.id}>`).join(' ') || 'لا يوجد'}\n` +
              `🔵 الفريق الثاني: ${teamB.map(p => `<@${p.id}>`).join(' ') || 'لا يوجد'}`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (_) {}

    if (teamA.length < MIN_PER_TEAM || teamB.length < MIN_PER_TEAM) {
      await context.channel.send({
        components: [
          new ContainerBuilder().setAccentColor(CLR.red)
            .addTextDisplayComponents(t => t.setContent(
              `### ❌ عدد غير كافٍ\nيحتاج كل فريق **${MIN_PER_TEAM} لاعبين** على الأقل.\n` +
              `🔴 ${teamA.length} | 🔵 ${teamB.length}`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      resetGame(); callback(); return;
    }

    // بدء اللعبة
    const state = {
      teamA, teamB,
      scoreA     : 0,
      scoreB     : 0,
      round      : 0,
      totalRounds: TOTAL_ROUNDS,
      // بطاقات خاصة (مرة واحدة لكل فريق طوال اللعبة)
      powersA    : { reveal: true, swap: true, time: true },
      powersB    : { reveal: true, swap: true, time: true },
      teamAName  : '🔴 الفريق الأول',
      teamBName  : '🔵 الفريق الثاني',
    };

    await context.channel.send({
      components: [
        new ContainerBuilder().setAccentColor(CLR.gold)
          .addTextDisplayComponents(t => t.setContent(
            `## 💍 بدأت لعبة المحبس!\n\n` +
            `**الفريق الأول 🔴**\n${teamA.map(p => `> <@${p.id}>`).join('\n')}\n\n` +
            `**الفريق الثاني 🔵**\n${teamB.map(p => `> <@${p.id}>`).join('\n')}\n\n` +
            `### 📜 قواعد سريعة\n` +
            `> 💍 الفريق المخبي يخفي المحبس في يد أحد أعضائه سراً\n` +
            `> 🤌 الجميع يختارون إيماءة يد لإرباك الفريق الخصم\n` +
            `> 🔍 الفريق المخمن يملك **محاولات حسب حجم الفريق المخفي**\n` +
            `> 🛡️ فشل التخمين = **${PTS_HIDE_WIN} نقاط** للفريق المخبي\n` +
            `> ✨ كل فريق يملك **3 بطاقات خاصة** تُستخدم مرة واحدة فقط!\n\n` +
            `-# ${TOTAL_ROUNDS} جولات — أعلى نقطة يفوز!`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    await sleep(5000);
    await gameLoop(context, state, callback);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  الحلقة الرئيسية للعبة
// ══════════════════════════════════════════════════════════════════════════════

async function gameLoop(context, state, callback) {
  if (state.round >= state.totalRounds) {
    await finalResults(context, state, callback);
    return;
  }

  state.round += 1;

  // تحديد من يخبي ومن يخمن (تتناوب كل جولة)
  const hidingIdx   = (state.round - 1) % 2;          // 0 = A, 1 = B
  const hidingTeam  = hidingIdx === 0 ? state.teamA : state.teamB;
  const guessingTeam = hidingIdx === 0 ? state.teamB : state.teamA;
  const hidingName  = hidingIdx === 0 ? state.teamAName : state.teamBName;
  const guessingName = hidingIdx === 0 ? state.teamBName : state.teamAName;
  const hidingPowers = hidingIdx === 0 ? state.powersA : state.powersB;
  const guessPowers  = hidingIdx === 0 ? state.powersB : state.powersA;

  // ── لوحة الجولة ──
  const canvas = await buildRoundCanvas({
    round        : state.round,
    scoreA       : state.scoreA,
    scoreB       : state.scoreB,
    totalRounds  : state.totalRounds,
    phase        : 'hide',
    teamAName    : state.teamAName,
    teamBName    : state.teamBName,
    hidingTeamIdx: hidingIdx,
  });

  const roundHeader = {
    components: [
      new ContainerBuilder().setAccentColor(CLR.gold)
        .addTextDisplayComponents(t => t.setContent(
          `## 💍 الجولة ${state.round} / ${state.totalRounds}\n\n` +
          `📊 **${state.teamAName} ${state.scoreA}** — **${state.scoreB} ${state.teamBName}**\n\n` +
          `🫴 **${hidingName}** يخبي المحبس\n` +
          `🔍 **${guessingName}** يخمن`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
  if (canvas) roundHeader.files = [canvas];
  await context.channel.send(roundHeader);
  await sleep(2000);

  // ══ 1. مرحلة الإخفاء ════════════════════════════════════════════════
  const holder = await runHidePhase(context, hidingTeam, hidingName, hidingPowers, state);

  // ══ 2. مرحلة الإيماءات ══════════════════════════════════════════════
  const gestures = await runBluffPhase(context, hidingTeam, hidingName, holder);

  // ══ 3. كشف الإيماءات ════════════════════════════════════════════════
  await revealGestures(context, hidingTeam, gestures, hidingName, guessingName);

  // ══ 4. البطاقة الخاصة (قبل التخمين) ════════════════════════════════
  let extraTime = 0;
  let revealedGesture = null;

  const powerResult = await offerPowerCard(
    context, guessingTeam, guessPowers, guessingName,
    hidingTeam, gestures, holder,
  );
  if (powerResult.type === 'time')    extraTime       = T_POWER_EXTRA;
  if (powerResult.type === 'reveal')  revealedGesture = powerResult.data;

  // عرض كشف الإيماءة الحقيقية (إذا استخدموا بطاقة التحقيق)
  if (revealedGesture) {
    await context.channel.send({
      components: [
        new ContainerBuilder().setAccentColor(CLR.purple)
          .addTextDisplayComponents(t => t.setContent(
            `### 🔍 نتيجة بطاقة التحقيق\n\n` +
            `<@${revealedGesture.player.id}> (${revealedGesture.player.displayName}) يحمل فعلاً:\n\n` +
            `## ${revealedGesture.gesture.emoji} ${revealedGesture.gesture.label}\n\n` +
            `-# هل هذا يساعدكم في التخمين؟ 🤔`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
    await sleep(3000);
  }

  // ══ 5. مرحلة التخمين ════════════════════════════════════════════════
  const totalGuessTime = T_GUESS + extraTime;
  const guessResult = await runGuessPhase(
    context, guessingTeam, hidingTeam, guessingName, hidingName, holder, totalGuessTime,
  );

  // ══ 6. نتيجة الجولة ═════════════════════════════════════════════════
  const addedPts = await roundResult(context, state, guessResult, hidingIdx, holder, hidingName, guessingName);

  // بطاقة تبديل المخبي؟ (للفريق المخبي قبل الجولة التالية — لا تؤثر على هذه الجولة)
  // لا حاجة — يُستخدم في بداية مرحلة الإخفاء

  await sleep(4000);
  await gameLoop(context, state, callback);
}

// ══════════════════════════════════════════════════════════════════════════════
//  1. مرحلة الإخفاء السري
// ══════════════════════════════════════════════════════════════════════════════

async function runHidePhase(context, hidingTeam, hidingName, hidingPowers, state) {
  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.warn)
        .addTextDisplayComponents(t => t.setContent(
          `## 🫴 مرحلة الإخفاء\n\n` +
          `**${hidingName}** — ستصل رسالة سرية لكل عضو!\n` +
          `📱 صاحب المحبس يؤكد استلامه سراً.\n` +
          `🎭 الجميع يرون نفس الرسالة — الخصم لا يعرف من وافق!\n\n` +
          `-# ⏰ ${T_HIDE / 1000} ثانية`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  // اختر حامل المحبس عشوائياً (لا يعرفه أحد إلا هو)
  let actualHolder = rnd(hidingTeam);

  // إذا استخدموا بطاقة التبديل — يُعاد الاختيار
  if (hidingPowers.swap) {
    // عرض خيار البطاقة للفريق المخبي
    const swapUsed = await offerSwapCard(context, hidingTeam, hidingName, hidingPowers);
    if (swapUsed) actualHolder = rnd(hidingTeam); // إعادة اختيار عشوائي جديد
  }

  // إرسال رسائل خاصة عبر DM لكل عضو
  const confirmButtons = (playerId) => [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_hold_${playerId}`)
        .setLabel('💍 أنا أحمل المحبس')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`confirm_empty_${playerId}`)
        .setLabel('🤲 يدي فارغة')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  const confirmPromises = hidingTeam.map(async (player) => {
    const isHolder = player.id === actualHolder.id;
    const content = isHolder
      ? `## 💍 أنت تحمل المحبس!\nاضغط الزر للتأكيد سراً — الخصم لا يرى ردودكم.`
      : `## 🤲 يدك فارغة.\nاضغط أي زر للتمثيل — الخصم لا يرى ردودكم.`;

    const msg = await sendDM(context.client, player, content, confirmButtons(player.id));
    if (!msg) return;

    // جامع يتيح للأزرار أن تعمل وتُعطي ردًا
    const collector = msg.createMessageComponentCollector({
      filter: i => i.customId.startsWith('confirm_') && i.user.id === player.id,
      time: T_HIDE,
      max: 1,
    });

    collector.on('collect', async i => {
      await i.update({
        content: '✅ تم التأكيد.',
        components: [],
      });
    });
  });

  await Promise.allSettled(confirmPromises);

  // انتظر T_HIDE لإعطاء إيهام الاختيار
  await sleep(T_HIDE);

  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.green)
        .addTextDisplayComponents(t => t.setContent(
          `### ✅ تم إخفاء المحبس!\n**${hidingName}** جاهز — الإيماءات تبدأ الآن...`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(1500);
  return actualHolder;
}

// ══════════════════════════════════════════════════════════════════════════════
//  عرض بطاقة التبديل (للفريق المخبي)
// ══════════════════════════════════════════════════════════════════════════════

async function offerSwapCard(context, hidingTeam, hidingName, hidingPowers) {
  if (!hidingPowers.swap) return false;

  // اعرض عرض بطاقة التبديل للقائد فقط
  const leader = hidingTeam[0];

  const offerMsg = await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.purple)
        .addTextDisplayComponents(t => t.setContent(
          `### 🔄 بطاقة التبديل — ${hidingName}\n` +
          `<@${leader.id}> هل تريد استخدام بطاقة **التبديل**؟\n` +
          `> تعيد توزيع المحبس سراً — يُربك خطة الخصم!\n\n` +
          `-# ⏰ 10 ثوانٍ للقرار`,
        ))
        .addActionRowComponents(r => r.setComponents(
          new ButtonBuilder().setCustomId('use_swap').setLabel('🔄 استخدم التبديل').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('skip_swap').setLabel('تجاوز').setStyle(ButtonStyle.Secondary),
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  return new Promise(resolve => {
    const col = offerMsg.createMessageComponentCollector({
      filter: i => i.user.id === leader.id && (i.customId === 'use_swap' || i.customId === 'skip_swap'),
      time: 10_000, max: 1,
    });
    col.on('collect', async i => {
      const used = i.customId === 'use_swap';
      if (used) hidingPowers.swap = false;
      await i.update({
        components: [
          new ContainerBuilder().setAccentColor(used ? CLR.purple : CLR.dark)
            .addTextDisplayComponents(t => t.setContent(
              used ? `### 🔄 تم استخدام بطاقة التبديل!\nتم إعادة توزيع المحبس سراً.` : `تم التجاوز.`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      resolve(used);
    });
    col.on('end', c => { if (c.size === 0) resolve(false); });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  2. مرحلة الإيماءات (Bluff)
// ══════════════════════════════════════════════════════════════════════════════

async function runBluffPhase(context, hidingTeam, hidingName, holder) {
  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.purple)
        .addTextDisplayComponents(t => t.setContent(
          `## 🤌 مرحلة التشويش\n\n` +
          `**${hidingName}** — كل عضو يختار إيماءة يد!\n` +
          `> صاحب المحبس يختار بحرية — اربك الخصم!\n` +
          `> بقية الفريق يختار إيماءات وهمية لإرباك التخمين.\n\n` +
          `-# ⏰ ${T_BLUFF / 1000} ثانية`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  // إرسال رسائل خاصة لكل عضو مع أزرار اختيار الإيماءة، وجمع اختياراتهم
  const gestureButtons = (playerId) => {
    const rows = [];
    for (let i = 0; i < GESTURES.length; i += 3) {
      const row = new ActionRowBuilder();
      GESTURES.slice(i, i + 3).forEach(g => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`gest_${playerId}_${g.id}`)
            .setLabel(`${g.emoji} ${g.label}`)
            .setStyle(ButtonStyle.Secondary),
        );
      });
      rows.push(row);
    }
    return rows;
  };

  // تخزين الإيماءات المختارة (أو null إن لم يُختر)
  const chosenGestures = {};

  const gesturePromises = hidingTeam.map(async (player) => {
    const msg = await sendDM(context.client, player, `## 🤌 اختر إيماءة يدك!\nالخصم سيراها — اربكهم!`, gestureButtons(player.id));
    if (!msg) return;

    const collector = msg.createMessageComponentCollector({
      filter: i => i.customId.startsWith(`gest_${player.id}_`) && i.user.id === player.id,
      time: T_BLUFF,
      max: 1,
    });

    collector.on('collect', async i => {
      const gestureId = i.customId.replace(`gest_${player.id}_`, '');
      const gesture = GESTURES.find(g => g.id === gestureId);
      chosenGestures[player.id] = gesture;

      await i.update({
        content: `✅ تم اختيار: ${gesture.emoji} ${gesture.label}`,
        components: [],
      });
    });

    collector.on('end', () => {
      if (!chosenGestures[player.id]) {
        // لم يختر → عشوائي
        chosenGestures[player.id] = rnd(GESTURES);
      }
    });
  });

  await Promise.allSettled(gesturePromises);
  await sleep(T_BLUFF);

  // تأكد أن جميع اللاعبين لديهم إيماءة (حتى لو تعذر الإرسال)
  for (const player of hidingTeam) {
    if (!chosenGestures[player.id]) {
      chosenGestures[player.id] = rnd(GESTURES);
    }
  }

  return chosenGestures;
}

// ══════════════════════════════════════════════════════════════════════════════
//  3. كشف الإيماءات للجميع
// ══════════════════════════════════════════════════════════════════════════════

async function revealGestures(context, hidingTeam, gestures, hidingName, guessingName) {
  const gestureList = hidingTeam
    .map(p => `> **${p.displayName}** — ${gestures[p.id].emoji} ${gestures[p.id].label}`)
    .join('\n');

  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.purple)
        .addTextDisplayComponents(t => t.setContent(
          `## 🎭 إيماءات ${hidingName}\n\n` +
          `${gestureList}\n\n` +
          `---\n` +
          `**${guessingName}** — هل تستطيعون كشف من يحمل المحبس؟\n` +
          `-# 💬 لديكم ${T_DISCUSS / 1000} ثانية للنقاش ثم التخمين!`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(2000);
}

// ══════════════════════════════════════════════════════════════════════════════
//  عرض البطاقات الخاصة (للفريق المخمن)
// ══════════════════════════════════════════════════════════════════════════════

async function offerPowerCard(context, guessingTeam, guessPowers, guessingName, hidingTeam, gestures, holder) {
  const available = [];
  if (guessPowers.reveal) available.push('reveal');
  if (guessPowers.time)   available.push('time');
  if (!available.length)  return { type: 'none' };

  const leader = guessingTeam[0];

  const btns = new ActionRowBuilder();
  if (guessPowers.reveal) btns.addComponents(
    new ButtonBuilder().setCustomId('power_reveal').setLabel('🔍 تحقيق (اكشف إيماءة حقيقية)').setStyle(ButtonStyle.Primary),
  );
  if (guessPowers.time) btns.addComponents(
    new ButtonBuilder().setCustomId('power_time').setLabel(`⏱️ وقت إضافي (+${T_POWER_EXTRA / 1000}s)`).setStyle(ButtonStyle.Success),
  );
  btns.addComponents(
    new ButtonBuilder().setCustomId('power_skip').setLabel('تجاوز').setStyle(ButtonStyle.Secondary),
  );

  const offerMsg = await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.purple)
        .addTextDisplayComponents(t => t.setContent(
          `### ✨ البطاقات الخاصة — ${guessingName}\n` +
          `<@${leader.id}> هل تستخدم بطاقة خاصة قبل التخمين؟\n\n` +
          `${guessPowers.reveal ? '> 🔍 **تحقيق** — يكشف الإيماءة الحقيقية للاعب واحد\n' : ''}` +
          `${guessPowers.time   ? `> ⏱️ **وقت إضافي** — +${T_POWER_EXTRA / 1000} ثانية للتخمين\n` : ''}` +
          `-# ⏰ 12 ثانية للقرار`,
        ))
        .addActionRowComponents(r => {
          btns.components.forEach(b => r.addComponents(b));
          return r;
        }),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  return new Promise(resolve => {
    const col = offerMsg.createMessageComponentCollector({
      filter: i => i.user.id === leader.id && i.customId.startsWith('power_'),
      time: 12_000, max: 1,
    });

    col.on('collect', async i => {
      await i.deferUpdate();

      if (i.customId === 'power_reveal') {
        guessPowers.reveal = false;
        // اختر لاعب عشوائي من الفريق المخبي لكشف إيماءته الحقيقية
        const target = rnd(hidingTeam);
        const realGesture = gestures[target.id];

        try {
          await offerMsg.edit({
            components: [
              new ContainerBuilder().setAccentColor(CLR.purple)
                .addTextDisplayComponents(t => t.setContent(`### 🔍 جاري الكشف...`)),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch (_) {}

        resolve({ type: 'reveal', data: { player: target, gesture: realGesture } });
      } else if (i.customId === 'power_time') {
        guessPowers.time = false;
        try {
          await offerMsg.edit({
            components: [
              new ContainerBuilder().setAccentColor(CLR.green)
                .addTextDisplayComponents(t => t.setContent(`### ⏱️ تم إضافة ${T_POWER_EXTRA / 1000} ثانية!`)),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch (_) {}
        resolve({ type: 'time' });
      } else {
        try {
          await offerMsg.edit({
            components: [
              new ContainerBuilder().setAccentColor(CLR.dark)
                .addTextDisplayComponents(t => t.setContent(`تم التجاوز.`)),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch (_) {}
        resolve({ type: 'none' });
      }
    });

    col.on('end', c => {
      if (c.size === 0) resolve({ type: 'none' });
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  4. مرحلة التخمين (عدد محاولات متغير حسب حجم الفريق المخفي)
// ══════════════════════════════════════════════════════════════════════════════

async function runGuessPhase(context, guessingTeam, hidingTeam, guessingName, hidingName, holder, totalTime) {
  // ── تحديد عدد المحاولات بناءً على عدد لاعبي الفريق المخفي ──
  const maxAttempts = hidingTeam.length === 2 ? 1 : hidingTeam.length >= 8 ? 3 : 2;

  // ── مرحلة النقاش ──
  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.blue)
        .addTextDisplayComponents(t => t.setContent(
          `## 💬 وقت النقاش — ${guessingName}\n\n` +
          `ناقشوا بينكم من يحمل المحبس!\n` +
          `لديكم **${T_DISCUSS / 1000} ثانية** للنقاش قبل التخمين.\n` +
          `عدد المحاولات المتاحة: **${maxAttempts}**\n\n` +
          `-# اللاعبون: ${guessingTeam.map(p => `<@${p.id}>`).join(' ')}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(T_DISCUSS);

  // ── التخمين: عدد المحاولات حسب maxAttempts ──
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // حساب النقاط: الأولى 2 نقطة، الباقي (ثانية، ثالثة) 1 نقطة
    const pts = attempt === 1 ? PTS_GUESS_1ST : PTS_GUESS_2ND;

    // الوقت المتبقي: الأولى كامل، الثانية 60%، الثالثة (إن وجدت) 40%
    const guessTimeLeft = attempt === 1
      ? totalTime
      : attempt === 2
        ? Math.floor(totalTime * 0.6)
        : Math.floor(totalTime * 0.4);

    // بناء أزرار الفريق المخبي
    const btnRows = buildPlayerButtons(hidingTeam, `guess${attempt}`);

    // إرسال رسالة النص (ContainerBuilder) لوحدها
    await context.channel.send({
      components: [
        new ContainerBuilder().setAccentColor(attempt === 1 ? CLR.gold : CLR.warn)
          .addTextDisplayComponents(t => t.setContent(
            `## 🔍 المحاولة ${attempt} / ${maxAttempts}\n\n` +
            `${guessingName} — اختاروا من يحمل المحبس!\n` +
            `> 🏆 الإجابة الصحيحة = **${pts} نقطة**\n` +
            `> ⏰ ${guessTimeLeft / 1000} ثانية\n\n` +
            `-# ${guessingTeam.map(p => `<@${p.id}>`).join(' ')} — أي فرد يستطيع التخمين`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    // إرسال رسالة منفصلة مع الأزرار فقط
    const guessControls = await context.channel.send({
      components: btnRows,
    });

    const chosen = await new Promise(resolve => {
      const col = guessControls.createMessageComponentCollector({
        filter: i =>
          i.customId.startsWith(`guess${attempt}_`) &&
          guessingTeam.some(p => p.id === i.user.id),
        time: guessTimeLeft,
        max: 1,
      });
      col.on('collect', async i => {
        const targetId = i.customId.replace(`guess${attempt}_`, '');
        try { await i.deferUpdate(); } catch (_) {}
        resolve({ guesser: i.user, targetId });
      });
      col.on('end', c => { if (c.size === 0) resolve(null); });
    });

    // أغلق الأزرار
    try {
      await guessControls.edit({
        components: btnRows.map(row => {
          row.components.forEach(b => b.setDisabled(true));
          return row;
        }),
      });
    } catch (_) {}

    if (!chosen) {
      await context.channel.send({
        components: [
          new ContainerBuilder().setAccentColor(CLR.dark)
            .addTextDisplayComponents(t => t.setContent(
              `⏰ انتهى وقت المحاولة ${attempt} — لم يتم الاختيار.`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      if (attempt === maxAttempts) return { success: false, attempt: 0, guesser: null };
      continue;
    }

    const correct = chosen.targetId === holder.id;

    // تأثير درامي قبل الكشف
    await context.channel.send({
      components: [
        new ContainerBuilder().setAccentColor(CLR.purple)
          .addTextDisplayComponents(t => t.setContent(
            `### ⏳ <@${chosen.guesser.id}> اختار <@${chosen.targetId}>...\n-# يا ترى...`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    await sleep(3000);

    if (correct) {
      return { success: true, attempt, guesser: chosen.guesser };
    } else {
      await context.channel.send({
        components: [
          new ContainerBuilder().setAccentColor(CLR.red)
            .addTextDisplayComponents(t => t.setContent(
              `## ❌ خطأ!\n` +
              `<@${chosen.targetId}> لا يحمل المحبس!\n\n` +
              (attempt < maxAttempts
                ? `لديكم ${maxAttempts - attempt} محاولات متبقية 🎯`
                : `انتهت المحاولات!`),
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      if (attempt === maxAttempts) return { success: false, attempt: 0, guesser: null };
      await sleep(2000);
    }
  }

  return { success: false, attempt: 0, guesser: null };
}

// ══════════════════════════════════════════════════════════════════════════════
//  6. نتيجة الجولة
// ══════════════════════════════════════════════════════════════════════════════

async function roundResult(context, state, guessResult, hidingIdx, holder, hidingName, guessingName) {
  const { success, attempt, guesser } = guessResult;
  const pts = success
    ? (attempt === 1 ? PTS_GUESS_1ST : PTS_GUESS_2ND)
    : PTS_HIDE_WIN;

  if (success) {
    if (hidingIdx === 0) state.scoreB += pts;
    else                 state.scoreA += pts;

    await context.channel.send({
      components: [
        new ContainerBuilder().setAccentColor(CLR.green)
          .addTextDisplayComponents(t => t.setContent(
            `## 🎯 إجابة صحيحة!\n\n` +
            `<@${guesser.id}> من **${guessingName}** كشف المحبس!\n` +
            `المحبس كان عند **${holder.displayName}** <@${holder.id}>\n\n` +
            `🏆 **${guessingName}** حصل على **${pts} نقطة**!\n\n` +
            `📊 **${state.teamAName} ${state.scoreA}** — **${state.scoreB} ${state.teamBName}**`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  } else {
    if (hidingIdx === 0) state.scoreA += pts;
    else                 state.scoreB += pts;

    await context.channel.send({
      components: [
        new ContainerBuilder().setAccentColor(CLR.gold)
          .addTextDisplayComponents(t => t.setContent(
            `## 🛡️ نجح الإخفاء!\n\n` +
            `**${hidingName}** نجح في إخفاء المحبس!\n` +
            `المحبس كان عند **${holder.displayName}** <@${holder.id}> 💍\n\n` +
            `🏆 **${hidingName}** حصل على **${pts} نقاط**!\n\n` +
            `📊 **${state.teamAName} ${state.scoreA}** — **${state.scoreB} ${state.teamBName}**`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  return pts;
}

// ══════════════════════════════════════════════════════════════════════════════
//  النتائج النهائية
// ══════════════════════════════════════════════════════════════════════════════

async function finalResults(context, state, callback) {
  const { scoreA, scoreB, teamA, teamB, teamAName, teamBName } = state;

  const winPts = config.winPoints?.mahbas ?? 100;
  let resultText, winnerTeam, membersLine;

  if (scoreA > scoreB) {
    winnerTeam = teamA;
    resultText = `### 🏆 فاز **${teamAName}** بنتيجة **${scoreA}** — ${scoreB}!`;
    membersLine = `> 🎖️ أعضاء الفريق الفائز: ${winnerTeam.map(p => `<@${p.id}>`).join(' • ')}`;
  } else if (scoreB > scoreA) {
    winnerTeam = teamB;
    resultText = `### 🏆 فاز **${teamBName}** بنتيجة **${scoreB}** — ${scoreA}!`;
    membersLine = `> 🎖️ أعضاء الفريق الفائز: ${winnerTeam.map(p => `<@${p.id}>`).join(' • ')}`;
  } else {
    winnerTeam = [...teamA, ...teamB];
    resultText = `### 🤝 تعادل! **${scoreA}** — **${scoreB}**\nيحصل الجميع على نقاط!`;
    membersLine = `> 🎖️ أعضاء الفريقين المتعادلين: ${winnerTeam.map(p => `<@${p.id}>`).join(' • ')}`;
  }

  for (const p of winnerTeam) {
    await db.addPoints(p.id, winPts);
  }

  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.gold)
        .addTextDisplayComponents(t => t.setContent(
          `## 💍 انتهت اللعبة!\n\n` +
          `${resultText}\n\n` +
          `**النقاط:**\n` +
          `> ${teamAName}: **${scoreA}** نقطة\n` +
          `> ${teamBName}: **${scoreB}** نقطة\n\n` +
          `${membersLine}\n\n` +
          `🎖️ الفائزون حصلوا على **${winPts}** نقطة لكل لاعب!\n\n` +
          `-# شكراً لجميع اللاعبين! 💍`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  resetGame();
  callback();
}

// ══════════════════════════════════════════════════════════════════════════════
//  بناء أزرار اللاعبين
// ══════════════════════════════════════════════════════════════════════════════

function buildPlayerButtons(team, prefix) {
  const rows = [];
  for (let i = 0; i < team.length; i += 4) {
    const row = new ActionRowBuilder();
    team.slice(i, i + 4).forEach(p => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${prefix}_${p.id}`)
          .setLabel(p.displayName.substring(0, 40))
          .setStyle(ButtonStyle.Secondary),
      );
    });
    rows.push(row);
  }
  return rows;
}