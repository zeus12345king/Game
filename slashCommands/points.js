const { SlashCommandBuilder } = require('discord.js');
const { createMessageAdapter } = require('../core/slashAdapter.js');
module.exports = { name: 'points', data: new SlashCommandBuilder().setName('points').setDescription('عرض نقاطك'), async execute(i){ return i.client.findCommand('points').execute(createMessageAdapter(i), []); } };
