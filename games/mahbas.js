'use strict';

// ══════════════════════════════════════════════════════════════════════════════
//  💍  لعبة المحبس  —  نسخة احترافية مُعاد بناؤها من الصفر
// ══════════════════════════════════════════════════════════════════════════════
//
//  الأوضاع المتاحة:
//  ● classic  — الوضع الاحترافي (الإخفاء + الإيماءات + البطاقات الخاصة)
//  ● real     — وضع المحبس الحقيقي (حجرة ورقة مقص → إخفاء → فتر)
//
//  ══ الوضع الكلاسيكي (classic) ══
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
//  ══ وضع المحبس الحقيقي (real) ══
//  المراحل لكل جولة:
//  1. RPS     — حجرة ورقة مقص بين القائدين / الفائز يأخذ المحبس
//  2. HIDE    — الفائز يذهب لأعضائه واحداً واحداً سراً ويخبئ المحبس
//  3. FIST    — الفريق المخبي يضع قبضتيه على صدره
//  4. PICK    — قائد الخصم يختار المفتر (المخمّن) من فريقه
//  5. REVEAL  — المفتر يفتر على اللاعبين: يختار قبضة أو يقول صفق
//  6. RESULT  — كشف النتيجة
//
// ══════════════════════════════════════════════════════════════════════════════

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  AttachmentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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

// نقاط الوضع الكلاسيكي
const PTS_GUESS_1ST = 2;        // تخمين صحيح أول مرة
const PTS_GUESS_2ND = 1;        // تخمين صحيح ثاني مرة
const PTS_HIDE_WIN  = 3;        // فشل التخمين = نقاط للمخبي

// ثوابت وضع المحبس الحقيقي
const REAL_TOTAL_ROUNDS = 8;
const REAL_T_RPS        = 15_000;  // وقت لعبة حجرة ورقة مقص
const REAL_T_HIDE       = 30_000;  // وقت إخفاء المحبس
const REAL_T_PICK       = 20_000;  // وقت اختيار المفتر
const REAL_T_FATAR      = 40_000;  // وقت الفتر على كل لاعب
const REAL_PTS_WIN      = 2;       // نقاط الفوز بالجولة

// الإيماءات (الوضع الكلاسيكي)
const GESTURES = [
  { id: 'fist',    emoji: '✊', label: 'قبضة'    },
  { id: 'open',    emoji: '🖐️', label: 'مفتوحة'  },
  { id: 'cross',   emoji: '🤞', label: 'متشابكة' },
  { id: 'point',   emoji: '☝️', label: 'إشارة'   },
  { id: 'pinch',   emoji: '🤌', label: 'قرصة'    },
];

// إيماءات حجرة ورقة مقص
const RPS_MOVES = [
  { id: 'rock',     emoji: '✊', label: 'حجرة'  },
  { id: 'paper',    emoji: '✋', label: 'ورقة'  },
  { id: 'scissors', emoji: '✌️', label: 'مقص'   },
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
  teal   : 0x1ABC9C,
  pink   : 0xE91E8C,
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
//  Canvas — لوحة الجولة (الوضع الكلاسيكي)
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
//  Canvas — لوحة جولة المحبس الحقيقي
// ══════════════════════════════════════════════════════════════════════════════

async function buildRealRoundCanvas({ round, scoreA, scoreB, totalRounds, phase, teamAName, teamBName, hidingTeamIdx }) {
  if (!createCanvas) return null;
  try {
    if (GlobalFonts) {
      try { GlobalFonts.registerFromPath(path.resolve(__dirname, '../img/Fonts/IBMBold.ttf'), 'IBM'); } catch (_) {}
    }
    const FONT = GlobalFonts?.has?.('IBM') ? 'IBM' : 'sans-serif';

    const W = 900, H = 400;
    const cv  = createCanvas(W, H);
    const ctx = cv.getContext('2d');

    // ── خلفية داكنة عميقة ──
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0,   '#060612');
    bg.addColorStop(0.5, '#0e0c1f');
    bg.addColorStop(1,   '#060612');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // نمط نجوم خفية
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let x = 0; x < W; x += 24) {
      for (let y = 0; y < H; y += 24) {
        if (Math.random() > 0.7) {
          ctx.beginPath(); ctx.arc(x + Math.random() * 12, y + Math.random() * 12, 1, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // خط وردي-بنفسجي متدرج
    const topLine = ctx.createLinearGradient(0, 0, W, 0);
    topLine.addColorStop(0,   'transparent');
    topLine.addColorStop(0.25, '#E91E8C');
    topLine.addColorStop(0.5,  '#8E44AD');
    topLine.addColorStop(0.75, '#E91E8C');
    topLine.addColorStop(1,   'transparent');
    ctx.fillStyle = topLine;
    ctx.fillRect(0, 0, W, 4);
    ctx.fillRect(0, H - 4, W, 4);

    // ── القبضة في المنتصف ──
    const cx = W / 2, cy = H / 2 - 10;

    // توهج بنفسجي
    const glowGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 100);
    glowGrad.addColorStop(0,   'rgba(233,30,140,0.25)');
    glowGrad.addColorStop(0.5, 'rgba(142,68,173,0.12)');
    glowGrad.addColorStop(1,   'transparent');
    ctx.fillStyle = glowGrad;
    ctx.beginPath(); ctx.arc(cx, cy, 100, 0, Math.PI * 2); ctx.fill();

    // دائرة خارجية نابضة
    ctx.strokeStyle = '#E91E8C';
    ctx.lineWidth   = 2;
    ctx.setLineDash([6, 4]);
    ctx.shadowColor = '#E91E8C';
    ctx.shadowBlur  = 15;
    ctx.beginPath(); ctx.arc(cx, cy, 72, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur  = 0;

    // دائرة داخلية
    ctx.strokeStyle = '#8E44AD';
    ctx.lineWidth   = 12;
    ctx.shadowColor = '#8E44AD';
    ctx.shadowBlur  = 20;
    ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur  = 0;

    // إيموجي القبضة في المنتصف
    ctx.font         = `52px ${FONT}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✊', cx, cy);

    // مرحلة الجولة
    const phaseLabels = {
      rps     : '✊✋✌️ حجرة ورقة مقص',
      hide    : '🫴 مرحلة الإخفاء',
      fist    : '✊ القبضات جاهزة',
      pick    : '👤 اختيار المفتر',
      fatar   : '🔍 الفتر جارٍ',
      result  : '🏆 النتيجة',
    };
    const currentPhaseLabel = phaseLabels[phase] ?? '💍 جارٍ';

    ctx.font      = `bold 17px ${FONT}`;
    ctx.fillStyle = 'rgba(233,30,140,0.85)';
    ctx.shadowColor = '#E91E8C';
    ctx.shadowBlur  = 8;
    ctx.fillText(currentPhaseLabel, cx, cy + 78);
    ctx.shadowBlur  = 0;

    // ── لوحة الفريقين ──
    const drawTeamPanel = (x, name, score, isHiding, align) => {
      const panelW = 210, panelH = 190;
      const px = align === 'left' ? x : x - panelW;
      const py = (H - panelH) / 2;

      const panelGrad = ctx.createLinearGradient(px, py, px + panelW, py + panelH);
      if (isHiding) {
        panelGrad.addColorStop(0, 'rgba(233,30,140,0.15)');
        panelGrad.addColorStop(1, 'rgba(142,68,173,0.06)');
      } else {
        panelGrad.addColorStop(0, 'rgba(26,188,156,0.13)');
        panelGrad.addColorStop(1, 'rgba(52,152,219,0.05)');
      }
      ctx.fillStyle = panelGrad;
      ctx.roundRect(px, py, panelW, panelH, 14);
      ctx.fill();

      ctx.strokeStyle = isHiding ? 'rgba(233,30,140,0.55)' : 'rgba(26,188,156,0.5)';
      ctx.lineWidth   = 1.8;
      ctx.roundRect(px, py, panelW, panelH, 14);
      ctx.stroke();

      // اسم
      ctx.font         = `bold 19px ${FONT}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = isHiding ? '#E91E8C' : '#1ABC9C';
      ctx.shadowColor  = isHiding ? '#E91E8C' : '#1ABC9C';
      ctx.shadowBlur   = 10;
      ctx.fillText(name, px + panelW / 2, py + 30);
      ctx.shadowBlur   = 0;

      // نقاط
      ctx.font      = `bold 70px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(score), px + panelW / 2, py + 105);

      // حالة
      const statusLabel = isHiding ? '✊ يخبي' : '🔍 يخمن';
      ctx.font      = `17px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(statusLabel, px + panelW / 2, py + 163);
    };

    const isAHiding = hidingTeamIdx === 0;
    drawTeamPanel(30,     teamAName, scoreA, isAHiding,  'left');
    drawTeamPanel(W - 30, teamBName, scoreB, !isAHiding, 'right');

    // ── شريط الجولات ──
    const barY   = H - 32;
    const progW  = W - 140;
    const progress = (round - 1) / totalRounds;

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.roundRect(70, barY, progW, 10, 5); ctx.fill();

    const barGrad = ctx.createLinearGradient(70, 0, 70 + progW, 0);
    barGrad.addColorStop(0,   '#E91E8C');
    barGrad.addColorStop(0.5, '#8E44AD');
    barGrad.addColorStop(1,   '#3498DB');
    ctx.fillStyle   = barGrad;
    ctx.shadowColor = '#E91E8C';
    ctx.shadowBlur  = 7;
    ctx.roundRect(70, barY, progW * progress, 10, 5); ctx.fill();
    ctx.shadowBlur  = 0;

    ctx.font      = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(`الجولة ${round} / ${totalRounds}`, W / 2, barY - 10);

    return new AttachmentBuilder(cv.toBuffer('image/png'), { name: 'mahbas_real_round.png' });
  } catch (e) {
    console.error('[Mahbas Real] Canvas error:', e);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  مرحلة الاستقبال (Lobby) — مع اختيار الوضع
// ══════════════════════════════════════════════════════════════════════════════

async function runLobby(context, callback) {
  let teamA      = [];
  let teamB      = [];
  let gameMode   = 'classic';   // الوضع الافتراضي

  const modeLabels = {
    classic : '🎭 الوضع الكلاسيكي',
    real    : '✊ المحبس الحقيقي',
  };
  const modeDesc = {
    classic : 'إخفاء + إيماءات + بطاقات خاصة',
    real    : 'حجرة ورقة مقص → إخفاء → فتر',
  };

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
        `-# كل فريق يحتاج ${MIN_PER_TEAM}–${MAX_PER_TEAM} لاعبين\n\n` +
        `🎮 **الوضع الحالي:** ${modeLabels[gameMode]} — *${modeDesc[gameMode]}*`,
      ));

    const img = config.lobbyImages?.mahbas;
    if (img) c.addMediaGalleryComponents(g => g.addItems(i => i.setURL(img)));

    // أزرار الانضمام والخروج (كما هي بدون تغيير)
    c.addActionRowComponents(r => r.setComponents(
      new ButtonBuilder().setCustomId('join_a').setLabel('🔴 الفريق الأول').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('join_b').setLabel('🔵 الفريق الثاني').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('leave').setLabel('خروج').setStyle(ButtonStyle.Secondary),
    ));

    // قائمة اختيار الوضع (Select Menu) تحت أزرار الانضمام
    c.addActionRowComponents(r => r.setComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_mode')
        .setPlaceholder(`🎮 اختر وضع اللعبة — الحالي: ${modeLabels[gameMode]}`)
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('🎭 الوضع الكلاسيكي')
            .setDescription('إخفاء سري + إيماءات تشويش + بطاقات خاصة')
            .setValue('classic')
            .setDefault(gameMode === 'classic'),
          new StringSelectMenuOptionBuilder()
            .setLabel('✊ المحبس الحقيقي')
            .setDescription('حجرة ورقة مقص → إخفاء → فتر على القبضات')
            .setValue('real')
            .setDefault(gameMode === 'real'),
        ),
    ));

    return c;
  };

  const lobbyMsg = await context.reply({
    components: [buildLobby()],
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true,
  });

  const col = lobbyMsg.createMessageComponentCollector({
    filter: i => ['join_a', 'join_b', 'leave', 'select_mode'].includes(i.customId),
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

    if (i.customId === 'select_mode') {
      gameMode = i.values[0];
      await i.update({ components: [buildLobby()], flags: MessageFlags.IsComponentsV2 });
      return;
    }

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
    } else if (i.customId === 'leave') {
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
              `🔵 الفريق الثاني: ${teamB.map(p => `<@${p.id}>`).join(' ') || 'لا يوجد'}\n\n` +
              `🎮 الوضع: **${modeLabels[gameMode]}**`,
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

    if (gameMode === 'real') {
      // ═══ وضع المحبس الحقيقي ═══
      const state = {
        teamA, teamB,
        scoreA     : 0,
        scoreB     : 0,
        round      : 0,
        totalRounds: REAL_TOTAL_ROUNDS,
        teamAName  : '🔴 الفريق الأول',
        teamBName  : '🔵 الفريق الثاني',
      };

      await context.channel.send({
        components: [
          new ContainerBuilder().setAccentColor(CLR.pink)
            .addTextDisplayComponents(t => t.setContent(
              `## ✊ بدأت لعبة المحبس الحقيقي!\n\n` +
              `**الفريق الأول 🔴**\n${teamA.map(p => `> <@${p.id}>`).join('\n')}\n\n` +
              `**الفريق الثاني 🔵**\n${teamB.map(p => `> <@${p.id}>`).join('\n')}\n\n` +
              `### 📜 قواعد اللعبة\n` +
              `> ✊ القائدان يلعبان **حجرة ورقة مقص** — الفائز يأخذ المحبس\n` +
              `> 🫴 الفائز يذهب لأعضائه واحداً واحداً ويخبئ المحبس سراً\n` +
              `> ✊ جميع أعضاء الفريق يضعون **قبضتيهم على صدورهم**\n` +
              `> 👤 قائد الخصم يختار **المفتر** من فريقه\n` +
              `> 🔍 المفتر يأتي لكل لاعب: يختار **قبضة** أو يقول **صفق**\n` +
              `> ✅ سحب القبضة التي فيها المحبس = **فوز المفتر!**\n` +
              `> ❌ اختيار قبضة فارغة أو صفق قبضة فيها محبس = **باتك!** نقطة للفريق المخبي\n\n` +
              `-# ${REAL_TOTAL_ROUNDS} جولات — أعلى نقطة يفوز!`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      await sleep(6000);
      await realGameLoop(context, state, callback);

    } else {
      // ═══ الوضع الكلاسيكي (بدون أي تعديل) ═══
      const state = {
        teamA, teamB,
        scoreA     : 0,
        scoreB     : 0,
        round      : 0,
        totalRounds: TOTAL_ROUNDS,
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
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  الحلقة الرئيسية للعبة (الوضع الكلاسيكي — بدون أي تعديل)
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
//  1. مرحلة الإخفاء السري (الوضع الكلاسيكي — بدون تعديل)
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
//  عرض بطاقة التبديل (للفريق المخبي — الوضع الكلاسيكي — بدون تعديل)
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
//  2. مرحلة الإيماءات (Bluff — الوضع الكلاسيكي — بدون تعديل)
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
//  3. كشف الإيماءات للجميع (الوضع الكلاسيكي — بدون تعديل)
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
//  عرض البطاقات الخاصة (للفريق المخمن — الوضع الكلاسيكي — بدون تعديل)
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
//  4. مرحلة التخمين (الوضع الكلاسيكي — بدون تعديل)
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
//  6. نتيجة الجولة (الوضع الكلاسيكي — بدون تعديل)
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
//  النتائج النهائية (مشتركة بين الوضعين)
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
//  بناء أزرار اللاعبين (مشترك)
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

// ══════════════════════════════════════════════════════════════════════════════
//  ██████╗ ███████╗ █████╗ ██╗          وضع المحبس الحقيقي
//  ██╔══██╗██╔════╝██╔══██╗██║
//  ██████╔╝█████╗  ███████║██║
//  ██╔══██╗██╔══╝  ██╔══██║██║
//  ██║  ██║███████╗██║  ██║███████╗
//  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝
// ══════════════════════════════════════════════════════════════════════════════

// ─── الحلقة الرئيسية لوضع المحبس الحقيقي ─────────────────────────────────

async function realGameLoop(context, state, callback) {
  if (state.round >= state.totalRounds) {
    await finalResults(context, state, callback);
    return;
  }

  state.round += 1;

  // تحديد القائدين (أول عضو في كل فريق)
  const leaderA = state.teamA[0];
  const leaderB = state.teamB[0];

  // لوحة الجولة
  const canvas = await buildRealRoundCanvas({
    round        : state.round,
    scoreA       : state.scoreA,
    scoreB       : state.scoreB,
    totalRounds  : state.totalRounds,
    phase        : 'rps',
    teamAName    : state.teamAName,
    teamBName    : state.teamBName,
    hidingTeamIdx: (state.round - 1) % 2,
  });

  const roundHeaderPayload = {
    components: [
      new ContainerBuilder().setAccentColor(CLR.pink)
        .addTextDisplayComponents(t => t.setContent(
          `## ✊ الجولة ${state.round} / ${state.totalRounds} — المحبس الحقيقي\n\n` +
          `📊 **${state.teamAName} ${state.scoreA}** — **${state.scoreB} ${state.teamBName}**\n\n` +
          `⚔️ **<@${leaderA.id}>** يواجه **<@${leaderB.id}>**\n` +
          `-# حجرة ورقة مقص — الفائز يأخذ المحبس!`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
  if (canvas) roundHeaderPayload.files = [canvas];
  await context.channel.send(roundHeaderPayload);
  await sleep(2500);

  // ══ 1. حجرة ورقة مقص ══════════════════════════════════════════════════
  const rpsResult = await runRpsPhase(context, leaderA, leaderB, state.teamAName, state.teamBName);

  // تحديد الفريق المخبي والمخمن
  let hidingTeam, guessingTeam, hidingName, guessingName, hidingIdx;
  if (rpsResult.winner === 'A') {
    hidingTeam   = state.teamA;
    guessingTeam = state.teamB;
    hidingName   = state.teamAName;
    guessingName = state.teamBName;
    hidingIdx    = 0;
  } else if (rpsResult.winner === 'B') {
    hidingTeam   = state.teamB;
    guessingTeam = state.teamA;
    hidingName   = state.teamBName;
    guessingName = state.teamAName;
    hidingIdx    = 1;
  } else {
    // تعادل — أعد اللعب
    await context.channel.send({
      components: [
        new ContainerBuilder().setAccentColor(CLR.warn)
          .addTextDisplayComponents(t => t.setContent(
            `### 🤝 تعادل! ${rpsResult.moveA.emoji} vs ${rpsResult.moveB.emoji}\nإعادة الجولة...`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
    await sleep(2000);
    // أعد نفس الجولة
    state.round -= 1;
    await realGameLoop(context, state, callback);
    return;
  }

  // إعلان الفائز بحجرة ورقة مقص
  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.green)
        .addTextDisplayComponents(t => t.setContent(
          `## 🎯 ${rpsResult.moveA.emoji} vs ${rpsResult.moveB.emoji}\n\n` +
          `🏆 **${hidingName}** فاز بالحجرة ورقة مقص!\n` +
          `💍 المحبس ذهب لـ **${hidingName}**\n\n` +
          `-# الآن يبدأ الإخفاء السري...`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
  await sleep(3000);

  // ══ 2. مرحلة الإخفاء الحقيقي ══════════════════════════════════════════
  const holder = await runRealHidePhase(context, hidingTeam, hidingName, guessingName);

  // ══ 3. إعلان القبضات جاهزة + اختيار المفتر ════════════════════════════
  const fatar = await runPickFatarPhase(context, guessingTeam, guessingName, hidingTeam, hidingName);

  // ══ 4. الفتر على الأعضاء ════════════════════════════════════════════════
  const fatarResult = await runFatarPhase(context, fatar, guessingName, hidingTeam, hidingName, holder, state);

  // ══ 5. نتيجة الجولة ════════════════════════════════════════════════════
  await realRoundResult(context, state, fatarResult, hidingIdx, holder, hidingName, guessingName);

  await sleep(4000);
  await realGameLoop(context, state, callback);
}

// ─── مرحلة حجرة ورقة مقص ────────────────────────────────────────────────

async function runRpsPhase(context, leaderA, leaderB, teamAName, teamBName) {
  // إرسال DM لكل قائد
  const rpsButtons = (playerId) => [
    new ActionRowBuilder().addComponents(
      ...RPS_MOVES.map(m =>
        new ButtonBuilder()
          .setCustomId(`rps_${playerId}_${m.id}`)
          .setLabel(`${m.emoji} ${m.label}`)
          .setStyle(ButtonStyle.Primary),
      ),
    ),
  ];

  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.pink)
        .addTextDisplayComponents(t => t.setContent(
          `## ✊✋✌️ حجرة ورقة مقص!\n\n` +
          `📱 **<@${leaderA.id}>** و **<@${leaderB.id}>**\n` +
          `ستصلكما رسالة خاصة — اختارا حركتكما سراً!\n\n` +
          `-# ⏰ ${REAL_T_RPS / 1000} ثانية`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  const movesChosen = {};

  // إرسال الأزرار للقائدين
  const sendRpsToLeader = async (leader) => {
    const msg = await sendDM(
      context.client, leader,
      `## ✊✋✌️ حجرة ورقة مقص!\nاختر حركتك سراً — الخصم لا يرى اختيارك!`,
      rpsButtons(leader.id),
    );
    if (!msg) return;

    const col = msg.createMessageComponentCollector({
      filter: i => i.customId.startsWith(`rps_${leader.id}_`) && i.user.id === leader.id,
      time: REAL_T_RPS,
      max: 1,
    });

    col.on('collect', async i => {
      const moveId = i.customId.replace(`rps_${leader.id}_`, '');
      movesChosen[leader.id] = RPS_MOVES.find(m => m.id === moveId);
      await i.update({
        content: `✅ اخترت: ${movesChosen[leader.id].emoji} ${movesChosen[leader.id].label}`,
        components: [],
      });
    });

    col.on('end', () => {
      if (!movesChosen[leader.id]) movesChosen[leader.id] = rnd(RPS_MOVES);
    });
  };

  await Promise.allSettled([sendRpsToLeader(leaderA), sendRpsToLeader(leaderB)]);
  await sleep(REAL_T_RPS);

  // تأكد من وجود حركة للجميع
  if (!movesChosen[leaderA.id]) movesChosen[leaderA.id] = rnd(RPS_MOVES);
  if (!movesChosen[leaderB.id]) movesChosen[leaderB.id] = rnd(RPS_MOVES);

  const moveA = movesChosen[leaderA.id];
  const moveB = movesChosen[leaderB.id];

  // حساب الفائز
  const rpsWinner = (a, b) => {
    if (a.id === b.id) return 'draw';
    if (
      (a.id === 'rock'     && b.id === 'scissors') ||
      (a.id === 'scissors' && b.id === 'paper')    ||
      (a.id === 'paper'    && b.id === 'rock')
    ) return 'A';
    return 'B';
  };

  return { winner: rpsWinner(moveA, moveB), moveA, moveB };
}

// ─── مرحلة الإخفاء الحقيقي ────────────────────────────────────────────────
//
//  الفريق المخبي يذهب واحداً واحداً لأعضائه عبر DM
//  القائد (أول عضو) هو من يختار أين يضع المحبس
//  بقية الأعضاء يتلقون إشعاراً بالدور دون معرفة من يحمله
//
async function runRealHidePhase(context, hidingTeam, hidingName, guessingName) {
  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.warn)
        .addTextDisplayComponents(t => t.setContent(
          `## 🫴 مرحلة الإخفاء السري\n\n` +
          `**${hidingName}** — القائد يذهب لأعضائه واحداً واحداً ويخبئ المحبس!\n\n` +
          `> ✊ جميع الأعضاء سيضعون **قبضتيهم على صدورهم**\n` +
          `> 💍 المحبس مخبأ عند أحدهم — ولا أحد يعرف إلا القائد!\n` +
          `> 👀 **${guessingName}** — انتظروا، الفتر قادم...\n\n` +
          `-# ⏰ ${REAL_T_HIDE / 1000} ثانية`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  const leader = hidingTeam[0];

  // القائد يختار من يعطيه المحبس عبر DM
  const memberOptions = hidingTeam.map(p =>
    new ButtonBuilder()
      .setCustomId(`realhide_${p.id}`)
      .setLabel(p.displayName.substring(0, 40))
      .setStyle(p.id === leader.id ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  // تقسيم الأزرار لصفوف (4 كحد أقصى)
  const memberRows = [];
  for (let i = 0; i < memberOptions.length; i += 4) {
    memberRows.push(new ActionRowBuilder().addComponents(memberOptions.slice(i, i + 4)));
  }

  const leaderDmMsg = await sendDM(
    context.client, leader,
    `## 💍 أنت القائد — اختر من تعطيه المحبس!\n` +
    `> اختر نفسك إن أردت الاحتفاظ به\n` +
    `> اختر أحد أعضائك لتعطيه المحبس سراً\n\n` +
    `-# ⏰ ${REAL_T_HIDE / 1000} ثانية — لا أحد يعرف اختيارك!`,
    memberRows,
  );

  // إشعار للأعضاء الآخرين
  for (const member of hidingTeam) {
    if (member.id === leader.id) continue;
    await sendDM(
      context.client, member,
      `## ✊ ضع قبضتيك على صدرك!\n` +
      `القائد يمر عليكم الآن — أحدكم سيحمل المحبس.\n` +
      `> **لا تكشف أي شيء — الجميع بنفس القبضة!**\n` +
      `-# انتظر إشعار التأكيد...`,
    );
  }

  // انتظر اختيار القائد
  let chosenHolder = hidingTeam[Math.floor(Math.random() * hidingTeam.length)]; // افتراضي

  if (leaderDmMsg) {
    const result = await new Promise(resolve => {
      const col = leaderDmMsg.createMessageComponentCollector({
        filter: i => i.customId.startsWith('realhide_') && i.user.id === leader.id,
        time: REAL_T_HIDE,
        max: 1,
      });

      col.on('collect', async i => {
        const selectedId = i.customId.replace('realhide_', '');
        const selected   = hidingTeam.find(p => p.id === selectedId) ?? chosenHolder;

        await i.update({
          content: `✅ تم! **${selected.displayName}** سيحمل المحبس سراً.`,
          components: [],
        });

        resolve(selected);
      });

      col.on('end', c => {
        if (c.size === 0) resolve(chosenHolder);
      });
    });

    chosenHolder = result;
  }

  // إشعار حامل المحبس سراً
  try {
    const holderUser = await context.client.users.fetch(chosenHolder.id);
    await holderUser.send(
      `## 💍 أنت تحمل المحبس!\n` +
      `> ✊ **ضع قبضتيك على صدرك** وحافظ على تعبير محايد\n` +
      `> 🎭 الخصم سيحاول كشفك — لا تنكشف!\n` +
      `-# الفريق المخبي كله بنفس القبضة — الخصم لا يعرف من أنت!`,
    );
  } catch (_) {}

  // انتظار باقي الوقت
  await sleep(REAL_T_HIDE);

  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.green)
        .addTextDisplayComponents(t => t.setContent(
          `### ✊ الفريق جاهز!\n**${hidingName}** وضعوا قبضاتهم — المحبس مخبأ!`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(2000);
  return chosenHolder;
}

// ─── اختيار المفتر ────────────────────────────────────────────────────────

async function runPickFatarPhase(context, guessingTeam, guessingName, hidingTeam, hidingName) {
  // عرض لوحة القبضات
  const fistDisplay = hidingTeam
    .map(p => `> ✊✊ **${p.displayName}**`)
    .join('\n');

  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.purple)
        .addTextDisplayComponents(t => t.setContent(
          `## ✊ القبضات جاهزة!\n\n` +
          `**${hidingName}** — جميع الأعضاء قبضاتهم على الصدر:\n\n` +
          `${fistDisplay}\n\n` +
          `---\n` +
          `**${guessingName}** — اختار قائدك المفتر!\n` +
          `-# ⏰ ${REAL_T_PICK / 1000} ثانية`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  const leader = guessingTeam[0];

  // بناء أزرار أعضاء الفريق المخمن لاختيار المفتر
  const fatarButtons = buildPlayerButtons(guessingTeam, 'pickfatar');

  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.teal)
        .addTextDisplayComponents(t => t.setContent(
          `### 👤 <@${leader.id}> — اختر المفتر من فريقك!\n` +
          `-# أنت فقط المخول باختيار من يفتر`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  const pickMsg = await context.channel.send({
    components: fatarButtons,
  });

  const fatar = await new Promise(resolve => {
    const col = pickMsg.createMessageComponentCollector({
      filter: i => i.customId.startsWith('pickfatar_') && i.user.id === leader.id,
      time: REAL_T_PICK,
      max: 1,
    });

    col.on('collect', async i => {
      const selectedId = i.customId.replace('pickfatar_', '');
      const selected   = guessingTeam.find(p => p.id === selectedId) ?? guessingTeam[0];
      try { await i.deferUpdate(); } catch (_) {}
      resolve(selected);
    });

    col.on('end', c => {
      if (c.size === 0) resolve(guessingTeam[0]);
    });
  });

  // أغلق الأزرار
  try {
    await pickMsg.edit({
      components: fatarButtons.map(row => {
        row.components.forEach(b => b.setDisabled(true));
        return row;
      }),
    });
  } catch (_) {}

  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.teal)
        .addTextDisplayComponents(t => t.setContent(
          `### 🔍 المفتر هو **${fatar.displayName}** <@${fatar.id}>!\n` +
          `ابدأ الفتر على الفريق — كشف القبضات الآن!\n\n` +
          `-# قل **سحب** لسحب قبضة، أو **صفق** لطلب التصفيق`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(2500);
  return fatar;
}

// ─── مرحلة الفتر (المعدلة) ─────────────────────────────────────────────────
//
//  المفتر يختار اللاعب الذي يريد فتره بحرية من القائمة المتبقية.
//  عند اختيار لاعب، تظهر له أزرار الإجراءات.
//  إذا لم يختر لاعباً خلال 20 ثانية، يُختار لاعب عشوائي.
//  بعد الإجراء، إذا كان "صفق" ناجحاً، يُحذف اللاعب من قائمة المشتبهين.
//  تستمر الحلقة حتى نفاد القائمة أو حسم الجولة (سحب صحيح أو باتك).
//
async function runFatarPhase(context, fatar, guessingName, hidingTeam, hidingName, holder, state) {
  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.pink)
        .addTextDisplayComponents(t => t.setContent(
          `## 🔍 بدأ الفتر!\n\n` +
          `**${fatar.displayName}** <@${fatar.id}> يفتر على **${hidingName}**\n\n` +
          `### قواعد الفتر:\n` +
          `> 🤜 **سحب يمين / سحب يسار** — تسحب قبضة اللاعب\n` +
          `>  ↳ إذا كان فيها المحبس = ✅ **فوز!**\n` +
          `>  ↳ إذا كانت فارغة = ❌ **باتك** — يربح المخبي\n` +
          `> 👏 **صفق** — تطلب من اللاعب التصفيق بيده/يديه\n` +
          `>  ↳ إذا كانت فارغة = ✅ استمر للاعب التالي\n` +
          `>  ↳ إذا كانت فيها المحبس = ❌ **باتك** — يربح المخبي\n\n` +
          `-# ⏰ ${REAL_T_FATAR / 1000} ثانية لكل لاعب`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(3000);

  // قائمة اللاعبين المتبقين (المشتبه بهم)
  let remainingPlayers = [...hidingTeam];

  // اليد التي تحمل المحبس (تُحدد عشوائياً لحامل المحبس)
  const holderHand = state._holderHand ?? (state._holderHand = Math.random() > 0.5 ? 'right' : 'left');

  // حلقة الاختيار والإجراء
  while (remainingPlayers.length > 0) {
    // عرض قائمة المشتبه بهم وطلب اختيار واحد
    const playerChoiceMsg = await context.channel.send({
      components: [
        new ContainerBuilder().setAccentColor(CLR.purple)
          .addTextDisplayComponents(t => t.setContent(
            `### 🎯 اختر لاعباً لتفتشه\n\n` +
            `اللاعبون المتبقون (${remainingPlayers.length}):\n` +
            remainingPlayers.map(p => `> ✊✊ **${p.displayName}**`).join('\n') +
            `\n\n-# اختر لاعباً بالضغط على اسمه`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    // أزرار اختيار اللاعب
    const playerButtons = buildPlayerButtons(remainingPlayers, 'fatar_choose');
    const chooseMsg = await context.channel.send({ components: playerButtons });

    // انتظار اختيار لاعب (مع مهلة 20 ثانية)
    const chosenPlayer = await new Promise(resolve => {
      const col = chooseMsg.createMessageComponentCollector({
        filter: i => i.customId.startsWith('fatar_choose_') && i.user.id === fatar.id,
        time: 20_000, // 20 ثانية
        max: 1,
      });
      col.on('collect', async i => {
        const targetId = i.customId.replace('fatar_choose_', '');
        const target = remainingPlayers.find(p => p.id === targetId);
        await i.deferUpdate();
        resolve(target || rnd(remainingPlayers));
      });
      col.on('end', collected => {
        if (collected.size === 0) {
          // لم يختر → اختيار عشوائي
          resolve(rnd(remainingPlayers));
        }
      });
    });

    // تعطيل أزرار الاختيار
    try {
      await chooseMsg.edit({
        components: playerButtons.map(row => {
          row.components.forEach(b => b.setDisabled(true));
          return row;
        }),
      });
    } catch (_) {}

    const target = chosenPlayer;
    const isHolder = target.id === holder.id;

    // إعلان الانتقال للاعب المختار
    await context.channel.send({
      components: [
        new ContainerBuilder().setAccentColor(CLR.purple)
          .addTextDisplayComponents(t => t.setContent(
            `### 🔎 يفتر الآن على **${target.displayName}** <@${target.id}>\n` +
            `> ✊✊ القبضتان جاهزتان على الصدر\n` +
            `-# ${isHolder ? '💍 هذا هو صاحب المحبس!' : '🤲 يداه فارغتان'}`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    // أزرار الإجراء (سحب، صفق)
    const actionRow1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fatar_right_${target.id}`).setLabel('🤜 سحب يمين').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`fatar_left_${target.id}`).setLabel('🤛 سحب يسار').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`fatar_clap_right_${target.id}`).setLabel('👏 صفق يمين').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`fatar_clap_left_${target.id}`).setLabel('👏 صفق يسار').setStyle(ButtonStyle.Primary),
    );
    const actionRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fatar_clap_both_${target.id}`).setLabel('🙌 صفق الاثنين').setStyle(ButtonStyle.Secondary),
    );

    const actionMsg = await context.channel.send({ components: [actionRow1, actionRow2] });

    // انتظار الإجراء
    const action = await new Promise(resolve => {
      const col = actionMsg.createMessageComponentCollector({
        filter: i =>
          (i.customId.startsWith('fatar_') && i.customId.endsWith(`_${target.id}`)) &&
          i.user.id === fatar.id,
        time: REAL_T_FATAR,
        max: 1,
      });
      col.on('collect', async i => {
        await i.deferUpdate();
        const cid = i.customId;
        if (cid.startsWith('fatar_right_'))       resolve({ type: 'pull', hand: 'right' });
        else if (cid.startsWith('fatar_left_'))   resolve({ type: 'pull', hand: 'left' });
        else if (cid.startsWith('fatar_clap_right_')) resolve({ type: 'clap', hand: 'right' });
        else if (cid.startsWith('fatar_clap_left_'))  resolve({ type: 'clap', hand: 'left' });
        else if (cid.startsWith('fatar_clap_both_'))  resolve({ type: 'clap', hand: 'both' });
        else resolve({ type: 'timeout' });
      });
      col.on('end', collected => {
        if (collected.size === 0) resolve({ type: 'timeout' });
      });
    });

    // تعطيل أزرار الإجراء
    try {
      await actionMsg.edit({
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`d1`).setLabel('سحب يمين').setStyle(ButtonStyle.Danger).setDisabled(true),
            new ButtonBuilder().setCustomId(`d2`).setLabel('سحب يسار').setStyle(ButtonStyle.Danger).setDisabled(true),
            new ButtonBuilder().setCustomId(`d3`).setLabel('صفق يمين').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId(`d4`).setLabel('صفق يسار').setStyle(ButtonStyle.Primary).setDisabled(true),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`d5`).setLabel('صفق الاثنين').setStyle(ButtonStyle.Secondary).setDisabled(true),
          ),
        ],
      });
    } catch (_) {}

    // معالجة النتيجة
    if (action.type === 'timeout') {
      // انتهى الوقت بدون إجراء -> يعتبر تخطي، يبقى اللاعب في القائمة (يمكن إعادة اختياره)
      await context.channel.send({
        components: [
          new ContainerBuilder().setAccentColor(CLR.silver)
            .addTextDisplayComponents(t => t.setContent(`⏰ انتهى وقت الإجراء على ${target.displayName} — يمكنك اختيار لاعب آخر.`)),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      continue;
    }

    if (action.type === 'pull') {
      // سحب قبضة
      if (isHolder) {
        const pulled = (action.hand === holderHand);
        if (pulled) {
          // وجد المحبس
          await context.channel.send({
            components: [
              new ContainerBuilder().setAccentColor(CLR.green)
                .addTextDisplayComponents(t => t.setContent(
                  `## 🎉 وجد المحبس!\n\n` +
                  `**${fatar.displayName}** سحب يد **${target.displayName}** وكان فيها المحبس!\n\n` +
                  `💍 **${guessingName}** يفوز بهذه الجولة! **+${REAL_PTS_WIN} نقطة**\n\n` +
                  `-# باتك يا **${hidingName}**! 😅`,
                )),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
          delete state._holderHand;
          return { success: true, fatar };
        } else {
          // باتك (اليد الأخرى فيها المحبس)
          await context.channel.send({
            components: [
              new ContainerBuilder().setAccentColor(CLR.gold)
                .addTextDisplayComponents(t => t.setContent(
                  `## 🛡️ باتك!\n\n` +
                  `**${fatar.displayName}** سحب اليد ${action.hand === 'right' ? 'اليمنى' : 'اليسرى'} لـ **${target.displayName}** وكانت فارغة!\n\n` +
                  `> 💍 المحبس كان في يده الأخرى!\n\n` +
                  `🏆 **${hidingName}** يفوز بهذه الجولة! **+${REAL_PTS_WIN} نقطة**\n\n` +
                  `-# باتك يا **${guessingName}**! 😏`,
                )),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
          delete state._holderHand;
          return { success: false, fatar };
        }
      } else {
        // لاعب ليس معه المحبس -> باتك فوري
        await context.channel.send({
          components: [
            new ContainerBuilder().setAccentColor(CLR.gold)
              .addTextDisplayComponents(t => t.setContent(
                `## 🛡️ باتك!\n\n` +
                `**${fatar.displayName}** سحب يد **${target.displayName}** وكانت **فارغة**!\n\n` +
                `🏆 **${hidingName}** يفوز بهذه الجولة! **+${REAL_PTS_WIN} نقطة**\n\n` +
                `-# المحبس لم يكن هناك! 😏`,
              )),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
        delete state._holderHand;
        return { success: false, fatar };
      }
    } // نهاية pull

    if (action.type === 'clap') {
      // طلب تصفيق
      if (isHolder) {
        const clapHit = (action.hand === holderHand || action.hand === 'both');
        if (clapHit) {
          // باتك
          await context.channel.send({
            components: [
              new ContainerBuilder().setAccentColor(CLR.gold)
                .addTextDisplayComponents(t => t.setContent(
                  `## 🛡️ باتك!\n\n` +
                  `**${fatar.displayName}** طلب تصفيق **${target.displayName}** — **المحبس كان في تلك اليد!**\n\n` +
                  `🏆 **${hidingName}** يفوز بهذه الجولة! **+${REAL_PTS_WIN} نقطة**\n\n` +
                  `-# كان يجب سحبها لا تصفيقها! 😅`,
                )),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
          delete state._holderHand;
          return { success: false, fatar };
        } else {
          // صفق لليد الفارغة -> آمن، يُحذف اللاعب من المشتبهين
          await context.channel.send({
            components: [
              new ContainerBuilder().setAccentColor(CLR.blue)
                .addTextDisplayComponents(t => t.setContent(
                  `### 👏 ${target.displayName} صفّق!\n` +
                  `> يده ${action.hand === 'right' ? 'اليمنى' : 'اليسرى'} فارغة ✅\n` +
                  `-# تمت تبرئته — انتقل للاعبين الآخرين`,
                )),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
          // إزالة اللاعب من القائمة
          remainingPlayers = remainingPlayers.filter(p => p.id !== target.id);
        }
      } else {
        // لاعب بدون المحبس -> صفق ناجح، يُحذف
        await context.channel.send({
          components: [
            new ContainerBuilder().setAccentColor(CLR.blue)
              .addTextDisplayComponents(t => t.setContent(
                `### 👏 ${target.displayName} صفّق!\n` +
                `> يداه فارغتان ✅\n` +
                `-# تمت تبرئته`,
              )),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
        remainingPlayers = remainingPlayers.filter(p => p.id !== target.id);
      }
    } // نهاية clap
  } // نهاية while

  // إذا وصلنا هنا، فقد نفدت القائمة بدون إيجاد المحبس -> باتك
  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(CLR.gold)
        .addTextDisplayComponents(t => t.setContent(
          `## 🛡️ باتك! انتهى الفتر!\n\n` +
          `**${fatar.displayName}** لم يستطع إيجاد المحبس بعد تفتيش الجميع!\n\n` +
          `💍 المحبس كان عند **${holder.displayName}** <@${holder.id}> طوال الوقت!\n\n` +
          `🏆 **${hidingName}** يفوز بهذه الجولة! **+${REAL_PTS_WIN} نقطة**`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  delete state._holderHand;
  return { success: false, fatar };
}

// ─── نتيجة جولة المحبس الحقيقي ───────────────────────────────────────────

async function realRoundResult(context, state, fatarResult, hidingIdx, holder, hidingName, guessingName) {
  const { success } = fatarResult;

  if (success) {
    // المفتر وجد المحبس
    if (hidingIdx === 0) state.scoreB += REAL_PTS_WIN;
    else                 state.scoreA += REAL_PTS_WIN;
  } else {
    // فشل الفتر — نقاط للمخبين
    if (hidingIdx === 0) state.scoreA += REAL_PTS_WIN;
    else                 state.scoreB += REAL_PTS_WIN;
  }

  await context.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(success ? CLR.teal : CLR.pink)
        .addTextDisplayComponents(t => t.setContent(
          `## 📊 النقاط بعد الجولة ${state.round}\n\n` +
          `> ${state.teamAName}: **${state.scoreA}** نقطة\n` +
          `> ${state.teamBName}: **${state.scoreB}** نقطة\n\n` +
          `-# ${state.totalRounds - state.round} جولات متبقية`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
}