const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
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

async function buildTopImage(entries, requester, allCount) {
  const W      = 680;
  const PAD    = 24;
  const ROW_H  = 62;
  const GAP    = 8;
  const HDR_H  = 110;
  const FTR_H  = 52;
  const H      = HDR_H + entries.length * (ROW_H + GAP) - GAP + PAD + FTR_H;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#0e0e18';
  ctx.fillRect(0, 0, W, H);

  const topG = ctx.createLinearGradient(0, 0, W, 0);
  topG.addColorStop(0,   '#5865F2');
  topG.addColorStop(0.5, '#9B59B6');
  topG.addColorStop(1,   '#5865F2');
  ctx.fillStyle = topG;
  ctx.fillRect(0, 0, W, 5);

  ctx.font      = 'bold 28px IBM';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.fillText('قائمة افضل اللاعبين', W - PAD, 48);

  ctx.font      = 'bold 14px IBM';
  ctx.fillStyle = '#7777aa';
  ctx.fillText(`اجمالي اللاعبين: ${allCount}`, W - PAD, 72);

  ctx.strokeStyle = '#1e1e30';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, HDR_H - 10);
  ctx.lineTo(W - PAD, HDR_H - 10);
  ctx.stroke();

  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  entries.forEach((entry, idx) => {
    const { username, points, rank } = entry;
    const rx  = PAD;
    const ry  = HDR_H + idx * (ROW_H + GAP);
    const rw  = W - PAD * 2;
    const mid = ry + ROW_H / 2;
    const col = rank <= 3 ? medalColors[rank - 1] : '#5865F2';

    roundRect(ctx, rx, ry, rw, ROW_H, 12);
    ctx.fillStyle = '#13131e';
    ctx.fill();
    roundRect(ctx, rx, ry, rw, ROW_H, 12);
    ctx.strokeStyle = rank <= 3 ? col + '55' : '#222230';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.fillStyle = col;
    roundRect(ctx, rx + rw - 5, ry + 12, 5, ROW_H - 24, 3);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(rx + 30, mid, 18, 0, Math.PI * 2);
    ctx.fillStyle = col + '22';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rx + 30, mid, 18, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.font      = 'bold 15px IBM';
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillText(`${rank}`, rx + 30, mid + 5);

    ctx.font      = 'bold 18px IBM';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillText(username, W - PAD - 14, mid + 6);

    const pW = 110, pH = 26, pX = rx + 58, pY = mid - 13;
    roundRect(ctx, pX, pY, pW, pH, 13);
    ctx.fillStyle = '#FFD70022';
    ctx.fill();
    roundRect(ctx, pX, pY, pW, pH, 13);
    ctx.strokeStyle = '#FFD70088';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.font      = 'bold 13px IBM';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillText(`${points} نقطة`, pX + pW / 2, pY + 17);
  });

  const footerY  = H - FTR_H + 6;
  const reqPoints = db.getUserPoints(requester.id);
  const allUsers  = db.getTopUsers(1000);
  const reqRank   = allUsers.findIndex(([id]) => id === requester.id) + 1;

  ctx.strokeStyle = '#1e1e30';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, footerY - 4);
  ctx.lineTo(W - PAD, footerY - 4);
  ctx.stroke();

  const fW = W - PAD * 2, fH = 32, fX = PAD, fY = footerY + 2;
  roundRect(ctx, fX, fY, fW, fH, 10);
  ctx.fillStyle = '#13131e';
  ctx.fill();
  roundRect(ctx, fX, fY, fW, fH, 10);
  ctx.strokeStyle = '#252535';
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.font      = 'bold 13px IBM';
  ctx.fillStyle = '#7777aa';
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.fillText(
    `ترتيبك: #${reqRank > 0 ? reqRank : '—'}  |  نقاطك: ${reqPoints} نقطة`,
    W - PAD - 12, fY + 21
  );

  ctx.font      = '11px IBM';
  ctx.fillStyle = '#2a2a3a';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillText('Made By b3oe', PAD + 8, fY + 21);

  return canvas.toBuffer('image/png');
}

module.exports = {
  name: 'توب',
  aliases: ['top', 'leaderboard', 'الترتيب'],
  async execute(message, args) {
    const limit    = args[0] ? parseInt(args[0]) : 10;
    const topLimit = Math.min(Math.max(limit, 1), 20);
    const topUsers = db.getTopUsers(topLimit);
    const allUsers = db.getTopUsers(1000);

    if (topUsers.length === 0) {
      return message.reply('لا يوجد لاعبين بعد.');
    }

    const entries = [];
    let rank = 1;
    for (const [userId, points] of topUsers) {
      let username = userId;
      try { username = (await message.client.users.fetch(userId)).username; } catch (_) {}
      entries.push({ username, points, rank });
      rank++;
    }

    const buffer = await buildTopImage(entries, message.author, allUsers.length);

    await message.reply({
      files: [{ attachment: buffer, name: 'top.png' }],
    });
  },
};
