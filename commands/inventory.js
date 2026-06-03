const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const db   = require('../database.js');
const inv  = require('../inventory.js');

GlobalFonts.registerFromPath(path.join(__dirname, '../img/Fonts/IBMBold.ttf'), 'IBM');

const ITEMS = [
  { id: 'nuclear', name: 'نووي',       desc: 'يطرد جميع اللاعبين دفعة واحدة',    color: '#FF4757' },
  { id: 'reverse', name: 'طرد عكسي',   desc: 'يعكس الطرد على من يحاول طردك',     color: '#7B68EE' },
  { id: 'protect', name: 'حماية',      desc: 'يحمي لاعبا من الطرد لجولة واحدة',  color: '#2ED573' },
  { id: 'freeze',  name: 'تجميد',      desc: 'يجمد لاعبا لجولة واحدة',           color: '#1E90FF' },
  { id: 'twice',   name: 'طرد مرتين',  desc: 'تطرد لاعبين في نفس الجولة',        color: '#FF6B35' },
  { id: 'revive',  name: 'احياء لاعب', desc: 'تعيد لاعبا مطرودا للعبة',          color: '#FFD700' },
];

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

function buildInventoryImage(userId, username) {
  const points    = db.getUserPoints(userId);
  const inventory = inv.getItems(userId);

  const owned = ITEMS.filter(it => (inventory[it.id] || 0) > 0);

  const W      = 620;
  const PAD    = 24;
  const HDR_H  = 150;
  const CARD_H = 72;
  const GAP    = 8;
  const FTR_H  = 36;

  const bodyH = owned.length > 0
    ? owned.length * (CARD_H + GAP) - GAP
    : 80;

  const H = HDR_H + bodyH + PAD + FTR_H;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#0e0e18';
  ctx.fillRect(0, 0, W, H);

  const topG = ctx.createLinearGradient(0, 0, W, 0);
  topG.addColorStop(0,   '#2ED573');
  topG.addColorStop(0.5, '#1E90FF');
  topG.addColorStop(1,   '#2ED573');
  ctx.fillStyle = topG;
  ctx.fillRect(0, 0, W, 5);

  ctx.textAlign = 'right';
  ctx.direction = 'rtl';

  ctx.font      = 'bold 28px IBM';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('ممتلكاتي', W - PAD, 48);

  ctx.font      = 'bold 14px IBM';
  ctx.fillStyle = '#7777aa';
  ctx.fillText(`القدرات المملوكة لـ ${username}`, W - PAD, 74);

  const bW = 150, bH = 30, bX = PAD, bY = 88;
  roundRect(ctx, bX, bY, bW, bH, 15);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();
  roundRect(ctx, bX, bY, bW, bH, 15);
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.font      = 'bold 14px IBM';
  ctx.fillStyle = '#FFD700';
  ctx.textAlign = 'center';
  ctx.direction = 'ltr';
  ctx.fillText(`${points}  نقطة`, bX + bW / 2, bY + 20);

  const totalItems = owned.reduce((s, it) => s + (inventory[it.id] || 0), 0);
  const cW = 150, cH = 30, cX = PAD + bW + 10, cY = bY;
  roundRect(ctx, cX, cY, cW, cH, 15);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();
  roundRect(ctx, cX, cY, cW, cH, 15);
  ctx.strokeStyle = '#2ED573';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.font      = 'bold 14px IBM';
  ctx.fillStyle = '#2ED573';
  ctx.textAlign = 'center';
  ctx.direction = 'ltr';
  ctx.fillText(`${totalItems}  قدرة`, cX + cW / 2, cY + 20);

  ctx.strokeStyle = '#1e1e30';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, HDR_H - 10);
  ctx.lineTo(W - PAD, HDR_H - 10);
  ctx.stroke();

  if (owned.length === 0) {
    roundRect(ctx, PAD, HDR_H, W - PAD * 2, 70, 12);
    ctx.fillStyle = '#13131e';
    ctx.fill();
    roundRect(ctx, PAD, HDR_H, W - PAD * 2, 70, 12);
    ctx.strokeStyle = '#252535';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.font      = 'bold 16px IBM';
    ctx.fillStyle = '#44445a';
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillText('ما عندك اي قدرات حالياً — اشتري من المتجر', W - PAD - 14, HDR_H + 40);
  } else {
    owned.forEach((item, idx) => {
      const qty = inventory[item.id] || 0;
      const cx  = PAD;
      const cy  = HDR_H + idx * (CARD_H + GAP);
      const cw  = W - PAD * 2;
      const mid = cy + CARD_H / 2;

      roundRect(ctx, cx, cy, cw, CARD_H, 12);
      ctx.fillStyle = '#13131e';
      ctx.fill();
      roundRect(ctx, cx, cy, cw, CARD_H, 12);
      ctx.strokeStyle = item.color + '55';
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      ctx.fillStyle = item.color;
      roundRect(ctx, cx + cw - 5, cy + 12, 5, CARD_H - 24, 3);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx + 36, mid, 22, 0, Math.PI * 2);
      ctx.fillStyle = item.color + '22';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 36, mid, 22, 0, Math.PI * 2);
      ctx.strokeStyle = item.color;
      ctx.lineWidth   = 2;
      ctx.stroke();

      ctx.font      = 'bold 18px IBM';
      ctx.fillStyle = item.color;
      ctx.textAlign = 'center';
      ctx.direction = 'ltr';
      ctx.fillText(`${qty}`, cx + 36, mid + 6);

      ctx.textAlign = 'right';
      ctx.direction = 'rtl';

      ctx.font      = 'bold 18px IBM';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(item.name, W - PAD - 14, cy + 26);

      ctx.font      = '13px IBM';
      ctx.fillStyle = '#8888aa';
      ctx.fillText(item.desc, W - PAD - 14, cy + 50);

      ctx.font      = '11px IBM';
      ctx.fillStyle = item.color + 'aa';
      ctx.textAlign = 'center';
      ctx.direction = 'ltr';
      ctx.fillText('الكمية', cx + 36, cy + CARD_H - 6);
    });
  }

  ctx.strokeStyle = '#ffffffff';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - FTR_H + 4);
  ctx.lineTo(W - PAD, H - FTR_H + 4);
  ctx.stroke();

  ctx.font      = '11px IBM';
  ctx.fillStyle = '#2a2a3a';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillText('Made By b3oe', PAD, H - 10);

  return canvas.toBuffer('image/png');
}

module.exports = {
  name: 'ممتلكاتي',
  aliases: ['inventory', 'inv', 'bag'],
  async execute(message) {
    const userId   = message.author.id;
    const username = message.author.username;

    const buffer = buildInventoryImage(userId, username);

    await message.reply({
      files: [{ attachment: buffer, name: 'inventory.png' }],
    });
  },
};
