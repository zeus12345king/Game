'use strict';

// ═══════════════════════════════════════════════════════════════════
//  🕵️  لعبة الجاسوس — نسخة مُعاد هيكلتها بالكامل
// ═══════════════════════════════════════════════════════════════════

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  InteractionWebhook,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const db     = require('../database.js');
const config = require('../config.js');
const path   = require('path');
const https  = require('https');
const http   = require('http');

// ─── ثوابت ───────────────────────────────────────────────────────
const MIN_PLAYERS   = 3;
const MAX_PLAYERS   = 10;
const LOBBY_TIME    = config.lobbyTime?.outsider ?? 60_000;

const TIMES = {
  classic:   { hint: 35_000, vote: 25_000, lastGuess: 30_000 },
  questions: { vote: 25_000, minRounds: 4 },
};

// ═══════════════════════════════════════════════════════════════════
//  🎨  قسم الإيموجيات — كل الإيموجيات من هنا فقط
// ═══════════════════════════════════════════════════════════════════
const EMOJI = {
  // إيموجيات مخصصة
  Z1:          '<:z1:1511780346008436946>',
  Z2:          '<:z2:1511780387506880542>',
  Z3:          '<:z3:1511872921142825040>',

  // أدوار
  SPY:         '🕵️‍♂️',
  GROUP:       '✅',
  MULTI_SPY:   '🕵️',

  // أوضاع اللعب
  CLASSIC:     '🎯',
  QUESTIONS:   '❓',
  DOUBLE:      '🕵️‍♂️',

  // مراحل اللعبة
  HINT:        '💬',
  VOTE:        '🗳️',
  RESULT:      '🏆',
  REVEAL:      '📊',
  JUDGE:       '📋',
  ROUND:       '🔄',
  LOCK:        '🔒',
  TIMER:       '⏰',
  BOT:         '🤖',

  // نتائج
  WIN_GROUP:   '🎯',
  WIN_SPY:     '🕵️',
  CORRECT:     '✅',
  WRONG:       '❌',
  WARN:        '⚠️',
  SKIP:        '⏭️',
  MEDAL:       '🏅',

  // تفاعل
  MIC:         '🎤',
  CHAT:        '💬',
  NEXT:        '🎯',
  WRITE:       '✍️',
  SEND:        '📤',
  GUESS:       '🔮',
  QUESTION:    '❓',
  ANSWER:      '💬',
  LAST_CHANCE: '🎲',
  STAR:        '⭐',
  CROWN:       '👑',
  TARGET:      '🎯',
  PEOPLE:      '👥',
  LETTER:      '📨',
  NOTE:        '📝',
  INFO:        '-#',
};

// ─── إيموجيات مستعارة ─────────────────────────────────────────────
const Z1_EMOJI = EMOJI.Z1;
const Z2_EMOJI = EMOJI.Z2;

// ═══════════════════════════════════════════════════════════════════
//  📚  بنك الكلمات
// ═══════════════════════════════════════════════════════════════════
const WORD_BANK = {
  '🐾 حيوانات': [
    'بقرة','قطة','كلب','فيل','أسد','قرد','ببغاء','سمكة','دجاجة','أرنب',
    'نمر','زرافة','حوت','دلفين','تمساح','ذئب','ثعلب','غوريلا','حصان','بطريق',
    'عقرب','نسر','طاووس','خروف','جمل','غزال','ضبع','وشق','كنغر','كوالا',
    'باندا','نعامة','فقمة','فرس نهر','وحيد قرن','سلحفاة','ضفدع','ثعبان','سحلية',
    'نجمة بحر','قنديل بحر','أخطبوط','حبار','سرطان بحر','جمبري','محار','فراشة','نحلة',
    'يعسوب','صرصور','جندب','نملة','دعسوقة','عنكبوت','خفاش','سنجاب','قنفذ','فأر',
    'جرذ','نيص','خنزير بري','أيل','موظ','ثور','جاموس','ماعز','حمار','بغل',
    'لاما','ألبكة','تابير','آكل النمل','مدرع','نمس','قضاعة','وبار','إيكيدنا','كسلان'
  ],
  '🍕 طعام وشراب': [
    'بيتزا','برغر','شوكولاتة','قهوة','شاي','عصير','خبز','جبنة','أيسكريم',
    'كنافة','مندي','مطبق','تمر','رمان','بطيخ','فراولة','سمبوسة','لقيمات',
    'مشاوي','كباب','شاورما','فول','كاري','ماكارون','تشيز كيك','سلطة','شوربة','بيض',
    'أرز','مكرونة','سمك مشوي','روبيان','حمص','فلافل','متبل','لبن','زبادي','عسل',
    'زيت زيتون','كسكس','بسبوسة','قطايف','مهلبية','أم علي','بقلاوة',
    'مانجو','تفاح','موز','برتقال','ليمون','كيوي','عنب','خوخ','كمثرى','مشمش',
    'توت','لوز','جوز','فستق','كاجو','بندق','دبس','طحينة','مربى','نوتيلا'
  ],
  '🏙️ أماكن': [
    'مستشفى','مطعم','مدرسة','مطار','ملعب','سينما','مكتبة','فندق','شاطئ',
    'غابة','صحراء','جبل','قرية','مدينة','مسجد','كنيسة','ميناء','متحف',
    'حديقة','سوق','محطة قطار','ملاهي','مخيم','قلعة','برج','ناطحة سحاب','مسرح',
    'دار أوبرا','معرض فنون','قبة سماوية','مرصد فلكي','معبد','كاتدرائية','ضريح',
    'مقبرة','مصنع','مزرعة','حظيرة','إسطبل','مخبز','محكمة','شرطة','بريد','بنك',
    'بورصة','سفارة','قنصلية','وزارة','جامعة','كلية','معهد','روضة أطفال',
    'مركز ثقافي','ملعب تنس','ملعب غولف','حلبة سباق','حديقة حيوان','أكواريوم','كهف'
  ],
  '📱 تقنية وأجهزة': [
    'هاتف','حاسوب','كاميرا','سماعة','تلفزيون','طابعة','ساعة ذكية','لابتوب',
    'جهاز لوحي','روبوت','طائرة مسيّرة','شاحن','سماعات أذن','شاشة','لوحة مفاتيح',
    'فأرة كمبيوتر','ماسح ضوئي','ميكروفون','ويب كام','نظارة ذكية','حزام لياقة',
    'فرن ميكروويف','غلاية كهربائية','محضرة طعام','خلاط','عصارة','غسالة أطباق',
    'مكنسة كهربائية','روبوت كنس','منقي هواء','مرطب','مكيف صحراوي','سخان مياه',
    'طابعة ثلاثية الأبعاد','جهاز توجيه','مبدل شبكة','موجه لاسلكي','خادم',
    'بطارية خارجية','اردوينو','رسبري باي','شاشة لمس','قارئ إلكتروني','خاتم ذكي',
    'نظارة واقع معزز','خوذة واقع افتراضي','جهاز ألعاب محمول'
  ],
  '🎮 ترفيه ورياضة': [
    'كرة قدم','سباحة','تنس','كرة سلة','ملاكمة','دراجة','سكيت بورد',
    'شطرنج','ورق اللعب','بلياردو','كريكيت','غولف','جودو','كاراتيه','تايكوندو',
    'كونغ فو','مصارعة','رفع أثقال','جمباز','سنوكر','بولينج','هوكي','بيسبول',
    'كرة طائرة','كرة يد','إسكواش','ريشة طائرة','تنس طاولة','بادمنتون','لاكروس',
    'فروسية','ركوب أمواج','تزلج على الماء','تزلج جليدي','هوكي الجليد','كيرلنغ','تجديف',
    'كانو','كاياك','إبحار','غطس','صيد السمك','رماية','سباق سيارات','سباق دراجات',
    'ماراثون','يوجا','بيلاتس','رقص','باليه','رقص معاصر','زومبا'
  ],
  '🌍 طبيعة وفضاء': [
    'شمس','قمر','نجمة','مطر','ثلج','ريح','زلزال','بركان','نهر','بحيرة',
    'شلال','جليد','قوس قزح','كسوف','مذنب','كوكب','مجرة','سحابة','صاعقة','ضباب',
    'محيط','بحر','خليج','مضيق','جزيرة','أرخبيل','شبه جزيرة','مرجان',
    'غابة مطيرة','تايغا','تندرا','سهوب','براري','سافانا','مرج',
    'صخر','حجر','رمل','طين','معادن','بلورات','جبال','تلال','وديان','هضاب',
    'أخدود','صدع','كهف','شروق','غروب','فجر','غسق','ربيع','صيف','خريف','شتاء',
    'المريخ','المشتري','زحل','أورانوس','نبتون','كويكب','شهاب','ثقب أسود'
  ],
  '🏡 منزل وأثاث': [
    'سرير','كرسي','طاولة','باب','نافذة','مطبخ','حمام','مرآة','مصباح',
    'ثلاجة','غسالة','مكيف','تلفاز','ستارة','سجادة','أريكة','كنبة','دولاب','خزانة','رف',
    'مكتب','مقعد','براز','مفرش سرير','لحاف','وسادة','شماعة','سلة مهملات',
    'طاولة قهوة','طاولة طعام','كرسي هزاز','كرسي مكتب','كرسي مساج',
    'مدفأة','موقد حطب','سخان كهربائي','مروحة','غسالة صحون','حوض غسيل',
    'صنبور','مرحاض','حوض استحمام','دش','باركيه','رخام','جرانيت','سيراميك',
    'مقبض باب','قفل','جرس باب','كاميرا مراقبة','جهاز إنذار','كاشف دخان'
  ],
  '👕 ملابس وأزياء': [
    'قميص','بنطلون','جينز','تنورة','فستان','بلوزة','سترة','جاكيت','معطف','كنزة صوف',
    'تي شيرت','بولو','قميص نوم','بيجامة','رداء حمام','جورب','حذاء','صنادل',
    'حذاء رياضي','حذاء رسمي','جزمة','قبعة','طاقية','كاب','حجاب','نقاب','عقال',
    'غترة','شماغ','عباءة','جلباب','ثوب','دشداشة','بشت','كوفية',
    'حزام','ربطة عنق','سوار','قلادة','خاتم','قرط','دبوس ربط',
    'قفاز','وشاح','شال','منديل جيب','معطف مطر','معطف فرو','جاكت جينز'
  ],
  '👨‍⚕️ وظائف ومهن': [
    'طبيب','مهندس','معلم','محامي','تاجر','عامل','موظف','مدير','فنان','موسيقي',
    'ممرض','صيدلي','طبيب أسنان','طبيب بيطري','جراح','معالج طبيعي','أخصائي نفسي',
    'مهندس معماري','مهندس مدني','مهندس كهرباء','مهندس ميكانيكي','مبرمج','مطور تطبيقات',
    'أمين مكتبة','باحث','صحفي','مراسل','محرر','كاتب','روائي','شاعر','مترجم','مذيع',
    'محاسب','مدقق حسابات','صراف','مصرفي','سمسار أوراق مالية','خبير اقتصادي',
    'طباخ','حلواني','خباز','نادل','حارس أمن','سائق','سائق شاحنة',
    'طيار','مضيف طيران','بحار','قبطان سفينة','غواص','صياد سمك',
    'نجار','سباك','كهربائي','لحام','ميكانيكي','دهان','بناء'
  ],
  '🎨 ألوان': [
    'أحمر','أخضر','أزرق','أصفر','برتقالي','بنفسجي','زهري','بني','أسود','أبيض',
    'رمادي','فضي','ذهبي','نحاسي','برونزي','كرزي','فيروزي','كحلي','نيلي','موف',
    'خوخي','مشمشي','مرجاني','أرجواني','عنابي','بندقي','زيتوني','فستقي','كاكي','بيج',
    'كريمي','عاجي','لبني','ثلجي','سماوي','لازوردي','بحري','تركواز','فوشيا',
    'أوركيد','لافندر','أرجواني فاتح','أزرق نيلي','أزرق كهربائي','أزرق جينز',
    'زيتي','خردلي','ذهبي وردي','نبيتي','أحمر غامق','زهري فاتح','زهري غامق'
  ],
  '😊 مشاعر وأحاسيس': [
    'فرح','سعادة','مرح','بهجة','سرور','ابتهاج','رضا','امتنان','حب',
    'حزن','أسى','كآبة','يأس','اكتئاب','لوعة','حسرة','ندم','غم',
    'غضب','غيظ','حنق','سخط','استياء','كراهية','بغض','حسد','غيرة',
    'خوف','رهبة','فزع','ذعر','هلع','قلق','توتر','اضطراب','وجل',
    'دهشة','اندهاش','ذهول','استغراب','عجب','انبهار','حيرة','ارتباك','شك',
    'أمل','تفاؤل','رجاء','ثقة','اطمئنان','سلام داخلي','رضا','قبول','تسامح',
    'وحدة','عزلة','غربة','اشتياق','حنين','ولع','شغف',
    'كبرياء','عزة','زهو','غرور','ذل','هوان','خزي','عار'
  ],
  '🌟 صفات عامة': [
    'جميل','قبيح','طويل','قصير','كبير','صغير','سمين','نحيف','قوي','ضعيف',
    'سريع','بطيء','حار','بارد','دافئ','مثلج','لطيف','خشن','ناعم','صلب',
    'سهل','صعب','بسيط','معقد','واضح','غامض','مشرق','معتم','لامع','باهت',
    'جديد','قديم','حديث','تقليدي','غالي','رخيص','غني','فقير','سعيد','حزين',
    'نشيط','كسول','ماهر','أخرق','ذكي','غبي','حاد','بليد','شجاع','جبان',
    'كريم','بخيل','صادق','كاذب','مخلص','خائن','صبور','نفاذ الصبر','مرن','عنيد',
    'هادئ','عصبي','مرح','جدّي','اجتماعي','انطوائي','ودود','فظ','مبتسم','عبوس'
  ],
  '🚗 مواصلات': [
    'سيارة','حافلة','شاحنة','دراجة نارية','دراجة هوائية','قطار','ترام','مترو','تاكسي',
    'طائرة','مروحية','طائرة شراعية','منطاد','طائرة خفيفة','طائرة نفاثة','طائرة شحن',
    'سفينة','قارب','عبارة','زورق','يخت','ناقلة نفط','حاملة حاويات','غواصة',
    'جرار زراعي','حفارة','رافعة','جرافة','شوكة رفع','مدحلة','قلابة','شاحنة إطفاء',
    'سيارة إسعاف','سيارة شرطة','مدرعة','عربة ثلجية','زلاجة','سكوتر','لوح تزلج كهربائي'
  ],
  '🧠 أجزاء الجسم': [
    'رأس','شعر','وجه','جبين','عين','حاجب','رموش','جفن','أنف','فم',
    'شفاه','أسنان','لسان','لثة','ذقن','خد','أذن','رقبة','حلق',
    'كتف','ذراع','كوع','ساعد','معصم','كف','أصابع','إبهام','سبابة',
    'صدر','بطن','سرة','ظهر','خصر','ورك','ردف','فخذ',
    'ركبة','ساق','قدم','كاحل','عقب','أخمص','مشط','أصابع قدم','ظفر',
    'عظم','عضلة','مفصل','جلد','دم','عصب','شريان','وريد',
    'قلب','رئة','كبد','كلية','طحال','بنكرياس','مثانة','أمعاء','معدة'
  ],
  '📚 تعليم وأدوات مدرسية': [
    'كتاب','دفتر','قلم رصاص','قلم حبر','قلم جاف','ممحاة','براية','مسطرة',
    'برجل','منقلة','فرجار','مثلث','ألوان خشبية','ألوان مائية','ألوان زيتية',
    'طباشير','لوحة بيضاء','لوحة تفاعلية','سبورة','فلومستر','ماركر','هايلايتر',
    'مقص','غراء','شريط لاصق','دباسة','دبابيس','مشابك ورق','ملزمة',
    'حقيبة مدرسية','مقلمة','حافظة أوراق','ملف','رف كتب','جريدة','مجلة',
    'حاسوب مدرسي','جهاز عرض','كتاب إلكتروني','قارئ رقمي'
  ],
  '💎 مجوهرات وأحجار كريمة': [
    'ذهب','فضة','بلاتين','بلاديوم','نحاس أصفر','تيتانيوم','فيروز',
    'ألماس','ياقوت','زمرد','زفير','لؤلؤ','عقيق','جزع','يشب','كهرمان','مرجان',
    'عقيق أحمر','زبرجد','توباز','أوبال','جاديت','لابرادوريت','أمازونيت','مالاكيت','لازوريت',
    'ياقوت وردي','ياقوت أزرق','ياقوت أصفر','تسافوريت','سبينيل','الكسندريت','التانزانيت',
    'حجر القمر','حجر الشمس','حجر النمر','حجر العين الصقر','حجر العين الهرة'
  ],
  '🎬 شخصيات كرتونية وأنمي': [
    'ميكي ماوس','دونالد داك','بطوط','توم','جيري','سبونج بوب','باتريك',
    'سبايك','باغز باني','دافي داك','باباي','سبايدرمان','باتمان','سوبرمان',
    'ناروتو','ساسكي','ساكورا','كاكاشي','لوفي','زورو','نامي','سانجي',
    'إيتشيغو','إرين ييغر','ميكاسا','ليفاي','تانجيرو','نيزوكو','زينيتسو',
    'غوكو','فيجيتا','بيكولو','غوهان','دورايمون','نوبيتا','شيزوكا','جاين',
    'سيمبا','موفاسا','سكار','وودي','باز الضوء','لايتنينغ ماكوين','ماتر',
    'إلسا','آنا','رابونزل','سندريلا','الأميرة سيرينيتي','كابتن ماجد',
    'لايت ياغامي','ريم','مايك ووزوسكي','سالي','نيمو','دوري','شرك'
  ],
};

const ALL_WORDS = Object.values(WORD_BANK).flat();

// ─── حالة اللعبة ─────────────────────────────────────────────────
let GAME_ACTIVE = false;

// ════════════════════════════════════════════════════════════════════
//  أدوات مساعدة
// ════════════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function resetGame() { GAME_ACTIVE = false; }

function randomWord(categoryKey = null) {
  if (categoryKey && WORD_BANK[categoryKey]) {
    const arr = WORD_BANK[categoryKey];
    return arr[Math.floor(Math.random() * arr.length)];
  }
  return ALL_WORDS[Math.floor(Math.random() * ALL_WORDS.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** إرسال DM عبر InteractionWebhook */
async function sendDM(client, player, content) {
  try {
    const wh = new InteractionWebhook(
      client,
      player.msgInfo.applicationId,
      player.msgInfo.interactionToken,
    );
    await wh.send({ content, ephemeral: true });
  } catch (e) {
    console.error(`[Spy] فشل إرسال DM لـ ${player.id}:`, e);
  }
}

// ════════════════════════════════════════════════════════════════════
//  سجلات الحكم
// ════════════════════════════════════════════════════════════════════

const JUDGE_CHANNEL_ID = '1351312429354713098';

async function sendJudgeDM(client, content) {
  try {
    const judgeChannel = await client.channels.fetch(JUDGE_CHANNEL_ID);
    if (judgeChannel) {
      await judgeChannel.send(content);
    }
  } catch (e) {
    console.error('[Spy Judge] فشل إرسال التقرير:', e);
  }
}

// ════════════════════════════════════════════════════════════════════
//  أدوات تحميل الصور
// ════════════════════════════════════════════════════════════════════

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download image, status ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function loadGameImage(imagePathOrUrl, fallbackFileName = 'image.png') {
  if (!imagePathOrUrl) return null;
  try {
    if (imagePathOrUrl.startsWith('http://') || imagePathOrUrl.startsWith('https://')) {
      const buffer = await downloadImage(imagePathOrUrl);
      return new AttachmentBuilder(buffer, { name: fallbackFileName });
    } else {
      return new AttachmentBuilder(imagePathOrUrl, { name: path.basename(imagePathOrUrl) });
    }
  } catch (e) {
    console.error(`Failed to load image from ${imagePathOrUrl}:`, e);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════
//  جمع نص عبر Modal (بدلاً من رسالة عادية) — الحل الجوهري
// ════════════════════════════════════════════════════════════════════

/**
 * يُرسل رسالة بزر، وعند الضغط يفتح Modal يكتب فيه اللاعب نصه.
 * يمنع أخذ أي رسالة عشوائية من الشات.
 *
 * @param {TextChannel} channel   - القناة
 * @param {string}      userId    - معرف اللاعب الذي يجب أن يكتب
 * @param {number}      timeout   - مهلة الانتظار بالمللي ثانية
 * @param {object}      opts      - خيارات تخصيص
 * @param {string}      opts.buttonLabel  - نص الزر
 * @param {string}      opts.modalTitle   - عنوان النافذة
 * @param {string}      opts.inputLabel   - تسمية حقل الإدخال
 * @param {string}      opts.placeholder  - نص توضيحي داخل الحقل
 * @param {boolean}     opts.paragraph    - حقل متعدد الأسطر؟
 * @returns {Promise<string|null>}
 */
async function collectViaModal(channel, userId, timeout, opts = {}) {
  const {
    buttonLabel = `${EMOJI.WRITE} اكتب هنا`,
    modalTitle  = 'إدخال النص',
    inputLabel  = 'اكتب نصك',
    placeholder = '',
    paragraph   = false,
  } = opts;

  const btnId   = `modal_open_${userId}_${Date.now()}`;
  const modalId = `modal_submit_${userId}_${Date.now()}`;
  const inputId = 'modal_input';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(btnId)
      .setLabel(buttonLabel)
      .setStyle(ButtonStyle.Primary),
  );

  const triggerMsg = await channel.send({
    content: `<@${userId}>`,
    components: [row],
    fetchReply: true,
  });

  return new Promise(resolve => {
    const timeoutHandle = setTimeout(async () => {
      btnCollector.stop('timeout');
      try { await triggerMsg.edit({ components: [] }); } catch (_) {}
      resolve(null);
    }, timeout);

    const btnCollector = triggerMsg.createMessageComponentCollector({
      filter: i => i.customId === btnId && i.user.id === userId,
      max: 1,
    });

    btnCollector.on('collect', async (btnInteraction) => {
      clearTimeout(timeoutHandle);

      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle(modalTitle);

      const input = new TextInputBuilder()
        .setCustomId(inputId)
        .setLabel(inputLabel)
        .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200);

      if (placeholder) input.setPlaceholder(placeholder);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await btnInteraction.showModal(modal);

      try {
        const submitted = await btnInteraction.awaitModalSubmit({
          filter: i => i.customId === modalId && i.user.id === userId,
          time: 120_000,
        });
        await submitted.deferUpdate().catch(() => {});
        const value = submitted.fields.getTextInputValue(inputId).trim();
        try { await triggerMsg.edit({ components: [] }); } catch (_) {}
        resolve(value || null);
      } catch {
        try { await triggerMsg.edit({ components: [] }); } catch (_) {}
        resolve(null);
      }
    });

    btnCollector.on('end', (collected, reason) => {
      if (reason === 'timeout') resolve(null);
    });
  });
}

// ════════════════════════════════════════════════════════════════════
//  تصدير الأمر الرئيسي
// ════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'spy',
  aliases: ['الجاسوس', 'outsider', 'براالسالفة', 'برا'],

  async execute(message, args, callback) {
    if (GAME_ACTIVE) {
      await message.reply({
        content: `### ${EMOJI.WARN} اللعبة تعمل بالفعل!\nانتظر انتهاء الجولة الحالية ثم حاول مرة أخرى.`,
      });
      callback();
      return;
    }

    GAME_ACTIVE = true;
    await runLobby(message, callback);
  },
};

// ════════════════════════════════════════════════════════════════════
//  مرحلة الاستقبال (Lobby)
// ════════════════════════════════════════════════════════════════════

async function runLobby(context, callback) {
  const nowTime = Math.floor(Date.now() / 1000);
  const endTime = nowTime + Math.floor(LOBBY_TIME / 1000);

  let players = [];
  let currentMode = 'classic';
  const hostId = context.author?.id ?? context.user?.id;

  const lobbyImageFile = await loadGameImage(config.lobbyImages?.outsider, 'lobby.png');

  const buildContent = () =>
    `اللاعبين: **${players.length}/${MAX_PLAYERS}**\n**<t:${endTime}:R>**`;

  const buildComponents = () => {
    const rows = [];

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('join')
        .setEmoji(Z1_EMOJI)
        .setLabel('دخول')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('exit')
        .setEmoji(Z2_EMOJI)
        .setLabel('خروج')
        .setStyle(ButtonStyle.Secondary),
    );
    rows.push(actionRow);

    const modeSelect = new StringSelectMenuBuilder()
      .setCustomId('mode_select')
      .setPlaceholder(`${EMOJI.CLASSIC} اختر وضع اللعب`)
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('الكلاسيكي')
          .setDescription('كل لاعب يعطي تلميحاً، والجاسوس يخمن سراً')
          .setValue('classic')
          .setEmoji('🎯')
          .setDefault(currentMode === 'classic'),
        new StringSelectMenuOptionBuilder()
          .setLabel('الأسئلة')
          .setDescription('اللاعبون يسألون بعضهم — اكتشف الجاسوس!')
          .setValue('questions')
          .setEmoji('❓')
          .setDefault(currentMode === 'questions'),
        new StringSelectMenuOptionBuilder()
          .setLabel('الجواسيس المتعددين')
          .setDescription('جاسوسان أو أكثر يتخفون — إقصاءات متعددة')
          .setValue('double')
          .setEmoji('🕵️‍♂️')
          .setDefault(currentMode === 'double'),
      );
    rows.push(new ActionRowBuilder().addComponents(modeSelect));

    return rows;
  };

  const sendOptions = {
    content: buildContent(),
    components: buildComponents(),
    fetchReply: true,
  };
  if (lobbyImageFile) sendOptions.files = [lobbyImageFile];

  const lobbyMsg = await context.reply(sendOptions);

  const updateInterval = setInterval(async () => {
    try {
      await lobbyMsg.edit({ content: buildContent() }).catch(() => {});
    } catch (e) {}
  }, 10_000);

  const filter = (i) =>
    i.customId === 'join' ||
    i.customId === 'exit' ||
    i.customId === 'mode_select';

  const collector = lobbyMsg.createMessageComponentCollector({
    filter,
    time: LOBBY_TIME,
  });

  collector.on('collect', async (i) => {
    if (i.customId === 'mode_select') {
      if (i.user.id !== hostId) {
        await i.reply({ content: `${EMOJI.WARN} فقط من بدأ اللعبة يستطيع تغيير الوضع.`, ephemeral: true });
        return;
      }
      currentMode = i.values[0];
      await i.update({
        content: buildContent(),
        components: buildComponents(),
        files: lobbyImageFile ? [lobbyImageFile] : [],
      });
      return;
    }

    if (i.customId === 'join') {
      if (players.some(p => p.id === i.user.id)) {
        await i.reply({ content: `${EMOJI.CORRECT} أنت منضم بالفعل!`, ephemeral: true });
        return;
      }
      if (players.length >= MAX_PLAYERS) {
        await i.reply({ content: `${EMOJI.WARN} اللعبة ممتلئة!`, ephemeral: true });
        return;
      }
      players.push({
        id: i.user.id,
        displayName: i.member?.displayName ?? i.user.displayName,
        msgInfo: { applicationId: i.applicationId, interactionToken: i.token },
      });
    } else {
      if (!players.some(p => p.id === i.user.id)) {
        await i.reply({ content: `${EMOJI.WARN} لست في اللعبة أصلاً!`, ephemeral: true });
        return;
      }
      players = players.filter(p => p.id !== i.user.id);
    }

    await i.update({
      content: buildContent(),
      components: buildComponents(),
      files: lobbyImageFile ? [lobbyImageFile] : [],
    });
  });

  collector.on('end', async () => {
    clearInterval(updateInterval);
    try {
      await lobbyMsg.edit({ content: '', components: [] }).catch(() => {});
    } catch (_) {}

    if (players.length < MIN_PLAYERS) {
      await context.channel.send(`${EMOJI.SKIP} لم ينضم عدد كافٍ من اللاعبين. انتهى وقت الانضمام.`);
      resetGame();
      callback();
      return;
    }

    const category = await chooseCategory(context, hostId);
    if (!category) {
      await context.channel.send(`${EMOJI.TIMER} لم يتم اختيار قسم، سيتم اختيار كلمات من جميع الأقسام.`);
    }
    await context.channel.send(`${EMOJI.Z3} | تم الانتهاء من تسجيل اللاعبين، ستبدأ اللعبة بعد قليل...`);
    await sleep(4000);

    const opts = { context, players, callback, category };
    if      (currentMode === 'questions') await runQuestionsMode(opts);
    else if (currentMode === 'double')    await runDoubleAgentMode(opts);
    else                                  await runClassicMode(opts);
  });
}

// ════════════════════════════════════════════════════════════════════
//  اختيار القسم
// ════════════════════════════════════════════════════════════════════

async function chooseCategory(context, hostId) {
  const categories = Object.keys(WORD_BANK);
  const pageSize   = 25;
  const pages      = [];
  for (let i = 0; i < categories.length; i += pageSize) {
    pages.push(categories.slice(i, i + pageSize));
  }

  let currentPage = 0;

  function buildComponents(pageIndex) {
    const page = pages[pageIndex];
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('category_select')
      .setPlaceholder('اختر القسم...')
      .addOptions(
        page.map(cat =>
          new StringSelectMenuOptionBuilder()
            .setLabel(cat)
            .setValue(cat)
        )
      );

    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('prev_page')
        .setLabel('السابق')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex === 0),
      new ButtonBuilder()
        .setCustomId('next_page')
        .setLabel('التالي')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex === pages.length - 1)
    );

    return [new ActionRowBuilder().addComponents(selectMenu), navRow];
  }

  const msg = await context.channel.send({
    content: `**اختر قسم الكلمات (الصفحة ${currentPage + 1}/${pages.length}):**`,
    components: buildComponents(currentPage),
    fetchReply: true,
  });

  return new Promise(resolve => {
    const col = msg.createMessageComponentCollector({
      filter: i => i.user.id === hostId,
      time: 60_000,
    });

    col.on('collect', async i => {
      if (i.customId === 'category_select') {
        const chosen = i.values[0];
        await i.deferUpdate();
        col.stop();
        try { await msg.delete(); } catch (_) {}
        resolve(chosen);
      } else if (i.customId === 'prev_page') {
        currentPage--;
        await i.update({
          content: `**اختر قسم الكلمات (الصفحة ${currentPage + 1}/${pages.length}):**`,
          components: buildComponents(currentPage),
        });
      } else if (i.customId === 'next_page') {
        currentPage++;
        await i.update({
          content: `**اختر قسم الكلمات (الصفحة ${currentPage + 1}/${pages.length}):**`,
          components: buildComponents(currentPage),
        });
      }
    });

    col.on('end', async (collected, reason) => {
      if (reason !== 'messageDelete' && !collected.some(i => i.customId === 'category_select')) {
        try { await msg.delete(); } catch (_) {}
        resolve(null);
      }
    });
  });
}

// ════════════════════════════════════════════════════════════════════
//  🎯  الوضع الكلاسيكي
// ════════════════════════════════════════════════════════════════════

async function runClassicMode({ context, players, callback, category }) {
  const { hint: HINT_TIME, vote: VOTE_TIME } = TIMES.classic;

  const word        = randomWord(category);
  const outsiderIdx = Math.floor(Math.random() * players.length);
  const outsider    = players[outsiderIdx];
  const order       = shuffle(players);

  await sendJudgeDM(context.client,
    `${EMOJI.CLASSIC} وضع كلاسيكي:\n- الجاسوس: ${outsider.displayName} (${outsider.id})\n- الكلمة: ${word}\n- اللاعبون: ${players.map(p => p.displayName).join(', ')}`
  );

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(config.colors?.outsider ?? 0x6C3483)
        .addTextDisplayComponents(t => t.setContent(
          `## ${EMOJI.SPY} بدأت لعبة الجاسوس!\n` +
          `### الوضع الكلاسيكي ${EMOJI.CLASSIC}\n\n` +
          `${EMOJI.LETTER} جاري توزيع الأدوار بشكل سري...\n\n` +
          `**${EMOJI.PEOPLE} اللاعبون:**\n${players.map(p => `> <@${p.id}>`).join('\n')}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  for (const player of players) {
    const isOutsider = player.id === outsider.id;
    await sendDM(context.client, player,
      isOutsider
        ? `${EMOJI.SPY} **أنت الجاسوس!**\n\nاستمع جيداً لتلميحات الآخرين وحاول تخمين الكلمة السرية.\nتجنب الكشف عن نفسك!`
        : `${EMOJI.GROUP} **أنت من المجموعة!**\n\nالكلمة السرية: **${word}**\n\nلمّح للكلمة دون ذكرها مباشرة — ساعد المجموعة في كشف الجاسوس!`,
    );
  }

  await sleep(4000);

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x2ECC71)
        .addTextDisplayComponents(t => t.setContent(
          `## ${EMOJI.HINT} مرحلة التلميحات\n` +
          `كل لاعب لديه **${HINT_TIME / 1000} ثانية** ليكتب جملة تلميحية.\n` +
          `**لا تذكر الكلمة السرية مباشرة!**\n\n` +
          `**ترتيب اللاعبين:**\n${order.map((p, i) => `> **${i + 1}.** <@${p.id}>`).join('\n')}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(2000);

  const hints = [];
  for (const player of order) {
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xF39C12)
          .addTextDisplayComponents(t => t.setContent(
            `### ${EMOJI.MIC} <@${player.id}> — دورك!\n` +
            `اكتب جملة تلميحية للكلمة السرية.\n` +
            `${EMOJI.INFO} ${EMOJI.TIMER} لديك ${HINT_TIME / 1000} ثانية`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const hint = await collectViaModal(context.channel, player.id, HINT_TIME, {
      buttonLabel: `${EMOJI.WRITE} اكتب تلميحك`,
      modalTitle:  'تلميحك للكلمة السرية',
      inputLabel:  'اكتب تلميحاً دون ذكر الكلمة مباشرة',
      placeholder: 'مثال: شيء تجده في البحر...',
    });

    hints.push({ player, hint });

    if (hint === null) {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xE74C3C)
            .addTextDisplayComponents(t => t.setContent(
              `${EMOJI.TIMER} <@${player.id}> لم يكتب تلميحاً — تجاوز.`
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } else {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x2ECC71)
            .addTextDisplayComponents(t => t.setContent(
              `${EMOJI.MIC} **${player.displayName}:** *"${hint}"*`
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  }

  const validHints = hints.filter(h => h.hint !== null);
  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x3498DB)
        .addTextDisplayComponents(t => t.setContent(
          `## ${EMOJI.JUDGE} ملخص التلميحات\n\n` +
          (validHints.length
            ? validHints.map((h, i) =>
                `> **${i + 1}.** ${h.player.displayName}\n> *"${h.hint}"*`
              ).join('\n\n')
            : '> *لا توجد تلميحات!*'
          ) +
          `\n\n${EMOJI.INFO} الجاسوس بينكم — راقبوا التلميحات وصوّتوا بحذر.`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  const hintsLog = hints.map(h => `${h.player.displayName}: ${h.hint ?? 'لم يكتب'}`).join('\n');
  await sendJudgeDM(context.client, `${EMOJI.JUDGE} تلميحات الكلاسيكي:\n${hintsLog}`);

  await sleep(2000);

  await runVotePhase({ context, players, outsider, word, VOTE_TIME, mode: 'classic', callback });
}

// ════════════════════════════════════════════════════════════════════
//  ❓  وضع الأسئلة (مع Modal للسؤال والإجابة)
// ════════════════════════════════════════════════════════════════════

async function runQuestionsMode({ context, players, callback, category }) {
  const { vote: VOTE_TIME, minRounds: MIN_ROUNDS } = TIMES.questions;

  const word        = randomWord(category);
  const outsiderIdx = Math.floor(Math.random() * players.length);
  const outsider    = players[outsiderIdx];

  await sendJudgeDM(context.client,
    `${EMOJI.QUESTIONS} وضع الأسئلة:\n- الجاسوس: ${outsider.displayName} (${outsider.id})\n- الكلمة: ${word}\n- اللاعبون: ${players.map(p => p.displayName).join(', ')}`
  );

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(config.colors?.outsider ?? 0x6C3483)
        .addTextDisplayComponents(t => t.setContent(
          `## ${EMOJI.SPY} لعبة الجاسوس — وضع الأسئلة ${EMOJI.QUESTIONS}\n\n` +
          `${EMOJI.LETTER} جاري توزيع الأدوار سراً...\n\n` +
          `**${EMOJI.PEOPLE} اللاعبون:**\n${players.map(p => `> <@${p.id}>`).join('\n')}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  for (const player of players) {
    const isOutsider = player.id === outsider.id;
    await sendDM(context.client, player,
      isOutsider
        ? `${EMOJI.SPY} **أنت الجاسوس!**\n\nاللاعبون سيسألون بعضهم البعض.\nأجب بذكاء لتتجنب الكشف!\nبعد ${MIN_ROUNDS} جولات يمكن طلب التصويت عبر الزر.`
        : `${EMOJI.GROUP} **أنت من المجموعة!**\n\nالكلمة السرية: **${word}**\n\nاسأل أسئلة ذكية وراقب الإجابات — الجاسوس لا يعرف الكلمة!\nبعد ${MIN_ROUNDS} جولات يمكن طلب التصويت.`,
    );
  }

  await sleep(3000);

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x1ABC9C)
        .addTextDisplayComponents(t => t.setContent(
          `## ${EMOJI.QUESTIONS} مرحلة التحقيق — الأسئلة المتبادلة\n\n` +
          `**القواعد:**\n` +
          `> ${EMOJI.BOT} البوت يختار أول سائل عشوائياً\n` +
          `> ${EMOJI.NEXT} بعد كل إجابة، المُجيب يختار من يسأل في الجولة التالية\n` +
          `> ${EMOJI.VOTE} بعد **${MIN_ROUNDS}** جولات، يمكن لأي لاعب طلب التصويت\n` +
          `> ${EMOJI.WRITE} ستظهر أزرار للكتابة — لا تُرسل شيئاً في الشات مباشرة!\n\n` +
          `${EMOJI.INFO} استعدوا!`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(2000);

  await runQuestionsLoop({ context, players, outsider, word, VOTE_TIME, MIN_ROUNDS, callback });
}

// ─── حلقة الأسئلة (مشتركة بين الوضع العادي والجواسيس المتعددين) ──

async function runQuestionsLoop({ context, players, outsider, word, VOTE_TIME, MIN_ROUNDS, callback, isDoubleMode = false }) {
  let rounds = 0;
  let voteRequested = false;
  let currentAsker  = players[Math.floor(Math.random() * players.length)];
  const MODAL_TIMEOUT = 90_000; // وقت كافٍ للـ Modal

  while (!voteRequested) {

    const others = players.filter(p => p.id !== currentAsker.id);
    const target  = others[Math.floor(Math.random() * others.length)];

    // ── إعلان السائل ──
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xF39C12)
          .addTextDisplayComponents(t => t.setContent(
            `### ${EMOJI.QUESTION} الجولة ${rounds + 1}\n` +
            `<@${currentAsker.id}> — اسأل <@${target.id}> سؤالاً!\n` +
            `${EMOJI.INFO} ${EMOJI.TIMER} اضغط الزر لكتابة سؤالك`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    // ── السؤال عبر Modal ──
    const question = await collectViaModal(context.channel, currentAsker.id, MODAL_TIMEOUT, {
      buttonLabel: `${EMOJI.WRITE} اكتب سؤالك`,
      modalTitle:  'سؤالك للجولة',
      inputLabel:  `اكتب سؤالاً لـ ${target.displayName}`,
      placeholder: 'مثال: هل الشيء الذي تفكر فيه كبير الحجم؟',
    });

    if (!question) {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x7F8C8D)
            .addTextDisplayComponents(t => t.setContent(
              `${EMOJI.TIMER} <@${currentAsker.id}> لم يسأل — تخطي.`
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      currentAsker = players[Math.floor(Math.random() * players.length)];
      rounds++;
    } else {
      // ── عرض السؤال ──
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x3498DB)
            .addTextDisplayComponents(t => t.setContent(
              `### ${EMOJI.ANSWER} <@${target.id}> — أجب!\n` +
              `${EMOJI.QUESTION} السؤال من <@${currentAsker.id}>: *"${question}"*\n` +
              `${EMOJI.INFO} ${EMOJI.TIMER} اضغط الزر للإجابة`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      // ── الإجابة عبر Modal ──
      const answer = await collectViaModal(context.channel, target.id, MODAL_TIMEOUT, {
        buttonLabel: `${EMOJI.WRITE} اكتب إجابتك`,
        modalTitle:  'إجابتك',
        inputLabel:  `أجب على سؤال ${currentAsker.displayName}`,
        placeholder: 'اكتب إجابتك هنا...',
        paragraph:   true,
      });

      rounds++;

      if (answer) {
        await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(0x2ECC71)
              .addTextDisplayComponents(t => t.setContent(
                `${EMOJI.ANSWER} **${target.displayName}:** *"${answer}"*`
              )),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      } else {
        await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(0x7F8C8D)
              .addTextDisplayComponents(t => t.setContent(
                `${EMOJI.TIMER} <@${target.id}> لم يُجب.`
              )),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      // ── اختيار التالي (أو طلب تصويت) ──
      if (rounds >= MIN_ROUNDS) {
        const chooseRow = new ActionRowBuilder();
        const selectablePlayers = players.filter(p => p.id !== target.id);
        selectablePlayers.slice(0, 4).forEach(p => {
          chooseRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`next_${p.id}`)
              .setLabel(p.displayName.substring(0, 40))
              .setStyle(ButtonStyle.Secondary),
          );
        });
        const controlRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('request_vote')
            .setLabel(`${EMOJI.VOTE} طلب تصويت`)
            .setStyle(ButtonStyle.Danger),
        );

        const chooseMsg = await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(0x9B59B6)
              .addTextDisplayComponents(t => t.setContent(
                `### ${EMOJI.NEXT} <@${target.id}> — اختر التالي!\n` +
                `من تريد توجيه السؤال له؟\n` +
                `${EMOJI.INFO} يمكنك طلب تصويت (مرت ${rounds} جولات)`,
              ))
              .addActionRowComponents(r => r.setComponents(...chooseRow.components))
              .addActionRowComponents(r => r.setComponents(...controlRow.components)),
          ],
          flags: MessageFlags.IsComponentsV2,
        });

        const choice = await new Promise(resolve => {
          const colChoice = chooseMsg.createMessageComponentCollector({
            filter: i => i.user.id === target.id,
            time: 20_000,
            max: 1,
          });
          colChoice.on('collect', i => {
            i.deferUpdate().catch(() => {});
            resolve(i.customId);
          });
          colChoice.on('end', c => { if (c.size === 0) resolve(null); });
        });

        if (choice === 'request_vote' || choice === null) {
          voteRequested = true;
        } else {
          const nextId = choice.replace('next_', '');
          currentAsker = players.find(p => p.id === nextId) ?? target;
        }

        try { await chooseMsg.delete(); } catch (_) {}
      } else {
        currentAsker = players[Math.floor(Math.random() * players.length)];
        await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(0x2C3E50)
              .addTextDisplayComponents(t => t.setContent(
                `${EMOJI.INFO} ${EMOJI.BOT} البوت اختار: <@${currentAsker.id}> سيسأل التالي`,
              )),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    }

    if (rounds >= MIN_ROUNDS + 10) voteRequested = true;
  }

  if (!isDoubleMode) {
    await runVotePhase({ context, players, outsider, word, VOTE_TIME, mode: 'questions', callback });
  }
}

// ════════════════════════════════════════════════════════════════════
//  🕵️‍♂️  وضع الجواسيس المتعددين
// ════════════════════════════════════════════════════════════════════

async function runDoubleAgentMode({ context, players, callback, category }) {
  // ── اختيار أسلوب اللعب ──
  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x6C3483)
        .addTextDisplayComponents(t => t.setContent(
          `## ${EMOJI.DOUBLE} الجواسيس المتعددين\nاختر أسلوب اللعب:`
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
  const style = await askDoubleStyle(context, context.author?.id ?? context.user?.id);

  const totalPlayers = players.length;
  let spyCount;
  if      (totalPlayers <= 5) spyCount = 1;
  else if (totalPlayers <= 7) spyCount = 2;
  else                         spyCount = 3;

  if (spyCount >= totalPlayers) spyCount = Math.max(1, totalPlayers - 1);

  const shuffledAll  = shuffle(players);
  const allSpies     = shuffledAll.slice(0, spyCount);
  const allInnocents = shuffledAll.slice(spyCount);

  let remainingPlayers = [...players];
  let remainingSpies   = [...allSpies];
  let roundNumber      = 0;
  let gameEnded        = false;
  let isFirstRound     = true;

  const HINT_TIME   = TIMES.classic.hint;
  const VOTE_TIME   = TIMES.questions.vote;
  const MIN_ROUNDS  = TIMES.questions.minRounds;

  await sendJudgeDM(context.client,
    `${EMOJI.DOUBLE} وضع الجواسيس المتعددين (${style}):\n- عدد الجواسيس: ${spyCount}\n- الجواسيس: ${allSpies.map(s => s.displayName).join(', ')}\n- المجموعة: ${allInnocents.map(p => p.displayName).join(', ')}`
  );

  // ── رسالة البداية الموحدة ──
  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(config.colors?.outsider ?? 0x6C3483)
        .addTextDisplayComponents(t => t.setContent(
          `## ${EMOJI.SPY} بدأت لعبة الجاسوس!\n` +
          `### الجواسيس المتعددون ${EMOJI.DOUBLE} — أسلوب ${style === 'classic' ? `الكلاسيكي ${EMOJI.CLASSIC}` : `الأسئلة ${EMOJI.QUESTIONS}`}\n\n` +
          `${EMOJI.INFO} عدد الجواسيس: **${spyCount}**\n\n` +
          `${EMOJI.LETTER} جاري توزيع الأدوار بشكل سري...\n\n` +
          `**${EMOJI.PEOPLE} اللاعبون:**\n${players.map(p => `> <@${p.id}>`).join('\n')}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  while (!gameEnded) {
    roundNumber++;
    const word = randomWord(category);

    // ── توزيع الأدوار في كل جولة (المشكلة الثالثة: يجب إرسالها في كل جولة) ──
    for (const player of remainingPlayers) {
      const isSpy = remainingSpies.some(s => s.id === player.id);
      await sendDM(context.client, player,
        isSpy
          ? `${EMOJI.SPY} **أنت جاسوس!** — الجولة ${roundNumber}\n\nعدد الجواسيس الإجمالي: ${spyCount}\nحاول التخفي وتضليل المجموعة.\n**لا تعرف الكلمة السرية!**`
          : `${EMOJI.GROUP} **أنت من المجموعة!** — الجولة ${roundNumber}\n\nالكلمة السرية: **${word}**\n\n${style === 'classic' ? 'لمّح للكلمة دون ذكرها مباشرة.' : 'اسأل أسئلة ذكية وراقب الإجابات.'}`
      );
    }

    await sendJudgeDM(context.client,
      `${EMOJI.ROUND} الجولة ${roundNumber}:\n- الكلمة: ${word}\n- المتبقون: ${remainingPlayers.map(p => p.displayName).join(', ')}`
    );

    // ── رسالة بداية الجولة (موحدة مع الأوضاع الأخرى) ──
    const isNewWord = !isFirstRound;
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x2ECC71)
          .addTextDisplayComponents(t => t.setContent(
            `## ${EMOJI.ROUND} الجولة ${roundNumber}\n` +
            `### ${style === 'classic' ? `${EMOJI.CLASSIC} مرحلة التلميحات` : `${EMOJI.QUESTIONS} مرحلة الأسئلة`}\n\n` +
            (isNewWord ? `${EMOJI.INFO} الكلمة السرية **تغيرت** — تحقق من رسالتك الخاصة!\n\n` : `${EMOJI.INFO} تحقق من رسالتك الخاصة لمعرفة دورك!\n\n`) +
            `**${EMOJI.PEOPLE} اللاعبون المتبقون:** ${remainingPlayers.map(p => `<@${p.id}>`).join(', ')}`
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    await sleep(2000);
    isFirstRound = false;

    // ── تشغيل أسلوب الجولة ──
    if (style === 'classic') {
      await runDoubleClassicRound({
        context, players: remainingPlayers, HINT_TIME,
      });
    } else {
      // أسلوب الأسئلة — يستخدم نفس runQuestionsLoop تماماً
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x1ABC9C)
            .addTextDisplayComponents(t => t.setContent(
              `## ${EMOJI.QUESTIONS} مرحلة التحقيق — الأسئلة المتبادلة\n\n` +
              `**القواعد:**\n` +
              `> ${EMOJI.BOT} البوت يختار أول سائل عشوائياً\n` +
              `> ${EMOJI.NEXT} بعد كل إجابة، المُجيب يختار من يسأل في الجولة التالية\n` +
              `> ${EMOJI.VOTE} بعد **${MIN_ROUNDS}** جولات، يمكن طلب التصويت\n` +
              `> ${EMOJI.WRITE} ستظهر أزرار للكتابة — لا تُرسل شيئاً في الشات!\n\n` +
              `${EMOJI.INFO} استعدوا!`,
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      await sleep(2000);

      await runQuestionsLoop({
        context,
        players:      remainingPlayers,
        outsider:     remainingSpies[0],
        word,
        VOTE_TIME,
        MIN_ROUNDS,
        callback:     () => {},
        isDoubleMode: true,
      });
    }

    // ── مرحلة التصويت ──
    const eliminatedId = await runDoubleVotePhase(context, remainingPlayers, VOTE_TIME);
    if (!eliminatedId) {
      gameEnded = true;
      break;
    }

    const eliminatedPlayer = remainingPlayers.find(p => p.id === eliminatedId);
    const wasSpy           = remainingSpies.some(s => s.id === eliminatedId);

    await sendJudgeDM(context.client,
      `${EMOJI.VOTE} تصويت الجولة ${roundNumber}: أُقصي ${eliminatedPlayer?.displayName} (${wasSpy ? 'جاسوس' : 'من المجموعة'})`
    );

    remainingPlayers = remainingPlayers.filter(p => p.id !== eliminatedId);
    if (wasSpy) remainingSpies = remainingSpies.filter(s => s.id !== eliminatedId);

    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(wasSpy ? 0xE74C3C : 0x2ECC71)
          .addTextDisplayComponents(t => t.setContent(
            `## ${EMOJI.VOTE} نتيجة التصويت — الجولة ${roundNumber}\n` +
            `<@${eliminatedPlayer?.id}> تم إقصاؤه.\n` +
            (wasSpy
              ? `${EMOJI.SPY} كان **جاسوساً**! ${EMOJI.CORRECT}`
              : `${EMOJI.GROUP} كان **من المجموعة**! ${EMOJI.WRONG}`)
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const remainingInnocentsCount = remainingPlayers.length - remainingSpies.length;

    if (remainingSpies.length === 0) {
      await endDoubleGame(context, 'group', allSpies, allInnocents, players, callback, roundNumber);
      gameEnded = true;
      break;
    }
    if (remainingSpies.length >= remainingInnocentsCount) {
      await endDoubleGame(context, 'spies', allSpies, allInnocents, players, callback, roundNumber);
      gameEnded = true;
      break;
    }

    // ── سؤال المتابعة ──
    const action = await askDoubleAction(context, remainingPlayers);
    if (action === 'direct_vote') {
      // تصويت إضافي مباشر
      const extraElimId = await runDoubleVotePhase(context, remainingPlayers, VOTE_TIME);
      if (extraElimId) {
        const extraPlayer = remainingPlayers.find(p => p.id === extraElimId);
        const extraWasSpy = remainingSpies.some(s => s.id === extraElimId);

        remainingPlayers = remainingPlayers.filter(p => p.id !== extraElimId);
        if (extraWasSpy) remainingSpies = remainingSpies.filter(s => s.id !== extraElimId);

        await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(extraWasSpy ? 0xE74C3C : 0x2ECC71)
              .addTextDisplayComponents(t => t.setContent(
                `## ${EMOJI.VOTE} تصويت إضافي\n` +
                `<@${extraPlayer?.id}> تم إقصاؤه.\n` +
                (extraWasSpy
                  ? `${EMOJI.SPY} كان **جاسوساً**! ${EMOJI.CORRECT}`
                  : `${EMOJI.GROUP} كان **من المجموعة**! ${EMOJI.WRONG}`)
              )),
          ],
          flags: MessageFlags.IsComponentsV2,
        });

        const remInnocents2 = remainingPlayers.length - remainingSpies.length;
        if (remainingSpies.length === 0) {
          await endDoubleGame(context, 'group', allSpies, allInnocents, players, callback, roundNumber);
          gameEnded = true;
          break;
        }
        if (remainingSpies.length >= remInnocents2) {
          await endDoubleGame(context, 'spies', allSpies, allInnocents, players, callback, roundNumber);
          gameEnded = true;
          break;
        }
      }
    }
    // إذا new_round تكمل الحلقة تلقائياً
  }

  if (!gameEnded) {
    resetGame();
    callback();
  }
}

// ─── جولة كلاسيكية داخل وضع المتعدد ─────────────────────────────

async function runDoubleClassicRound({ context, players, HINT_TIME }) {
  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x2ECC71)
        .addTextDisplayComponents(t => t.setContent(
          `## ${EMOJI.HINT} مرحلة التلميحات\n` +
          `كل لاعب لديه **${HINT_TIME / 1000} ثانية** ليكتب جملة تلميحية.\n` +
          `**لا تذكر الكلمة السرية مباشرة!**\n\n` +
          `**ترتيب اللاعبين:**\n${shuffle(players).map((p, i) => `> **${i + 1}.** <@${p.id}>`).join('\n')}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(2000);

  const order = shuffle(players);
  const hints = [];

  for (const player of order) {
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xF39C12)
          .addTextDisplayComponents(t => t.setContent(
            `### ${EMOJI.MIC} <@${player.id}> — دورك!\n` +
            `اكتب جملة تلميحية للكلمة السرية.\n` +
            `${EMOJI.INFO} ${EMOJI.TIMER} لديك ${HINT_TIME / 1000} ثانية`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const hint = await collectViaModal(context.channel, player.id, HINT_TIME, {
      buttonLabel: `${EMOJI.WRITE} اكتب تلميحك`,
      modalTitle:  'تلميحك للكلمة السرية',
      inputLabel:  'اكتب تلميحاً دون ذكر الكلمة مباشرة',
      placeholder: 'مثال: شيء تجده في المطبخ...',
    });

    hints.push({ player, hint });

    if (hint === null) {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xE74C3C)
            .addTextDisplayComponents(t => t.setContent(
              `${EMOJI.TIMER} <@${player.id}> لم يكتب تلميحاً — تجاوز.`
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } else {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x2ECC71)
            .addTextDisplayComponents(t => t.setContent(
              `${EMOJI.MIC} **${player.displayName}:** *"${hint}"*`
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  }

  const validHints = hints.filter(h => h.hint !== null);
  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x3498DB)
        .addTextDisplayComponents(t => t.setContent(
          `## ${EMOJI.JUDGE} ملخص التلميحات\n\n` +
          (validHints.length
            ? validHints.map((h, i) => `> **${i + 1}.** ${h.player.displayName}\n> *"${h.hint}"*`).join('\n\n')
            : '> *لا توجد تلميحات!*'
          )
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await sleep(2000);
}

// ─── التصويت في وضع المتعدد ──────────────────────────────────────

async function runDoubleVotePhase(context, activePlayers, VOTE_TIME) {
  const votes  = new Map();
  const voters = new Set();

  const buildVoteContainer = () => {
    const rows = [];
    for (let i = 0; i < activePlayers.length; i += 4) {
      const row = new ActionRowBuilder();
      activePlayers.slice(i, i + 4).forEach(p => {
        const count = votes.get(p.id) || 0;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`dvote_${p.id}`)
            .setLabel(`${p.displayName.substring(0, 30)} (${count})`)
            .setStyle(ButtonStyle.Secondary),
        );
      });
      rows.push(row);
    }
    const c = new ContainerBuilder()
      .setAccentColor(0x8E44AD)
      .addTextDisplayComponents(t => t.setContent(
        `## ${EMOJI.VOTE} مرحلة التصويت\nمن تعتقد أنه الجاسوس؟\n${EMOJI.INFO} ${EMOJI.TIMER} ${VOTE_TIME / 1000} ثانية`
      ));
    rows.forEach(row => c.addActionRowComponents(r => { row.components.forEach(b => r.addComponents(b)); return r; }));
    return c;
  };

  const voteMsg = await context.channel.send({
    components: [buildVoteContainer()],
    flags: MessageFlags.IsComponentsV2,
  });

  await new Promise(resolve => {
    const col = voteMsg.createMessageComponentCollector({
      filter: i => i.customId.startsWith('dvote_') && activePlayers.some(p => p.id === i.user.id),
      time: VOTE_TIME,
    });
    col.on('collect', async i => {
      if (voters.has(i.user.id)) {
        await i.reply({ content: `${EMOJI.WARN} صوّتت بالفعل!`, ephemeral: true });
        return;
      }
      const target = i.customId.replace('dvote_', '');
      if (target === i.user.id) {
        await i.reply({ content: `${EMOJI.WRONG} لا يمكنك التصويت على نفسك!`, ephemeral: true });
        return;
      }
      voters.add(i.user.id);
      votes.set(target, (votes.get(target) || 0) + 1);
      try {
        await i.update({ components: [buildVoteContainer()], flags: MessageFlags.IsComponentsV2 });
      } catch (_) {
        await i.reply({ content: `${EMOJI.CORRECT} تم تسجيل صوتك.`, ephemeral: true });
      }
    });
    col.on('end', resolve);
  });

  try {
    await voteMsg.edit({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7F8C8D)
          .addTextDisplayComponents(t => t.setContent(`${EMOJI.LOCK} انتهى وقت التصويت.`)),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (_) {}

  let mostVoted = null, maxVotes = 0;
  for (const [id, count] of votes) {
    if (count > maxVotes) { maxVotes = count; mostVoted = id; }
  }
  return mostVoted || null;
}

// ─── سؤال المتابعة في وضع المتعدد ───────────────────────────────

async function askDoubleStyle(context, hostId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('double_style')
    .setPlaceholder('اختر طريقة لعب الجواسيس المتعددين')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('الكلاسيكي')
        .setDescription('تلميحات ثم تصويت')
        .setValue('classic')
        .setEmoji('🎯'),
      new StringSelectMenuOptionBuilder()
        .setLabel('الأسئلة')
        .setDescription('أسئلة متبادلة ثم تصويت')
        .setValue('questions')
        .setEmoji('❓'),
    );

  const row = new ActionRowBuilder().addComponents(menu);
  const msg = await context.channel.send({
    content: `<@${hostId}>، اختر أسلوب اللعب:`,
    components: [row],
    fetchReply: true,
  });

  try {
    const choice = await msg.awaitMessageComponent({
      filter: i => i.user.id === hostId && i.customId === 'double_style',
      time: 30_000,
    });
    await choice.deferUpdate();
    await msg.delete().catch(() => {});
    return choice.values[0];
  } catch {
    await msg.delete().catch(() => {});
    return 'classic';
  }
}

async function askDoubleAction(context, remainingPlayers) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('double_new_round').setLabel(`${EMOJI.ROUND} جولة جديدة`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('double_direct_vote').setLabel(`${EMOJI.VOTE} تصويت مباشر`).setStyle(ButtonStyle.Danger),
  );
  const msg = await context.channel.send({
    content: `**${EMOJI.QUESTION} ماذا تريدون أن تفعلوا؟**\nاختيار: جولة جديدة (بتلميحات/أسئلة جديدة) أم تصويت مباشر؟`,
    components: [row],
    fetchReply: true,
  });

  const votes  = { new_round: 0, direct_vote: 0 };
  const voters = new Set();

  const collector = msg.createMessageComponentCollector({
    filter: i => (i.customId === 'double_new_round' || i.customId === 'double_direct_vote') &&
                  remainingPlayers.some(p => p.id === i.user.id),
    time: 30_000,
  });

  await new Promise(resolve => {
    collector.on('collect', i => {
      if (voters.has(i.user.id)) {
        i.reply({ content: `${EMOJI.WARN} صوتت بالفعل!`, ephemeral: true });
        return;
      }
      voters.add(i.user.id);
      if (i.customId === 'double_new_round') votes.new_round++;
      else votes.direct_vote++;
      i.reply({ content: `${EMOJI.CORRECT} تم تسجيل صوتك.`, ephemeral: true });
    });
    collector.on('end', resolve);
  });

  try { await msg.delete(); } catch (_) {}
  return votes.new_round >= votes.direct_vote ? 'new_round' : 'direct_vote';
}

// ─── نهاية وضع المتعدد ───────────────────────────────────────────

async function endDoubleGame(context, winner, allSpies, allInnocents, originalPlayers, callback, roundNumber) {
  const pts = config.winPoints?.outsider ?? 100;

  if (winner === 'group') {
    for (const p of allInnocents) await db.addPoints(p.id, pts);
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x2ECC71)
          .addTextDisplayComponents(t => t.setContent(
            `## ${EMOJI.WIN_GROUP} المجموعة تفوز!\n\n` +
            `تم كشف جميع الجواسيس بعد **${roundNumber}** جولة.\n\n` +
            `**${EMOJI.SPY} الجواسيس كانوا:**\n${allSpies.map(s => `> <@${s.id}> (${s.displayName})`).join('\n')}\n\n` +
            `**${EMOJI.MEDAL} النقاط:** ${pts} لكل فرد من المجموعة:\n${allInnocents.map(p => `> <@${p.id}>`).join(', ')}`
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  } else {
    for (const s of allSpies) await db.addPoints(s.id, pts);
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xE74C3C)
          .addTextDisplayComponents(t => t.setContent(
            `## ${EMOJI.SPY} الجواسيس يفوزون!\n\n` +
            `نجح الجواسيس في السيطرة بعد **${roundNumber}** جولة.\n\n` +
            `**${EMOJI.SPY} الجواسيس:**\n${allSpies.map(s => `> <@${s.id}> (${s.displayName})`).join('\n')}\n\n` +
            `**${EMOJI.MEDAL} النقاط:** ${pts} لكل جاسوس`
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  await sendJudgeDM(context.client, `انتهت لعبة الجواسيس المتعددين. الفائز: ${winner}. عدد الجولات: ${roundNumber}.`);
  resetGame();
  callback();
}

// ════════════════════════════════════════════════════════════════════
//  🗳️  مرحلة التصويت الرئيسية (الكلاسيكي والأسئلة)
// ════════════════════════════════════════════════════════════════════

async function runVotePhase({ context, players, outsider, word, VOTE_TIME, mode, callback }) {
  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x8E44AD)
        .addTextDisplayComponents(t => t.setContent(
          `## ${EMOJI.VOTE} مرحلة التصويت\n\n` +
          `من تعتقد أنه **الجاسوس**؟\n` +
          `صوّت بالضغط على اسم اللاعب.\n` +
          `${EMOJI.INFO} ${EMOJI.TIMER} ${VOTE_TIME / 1000} ثانية للتصويت`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  function buildVoteContainer(votes) {
    const rows = [];
    for (let i = 0; i < players.length; i += 4) {
      const row = new ActionRowBuilder();
      players.slice(i, i + 4).forEach(p => {
        const count = votes.get(p.id) || 0;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`vote_${p.id}`)
            .setLabel(`${p.displayName.substring(0, 30)} (${count})`)
            .setStyle(ButtonStyle.Secondary),
        );
      });
      rows.push(row);
    }
    const noneCount = votes.get('none') || 0;
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('vote_none')
          .setLabel(`لا أشك بأحد 🤷 (${noneCount})`)
          .setStyle(ButtonStyle.Primary),
      ),
    );

    const c = new ContainerBuilder()
      .setAccentColor(0x8E44AD)
      .addTextDisplayComponents(t => t.setContent(`${EMOJI.VOTE} صوّت على من تشك أنه الجاسوس:`));
    rows.forEach(row => c.addActionRowComponents(r => {
      row.components.forEach(b => r.addComponents(b));
      return r;
    }));
    return c;
  }

  const votes  = new Map();
  const voters = new Set();

  const voteMsg = await context.channel.send({
    components: [buildVoteContainer(votes)],
    flags: MessageFlags.IsComponentsV2,
  });

  await new Promise(resolve => {
    const col = voteMsg.createMessageComponentCollector({
      filter: i => i.customId.startsWith('vote_') && players.some(p => p.id === i.user.id),
      time: VOTE_TIME,
    });

    col.on('collect', async i => {
      if (voters.has(i.user.id)) {
        await i.reply({ content: `${EMOJI.WARN} صوّتت بالفعل!`, ephemeral: true });
        return;
      }
      const target = i.customId.replace('vote_', '');
      if (target !== 'none' && target === i.user.id) {
        await i.reply({ content: `${EMOJI.WRONG} لا يمكنك التصويت على نفسك!`, ephemeral: true });
        return;
      }
      voters.add(i.user.id);
      votes.set(target, (votes.get(target) || 0) + 1);
      try {
        await i.update({ components: [buildVoteContainer(votes)], flags: MessageFlags.IsComponentsV2 });
      } catch (_) {
        await i.reply({ content: `${EMOJI.CORRECT} تم تسجيل صوتك.`, ephemeral: true });
      }
    });

    col.on('end', resolve);
  });

  try {
    await voteMsg.edit({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7F8C8D)
          .addTextDisplayComponents(t => t.setContent(`${EMOJI.LOCK} انتهى وقت التصويت.`)),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (_) {}

  let mostVoted = null, maxVotes = 0;
  for (const [id, count] of votes) {
    if (id !== 'none' && count > maxVotes) { maxVotes = count; mostVoted = id; }
  }

  const noneVotes   = votes.get('none') || 0;
  const voteSummary = [...votes.entries()]
    .filter(([id]) => id !== 'none')
    .sort((a, b) => b[1] - a[1])
    .map(([id, c]) => {
      const p = players.find(pl => pl.id === id);
      return `> <@${id}> (${p?.displayName ?? '?'}) — **${c}** صوت`;
    });
  if (noneVotes > 0) voteSummary.push(`> لا أحد — **${noneVotes}** صوت`);

  const voteCorrect = mostVoted === outsider.id;
  const pts         = config.winPoints?.outsider ?? 100;
  let   spyWins     = false;

  // ── الفرصة الأخيرة للجاسوس (الكلاسيكي فقط) ──
  if (mode === 'classic' && voteCorrect) {
    const lastGuessTime = TIMES.classic.lastGuess;
    await context.channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xE67E22)
          .addTextDisplayComponents(t => t.setContent(
            `## ${EMOJI.LAST_CHANCE} فرصة أخيرة للجاسوس!\n` +
            `<@${outsider.id}> تم كشفك بالتصويت!\n` +
            `لديك **${lastGuessTime / 1000} ثانية** لتخمين الكلمة السرية.\n` +
            `إذا كان تخمينك صحيحاً — تفوز رغم الكشف!\n` +
            `${EMOJI.INFO} ${EMOJI.GUESS} اضغط الزر لكتابة تخمينك`,
          )),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const finalGuess = await collectViaModal(context.channel, outsider.id, lastGuessTime, {
      buttonLabel: `${EMOJI.GUESS} اكتب تخمينك`,
      modalTitle:  'تخمينك للكلمة السرية',
      inputLabel:  'ما هي الكلمة السرية؟',
      placeholder: 'اكتب الكلمة...',
    });

    if (finalGuess) {
      const normalize = s => s.replace(/[\u064B-\u065F]/g, '').trim().toLowerCase();
      if (normalize(finalGuess) === normalize(word)) {
        spyWins = true;
        await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(0x2ECC71)
              .addTextDisplayComponents(t => t.setContent(
                `${EMOJI.CORRECT} **"${finalGuess}"** — إصابة! الجاسوس خمن الكلمة الصحيحة!`
              )),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      } else {
        await context.channel.send({
          components: [
            new ContainerBuilder()
              .setAccentColor(0xE74C3C)
              .addTextDisplayComponents(t => t.setContent(
                `${EMOJI.WRONG} **"${finalGuess}"** — خطأ. الجاسوس فشل في التخمين.`
              )),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    } else {
      await context.channel.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x7F8C8D)
            .addTextDisplayComponents(t => t.setContent(
              `${EMOJI.TIMER} لم يتم التخمين في الوقت المحدد.`
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  } else if (mode === 'classic') {
    spyWins = true;
  } else {
    spyWins = !voteCorrect;
  }

  const winner = spyWins ? 'outsider' : 'insiders';
  let resultText;
  if (mode === 'classic') {
    if (voteCorrect && spyWins) {
      resultText = `${EMOJI.SPY} الجاسوس كُشف لكنه خمّن الكلمة الصحيحة — **الجاسوس يفوز!**`;
    } else if (voteCorrect) {
      resultText = `${EMOJI.WIN_GROUP} المجموعة كشفت الجاسوس ولم يخمن الكلمة — **المجموعة تفوز!**`;
    } else {
      resultText = `${EMOJI.SPY} الجاسوس نجا من الكشف — **الجاسوس يفوز!**`;
    }
  } else {
    resultText = voteCorrect
      ? `${EMOJI.WIN_GROUP} المجموعة كشفت الجاسوس — **المجموعة تفوز!**`
      : `${EMOJI.SPY} الجاسوس نجا — **الجاسوس يفوز!**`;
  }

  if (winner === 'outsider') {
    await db.addPoints(outsider.id, pts);
  } else {
    for (const p of players.filter(pl => pl.id !== outsider.id)) {
      await db.addPoints(p.id, pts);
    }
  }

  await sendJudgeDM(context.client,
    `${EMOJI.VOTE} نتيجة التصويت (${mode}):\n${voteSummary.join('\n')}\n- الجاسوس الحقيقي: ${outsider.displayName}\n- الفائز: ${winner === 'outsider' ? 'الجاسوس' : 'المجموعة'}`
  );

  await context.channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(winner === 'outsider' ? 0xE74C3C : 0x2ECC71)
        .addTextDisplayComponents(t => t.setContent(
          `## ${EMOJI.RESULT} النتيجة النهائية\n\n` +
          `**الجاسوس كان:** <@${outsider.id}> (${outsider.displayName})\n` +
          `**الكلمة السرية كانت:** ||${word}||\n\n` +
          `${resultText}\n\n` +
          `**${EMOJI.VOTE} نتائج التصويت:**\n${voteSummary.join('\n') || '> لا أحد صوّت'}\n\n` +
          `**${EMOJI.MEDAL} النقاط المكتسبة:** ${pts} نقطة لكل من ${winner === 'outsider' ? `<@${outsider.id}>` : players.filter(p => p.id !== outsider.id).map(p => `<@${p.id}>`).join(', ')}`,
        )),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  resetGame();
  callback();
}