const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionWebhook,
  AttachmentBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");
const path = require("path");
const db = require('../database.js');
const config = require('../config.js');
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const mafiaConfig = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 20,
  TIME_TO_START: config.lobbyTime.mafia,
};

try {
  GlobalFonts.registerFromPath(
    path.join(__dirname, "../img/Fonts/IBMBold.ttf"),
    "IBM"
  );
} catch (e) {
  console.warn("[Mafia] Could not load custom font. Using default.");
}

const { MIN_PLAYERS, MAX_PLAYERS, TIME_TO_START } = mafiaConfig;
const CMD_BANNER = path.join(__dirname, "../img/mafia/lobby.png");
const ROUND_BANNER = path.join(__dirname, "../img/mafia/lobby.png");
const MAFIA_ICON = path.join(__dirname, "../img/mafia/mafia.png");
const CITIZEN_ICON = path.join(__dirname, "../img/mafia/citizen.png");
const DOCTOR_ICON = path.join(__dirname, "../img/mafia/doctor.png");
const MAFIA_WIN_BANNER = path.join(__dirname, "../img/mafia/lobby.png");
const CITIZEN_WIN_BANNER = path.join(__dirname, "../img/mafia/lobby.png");

function buildMafiaLobby(nowTime, players) {
  const list = players.length ? players.map((p, i) => `> **${i + 1}.** <@${p.id}>`).join('\n') : '> لا يوجد لاعبين بعد';
  return new ContainerBuilder()
    .setAccentColor(config.colors.mafia)
    .addTextDisplayComponents(t => t.setContent(
      `## 🕵️ لعبة المافيا\n> الوقت المتبقي: <t:${nowTime + TIME_TO_START / 1000}:R>\n\n` +
      `**اللاعبون (${players.length}/${MAX_PLAYERS}):**\n${list}`
    ))
    .addMediaGalleryComponents(g => { const img = config.lobbyImages.mafia; if (img) g.addItems(item => item.setURL(img)); return g; })
    .addActionRowComponents(r => r.setComponents(
      new ButtonBuilder().setCustomId("join").setLabel("دخول").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("exit").setLabel("خروج").setStyle(ButtonStyle.Danger)
    ));
}

let GAME_ACTIVE = false;
let players = [];

module.exports = {
  name: 'mafia',
  aliases: ["مافيا"],
  /**
   * @param {import('discord.js').Message} message
   * @param {string[]} args
   * @param {function} callback
   */
  async execute(message, args, callback) {
    // أمر الاختبار السريع لمعاينة الصور
    if (args[0] === 'اختبار') {
      const fakePlayers = [
        { id: '1', displayName: 'لاعب1', avatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png', role: 'mafia', voteCount: 0, takeVote: false },
        { id: '2', displayName: 'لاعب2', avatarURL: 'https://cdn.discordapp.com/embed/avatars/1.png', role: 'mafia', voteCount: 0, takeVote: false },
        { id: '3', displayName: 'لاعب3', avatarURL: 'https://cdn.discordapp.com/embed/avatars/2.png', role: 'citizen', voteCount: 0, takeVote: false },
        { id: '4', displayName: 'لاعب4', avatarURL: 'https://cdn.discordapp.com/embed/avatars/3.png', role: 'citizen', voteCount: 0, takeVote: false },
        { id: '5', displayName: 'لاعب5', avatarURL: 'https://cdn.discordapp.com/embed/avatars/4.png', role: 'doctor', voteCount: 0, takeVote: false },
      ];

      const startImg = await drawGame(message, fakePlayers, 'start');
      await message.channel.send({ content: '🖼️ اختبار صورة البداية', files: [startImg] });

      const mafiaWin = await drawGame(message, fakePlayers, 'end', 'mafia');
      await message.channel.send({ content: '🖼️ اختبار فوز المافيا', files: [mafiaWin] });

      const citizenWin = await drawGame(message, fakePlayers, 'end', 'citizen');
      await message.channel.send({ content: '🖼️ اختبار فوز المواطنين', files: [citizenWin] });

      callback();
      return;
    }

    if (GAME_ACTIVE) {
      message.reply(`> **❌ | لقد بدأت لعبة أخرى بالفعل. الرجاء ار حتى انتهاء اللعبة الحالية.**`);
      callback();
      return;
    }

    GAME_ACTIVE = true;
    const nowTime = Math.floor(Date.now() / 1000);
    startGame(message, nowTime, callback);
  }
};

function resetGameData() {
  GAME_ACTIVE = false;
  players = [];
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function getRandomWinPoints() {
    const pts = config.winPoints.mafia;
    if (typeof pts === 'object') return Math.floor(Math.random() * (pts.max - pts.min + 1)) + pts.min;
    return pts;
}

async function win(playerId, context) {
  try {
    const points = getRandomWinPoints();
    await db.addPoints(playerId, points);
    console.log(`[Mafia] Gave ${points} points to winner ${playerId}`);
    if (context) context.channel.send(`🏆 | <@${playerId}> فاز بـ **${points}** نقطة!`).catch(() => {});
  } catch (e) { 
    console.error(`[Mafia] Failed to apply win points: ${e}`) 
  }
}

async function lose(playerId, context) {
}

async function startGame(context, nowTime, callback) {
  players = [];

  let sentMessage;
  try {
    sentMessage = await context.reply({
      components: [buildMafiaLobby(nowTime, players)],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    });

    const filter = (i) => i.customId === "join" || i.customId === "exit";
    const collector = sentMessage.createMessageComponentCollector({
      filter,
      time: TIME_TO_START,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "join") {
        if (players.length < MAX_PLAYERS) {
          const playerExists = players.some((player) => player.id === i.user.id);
          if (!playerExists) {
            players.push({
              id: i.user.id,
              displayName: i.user.displayName,
              avatarURL: i.user.displayAvatarURL({ extension: "png", forceStatic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png",
              msgInfo: {
                applicationId: i.applicationId,
                interactionToken: i.token,
                messageId: i.id,
              },
              role: null,
              voteCount: 0,
              takeVote: false,
            });
            await i.update({ components: [buildMafiaLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
          } else {
            await i.reply({ content: `أنت بالفعل في اللعبة! 🚫`, ephemeral: true });
          }
        } else {
          await i.reply({ content: `اللعبة ممتلئة! 🚪`, ephemeral: true });
        }
      } else if (i.customId === "exit") {
        const playerExists = players.some((player) => player.id === i.user.id);
        if (playerExists) {
          players = players.filter((player) => player.id !== i.user.id);
          await i.update({ components: [buildMafiaLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
        } else {
          await i.reply({ content: `لم تكن في اللعبة. ❓`, ephemeral: true });
        }
      }
    });

    collector.on("end", async () => {
      try {
        const closedContainer = new ContainerBuilder()
          .setAccentColor(0x5865F2)
          .addTextDisplayComponents(t => t.setContent(
            `## 🕵️ لعبة المافيا\n**انتهى وقت الانضمام!**\n\nاللاعبون: ${players.length ? players.map(p => `<@${p.id}>`).join(', ') : 'لا يوجد'}`
          ))
          .addActionRowComponents(r => r.setComponents(
            new ButtonBuilder().setCustomId("join").setLabel("دخول").setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId("exit").setLabel("خروج").setStyle(ButtonStyle.Danger).setDisabled(true)
          ));
        await sentMessage.edit({ components: [closedContainer], flags: MessageFlags.IsComponentsV2 });
      } catch (error) {
        console.error("Failed to close lobby:", error);
      }

      if (players.length < MIN_PLAYERS) {
        await context.channel.send(`لم يكن هناك عدد كافٍ من اللاعبين لبدء اللعبة. 🚪`);
        resetGameData();
        callback(null, false, 0, "Not enough players");
        return;
      } else {
        assignRoles(players);
        const AllPlayers = [...players];
        await sendRoleMessages(context, players, AllPlayers);
        await gameRound(context, players, AllPlayers, callback);
      }
    });
  } catch (error) {
    console.error("Error starting the game:", error);
    resetGameData();
    callback(null, false, 0, "Error starting game");
    if (context.channel) {
      await context.channel.send("حدث خطأ أثناء بدء اللعبة. يرجى المحاولة مرة أخرى.");
    }
  }
}

function assignRoles(players) {
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
  const mafiaCount = players.length < 5 ? 1 : players.length < 10 ? 2 : 3;

  shuffledPlayers.slice(0, mafiaCount).forEach(p => p.role = "mafia");
  shuffledPlayers.slice(mafiaCount, mafiaCount + 1).forEach(p => p.role = "doctor");
  shuffledPlayers.slice(mafiaCount + 1).forEach(p => p.role = "citizen");
}

async function sendRoleMessages(context, players, AllPlayers) {
  for (const player of players) {
    try {
      const webhook = new InteractionWebhook(
        context.client,
        player.msgInfo.applicationId,
        player.msgInfo.interactionToken
      );

      let rolesMessage = {
        mafia: "🕵️ | تم اختيارك انت كـ **مافيا**. يجب عليكم محاولة اغتيال جميع اللاعبين بدون اكتشافكم",
        doctor: "🧑‍⚕️ | تم اختيارك انت كـ **الطبيب**. في كل جولة يمكنك حماية شخص واحد من هجوم المافيا",
        citizen: "👥 | تم اختيارك انت كـ **مواطن**. في كل جولة يجب عليك التحقق مع جميع اللاعبين لأكتشاف المافيا وطردهم من اللعبة",
      };
      await webhook.send({
        content: rolesMessage[player.role] || rolesMessage.citizen,
        ephemeral: true,
      });
    } catch (error) {
      console.error(`Failed to send role to user ${player.id}:`, error);
      players = players.filter(p => p.id !== player.id);
      AllPlayers = AllPlayers.filter(p => p.id !== player.id);
      await context.channel.send(`⚠️ | تعذر إرسال الدور إلى <@${player.id}>. تم إزالته من اللعبة.`);
    }
  }

  await sleep(1000);

  try {
    const gameImage = await drawGame(context, AllPlayers, "start");
    await context.channel.send({
        content: `✅ | تم توزيع الرتب على اللاعبين. ستبدأ الجولة الأولى في بضع ثواني...`,
        files: [gameImage]
    });
  } catch (e) {
    console.error("Failed to draw start game image:", e);
    await context.channel.send(`✅ | تم توزيع الرتب على اللاعبين. ستبدأ الجولة الأولى في بضع ثواني...`);
  }
  await sleep(4000);
}

async function disableButtons(buttonRows) {
  return buttonRows.map(row => {
    const newRow = new ActionRowBuilder();
    row.components.forEach(button => {
      newRow.addComponents(ButtonBuilder.from(button).setDisabled(true));
    });
    return newRow;
  });
}

async function mafiaRound(context, players, callback) {
  const mafiaPlayers = players.filter((player) => player.role === "mafia");

  if (mafiaPlayers.length === 0) {
    return { topVotedPlayers: null, players };
  }

  const citizens = players.filter((player) => player.role !== "mafia");
  if (citizens.length === 0) {
      return { topVotedPlayers: null, players };
  }

  let buttons = await generateButtons(citizens);
  for (const player of mafiaPlayers) {
    try {
      const webhook = new InteractionWebhook(
        context.client,
        player.msgInfo.applicationId,
        player.msgInfo.interactionToken
      );
      const msgInfo = await webhook.send({
        content: "🔪 | صوت للاعب الذي تريد قتله (25 ثانية)",
        components: buttons,
        ephemeral: true,
        fetchReply: true
      });
      player.msgInfo.messageId = msgInfo.id;
    } catch (e) {
        console.error(`Failed to send mafia vote to ${player.id}`, e);
        player.takeVote = true; 
    }
  }

  await context.channel.send("🔪 | جاري انتظار المافيا لاختيار شخص لقتله...");

  return new Promise((resolve) => {
    const filter = (i) => i.customId.startsWith("vote_") && mafiaPlayers.some(p => p.id === i.user.id);
    const collector = context.channel.createMessageComponentCollector({
      filter,
      time: 25000,
    });

    collector.on("collect", async (i) => {
      const playerId = i.customId.split("_")[1];
      const mafiaVoteStatus = players.find((player) => player.id === i.user.id);

      if (mafiaVoteStatus.takeVote) {
        await i.reply({ content: `لقد صوتت بالفعل`, ephemeral: true });
        return;
      }

      const votedPlayer = players.find((player) => player.id === playerId);
      if (votedPlayer) {
        votedPlayer.voteCount++;
      }
      mafiaVoteStatus.takeVote = true;
      await i.reply({ content: `✅ | لقد صوتت على <@${votedPlayer.id}>`, ephemeral: true });

      const updatedButtons = await generateButtons(citizens);
      for (const player of mafiaPlayers) {
        if (!player.msgInfo.messageId) continue;
        try {
          const webhook = new InteractionWebhook(context.client, player.msgInfo.applicationId, player.msgInfo.interactionToken);
          await webhook.editMessage(player.msgInfo.messageId, { components: updatedButtons });
        } catch (error) {
        }
      }
    });

    collector.on("end", async () => {
      const disabledButtons = await disableButtons(buttons);
      for (const player of mafiaPlayers) {
        if (!player.msgInfo.messageId) continue;
        try {
          const webhook = new InteractionWebhook(context.client, player.msgInfo.applicationId, player.msgInfo.interactionToken);
          await webhook.editMessage(player.msgInfo.messageId, {
            components: disabledButtons,
            content: "🔪 | انتهى وقت التصويت"
          });
        } catch (error) {
        }
      }

      const mafiaPlayersWhoDidNotVote = mafiaPlayers.filter((p) => !p.takeVote);

      if (mafiaPlayersWhoDidNotVote.length === mafiaPlayers.length) {
        await context.channel.send("🏆 | لم يقم أي من المافيا بالتصويت! سيتم طردهم جميعاً وفوز المواطنين!");
        resolve({ topVotedPlayers: "citizens_win", players: players });
        return;
      }

      const highestVoteCount = Math.max(...citizens.map((player) => player.voteCount), 0);

      if (highestVoteCount === 0) {
        await context.channel.send("⏭️ | لم يتم اتفاق المافيا على شخص محدد، سيتم تخطي الاغتيال.");
        resolve({ topVotedPlayers: null, players });
        return;
      }

      const topVotedPlayers = citizens.filter((player) => player.voteCount === highestVoteCount);

      if (topVotedPlayers.length > 1) {
        await context.channel.send("⏭️ | بسبب تعادل التصويت بين المافيا، تم تخطي الاغتيال.");
        resolve({ topVotedPlayers: null, players });
      } else if (topVotedPlayers.length === 1) {
        await context.channel.send(`🔪 | اختارت المافيا الشخص الذي سيتم اغتياله.`);
        resolve({ topVotedPlayers: topVotedPlayers[0], players });
      } else {
        resolve({ topVotedPlayers: null, players });
      }
    });
  });
}

async function doctorRound(context, players) {
  const doctorPlayer = players.find((player) => player.role === "doctor");
  if (!doctorPlayer) {
    return { savedPlayer: null, players };
  }

  let buttons = await generateButtons(players);
  let msgInfo;

  try {
    const webhook = new InteractionWebhook(
        context.client,
        doctorPlayer.msgInfo.applicationId,
        doctorPlayer.msgInfo.interactionToken
    );
    msgInfo = await webhook.send({
        content: "🩺 | صوت للاعب الذي تريد انقاذه (25 ثانية)",
        components: buttons,
        ephemeral: true,
        fetchReply: true
    });
    doctorPlayer.msgInfo.messageId = msgInfo.id;
  } catch (e) {
      console.error(`Failed to send doctor vote to ${doctorPlayer.id}`, e);
      await context.channel.send("🩺 | لم يتمكن الطبيب من التصويت هذا الدور.");
      return { savedPlayer: null, players };
  }

  await context.channel.send("🩺 | جاري انتظار الطبيب لاختيار شخص لانقاذه...");

  return new Promise((resolve) => {
    const filter = (i) => i.customId.startsWith("vote_") && i.user.id === doctorPlayer.id;
    const collector = context.channel.createMessageComponentCollector({
      filter,
      time: 25000,
    });

    let votedPlayer = null;

    collector.on("collect", async (i) => {
      const playerId = i.customId.split("_")[1];
      if (doctorPlayer.takeVote) {
        await i.reply({ content: `لقد صوتت بالفعل`, ephemeral: true });
        return;
      }

      votedPlayer = players.find((player) => player.id === playerId);
      doctorPlayer.takeVote = true;
      await i.reply({ content: `✅ | لقد صوتت على <@${votedPlayer.id}>`, ephemeral: true });
    });

    collector.on("end", async () => {
      if (doctorPlayer) {
        try {
          const disabledButtons = await disableButtons(buttons);
          const webhook = new InteractionWebhook(context.client, doctorPlayer.msgInfo.applicationId, doctorPlayer.msgInfo.interactionToken);
          await webhook.editMessage(doctorPlayer.msgInfo.messageId, {
            components: disabledButtons,
            content: "🩺 | انتهى وقت التصويت"
          });
        } catch (error) {
        }
      }

      if (doctorPlayer.takeVote === true) {
        await context.channel.send(`💊 | اختار الطبيب الشخص الذي سيحميه.`);
        resolve({ savedPlayer: votedPlayer, players });
      } else {
        await context.channel.send(`💊 | لم يقم الطبيب بإنقاذ أي شخص!`);
        resolve({ savedPlayer: null, players });
      }
    });
  });
}

async function citizenRound(context, players) {
  if (players.length === 0) {
    return { topVotedPlayers: null, players };
  }

  const buttons = await generateButtons(players);
  const investigateMessage = await context.channel.send({
    content: "🔍 | لديكم 25 ثانية لاختيار شخص لطرده من اللعبة",
    components: buttons
  });

  return new Promise((resolve) => {
    const filter = (i) => i.customId.startsWith("vote_") && players.some(p => p.id === i.user.id);
    const collector = context.channel.createMessageComponentCollector({
      filter,
      time: 25000,
    });

    collector.on("collect", async (i) => {
      const playerId = i.customId.split("_")[1];
      const playerVoteStatus = players.find((p) => p.id === i.user.id);

      if (!playerVoteStatus) {
        await i.reply({ content: `🚫 | لا يمكنك التصويت.`, ephemeral: true });
        return;
      }
      if (playerVoteStatus.takeVote) {
        await i.reply({ content: `لقد صوتت بالفعل`, ephemeral: true });
        return;
      }
      const votedPlayer = players.find((player) => player.id === playerId);
      if (!votedPlayer) {
        await i.reply({ content: `🚫 | هذا اللاعب غير موجود.`, ephemeral: true });
        return;
      }

      votedPlayer.voteCount++;
      playerVoteStatus.takeVote = true;
      await i.reply({ content: `✅ | لقد صوتت على <@${votedPlayer.id}>`, ephemeral: true });

      const updatedButtons = await generateButtons(players);
      await investigateMessage.edit({ components: updatedButtons });
    });

    collector.on("end", async () => {
      try {
        const disabledButtons = await disableButtons(await generateButtons(players));
        await investigateMessage.edit({
          content: "🔍 | انتهت جولة التصويت!",
          components: disabledButtons
        });
      } catch (error) {
      }

      const playersWhoDidNotVote = players.filter((player) => !player.takeVote);
      if (playersWhoDidNotVote.length > 0) {
          await context.channel.send(`🔍 | لم يقم بالتصويت: ${playersWhoDidNotVote.map((p) => `<@${p.id}>`).join(", ")}`);
      }

      const highestVoteCount = Math.max(...players.map((p) => p.voteCount), 0);

      if (highestVoteCount === 0) {
        await context.channel.send("⏭️ | لم يتم التصويت لأي لاعب، سيتم تخطي الطرد.");
        resolve({ topVotedPlayers: "draw", players });
        return;
      }

      const topVotedPlayers = players.filter((p) => p.voteCount === highestVoteCount);

      if (topVotedPlayers.length > 1) {
        await context.channel.send("⏭️ | بسبب تعادل التصويت، تم تخطي الطرد.");
        resolve({ topVotedPlayers: "draw", players });
      } else if (topVotedPlayers.length === 1) {
        const kickedPlayer = topVotedPlayers[0];
        const roleName = kickedPlayer.role === "doctor" ? "طبيب" : kickedPlayer.role === "mafia" ? "مافيا" : "مواطن";

        await context.channel.send(`🔍 | تم طرد <@${kickedPlayer.id}>، وهذا اللاعب كان **${roleName}**`);
        players = players.filter((player) => player.id !== kickedPlayer.id);
        resolve({ topVotedPlayers: kickedPlayer, players });
      } else {
        resolve({ topVotedPlayers: "draw", players });
      }
    });
  });
}

async function gameRound(context, players, AllPlayers, callback) {
  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  players.forEach((player) => {
    player.voteCount = 0;
    player.takeVote = false;
  });

  let { topVotedPlayers: votedPlayer, players: updatedPlayers } = await mafiaRound(context, players, callback);

  if (votedPlayer === "citizens_win") {
    const allCitizens = AllPlayers.filter(p => p.role !== 'mafia');
    const allMafia = AllPlayers.filter(p => p.role === 'mafia');
    try {
        await context.channel.send({
            content: `🎉 | لقد فاز المواطنون والطبيب باللعبة بسبب عدم تصويت المافيا! الفائزون: ${allCitizens.map((p) => `<@${p.id}>`).join(", ")}`,
            files: [await drawGame(context, AllPlayers, "end", "citizen")]
        });
    } catch(e) {
        console.error("Failed to draw game image", e);
        await context.channel.send(`🎉 | لقد فاز المواطنون والطبيب باللعبة بسبب عدم تصويت المافيا! الفائزون: ${allCitizens.map((p) => `<@${p.id}>`).join(", ")}`);
    }
    for (const p of allCitizens) await win(p.id, context);
    for (const p of allMafia) await lose(p.id, context);
    resetGameData();
    callback(null, false, 0, "Citizens win!");
    return;
  }

  players = updatedPlayers;
  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  let savedPlayer;
  if (votedPlayer) {
    players.forEach(p => { p.voteCount = 0; p.takeVote = false; });
    const { savedPlayer: saved, players: updatedPlayersDoc } = await doctorRound(context, players);
    savedPlayer = saved;
    players = updatedPlayersDoc;
    if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

    if (savedPlayer && votedPlayer.id === savedPlayer.id) {
        await context.channel.send(`🩺 | لقد نجح الطبيب في حماية <@${savedPlayer.id}> من الاغتيال!`);
    } else {
        const roleName = votedPlayer.role === "doctor" ? "طبيب" : votedPlayer.role === "mafia" ? "مافيا" : "مواطن";
        await context.channel.send(`🔪 | لقد قتلت المافيا <@${votedPlayer.id}> وكان هذا الشخص **${roleName}**`);
        players = players.filter((player) => player.id !== votedPlayer.id);
        if ((await checkWin(context, players, AllPlayers, callback)) === true) return;
    }
  } else {
  }

  players.forEach((player) => {
    player.voteCount = 0;
    player.takeVote = false;
  });

  const { topVotedPlayers: votedSuspect, players: newUpdatedPlayers } = await citizenRound(context, players);
  players = newUpdatedPlayers;

  if (votedSuspect === "draw") {
  }

  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  await context.channel.send("--- 🌆 تبدأ جولة جديدة 🌆 ---");
  await sleep(3000);
  await gameRound(context, players, AllPlayers, callback);
}

async function generateButtons(players) {
  const buttons = players.map((player) => {
    return new ButtonBuilder()
      .setCustomId(`vote_${player.id}`)
      .setLabel(`${player.displayName.substring(0, 75)} (${player.voteCount})`)
      .setStyle(ButtonStyle.Primary);
  });

  let rows = [];
  while (buttons.length) {
    rows.push(new ActionRowBuilder().addComponents(...buttons.splice(0, 5)));
  }
  return rows;
}

async function checkWin(context, players, AllPlayers, callback) {
  const mafiaPlayers = players.filter((player) => player.role === "mafia");
  const citizens = players.filter((player) => player.role !== "mafia");

  const allMafiaPlayers = AllPlayers.filter((player) => player.role === "mafia");
  const allCitizens = AllPlayers.filter((player) => player.role !== "mafia");

  let gameEndImage;

  if (mafiaPlayers.length >= citizens.length && citizens.length > 0) {
    try {
        gameEndImage = await drawGame(context, AllPlayers, "end", "mafia");
    } catch(e) { console.error("Failed to draw mafia win image:", e); }

    await context.channel.send({
      content: `🎉 | لقد فازت المافيا باللعبة! الفائزون: ${allMafiaPlayers.map((p) => `<@${p.id}>`).join(", ")}`,
      files: gameEndImage ? [gameEndImage] : []
    });

    for (const p of allMafiaPlayers) await win(p.id, context);
    for (const p of allCitizens) await lose(p.id, context);

    resetGameData();
    callback(null, false, 0, "Mafia win!");
    return true;

  } else if (mafiaPlayers.length === 0) {
    try {
        gameEndImage = await drawGame(context, AllPlayers, "end", "citizen");
    } catch(e) { console.error("Failed to draw citizen win image:", e); }

    await context.channel.send({
      content: `🎉 | لقد فاز المواطنون والطبيب! الفائزون: ${allCitizens.map((p) => `<@${p.id}>`).join(", ")}`,
      files: gameEndImage ? [gameEndImage] : []
    });

    for (const p of allCitizens) await win(p.id, context);
    for (const p of allMafiaPlayers) await lose(p.id, context);

    resetGameData();
    callback(null, false, 0, "Citizen win!");
    return true;
  }

  return false;
}

async function noWinner(context, callback) {
  resetGameData();
  callback(null, false, 0, "No winner");
  return await context.channel.send("🎉 | لم يقم أحد بالتصويت، لذلك تم طرد جميع اللاعبين ولا يوجد فائز.");
}

async function drawGame(context, allPlayers, type, winnerType) {
  const canvas = createCanvas(626, 339);
  const ctx = canvas.getContext("2d");

  const loadImg = async (filePath) => {
      try {
          return await loadImage(filePath);
      } catch (e) {
          console.error(`[Mafia] Failed to load image: ${filePath}`, e);
          return null;
      }
  };

  if (type === "start") {
    const banner = await loadImg(ROUND_BANNER);
    if (banner) ctx.drawImage(banner, 0, 0, 626, 339);
    else { ctx.fillStyle = "#333"; ctx.fillRect(0, 0, 626, 339); }

    const mafiaIcon = await loadImg(MAFIA_ICON);
    const citizenIcon = await loadImg(CITIZEN_ICON);
    const doctorIcon = await loadImg(DOCTOR_ICON);

    const mafiaPlayers = allPlayers.filter(p => p.role === "mafia");
    const citizenPlayers = allPlayers.filter(p => p.role === "citizen");
    const doctorPlayers = allPlayers.filter(p => p.role === "doctor");

    const mafiaIconW = 22, mafiaIconH = 43, iconGap = 9, iconsPerRow = 5;
    const containerW = 194, mafiaContainerX = 88, mafiaContainerY = 150;
    const citizenContainerX = 345, citizenContainerY = 150;
    const citizenIconW = 27, citizenIconH = 43;
    const doctorIconW = 27, doctorIconH = 43;

    // دالة مساعدة لرسم أيقونة أو دائرة احتياطية إذا كانت الأيقونة null
    const drawRoleIcon = (icon, x, y, w, h, roleLetter, color) => {
      if (icon) {
        ctx.drawImage(icon, x, y, w, h);
      } else {
        // رسم دائرة ملونة بداخلها حرف
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.min(w, h) * 0.6}px "IBM", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(roleLetter, x + w/2, y + h/2);
        ctx.restore();
      }
    };

    // رسم المافيا
    mafiaPlayers.forEach((p, index) => {
      const row = Math.floor(index / iconsPerRow);
      const col = index % iconsPerRow;
      const xOffset = mafiaContainerX + (containerW - (iconsPerRow * mafiaIconW + (iconsPerRow - 1) * iconGap)) / 2;
      const xPos = xOffset + col * (mafiaIconW + iconGap);
      const yPos = mafiaContainerY + row * (mafiaIconH + iconGap);
      drawRoleIcon(mafiaIcon, xPos, yPos, mafiaIconW, mafiaIconH, "M", "#e74c3c");
    });

    // رسم المواطنين
    citizenPlayers.forEach((p, index) => {
      const row = Math.floor(index / iconsPerRow);
      const col = index % iconsPerRow;
      const xOffset = citizenContainerX + (containerW - (iconsPerRow * citizenIconW + (iconsPerRow - 1) * iconGap)) / 2;
      const xPos = xOffset + col * (citizenIconW + iconGap);
      const yPos = citizenContainerY + row * (citizenIconH + iconGap);
      drawRoleIcon(citizenIcon, xPos, yPos, citizenIconW, citizenIconH, "C", "#3498db");
    });

    // رسم الطبيب (يُضاف بعد المواطنين)
    const allCitizenCount = citizenPlayers.length;
    doctorPlayers.forEach((p, index) => {
      const globalIndex = allCitizenCount + index;
      const row = Math.floor(globalIndex / iconsPerRow);
      const col = globalIndex % iconsPerRow;
      const xOffset = citizenContainerX + (containerW - (iconsPerRow * doctorIconW + (iconsPerRow - 1) * iconGap)) / 2;
      const xPos = xOffset + col * (doctorIconW + iconGap);
      const yPos = citizenContainerY + row * (doctorIconH + iconGap);
      drawRoleIcon(doctorIcon, xPos, yPos, doctorIconW, doctorIconH, "D", "#2ecc71");
    });

  } else if (type === "end") {
    let winBanner;
    if (winnerType === "mafia") winBanner = await loadImg(MAFIA_WIN_BANNER);
    else winBanner = await loadImg(CITIZEN_WIN_BANNER);

    if (winBanner) ctx.drawImage(winBanner, 0, 0, 626, 339);
    else { ctx.fillStyle = "#333"; ctx.fillRect(0, 0, 626, 339); }

    const avatarSize = 30, avatarGap = 9, iconsPerRow = 5;
    const mafiaContainerW = 194, mafiaContainerX = 88, mafiaContainerY = 150;
    const citizenContainerX = 345, citizenContainerY = 150;

    const mafiaPlayers = allPlayers.filter(p => p.role === "mafia");
    const citizenAndDoctor = allPlayers.filter(p => p.role === "citizen" || p.role === "doctor");

    const fallbackAvatar = await loadImg("https://cdn.discordapp.com/embed/avatars/0.png");

    const mafiaAvatars = await Promise.all(mafiaPlayers.map(p => loadImg(p.avatarURL).catch(e => fallbackAvatar)));
    const citizenDocAvatars = await Promise.all(citizenAndDoctor.map(p => loadImg(p.avatarURL).catch(e => fallbackAvatar)));

    mafiaAvatars.forEach((avatar, index) => {
      const row = Math.floor(index / iconsPerRow);
      const col = index % iconsPerRow;
      const xOffset = mafiaContainerX + (mafiaContainerW - (iconsPerRow * avatarSize + (iconsPerRow - 1) * avatarGap)) / 2;
      const xPos = xOffset + col * (avatarSize + avatarGap);
      const yPos = mafiaContainerY + row * (avatarSize + avatarGap);
      ctx.save();
      ctx.beginPath();
      ctx.arc(xPos + avatarSize/2, yPos + avatarSize/2, avatarSize/2, 0, Math.PI*2);
      ctx.clip();
      ctx.drawImage(avatar || fallbackAvatar, xPos, yPos, avatarSize, avatarSize);
      ctx.restore();
    });

    citizenDocAvatars.forEach((avatar, index) => {
      const row = Math.floor(index / iconsPerRow);
      const col = index % iconsPerRow;
      const xOffset = citizenContainerX + (mafiaContainerW - (iconsPerRow * avatarSize + (iconsPerRow - 1) * avatarGap)) / 2;
      const xPos = xOffset + col * (avatarSize + avatarGap);
      const yPos = citizenContainerY + row * (avatarSize + avatarGap);
      ctx.save();
      ctx.beginPath();
      ctx.arc(xPos + avatarSize/2, yPos + avatarSize/2, avatarSize/2, 0, Math.PI*2);
      ctx.clip();
      ctx.drawImage(avatar || fallbackAvatar, xPos, yPos, avatarSize, avatarSize);
      ctx.restore();
    });
  }

  const buffer = canvas.toBuffer("image/png");
  return new AttachmentBuilder(buffer, { name: "mafia-game.png" });
}