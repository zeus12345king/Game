const { SlashCommandBuilder } = require('discord.js');
const { createMessageAdapter } = require('../core/slashAdapter.js');
module.exports = { name: 'inventory', data: new SlashCommandBuilder().setName('inventory').setDescription('عرض مخزونك'), async execute(i){ return i.client.findCommand('inventory').execute(createMessageAdapter(i), []); } };
