const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { StringSelectMenuBuilder, ActionRowBuilder, MessageFlags } = require('discord.js');
const path = require('path');
const db   = require('../database.js');
const config = require('../config.js');
const inv  = require('../inventory.js');
const shopManager = require('../core/shopManager.js');

GlobalFonts.registerFromPath(path.join(__dirname, '../img/Fonts/IBMBold.ttf'), 'IBM');

const ITEMS = [
  { id: 'nuclear', name: 'نووي',       desc: 'يطرد جميع اللاعبين دفعة واحدة',    costKey: 'nuclear', color: '#FF4757' },
  { id: 'reverse', name: 'طرد عكسي',   desc: 'يعكس الطرد على من يحاول طردك',     costKey: 'reverse', color: '#7B68EE' },
  { id: 'protect', name: 'حماية',      desc: 'يحمي لاعبا من الطرد لجولة واحدة',  costKey: 'protect', color: '#2ED573' },
  { id: 'freeze',  name: 'تجميد',      desc: 'يجمد لاعبا لجولة واحدة',           costKey: 'freeze',  color: '#1E90FF' },
  { id: 'twice',   name: 'طرد مرتين',  desc: 'تطرد لاعبين في نفس الجولة',        costKey: 'twice',   color: '#FF6B35' },
  { id: 'revive',  name: 'احياء لاعب', desc: 'تعيد لاعبا مطرودا للعبة',          costKey: 'revive',  color: '#FFD700' },
];

const cooldowns = new Map();
const COOLDOWN_MS = 10 * 60 * 1000;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function buildShopImage(userId) {
  const points    = await db.getUserPoints(userId);
  const costs     = config.abilityCosts.roulette;
  const inventory = await inv.getItems(userId);

  const W       = 700;
  const PAD     = 24;
  const CARD_H  = 86;
  const GAP     = 8;
  const HDR_H   = 130;
  const FTR_H   = 44;
  const H       = HDR_H + ITEMS.length * (CARD_H + GAP) - GAP + PAD + FTR_H;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#0e0e18';
  ctx.fillRect(0, 0, W, H);

  const topG = ctx.createLinearGradient(0, 0, W, 0);
  topG.addColorStop(0, '#5865F2'); topG.addColorStop(0.5, '#9B59B6'); topG.addColorStop(1, '#5865F2');
  ctx.fillStyle = topG;
  ctx.fillRect(0, 0, W, 5);

  ctx.textAlign = 'right'; ctx.direction = 'rtl';
  ctx.font = 'bold 30px IBM'; ctx.fillStyle = '#ffffff';
  ctx.fillText('متجر قدرات الروليت', W - PAD, 48);

  ctx.font = 'bold 14px IBM'; ctx.fillStyle = '#7777aa';
  ctx.fillText('اختر القدرة من القائمة ادناه للشراء', W - PAD, 72);

  const bW = 150, bH = 30, bX = PAD, bY = 84;
  roundRect(ctx, bX, bY, bW, bH, 15);
  ctx.fillStyle = '#1a1a2e'; ctx.fill();
  roundRect(ctx, bX, bY, bW, bH, 15);
  ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = 'bold 14px IBM'; ctx.fillStyle = '#FFD700';
  ctx.textAlign = 'center'; ctx.direction = 'ltr';
  ctx.fillText(`${points}  نقطة`, bX + bW / 2, bY + 20);

  ctx.strokeStyle = '#1e1e30'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, HDR_H - 10); ctx.lineTo(W - PAD, HDR_H - 10); ctx.stroke();

  ITEMS.forEach((item, idx) => {
    const cost      = costs[item.costKey];
    const owned     = inventory[item.id] || 0;
    const canAfford = points >= cost;
    const col       = canAfford ? item.color : '#3a3a50';

    const cx = PAD, cy = HDR_H + idx * (CARD_H + GAP), cw = W - PAD * 2, mid = cy + CARD_H / 2;

    roundRect(ctx, cx, cy, cw, CARD_H, 12);
    ctx.fillStyle = canAfford ? '#13131e' : '#111119'; ctx.fill();
    roundRect(ctx, cx, cy, cw, CARD_H, 12);
    ctx.strokeStyle = canAfford ? item.color + '44' : '#222230'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.fillStyle = col;
    roundRect(ctx, cx + cw - 5, cy + 14, 5, CARD_H - 28, 3); ctx.fill();

    ctx.beginPath(); ctx.arc(cx + 32, mid, 18, 0, Math.PI * 2);
    ctx.fillStyle = canAfford ? item.color + '22' : '#1a1a28'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 32, mid, 18, 0, Math.PI * 2);
    ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.font = 'bold 15px IBM'; ctx.fillStyle = col;
    ctx.textAlign = 'center'; ctx.direction = 'ltr';
    ctx.fillText(`${idx + 1}`, cx + 32, mid + 5);

    const pW = 76, pH = 26, pX = cx + 60, pY = mid - 13;
    roundRect(ctx, pX, pY, pW, pH, 13);
    ctx.fillStyle = canAfford ? item.color + '22' : '#18182a'; ctx.fill();
    roundRect(ctx, pX, pY, pW, pH, 13);
    ctx.strokeStyle = col + '99'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = 'bold 13px IBM'; ctx.fillStyle = col;
    ctx.textAlign = 'center'; ctx.direction = 'ltr';
    ctx.fillText(`${cost} ن`, pX + pW / 2, pY + 17);

    const oW = 40, oH = 26, oX = pX + pW + 8, oY = pY;
    roundRect(ctx, oX, oY, oW, oH, 13);
    ctx.fillStyle = owned > 0 ? '#2ED57322' : '#18182a'; ctx.fill();
    roundRect(ctx, oX, oY, oW, oH, 13);
    ctx.strokeStyle = owned > 0 ? '#2ED573' : '#252535'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = 'bold 13px IBM'; ctx.fillStyle = owned > 0 ? '#2ED573' : '#444455';
    ctx.textAlign = 'center'; ctx.direction = 'ltr';
    ctx.fillText(`x${owned}`, oX + oW / 2, oY + 17);

    ctx.textAlign = 'right'; ctx.direction = 'rtl';
    ctx.font = 'bold 19px IBM'; ctx.fillStyle = canAfford ? '#ffffff' : '#44445a';
    ctx.fillText(item.name, W - PAD - 14, cy + 30);
    ctx.font = '13px IBM'; ctx.fillStyle = canAfford ? '#8888aa' : '#333345';
    ctx.fillText(item.desc, W - PAD - 14, cy + 54);
  });

  const hintY = HDR_H + ITEMS.length * (CARD_H + GAP) - GAP + PAD;
  roundRect(ctx, PAD, hintY, W - PAD * 2, FTR_H - 6, 10);
  ctx.fillStyle = '#13131e'; ctx.fill();
  roundRect(ctx, PAD, hintY, W - PAD * 2, FTR_H - 6, 10);
  ctx.strokeStyle = '#252535'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = 'bold 13px IBM'; ctx.fillStyle = '#7777aa';
  ctx.textAlign = 'right'; ctx.direction = 'rtl';
  ctx.fillText('اختر القدرة من القائمة ادناه  |  مرة واحدة كل 10 دقايق', W - PAD - 12, hintY + 26);

  ctx.font = '11px IBM'; ctx.fillStyle = '#2a2a3a';
  ctx.textAlign = 'left'; ctx.direction = 'ltr';
  ctx.fillText('Made By b3oe', PAD, hintY + 26);

  return canvas.toBuffer('image/png');
}

async function buildSelectMenu(userId) {
  const points  = await db.getUserPoints(userId);
  const costs   = config.abilityCosts.roulette;
  const inventory = await inv.getItems(userId);

  const options = ITEMS.map((item, idx) => {
    const cost      = costs[item.costKey];
    const canAfford = points >= cost;
    const owned     = inventory[item.id] || 0;
    return {
      label:       `${idx + 1}. ${item.name}`,
      description: `${cost} نقطة  |  عندك: ${owned}  ${canAfford ? '✓' : '✗'}`,
      value:       item.id,
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('shop_buy')
    .setPlaceholder('اختر القدرة للشراء...')
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  name: 'متجر',
  aliases: ['shop', 'store'],
  async execute(message) {
    const userId = message.author.id;
    const costs  = config.abilityCosts.roulette;

    const imageBuffer = await buildShopImage(userId);
    const row         = await buildSelectMenu(userId);

    const sent = await message.reply({
      files: [{ attachment: imageBuffer, name: 'shop.png' }],
      components: [row],
      fetchReply: true,
    });

    const collector = sent.createMessageComponentCollector({
      filter: i => i.customId === 'shop_buy' && i.user.id === userId,
      time: 120000,
    });

    collector.on('collect', async i => {

      const now      = Date.now();
      const lastBuy  = cooldowns.get(userId) || 0;
      const remaining = COOLDOWN_MS - (now - lastBuy);

      if (remaining > 0) {
        const mins = Math.ceil(remaining / 60000);
        await i.reply({
          content: `لازم تنتظر **${mins}** دقيقة قبل الشراء مرة ثانية.`,
          ephemeral: true,
        });
        return;
      }

      const itemId = i.values[0];
      const item   = ITEMS.find(x => x.id === itemId);
      if (!item) { await i.reply({ content: 'قدرة غير موجودة.', ephemeral: true }); return; }

      const result = await shopManager.buy({ userId, gameName: 'roulette', itemId, items: ITEMS });
      if (!result.success) {
        await i.reply({ content: result.error, ephemeral: true });
        return;
      }
      cooldowns.set(userId, now);

      const newPoints = result.remaining;
      const owned     = result.owned;

      await i.reply({
        content: `تم شراء **${item.name}** بنجاح\nرصيدك المتبقي: **${newPoints}** نقطة  |  عندك الان: **${owned}**`,
        ephemeral: true,
      });

      try {
        const newBuf = await buildShopImage(userId);
        const newRow = await buildSelectMenu(userId);
        await sent.edit({ files: [{ attachment: newBuf, name: 'shop.png' }], components: [newRow] });
      } catch (_) {}
    });

    collector.on('end', async () => {
      try { await sent.edit({ components: [] }); } catch (_) {}
    });
  },
};
