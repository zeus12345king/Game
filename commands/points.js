const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const db   = require('../database.js');

GlobalFonts.registerFromPath(path.join(__dirname, '../img/Fonts/IBMBold.ttf'), 'IBM');

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

async function buildPointsImage(user, points, rank) {
  const W = 620, H = 200;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const PAD    = 24;

  ctx.fillStyle = '#0e0e18';
  ctx.fillRect(0, 0, W, H);

  const topG = ctx.createLinearGradient(0, 0, W, 0);
  topG.addColorStop(0,   '#5865F2');
  topG.addColorStop(0.5, '#9B59B6');
  topG.addColorStop(1,   '#5865F2');
  ctx.fillStyle = topG;
  ctx.fillRect(0, 0, W, 5);

  const avatarSize = 110;
  const avatarX    = PAD + avatarSize / 2;
  const avatarY    = H / 2 + 8;

  try {
    const avatarURL = user.displayAvatarURL({ extension: 'png', forceStatic: true, size: 128 });
    const avatar    = await loadImage(avatarURL);

    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2 + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#5865F2';
    ctx.lineWidth   = 2.5;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
    ctx.restore();
  } catch (_) {

    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();
    ctx.strokeStyle = '#5865F2';
    ctx.lineWidth   = 2;
    ctx.stroke();
  }

  const textX = avatarX + avatarSize / 2 + 20;

  ctx.font      = 'bold 22px IBM';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillText(user.username, textX, 55);

  if (rank > 0) {
    const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    const rCol = rank <= 3 ? rankColors[rank - 1] : '#5865F2';
    const rW = 90, rH = 26, rX = textX, rY = 66;
    roundRect(ctx, rX, rY, rW, rH, 13);
    ctx.fillStyle = rCol + '22';
    ctx.fill();
    roundRect(ctx, rX, rY, rW, rH, 13);
    ctx.strokeStyle = rCol;
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.font      = 'bold 13px IBM';
    ctx.fillStyle = rCol;
    ctx.textAlign = 'center';
    ctx.fillText(`# ${rank}`, rX + rW / 2, rY + 17);
  }

  ctx.font      = 'bold 42px IBM';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  const numWidth = ctx.measureText(`${points}`).width;

  ctx.fillStyle = '#FFD700';
  ctx.fillText(`${points}`, textX, 155);

  ctx.font      = 'bold 16px IBM';
  ctx.fillStyle = '#7777aa';
  ctx.fillText('نقطة', textX + numWidth + 10, 155);

  ctx.font      = '11px IBM';
  ctx.fillStyle = '#ffffffff';
  ctx.textAlign = 'left';
  ctx.fillText('Made By b3oe', PAD, H - 8);

  return canvas.toBuffer('image/png');
}

module.exports = {
  name: 'نقاطي',
  aliases: ['نقاط', 'points', 'mypoints'],
  async execute(message) {
    const userId  = message.author.id;
    const points  = db.getUserPoints(userId);
    const allUsers = db.getTopUsers(1000);
    const rank    = allUsers.findIndex(([id]) => id === userId) + 1;

    const buffer = await buildPointsImage(message.author, points, rank);

    await message.reply({
      files: [{ attachment: buffer, name: 'points.png' }],
    });
  },
};
