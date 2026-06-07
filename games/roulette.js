const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../database.js");
const config = require("../config.js");
const inv = require("../inventory.js");

const { createCanvas, loadImage } = require("@napi-rs/canvas");
const path = require("path");
const GIFEncoder = require("gif-encoder-2");
const fs = require("fs");
const https = require("https");
const http = require("http");

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 20;
const TIME_TO_START = config.lobbyTime.roulette;
const COLOR = "#d4be78";
const emojis = [
  "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟",
  "<:GEleven:1285946860951044128>", "<:GTwelve:1285946918383386674>",
  "<:GThirteen:1285946956157423671>", "<:GFourteen:1285947007910940805>",
  "<:GFifteen:1285947059454611528>", "<:GSixteen:1285947087938257020>",
  "<:GSeventeen:1285947127679422508>", "<:GEighteen:1285947168305320000>",
  "<:GNineteen:1285947288744759307>", "<:GTwenty:1285947320508350558>",
];
const Z1_EMOJI = "<:z1:1511780346008436946>";
const Z2_EMOJI = "<:z2:1511780387506880542>";
const Z3_EMOJI = "<:z3:1511872921142825040>";

const BOT_COUNT = 8;

let CURRENTLY_SENDING_IMAGE = false;
let LAST_SELECTED_PLAYER_ID = null;
let LAST_ROUND_TIME = 0;
let ROUND_COUNTER = 0;

function resetGameData() {
  CURRENTLY_SENDING_IMAGE = false;
  LAST_SELECTED_PLAYER_ID = null;
  LAST_ROUND_TIME = 0;
  ROUND_COUNTER = 0;
}

module.exports = {
  name: "roulette",
  aliases: ["روليت"],
  async execute(message, args, callback) {
    const nowTime = Math.floor(Date.now() / 1000);
    startGame(message, nowTime, callback);
  },
};

function clampLabel(s, max = 80) {
  if (!s) return "";
  s = String(s);
  return s.length > max ? s.slice(0, max - 2) + ".." : s;
}

// دالة موحدة لتحميل صورة (رابط خارجي أو مسار محلي) وإرجاع AttachmentBuilder
async function loadGameImage(imagePathOrUrl, fallbackFileName = "image.png") {
  if (!imagePathOrUrl) return null;
  try {
    if (imagePathOrUrl.startsWith("http://") || imagePathOrUrl.startsWith("https://")) {
      const buffer = await downloadImage(imagePathOrUrl);
      return new AttachmentBuilder(buffer, { name: fallbackFileName });
    } else {
      return new AttachmentBuilder(imagePathOrUrl, { name: path.basename(imagePathOrUrl) });
    }
  } catch (e) {
    console.error(`Failed to load image from ${imagePathOrUrl}:`, e);
    return null;
  }
}

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download image, status ${res.statusCode}`));
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

function generatePinkShades(count) {
  const shades = [];
  const baseHue = 345;
  const baseSaturation = 100;

  for (let i = 0; i < count; i++) {
    const lightness = 55 + (i * (30 / Math.max(count - 1, 1)));
    shades.push(hslToHex(baseHue, baseSaturation, lightness));
  }
  return shades;
}

function hslToHex(h, s, l) {
  l /= 100;
  const a = (s / 100) * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

async function startGame(context, nowTime, callback) {
  const players = [];
  const endTime = nowTime + TIME_TO_START / 1000;

  // إخفاء النص والإبقاء على الصورة والأزرار فقط
  let content = "";

  const lobbyImageFile = await loadGameImage(config.lobbyImages.roulette, "lobby.png");

  const joinButton = new ButtonBuilder()
    .setCustomId("join")
    .setEmoji(Z1_EMOJI)
    .setLabel("دخول")
    .setStyle(ButtonStyle.Secondary);
  const exitButton = new ButtonBuilder()
    .setCustomId("exit")
    .setEmoji(Z2_EMOJI)
    .setLabel("خروج")
    .setStyle(ButtonStyle.Secondary);
  const shopButton = new ButtonBuilder()
    .setCustomId("open_shop_lobby")
    .setEmoji("<:z13:1512229604147068948>")
    .setLabel("المتجر")
    .setStyle(ButtonStyle.Secondary);
  const actionRow = new ActionRowBuilder().addComponents(joinButton, exitButton, shopButton);

  const sendOptions = {
    content,
    components: [actionRow],
    fetchReply: true,
  };
  if (lobbyImageFile) sendOptions.files = [lobbyImageFile];

  const sentMessage = await context.reply(sendOptions);

  // لا حاجة لتحديث النص، نكتفي بالصورة والأزرار
  // سنبقي المتجر والانضمام كما هو

  const filter = (i) => {
    try {
      if (!i || !i.customId) return false;
      return i.customId === "join" || i.customId === "exit" || i.customId === "open_shop_lobby";
    } catch (e) {
      return false;
    }
  };

  const collector = sentMessage.createMessageComponentCollector({
    filter,
    time: TIME_TO_START,
  });

  collector.on("collect", async (i) => {
    try {
      if (i.customId === "join") {
        const ok = await checkJoiningGameAbility(i, players);
        if (!ok) return;
        const index = players.length > 0 ? Math.max(...players.map(p => p.index)) + 1 : 0;
        players.push({
          id: i.user.id,
          index,
          username: i.user.displayName || i.user.username || i.user.tag?.split("#")[0] || "لاعب",
          avatarURL:
            i.user.displayAvatarURL({ extension: "png", forceStatic: true }) ||
            "https://cdn.discordapp.com/embed/avatars/0.png",
          color: getRandomDarkHexCode(COLOR, index),
          protectedUntilRound: 0,
          reverseUntilRound: 0,
          frozenUntilRound: 0,
          usedAbilities: new Set(),
        });
        await i.reply({
          content: `🎲 | <@${i.user.id}> انضممت للعبة في المكان ${index + 1}!`,
          ephemeral: true,
        });
        // لا حاجة لتحديث محتوى الرسالة الرئيسية
      } else if (i.customId === "exit") {
        if (!players.some((p) => p.id === i.user.id)) {
          await i.reply({ content: "🎲 | أنت لست في اللعبة!", ephemeral: true });
          return;
        }
        const removed = players.find((p) => p.id === i.user.id);
        players.splice(players.indexOf(removed), 1);
        await i.reply({ content: "🎲 | لقد خرجت من اللعبة بنجاح!", ephemeral: true });
        // لا حاجة لتحديث النص
      } else if (i.customId === "open_shop_lobby") {
        const chooserScore = await db.getUserPoints(i.user.id) || 0;
        const costs = config.abilityCosts.roulette;
        const playerInv = await inv.getItems(i.user.id);
        const usedAbilities = new Set();

        const shopImageFile = await loadGameImage(config.shopImages?.roulette, "shop.png");

        const abilityEmojis = {
          nuclear: '<:z7:1512214884421734400>',
          reverse: '<:z8:1512222893772242953>',
          protect: '<:z9:1512222953826160740>',
          freeze: '<:z10:1512223654014881852>',
          twice: '<:z11:1512224011357126948>',
          revive: '<:z12:1512224063819485334>',
        };

        const shopItems = [
          { id: "eliminate_nuclear", label: "نووي - يطرد الجميع", cost: costs.nuclear, invKey: "nuclear", used: usedAbilities.has("nuclear") },
          { id: "ability_reverse",   label: "طرد عكسي",           cost: costs.reverse,  invKey: "reverse", used: usedAbilities.has("reverse") },
          { id: "ability_protect",   label: "حماية لاعب",          cost: costs.protect,  invKey: "protect", used: usedAbilities.has("protect") },
          { id: "ability_freeze",    label: "تجميد لاعب",          cost: costs.freeze,   invKey: "freeze", used: usedAbilities.has("freeze") },
          { id: "eliminate_twice",   label: "طرد مرتين",           cost: costs.twice,    invKey: "twice", used: usedAbilities.has("twice") },
          { id: "eliminate_revive",  label: "إحياء لاعب",          cost: costs.revive,   invKey: "revive", used: usedAbilities.has("revive"), requireEliminated: true },
        ];

        const buildShopRows = (points, invData, usedSet) => {
          const rows = [];
          for (let s = 0; s < shopItems.length; s += 3) {
            const row = new ActionRowBuilder();
            shopItems.slice(s, s + 3).forEach(item => {
              const canAfford = points >= item.cost;
              const disabled = usedSet.has(item.invKey) || !canAfford;
              const labelText = usedSet.has(item.invKey) ? `${item.label} (مستخدم)` : item.label;
              row.addComponents(
                new ButtonBuilder()
                  .setCustomId(item.id)
                  .setEmoji(abilityEmojis[item.invKey] || "❓")
                  .setLabel(labelText.substring(0, 80))
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(disabled)
              );
            });
            rows.push(row);
          }
          return rows;
        };

        let currentPoints = chooserScore;
        let currentUsed = usedAbilities;
        let shopRows = buildShopRows(currentPoints, playerInv, currentUsed);

        const replyPayload = {
          content: `<:z13:1512229604147068948> | رصيدك: **${currentPoints}**`,
          components: shopRows,
          ephemeral: true,
          fetchReply: true,
        };
        if (shopImageFile) replyPayload.files = [shopImageFile];

        const replyMessage = await i.reply(replyPayload);

        const shopCollector = replyMessage.createMessageComponentCollector({
          filter: (shopI) => shopI.user.id === i.user.id,
          time: 60000, // مدة أطول
        });

        shopCollector.on("collect", async (shopI) => {
          const chosenItem = shopItems.find(item => item.id === shopI.customId);
          if (!chosenItem) return;
          if (currentUsed.has(chosenItem.invKey)) {
            await shopI.reply({ content: "لقد استخدمت هذه القدرة بالفعل.", ephemeral: true });
            return;
          }
          const freshPoints = await db.getUserPoints(i.user.id) || 0;
          if (freshPoints < chosenItem.cost) {
            await shopI.reply({ content: "رصيدك غير كافٍ.", ephemeral: true });
            return;
          }
          await db.removePoints(i.user.id, chosenItem.cost);
          await inv.addItem(i.user.id, chosenItem.invKey, 1);
          currentUsed.add(chosenItem.invKey);
          const newPoints = await db.getUserPoints(i.user.id) || 0;
          const newInv = await inv.getItems(i.user.id);
          const newRows = buildShopRows(newPoints, newInv, currentUsed);
          await replyMessage.edit({
            content: `<:z13:1512229604147068948> | رصيدك: **${newPoints}**`,
            components: newRows,
          });
          await shopI.reply({ content: `<:z3:1511872921142825040> اشتريت **${chosenItem.label}** بنجاح!`, ephemeral: true });
          // لا نوقف المجمع، يمكنه شراء المزيد
        });

        shopCollector.on("end", () => {
          replyMessage.edit({ components: [] }).catch(() => {});
        });
      }
    } catch (error) {
      console.error("Error in lobby collector:", error);
      try { await i.reply({ content: "حدث خطأ.", ephemeral: true }); } catch (e) {}
    }
  });

  collector.on("end", async () => {
    try {
      await sentMessage.edit({ content: "", components: [] }).catch(() => {});

      const totalPlayersNeeded = BOT_COUNT;
      if (players.length < 2) {
        const botsToAdd = totalPlayersNeeded - players.length;
        let maxIndex = players.length > 0 ? Math.max(...players.map(p => p.index)) : -1;
        for (let i = 0; i < botsToAdd; i++) {
          maxIndex++;
          players.push({
            id: `bot_${Date.now()}_${i}`,
            index: maxIndex,
            username: `بوت ${i + 1}`,
            avatarURL: "https://cdn.discordapp.com/embed/avatars/0.png",
            color: getRandomDarkHexCode(COLOR, maxIndex),
            protectedUntilRound: 0,
            reverseUntilRound: 0,
            frozenUntilRound: 0,
            usedAbilities: new Set(),
            isBot: true,
          });
        }
        await sentMessage.reply(`🤖 | تمت إضافة **${botsToAdd}** بوت لتكملة العدد إلى ${totalPlayersNeeded} لاعبين.`);
      }

      if (players.length < MIN_PLAYERS) {
        await sentMessage.reply("🚶‍♂️ لم ينضم عدد كافٍ من اللاعبين. انتهى وقت الانضمام.");
        resetGameData();
        callback(null, false, 0, null);
        return;
      }

      let eliminatedPlayers = [];
      await sentMessage.reply(`${Z3_EMOJI} | تم الانتهاء من تسجيل اللاعبين، ستبدأ الجولة الاولى بعد قليل...`);
      await sleep(4500);
      await prepareRound(context, players, eliminatedPlayers, context.client, callback);
    } catch (err) {
      console.error("Error ending lobby collector:", err);
      resetGameData();
      callback(null, false, 0, null);
    }
  });
}

async function prepareRound(
  context,
  players,
  eliminatedPlayers,
  client,
  callback
) {
  try {
    const currentTime = Date.now();
    if (currentTime - LAST_ROUND_TIME < 6000) {
      await sleep(6000 - (currentTime - LAST_ROUND_TIME));
    }
    LAST_ROUND_TIME = Date.now();
    ROUND_COUNTER++;

    let takeVote = false;

    if (players.length === 1) {
      let winner = players[0];
      if (winner.isBot) {
        await context.channel.send(`🤖 | البوت فاز لكن مفيش فايز حقيقي!`);
        resetGameData();
        callback(null, false, 0, null);
        return;
      }

      const oldPoints = await db.getUserPoints(winner.id) || 0;
      const pointsToAdd = getRandomWinPoints();
      const newPoints = oldPoints + pointsToAdd;
      await db.addPoints(winner.id, pointsToAdd);

      const pointsButton = new ButtonBuilder()
        .setCustomId('winner_points_display')
        .setEmoji('🍪')
        .setLabel(`${newPoints} [+${pointsToAdd}]`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

      const row = new ActionRowBuilder().addComponents(pointsButton);

      await sleep(3500);
      await context.channel.send({
        content: `# 👑 - <@${winner.id}> فاز باللعبة!`,
        components: [row],
      });
      resetGameData();
      callback(null, false, 0, null);
      return;
    }

    if (players.length === 2) {
      if (CURRENTLY_SENDING_IMAGE) return;
      CURRENTLY_SENDING_IMAGE = true;

      try {
        const { playerChosen, image, duration } = await selectRandomPlayer(
          context,
          players
        );
        const winner = playerChosen;
        const attachment = new AttachmentBuilder(image, { name: "roulette.gif" });
        const winnerIndex = players.findIndex(p => p.id === winner.id);
        const content = `**${winnerIndex + 1} -** <@${winner.id}>`;
        await context.channel.send({ content, files: [attachment] });
        await sleep(duration + 500);

        const oldPoints = await db.getUserPoints(winner.id) || 0;
        const pointsToAdd = getRandomWinPoints();
        const newPoints = oldPoints + pointsToAdd;
        await db.addPoints(winner.id, pointsToAdd);

        const pointsButton = new ButtonBuilder()
          .setCustomId('winner_points_display')
          .setEmoji('🍪')
          .setLabel(`${newPoints} [+${pointsToAdd}]`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true);

        const row = new ActionRowBuilder().addComponents(pointsButton);

        await sleep(2500);
        await context.channel.send({
          content: `# 👑 - <@${winner.id}> فاز باللعبة!`,
          components: [row],
        });

        resetGameData();
        callback(null, false, 0, null);
        return;
      } catch (err) {
        console.error("Error in final round:", err);
        const randomIndex = Math.floor(Math.random() * 2);
        const winner = players[randomIndex];

        const oldPoints = await db.getUserPoints(winner.id) || 0;
        const pointsToAdd = getRandomWinPoints();
        const newPoints = oldPoints + pointsToAdd;
        await db.addPoints(winner.id, pointsToAdd);

        const pointsButton = new ButtonBuilder()
          .setCustomId('winner_points_display')
          .setEmoji('🍪')
          .setLabel(`${newPoints} [+${pointsToAdd}]`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true);

        const row = new ActionRowBuilder().addComponents(pointsButton);

        await context.channel.send({
          content: `# 👑 - <@${winner.id}> فاز باللعبة!`,
          components: [row],
        });

        resetGameData();
        callback(null, false, 0, null);
        return;
      }
    }

    if (CURRENTLY_SENDING_IMAGE) return;
    CURRENTLY_SENDING_IMAGE = true;

    try {
      const { playerChosen, image, duration } = await selectRandomPlayer(
        context,
        players
      );
      const randomPlayerId = playerChosen.id;

      if (randomPlayerId === LAST_SELECTED_PLAYER_ID && players.length > 2) {
        CURRENTLY_SENDING_IMAGE = false;
        await prepareRound(
          context,
          players,
          eliminatedPlayers,
          client,
          callback
        );
        return;
      }
      LAST_SELECTED_PLAYER_ID = randomPlayerId;

      const attachment = new AttachmentBuilder(image, { name: "roulette.gif" });
      const chosenPlayerIndex = players.findIndex(p => p.id === randomPlayerId);
      const wheelContent = `**${chosenPlayerIndex + 1} -** <@${randomPlayerId}>`;
      const wheelMessage = await context.channel.send({ content: wheelContent, files: [attachment] });
      await sleep(duration + 500);
      CURRENTLY_SENDING_IMAGE = false;

      if (playerChosen.isBot) {
        const botTargets = players.filter((p) => p.id !== randomPlayerId);
        if (botTargets.length === 0) {
          await prepareRound(context, players, eliminatedPlayers, client, callback);
          return;
        }
        const botTarget = botTargets[Math.floor(Math.random() * botTargets.length)];
        await sleep(3000);
        await context.channel.send(`🤖 | **${playerChosen.username}** قرر طرد <@${botTarget.id}> عشوائياً!`);
        await lose(botTarget.id, context);
        eliminatedPlayers.push(botTarget);
        players.splice(players.findIndex((p) => p.id === botTarget.id), 1);
        await prepareRound(context, players, eliminatedPlayers, client, callback);
        return;
      }

      const chooserObj = players.find((p) => p.id === randomPlayerId);
      if (chooserObj && !chooserObj.usedAbilities) {
        chooserObj.usedAbilities = new Set();
      }
      const chooserUsedAbilities =
        (chooserObj && chooserObj.usedAbilities) || new Set();

      const isFrozen =
        chooserObj && chooserObj.frozenUntilRound >= ROUND_COUNTER;
      if (isFrozen) {
        await context.channel.send(
          `|<@${randomPlayerId}> مجمد ولا يستطيع التصرف وتمت إزالته.`
        );
        await lose(randomPlayerId, context);
        eliminatedPlayers.push(chooserObj);
        const idx = players.findIndex((p) => p.id === randomPlayerId);
        if (idx !== -1) players.splice(idx, 1);
        await prepareRound(
          context,
          players,
          eliminatedPlayers,
          client,
          callback
        );
        return;
      }

      const chooserScore = await db.getUserPoints(randomPlayerId) || 0;
      const costs = config.abilityCosts.roulette;
      const playerInv = await inv.getItems(randomPlayerId);

      const filteredPlayers = players.filter((p) => p.id !== randomPlayerId);
      const targetRows = [];
      const chunkSize = 5;
      for (let i = 0; i < filteredPlayers.length; i += chunkSize) {
        const comps = filteredPlayers
          .slice(i, i + chunkSize)
          .map((pl) =>
            new ButtonBuilder()
              .setCustomId(`eliminate_${pl.id}`)
              .setEmoji(emojis[pl.index] || "🔲")
              .setLabel(clampLabel(pl.username, 80))
              .setStyle(ButtonStyle.Secondary)
          );
        targetRows.push(new ActionRowBuilder().addComponents(...comps));
      }

      const buildAbilityRows = (invData, usedSet) => {
        const abilityButtons = [];
        const abilityDefs = [
          { invKey: 'nuclear', cid: 'eliminate_nuclear', emoji: '<:z7:1512214884421734400>', label: 'نووي',       style: ButtonStyle.Danger,    used: usedSet.has('nuclear') },
          { invKey: 'reverse', cid: 'ability_reverse',   emoji: '<:z8:1512222893772242953>', label: 'طرد عكسي',   style: ButtonStyle.Secondary, used: usedSet.has('reverse') },
          { invKey: 'protect', cid: 'ability_protect',   emoji: '<:z9:1512222953826160740>', label: 'حماية',      style: ButtonStyle.Success,   used: usedSet.has('protect') },
          { invKey: 'freeze',  cid: 'ability_freeze',    emoji: '<:z10:1512223654014881852>', label: 'تجميد',      style: ButtonStyle.Secondary, used: usedSet.has('freeze') },
          { invKey: 'twice',   cid: 'eliminate_twice',   emoji: '<:z11:1512224011357126948>', label: 'طرد مرتين',  style: ButtonStyle.Secondary, used: usedSet.has('twice') },
          { invKey: 'revive',  cid: 'eliminate_revive',  emoji: '<:z12:1512224063819485334>', label: 'إحياء لاعب', style: ButtonStyle.Success,   used: usedSet.has('revive'), requireElim: true },
        ];

        for (const ab of abilityDefs) {
          const owned = invData[ab.invKey] || 0;
          if (owned > 0 && !ab.used && (!ab.requireElim || eliminatedPlayers.length > 0)) {
            abilityButtons.push(
              new ButtonBuilder()
                .setCustomId(ab.cid)
                .setEmoji(ab.emoji)
                .setLabel(`${ab.label} (${owned}x)`)
                .setStyle(ab.style)
            );
          }
        }
        const rows = [];
        for (let i = 0; i < abilityButtons.length; i += 5) {
          rows.push(new ActionRowBuilder().addComponents(...abilityButtons.slice(i, i + 5)));
        }
        return rows;
      };

      let abilityRows = buildAbilityRows(playerInv, chooserUsedAbilities);

      const actionRowButtons = [];
      if (players.length > 2) {
        actionRowButtons.push(
          new ButtonBuilder()
            .setCustomId("eliminate_random")
            .setEmoji("<:z5:1512126721367736481>")
            .setLabel("طرد عشوائي")
            .setStyle(ButtonStyle.Secondary)
        );
      }
      actionRowButtons.push(
        new ButtonBuilder()
          .setCustomId("eliminate_withdraw")
          .setEmoji("<:z6:1512127272184975360>")
          .setLabel("الانسحاب")
          .setStyle(ButtonStyle.Secondary)
      );
      actionRowButtons.push(
        new ButtonBuilder()
          .setCustomId("open_shop")
          .setEmoji("<:z13:1512229604147068948>")
          .setLabel("المتجر")
          .setStyle(ButtonStyle.Secondary)
      );

      const allRows = [
        ...targetRows,
        ...abilityRows,
        new ActionRowBuilder().addComponents(...actionRowButtons),
      ];

      const firstHalf = allRows.slice(0, 5);
      const secondHalf = allRows.slice(5);

      const embed = new EmbedBuilder()
        .setColor("#FFA2B8")
        .setDescription(`<:z5:1512126721367736481> | <@${randomPlayerId}> لديك **15 ثانية** لاختيار لاعب لطرده، او يمكنك استخدام قدرة.`);

      const eliminationMessageA = await wheelMessage.reply({
        embeds: [embed],
        components: firstHalf,
      });

      let eliminationMessageB = null;
      if (secondHalf.length > 0) {
        eliminationMessageB = await context.channel.send({
          components: secondHalf,
        });
      }

      const collectors = [];
      const eliminateFilter = (ii) =>
        typeof ii.customId === "string" &&
        (ii.customId.startsWith("eliminate_") ||
          ii.customId.startsWith("ability_") ||
          ii.customId === "open_shop");
      const createCollector = (msg) =>
        msg.createMessageComponentCollector({
          filter: eliminateFilter,
          time: 15000,
        });
      collectors.push(createCollector(eliminationMessageA));
      if (eliminationMessageB) {
        collectors.push(createCollector(eliminationMessageB));
      }

      let kicktwice = { status: false, count: 0, firstTargetId: null };
      let playerHasWithdraw = false;
      let hasBeenReset = false;
      let voteTaken = false;

      const stopAll = (reason) =>
        collectors.forEach((c) => {
          try {
            c.stop(reason);
          } catch (e) { }
        });

      const handleStandardElimination = async (
        chooserId,
        targetId,
        interaction
      ) => {
        const targetObj = players.find((p) => p.id === targetId);

        if (!targetObj) return;

        if (targetObj.protectedUntilRound >= ROUND_COUNTER) {
          targetObj.protectedUntilRound = 0;
          await context.channel.send(`🛡️ | اللاعب <@${targetId}> محمي! لم يتم طرده.`);
          stopAll("done");
          await prepareRound(
            context,
            players,
            eliminatedPlayers,
            client,
            callback
          );
          return;
        }

        if (targetObj.reverseUntilRound >= ROUND_COUNTER) {
          targetObj.reverseUntilRound = 0;
          await context.channel.send(`🔁 | رد الطرد! <@${chooserId}> تم طردك بدلًا من <@${targetId}>!`);
          await lose(chooserId, context);
          eliminatedPlayers.push(chooserObj);
          const idx = players.findIndex((p) => p.id === chooserId);
          if (idx !== -1) players.splice(idx, 1);
          stopAll("done");
          await prepareRound(
            context,
            players,
            eliminatedPlayers,
            client,
            callback
          );
          return;
        }

        if (kicktwice.status && kicktwice.count > 1) {
          await interaction.reply({
            content: `💣 | تم طرد <@${targetId}>. اختر اللاعب الثاني.`,
            ephemeral: true,
          });

          const newRows = [];
          if (eliminationMessageA)
            newRows.push(...eliminationMessageA.components);
          if (eliminationMessageB)
            newRows.push(...eliminationMessageB.components);

          const updatedRows = newRows.map((row) => {
            const components = row.components.map((button) => {
              if (button.customId === `eliminate_${targetId}`) {
                return ButtonBuilder.from(button)
                  .setDisabled(true)
                  .setLabel(`${button.label} (تم الطرد)`);
              }
              return button;
            });
            return new ActionRowBuilder().addComponents(...components);
          });

          if (eliminationMessageA)
            await eliminationMessageA.edit({
              components: updatedRows.slice(0, firstHalf.length),
            });
          if (eliminationMessageB)
            await eliminationMessageB.edit({
              components: updatedRows.slice(firstHalf.length),
            });

          kicktwice.firstTargetId = targetId;
        } else {
          if (kicktwice.status && kicktwice.firstTargetId) {
            await context.channel.send(`💣 | تم طرد <@${kicktwice.firstTargetId}> و <@${targetId}>.`);
          } else {
            await context.channel.send(`💣 | <@${chooserId}> قام بطرد اللاعب: <@${targetId}>`);
          }
        }

        await lose(targetId, context);
        eliminatedPlayers.push(targetObj);
        const idx = players.findIndex((p) => p.id === targetId);
        if (idx !== -1) players.splice(idx, 1);

        if (kicktwice.status) {
          kicktwice.count--;
          if (kicktwice.count > 0) {
            voteTaken = false;
            return;
          } else {
            kicktwice.status = false;
            kicktwice.firstTargetId = null;
            stopAll("done");
            await prepareRound(
              context,
              players,
              eliminatedPlayers,
              client,
              callback
            );
            return;
          }
        } else {
          stopAll("done");
          await prepareRound(
            context,
            players,
            eliminatedPlayers,
            client,
            callback
          );
          return;
        }
      };

      collectors.forEach((col) => {
        col.on("collect", async (ii) => {
          try {
            if (ii.user.id !== randomPlayerId) {
              await ii.reply({
                content: `🎲 | ليس دورك <@${ii.user.id}>`,
                ephemeral: true,
              });
              return;
            }

            const isReversed =
              chooserObj && chooserObj.reverseUntilRound >= ROUND_COUNTER;

            const isEliminationAttempt =
              (ii.customId.startsWith("eliminate_") &&
                !ii.customId.startsWith("eliminate_withdraw") &&
                !ii.customId.startsWith("eliminate_revive")) ||
              ii.customId === "eliminate_random" ||
              ii.customId === "eliminate_nuclear" ||
              ii.customId === "eliminate_twice";

            if (isReversed && isEliminationAttempt) {
              chooserObj.reverseUntilRound = 0;
              await context.channel.send(`🔁 | لقد حاولت طرد لاعب وأنت تحت تأثير "طرد عكسي"! تم طردك.`);

              await lose(randomPlayerId, context);
              eliminatedPlayers.push(chooserObj);
              const idx = players.findIndex((p) => p.id === randomPlayerId);
              if (idx !== -1) players.splice(idx, 1);

              voteTaken = true;
              stopAll("done");
              await prepareRound(
                context,
                players,
                eliminatedPlayers,
                client,
                callback
              );
              return;
            }

            voteTaken = true;
            const cid = ii.customId;

            if (cid === "open_shop") {
              // فتح المتجر أثناء الجولة مع إبقاء إمكانية الاختيار
              const abilityEmojis = {
                nuclear: '<:z7:1512214884421734400>',
                reverse: '<:z8:1512222893772242953>',
                protect: '<:z9:1512222953826160740>',
                freeze: '<:z10:1512223654014881852>',
                twice: '<:z11:1512224011357126948>',
                revive: '<:z12:1512224063819485334>',
              };
              const shopItems = [
                { id: "eliminate_nuclear", label: "نووي - يطرد الجميع", cost: costs.nuclear, invKey: "nuclear", used: chooserUsedAbilities.has("nuclear") },
                { id: "ability_reverse",   label: "طرد عكسي",           cost: costs.reverse,  invKey: "reverse", used: chooserUsedAbilities.has("reverse") },
                { id: "ability_protect",   label: "حماية لاعب",          cost: costs.protect,  invKey: "protect", used: chooserUsedAbilities.has("protect") },
                { id: "ability_freeze",    label: "تجميد لاعب",          cost: costs.freeze,   invKey: "freeze", used: chooserUsedAbilities.has("freeze") },
                { id: "eliminate_twice",   label: "طرد مرتين",           cost: costs.twice,    invKey: "twice", used: chooserUsedAbilities.has("twice") },
                { id: "eliminate_revive",  label: "إحياء لاعب",          cost: costs.revive,   invKey: "revive", used: chooserUsedAbilities.has("revive"), requireEliminated: true },
              ];

              const shopImageFile = await loadGameImage(config.shopImages?.roulette, "shop.png");

              const buildShopRows = (pts, invData, usedSet) => {
                const rows = [];
                for (let s = 0; s < shopItems.length; s += 3) {
                  const row = new ActionRowBuilder();
                  shopItems.slice(s, s + 3).forEach(item => {
                    const canAfford = pts >= item.cost;
                    const hasElim = !item.requireEliminated || eliminatedPlayers.length > 0;
                    const disabled = usedSet.has(item.invKey) || !canAfford || !hasElim;
                    const labelText = usedSet.has(item.invKey) ? `${item.label} (مستخدم)` : item.label;
                    row.addComponents(
                      new ButtonBuilder()
                        .setCustomId(item.id)
                        .setEmoji(abilityEmojis[item.invKey] || "❓")
                        .setLabel(labelText.substring(0, 80))
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(disabled)
                    );
                  });
                  rows.push(row);
                }
                return rows;
              };

              let shopCurrentUsed = new Set(chooserUsedAbilities);
              let shopPoints = await db.getUserPoints(randomPlayerId) || 0;
              let shopInv = await inv.getItems(randomPlayerId);
              let shopRows = buildShopRows(shopPoints, shopInv, shopCurrentUsed);

              const shopPayload = {
                content: `🛒 | رصيدك: **${shopPoints}ن**`,
                components: shopRows,
                ephemeral: true,
                fetchReply: true,
              };
              if (shopImageFile) shopPayload.files = [shopImageFile];

              const shopReply = await ii.reply(shopPayload);
              const shopCollector = shopReply.createMessageComponentCollector({
                filter: (si) => si.user.id === randomPlayerId,
                time: 30000,
              });

              shopCollector.on("collect", async (si) => {
                const chosenItem = shopItems.find(item => item.id === si.customId);
                if (!chosenItem) return;
                if (shopCurrentUsed.has(chosenItem.invKey)) {
                  await si.reply({ content: "لقد استخدمت هذه القدرة بالفعل.", ephemeral: true });
                  return;
                }
                const freshPoints = await db.getUserPoints(randomPlayerId) || 0;
                if (freshPoints < chosenItem.cost) {
                  await si.reply({ content: "رصيدك غير كافٍ.", ephemeral: true });
                  return;
                }
                await db.removePoints(randomPlayerId, chosenItem.cost);
                await inv.addItem(randomPlayerId, chosenItem.invKey, 1);
                shopCurrentUsed.add(chosenItem.invKey);
                const newPoints = await db.getUserPoints(randomPlayerId) || 0;
                const newInv = await inv.getItems(randomPlayerId);
                const newShopRows = buildShopRows(newPoints, newInv, shopCurrentUsed);
                await shopReply.edit({
                  content: `🛒 | رصيدك: **${newPoints}ن**`,
                  components: newShopRows,
                });
                await si.reply({ content: `<:z3:1511872921142825040> اشتريت **${chosenItem.label}** بنجاح!`, ephemeral: true });

                // تحديث أزرار القدرات في رسائل الإقصاء
                const updatedAbilityRows = buildAbilityRows(newInv, shopCurrentUsed);
                const newAllRows = [
                  ...targetRows,
                  ...updatedAbilityRows,
                  new ActionRowBuilder().addComponents(...actionRowButtons),
                ];
                const newFirstHalf = newAllRows.slice(0, 5);
                const newSecondHalf = newAllRows.slice(5);
                if (eliminationMessageA) await eliminationMessageA.edit({ components: newFirstHalf }).catch(() => {});
                if (eliminationMessageB) {
                  if (newSecondHalf.length > 0) {
                    await eliminationMessageB.edit({ components: newSecondHalf }).catch(() => {});
                  } else {
                    await eliminationMessageB.delete().catch(() => {});
                    eliminationMessageB = null;
                  }
                }
                // تحديث usedAbilities في كائن اللاعب ليكون متزامناً
                chooserObj.usedAbilities = shopCurrentUsed;
              });

              shopCollector.on("end", () => {
                shopReply.edit({ components: [] }).catch(() => {});
              });

              voteTaken = false; // لا يزال بإمكانه الاختيار بعد المتجر
              return;
            }

            if (cid === "eliminate_withdraw") {
              const idx = players.findIndex((p) => p.id === randomPlayerId);
              if (idx !== -1) players.splice(idx, 1);
              await ii.reply({
                content: `<:z6:1512127272184975360> | <@${randomPlayerId}> قرر الانسحاب...`,
                ephemeral: true,
              });
              playerHasWithdraw = true;
              await lose(randomPlayerId, context);
              stopAll("done");
              await prepareRound(
                context,
                players,
                eliminatedPlayers,
                client,
                callback
              );
              return;
            } else if (cid === "eliminate_random") {
              let randomTarget =
                filteredPlayers[
                Math.floor(Math.random() * filteredPlayers.length)
                ];

              if (randomTarget.protectedUntilRound >= ROUND_COUNTER) {
                randomTarget.protectedUntilRound = 0;
                await context.channel.send(`🛡️ | اللاعب <@${randomTarget.id}> محمي! لم يتم طرده.`);
                stopAll("done");
                await prepareRound(context, players, eliminatedPlayers, client, callback);
                return;
              }
              await context.channel.send(
                `💣 | <@${randomPlayerId}> قام بطرد عشوائيا اللاعب: <@${randomTarget.id}>`
              );
              await lose(randomTarget.id, context);
              eliminatedPlayers.push(randomTarget);
              players.splice(
                players.findIndex((p) => p.id === randomTarget.id),
                1
              );
              stopAll("done");
              await prepareRound(
                context,
                players,
                eliminatedPlayers,
                client,
                callback
              );
              return;
            } else if (cid === "eliminate_nuclear") {
              await inv.useItem(randomPlayerId, 'nuclear');
              chooserObj.usedAbilities.add("nuclear");
              const others = players.filter((p) => p.id !== randomPlayerId);
              for (const op of others) {
                await lose(op.id, context);
                eliminatedPlayers.push(op);
              }
              for (let k = players.length - 1; k >= 0; k--) {
                if (players[k].id !== randomPlayerId) players.splice(k, 1);
              }
              await context.channel.send(
                `☢️ | <@${randomPlayerId}> استخدم النووي وطرد: ${others
                  .map((p) => `<@${p.id}>`)
                  .join(", ")}`
              );
              stopAll("done");
              await prepareRound(
                context,
                players,
                eliminatedPlayers,
                client,
                callback
              );
              return;
            } else if (cid === "eliminate_twice") {
              await ii.reply({
                content: `🎲 | لقد قررت طرد مرتين. اختر اللاعب الأول.`,
                ephemeral: true,
              });
              await inv.useItem(randomPlayerId, 'twice');
              chooserObj.usedAbilities.add("twice");
              kicktwice.count = 2;
              kicktwice.status = true;
              kicktwice.firstTargetId = null;
              voteTaken = false;
              return;
            } else if (cid === "eliminate_revive") {
              const reviveRows = await eliminatedPlayersButtons(
                eliminatedPlayers
              );
              if (!reviveRows || reviveRows.length === 0) {
                await ii.reply({
                  content: "لا يوجد لاعبين لإحيائهم!",
                  ephemeral: true,
                });
                voteTaken = false;
                return;
              }
              await ii.reply({
                content: `🎲 | <@${randomPlayerId}> قرر إحياء لاعب...`,
                components: reviveRows,
                ephemeral: true,
              });
              await inv.useItem(randomPlayerId, 'revive');
              chooserObj.usedAbilities.add("revive");
              const reviveCollector = ii.message.createMessageComponentCollector({
                filter: (r) =>
                  typeof r.customId === "string" &&
                  r.customId.startsWith("revive_") &&
                  r.user.id === randomPlayerId,
                time: 10000,
              });
              reviveCollector.on("collect", async (ri) => {
                const revivedPlayerId = ri.customId.split("_")[1];
                const revivedPlayer = eliminatedPlayers.find(
                  (p) => p.id === revivedPlayerId
                );
                await removeLoss(revivedPlayerId, context);
                players.push(revivedPlayer);
                eliminatedPlayers.splice(
                  eliminatedPlayers.findIndex((p) => p.id === revivedPlayerId),
                  1
                );
                await ri.update({
                  content: `🎲 | <@${randomPlayerId}> قام بإحياء <@${revivedPlayerId}>!`,
                  components: [],
                });
                reviveCollector.stop();
                stopAll("done");
                await prepareRound(
                  context,
                  players,
                  eliminatedPlayers,
                  client,
                  callback
                );
              });
              reviveCollector.on("end", (col) => {
                if (!col || col.size === 0) {
                  context.channel.send(
                    `<@${randomPlayerId}> لم تختر أحد للإحياء.`
                  );
                  stopAll("done");
                  prepareRound(
                    context,
                    players,
                    eliminatedPlayers,
                    client,
                    callback
                  );
                }
              });
              return;
            } else if (cid.startsWith("ability_")) {
              // إيقاف مجمعات الإقصاء فوراً لتجنب التداخل
              stopAll("ability");
              const ability = cid.split("_")[1];
              const abilityTargets = players.map(
                (p) =>
                  new ButtonBuilder()
                    .setCustomId(`abilitytarget_${ability}_${p.id}`)
                    .setEmoji(emojis[p.index] || "🔲")
                    .setLabel(clampLabel(p.username, 80))
                    .setStyle(ButtonStyle.Secondary)
              );
              const abilityRows = [];
              for (let r = 0; r < abilityTargets.length; r += 5)
                abilityRows.push(
                  new ActionRowBuilder().addComponents(
                    ...abilityTargets.slice(r, r + 5)
                  )
                );
              await ii.reply({
                content: `اختر لاعب لتطبيق القدرة (${ability}):`,
                components: abilityRows,
                ephemeral: true,
              });
              const abilityCollector = ii.message.createMessageComponentCollector(
                {
                  filter: (ai) =>
                    typeof ai.customId === "string" &&
                    ai.customId.startsWith("abilitytarget_") &&
                    ai.user.id === randomPlayerId,
                  time: 15000,
                }
              );
              abilityCollector.on("collect", async (ai) => {
                const parts = ai.customId.split("_");
                const chosenAbility = parts[1];
                const targetId = parts[2];
                const targetObj = players.find((p) => p.id === targetId);
                if (!targetObj) {
                  await ai.reply({
                    content: "لا يمكن العثور على اللاعب.",
                    ephemeral: true,
                  });
                  return;
                }
                if (chosenAbility === "reverse") {
                  await inv.useItem(randomPlayerId, 'reverse');
                  targetObj.reverseUntilRound = ROUND_COUNTER + 1;
                  chooserObj.usedAbilities.add("reverse");
                  await ai.update({
                    content: `🔁 | تم تطبيق طرد عكسي على <@${targetId}> للجولة القادمة.`,
                    components: [],
                  });
                } else if (chosenAbility === "protect") {
                  await inv.useItem(randomPlayerId, 'protect');
                  targetObj.protectedUntilRound = ROUND_COUNTER + 1;
                  chooserObj.usedAbilities.add("protect");
                  await ai.update({
                    content: `🛡️ | تم حماية <@${targetId}> للجولة القادمة.`,
                    components: [],
                  });
                } else if (chosenAbility === "freeze") {
                  await inv.useItem(randomPlayerId, 'freeze');
                  targetObj.frozenUntilRound = ROUND_COUNTER + 1;
                  chooserObj.usedAbilities.add("freeze");
                  await ai.update({
                    content: `❄️ | تم تجميد <@${targetId}> للجولة القادمة.`,
                    components: [],
                  });
                } else {
                  await ai.update({
                    content: `القدرة غير معروفة.`,
                    components: [],
                  });
                }
                abilityCollector.stop();
                // الاستعداد للجولة التالية
                await prepareRound(
                  context,
                  players,
                  eliminatedPlayers,
                  client,
                  callback
                );
              });
              abilityCollector.on("end", (col) => {
                if (!col || col.size === 0) {
                  // لم يتم اختيار هدف، ننتقل للجولة التالية
                  prepareRound(
                    context,
                    players,
                    eliminatedPlayers,
                    client,
                    callback
                  );
                }
              });
              return;
            } else if (cid.startsWith("eliminate_")) {
              const targetId = cid.split("_")[1];
              await handleStandardElimination(randomPlayerId, targetId, ii);
              return;
            } else {
              await ii.reply({ content: "خيار غير معروف.", ephemeral: true });
              return;
            }
          } catch (err) {
            console.error("Error in elimination collect:", err);
            try {
              await ii.reply({
                content: "حدث خطأ. سيتم المتابعة.",
                ephemeral: true,
              });
            } catch (e) { }
            stopAll("error");
            await prepareRound(
              context,
              players,
              eliminatedPlayers,
              client,
              callback
            );
          }
        });
        col.on("end", (collected, reason) => {
          if (
            !voteTaken &&
            reason !== "reset" &&
            !playerHasWithdraw &&
            !hasBeenReset &&
            !kicktwice.status
          ) {
            try {
              const idx = players.findIndex((p) => p.id === randomPlayerId);
              if (idx !== -1) {
                const chooserObjOnEnd = players[idx];
                players.splice(idx, 1);
                eliminatedPlayers.push(chooserObjOnEnd);
                lose(randomPlayerId, context);
                context.channel.send(
                  `| <@${randomPlayerId}> لم تختر أحد وتم طردك.`
                );
                stopAll("timeout");
                prepareRound(
                  context,
                  players,
                  eliminatedPlayers,
                  client,
                  callback
                );
              }
            } catch (e) {
              console.error("Error handling no-vote end:", e);
              resetGameData();
              callback(null, false, 0, null);
            }
          }
        });
      });
    } catch (err) {
      console.error("Error in prepareRound spinning:", err);
      CURRENTLY_SENDING_IMAGE = false;
      LAST_SELECTED_PLAYER_ID = null;
      await context.channel.send(
        "حدث خطأ أثناء اختيار اللاعب. سيتم اختيار لاعب عشوائي للمتابعة."
      );
      await sleep(4500);
      await prepareRound(
        context,
        players,
        eliminatedPlayers,
        client,
        callback
      );
    }
  } catch (err) {
    console.error("Fatal error in prepareRound:", err);
    await context.channel.send("حدث خطأ فادح. تم إنهاء اللعبة.");
    resetGameData();
    callback(null, false, 0, null);
  }
}

async function updateMessage(message, players, rows, nowTime) {
  try {
    const sortedPlayers = players.sort((a, b) => a.index - b.index);
    const newMessage = `
🎲 | لعبة روليت
الوقت المتبقي لبدأ اللعبة: <t:${nowTime + TIME_TO_START / 1000}:R>
\n> اللاعبين الحاليين (${players.length} / ${MAX_PLAYERS}) :
${sortedPlayers
        .map((player) => `> ${emojis[player.index]} : <@${player.id}>`)
        .join("\n")}
`;
    await message.edit({ content: newMessage, components: rows });
  } catch (error) {
    console.error("Error updating message:", error);
  }
}

async function checkJoiningGameAbility(i, players) {
  if (players.some((player) => player.id === i.user.id)) {
    await i.reply({
      content: `✅ | <@${i.user.id}> لقد انضممت إلى اللعبة بالفعل!`,
      ephemeral: true,
    });
    return false;
  }
  if (players.length >= MAX_PLAYERS) {
    await i.reply({
      content: `😦 | <@${i.user.id}> اللعبة ممتلئة بالفعل!`,
      ephemeral: true,
    });
    return false;
  }
  return true;
}

async function eliminatedPlayersButtons(eliminatedPlayers) {
  const maxButtonsPerRow = 5;
  let rows = [];
  function short(n, len = 12) {
    return n.length > len ? n.slice(0, len - 2) + ".." : n;
  }
  for (let i = 0; i < eliminatedPlayers.length; i += maxButtonsPerRow) {
    const buttons = eliminatedPlayers
      .slice(i, i + maxButtonsPerRow)
      .map((player) =>
        new ButtonBuilder()
          .setCustomId(`revive_${player.id}`)
          .setEmoji(emojis[player.index] || "🔲")
          .setLabel(clampLabel(player.username, 80))
          .setStyle(ButtonStyle.Secondary)
      );
    if (buttons.length)
      rows.push(new ActionRowBuilder().addComponents(...buttons));
  }
  return rows;
}

async function mapPlayersToSectors(context, players) {
  async function getUserAvatarURL(context, userId) {
    if (String(userId).startsWith("bot_")) {
      return "https://cdn.discordapp.com/embed/avatars/0.png";
    }
    try {
      const user = await context.client.users.fetch(userId);
      return (
        user.displayAvatarURL({ extension: "png", size: 128 }) ||
        "https://cdn.discordapp.com/embed/avatars/0.png"
      );
    } catch (error) {
      console.error(`Error fetching avatar for user ${userId}:`, error);
      return "https://cdn.discordapp.com/embed/avatars/0.png";
    }
  }

  const sectors = await Promise.all(
    players.map(async (player) => {
      return {
        number: player.index,
        username: player.username,
        color: player.color,
        id: player.id,
        avatarURL: await getUserAvatarURL(context, player.id),
      };
    })
  );
  return sectors;
}

async function selectRandomPlayer(context, players) {
  try {
    const sectors = await mapPlayersToSectors(context, players);

    const shuffled = shuffleArray(sectors.sort((a, b) => a.number - b.number));
    const playerChosen = shuffled[0];

    const chosenId = playerChosen.id;
    const { buffer, duration } = await createAnimatedRouletteGIF(shuffled, chosenId, context.guild);
    return { playerChosen, image: buffer, duration, chosenIndex: chosenId };
  } catch (err) {
    console.error("Error selecting random player:", err);
    const randomIndex = Math.floor(Math.random() * players.length);
    const playerChosen = players[randomIndex];
    const canvas = createCanvas(350, 350);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#2f3136";
    ctx.fillRect(0, 0, 350, 350);
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px IBM";
    ctx.textAlign = "center";
    ctx.fillText("تم اختيار لاعب عشوائي", 175, 160);
    ctx.fillText(playerChosen.username, 175, 190);
    return {
      playerChosen,
      image: canvas.toBuffer("image/png"),
      duration: 0,
      chosenIndex: playerChosen.id,
    };
  }
}

function drawWheelFrame(ctx, size, baseImage, shuffledMembers, chosenId, rotation, isLastFrame, guildIcon, pinkShades) {
  const cx = size / 2;
  const cy = size / 2;
  const wheelRadius = size * 0.44;
  const innerRadius = wheelRadius * 0.26;
  const num = shuffledMembers.length || 1;
  const anglePer = (2 * Math.PI) / num;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);

  if (baseImage) {
    ctx.drawImage(baseImage, 0, 0, size, size);
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.translate(-cx, -cy);

  for (let i = 0; i < num; i++) {
    const start = -Math.PI / 2 + i * anglePer;
    const end = start + anglePer;
    const mid = (start + end) / 2;
    const player = shuffledMembers[i];

    const baseColor = pinkShades[i % pinkShades.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, wheelRadius, start, end);
    ctx.closePath();
    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.save();
    const textRadius = innerRadius + (wheelRadius - innerRadius) * 0.60;
    const tx = cx + Math.cos(mid) * textRadius;
    const ty = cy + Math.sin(mid) * textRadius;
    ctx.translate(tx, ty);
    ctx.rotate(mid);
    if (mid > Math.PI / 2 && mid < (3 * Math.PI) / 2) ctx.rotate(Math.PI);
    const label = clampLabel(player.username, 10);
    const fontSize = Math.max(9, Math.min(14, 140 / Math.max(label.length, 1)));
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  if (guildIcon) {
    ctx.clip();
    ctx.drawImage(guildIcon, cx - innerRadius, cy - innerRadius, innerRadius * 2, innerRadius * 2);
  } else {
    ctx.fillStyle = "#111316";
    ctx.fill();
  }
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  const needleX = cx + wheelRadius - 8;
  const needleY = cy;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(needleX + 18, needleY - 16);
  ctx.lineTo(needleX + 18, needleY + 16);
  ctx.lineTo(needleX - 8, needleY);
  ctx.closePath();
  ctx.fillStyle = "#00ffcc";
  ctx.fill();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

async function createAnimatedRouletteGIF(shuffledMembers, chosenId, guild) {
  try {
    let baseImage = null;

    let guildIcon = null;
    try {
      const iconURL = guild?.iconURL({ extension: 'png', size: 128 });
      if (iconURL) guildIcon = await loadImage(iconURL);
    } catch (_) {}

    const size = 500;
    const num = shuffledMembers.length || 1;
    const anglePer = (2 * Math.PI) / num;
    const chosenIdx = shuffledMembers.findIndex((p) => p.id === chosenId);

    const targetAngle = Math.PI/2 - (chosenIdx + 0.5) * anglePer;
    const totalRotation = targetAngle + 7 * 2 * Math.PI;

    const SPIN_FRAMES = 90;
    const HOLD_FRAMES = 3;
    const easeOut = (t) => 1 - Math.pow(1 - t, 4);

    const pinkShades = generatePinkShades(num);

    const earlyDelay = 40;
    const lateDelayMultiplier = 160;
    const holdDelay = 1500;

    const encoder = new GIFEncoder(size, size, "neuquant", true);
    encoder.setRepeat(-1);
    encoder.setQuality(3);
    encoder.setTransparent(0x000000);
    encoder.start();

    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    let totalDuration = 0;

    for (let f = 0; f < SPIN_FRAMES; f++) {
      const t = f / (SPIN_FRAMES - 1);
      const easedT = easeOut(t);
      const currentRotation = totalRotation * easedT;
      const delay = f < SPIN_FRAMES * 0.4 ? earlyDelay : Math.round(30 + (f / SPIN_FRAMES) * lateDelayMultiplier);
      encoder.setDelay(delay);
      totalDuration += delay;
      drawWheelFrame(ctx, size, baseImage, shuffledMembers, chosenId, currentRotation, false, guildIcon, pinkShades);
      encoder.addFrame(ctx.getImageData(0, 0, size, size).data);
    }

    encoder.setDelay(holdDelay);
    totalDuration += holdDelay * HOLD_FRAMES;
    for (let h = 0; h < HOLD_FRAMES; h++) {
      drawWheelFrame(ctx, size, baseImage, shuffledMembers, chosenId, totalRotation, true, guildIcon, pinkShades);
      encoder.addFrame(ctx.getImageData(0, 0, size, size).data);
    }

    encoder.finish();
    const buffer = Buffer.from(encoder.out.getData());
    return { buffer, duration: totalDuration };
  } catch (err) {
    console.error("createAnimatedRouletteGIF() failed:", err);
    const fallback = createCanvas(300, 300);
    const fctx = fallback.getContext("2d");
    fctx.fillStyle = "#2f3136";
    fctx.fillRect(0, 0, 300, 300);
    fctx.fillStyle = "#fff";
    fctx.font = "20px IBM";
    fctx.textAlign = "center";
    fctx.fillText("تم اختيار لاعب", 150, 140);
    return { buffer: fallback.toBuffer("image/png"), duration: 0 };
  }
}

function getRandomWinPoints() {
  const pts = config.winPoints.roulette;
  if (typeof pts === 'object') return Math.floor(Math.random() * (pts.max - pts.min + 1)) + pts.min;
  return pts;
}

async function win(playerId, context) {
  try {
    const points = getRandomWinPoints();
    await db.addPoints(playerId, points);
    console.log(`[Roulette] Gave ${points} points to winner ${playerId}`);
  } catch (e) {
    console.error(`[Roulette] Failed to apply win points: ${e}`);
  }
}
async function lose(playerId, context) {
  try {
    const points = getRandomWinPoints();
    await db.removePoints(playerId, points);
    console.log(`[Roulette] Removed ${points} points from eliminated player ${playerId}`);
  } catch (e) {
    console.error(`[Roulette] Failed to apply lose points: ${e}`);
  }
}
async function removeLoss(playerId, context) {
  try {
    const points = getRandomWinPoints();
    await db.addPoints(playerId, points);
    console.log(`[Roulette] Restored ${points} points to revived player ${playerId}`);
  } catch (e) {
    console.error(`[Roulette] Failed to restore points: ${e}`);
  }
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function shuffleArray(arr) {
  const randomNum = Math.floor(Math.random() * arr.length) + 1;
  const part1 = arr.slice(-randomNum);
  const part2 = arr.slice(0, arr.length - randomNum);
  return [...part1, ...part2];
}

function getRandomDarkHexCode(baseColor, index) {
  const colors = [
    "#BEBEC0",
    "#616E77",
    "#BEBEC0",
    "#BEBEC0",
    "#616E77",
    "#616E77",
    "#BEBEC0",
    "#616E77",
    "#616E77",
    "#BEBEC0",
    "#616E77",
    "#BEBEC0",
    "#BEBEC0",
    "#616E77",
    "#616E77",
    "#BEBEC0",
    "#616E77",
    "#BEBEC0",
    "#616E77",
    "#BEBEC0"
  ];
  return colors[index % colors.length];
}