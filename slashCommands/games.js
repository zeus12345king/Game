const { SlashCommandBuilder } = require('discord.js');
const { createMessageAdapter } = require('../core/slashAdapter.js');
module.exports = { name: 'games', data: new SlashCommandBuilder().setName('games').setDescription('عرض الألعاب المتاحة'), async execute(i){ return i.client.findCommand('games').execute(createMessageAdapter(i), []); } };
