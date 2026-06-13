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
  "<:zn1:1515295486704353340>", "<:zn2:1515294909572059168>", "<:zn3:1515295579746336849>", "<:zn4:1515295655889731685>", "<:zn5:1515295717063659600>", "<:zn6:1515295780670537828>", "<:zn7:1515295840376197240>", "<:zn8:1515295897339170836>", "<:zn9:1515295978494759032>", "<:znk1:1515296045171609724>",
  "<:znk2:1515294820191703092>", "<:znk2:1515294820191703092>",
  "<:znk3:1515298168735141908>", "<:znk4:1515298228747374602>",
  "<:znk6:1515298334133190734>", "<:znk7:1515298375833092197>",
  "<:znk8:1515298410616328282>", "<:znk9:1515298447320813588>",
  "<:znkk1:1515298483756859473>", "<:znkk2:1515298520138121366>",
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

// دالة مساعدة لبناء أزرار المتجر بشكل ديناميكي
function buildShopRows(shopItems, chooserScore, eliminatedPlayersCount, abilityEmojis) {
  const shopRows = [];
  for (let s = 0; s < shopItems.length; s += 3) {
    const row = new ActionRowBuilder();
    shopItems.slice(s, s + 3).forEach(item => {
      const canAfford = chooserScore >= item.cost;
      const hasElim = !item.requireEliminated || eliminatedPlayersCount > 0;
      const disabled = item.used || !canAfford || !hasElim;
      const labelText = item.used
        ? `${item.label} (مستخدم)`
        : item.label;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(item.id)
          .setEmoji(abilityEmojis[item.invKey] || "❓")
          .setLabel(labelText.substring(0, 80))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled)
      );
    });
    shopRows.push(row);
  }
  return shopRows;
}

async function startGame(context, nowTime, callback) {
  const players = [];
  const endTime = nowTime + TIME_TO_START / 1000;

  let content = `اللاعبين: **${players.length}/${MAX_PLAYERS}**\n**<t:${endTime}:R>**`;

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

  async function updateLobbyView() {
    try {
      const newContent = `اللاعبين: **${players.length}/${MAX_PLAYERS}**\n**<t:${endTime}:R>**`;
      await sentMessage.edit({ content: newContent });
    } catch (e) {
      console.error("Failed to update lobby view:", e);
    }
  }

  const updateInterval = setInterval(async () => {
    try {
      const newContent = `اللاعبين: **${players.length}/${MAX_PLAYERS}**\n**<t:${endTime}:R>**`;
      await sentMessage.edit({ content: newContent }).catch(() => {});
    } catch (e) {}
  }, 10000);

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

  const abilityEmojis = {
    nuclear: '<:z7:1512214884421734400>',
    reverse: '<:z8:1512222893772242953>',
    protect: '<:z9:1512222953826160740>',
    freeze: '<:z10:1512223654014881852>',
    twice: '<:z11:1512224011357126948>',
    revive: '<:z12:1512224063819485334>',
  };

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
        await updateLobbyView();
      } else if (i.customId === "exit") {
        if (!players.some((p) => p.id === i.user.id)) {
          await i.reply({ content: "🎲 | أنت لست في اللعبة!", ephemeral: true });
          return;
        }
        const removed = players.find((p) => p.id === i.user.id);
        players.splice(players.indexOf(removed), 1);
        await i.reply({ content: "🎲 | لقد خرجت من اللعبة بنجاح!", ephemeral: true });
        await updateLobbyView();
      } else if (i.customId === "open_shop_lobby") {
        // =====================================================================
        // المتجر في اللوبي - مُصلح: يسمح بشراء أكثر من عنصر بدون إعادة فتح
        // =====================================================================
        const costs = config.abilityCosts.roulette;

        const getShopItems = async () => {
          const currentScore = await db.getUserPoints(i.user.id) || 0;
          return {
            score: currentScore,
            items: [
              { id: "shop_buy_nuclear", label: "نووي - يطرد الجميع",  cost: costs.nuclear, invKey: "nuclear" },
              { id: "shop_buy_reverse", label: "طرد عكسي",            cost: costs.reverse,  invKey: "reverse" },
              { id: "shop_buy_protect", label: "حماية لاعب",           cost: costs.protect,  invKey: "protect" },
              { id: "shop_buy_freeze",  label: "تجميد لاعب",           cost: costs.freeze,   invKey: "freeze" },
              { id: "shop_buy_twice",   label: "طرد مرتين",            cost: costs.twice,    invKey: "twice" },
              { id: "shop_buy_revive",  label: "إحياء لاعب",           cost: costs.revive,   invKey: "revive" },
            ]
          };
        };

        const buildLobbyShopMessage = async () => {
          const { score, items } = await getShopItems();
          const playerInv = await inv.getItems(i.user.id);
          const shopRows = [];
          for (let s = 0; s < items.length; s += 3) {
            const row = new ActionRowBuilder();
            items.slice(s, s + 3).forEach(item => {
              const canAfford = score >= item.cost;
              const owned = playerInv[item.invKey] || 0;
              row.addComponents(
                new ButtonBuilder()
                  .setCustomId(item.id)
                  .setEmoji(abilityEmojis[item.invKey] || "❓")
                  .setLabel(`${item.label} (${item.cost}ن) [لديك: ${owned}]`.substring(0, 80))
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(!canAfford)
              );
            });
            shopRows.push(row);
          }
          return { score, shopRows };
        };

        const shopImageFile = await loadGameImage(config.shopImages?.roulette, "shop.png");
        const { score: initialScore, shopRows: initialRows } = await buildLobbyShopMessage();

        const replyPayload = {
          content: `<:z13:1512229604147068948> | رصيدك: **${initialScore}**`,
          components: initialRows,
          ephemeral: true,
          fetchReply: true,
        };
        if (shopImageFile) replyPayload.files = [shopImageFile];

        const replyMessage = await i.reply(replyPayload);

        // collector بدون stop بعد كل عملية شراء - يبقى مفتوحاً 60 ثانية
        const shopCollector = replyMessage.createMessageComponentCollector({
          filter: (shopI) => shopI.user.id === i.user.id && shopI.customId.startsWith("shop_buy_"),
          time: 60000,
        });

        shopCollector.on("collect", async (shopI) => {
          try {
            const invKey = shopI.customId.replace("shop_buy_", "");
            const costs2 = config.abilityCosts.roulette;
            const costMap = {
              nuclear: costs2.nuclear,
              reverse: costs2.reverse,
              protect: costs2.protect,
              freeze: costs2.freeze,
              twice: costs2.twice,
              revive: costs2.revive,
            };
            const labelMap = {
              nuclear: "نووي - يطرد الجميع",
              reverse: "طرد عكسي",
              protect: "حماية لاعب",
              freeze: "تجميد لاعب",
              twice: "طرد مرتين",
              revive: "إحياء لاعب",
            };

            const itemCost = costMap[invKey];
            if (itemCost === undefined) {
              await shopI.reply({ content: "عنصر غير معروف.", ephemeral: true });
              return;
            }

            const currentPoints = await db.getUserPoints(i.user.id) || 0;
            if (currentPoints < itemCost) {
              await shopI.reply({ content: "رصيدك غير كافٍ.", ephemeral: true });
              return;
            }

            await db.removePoints(i.user.id, itemCost);
            await inv.addItem(i.user.id, invKey, 1);

            // تحديث الأزرار بعد الشراء
            const { score: newScore, shopRows: newRows } = await buildLobbyShopMessage();
            await shopI.update({
              content: `<:z13:1512229604147068948> | رصيدك: **${newScore}** | ✅ اشتريت **${labelMap[invKey]}** بنجاح!`,
              components: newRows,
            });
          } catch (err) {
            console.error("Error in lobby shop collector:", err);
            try { await shopI.reply({ content: "حدث خطأ أثناء الشراء.", ephemeral: true }); } catch (e) {}
          }
        });

        shopCollector.on("end", () => {
          replyMessage.edit({ components: [] }).catch(() => {});
        });
      } else if (i.customId === "explain") {
        await i.reply({ content: "لا يوجد شرح متاح حالياً.", ephemeral: true });
      }
    } catch (error) {
      console.error("Error in lobby collector:", error);
      try { await i.reply({ content: "حدث خطأ.", ephemeral: true }); } catch (e) {}
    }
  });

  collector.on("end", async () => {
    clearInterval(updateInterval);
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
        await sentMessage.reply("<:z15:1515273469389181071> لم ينضم عدد كافٍ من اللاعبين. انتهى وقت الانضمام.");
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
        await context.channel.send(`<:z19:1515281183020155080> | **${playerChosen.username}** قرر طرد <@${botTarget.id}> عشوائياً!`);
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
          `❄️ | <@${randomPlayerId}> مجمد ولا يستطيع التصرف وتمت إزالته.`
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
      // =====================================================================
      // جلب الـ inventory في كل جولة لضمان تحديث ما اشتراه اللاعب من اللوبي
      // =====================================================================
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

      const abilityButtons = [];
      const abilityDefs = [
        { invKey: 'nuclear', cid: 'eliminate_nuclear', emoji: '<:z7:1512214884421734400>', label: 'نووي',       style: ButtonStyle.Danger,    used: chooserUsedAbilities.has('nuclear') },
        { invKey: 'reverse', cid: 'ability_reverse',   emoji: '<:z8:1512222893772242953>', label: 'طرد عكسي',   style: ButtonStyle.Secondary, used: chooserUsedAbilities.has('reverse') },
        { invKey: 'protect', cid: 'ability_protect',   emoji: '<:z9:1512222953826160740>', label: 'حماية',      style: ButtonStyle.Success,   used: chooserUsedAbilities.has('protect') },
        { invKey: 'freeze',  cid: 'ability_freeze',    emoji: '<:z10:1512223654014881852>', label: 'تجميد',      style: ButtonStyle.Secondary, used: chooserUsedAbilities.has('freeze') },
        { invKey: 'twice',   cid: 'eliminate_twice',   emoji: '<:z11:1512224011357126948>', label: 'طرد مرتين',  style: ButtonStyle.Secondary, used: chooserUsedAbilities.has('twice') },
        { invKey: 'revive',  cid: 'eliminate_revive',  emoji: '<:z12:1512224063819485334>', label: 'إحياء لاعب', style: ButtonStyle.Success,   used: chooserUsedAbilities.has('revive'), requireElim: true },
      ];

      for (const ab of abilityDefs) {
        const owned = playerInv[ab.invKey] || 0;
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

      const abilityRows = [];
      for (let i = 0; i < abilityButtons.length; i += 5) {
        abilityRows.push(new ActionRowBuilder().addComponents(...abilityButtons.slice(i, i + 5)));
      }

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

      // =====================================================================
      // kicktwice مُصلح: count=2 يعني لم يتم طرد أحد بعد
      // عند الطرد الأول count يصبح 1، عند الطرد الثاني count يصبح 0
      // =====================================================================
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

      // =====================================================================
      // handleStandardElimination مُصلح
      // =====================================================================
      const handleStandardElimination = async (
        chooserId,
        targetId,
        interaction
      ) => {
        const targetObj = players.find((p) => p.id === targetId);

        if (!targetObj) return;

        // التحقق من الحماية
        if (targetObj.protectedUntilRound >= ROUND_COUNTER) {
          targetObj.protectedUntilRound = 0;
          await interaction.reply({ content: `🛡️ | اللاعب <@${targetId}> محمي! لم يتم طرده.`, ephemeral: true });
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

        // التحقق من الطرد العكسي على الهدف
        if (targetObj.reverseUntilRound >= ROUND_COUNTER) {
          targetObj.reverseUntilRound = 0;
          await interaction.reply({ content: `🔁 | رد الطرد! <@${chooserId}> تم طردك بدلًا من <@${targetId}>!`, ephemeral: true });
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

        // التحقق من الطرد العكسي على الطارد نفسه (اشترى reverse من اللوبي وطبقه على نفسه)
        if (chooserObj && chooserObj.reverseUntilRound >= ROUND_COUNTER) {
          chooserObj.reverseUntilRound = 0;
          await interaction.reply({ content: `🔁 | أنت تحت تأثير طرد عكسي! تم طردك بدلًا من <@${targetId}>!`, ephemeral: true });
          await context.channel.send(`🔁 | <@${chooserId}> كان تحت تأثير طرد عكسي وتم طرده!`);
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

        // حالة kicktwice: الطرد الأول (count لا يزال 2)
        if (kicktwice.status && kicktwice.count === 2) {
          kicktwice.firstTargetId = targetId;
          kicktwice.count = 1;

          await lose(targetId, context);
          eliminatedPlayers.push(targetObj);
          const idx = players.findIndex((p) => p.id === targetId);
          if (idx !== -1) players.splice(idx, 1);

          await interaction.reply({
            content: `<:z14:1515267001134616586> | تم طرد <@${targetId}>. اختر اللاعب الثاني.`,
            ephemeral: true,
          });

          // تحديث الأزرار لتعطيل اللاعب المطرود
          try {
            const disableTargetInRows = (rows) =>
              rows.map((row) => {
                const components = row.components.map((button) => {
                  if (button.data && button.data.custom_id === `eliminate_${targetId}`) {
                    return ButtonBuilder.from(button).setDisabled(true);
                  }
                  return ButtonBuilder.from(button);
                });
                return new ActionRowBuilder().addComponents(...components);
              });

            await eliminationMessageA.edit({
              components: disableTargetInRows(eliminationMessageA.components).slice(0, 5),
            }).catch(() => {});
            if (eliminationMessageB) {
              await eliminationMessageB.edit({
                components: disableTargetInRows(eliminationMessageB.components),
              }).catch(() => {});
            }
          } catch (e) {
            console.error("Error updating kicktwice buttons:", e);
          }

          voteTaken = false;
          return;
        }

        // حالة kicktwice: الطرد الثاني (count أصبح 1)
        if (kicktwice.status && kicktwice.count === 1) {
          kicktwice.count = 0;
          await lose(targetId, context);
          eliminatedPlayers.push(targetObj);
          const idx = players.findIndex((p) => p.id === targetId);
          if (idx !== -1) players.splice(idx, 1);

          await context.channel.send(`💣 | تم طرد <@${kicktwice.firstTargetId}> و <@${targetId}>.`);
          kicktwice.status = false;
          kicktwice.firstTargetId = null;

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

        // طرد عادي
        await interaction.reply({ content: `<:z14:1515267001134616586> | <@${chooserId}> قام بطرد اللاعب: <@${targetId}>`, ephemeral: true });
        await context.channel.send(`<:z14:1515267001134616586> | <@${chooserId}> قام بطرد اللاعب: <@${targetId}>`);

        await lose(targetId, context);
        eliminatedPlayers.push(targetObj);
        const idx = players.findIndex((p) => p.id === targetId);
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
      };

      collectors.forEach((col) => {
        col.on("collect", async (ii) => {
          try {
            if (ii.user.id !== randomPlayerId) {
              await ii.reply({
                content: `<:z5:1512126721367736481> | ليس دورك <@${ii.user.id}>`,
                ephemeral: true,
              });
              return;
            }

            // التحقق من الطرد العكسي على الطارد قبل أي محاولة طرد
            const isEliminationAttempt =
              (ii.customId.startsWith("eliminate_") &&
                ii.customId !== "eliminate_withdraw" &&
                ii.customId !== "eliminate_revive") ||
              ii.customId === "eliminate_random" ||
              ii.customId === "eliminate_nuclear" ||
              ii.customId === "eliminate_twice";

            if (chooserObj && chooserObj.reverseUntilRound >= ROUND_COUNTER && isEliminationAttempt) {
              chooserObj.reverseUntilRound = 0;
              await ii.reply({ content: `🔁 | لقد حاولت طرد لاعب وأنت تحت تأثير "طرد عكسي"! تم طردك.`, ephemeral: true });
              await context.channel.send(`🔁 | <@${randomPlayerId}> حاول الطرد وكان تحت تأثير طرد عكسي! تم طرده.`);

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
              const abilityEmojisInGame = {
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

              const shopRows = [];
              for (let s = 0; s < shopItems.length; s += 3) {
                const row = new ActionRowBuilder();
                shopItems.slice(s, s + 3).forEach(item => {
                  const canAfford = chooserScore >= item.cost;
                  const hasElim = !item.requireEliminated || eliminatedPlayers.length > 0;
                  const disabled = item.used || !canAfford || !hasElim;
                  const labelText = item.used
                    ? `${item.label} (مستخدم)`
                    : item.label;
                  row.addComponents(
                    new ButtonBuilder()
                      .setCustomId(item.id)
                      .setEmoji(abilityEmojisInGame[item.invKey] || "❓")
                      .setLabel(labelText.substring(0, 80))
                      .setStyle(ButtonStyle.Secondary)
                      .setDisabled(disabled)
                  );
                });
                shopRows.push(row);
              }

              const replyPayload = {
                content: `🛒 | رصيدك: **${chooserScore}ن**`,
                components: shopRows,
                ephemeral: true,
              };
              if (shopImageFile) replyPayload.files = [shopImageFile];

              await ii.reply(replyPayload);
              voteTaken = false;
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
              voteTaken = true;
              await lose(randomPlayerId, context);
              await context.channel.send(`<:z6:1512127272184975360> | <@${randomPlayerId}> انسحب من اللعبة.`);
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
              const currentFilteredPlayers = players.filter((p) => p.id !== randomPlayerId);
              if (currentFilteredPlayers.length === 0) {
                await ii.reply({ content: "لا يوجد لاعبين آخرين!", ephemeral: true });
                voteTaken = false;
                return;
              }
              let randomTarget = currentFilteredPlayers[Math.floor(Math.random() * currentFilteredPlayers.length)];

              if (randomTarget.protectedUntilRound >= ROUND_COUNTER) {
                randomTarget.protectedUntilRound = 0;
                await ii.reply({ content: `🛡️ | اللاعب <@${randomTarget.id}> محمي! لم يتم طرده.`, ephemeral: true });
                await context.channel.send(`🛡️ | اللاعب <@${randomTarget.id}> محمي! لم يتم طرده.`);
                stopAll("done");
                await prepareRound(context, players, eliminatedPlayers, client, callback);
                return;
              }

              await ii.reply({ content: `<:z14:1515267001134616586> | <@${randomPlayerId}> قام بطرد عشوائياً اللاعب: <@${randomTarget.id}>`, ephemeral: true });
              await context.channel.send(`<:z14:1515267001134616586> | <@${randomPlayerId}> قام بطرد عشوائيا اللاعب: <@${randomTarget.id}>`);
              await lose(randomTarget.id, context);
              eliminatedPlayers.push(randomTarget);
              players.splice(
                players.findIndex((p) => p.id === randomTarget.id),
                1
              );
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
              await ii.reply({ content: `☢️ | استخدمت النووي!`, ephemeral: true });
              await context.channel.send(
                `☢️ | <@${randomPlayerId}> استخدم النووي وطرد: ${others
                  .map((p) => `<@${p.id}>`)
                  .join(", ")}`
              );
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
            } else if (cid === "eliminate_twice") {
              await ii.reply({
                content: `🎲 | لقد قررت طرد مرتين. اختر اللاعب الأول.`,
                ephemeral: true,
              });
              await inv.useItem(randomPlayerId, 'twice');
              chooserObj.usedAbilities.add("twice");
              // =====================================================================
              // kicktwice مُصلح: نبدأ بـ count=2
              // =====================================================================
              kicktwice.count = 2;
              kicktwice.status = true;
              kicktwice.firstTargetId = null;
              voteTaken = false;
              return;
            } else if (cid === "eliminate_revive") {
              if (eliminatedPlayers.length === 0) {
                await ii.reply({ content: "لا يوجد لاعبين لإحيائهم!", ephemeral: true });
                voteTaken = false;
                return;
              }
              const reviveRows = await eliminatedPlayersButtons(eliminatedPlayers);
              if (!reviveRows || reviveRows.length === 0) {
                await ii.reply({
                  content: "لا يوجد لاعبين لإحيائهم!",
                  ephemeral: true,
                });
                voteTaken = false;
                return;
              }
              const reviveReply = await ii.reply({
                content: `🎲 | <@${randomPlayerId}> اختر لاعباً لإحيائه:`,
                components: reviveRows,
                ephemeral: true,
                fetchReply: true,
              });
              await inv.useItem(randomPlayerId, 'revive');
              chooserObj.usedAbilities.add("revive");

              const reviveCollector = reviveReply.createMessageComponentCollector({
                filter: (r) =>
                  typeof r.customId === "string" &&
                  r.customId.startsWith("revive_") &&
                  r.user.id === randomPlayerId,
                time: 15000,
              });

              let reviveDone = false;

              reviveCollector.on("collect", async (ri) => {
                if (reviveDone) return;
                reviveDone = true;
                const revivedPlayerId = ri.customId.split("_")[1];
                const revivedPlayer = eliminatedPlayers.find(
                  (p) => p.id === revivedPlayerId
                );
                if (!revivedPlayer) {
                  await ri.reply({ content: "لاعب غير موجود.", ephemeral: true });
                  reviveCollector.stop();
                  return;
                }
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
                voteTaken = true;
                stopAll("done");
                await prepareRound(
                  context,
                  players,
                  eliminatedPlayers,
                  client,
                  callback
                );
              });

              reviveCollector.on("end", async (col) => {
                if (!reviveDone) {
                  await context.channel.send(`<@${randomPlayerId}> لم تختر أحد للإحياء.`);
                  voteTaken = true;
                  stopAll("done");
                  await prepareRound(
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
              const ability = cid.split("_")[1];

              // التحقق من أن اللاعب يمتلك القدرة فعلاً
              const abilityInvMap = {
                reverse: 'reverse',
                protect: 'protect',
                freeze: 'freeze',
              };
              const invKeyForAbility = abilityInvMap[ability];
              if (!invKeyForAbility) {
                await ii.reply({ content: "قدرة غير معروفة.", ephemeral: true });
                voteTaken = false;
                return;
              }
              const ownedCount = playerInv[invKeyForAbility] || 0;
              if (ownedCount <= 0) {
                await ii.reply({ content: "لا تمتلك هذه القدرة!", ephemeral: true });
                voteTaken = false;
                return;
              }

              const abilityTargets = players.map(
                (p) =>
                  new ButtonBuilder()
                    .setCustomId(`abilitytarget_${ability}_${p.id}`)
                    .setEmoji(emojis[p.index] || "🔲")
                    .setLabel(clampLabel(p.username, 80))
                    .setStyle(ButtonStyle.Secondary)
              );
              const abilityRowsForTarget = [];
              for (let r = 0; r < abilityTargets.length; r += 5)
                abilityRowsForTarget.push(
                  new ActionRowBuilder().addComponents(
                    ...abilityTargets.slice(r, r + 5)
                  )
                );

              const abilityReply = await ii.reply({
                content: `اختر لاعباً لتطبيق القدرة (${ability}):`,
                components: abilityRowsForTarget,
                ephemeral: true,
                fetchReply: true,
              });

              const abilityCollector = abilityReply.createMessageComponentCollector(
                {
                  filter: (ai) =>
                    typeof ai.customId === "string" &&
                    ai.customId.startsWith("abilitytarget_") &&
                    ai.user.id === randomPlayerId,
                  time: 15000,
                }
              );

              let abilityDone = false;

              abilityCollector.on("collect", async (ai) => {
                if (abilityDone) return;
                abilityDone = true;
                const parts = ai.customId.split("_");
                const chosenAbility = parts[1];
                const targetId = parts[2];
                const targetObj = players.find((p) => p.id === targetId);
                if (!targetObj) {
                  await ai.reply({
                    content: "لا يمكن العثور على اللاعب.",
                    ephemeral: true,
                  });
                  abilityCollector.stop();
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
                  await context.channel.send(`🔁 | <@${randomPlayerId}> طبّق طرد عكسي على لاعب!`);
                } else if (chosenAbility === "protect") {
                  await inv.useItem(randomPlayerId, 'protect');
                  targetObj.protectedUntilRound = ROUND_COUNTER + 1;
                  chooserObj.usedAbilities.add("protect");
                  await ai.update({
                    content: `🛡️ | تم حماية <@${targetId}> للجولة القادمة.`,
                    components: [],
                  });
                  await context.channel.send(`🛡️ | <@${randomPlayerId}> قام بحماية لاعب!`);
                } else if (chosenAbility === "freeze") {
                  await inv.useItem(randomPlayerId, 'freeze');
                  targetObj.frozenUntilRound = ROUND_COUNTER + 1;
                  chooserObj.usedAbilities.add("freeze");
                  await ai.update({
                    content: `❄️ | تم تجميد <@${targetId}> للجولة القادمة.`,
                    components: [],
                  });
                  await context.channel.send(`❄️ | <@${randomPlayerId}> قام بتجميد لاعب!`);
                } else {
                  await ai.update({
                    content: `القدرة غير معروفة.`,
                    components: [],
                  });
                }
                abilityCollector.stop();
                voteTaken = true;
                stopAll("done");
                await prepareRound(
                  context,
                  players,
                  eliminatedPlayers,
                  client,
                  callback
                );
              });

              abilityCollector.on("end", async (col) => {
                if (!abilityDone) {
                  await context.channel.send(`<@${randomPlayerId}> لم تختر هدفاً للقدرة.`);
                  voteTaken = true;
                  stopAll("done");
                  await prepareRound(
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
              if (!targetId || targetId === "nuclear" || targetId === "twice" || targetId === "revive" || targetId === "random" || targetId === "withdraw") {
                await ii.reply({ content: "خيار غير صالح.", ephemeral: true });
                voteTaken = false;
                return;
              }
              await handleStandardElimination(randomPlayerId, targetId, ii);
              return;
            } else {
              await ii.reply({ content: "خيار غير معروف.", ephemeral: true });
              voteTaken = false;
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
            voteTaken = true;
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
            reason !== "done" &&
            reason !== "reset" &&
            reason !== "error" &&
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
                  `⏱️ | <@${randomPlayerId}> لم تختر أحد وتم طردك.`
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
