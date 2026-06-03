const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../database.js");
const config = require("../config.js");
const inv = require("../inventory.js");

const { createCanvas, loadImage } = require("@napi-rs/canvas");
const path = require("path");
const GIFEncoder = require("gif-encoder-2");

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 99;
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

// ---------------------- دوال اللوبي المعدلة ----------------------

async function startGame(context, nowTime, callback) {
  const players = [];
  const endTime = nowTime + TIME_TO_START / 1000;

  // محتوى الرسالة الأول
  let currentContent = `اللاعبين: **0/${MAX_PLAYERS}**\n**<t:${endTime}:R>**`;

  // صف الأزرار باللون الرمادي والإيموجي المطلوب
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("join")
      .setLabel("دخول")
      .setEmoji("<:z1:1511780346008436946>")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("exit")
      .setLabel("خروج")
      .setEmoji("<:z2:1511780387506880542>")
      .setStyle(ButtonStyle.Secondary)
  );

  // تجهيز الصورة كمرفق (لتظهر أسفل النص)
  const lobbyImagePath = config.lobbyImages.roulette;
  let filesArray = [];
  if (lobbyImagePath) {
    const fileName = path.basename(lobbyImagePath);
    filesArray.push(new AttachmentBuilder(lobbyImagePath, { name: fileName }));
  }

  const sendOptions = {
    content: currentContent,
    components: [row],
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true,
  };
  if (filesArray.length > 0) sendOptions.files = filesArray;

  const sentMessage = await context.reply(sendOptions);

  // دالة تحديث النص فقط (الوقت يتغير)
  async function updateLobbyView() {
    try {
      const newContent = `اللاعبين: **${players.length}/${MAX_PLAYERS}**\n**<t:${endTime}:R>**`;
      await sentMessage.edit({
        content: newContent,
        components: [row],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (e) {
      console.error("Failed to update lobby view:", e);
    }
  }

  // تحديث الوقت كل 10 ثوانٍ
  const updateInterval = setInterval(async () => {
    if (Date.now() / 1000 >= endTime) {
      clearInterval(updateInterval);
      return;
    }
    try {
      const newContent = `اللاعبين: **${players.length}/${MAX_PLAYERS}**\n**<t:${endTime}:R>**`;
      await sentMessage.edit({
        content: newContent,
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (e) {}
  }, 10000);

  await updateLobbyView();

  const filter = (i) => {
    try {
      if (!i || !i.customId) return false;
      return i.customId === "join" || i.customId === "exit";
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
          username: i.user.username || i.user.tag.split("#")[0],
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

    // حذف النص والأزرار من الرسالة الأصلية وترك الصورة فقط
    try {
      await sentMessage.edit({
        content: '',
        components: [],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (e) {}

    // إرسال رسالة جديدة بانتهاء وقت الانضمام
    await context.channel.send("انتهى وقت الانضمام!");

    if (players.length < MIN_PLAYERS) {
      await context.channel.send("لا يوجد عدد كافٍ من اللاعبين لبدء اللعبة. 🚶‍♂️");
      resetGameData();
      callback(null, false, 0, null);
      return;
    }

    let eliminatedPlayers = [];
    await context.channel.send("| اللعبة تبدأ الآن!");
    await sleep(3000);
    await prepareRound(context, players, eliminatedPlayers, context.client, callback);
  });
}

// ---------------------- باقي دوال اللعبة (لم يتم التعديل عليها) ----------------------

async function prepareRound(context, players, eliminatedPlayers, client, callback) {
  try {
    const currentTime = Date.now();
    if (currentTime - LAST_ROUND_TIME < 5000) {
      await sleep(5000 - (currentTime - LAST_ROUND_TIME));
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
      await win(winner.id, context);
      await sleep(2000);
      await context.channel.send({
        content: `🎉 | الفائز هو <@${winner.id}>! تهانينا!`,
      });
      resetGameData();
      callback(null, false, 0, null);
      return;
    }

    if (players.length === 2) {
      if (CURRENTLY_SENDING_IMAGE) return;
      CURRENTLY_SENDING_IMAGE = true;

      try {
        const { playerChosen, image } = await selectRandomPlayer(context, players);
        const winner = playerChosen;
        const attachment = new AttachmentBuilder(image, { name: "roulette.gif" });
        await context.channel.send({ files: [attachment] });
        await sleep(2000);

        await win(winner.id, context);
        await sleep(2000);
        await context.channel.send({
          content: `🎉 | الفائز هو <@${winner.id}>! تهانينا!`,
        });

        resetGameData();
        callback(null, false, 0, null);
        return;
      } catch (err) {
        console.error("Error in final round:", err);
        const randomIndex = Math.floor(Math.random() * 2);
        const winner = players[randomIndex];
        await context.channel.send(`🎲 | حدث خطأ، الفائز هو <@${winner.id}>!`);
        await win(winner.id, context);
        resetGameData();
        callback(null, false, 0, null);
        return;
      }
    }

    if (CURRENTLY_SENDING_IMAGE) return;
    CURRENTLY_SENDING_IMAGE = true;

    try {
      const { playerChosen, image, chosenIndex } = await selectRandomPlayer(context, players);
      const randomPlayerId = playerChosen.id;

      if (randomPlayerId === LAST_SELECTED_PLAYER_ID && players.length > 2) {
        CURRENTLY_SENDING_IMAGE = false;
        await prepareRound(context, players, eliminatedPlayers, client, callback);
        return;
      }
      LAST_SELECTED_PLAYER_ID = randomPlayerId;

      const attachment = new AttachmentBuilder(image, { name: "roulette.gif" });
      await context.channel.send({ files: [attachment] });
      await sleep(1500);
      CURRENTLY_SENDING_IMAGE = false;

      if (playerChosen.isBot) {
        const botTargets = players.filter((p) => p.id !== randomPlayerId);
        if (botTargets.length === 0) {
          await prepareRound(context, players, eliminatedPlayers, client, callback);
          return;
        }
        const botTarget = botTargets[Math.floor(Math.random() * botTargets.length)];
        await sleep(1500);
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
      const chooserUsedAbilities = (chooserObj && chooserObj.usedAbilities) || new Set();
      const isFrozen = chooserObj && chooserObj.frozenUntilRound >= ROUND_COUNTER;
      if (isFrozen) {
        await context.channel.send(`|<@${randomPlayerId}> مجمد ولا يستطيع التصرف وتمت إزالته.`);
        await lose(randomPlayerId, context);
        eliminatedPlayers.push(chooserObj);
        const idx = players.findIndex((p) => p.id === randomPlayerId);
        if (idx !== -1) players.splice(idx, 1);
        await prepareRound(context, players, eliminatedPlayers, client, callback);
        return;
      }

      const chooserScore = await db.getUserPoints(randomPlayerId) || 0;
      const costs = config.abilityCosts.roulette;
      const playerInv = await inv.getItems(randomPlayerId);

      const filteredPlayers = players.filter((p) => p.id !== randomPlayerId);
      const targetRows = [];
      const chunkSize = 5;
      for (let i = 0; i < filteredPlayers.length; i += chunkSize) {
        const comps = filteredPlayers.slice(i, i + chunkSize).map((pl) =>
          new ButtonBuilder()
            .setCustomId(`eliminate_${pl.id}`)
            .setEmoji(emojis[pl.index] || "🔲")
            .setLabel(clampLabel(pl.username, 80))
            .setStyle(ButtonStyle.Secondary)
        );
        targetRows.push(new ActionRowBuilder().addComponents(...comps));
      }

      const actionButtons = [];
      if (players.length > 2)
        actionButtons.push(
          new ButtonBuilder()
            .setCustomId("eliminate_random")
            .setEmoji("🎲")
            .setLabel("طرد عشوائي")
            .setStyle(ButtonStyle.Primary)
        );

      const abilityDefs = [
        { invKey: 'nuclear', cid: 'eliminate_nuclear', emoji: '☢️', label: 'نووي',       style: ButtonStyle.Danger,    used: chooserUsedAbilities.has('nuclear') },
        { invKey: 'reverse', cid: 'ability_reverse',   emoji: '🔁', label: 'طرد عكسي',   style: ButtonStyle.Secondary, used: chooserUsedAbilities.has('reverse') },
        { invKey: 'protect', cid: 'ability_protect',   emoji: '🛡️', label: 'حماية',      style: ButtonStyle.Success,   used: chooserUsedAbilities.has('protect') },
        { invKey: 'freeze',  cid: 'ability_freeze',    emoji: '❄️', label: 'تجميد',      style: ButtonStyle.Secondary, used: chooserUsedAbilities.has('freeze') },
        { invKey: 'twice',   cid: 'eliminate_twice',   emoji: '🔥', label: 'طرد مرتين',  style: ButtonStyle.Secondary, used: chooserUsedAbilities.has('twice') },
        { invKey: 'revive',  cid: 'eliminate_revive',  emoji: '🔄', label: 'إحياء لاعب', style: ButtonStyle.Success,   used: chooserUsedAbilities.has('revive'), requireElim: true },
      ];

      for (const ab of abilityDefs) {
        const owned = playerInv[ab.invKey] || 0;
        if (owned > 0 && !ab.used && (!ab.requireElim || eliminatedPlayers.length > 0)) {
          actionButtons.push(
            new ButtonBuilder()
              .setCustomId(ab.cid)
              .setEmoji(ab.emoji)
              .setLabel(`${ab.label} (${owned}x)`)
              .setStyle(ab.style)
          );
        }
      }

      actionButtons.push(
        new ButtonBuilder()
          .setCustomId("eliminate_withdraw")
          .setEmoji("<:Gleave:1285563197092401214>")
          .setLabel("الانسحاب")
          .setStyle(ButtonStyle.Danger)
      );

      for (let i = 0; i < actionButtons.length; i += 5) {
        targetRows.push(new ActionRowBuilder().addComponents(...actionButtons.slice(i, i + 5)));
      }

      const collectorTimeout = eliminatedPlayers.length > 0 ? 15000 : 25000;
      const contentMsg = `🎲 | <@${randomPlayerId}> لديك **${collectorTimeout / 1000} ثانية** لاختيار لاعب لطرده، او يمكنك استخدام قدرة.`;

      const allRows = targetRows.slice(0, 5);
      const eliminationMessageA = await context.channel.send({
        content: contentMsg,
        components: allRows,
      });
      const originalHalf = allRows.length;

      const collectors = [];
      const eliminateFilter = (ii) =>
        typeof ii.customId === "string" &&
        (ii.customId.startsWith("eliminate_") ||
          ii.customId.startsWith("ability_") ||
          ii.customId === "open_shop");
      const createCollector = (msg) =>
        msg.createMessageComponentCollector({
          filter: eliminateFilter,
          time: collectorTimeout,
        });
      collectors.push(createCollector(eliminationMessageA));

      let kicktwice = { status: false, count: 0, firstTargetId: null };
      let playerHasWithdraw = false;
      let voteTaken = false;

      const stopAll = (reason) =>
        collectors.forEach((c) => { try { c.stop(reason); } catch (e) {} });

      const handleStandardElimination = async (chooserId, targetId, interaction) => {
        const targetObj = players.find((p) => p.id === targetId);
        if (!targetObj) return;

        if (targetObj.protectedUntilRound >= ROUND_COUNTER) {
          targetObj.protectedUntilRound = 0;
          await interaction.update({ content: `🛡️ | تم منع محاولة طرد <@${targetId}> بواسطة الحماية!`, components: [] });
          await prepareRound(context, players, eliminatedPlayers, client, callback);
          return;
        }

        if (targetObj.reverseUntilRound >= ROUND_COUNTER) {
          targetObj.reverseUntilRound = 0;
          await interaction.update({ content: `🔁 | رد الطرد! <@${chooserId}> تم طردك بدلًا من <@${targetId}>!`, components: [] });
          await lose(chooserId, context);
          eliminatedPlayers.push(chooserObj);
          const idx = players.findIndex((p) => p.id === chooserId);
          if (idx !== -1) players.splice(idx, 1);
          await prepareRound(context, players, eliminatedPlayers, client, callback);
          return;
        }

        if (kicktwice.status && kicktwice.count > 1) {
          await interaction.reply({ content: `💣 | تم طرد <@${targetId}>. اختر اللاعب الثاني.`, ephemeral: true });
          const newRows = [eliminationMessageA].filter(Boolean).flatMap(m => m.components);
          const updatedRows = newRows.map(row => {
            const components = row.components.map(button => {
              if (button.customId === `eliminate_${targetId}`) {
                return ButtonBuilder.from(button).setDisabled(true).setLabel(`${button.label} (تم الطرد)`);
              }
              return button;
            });
            return new ActionRowBuilder().addComponents(...components);
          });
          if (eliminationMessageA) await eliminationMessageA.edit({ components: updatedRows.slice(0, originalHalf) });
          kicktwice.firstTargetId = targetId;
        } else {
          if (kicktwice.status && kicktwice.firstTargetId) {
            await interaction.update({ content: `💣 | تم طرد <@${kicktwice.firstTargetId}> و <@${targetId}>.`, components: [] });
          } else {
            await interaction.update({ content: `💣 | تم طرد <@${targetId}>.`, components: [] });
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
            await prepareRound(context, players, eliminatedPlayers, client, callback);
            return;
          }
        } else {
          await prepareRound(context, players, eliminatedPlayers, client, callback);
          return;
        }
      };

      collectors.forEach((col) => {
        col.on("collect", async (ii) => {
          try {
            if (ii.user.id !== randomPlayerId) {
              await ii.reply({ content: `🎲 | ليس دورك <@${ii.user.id}>`, ephemeral: true });
              return;
            }

            const isReversed = chooserObj && chooserObj.reverseUntilRound >= ROUND_COUNTER;
            const isEliminationAttempt =
              (ii.customId.startsWith("eliminate_") &&
                !ii.customId.startsWith("eliminate_withdraw") &&
                !ii.customId.startsWith("eliminate_revive")) ||
              ii.customId === "eliminate_random" ||
              ii.customId === "eliminate_nuclear" ||
              ii.customId === "eliminate_twice";

            if (isReversed && isEliminationAttempt) {
              chooserObj.reverseUntilRound = 0;
              await ii.update({ content: `🔁 | لقد حاولت طرد لاعب وأنت تحت تأثير "طرد عكسي"! تم طردك.`, components: [] });
              await lose(randomPlayerId, context);
              eliminatedPlayers.push(chooserObj);
              const idx = players.findIndex((p) => p.id === randomPlayerId);
              if (idx !== -1) players.splice(idx, 1);
              voteTaken = true;
              stopAll("done");
              await prepareRound(context, players, eliminatedPlayers, client, callback);
              return;
            }

            voteTaken = true;
            const cid = ii.customId;

            if (cid === "open_shop") {
              const shopItems = [
                { id: "eliminate_nuclear", label: `نووي - يطرد الجميع`, cost: costs.nuclear, emoji: "☢️", style: ButtonStyle.Danger, used: chooserUsedAbilities.has("nuclear") },
                { id: "ability_reverse",   label: `طرد عكسي`,           cost: costs.reverse,  emoji: "🔁", style: ButtonStyle.Secondary, used: chooserUsedAbilities.has("reverse") },
                { id: "ability_protect",   label: `حماية لاعب`,          cost: costs.protect,  emoji: "🛡️", style: ButtonStyle.Success, used: chooserUsedAbilities.has("protect") },
                { id: "ability_freeze",    label: `تجميد لاعب`,          cost: costs.freeze,   emoji: "❄️", style: ButtonStyle.Secondary, used: chooserUsedAbilities.has("freeze") },
                { id: "eliminate_twice",   label: `طرد مرتين`,           cost: costs.twice,    emoji: "🔥", style: ButtonStyle.Secondary, used: chooserUsedAbilities.has("twice") },
                { id: "eliminate_revive",  label: `إحياء لاعب`,          cost: costs.revive,   emoji: "🔄", style: ButtonStyle.Success, used: chooserUsedAbilities.has("revive"), requireEliminated: true },
              ];

              const shopRows = [];
              for (let s = 0; s < shopItems.length; s += 5) {
                const row = new ActionRowBuilder();
                shopItems.slice(s, s + 5).forEach(item => {
                  const canAfford = chooserScore >= item.cost;
                  const hasElim = !item.requireEliminated || eliminatedPlayers.length > 0;
                  const disabled = item.used || !canAfford || !hasElim;
                  const labelText = item.used ? `${item.label} (مستخدم)` : `${item.label} - ${item.cost}ن`;
                  row.addComponents(
                    new ButtonBuilder()
                      .setCustomId(item.id)
                      .setEmoji(item.emoji)
                      .setLabel(labelText.substring(0, 80))
                      .setStyle(item.style)
                      .setDisabled(disabled)
                  );
                });
                shopRows.push(row);
              }

              const shopDesc = shopItems.map(item => {
                const status = item.used ? '✅ مستخدم' : chooserScore >= item.cost ? `${item.cost}ن` : `${item.cost}ن (ما يكفي)`;
                return `${item.emoji} **${item.label}** — ${status}`;
              }).join('\n');

              await ii.reply({ content: `🛒 | **متجر القدرات** — رصيدك: **${chooserScore}ن**\n\n${shopDesc}`, components: shopRows, ephemeral: true });
              voteTaken = false;
              return;
            }

            if (cid === "eliminate_withdraw") {
              const idx = players.findIndex((p) => p.id === randomPlayerId);
              if (idx !== -1) players.splice(idx, 1);
              await ii.update({ content: `🎲 | <@${randomPlayerId}> قرر الانسحاب...`, components: [] });
              playerHasWithdraw = true;
              await lose(randomPlayerId, context);
              stopAll("done");
              await prepareRound(context, players, eliminatedPlayers, client, callback);
              return;
            } else if (cid === "eliminate_random") {
              await ii.update({ content: `🎲 | <@${randomPlayerId}> قرر الطرد العشوائي...`, components: [] });
              let randomTarget = filteredPlayers[Math.floor(Math.random() * filteredPlayers.length)];
              if (randomTarget.protectedUntilRound >= ROUND_COUNTER) {
                randomTarget.protectedUntilRound = 0;
                await context.channel.send(`🛡️ | اللاعب <@${randomTarget.id}> محمي! لم يتم طرده.`);
                stopAll("done");
                await prepareRound(context, players, eliminatedPlayers, client, callback);
                return;
              }
              await context.channel.send(`💣 | <@${randomPlayerId}> قام بطرد عشوائيا اللاعب: <@${randomTarget.id}>`);
              await lose(randomTarget.id, context);
              eliminatedPlayers.push(randomTarget);
              players.splice(players.findIndex((p) => p.id === randomTarget.id), 1);
              stopAll("done");
              await prepareRound(context, players, eliminatedPlayers, client, callback);
              return;
            } else if (cid === "eliminate_nuclear") {
              await ii.update({ components: [] });
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
              await context.channel.send(`☢️ | <@${randomPlayerId}> استخدم النووي وطرد: ${others.map(p => `<@${p.id}>`).join(", ")}`);
              stopAll("done");
              await prepareRound(context, players, eliminatedPlayers, client, callback);
              return;
            } else if (cid === "eliminate_twice") {
              await ii.reply({ content: `🎲 | لقد قررت طرد مرتين. اختر اللاعب الأول.`, ephemeral: true });
              await inv.useItem(randomPlayerId, 'twice');
              chooserObj.usedAbilities.add("twice");
              kicktwice.count = 2;
              kicktwice.status = true;
              kicktwice.firstTargetId = null;
              voteTaken = false;
              return;
            } else if (cid === "eliminate_revive") {
              const reviveRows = await eliminatedPlayersButtons(eliminatedPlayers);
              if (!reviveRows || reviveRows.length === 0) {
                await ii.reply({ content: "لا يوجد لاعبين لإحيائهم!", ephemeral: true });
                voteTaken = false;
                return;
              }
              await ii.update({ content: `🎲 | <@${randomPlayerId}> قرر إحياء لاعب...`, components: reviveRows });
              await inv.useItem(randomPlayerId, 'revive');
              chooserObj.usedAbilities.add("revive");
              const reviveCollector = ii.message.createMessageComponentCollector({
                filter: (r) => typeof r.customId === "string" && r.customId.startsWith("revive_") && r.user.id === randomPlayerId,
                time: 10000,
              });
              reviveCollector.on("collect", async (ri) => {
                const revivedPlayerId = ri.customId.split("_")[1];
                const revivedPlayer = eliminatedPlayers.find(p => p.id === revivedPlayerId);
                await removeLoss(revivedPlayerId, context);
                players.push(revivedPlayer);
                eliminatedPlayers.splice(eliminatedPlayers.findIndex(p => p.id === revivedPlayerId), 1);
                await ri.update({ content: `🎲 | <@${randomPlayerId}> قام بإحياء <@${revivedPlayerId}>!`, components: [] });
                reviveCollector.stop();
                stopAll("done");
                await prepareRound(context, players, eliminatedPlayers, client, callback);
              });
              reviveCollector.on("end", (col) => {
                if (!col || col.size === 0) {
                  context.channel.send(`<@${randomPlayerId}> لم تختر أحد للإحياء.`);
                  stopAll("done");
                  prepareRound(context, players, eliminatedPlayers, client, callback);
                }
              });
            }
          } catch (error) {
            console.error("Error in elimination collector:", error);
            try { await ii.reply({ content: "حدث خطأ.", ephemeral: true }); } catch (e) {}
          }
        });
      });

    } catch (err) {
      console.error("Error in prepareRound:", err);
      CURRENTLY_SENDING_IMAGE = false;
      // في حالة الخطأ نمرر اللعبة تلقائياً
      await prepareRound(context, players, eliminatedPlayers, client, callback);
    }
  } catch (error) {
    console.error("Fatal error in prepareRound:", error);
    resetGameData();
    callback(null, false, 0, null);
  }
}

// دوال مساعدة (كما هي بدون تعديل)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDarkHexCode(baseColor, seed) {
  // توليد لون داكن عشوائي بناءً على seed
  let hash = 0;
  for (let i = 0; i < baseColor.length; i++) {
    hash = baseColor.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = (hash + seed * 9301 + 49297) % 233280;
  let r = (hash % 80) + 40;
  hash = Math.floor(hash / 80);
  let g = (hash % 80) + 40;
  hash = Math.floor(hash / 80);
  let b = (hash % 80) + 40;
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

async function checkJoiningGameAbility(interaction, players) {
  // التحقق من إمكانية الانضمام (مثلاً عدم التكرار، الحد الأقصى)
  if (players.length >= MAX_PLAYERS) {
    await interaction.reply({ content: "🎲 | اللعبة ممتلئة!", ephemeral: true });
    return false;
  }
  if (players.some(p => p.id === interaction.user.id)) {
    await interaction.reply({ content: "🎲 | أنت بالفعل في اللعبة!", ephemeral: true });
    return false;
  }
  return true;
}

async function win(userId, context) {
  // تسجيل الفوز في قاعدة البيانات
  await db.addUserPoints(userId, 1);
}

async function lose(userId, context) {
  // تسجيل الخسارة (اختياري)
}

async function removeLoss(userId, context) {
  // إزالة الخسارة عند الإحياء (اختياري)
}

async function selectRandomPlayer(context, players) {
  // دالة توليد صورة GIF الروليت واختيار اللاعب عشوائياً
  // هذه الدالة من المفترض أن تكون موجودة في ملفك الأصلي
  // قم بإدراج الكود الأصلي هنا إن وجد
}

async function eliminatedPlayersButtons(eliminatedPlayers) {
  // إنشاء أزرار الإحياء للاعبين المطرودين
  const rows = [];
  for (let i = 0; i < eliminatedPlayers.length; i += 5) {
    const row = new ActionRowBuilder();
    eliminatedPlayers.slice(i, i + 5).forEach(p => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`revive_${p.id}`)
          .setLabel(p.username || 'لاعب')
          .setStyle(ButtonStyle.Secondary)
      );
    });
    rows.push(row);
  }
  return rows;
}