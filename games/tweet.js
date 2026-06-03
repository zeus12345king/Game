const { ContainerBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const { GlobalFonts } = require('@napi-rs/canvas');
GlobalFonts.registerFromPath(require('path').join(__dirname, '../img/Fonts/IBMBold.ttf'), 'IBM');
const config = require('../config.js');

function buildQuestionImage(text) {
  const W = 1200;
  const padding = 60;
  const fontSize = 52;
  const lineHeight = 76;
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

  ctx.font = font;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.direction = 'rtl';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, padding + i * lineHeight));

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'question.png' });
}

const QUESTIONS = [
  'لو قدرت تعيش في أي وقت في التاريخ، هتروح إمتى وليه؟',
  'لو حياتك اتحولت لفيلم، هيكون من نوع إيه؟',
  'مؤمن بالحظ ولا بالسعي والاجتهاد؟',
  'لو عندك يوم كامل من غير أي مسؤوليات، هتعمل فيه إيه؟',
  'لو قدرت تتكلم مع نفسك قبل 5 سنين، هتقوله إيه؟',
  'أنت من النوع اللي بيفضل يسمع مشاكل الناس ولا بتهرب منهم؟',
  'لو لقيت محفظة فيها فلوس في الشارع، هتعمل إيه؟',
  'مؤمن بالصداقة بين راجل وبنت؟',
  'لو قدرت تغير حاجة واحدة في نفسك، هتغير إيه؟',
  'أنت من النوع اللي بيصارح ولا بيكتم؟',
  'لو طلبوا منك تعيش من غير إنترنت شهر كامل، تقدر؟',
  'إيه الحاجة اللي بتعملها لما بتكون ضايق؟',
  'لو عرفت وقت وفاتك، هتغير حياتك ولا تفضل زي ما أنت؟',
  'مؤمن إن الناس بتتغير ولا إن الطبع غالب؟',
  'أنت من النوع اللي بيسامح بسرعة ولا بياخدها في قلبه؟',
  'لو قدرت تبدل حياتك بحد تاني، هتبدل بمين؟',
  'إيه الحاجة اللي بتخليك تحس إنك ناجح؟',
  'لو عندك سوبر باور واحد، إيه اللي هتختاره؟',
  'مؤمن بنظرية المؤامرة؟',
  'لو كنت رئيس دولة يوم واحد بس، هتعمل إيه؟',
  'أنت شخص صباحي ولا ليلي؟',
  'إيه آخر حاجة بكيت عليها؟',
  'لو طلبوا منك تسافر بكره من غير ما ترجع، هتاخد معاك إيه؟',
  'مؤمن إن كل واحد عنده نصه التاني؟',
  'إيه أصعب قرار اتخدته في حياتك؟',
  'لو قدرت تعرف أفكار حد واحد بس، هيكون مين؟',
  'أنت من النوع اللي بيتأثر بآراء الناس ولا مش مهماه عندك؟',
  'إيه الحاجة اللي لو فاتتك في حياتك مش هتنساها؟',
  'مؤمن إن الأموال بتجيب السعادة؟',
  'لو شوفت حادثة في الشارع، هتوقف تساعد ولا تفضل ماشي؟',
  'أنت من النوع اللي بيحب الروتين ولا التغيير؟',
  'إيه الكلمة اللي اتقالتلك وأثرت فيك أكتر حاجة؟',
  'لو قدرت تشيل ذكرى واحدة من دماغك، هتشيل إيه؟',
  'مؤمن إن اللي فات مات ولا لسه بتعيش فيه؟',
  'إيه الحاجة اللي لو مكنتش خايف كنت هتعملها؟',
  'أنت من النوع اللي بيخطط لكل حاجة ولا بيعيش اللحظة؟',
  'لو قدرت تتكلم أي لغة في ثانية، هتختار إيه؟',
  'إيه الحاجة اللي بتحس إنها من غيرها حياتك ناقصة؟',
  'مؤمن إن الصدفة موجودة ولا كل حاجة مكتوبة؟',
  'لو عرفت إن صاحبك بيكدب عليك في حاجة، هتواجهه ولا تسكت؟',
  'إيه الحاجة اللي لو عدت الزمن كنت هتعملها بشكل تاني؟',
  'أنت من النوع اللي بيحتاج ناس ولا بيحب العزلة؟',
  'لو طلبوا منك تشتغل مجال تاني غير شغلك دلوقتي، هتختار إيه؟',
  'مؤمن إن الأحلام ليها تفسير؟',
  'إيه أحسن نصيحة اتقالتلك في حياتك؟',
  'لو عندك مليون دولار بكره الصبح، هتصرفهم في إيه؟',
  'أنت من النوع اللي بيحب يقول رأيه بصراحة ولا بيلف ويدور؟',
  'إيه الحاجة اللي بتتمناها تتغير في المجتمع اللي عايش فيه؟',
  'لو قدرت تختار تتولد تاني، هتتولد في نفس الحياة دي؟',
  'مؤمن إن الناس الطيبة بتتعذب أكتر في الدنيا؟',
  'إيه الهواية اللي تمنيت تبقى محترف فيها؟',
  'لو عندك فرصة تقابل أي شخصية تاريخية، مين هتختار؟',
  'أنت من النوع اللي بيحب يساعد الناس ولا بتفكر في نفسك الأول؟',
  'إيه آخر حاجة عملتها وحسيت إنها حلوة من غير ما حد يشوفك؟',
  'لو كان ممكن تعيش أكتر من 100 سنة بصحة كاملة، هتحب ده؟',
  'مؤمن إن الغيرة دليل حب ولا دليل انعدام ثقة؟',
  'إيه الحاجة اللي بتحس إنك فيها أحسن من غيرك؟',
  'لو قدرت تبعت رسالة للكون كله، هتقول إيه؟',
  'إيه الحاجة اللي بتعملها وبتتمنى محدش يشوفك وأنت بتعملها؟',
  'لو حياتك عندها خاصية Undo، آخر حاجة كنت هتتراجع عنها إيه؟',
  'مؤمن إن في ناس بتدخل حياتك عشان درس لازم تتعلمه؟',
  'إيه الحاجة اللي لو بدأت من أول كنت هتبدأ بيها من زمان؟',
];

module.exports = {
  name: 'tweet',
  aliases: ['كت'],
  execute(message, args, callback) {
    const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    const img = buildQuestionImage(question);

    const container = new ContainerBuilder()
      .setAccentColor(config.colors?.tweet ?? 0xF4A261)
      .addMediaGalleryComponents(g => g.addItems(item => item.setURL('attachment://question.png')));

    message.channel.send({
      components: [container],
      files: [img],
      flags: MessageFlags.IsComponentsV2
    });

    callback(null, false, 0, null);
  },
};