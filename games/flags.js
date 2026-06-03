const { ContainerBuilder, MediaGalleryBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const db = require('../database.js');
const config = require('../config.js');

const COUNTRIES = [
  { name: 'مصر',            code: 'eg', aliases: ['eg','egypt'] },
  { name: 'السعودية',       code: 'sa', aliases: ['sa','saudi','ksa'] },
  { name: 'الامارات',       code: 'ae', aliases: ['ae','uae','emirates'] },
  { name: 'الكويت',         code: 'kw', aliases: ['kw','kuwait'] },
  { name: 'قطر',            code: 'qa', aliases: ['qa','qatar'] },
  { name: 'البحرين',        code: 'bh', aliases: ['bh','bahrain'] },
  { name: 'عمان',           code: 'om', aliases: ['om','oman'] },
  { name: 'اليمن',          code: 'ye', aliases: ['ye','yemen'] },
  { name: 'الأردن',         code: 'jo', aliases: ['jo','jordan'] },
  { name: 'لبنان',          code: 'lb', aliases: ['lb','lebanon'] },
  { name: 'سوريا',          code: 'sy', aliases: ['sy','syria'] },
  { name: 'العراق',         code: 'iq', aliases: ['iq','iraq'] },
  { name: 'فلسطين',         code: 'ps', aliases: ['ps','palestine'] },
  { name: 'تونس',           code: 'tn', aliases: ['tn','tunisia'] },
  { name: 'الجزائر',        code: 'dz', aliases: ['dz','algeria'] },
  { name: 'المغرب',         code: 'ma', aliases: ['ma','morocco'] },
  { name: 'ليبيا',          code: 'ly', aliases: ['ly','libya'] },
  { name: 'السودان',        code: 'sd', aliases: ['sd','sudan'] },
  { name: 'ايران',          code: 'ir', aliases: ['ir','iran'] },
  { name: 'افغانستان',      code: 'af', aliases: ['af','afghanistan'] },
  { name: 'باكستان',        code: 'pk', aliases: ['pk','pakistan'] },
  { name: 'الهند',          code: 'in', aliases: ['in','india'] },
  { name: 'الصين',          code: 'cn', aliases: ['cn','china'] },
  { name: 'اليابان',        code: 'jp', aliases: ['jp','japan'] },
  { name: 'كوريا الجنوبية', code: 'kr', aliases: ['kr','korea'] },
  { name: 'روسيا',          code: 'ru', aliases: ['ru','russia'] },
  { name: 'أمريكا',         code: 'us', aliases: ['us','usa','america'] },
  { name: 'بريطانيا',       code: 'gb', aliases: ['gb','uk','britain','england'] },
  { name: 'فرنسا',          code: 'fr', aliases: ['fr','france'] },
  { name: 'المانيا',        code: 'de', aliases: ['de','germany'] },
  { name: 'ايطاليا',        code: 'it', aliases: ['it','italy'] },
  { name: 'اسبانيا',        code: 'es', aliases: ['es','spain'] },
  { name: 'كندا',           code: 'ca', aliases: ['ca','canada'] },
  { name: 'استراليا',       code: 'au', aliases: ['au','australia'] },
  { name: 'البرازيل',       code: 'br', aliases: ['br','brazil'] },
  { name: 'الأرجنتين',      code: 'ar', aliases: ['ar','argentina'] },
  { name: 'تايلاند',        code: 'th', aliases: ['th','thailand'] },
  { name: 'اندونيسيا',      code: 'id', aliases: ['id','indonesia'] },
  { name: 'ماليزيا',        code: 'my', aliases: ['my','malaysia'] },
  { name: 'السويد',         code: 'se', aliases: ['se','sweden'] },
  { name: 'هولندا',         code: 'nl', aliases: ['nl','netherlands','holland'] },
  { name: 'تركيا',          code: 'tr', aliases: ['tr','turkey'] },
  { name: 'بلجيكا',         code: 'be', aliases: ['be','belgium'] },
  { name: 'سويسرا',         code: 'ch', aliases: ['ch','switzerland'] },
  { name: 'النرويج',        code: 'no', aliases: ['no','norway'] },
  { name: 'الدنمارك',       code: 'dk', aliases: ['dk','denmark'] },
  { name: 'فنلندا',         code: 'fi', aliases: ['fi','finland'] },
  { name: 'البرتغال',       code: 'pt', aliases: ['pt','portugal'] },
  { name: 'اليونان',        code: 'gr', aliases: ['gr','greece'] },
  { name: 'بولندا',         code: 'pl', aliases: ['pl','poland'] },
];

module.exports = {
  name: 'flags',
  aliases: ['اعلام'],
  execute(message, args, callback) {
    startGame(message, callback);
  }
};

function flagUrl(code) {
  return `https://flagcdn.com/w320/${code}.png`;
}

function normalizeAnswer(answer) {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isCorrectAnswer(userAnswer, country) {
  const normalized = normalizeAnswer(userAnswer);
  if (normalized === normalizeAnswer(country.name)) return true;
  for (const alias of country.aliases) {
    if (normalized === normalizeAnswer(alias)) return true;
  }
  return false;
}

async function startGame(context, callback) {
  const country = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  const startTime = Date.now();

  try {
    const gallery = new MediaGalleryBuilder().addItems(
      item => item.setURL(flagUrl(country.code)).setDescription(`علم ${country.name}`)
    );

    const container = new ContainerBuilder()
      .setAccentColor(config.colors.flags)
      .addTextDisplayComponents(t => t.setContent('## 🏳️ لعبة الأعلام\nما هي الدولة التي ينتمي إليها هذا العلم؟'))
      .addMediaGalleryComponents(() => gallery)
      .addSeparatorComponents(s => s.setDivider(false))
      .addTextDisplayComponents(t => t.setContent('-# لديك 20 ثانية للإجابة! اكتب اسم الدولة بالعربية أو الإنجليزية'));

    await context.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });

    const filter = (msg) => !msg.author.bot;
    const collector = context.channel.createMessageCollector({ filter, time: 20000 });
    let answered = false;

    collector.on('collect', async (msg) => {
      if (answered) return;
      if (!isCorrectAnswer(msg.content, country)) {
        try { await msg.react('❌'); } catch (_) {}
        return;
      }
      answered = true;
      collector.stop('correct');

      const timeTaken = (Date.now() - startTime) / 1000;
      let points = 1;
      if (timeTaken < 3) points = 10;
      else if (timeTaken < 6) points = 8;
      else if (timeTaken < 9) points = 6;
      else if (timeTaken < 12) points = 4;
      else if (timeTaken < 15) points = 3;
      else if (timeTaken < 18) points = 2;

      await db.addPoints(msg.author.id, points);
      const totalPoints = db.getUserPoints(msg.author.id);

      const win = new ContainerBuilder()
        .setAccentColor(config.colors.flags)
        .addTextDisplayComponents(t => t.setContent(
          `## ✅ إجابة صحيحة!\n<@${msg.author.id}> أجاب بشكل صحيح!\n\n` +
          `🌍 **الدولة:** ${country.name}\n` +
          `⏱️ **الوقت:** ${timeTaken.toFixed(2)} ثانية\n` +
          `💰 **النقاط المكتسبة:** ${points}\n` +
          `💎 **إجمالي النقاط:** ${totalPoints}`
        ));

      await context.channel.send({ components: [win], flags: MessageFlags.IsComponentsV2 });
      callback(msg.author.id, true, timeTaken, country.name);
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'correct') return;

      const answerGallery = new MediaGalleryBuilder().addItems(
        item => item.setURL(flagUrl(country.code)).setDescription(`علم ${country.name}`)
      );

      const timeout = new ContainerBuilder()
        .setAccentColor(0xFF0000)
        .addTextDisplayComponents(t => t.setContent('## ⏰ انتهى الوقت!\nلم يجب أحد بشكل صحيح.'))
        .addMediaGalleryComponents(() => answerGallery)
        .addTextDisplayComponents(t => t.setContent(`🌍 **الدولة:** ${country.name}`));

      await context.channel.send({ components: [timeout], flags: MessageFlags.IsComponentsV2 });
      callback(null, false, 20, country.name);
    });

  } catch (error) {
    console.error('[اعلام] Error:', error);
    callback(null, false, 0, 'حدث خطأ');
  }
}
