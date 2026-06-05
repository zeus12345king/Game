function createMessageAdapter(interaction) {
  const send = async (payload) => {
    if (typeof payload === 'string') payload = { content: payload };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
    return interaction.reply(payload);
  };
  return {
    client: interaction.client,
    guild: interaction.guild,
    guildId: interaction.guildId,
    channel: interaction.channel,
    channelId: interaction.channelId,
    member: interaction.member,
    author: interaction.user,
    mentions: { users: { first: () => interaction.options?.getUser('user') || null } },
    content: '',
    reply: send,
  };
}

module.exports = { createMessageAdapter };
