const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const emojis = require('../core/emojis.js');

async function createVote({ target, author, client, selectedGames, durationSeconds }) {
  const votes = new Map();
  const endsAt = durationSeconds ? Math.floor(Date.now() / 1000) + durationSeconds : null;
  const buildEmbed = (ended = false) => new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle(`${emojis.vote} تصويت اختيار اللعبة`)
    .setDescription(selectedGames.map((game, index) => `${index + 1}. ${emojis.games} **${game.name}** — **${[...votes.values()].filter((v) => v === game.name).length}** صوت`).join('\n'))
    .addFields({ name: 'الوقت المتبقي', value: ended ? 'انتهى التصويت' : (endsAt ? `<t:${endsAt}:R>` : 'يدويًا عبر زر إنهاء التصويت') });
  const buildRows = (disabled = false) => {
    const voteButtons = selectedGames.slice(0, 5).map((game) => new ButtonBuilder().setCustomId(`vote:${game.name}`).setLabel(game.name).setEmoji(emojis.games).setStyle(ButtonStyle.Primary).setDisabled(disabled));
    const rows = [new ActionRowBuilder().addComponents(voteButtons)];
    if (!durationSeconds) rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('vote:end').setLabel('إنهاء التصويت').setEmoji(emojis.stop).setStyle(ButtonStyle.Danger).setDisabled(disabled)));
    return rows;
  };
  const replyResult = await target.reply({ embeds: [buildEmbed()], components: buildRows(), fetchReply: true });
  const sent = typeof target.fetchReply === 'function' ? await target.fetchReply() : replyResult;
  const collector = sent.createMessageComponentCollector({ time: durationSeconds ? durationSeconds * 1000 : 24 * 60 * 60 * 1000 });
  let ended = false;
  async function finish(i) {
    if (ended) return;
    ended = true;
    collector.stop('done');
    const scores = selectedGames.map((game) => ({ game, count: [...votes.values()].filter((v) => v === game.name).length }));
    const max = Math.max(...scores.map((s) => s.count));
    const winners = scores.filter((s) => s.count === max);
    const winner = winners[Math.floor(Math.random() * winners.length)].game;
    await sent.edit({ embeds: [buildEmbed(true).addFields({ name: `${emojis.winner} الفائز`, value: `**${winner.name}**` })], components: buildRows(true) }).catch(() => {});
    const msg = await target.channel.send(`${emojis.winner} | فازت لعبة **${winner.name}** وسيتم تشغيلها الآن.`);
    const adapter = { ...target, reply: msg.reply?.bind(msg) || target.reply };
    await client.runGame(adapter, winner, []);
    if (i && !i.replied && !i.deferred) await i.deferUpdate().catch(() => {});
  }
  collector.on('collect', async (i) => {
    if (i.customId === 'vote:end') {
      if (i.user.id !== author.id) return i.reply({ content: 'زر الإنهاء لصاحب التصويت فقط.', ephemeral: true });
      return finish(i);
    }
    const gameName = i.customId.slice('vote:'.length);
    votes.set(i.user.id, gameName);
    await i.update({ embeds: [buildEmbed()], components: buildRows() });
  });
  collector.on('end', () => { if (!ended && durationSeconds) finish(); });
}

module.exports = {
  name: 'تصويت',
  aliases: ['vote'],
  async execute(message, args) {
    if (!message.client.hasAdminPermission(message.member)) return message.reply('هذا الأمر لمسؤولي الفعاليات فقط.');
    const duration = Number(args[0]);
    const names = (duration ? args.slice(1) : args).filter(Boolean);
    const selectedGames = names.map((name) => message.client.findGame(name)).filter(Boolean).slice(0, 5);
    if (!selectedGames.length) selectedGames.push(...[...message.client.games.values()].slice(0, 5));
    return createVote({ target: message, author: message.author, client: message.client, selectedGames, durationSeconds: duration > 0 ? duration : null });
  },
  createVote,
};
