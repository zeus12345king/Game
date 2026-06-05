const { SlashCommandBuilder } = require('discord.js');
const { createMessageAdapter } = require('../core/slashAdapter.js');
module.exports = {
 name:'transfer', data: new SlashCommandBuilder().setName('transfer').setDescription('تحويل نقاط').addUserOption(o=>o.setName('user').setDescription('المستلم').setRequired(true)).addIntegerOption(o=>o.setName('points').setDescription('النقاط').setRequired(true)),
 async execute(i){ const cmd=i.client.findCommand('transfer'); return cmd.execute(createMessageAdapter(i), [`<@${i.options.getUser('user').id}>`, String(i.options.getInteger('points'))]); }
};
