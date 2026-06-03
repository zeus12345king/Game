const { ContainerBuilder, SeparatorBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const { GlobalFonts } = require('@napi-rs/canvas');
GlobalFonts.registerFromPath(require('path').join(__dirname, '../img/Fonts/IBMBold.ttf'), 'IBM');
const db = require('../database.js');
const config = require('../config.js');

function buildTextImage(text, { bgColor = '#ffffff', textColor = '#000000', fontSize = 52, W = 1200 } = {}) {
  const padding = 50;
  const lineHeight = fontSize * 1.6;
  const font = `bold ${fontSize}px IBM`;
  const canvas0 = createCanvas(W, 100);
  const ctx0 = canvas0.getContext('2d');
  ctx0.font = font;
  const maxWidth = W - padding * 2;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx0.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  const H = padding * 2 + lines.length * lineHeight;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  if (bgColor) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H); }
  ctx.font = font;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.direction = 'rtl';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, padding + i * lineHeight));
  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'text.png' });
}

const QUESTIONS = [
  { q: 'ما هي عاصمة المملكة العربية السعودية؟', a: ['الرياض', 'riyadh'] },
  { q: 'كم عدد أيام السنة؟', a: ['365', 'ثلاثمائة وخمسة وستون'] },
  { q: 'ما هو أكبر كوكب في المجموعة الشمسية؟', a: ['المشتري', 'jupiter'] },
  { q: 'ما هي عاصمة مصر؟', a: ['القاهرة', 'IBM'] },
  { q: 'كم عدد أضلاع المثلث؟', a: ['3', 'ثلاثة'] },
  { q: 'ما هو أطول نهر في العالم؟', a: ['النيل', 'nile'] },
  { q: 'ما هي عاصمة فرنسا؟', a: ['باريس', 'paris'] },
  { q: 'كم عدد ساعات اليوم؟', a: ['24', 'أربعة وعشرون'] },
  { q: 'ما هو أصغر كوكب في المجموعة الشمسية؟', a: ['عطارد', 'mercury'] },
  { q: 'ما هي عاصمة اليابان؟', a: ['طوكيو', 'tokyo'] },
  { q: 'كم عدد أشهر السنة؟', a: ['12', 'اثنا عشر', 'اثني عشر'] },
  { q: 'ما هو أكبر محيط في العالم؟', a: ['الهادئ', 'المحيط الهادئ', 'pacific'] },
  { q: 'ما هي عاصمة الإمارات؟', a: ['أبوظبي', 'abu dhabi'] },
  { q: 'كم عدد دقائق الساعة؟', a: ['60', 'ستون'] },
  { q: 'ما هو أعلى جبل في العالم؟', a: ['إيفرست', 'جبل إيفرست', 'everest'] },
  { q: 'ما هي عاصمة الكويت؟', a: ['الكويت', 'مدينة الكويت', 'kuwait city'] },
  { q: 'كم عدد أيام الأسبوع؟', a: ['7', 'سبعة'] },
  { q: 'ما هو أكبر قارة في العالم؟', a: ['آسيا', 'asia'] },
  { q: 'ما هي عاصمة الأردن؟', a: ['عمان', 'amman'] },
  { q: 'كم عدد ثواني الدقيقة؟', a: ['60', 'ستون'] },
  { q: 'ما هو أصغر دولة في العالم؟', a: ['الفاتيكان', 'vatican'] },
  { q: 'ما هي عاصمة المغرب؟', a: ['الرباط', 'rabat'] },
  { q: 'كم عدد أوجه المكعب؟', a: ['6', 'ستة'] },
  { q: 'ما هو أسرع حيوان بري في العالم؟', a: ['الفهد', 'cheetah'] },
  { q: 'ما هي عاصمة تركيا؟', a: ['أنقرة', 'ankara'] },
  { q: 'كم عدد لاعبي كرة القدم في الفريق الواحد؟', a: ['11', 'أحد عشر'] },
  { q: 'ما هو أكبر بلد في العالم من حيث المساحة؟', a: ['روسيا', 'russia'] },
  { q: 'ما هي عاصمة البرازيل؟', a: ['برازيليا', 'brasilia'] },
  { q: 'كم عدد ألوان قوس قزح؟', a: ['7', 'سبعة'] },
  { q: 'ما هو الكوكب الأقرب للشمس؟', a: ['عطارد', 'mercury'] },
];

module.exports = {
  name: 'question',
  aliases: ['سؤال'],
  execute(message, args, callback) {
    startGame(message, callback);
  }
};

async function startGame(context, callback) {
  const item = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  const startTime = Date.now();

  try {
    const img = buildTextImage(item.q, { bgColor: null, textColor: '#ffffff' });
    const container = new ContainerBuilder()
      .setAccentColor(config.colors.question)
      .addTextDisplayComponents(t => t.setContent('## ❓ سؤال وجواب'))
      .addMediaGalleryComponents(g => g.addItems(i => i.setURL('attachment://text.png')))
      .addSeparatorComponents(s => s.setDivider(false))
      .addTextDisplayComponents(t => t.setContent('-# لديك 20 ثانية للإجابة!'));

    await context.channel.send({ components: [container], files: [img], flags: MessageFlags.IsComponentsV2 });

    const filter = (msg) => !msg.author.bot;
    const collector = context.channel.createMessageCollector({ filter, time: 20000 });
    let answered = false;

    collector.on('collect', async (msg) => {
      if (answered) return;
      const userAns = msg.content.trim().toLowerCase();
      const isCorrect = item.a.some(a => userAns === a.toLowerCase());
      if (!isCorrect) {
        try { await msg.react('❌'); } catch (_) {}
        return;
      }
      answered = true;
      collector.stop('correct');

      const timeTaken = (Date.now() - startTime) / 1000;
      const points = timeTaken < 5 ? 8 : timeTaken < 10 ? 5 : timeTaken < 15 ? 3 : 1;

      await db.addPoints(msg.author.id, points);
      const total = db.getUserPoints(msg.author.id);

      const win = new ContainerBuilder()
        .setAccentColor(config.colors.question)
        .addTextDisplayComponents(t => t.setContent(
          `## ✅ إجابة صحيحة!\n<@${msg.author.id}> أجاب بشكل صحيح!\n\n` +
          `📝 **الجواب:** ${item.a[0]}\n` +
          `⏱️ **الوقت:** ${timeTaken.toFixed(2)} ثانية\n` +
          `💰 **النقاط:** ${points}\n` +
          `💎 **الإجمالي:** ${total}`
        ));

      await context.channel.send({ components: [win], flags: MessageFlags.IsComponentsV2 });
      callback(msg.author.id, true, timeTaken, item.a[0]);
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'correct') return;

      const timeout = new ContainerBuilder()
        .setAccentColor(0xFF0000)
        .addTextDisplayComponents(t => t.setContent(
          `## ⏰ انتهى الوقت!\nلم يجب أحد.\n\n✅ **الجواب الصحيح:** ${item.a[0]}`
        ));

      await context.channel.send({ components: [timeout], flags: MessageFlags.IsComponentsV2 });
      callback(null, false, 20, item.a[0]);
    });

  } catch (error) {
    console.error('[سؤال] Error:', error);
    callback(null, false, 0, null);
  }
}
