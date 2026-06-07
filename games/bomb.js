'use strict';

// ══════════════════════════════════════════════════════════════════════
//  💣  لعبة القنبلة  —  نسخة مُعاد بناؤها بالكامل
// ══════════════════════════════════════════════════════════════════════

const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  AttachmentBuilder,
} = require('discord.js');

const db     = require('../database.js');
const config = require('../config.js');
const path   = require('path');

// ─── Canvas (اختياري) ────────────────────────────────────────────────
let createCanvas, loadImage, GlobalFonts;
try {
  ({ createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas'));
} catch (_) {
  createCanvas = null;
}

// ─── Gemini (اختياري تماماً) ─────────────────────────────────────────
let geminiModel = null;
try {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    const genAI = new GoogleGenerativeAI(key);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  }
} catch (_) {}

// ══════════════════════════════════════════════════════════════════════
//  ثوابت اللعبة
// ══════════════════════════════════════════════════════════════════════

const MIN_PLAYERS    = 2;
const MAX_PLAYERS    = 20;
const LOBBY_TIME     = config.lobbyTime?.bomb ?? 60_000;

// الوقت الأساسي للإجابة (يتقلص كل جولة)
const BASE_ANSWER_TIME   = 18_000;   // 18 ثانية
const MIN_ANSWER_TIME    = 7_000;    // 7 ثوانٍ كحد أدنى
const TIME_SHRINK_PER_RD = 400;      // يُخفَّض 0.4 ثانية كل جولة
const CHOOSE_TIME        = 12_000;

const MAX_STRIKES = 2; // ضربتان = خروج

// ألوان موحّدة للعبة
const CLR = {
  main    : 0xE84040,   // أحمر القنبلة
  success : 0x2ECC71,
  danger  : 0xE74C3C,
  neutral : 0x2C3E50,
  gold    : 0xF1C40F,
  warn    : 0xE67E22,
};

// ══════════════════════════════════════════════════════════════════════
//  قاموس الكلمات العربية (مُصنَّف بالحرف الأول والأخير)
//  الصيغة:  'أ-ر' => ['أمر','أثر', ...]
// ══════════════════════════════════════════════════════════════════════

const WORD_BANK_RAW = [
  // ─── أ ───
  'أسد','أمل','أمر','أثر','أكل','أمان','أحمر','أبيض','أخضر','أصفر',
  'أرنب','أسرة','أبواب','أزهار','أفكار','أقمار','أنهار','أوتار',
  'أرض','أنف','أذن','أيد','أعين','أسنان','أكتاف','أعناق',
  // ─── ب ───
  'بحر','بيت','باب','بدر','بطل','برج','بنك','بلد','بناء','بيان',
  'بصل','بطيخ','بقر','بطة','بلبل','برتقال','بندقية','بستان',
  'برد','بخار','بريق','بصير','بعيد','بنيان','برهان','بلسان',
  // ─── ت ───
  'تمر','تراب','تفاح','تعب','تاج','تلة','توت','تبن','تحدي',
  'تمساح','تنين','تلميذ','تصميم','تقدم','تنوع','تحرر','تسلق',
  // ─── ث ───
  'ثلج','ثعلب','ثور','ثمر','ثوب','ثروة','ثمين','ثقيل',
  // ─── ج ───
  'جبل','جمل','جمر','جدار','جذر','جزر','جسر','جهد','جمهور',
  'جوهر','جراد','جلسة','جريدة','جولة','جوائز','جماهير','جنود',
  // ─── ح ───
  'حصان','حجر','حلم','حبر','حقل','حمام','حديد','حياة','حرية',
  'حنان','حضارة','حسناء','حريق','حكمة','حوار','حافلة','حارس',
  // ─── خ ───
  'خبز','خمر','خير','خضر','خشب','خيار','خبير','خادم','خيول',
  'خليج','خريطة','خريف','خسارة','خطاب','خاتم','خيمة','خطوة',
  // ─── د ───
  'دار','دفء','دجاج','دراجة','دفتر','دلفين','دماغ','دواء',
  'دهاء','دقيق','ديك','دولة','دوري','دعوة','درهم','دستور',
  // ─── ذ ───
  'ذهب','ذئب','ذرة','ذاكرة','ذكاء','ذيل','ذرية',
  // ─── ر ───
  'رمل','رجل','ريح','رعد','روح','رمان','رحلة','رفيق','رصيف',
  'رسالة','رياض','ربيع','راتب','رفاهية','رغبة','رقم','رياضة',
  // ─── ز ───
  'زهرة','زيت','زبيب','زرافة','زمن','زاوية','زبدة','زعيم',
  'زرع','زلزال','زمرد','زينة','زيارة','زنبق',
  // ─── س ───
  'سمك','سيف','سرير','سحاب','سفينة','سهم','سماء','سلام',
  'سلطان','سبيل','سيارة','سحر','ساعة','سعادة','سهولة','سرور',
  'سنبلة','سلوى','سرعة','سلاح','سبب','سفر','ستارة','ساحل',
  // ─── ش ───
  'شمس','شجر','شعر','شمع','شبكة','شراع','شهاب','شريف',
  'شكوى','شجاعة','شهادة','شعلة','شاطئ','شتاء','شباب','شراب',
  // ─── ص ───
  'صخر','صقر','صبر','صدى','صوت','صمود','صحراء','صداقة',
  'صواريخ','صيد','صناعة','صدق','صرخة','صحة','صمت','صاروخ',
  // ─── ض ───
  'ضوء','ضباب','ضيف','ضرب','ضمير','ضحك','ضعف','ضجيج',
  // ─── ط ───
  'طير','طحين','طريق','طاقة','طفل','طبيب','طموح','طوفان',
  'طلوع','طبيعة','طلب','طيب','طمع','طاولة','طماطم','طرب',
  // ─── ظ ───
  'ظبي','ظلام','ظفر','ظهر','ظمأ','ظلم','ظريف',
  // ─── ع ───
  'عقل','عسل','عمر','عود','علم','عدل','عمل','عيد',
  'عصفور','عنكبوت','عقرب','عملاق','عالم','عريس','عبير','عجب',
  'عزيمة','عظمة','عمارة','عطاء','عاطفة','عقيدة','عجلة','عطر',
  // ─── غ ───
  'غابة','غيم','غزال','غنم','غريب','غاية','غسيل','غروب',
  // ─── ف ───
  'فيل','فجر','فرح','فصل','فلك','فهد','فنجان','فريق',
  'فكرة','فضاء','فخر','فاكهة','فؤاد','فضة','فائز','فصول',
  // ─── ق ───
  'قمر','قلم','قوس','قرد','قصة','قمح','قلعة','قنديل',
  'قاموس','قنبلة','قافلة','قمة','قرار','قيادة','قهوة','قادم',
  'قبة','قبول','قدرة','قنوات','قبائل','قرية','قصيدة','قيمة',
  // ─── ك ───
  'كتاب','كلب','كنز','كرة','كوكب','كريم','كسرة','كيان',
  'كهف','كرامة','كلام','كتابة','كيمياء','كنيسة','كافل','كثبان',
  // ─── ل ───
  'ليل','لقمة','لجين','لهب','لمعة','لوحة','لباس','لبيب',
  'لسان','لؤلؤ','لحظة','لقاء','لياقة','لهفة','لطيف','لعبة',
  // ─── م ───
  'ماء','مطر','مدرسة','مكتب','مسجد','ملعب','مسبح','مدينة',
  'مزارع','منارة','معلم','ميدان','مكتبة','ملك','مسافر','مغامر',
  'مصباح','منهج','مجتمع','محيط','مستقبل','مرونة','منطق','مصدر',
  'مرجان','مرسال','مشروع','معنى','مسار','منزل','مجال','مثال',
  // ─── ن ───
  'نار','نور','نجم','نهر','نسر','نخل','نبات','نسيم',
  'نضال','نجاح','نبيل','نفوذ','نشاط','نظام','نطاق','نعمة',
  'نمو','نقاء','نهضة','نموذج','نظرة','نشيد','نبضة','نقطة',
  // ─── ه ───
  'هواء','هلال','هدف','هديل','همة','هيبة','هاجس','هدوء',
  // ─── و ───
  'ورد','وطن','وفاء','واحة','وداع','وضاء','وليد','وجدان',
  // ─── ي ───
  'يمام','يقين','ينبوع','يسر','يراع','يتيم','يلدز',
];

// بناء الفهرس: حرف أول → حرف أخير → [ كلمات ]
const WORD_INDEX = {};
for (const w of WORD_BANK_RAW) {
  if (!w || w.length < 2) continue;
  const f = normalizeChar(w[0]);
  const l = normalizeChar(w[w.length - 1]);
  if (!WORD_INDEX[f]) WORD_INDEX[f] = {};
  if (!WORD_INDEX[f][l]) WORD_INDEX[f][l] = [];
  WORD_INDEX[f][l].push(w);
}

// جميع أزواج الحروف المتاحة
const VALID_PAIRS = [];
for (const f of Object.keys(WORD_INDEX)) {
  for (const l of Object.keys(WORD_INDEX[f])) {
    if (WORD_INDEX[f][l].length > 0) VALID_PAIRS.push({ first: f, last: l });
  }
}

// ══════════════════════════════════════════════════════════════════════
//  حالة اللعبة
// ══════════════════════════════════════════════════════════════════════

let GAME_ACTIVE = false;

// ══════════════════════════════════════════════════════════════════════
//  أدوات مساعدة
// ══════════════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function resetGame() { GAME_ACTIVE = false; }

function normalizeChar(ch) {
  if (!ch) return ch;
  return ch
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g,  'ي')
    .replace(/ة/g,  'ه');
}

function normalizeWord(s) {
  return (s || '')
    .replace(/[\u064B-\u065F]/g, '') // إزالة التشكيل
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FF]/g, '')
    .trim();
}

/** اختيار زوج حروف عشوائي مناسب للمستوى */
function pickLetterPair(level) {
  // مستوى سهل: كلمات أكثر في القاموس
  // مستوى صعب: كلمات أقل
  let filtered = VALID_PAIRS;
  if (level === 'easy')   filtered = VALID_PAIRS.filter(p => (WORD_INDEX[p.first][p.last]?.length ?? 0) >= 5);
  if (level === 'medium') filtered = VALID_PAIRS.filter(p => (WORD_INDEX[p.first][p.last]?.length ?? 0) >= 2);
  if (!filtered.length) filtered = VALID_PAIRS;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

/** تحقق محلي سريع */
function validateLocal(first, last, answer) {
  const norm = normalizeWord(answer);
  if (norm.length < 2) return false;
  const f = normalizeChar(norm[0]);
  const l = normalizeChar(norm[norm.length - 1]);
  const nf = normalizeChar(first);
  const nl = normalizeChar(last);
  return f === nf && l === nl;
}

/** تحقق بالذكاء الاصطناعي (احتياطي) */
async function validateWithAI(first, last, answer) {
  if (!geminiModel) return false;
  try {
    const prompt =
      `لعبة كلمات: الكلمة يجب أن تبدأ بـ"${first}" وتنتهي بـ"${last}".\n` +
      `الكلمة المقترحة: "${answer}"\n` +
      `هل هي كلمة عربية صحيحة تبدأ وتنتهي بالحرفين المحددين؟\n` +
      `أجب بـ"نعم" أو "لا" فقط.`;
    const result = await geminiModel.generateContent(prompt);
    const text = (result.response?.text?.() ?? '').trim();
    return text.startsWith('نعم');
  } catch (_) {
    return false;
  }
}

/** توليد زوج حروف بالذكاء الاصطناعي (احتياطي) */
async function generatePairWithAI(level) {
  if (!geminiModel) return null;
  try {
    const prompt =
      `أعطني حرفين عربيين فقط بينهما شرطة للعبة كلمات.\n` +
      `مثال: "ن-ر" أو "س-م"\n` +
      `المستوى: ${level === 'easy' ? 'سهل (حروف شائعة)' : level === 'medium' ? 'متوسط' : 'صعب (حروف نادرة)'}\n` +
      `أجب بالحرفين فقط.`;
    const result = await geminiModel.generateContent(prompt);
    const text = (result.response?.text?.() ?? '').trim();
    const letters = text.match(/[\u0600-\u06FF]/g) ?? [];
    if (letters.length >= 2) return { first: letters[0], last: letters[1] };
  } catch (_) {}
  return null;
}

/** فحص الكلمة: محلي أولاً، ثم AI */
async function validateAnswer(first, last, answer) {
  if (validateLocal(first, last, answer)) return true;
  return validateWithAI(first, last, answer);
}

// ══════════════════════════════════════════════════════════════════════
//  رسم صورة القنبلة (Canvas)
// ══════════════════════════════════════════════════════════════════════

async function buildBombCanvas({ holder, first, last, round, timeLeft, maxTime, strikes }) {
  if (!createCanvas) return null;

  try {
    if (GlobalFonts) {
      const fontPath = path.resolve(__dirname, '../img/Fonts/IBMBold.ttf');
      try { GlobalFonts.registerFromPath(fontPath, 'IBM'); } catch (_) {}
    }
    const FONT = (GlobalFonts?.has?.('IBM')) ? 'IBM' : 'sans-serif';

    const W = 900, H = 420;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ── خلفية متدرجة داكنة ──
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0,   '#0d0d0d');
    bg.addColorStop(0.5, '#1a0a0a');
    bg.addColorStop(1,   '#0d0d0d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── شبكة نقطية خفيفة ──
    ctx.fillStyle = 'rgba(255,60,60,0.06)';
    for (let x = 0; x < W; x += 28) {
      for (let y = 0; y < H; y += 28) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── إطار متوهج ──
    ctx.strokeStyle = 'rgba(232,64,64,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    ctx.strokeStyle = 'rgba(232,64,64,0.2)';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, W - 16, H - 16);

    // ── أيقونة القنبلة ──
    const bx = 150, by = H / 2;
    // الجسم
    const bombGrad = ctx.createRadialGradient(bx - 12, by - 12, 5, bx, by, 72);
    bombGrad.addColorStop(0, '#555');
    bombGrad.addColorStop(1, '#111');
    ctx.beginPath();
    ctx.arc(bx, by, 72, 0, Math.PI * 2);
    ctx.fillStyle = bombGrad;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.stroke();

    // بريق القنبلة
    ctx.beginPath();
    ctx.arc(bx - 22, by - 22, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();

    // الفتيل
    ctx.beginPath();
    ctx.moveTo(bx + 50, by - 55);
    ctx.bezierCurveTo(bx + 80, by - 95, bx + 105, by - 65, bx + 90, by - 40);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // لهب الفتيل
    const progress = timeLeft / maxTime;
    if (progress > 0.15) {
      const fx = bx + 90, fy = by - 40;
      const flameGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 18);
      flameGrad.addColorStop(0,   '#fff');
      flameGrad.addColorStop(0.3, '#ffcc00');
      flameGrad.addColorStop(0.7, '#ff6600');
      flameGrad.addColorStop(1,   'rgba(255,0,0,0)');
      ctx.beginPath();
      ctx.arc(fx, fy, 18, 0, Math.PI * 2);
      ctx.fillStyle = flameGrad;
      ctx.fill();
    }

    // ── الحروف الرئيسية ──
    const cx = 510, cy = H / 2;

    // دائرة خلفية للحروف
    ctx.beginPath();
    ctx.arc(cx, cy, 130, 0, Math.PI * 2);
    const circGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, 130);
    circGrad.addColorStop(0, 'rgba(232,64,64,0.15)');
    circGrad.addColorStop(1, 'rgba(232,64,64,0.03)');
    ctx.fillStyle = circGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,64,64,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // الحروف
    ctx.font      = `bold 110px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ظل أحمر متوهج
    ctx.shadowColor = '#e84040';
    ctx.shadowBlur  = 35;
    ctx.fillStyle   = '#ff6b6b';
    ctx.fillText(first, cx - 68, cy);

    ctx.fillStyle = 'rgba(200,200,200,0.4)';
    ctx.font      = `bold 55px ${FONT}`;
    ctx.fillText('—', cx, cy);

    ctx.shadowColor = '#4de8b4';
    ctx.shadowBlur  = 35;
    ctx.fillStyle   = '#4de8b4';
    ctx.font        = `bold 110px ${FONT}`;
    ctx.fillText(last, cx + 68, cy);

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // ── شريط الوقت ──
    const barX = 40, barY = H - 42, barW = W - 80, barH = 14;
    const barR = 7;

    // خلفية الشريط
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, barR);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();

    // لون الشريط حسب الوقت
    const ratio = timeLeft / maxTime;
    let barColor;
    if (ratio > 0.5)      barColor = '#2ecc71';
    else if (ratio > 0.25) barColor = '#f39c12';
    else                   barColor = '#e74c3c';

    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * ratio, barH, barR);
    ctx.fillStyle = barColor;
    ctx.shadowColor = barColor;
    ctx.shadowBlur  = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── معلومات الجولة ──
    ctx.font      = `bold 22px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`الجولة ${round}`, W - 24, 22);

    // ── اسم حامل القنبلة ──
    ctx.font      = `bold 26px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.fillText(`💣 ${holder.displayName}`, cx, 52);

    // ── الضربات (strikes) ──
    const strikeSymbols = '💥'.repeat(strikes) + '⚫'.repeat(MAX_STRIKES - strikes);
    ctx.font      = `24px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = strikes > 0 ? '#e74c3c' : '#555';
    ctx.fillText(strikeSymbols, 28, 28);

    // ── صورة المستخدم ──
    try {
      const av = await loadImage(holder.avatarURL);
      const ax = bx, ay = by + 92;
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax, ay, 30, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(av, ax - 30, ay - 30, 60, 60);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(ax, ay, 30, 0, Math.PI * 2);
      ctx.strokeStyle = '#e84040';
      ctx.lineWidth   = 2.5;
      ctx.stroke();
    } catch (_) {}

    return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'bomb_round.png' });
  } catch (e) {
    console.error('[Bomb] Canvas error:', e);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  تصدير الأمر
// ══════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'bomb',
  aliases: ['قنبلة', 'بومب'],

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
    const bar = '█'.repeat(Math.round((ps.length / MAX_PLAYERS) * 10))
              + '░'.repeat(10 - Math.round((ps.length / MAX_PLAYERS) * 10));
    const list = ps.length
      ? ps.map((p, i) => `> \`${String(i + 1).padStart(2, '0')}\` <@${p.id}>`).join('\n')
      : '> *لا يوجد لاعبون — كن أول المنضمين!*';

    const c = new ContainerBuilder()
      .setAccentColor(CLR.main)
      .addTextDisplayComponents(t => t.setContent(
        `## 💣 لعبة القنبلة\n` +
        `⏰ ينتهي الانضمام: <t:${deadline}:R>\n\n` +
        `**اللاعبون \`${ps.length}/${MAX_PLAYERS}\`** \`${bar}\`\n\n` +
        `${list}\n\n` +
        `-# كوّن كلمة عربية تبدأ وتنتهي بالحرفين قبل أن تنفجر القنبلة!`,
      ));

    const img = config.lobbyImages?.bomb;
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
        strikes: 0,
      });
    } else {
      if (!players.some(p => p.id === i.user.id)) {
        await i.reply({ content: '⚠️ لست في اللعبة!', ephemeral: true });
        return;
      }
      players = players.filter(p => p.id !== i.user.id);
    }
    await i.update({ components: [buildLobby(players)], flags: MessageFlags.IsComponentsV2 });
  });

  col.on('end', async () => {
    // أغلق اللوبي
    try {
      await lobbyMsg.edit({
        components: [
          new ContainerBuilder()
            .setAccentColor(CLR.neutral)
            .addTextDisplayComponents(t => t.setContent(
              `### 🔒 انتهى الانضمام\n` +
              `اللاعبون: ${players.map(p => `<@${p.id}>`).join(' • ') || 'لا يوجد'}`,
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
              `### ❌ عدد غير كافٍ\nيحتاج **${MIN_PLAYERS}** لاعبين على الأقل.`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      resetGame();
      callback();
      return;
    }

    // ابدأ اللعبة
    const state = {
      players,
      round: 0,
      holder: players[Math.floor(Math.random() * players.length)],
    };

    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(CLR.main)
          .addTextDisplayComponents(t => t.setContent(
            `## 💣 بدأت اللعبة!\n\n` +
            `**اللاعبون:**\n${players.map(p => `> <@${p.id}>`).join('\n')}\n\n` +
            `> <@${state.holder.id}> بدأ بحمل القنبلة! 🎯\n\n` +
            `-# لديك ${MAX_STRIKES} ضربات قبل الخروج`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    await sleep(3000);
    await gameLoop(context, state, callback);
  });
}

// ══════════════════════════════════════════════════════════════════════
//  حلقة اللعبة الرئيسية
// ══════════════════════════════════════════════════════════════════════

async function gameLoop(context, state, callback) {
  if (await checkWin(context, state, callback)) return;

  state.round += 1;

  // تحديد مستوى الصعوبة
  const level =
    state.round <= 5  ? 'easy' :
    state.round <= 12 ? 'medium' : 'hard';

  // وقت الإجابة يتقلص
  const answerTime = Math.max(
    MIN_ANSWER_TIME,
    BASE_ANSWER_TIME - (state.round - 1) * TIME_SHRINK_PER_RD,
  );

  // اختر زوج حروف
  let pair = pickLetterPair(level);

  // إذا توفر AI، حاول استخدامه للمستوى الصعب فقط
  if (geminiModel && level === 'hard') {
    const aiPair = await generatePairWithAI(level);
    if (aiPair) pair = aiPair;
  }

  const { first, last } = pair;

  // ── أرسل صورة القنبلة ──
  const attachment = await buildBombCanvas({
    holder  : state.holder,
    first, last,
    round   : state.round,
    timeLeft: answerTime,
    maxTime : BASE_ANSWER_TIME,
    strikes : state.holder.strikes,
  });

  const roundMsg = {
    components: [
      new ContainerBuilder()
        .setAccentColor(CLR.main)
        .addTextDisplayComponents(t => t.setContent(
          `## 💣 الجولة ${state.round} — مستوى ${level === 'easy' ? '🟢 سهل' : level === 'medium' ? '🟡 متوسط' : '🔴 صعب'}\n\n` +
          `<@${state.holder.id}> — كوّن كلمة تبدأ بـ **${first}** وتنتهي بـ **${last}**\n\n` +
          `⏱️ لديك **${answerTime / 1000} ثانية**\n` +
          `-# الضربات: ${'💥'.repeat(state.holder.strikes)}${'⚫'.repeat(MAX_STRIKES - state.holder.strikes)}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
  if (attachment) roundMsg.files = [attachment];

  await context.channel.send(roundMsg);

  // ── مرحلة الإجابة ──
  const survived = await answerPhase(context, state, first, last, answerTime);

  if (!survived) {
    state.holder.strikes += 1;

    if (state.holder.strikes >= MAX_STRIKES) {
      // طرد اللاعب
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(CLR.danger)
            .addTextDisplayComponents(t => t.setContent(
              `## 💥 انفجرت القنبلة!\n\n` +
              `<@${state.holder.id}> وصل للحد الأقصى من الضربات ويغادر اللعبة!\n\n` +
              `-# الجولة التالية تبدأ بعد لحظات...`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      const eliminatedId = state.holder.id;
      state.players = state.players.filter(p => p.id !== eliminatedId);

      if (await checkWin(context, state, callback)) return;

      // اختر حامل جديد عشوائياً
      state.holder = state.players[Math.floor(Math.random() * state.players.length)];
    } else {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(CLR.warn)
            .addTextDisplayComponents(t => t.setContent(
              `## ⚠️ ضربة!\n\n` +
              `<@${state.holder.id}> لم يُجب في الوقت — ضربة ${state.holder.strikes}/${MAX_STRIKES}\n\n` +
              `-# يختار لاعباً آخر لمنحه القنبلة أو تنتقل عشوائياً`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      // مع ضربة، لا يزال عليه تمرير القنبلة
    }
  }

  if (await checkWin(context, state, callback)) return;

  // ── مرحلة التمرير ──
  const next = await choosePhase(context, state);

  if (next) {
    state.holder = next.player;
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(next.random ? CLR.warn : CLR.neutral)
          .addTextDisplayComponents(t => t.setContent(
            next.random
              ? `🎲 القنبلة انتقلت عشوائياً إلى <@${state.holder.id}>!`
              : `✅ <@${state.holder.id}> استلم القنبلة — استعد!`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  } else {
    // لم يختر — عشوائي
    state.holder = state.players[Math.floor(Math.random() * state.players.length)];
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(CLR.warn)
          .addTextDisplayComponents(t => t.setContent(
            `⏰ انتهى الوقت — القنبلة تنتقل عشوائياً لـ <@${state.holder.id}>!`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  await sleep(2500);
  await gameLoop(context, state, callback);
}

// ══════════════════════════════════════════════════════════════════════
//  مرحلة الإجابة
// ══════════════════════════════════════════════════════════════════════

function answerPhase(context, state, first, last, timeLimit) {
  return new Promise(resolve => {
    const col = context.channel.createMessageCollector({
      filter: m => m.author.id === state.holder.id && !m.author.bot,
      time: timeLimit,
    });

    const usedWords = new Set();
    let resolved = false;

    col.on('collect', async msg => {
      if (resolved) return;

      const answer = msg.content.trim();

      // رفض الكلمات المكررة
      if (usedWords.has(answer)) {
        try { await msg.react('🔁'); } catch (_) {}
        return;
      }

      // تحقق
      const ok = await validateAnswer(first, last, answer);

      if (ok) {
        resolved = true;
        usedWords.add(answer);
        col.stop('passed');

        await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(CLR.success)
              .addTextDisplayComponents(t => t.setContent(
                `### ✅ إجابة صحيحة!\n<@${state.holder.id}> قال: **${answer}**\n-# اختر من يأخذ القنبلة`,
              )),
          ],
          flags: MessageFlags.IsComponentsV2,
        });

        resolve(true);
      } else {
        try { await msg.react('❌'); } catch (_) {}
        // إذا كانت الكلمة خاطئة تحقق من السبب
        const normAns = normalizeWord(answer);
        if (normAns.length < 2) return;
        const f = normalizeChar(normAns[0]);
        const l = normalizeChar(normAns[normAns.length - 1]);
        const nf = normalizeChar(first);
        const nl = normalizeChar(last);

        let hint = '';
        if (f !== nf && l !== nl) hint = `الكلمة يجب أن تبدأ بـ **${first}** وتنتهي بـ **${last}**`;
        else if (f !== nf)         hint = `الكلمة يجب أن تبدأ بـ **${first}**`;
        else if (l !== nl)         hint = `الكلمة يجب أن تنتهي بـ **${last}**`;

        if (hint) {
          try {
            await msg.reply({
              content: `⚠️ ${hint}`,
              allowedMentions: { repliedUser: false },
            });
          } catch (_) {}
        }
      }
    });

    col.on('end', (_, reason) => {
      if (reason !== 'passed') resolve(false);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
//  مرحلة الاختيار (تمرير القنبلة)
// ══════════════════════════════════════════════════════════════════════

function choosePhase(context, state) {
  return new Promise(async resolve => {
    const others = state.players.filter(p => p.id !== state.holder.id);
    if (!others.length) { resolve(null); return; }

    // بناء Select Menu
    const menu = new StringSelectMenuBuilder()
      .setCustomId('choose_player')
      .setPlaceholder('🎯 اختر لاعباً لتمرير القنبلة')
      .addOptions(
        others.slice(0, 25).map(p =>
          new StringSelectMenuOptionBuilder()
            .setLabel(p.displayName.slice(0, 100))
            .setValue(p.id)
            .setDescription(`الضربات: ${'💥'.repeat(p.strikes)}${'⚫'.repeat(MAX_STRIKES - p.strikes)}`.slice(0, 100)),
        ),
      );

    const container = new ContainerBuilder()
      .setAccentColor(CLR.main)
      .addTextDisplayComponents(t => t.setContent(
        `### 💣 <@${state.holder.id}> — مرر القنبلة!\n` +
        `لديك **${CHOOSE_TIME / 1000} ثانية** لاختيار لاعب.\n` +
        `-# اللاعبون بضربات أكثر يغادرون أسرع!`,
      ))
      .addActionRowComponents(r => r.setComponents(menu))
      .addActionRowComponents(r => r.setComponents(
        new ButtonBuilder().setCustomId('random_pass').setLabel('🎲 عشوائي').setStyle(ButtonStyle.Secondary),
      ));

    const msg = await context.channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });

    const col = msg.createMessageComponentCollector({
      filter: i => i.user.id === state.holder.id &&
                   (i.customId === 'choose_player' || i.customId === 'random_pass'),
      time: CHOOSE_TIME,
      max: 1,
    });

    col.on('collect', async i => {
      try { await i.deferUpdate(); } catch (_) {}

      // أغلق الأزرار
      try {
        await msg.edit({
          components: [
            new ContainerBuilder()
              .setAccentColor(CLR.neutral)
              .addTextDisplayComponents(t => t.setContent('🔒 تم الاختيار.')),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch (_) {}

      if (i.customId === 'random_pass') {
        resolve({ player: others[Math.floor(Math.random() * others.length)], random: true });
      } else {
        const target = state.players.find(p => p.id === i.values[0]) ?? others[0];
        resolve({ player: target, random: false });
      }
    });

    col.on('end', async collected => {
      if (collected.size === 0) {
        try {
          await msg.edit({
            components: [
              new ContainerBuilder()
                .setAccentColor(CLR.warn)
                .addTextDisplayComponents(t => t.setContent('⏰ انتهى وقت الاختيار.')),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch (_) {}
        resolve(null);
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
//  فحص الفوز
// ══════════════════════════════════════════════════════════════════════

async function checkWin(context, state, callback) {
  if (state.players.length === 1) {
    const winner = state.players[0];
    const pts = (() => {
      const p = config.winPoints?.bomb;
      if (!p) return 100;
      if (typeof p === 'object') return Math.floor(Math.random() * (p.max - p.min + 1)) + p.min;
      return p;
    })();
    await db.addPoints(winner.id, pts);

    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(CLR.gold)
          .addTextDisplayComponents(t => t.setContent(
            `## 👑 انتهت اللعبة!\n\n` +
            `🏆 **<@${winner.id}>** فاز بعد **${state.round}** جولة!\n` +
            `🎖️ حصل على **${pts}** نقطة!\n\n` +
            `-# شكراً لجميع اللاعبين!`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    resetGame();
    callback();
    return true;
  }

  if (state.players.length === 0) {
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(CLR.neutral)
          .addTextDisplayComponents(t => t.setContent('### 💨 اللعبة انتهت بدون فائز!')),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
    resetGame();
    callback();
    return true;
  }

  return false;
}
