const { ContainerBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const { GlobalFonts } = require('@napi-rs/canvas');
GlobalFonts.registerFromPath(require('path').join(__dirname, '../img/Fonts/IBMBold.ttf'), 'IBM');

function buildTextImage(text, { bgColor = null, textColor = '#ffffff', fontSize = 48, W = 1200 } = {}) {
  const padding = 60;
  const lineHeight = fontSize * 1.7;
  const font = `bold ${fontSize}px IBM`;

  const canvas0 = createCanvas(W, 100);
  const ctx0 = canvas0.getContext('2d');
  ctx0.font = font;
  const maxWidth = W - padding * 2;

  const paragraphs = text.split('\n');
  const lines = [];
  for (const para of paragraphs) {
    if (para.trim() === '') { lines.push(''); continue; }
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx0.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
  }

  const H = padding * 2 + lines.length * lineHeight;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  if (bgColor) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H); }
  ctx.font = font;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.direction = 'rtl';
  lines.forEach((l, i) => ctx.fillText(l, W - padding, padding + i * lineHeight));
  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'text.png' });
}

const JOKES = [
'واحد راح ينام بدري…\nصحى بكير، انصدم 😐😂',

'واحد غبي فتح محل إنترنت…\nكتب: "مغلق أونلاين" 😂',

'مدرس سأل: وين واجبك؟\nقال: هاجر بحثاً عن مستقبل أفضل 😂',

'واحد اشترى كتاب "كيف تركز"\nقرأ أول سطر… تشتت 😂',

'واحد راح يركض الصبح…\nرجع قال: واضح الصبح مش إلي 😂',

'واحد قال: بدي أنحف\nراح نام بدون عشا…\nصحى أكل فطورين 😂',

'واحد فتح الثلاجة يدرس…\nلقي شي أهم من الدراسة 😂',

'واحد راح الجيم\nوقف يتفرج عالناس ساعتين ورجع 😂',

'واحد قال: بدي أكون إيجابي\nشحن حاله 100% ونام 😂',

'واحد اشترى نظارات شمسية بالليل\nتحسّب للمستقبل 😂',

'واحد قال: بدي أغير حياتي\nغير كلمة السر 😂',

'واحد قال: تعبت من الكسل\nأجل الموضوع لبكرا 😂',

'واحد شاف حلم حلو\nرجع نام يكمله 😂',

'واحد راح يشتري حليب\nرجع بشيبس… لأن الحليب "ثقيل" 😂',

'واحد سأل: ليش الساعة بتمشي؟\nقالوا: عشان ما تتأخر 😂',

'واحد دخل مطعم\nسأل: عندكم أكل دايت؟\nقالوا: إي بس الأكل هو نفسه 😂',

'واحد اشترى ميزان\nكل يوم يزعل منه 😂',

'واحد قال: أنا سريع الفهم\nبس الفهم بطيء يوصل 😂',

'واحد ضيع وقته\nدور عليه ما لقيه 😂',

'واحد قال: بدي أرتب حياتي\nبلش يرتب غرفته ونام 😂',

'واحد نسى حاله\nرجع بعد شوي 😂',

'واحد قال: بدي أركز\nسكر عيونه… نام 😂',

'واحد قال: اليوم ما رح أضحك\nضحك على حاله 😂',

'واحد سأل: ليش الطريق طويل؟\nقالوا: لأنه بعيد 😂',

'واحد راح يدرس\nفتح اللابتوب… دخل يوتيوب بالغلط 😂',

'واحد قال: رح أبدأ من جديد\nبس نسي من وين 😂',

'واحد قال: أنا نشيط\nبس لما أكون نايم 😂',

'واحد قال: بدي أعمل رياضة\nرفع الريموت 20 مرة 😂',

'واحد اشترى دفتر\nكتب أول صفحة: "بكرا ببلش" 😂',

'واحد قال: بدي أوفر مصاري\nاشترى أشياء عالتخفيض 😂',

'واحد سأل: وين رايح؟\nقال: ما بعرف… المهم بعيد 😂',

'واحد قال: بدي أكون ناجح\nراح نام ليحلم بالنجاح 😂',

'واحد دخل امتحان\nطلع يقول: الأسئلة كانت مفاجأة… وأنا كمان 😂',

'واحد قال: بدي أكون صريح\nبس خاف يجرح مشاعره 😂',

'واحد قال: بدي أوقف تسويف\nبس مو هلأ 😂',

'واحد راح يشرب مي\nفتح الثلاجة نسي ليش 😂',

'واحد قال: بدي أتعلم\nفتح فيديو… شاف التعليقات وضاع 😂',

'واحد قال: بدي أغير جو\nفتح الشباك ورجع سكّره 😂',

'واحد اشترى منبه\nصار يصحى قبله خوف 😂',

'واحد قال: بدي أكون قوي\nرفع البطانية 😂',

'واحد قال: بدي أكون هادي\nعصب ليش مش هادي 😂',

'واحد قال: بدي أرتاح\nتعب وهو بدو يرتاح 😂',

'واحد سأل: ليش بننام؟\nقالوا: عشان نصحى ننام 😂',

'واحد قال: بدي أكون منظم\nكتب ملاحظة: "نظّم حياتك" 😂',

'واحد قال: بدي أتعلم الطبخ\nأكل جاهز 😂',

'واحد قال: بدي أكون سريع\nوقع وهو مستعجل 😂',

'واحد قال: بدي أكون غني\nحسب مصروفه وانهار 😂',

'واحد قال: بدي أعمل دايت\nأكل السلطة مع بيتزا 😂',

'واحد قال: بدي أكون مبسوط\nضحك بدون سبب 😂',

'واحد قال: بدي أركز بالدراسة\nركز على القلم 😂',

'واحد قال: بدي أكون واقعي\nنام عالحقيقة 😂',

'واحد قال: بدي أكون مبدع\nاخترع سبب ينام 😂',

'واحد قال: بدي أكون واضح\nضبّب الموضوع 😂',

'واحد قال: بدي أكون جدي\nضحك بالنص 😂',

'واحد قال: بدي أكون ذكي\nسأل حاله سؤال واحتار 😂',

'واحد قال: بدي أكون قوي شخصية\nما قدر يرفض النوم 😂',

'واحد قال: بدي أكون نشيط\nتحمس ونام 😂',

'واحد قال: بدي أكون مختلف\nنام بوقت مختلف 😂'
];

module.exports = {
  name: 'joke',
  aliases: ['نكتة'],
  execute(message, args, callback) {
    const item = JOKES[Math.floor(Math.random() * JOKES.length)];
    const img = buildTextImage(item.replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim(), { bgColor: null, textColor: '#ffffff' });

    const container = new ContainerBuilder()
      .setAccentColor(0xE67E22)
      .addTextDisplayComponents(t => t.setContent('## 😂 نكتة'))
      .addMediaGalleryComponents(g => g.addItems(i => i.setURL('attachment://text.png')));

    message.channel.send({ components: [container], files: [img], flags: MessageFlags.IsComponentsV2 });
    callback(null, false, 0, null);
  }
};
