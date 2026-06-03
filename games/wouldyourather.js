const { ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder } = require("discord.js");
const { createCanvas } = require('@napi-rs/canvas');
const { GlobalFonts } = require('@napi-rs/canvas');
GlobalFonts.registerFromPath(require('path').join(__dirname, '../img/Fonts/IBMBold.ttf'), 'IBM');
const config = require('../config.js');

function buildWyrImage(textA, textB) {
  const W = 1200, padding = 60, fontSize = 46, lineHeight = 70;
  const font = `bold ${fontSize}px IBM`;

  function wrapText(ctx, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  const canvas0 = createCanvas(W, 100);
  const ctx0 = canvas0.getContext('2d');
  ctx0.font = font;
  const maxW = W / 2 - padding * 2;
  const linesA = wrapText(ctx0, textA, maxW);
  const linesB = wrapText(ctx0, textB, maxW);
  const maxLines = Math.max(linesA.length, linesB.length);
  const H = padding * 2 + maxLines * lineHeight + 20;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(88, 101, 242, 0.85)';
  ctx.beginPath();
  ctx.roundRect(padding / 2, padding / 2, W / 2 - padding, H - padding, 16);
  ctx.fill();

  ctx.fillStyle = 'rgba(155, 89, 182, 0.85)';
  ctx.beginPath();
  ctx.roundRect(W / 2 + padding / 2, padding / 2, W / 2 - padding, H - padding, 16);
  ctx.fill();

  ctx.font = font;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.direction = 'rtl';

  linesA.forEach((l, i) => ctx.fillText(l, W / 4, padding + i * lineHeight));
  linesB.forEach((l, i) => ctx.fillText(l, W * 3 / 4, padding + i * lineHeight));

  ctx.font = `bold 52px IBM`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('أو', W / 2, H / 2 - 26);

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'wyr.png' });
}

const SCENARIOS = [
  { a: "تطير في السماء", b: "تتنفس تحت الماء" },
  { a: "تكون غنياً وحيداً", b: "تكون فقيراً ومحاطاً بأصدقاء" },
  { a: "تعيش بدون إنترنت", b: "تعيش بدون تلفاز" },
  { a: "تأكل نفس الأكل كل يوم", b: "ترتدي نفس الملابس كل يوم" },
  { a: "تعرف المستقبل", b: "تغير الماضي" },
  { a: "تكون قوياً جداً", b: "تكون ذكياً جداً" },
  { a: "تتكلم كل اللغات", b: "تعزف كل الآلات الموسيقية" },
  { a: "تكون مشهوراً ومكروهاً", b: "تكون مجهولاً ومحبوباً" },
  { a: "تنام 3 ساعات فقط يومياً", b: "تنام 12 ساعة يومياً" },
  { a: "تعيش بدون هاتف", b: "تعيش بدون سيارة" },
  { a: "تسافر للماضي", b: "تسافر للمستقبل" },
  { a: "تأكل حلو فقط", b: "تأكل مالح فقط" },
  { a: "تكون بطل رياضي", b: "تكون عالم مشهور" },
  { a: "تقرأ أفكار الناس", b: "تتحكم في الوقت" },
  { a: "تفقد ذاكرتك كل يوم", b: "تتذكر كل شيء بالتفصيل" },
  { a: "تعيش بدون موسيقى", b: "تعيش بدون أفلام" },
];

module.exports = {
  name: "wouldyourather",
  aliases: ["لوخيروك"],
  execute(message, args, callback) {
    startGame(message, callback);
  }
};

async function startGame(context, callback) {
  const item = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
  let votesA = 0, votesB = 0;
  const voters = new Set();

  try {
    const img = buildWyrImage(item.a, item.b);

    const container = new ContainerBuilder()
      .setAccentColor(0x9B59B6)
      .addTextDisplayComponents(t => t.setContent("## 🤔 لو خيروك\n**تفضل أي منهما؟**"))
      .addMediaGalleryComponents(g => g.addItems(i => i.setURL('attachment://wyr.png')))
      .addTextDisplayComponents(t => t.setContent("-# لديك 20 ثانية للتصويت!"))
      .addActionRowComponents(r => r.setComponents(
        new ButtonBuilder().setCustomId("wyr_a").setLabel(item.a.substring(0, 40)).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("wyr_b").setLabel(item.b.substring(0, 40)).setStyle(ButtonStyle.Secondary)
      ));

    const gameMsg = await context.channel.send({ components: [container], files: [img], flags: MessageFlags.IsComponentsV2 });

    const collector = gameMsg.createMessageComponentCollector({
      filter: (i) => (i.customId === "wyr_a" || i.customId === "wyr_b") && !i.user.bot,
      time: 20000
    });

    collector.on("collect", async (i) => {
      if (voters.has(i.user.id)) {
        await i.reply({ content: "لقد صوتت بالفعل!", ephemeral: true });
        return;
      }
      voters.add(i.user.id);
      if (i.customId === "wyr_a") votesA++;
      else votesB++;
      await i.reply({ content: "✅ تم تسجيل صوتك!", ephemeral: true });
    });

    collector.on("end", async () => {
      const total = votesA + votesB || 1;
      const pctA = Math.round((votesA / total) * 100);
      const pctB = Math.round((votesB / total) * 100);
      const barA = "█".repeat(Math.round(pctA / 10)) + "░".repeat(10 - Math.round(pctA / 10));
      const barB = "█".repeat(Math.round(pctB / 10)) + "░".repeat(10 - Math.round(pctB / 10));

      const result = new ContainerBuilder()
        .setAccentColor(0x9B59B6)
        .addTextDisplayComponents(t => t.setContent(
          "##" +
          " **" + item.a + "**\n`" + barA + "` " + pctA + "% (" + votesA + " صوت)\n\n" +
          " **" + item.b + "**\n`" + barB + "` " + pctB + "% (" + votesB + " صوت)"
        ))
        .addActionRowComponents(r => r.setComponents(
          new ButtonBuilder().setCustomId("wyr_a").setLabel(" " + pctA + "%").setStyle(ButtonStyle.Primary).setDisabled(true),
          new ButtonBuilder().setCustomId("wyr_b").setLabel(" " + pctB + "%").setStyle(ButtonStyle.Secondary).setDisabled(true)
        ));

      await gameMsg.edit({ components: [result], flags: MessageFlags.IsComponentsV2 });
      callback(null, false, 0, null);
    });

  } catch (error) {
    console.error("[لوخيروك] Error:", error);
    callback(null, false, 0, null);
  }
}
