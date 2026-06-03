require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Collection,
  ContainerBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  ActivityType,
} = require('discord.js');

const { connectMongo } = require('./db/mongo.js');
const config = require('./config.js');
const settings = require('./settings.js');
const db = require('./database.js');

const PORT = 3000;
const activeGames = new Map();

let client;

function startHealthServer() {
  const app = express();

  app.get('/', (_req, res) => {
    res.send('Hello Express app!');
  });

  app.listen(PORT, () => {
    console.log('Made By Thailand Codes & b3oe/Error  ©2026 all rights reserved');
  });
}

function loadGroupGames() {
  try {
    const groupGames = fs.readFileSync('./groupgames.txt', 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    console.log('[Game Loader] Loaded group games:', groupGames);

    // UNKNOWN: The original obfuscated index.js loaded this Set, but dynamic tracing did
    // not prove that it changed messageCreate routing. It is intentionally retained as a
    // load-only runtime artifact to preserve the documented startup side effect without
    // inventing behavior not proven by repository code.
    return new Set(groupGames);
  } catch (_) {
    console.warn('⚠️ | groupgames.txt not found.');
    return new Set();
  }
}

function loadModulesFromDirectory(directory, collection, label) {
  const directoryPath = path.join(__dirname, directory);
  const files = fs.readdirSync(directoryPath).filter((file) => file.endsWith('.js'));

  for (const file of files) {
    const modulePath = path.join(directoryPath, file);
    const loaded = require(modulePath);

    if (!loaded?.name) {
      console.warn(`[${label} Loader] Skipped ${file}: missing name export.`);
      continue;
    }

    collection.set(loaded.name, loaded);
  }
}

function findByNameOrAlias(collection, name) {
  const normalized = String(name || '').toLowerCase();
  return collection.get(normalized)
    || collection.find((entry) => Array.isArray(entry.aliases)
      && entry.aliases.some((alias) => String(alias).toLowerCase() === normalized));
}

function hasAdminPermission(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (config.owners.includes(member.id)) return true;
  return member.roles?.cache?.some((role) => config.adminRoles.includes(role.id)) || false;
}

function releaseGameLock(channelId, game) {
  activeGames.delete(channelId);
  console.log(`[Game Lock] Released for group game: ${game.name}`);
}

async function handleCommand(message, command, args) {
  try {
    await command.execute(message, args);
  } catch (error) {
    console.error(`Error executing command ${command.name}:`, error);
    try {
      await message.reply('حدث خطأ أثناء محاولة تنفيذ هذا الأمر!');
    } catch (_) {}
  }
}

async function handleGame(message, game, args) {
  const channelId = message.channel.id;

  if (!await settings.isChannelAllowed(channelId)) {
    return message.reply('❌ | هذه القناة غير مسموحة للألعاب. استخدم `-setchat` لإضافة القناة.');
  }

  if (await settings.isCommandDisabled(channelId, game.name)) {
    return message.channel.send(`❌ | لعبة ${game.name} معطلة في هذه القناة.`);
  }

  if (activeGames.has(channelId)) {
    return message.channel.send('⚠️ | هناك لعبة نشطة بالفعل في هذه القناة. انتظر حتى تنتهي.');
  }

  activeGames.set(channelId, game.name);

  const callback = () => releaseGameLock(channelId, game);

  try {
    await game.execute(message, args, callback);
  } catch (error) {
    activeGames.delete(channelId);
    console.error(`Error executing game ${game.name}:`, error);
    try {
      await message.channel.send('حدث خطأ أثناء تشغيل اللعبة.');
    } catch (_) {}
  }
}

async function handleMessageCreate(message) {
  if (message.author?.bot) return;
  if (!message.content?.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/).filter(Boolean);
  const name = args.shift()?.toLowerCase();
  if (!name) return;

  const command = findByNameOrAlias(client.commands, name);
  if (command) {
    return handleCommand(message, command, args);
  }

  const game = findByNameOrAlias(client.games, name);
  if (game) {
    return handleGame(message, game, args);
  }
}

async function bootstrap() {
  startHealthServer();

  const groupGames = loadGroupGames();
  void groupGames;

  await connectMongo();

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  module.exports.client = client;

  client.commands = new Collection();
  client.games = new Collection();
  client.hasAdminPermission = hasAdminPermission;

  loadModulesFromDirectory('commands', client.commands, 'Command');
  loadModulesFromDirectory('games', client.games, 'Game');

  client.on('clientReady', () => {
    console.log(`${client.user.username} is Online`);
    try {
      client.user.setActivity('Error', { type: ActivityType.Playing });
    } catch (_) {}
  });

  client.on('messageCreate', handleMessageCreate);

  await client.login(process.env.TOKEN).catch((error) => {
    console.error('Discord login failed:', error);
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  console.error('Startup failed:', error);
  process.exit(1);
});

module.exports = { client };