const { ContainerBuilder, SeparatorBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const db   = require('../database.js');
const config = require('../config.js');

GlobalFonts.registerFromPath(path.join(__dirname, '../img/Fonts/IBMBold.ttf'), 'IBM');

const WORDS = [
  'برتقال','موز','تفاح','فراولة','عنب','مانجو','بطيخ','خوخ','كمثرى','أناناس',
  'سيارة','طائرة','قطار','دراجة','سفينة','مروحية','غواصة','صاروخ','دبابة','قارب',
  'كتاب','قلم','مسطرة','مقص','ورقة','حقيبة','مكتب','كرسي','لوحة','ساعة',
  'شمس','قمر','نجمة','سحابة','مطر','ثلج','رعد','برق','ريح','ضباب',
  'أسد','نمر','فيل','زرافة','قرد','ببغاء','دلفين','تمساح','أرنب','ثعلب',
  'بيت','مدرسة','مستشفى','مسجد','سوق','حديقة','ملعب','مطعم','فندق','مطار',
  'أحمر','أزرق','أخضر','أصفر','أبيض','أسود','بنفسجي','برتقالي','وردي','رمادي',
  'سعيد','حزين','غاضب','خائف','متفاجئ','هادئ','متحمس','كسول','نشيط','ذكي',
];

function buildWordImage(word) {
  const W = 800, H = 220;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0e0e18');
  grad.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#5865F2';
  ctx.lineWidth   = 3;
  ctx.strokeRect(3, 3, W - 6, H - 6);

  ctx.font          = 'bold 100px IBM';
  ctx.fillStyle     = '#ffffff';
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.direction     = 'rtl';
  ctx.fillText(word, W / 2, H / 2);

  ctx.font      = '16px IBM';
  ctx.fillStyle = '#555577';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillText('Made By b3oe', 14, H - 12);

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'word.png' });
}

module.exports = {
  name: 'fast',
  aliases: ['اسرع', 'سرعة'],
  execute(message, args, callback) {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const img  = buildWordImage(word);

    const container = new ContainerBuilder()
      .setAccentColor(config.colors.roulette)
      .addTextDisplayComponents(t => t.setContent('## ⚡ لعبة أسرع\n> اكتب الكلمة التالية بأسرع ما يمكن:'))
      .addSeparatorComponents(s => s.setDivider(false))
      .addMediaGalleryComponents(g => g.addItems(i => i.setURL('attachment://word.png')))
      .addTextDisplayComponents(t => t.setContent(`> لديك **15 ثانية** للإجابة`));

    message.channel.send({
      components: [container],
      files: [img],
      flags: MessageFlags.IsComponentsV2,
    });

    const start = Date.now();

    const collector = message.channel.createMessageCollector({
      filter: m => !m.author.bot,
      time: 15000,
    });

    collector.on('collect', m => {
      if (m.content.trim() === word) {
        const timeTaken = (Date.now() - start) / 1000;
        collector.stop('answered');
        callback(m.author.id, true, timeTaken, null);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'answered') {
        callback(null, false, 0, word);
      }
    });
  },
};
