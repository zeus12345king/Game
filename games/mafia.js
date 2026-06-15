const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionWebhook,
  AttachmentBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const path = require("path");
const db = require('../database.js');
const config = require('../config.js');
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

// ======================== إعدادات المافيا ========================
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

// ======================== الإيموجيات الموحدة ========================
const EMOJI = {
  LOBBY: '🕵️',
  JOIN: '<:z1:1511780346008436946>',
  LEAVE: '<:z2:1511780387506880542>',
  MAFIA: '<:z22:1515309026160935032>',
  DOCTOR: '<:z23:1515877111754264769>',
  CITIZEN: '<:z18:1515279195201339392>',
  DETECTIVE: '<:z25:1515886763892281354>',
  MAYOR: '🏛️',
  SNIPER: '🎯',
  SILENCER: '🔇',
  VOTE: '<:z20:1515282515982815282>',
  WIN: '🏆',
  LOSE: '💀',
  WARNING: '<:z16:1515274356845056162>',
  SUCCESS: '<:z3:1511872921142825040>',
  ERROR: '<:z4:1511873048557387977>',
  TIMER: '<:z15:1515273469389181071>',
  SKIP: '⏭️',
  NIGHT: '🌆',
  PROTECT: '<:z24:1515880925047689378>',
  KILL: '<:z21:1515304762533347489>',
  KICK: '<:z6:1512127272184975360>',
  INVESTIGATE: '<:z25:1515886763892281354>',
  BULLET: '💥',
  SILENCED: '🤐',
  ANNOUNCE: '📢',
  ROLE_CARD: '🃏',
  OK: '<:z1:1515940737760362648>',
};

// ======================== أيقونات أرقام التصويت ========================
const DIGIT_EMOJIS = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
function numberToEmoji(num) {
  if (num === 0) return DIGIT_EMOJIS[0];
  let str = '';
  let n = num;
  while (n > 0) {
    const digit = n % 10;
    str = DIGIT_EMOJIS[digit] + str;
    n = Math.floor(n / 10);
  }
  return str;
}

// ======================== أسماء الأدوار ========================
const ROLE_NAMES = {
  mafia_killer: 'القاتل',
  mafia_godfather: 'العراب',
  mafia_silencer: 'المُسكِت',
  mafia_regular: 'مافيا',
  doctor: 'طبيب',
  detective: 'محقق',
  sniper: 'قناص',
  mayor: 'عمدة',
  citizen: 'مواطن',
};

const ROLE_EMOJI = {
  mafia_killer: EMOJI.MAFIA,
  mafia_godfather: EMOJI.MAFIA,
  mafia_silencer: EMOJI.SILENCER,
  mafia_regular: EMOJI.MAFIA,
  doctor: EMOJI.DOCTOR,
  detective: EMOJI.DETECTIVE,
  sniper: EMOJI.SNIPER,
  mayor: EMOJI.MAYOR,
  citizen: EMOJI.CITIZEN,
};

// ======================== الصور (محتفظ بها للرجوع مستقبلاً) ========================
const CMD_BANNER = path.join(__dirname, "../img/mafia/lobby.png");
const ROUND_BANNER = path.join(__dirname, "../img/mafia/lobby.png");
const MAFIA_ICON = path.join(__dirname, "../img/mafia/mafia.png");
const CITIZEN_ICON = path.join(__dirname, "../img/mafia/citizen.png");
const DOCTOR_ICON = path.join(__dirname, "../img/mafia/doctor.png");
const MAFIA_WIN_BANNER = path.join(__dirname, "../img/mafia/lobby.png");
const CITIZEN_WIN_BANNER = path.join(__dirname, "../img/mafia/lobby.png");

// تعطيل الصور حالياً (ضع true لتفعيلها لاحقاً)
const USE_GAME_IMAGES = false;

// ======================== بناء لوبي المافيا ========================
function buildMafiaLobby(nowTime, players) {
  const list = players.length
    ? players.map((p, i) => `> **${i + 1}.** <@${p.id}>`).join('\n')
    : '> لا يوجد لاعبين بعد';

  return new ContainerBuilder()
    .setAccentColor(config.colors.mafia)
    .addTextDisplayComponents(t =>
      t.setContent(
        `## ${EMOJI.LOBBY} لعبة المافيا\n> الوقت المتبقي: <t:${nowTime + TIME_TO_START / 1000}:R>\n\n` +
        `**اللاعبون (${players.length}/${MAX_PLAYERS}):**\n${list}`
      )
    )
    .addMediaGalleryComponents(g => {
      const img = config.lobbyImages.mafia;
      if (img) g.addItems(item => item.setURL(img));
      return g;
    })
    .addActionRowComponents(r =>
      r.setComponents(
        new ButtonBuilder().setCustomId("join").setLabel("دخول").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("exit").setLabel("خروج").setStyle(ButtonStyle.Danger)
      )
    );
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
    // أمر الاختبار السريع لمعاينة الصور (يبقى للضرورة لكن الصور معطلة إذا كانت USE_GAME_IMAGES = false)
    if (args[0] === 'اختبار') {
      if (!USE_GAME_IMAGES) {
        await message.channel.send(`${EMOJI.WARNING} | ميزة الصور معطلة حالياً.`);
        callback();
        return;
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('test_player_count')
        .setPlaceholder('اختر عدد اللاعبين للتجربة (1-20)')
        .addOptions(
          Array.from({ length: 20 }, (_, i) => {
            const num = i + 1;
            return new StringSelectMenuOptionBuilder()
              .setLabel(`${num} لاعب`)
              .setValue(String(num));
          })
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);
      const selectMessage = await message.channel.send({
        content: `${EMOJI.VOTE} اختر عدد اللاعبين الذين تريد اختبار الصور بهم:`,
        components: [row]
      });

      try {
        const filter = i => i.customId === 'test_player_count' && i.user.id === message.author.id;
        const collected = await selectMessage.awaitMessageComponent({ filter, time: 30000 });
        const playerCount = parseInt(collected.values[0], 10);

        const fakePlayers = [];
        for (let i = 0; i < playerCount; i++) {
          fakePlayers.push({
            id: String(i + 1),
            displayName: `لاعب${i + 1}`,
            avatarURL: `https://cdn.discordapp.com/embed/avatars/${i % 5}.png`,
            role: null,
            voteCount: 0,
            takeVote: false,
          });
        }

        // توزيع أدوار قديم للاختبار فقط
        const shuffled = [...fakePlayers].sort(() => Math.random() - 0.5);
        const mafiaCount = playerCount < 5 ? 1 : playerCount < 10 ? 2 : 3;
        shuffled.slice(0, mafiaCount).forEach(p => p.role = "mafia");
        shuffled.slice(mafiaCount, mafiaCount + 1).forEach(p => p.role = "doctor");
        shuffled.slice(mafiaCount + 1).forEach(p => p.role = "citizen");

        await collected.update({ content: `${EMOJI.SUCCESS} تم اختيار ${playerCount} لاعب. جاري إنشاء الصور...`, components: [] });

        const startImg = await drawGame(message, fakePlayers, 'start');
        await message.channel.send({ content: `🖼️ اختبار صورة البداية لـ ${playerCount} لاعب`, files: [startImg] });

        const mafiaWin = await drawGame(message, fakePlayers, 'end', 'mafia');
        await message.channel.send({ content: `🖼️ اختبار فوز المافيا لـ ${playerCount} لاعب`, files: [mafiaWin] });

        const citizenWin = await drawGame(message, fakePlayers, 'end', 'citizen');
        await message.channel.send({ content: `🖼️ اختبار فوز المواطنين لـ ${playerCount} لاعب`, files: [citizenWin] });

      } catch (e) {
        await selectMessage.edit({ content: `${EMOJI.TIMER} انتهى الوقت أو حدث خطأ.`, components: [] });
      }

      callback();
      return;
    }

    if (GAME_ACTIVE) {
      message.reply(`> **${EMOJI.ERROR} | لقد بدأت لعبة أخرى بالفعل. الرجاء انتظار حتى انتهاء اللعبة الحالية.**`);
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
    // لن يتم إرسال رسالة فردية بعد الآن
    console.log(`[Mafia] Gave ${points} points to winner ${playerId}`);
  } catch (e) {
    console.error(`[Mafia] Failed to apply win points: ${e}`);
  }
}

async function lose(playerId, context) {
  // لا خسارة نقاط حالياً
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
              displayName: i.member?.displayName || i.user.displayName,
              avatarURL: i.user.displayAvatarURL({ extension: "png", forceStatic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png",
              msgInfo: {
                applicationId: i.applicationId,
                interactionToken: i.token,
                messageId: i.id,
              },
              role: null,
              voteCount: 0,
              takeVote: false,
              hasBullet: false,
              silenced: false,
            });
            await i.update({ components: [buildMafiaLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
          } else {
            await i.reply({ content: `${EMOJI.WARNING} أنت بالفعل في اللعبة!`, ephemeral: true });
          }
        } else {
          await i.reply({ content: `${EMOJI.KICK} اللعبة ممتلئة!`, ephemeral: true });
        }
      } else if (i.customId === "exit") {
        const playerExists = players.some((player) => player.id === i.user.id);
        if (playerExists) {
          players = players.filter((player) => player.id !== i.user.id);
          await i.update({ components: [buildMafiaLobby(nowTime, players)], flags: MessageFlags.IsComponentsV2 });
        } else {
          await i.reply({ content: `${EMOJI.ERROR} لم تكن في اللعبة.`, ephemeral: true });
        }
      }
    });

    collector.on("end", async () => {
      try {
        const closedContainer = new ContainerBuilder()
          .setAccentColor(0x5865F2)
          .addTextDisplayComponents(t => t.setContent(
            `## ${EMOJI.LOBBY} لعبة المافيا\n**انتهى وقت الانضمام!**\n\nاللاعبون: ${players.length ? players.map(p => `<@${p.id}>`).join(', ') : 'لا يوجد'}`
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
        await context.channel.send(`${EMOJI.KICK} لم يكن هناك عدد كافٍ من اللاعبين لبدء اللعبة.`);
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
      await context.channel.send(`${EMOJI.ERROR} حدث خطأ أثناء بدء اللعبة. يرجى المحاولة مرة أخرى.`);
    }
  }
}

// ======================== توزيع الأدوار المرن ========================
function assignRoles(players) {
  const count = players.length;
  const roles = [];

  // تحديد عدد المافيا
  let mafiaCount;
  if (count <= 5) {
    mafiaCount = 1;
  } else if (count <= 8) {
    mafiaCount = 2;
  } else if (count <= 12) {
    mafiaCount = 3;
  } else if (count <= 16) {
    mafiaCount = 4;
  } else {
    mafiaCount = 5;
  }

  // إضافة أدوار المافيا
  roles.push('mafia_killer');
  if (mafiaCount >= 2) roles.push('mafia_godfather');
  if (mafiaCount >= 3) roles.push('mafia_silencer');
  // إضافة مافيا عاديين للعدد المتبقي
  const extraMafia = mafiaCount - 3;
  for (let i = 0; i < extraMafia; i++) {
    roles.push('mafia_regular');
  }

  // إضافة الأدوار الخاصة بالمواطنين
  roles.push('doctor');

  // المحقق يظهر فقط إذا كان عدد اللاعبين >= 4
  if (count >= 4) {
    roles.push('detective');
  }

  // العمدة يظهر عند >= 7
  if (count >= 7) {
    roles.push('mayor');
  }

  // القناص يظهر عند >= 9
  if (count >= 9) {
    roles.push('sniper');
  }

  // المواطنون يملؤون الباقي
  const remaining = count - roles.length;
  for (let i = 0; i < remaining; i++) {
    roles.push('citizen');
  }

  // خلط وتوزيع عشوائي
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  roles.sort(() => Math.random() - 0.5);
  shuffled.forEach((player, i) => {
    player.role = roles[i];
  });

  // تعيين خصائص إضافية
  players.forEach(p => {
    if (p.role === 'sniper') p.hasBullet = true;
    else p.hasBullet = false;
    p.silenced = false;
  });
}

// ======================== رسائل الأدوار الخاصة ========================
async function sendRoleMessages(context, players, AllPlayers) {
  await context.channel.send(`${EMOJI.TIMER} | تم الانتهاء من تسجيل اللاعبين ، جاري توزيع الادوار على اللاعبين...`);

  const roleCounts = {};
  players.forEach(p => { roleCounts[p.role] = (roleCounts[p.role] || 0) + 1; });

  const mafiaRoles = ['mafia_killer', 'mafia_godfather', 'mafia_silencer', 'mafia_regular'];
  const citizenRoles = ['doctor', 'detective', 'sniper', 'mayor', 'citizen'];

  let summary = '## الفريق الأول: المواطنون\n';
  citizenRoles.forEach(role => {
    if (roleCounts[role]) {
      summary += `-  ${ROLE_EMOJI[role] || ''} ${ROLE_NAMES[role] || role} ${roleCounts[role]}\n`;
    }
  });
  summary += '\n## الفريق الثاني: المافيا\n';
  mafiaRoles.forEach(role => {
    if (roleCounts[role]) {
      summary += `-  ${ROLE_EMOJI[role] || ''} ${ROLE_NAMES[role] || role} ${roleCounts[role]}\n`;
    }
  });

  await context.channel.send(summary);

  for (const player of players) {
    try {
      const webhook = new InteractionWebhook(
        context.client,
        player.msgInfo.applicationId,
        player.msgInfo.interactionToken
      );

      let rolesMessage = {
        mafia_killer: `${EMOJI.MAFIA} | تم اختيارك انت كـ **القاتل**. مهمتك قتل المواطنين مع فريق المافيا.`,
        mafia_godfather: `${EMOJI.MAFIA} | تم اختيارك انت كـ **العراب**. أنت زعيم المافيا، تستطيع القتل وعندما يحقق بك المحقق ستظهر كمواطن صالح.`,
        mafia_silencer: `${EMOJI.SILENCER} | تم اختيارك انت كـ **المُسكِت**. في كل ليلة يمكنك إسكات لاعب ومنعه من التصويت في الجولة التالية.`,
        mafia_regular: `${EMOJI.MAFIA} | تم اختيارك انت كـ **مافيا**. اعمل مع فريقك لقتل المواطنين.`,
        doctor: `${EMOJI.DOCTOR} | تم اختيارك انت كـ **الطبيب**. في كل ليلة تستطيع حماية شخص واحد من القتل.`,
        detective: `${EMOJI.DETECTIVE} | تم اختيارك انت كـ **المحقق**. كل ليلة تحقق من لاعب واحد وتظهر النتيجة للجميع .`,
        sniper: `${EMOJI.SNIPER} | تم اختيارك انت كـ **القناص**. لديك رصاصة واحدة طوال اللعبة، يمكنك استخدامها لقتل أي لاعب ليلاً، لكن إن كان صالحاً تموت معه.`,
        mayor: `${EMOJI.MAYOR} | تم اختيارك انت كـ **العمدة**. صوتك في جولة الطرد يعادل 3 أصوات.`,
        citizen: `${EMOJI.CITIZEN} | تم اختيارك انت كـ **مواطن**. لا تملك قدرة خاصة، صوتك مهم لكشف المافيا.`,
      };
      await webhook.send({
        content: rolesMessage[player.role] || `${EMOJI.CITIZEN} | تم اختيارك انت كـ **مواطن**.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error(`Failed to send role to user ${player.id}:`, error);
      players = players.filter(p => p.id !== player.id);
      AllPlayers = AllPlayers.filter(p => p.id !== player.id);
      await context.channel.send(`${EMOJI.WARNING} | تعذر إرسال الدور إلى <@${player.id}>. تم إزالته من اللعبة.`);
    }
  }

  await sleep(1000);

  if (USE_GAME_IMAGES) {
    try {
      const gameImage = await drawGame(context, AllPlayers, "start");
      await context.channel.send({
        content: `${EMOJI.SUCCESS} | تم توزيع الادوار على اللاعبين ، ستبدأ الجولة الاولى بعد قليل...`,
        files: [gameImage]
      });
    } catch (e) {
      console.error("Failed to draw start game image:", e);
      await context.channel.send(`${EMOJI.SUCCESS} | تم توزيع الادوار على اللاعبين ، ستبدأ الجولة الاولى بعد قليل...`);
    }
  } else {
    await context.channel.send(`${EMOJI.SUCCESS} | تم توزيع الادوار على اللاعبين ، ستبدأ الجولة الاولى بعد قليل...`);
  }
  await sleep(4000);
}

// ======================== تعطيل الأزرار ========================
async function disableButtons(buttonRows) {
  return buttonRows.map(row => {
    const newRow = new ActionRowBuilder();
    row.components.forEach(button => {
      newRow.addComponents(ButtonBuilder.from(button).setDisabled(true));
    });
    return newRow;
  });
}

// ======================== إنشاء أزرار التصويت ========================
async function generateButtons(players) {
  const buttons = players.map((player) => {
    return new ButtonBuilder()
      .setCustomId(`vote_${player.id}`)
      .setLabel(`${player.displayName.substring(0, 75)} ${numberToEmoji(player.voteCount)}`)
      .setStyle(ButtonStyle.Secondary);
  });

  let rows = [];
  while (buttons.length) {
    rows.push(new ActionRowBuilder().addComponents(...buttons.splice(0, 5)));
  }
  return rows;
}

// ======================== جولة المافيا الجديدة (قتل + إسكات) ========================
async function mafiaRound(context, players, AllPlayers, callback) {
  // سنعيد استخدام المتغيرات الخارجية بالتمرير
  let mafiaPlayers = players.filter(p => p.role && p.role.startsWith('mafia_'));
  if (mafiaPlayers.length === 0) return { topVotedPlayers: "citizens_win", players, silencedId: null };

  const nonMafia = players.filter(p => !p.role.startsWith('mafia_'));
  if (nonMafia.length === 0) return { topVotedPlayers: null, players, silencedId: null };

  // حلقة إعادة الجولة عند الطرد
  while (true) {
    // إعادة تعيين حالة التصويت للمافيا الحاليين فقط
    mafiaPlayers.forEach(p => { p.voteCount = 0; p.takeVote = false; });
    nonMafia.forEach(p => p.voteCount = 0); // إعادة تعيين أصوات الأهداف

    let killButtons = await generateButtons(nonMafia);
    for (const player of mafiaPlayers) {
      try {
        const webhook = new InteractionWebhook(context.client, player.msgInfo.applicationId, player.msgInfo.interactionToken);
        const msgInfo = await webhook.send({
          content: `${EMOJI.KILL} | صوت للاعب الذي تريد قتله (25 ثانية)`,
          components: killButtons,
          ephemeral: true,
          fetchReply: true
        });
        player.msgInfo.messageId = msgInfo.id;
      } catch (e) {
        console.error(`Failed to send mafia kill vote to ${player.id}`, e);
        player.takeVote = true; // نعتبره لم يصوت فعلياً
      }
    }

    await context.channel.send(`${EMOJI.KILL} | جاري انتظار المافيا لاختيار شخص لقتله...`);

    const killResult = await new Promise((resolve) => {
      const filter = (i) => i.customId.startsWith("vote_") && mafiaPlayers.some(p => p.id === i.user.id);
      const collector = context.channel.createMessageComponentCollector({ filter, time: 25000 });

      collector.on("collect", async (i) => {
        const playerId = i.customId.split("_")[1];
        const voter = mafiaPlayers.find(p => p.id === i.user.id);
        if (!voter || voter.takeVote) {
          await i.reply({ content: `${EMOJI.ERROR} لقد صوتت بالفعل`, ephemeral: true });
          return;
        }
        const target = nonMafia.find(p => p.id === playerId);
        if (target) target.voteCount++;
        voter.takeVote = true;
        await i.reply({ content: `${EMOJI.SUCCESS} | لقد صوتت على <@${target.id}>`, ephemeral: true });

        const updatedButtons = await generateButtons(nonMafia);
        for (const p of mafiaPlayers) {
          if (!p.msgInfo.messageId) continue;
          try {
            const webhook = new InteractionWebhook(context.client, p.msgInfo.applicationId, p.msgInfo.interactionToken);
            await webhook.editMessage(p.msgInfo.messageId, { components: updatedButtons });
          } catch (error) {}
        }

        if (mafiaPlayers.every(p => p.takeVote)) {
          collector.stop();
        }
      });

      collector.on("end", async () => {
        const disabled = await disableButtons(killButtons);
        for (const p of mafiaPlayers) {
          if (!p.msgInfo.messageId) continue;
          try {
            const webhook = new InteractionWebhook(context.client, p.msgInfo.applicationId, p.msgInfo.interactionToken);
            await webhook.editMessage(p.msgInfo.messageId, { components: disabled, content: `${EMOJI.KILL} | انتهى وقت التصويت` });
          } catch (error) {}
        }
        resolve();
      });
    });

    // تحديد من لم يصوت من المافيا
    const nonVoters = mafiaPlayers.filter(p => !p.takeVote);
    if (nonVoters.length > 0) {
      // طرد غير المصوتين
      for (const p of nonVoters) {
        await context.channel.send(`${EMOJI.KICK} | <@${p.id}> لم يصوت في جولة المافيا → تم طرده من اللعبة!`);
        players = players.filter(pl => pl.id !== p.id);
        AllPlayers.splice(AllPlayers.findIndex(pl => pl.id === p.id), 1);
      }

      // تحديث قائمة المافيا بعد الطرد
      mafiaPlayers = players.filter(p => p.role && p.role.startsWith('mafia_'));
      if (mafiaPlayers.length === 0) {
        return { topVotedPlayers: "citizens_win", players, silencedId: null };
      }
      // إعادة الجولة للمافيا المتبقين
      continue;
    }

    // الكل صوتوا
    const maxVotes = Math.max(...nonMafia.map(p => p.voteCount), 0);
    if (maxVotes === 0) {
      // لا أصوات (نادر) – تخطي
      return { topVotedPlayers: null, players, silencedId: null };
    }

    const top = nonMafia.filter(p => p.voteCount === maxVotes);
    let chosenTarget;
    if (top.length === 1) {
      chosenTarget = top[0];
    } else {
      // اختلاف: اختيار عشوائي بين المتعادلين
      chosenTarget = top[Math.floor(Math.random() * top.length)];
    }

    // إرسال رسالة الاغتيال العامة
    await context.channel.send(`${EMOJI.MAFIA} | تم اختيار الشخص الذي سيتم اغتياله من قبل المافيا`);

    // ==== جزء الإسكات (إن وجد المُسكِت) ====
    let silencedId = null;
    const silencer = players.find(p => p.role === 'mafia_silencer' && mafiaPlayers.includes(p));
    if (silencer) {
      silencer.takeVote = false; // إعادة تعيين للإسكات
      const allPlayersCopy = [...players];
      let silenceButtons = await generateButtons(allPlayersCopy);
      try {
        const webhook = new InteractionWebhook(context.client, silencer.msgInfo.applicationId, silencer.msgInfo.interactionToken);
        const msg = await webhook.send({
          content: `${EMOJI.SILENCER} | اختر لاعباً لإسكاته (يمنع من التصويت في الجولة القادمة) - 20 ثانية`,
          components: silenceButtons,
          ephemeral: true,
          fetchReply: true
        });
        silencer.msgInfo.messageId = msg.id;
      } catch (e) {
        console.error(`Failed to send silencer vote to ${silencer.id}`, e);
        return { topVotedPlayers: chosenTarget, players, silencedId: null };
      }

      await context.channel.send(`${EMOJI.SILENCER} | جاري انتظار المُسكِت لاختيار هدف...`);

      const silenceResult = await new Promise((resolve) => {
        const filter = (i) => i.customId.startsWith("vote_") && i.user.id === silencer.id;
        const collector = context.channel.createMessageComponentCollector({ filter, time: 20000 });

        collector.on("collect", async (i) => {
          const playerId = i.customId.split("_")[1];
          if (silencer.takeVote) {
            await i.reply({ content: `${EMOJI.ERROR} لقد أخترت بالفعل`, ephemeral: true });
            return;
          }
          silencer.takeVote = true;
          await i.reply({ content: `${EMOJI.SUCCESS} | تم إسكات <@${playerId}>`, ephemeral: true });
          resolve(playerId);
          collector.stop();
        });

        collector.on("end", async () => {
          if (!silencer.takeVote) resolve(null);
        });
      });

      const disabledSilence = await disableButtons(silenceButtons);
      try {
        const webhook = new InteractionWebhook(context.client, silencer.msgInfo.applicationId, silencer.msgInfo.interactionToken);
        await webhook.editMessage(silencer.msgInfo.messageId, { components: disabledSilence, content: `${EMOJI.SILENCER} | انتهى وقت الإسكات` });
      } catch (error) {}

      silencedId = silenceResult;
    }

    return { topVotedPlayers: chosenTarget, players, silencedId };
  }
}

// ======================== جولة الطبيب (مع طرد في حال عدم التصويت) ========================
async function doctorRound(context, players, AllPlayers) {
  const doctor = players.find(p => p.role === 'doctor');
  if (!doctor) return { savedPlayer: null, players };

  let buttons = await generateButtons(players);
  try {
    const webhook = new InteractionWebhook(context.client, doctor.msgInfo.applicationId, doctor.msgInfo.interactionToken);
    const msg = await webhook.send({
      content: `${EMOJI.DOCTOR} | صوت للاعب الذي تريد انقاذه (25 ثانية)`,
      components: buttons,
      ephemeral: true,
      fetchReply: true
    });
    doctor.msgInfo.messageId = msg.id;
  } catch (e) {
    console.error(`Failed to send doctor vote to ${doctor.id}`, e);
    await context.channel.send(`${EMOJI.DOCTOR} | لم يتمكن الطبيب من التصويت هذا الدور.`);
    return { savedPlayer: null, players };
  }

  await context.channel.send(`${EMOJI.DOCTOR} | جاري انتظار الطبيب لاختيار شخص لحمايته...`);

  return new Promise((resolve) => {
    const filter = (i) => i.customId.startsWith("vote_") && i.user.id === doctor.id;
    const collector = context.channel.createMessageComponentCollector({ filter, time: 25000 });

    let votedPlayer = null;
    let hasVoted = false;

    collector.on("collect", async (i) => {
      const playerId = i.customId.split("_")[1];
      if (hasVoted) {
        await i.reply({ content: `${EMOJI.ERROR} لقد صوتت بالفعل`, ephemeral: true });
        return;
      }
      votedPlayer = players.find(p => p.id === playerId);
      hasVoted = true;
      doctor.takeVote = true;
      await i.reply({ content: `${EMOJI.SUCCESS} | لقد صوتت على <@${votedPlayer.id}>`, ephemeral: true });
      collector.stop();
    });

    collector.on("end", async () => {
      const disabled = await disableButtons(buttons);
      try {
        const webhook = new InteractionWebhook(context.client, doctor.msgInfo.applicationId, doctor.msgInfo.interactionToken);
        await webhook.editMessage(doctor.msgInfo.messageId, { components: disabled, content: `${EMOJI.DOCTOR} | انتهى وقت التصويت` });
      } catch (error) {}

      if (!hasVoted) {
        // طرد الطبيب
        await context.channel.send(`${EMOJI.KICK} | <@${doctor.id}> لم يصوت في جولة الطبيب → تم طرده من اللعبة!`);
        players = players.filter(p => p.id !== doctor.id);
        AllPlayers.splice(AllPlayers.findIndex(p => p.id === doctor.id), 1);
        resolve({ savedPlayer: null, players });
      } else {
        await context.channel.send(`${EMOJI.PROTECT} | اختار الطبيب الشخص الذي سيحميه.`);
        resolve({ savedPlayer: votedPlayer, players });
      }
    });
  });
}

// ======================== جولة المحقق (مع طرد في حال عدم التصويت) ========================
async function investigatorRound(context, players, AllPlayers) {
  const detective = players.find(p => p.role === 'detective');
  if (!detective) return players;

  const buttons = await generateButtons(players);
  try {
    const webhook = new InteractionWebhook(context.client, detective.msgInfo.applicationId, detective.msgInfo.interactionToken);
    const msg = await webhook.send({
      content: `${EMOJI.DETECTIVE} | اختر لاعباً للتحقق منه (20 ثانية)`,
      components: buttons,
      ephemeral: true,
      fetchReply: true
    });
    detective.msgInfo.messageId = msg.id;
  } catch (e) {
    console.error(`Failed to send detective vote to ${detective.id}`, e);
    return players;
  }

  await context.channel.send(`${EMOJI.DETECTIVE} | جاري انتظار المحقق...`);

  return new Promise((resolve) => {
    const filter = (i) => i.customId.startsWith("vote_") && i.user.id === detective.id;
    const collector = context.channel.createMessageComponentCollector({ filter, time: 20000 });
    let hasVoted = false;

    collector.on("collect", async (i) => {
      const playerId = i.customId.split("_")[1];
      const target = players.find(p => p.id === playerId);
      if (!target) return;

      let result;
      if (target.role === 'mafia_godfather' || !target.role.startsWith('mafia_')) {
        result = `${EMOJI.CITIZEN} مواطن صالح`;
      } else {
        result = `${EMOJI.MAFIA} مافيا`;
      }

      await context.channel.send(`${EMOJI.ANNOUNCE} |  تم التحقيق مع <@${target.id}> وكان هو **${result}**!`);
      await i.reply({ content: `${EMOJI.SUCCESS} | تم التحقيق`, ephemeral: true });
      hasVoted = true;
      collector.stop();
    });

    collector.on("end", async () => {
      const disabled = await disableButtons(buttons);
      try {
        const webhook = new InteractionWebhook(context.client, detective.msgInfo.applicationId, detective.msgInfo.interactionToken);
        await webhook.editMessage(detective.msgInfo.messageId, { components: disabled, content: `${EMOJI.DETECTIVE} | انتهى وقت التحقيق` });
      } catch (error) {}

      if (!hasVoted) {
        // طرد المحقق
        await context.channel.send(`${EMOJI.KICK} | <@${detective.id}> لم يختر في جولة المحقق → تم طرده من اللعبة!`);
        players = players.filter(p => p.id !== detective.id);
        AllPlayers.splice(AllPlayers.findIndex(p => p.id === detective.id), 1);
      }
      resolve(players);
    });
  });
}

// ======================== جولة القناص (مع طرد في حال عدم الاختيار) ========================
async function sniperRound(context, players, AllPlayers) {
  const sniper = players.find(p => p.role === 'sniper' && p.hasBullet);
  if (!sniper) return players;

  const targets = players.filter(p => p.id !== sniper.id);
  if (targets.length === 0) return players;

  const buttons = await generateButtons(targets);
  buttons.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sniper_skip').setLabel('تخطي').setStyle(ButtonStyle.Secondary)
  ));

  try {
    const webhook = new InteractionWebhook(context.client, sniper.msgInfo.applicationId, sniper.msgInfo.interactionToken);
    const msg = await webhook.send({
      content: `${EMOJI.SNIPER} | لديك رصاصة واحدة! اختر لاعباً لتصويبه أو تخطي (20 ثانية)`,
      components: buttons,
      ephemeral: true,
      fetchReply: true
    });
    sniper.msgInfo.messageId = msg.id;
  } catch (e) {
    console.error(`Failed to send sniper vote to ${sniper.id}`, e);
    return players;
  }

  await context.channel.send(`${EMOJI.SNIPER} | القناص يجهز رصاصته...`);

  return new Promise((resolve) => {
    const filter = (i) => (i.customId.startsWith("vote_") || i.customId === 'sniper_skip') && i.user.id === sniper.id;
    const collector = context.channel.createMessageComponentCollector({ filter, time: 20000 });
    let hasActed = false;

    collector.on("collect", async (i) => {
      if (i.customId === 'sniper_skip') {
        sniper.hasBullet = true;
        await i.reply({ content: `${EMOJI.SKIP} | تخطيت هذا الدور.`, ephemeral: true });
        hasActed = true;
        collector.stop();
        return;
      }

      const targetId = i.customId.split("_")[1];
      const target = players.find(p => p.id === targetId);
      if (!target) return;

      sniper.hasBullet = false;
      hasActed = true;
      await i.reply({ content: `${EMOJI.SUCCESS} | أطلقت الرصاصة على <@${target.id}>`, ephemeral: true });

      if (target.role.startsWith('mafia_')) {
        await context.channel.send(`${EMOJI.BULLET} | أطلق القناص رصاصته على <@${target.id}> وأصاب **مافيا**! تم قتله.`);
        players = players.filter(p => p.id !== target.id);
        AllPlayers.splice(AllPlayers.findIndex(p => p.id === target.id), 1);
      } else {
        await context.channel.send(`${EMOJI.BULLET} | أطلق القناص رصاصته على <@${target.id}> لكنه كان **مواطناً صالحاً**! يموت القناص وهدفه معاً.`);
        players = players.filter(p => p.id !== target.id && p.id !== sniper.id);
        AllPlayers.splice(AllPlayers.findIndex(p => p.id === target.id), 1);
        AllPlayers.splice(AllPlayers.findIndex(p => p.id === sniper.id), 1);
      }
      collector.stop();
    });

    collector.on("end", async () => {
      const disabled = await disableButtons(buttons);
      try {
        const webhook = new InteractionWebhook(context.client, sniper.msgInfo.applicationId, sniper.msgInfo.interactionToken);
        await webhook.editMessage(sniper.msgInfo.messageId, { components: disabled, content: `${EMOJI.SNIPER} | انتهى وقت القناص` });
      } catch (error) {}

      if (!hasActed) {
        // طرد القناص
        await context.channel.send(`${EMOJI.KICK} | <@${sniper.id}> لم يختر في جولة القناص → تم طرده من اللعبة!`);
        players = players.filter(p => p.id !== sniper.id);
        AllPlayers.splice(AllPlayers.findIndex(p => p.id === sniper.id), 1);
      }
      resolve(players);
    });
  });
}

// ======================== جولة التصويت العام (بدون طرد) ========================
async function citizenRound(context, players, silencedId) {
  if (players.length === 0) return { topVotedPlayers: null, players };

  const voteablePlayers = players.filter(p => p.id !== silencedId);
  if (silencedId) {
    await context.channel.send(`${EMOJI.SILENCED} | <@${silencedId}> تم إسكاته ولا يمكنه التصويت هذه الجولة.`);
  }

  const buttons = await generateButtons(voteablePlayers);
  const investigateMessage = await context.channel.send({
    content: `${EMOJI.VOTE} | لديكم 25 ثانية لاختيار شخص لطرده من اللعبة`,
    components: buttons
  });

  return new Promise((resolve) => {
    const filter = (i) => i.customId.startsWith("vote_") && players.some(p => p.id === i.user.id && p.id !== silencedId);
    const collector = context.channel.createMessageComponentCollector({ filter, time: 25000 });

    collector.on("collect", async (i) => {
      const playerId = i.customId.split("_")[1];
      const voter = players.find(p => p.id === i.user.id);
      if (!voter || voter.id === silencedId) {
        await i.reply({ content: `${EMOJI.ERROR} | لا يمكنك التصويت.`, ephemeral: true });
        return;
      }
      if (voter.takeVote) {
        await i.reply({ content: `${EMOJI.ERROR} لقد صوتت بالفعل`, ephemeral: true });
        return;
      }
      const target = players.find(p => p.id === playerId);
      if (!target) {
        await i.reply({ content: `${EMOJI.ERROR} | هذا اللاعب غير موجود.`, ephemeral: true });
        return;
      }

      const voteWeight = voter.role === 'mayor' ? 3 : 1;
      target.voteCount += voteWeight;
      voter.takeVote = true;
      await i.reply({ content: `${EMOJI.SUCCESS} | لقد صوتت على <@${target.id}> (${voteWeight} صوت)`, ephemeral: true });

      const updatedButtons = await generateButtons(voteablePlayers);
      await investigateMessage.edit({ components: updatedButtons });

      if (players.filter(p => p.id !== silencedId).every(p => p.takeVote)) {
        collector.stop();
      }
    });

    collector.on("end", async () => {
      try {
        const disabledButtons = await disableButtons(await generateButtons(voteablePlayers));
        await investigateMessage.edit({
          content: `${EMOJI.VOTE} | انتهت جولة التصويت!`,
          components: disabledButtons
        });
      } catch (error) {}

      // لا طرد لمن لم يصوت

      const maxVotes = Math.max(...players.map(p => p.voteCount), 0);
      if (maxVotes === 0) {
        await context.channel.send(`${EMOJI.SKIP} | لم يتم التصويت لأي لاعب، سيتم تخطي الطرد.`);
        resolve({ topVotedPlayers: "draw", players });
        return;
      }

      const top = players.filter(p => p.voteCount === maxVotes);
      if (top.length > 1) {
        await context.channel.send(`${EMOJI.SKIP} | بسبب تعادل التصويت، تم تخطي الطرد.`);
        resolve({ topVotedPlayers: "draw", players });
      } else if (top.length === 1) {
        const kicked = top[0];
        const roleName = ROLE_NAMES[kicked.role] || 'مواطن';
        await context.channel.send(`${EMOJI.KICK} | تم التصويت على <@${kicked.id}>، وكان **${roleName}**`);
        players = players.filter(p => p.id !== kicked.id);
        resolve({ topVotedPlayers: kicked, players });
      } else {
        resolve({ topVotedPlayers: "draw", players });
      }
    });
  });
}

// ======================== الحلقة الرئيسية للجولة ========================
async function gameRound(context, players, AllPlayers, callback) {
  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  players.forEach(p => { p.voteCount = 0; p.takeVote = false; p.silenced = false; });

  // 1. جولة المافيا (قتل + إسكات)
  let { topVotedPlayers: killTarget, players: afterMafia, silencedId } = await mafiaRound(context, players, AllPlayers, callback);
  players = afterMafia;

  if (killTarget === "citizens_win") {
    const allCitizens = AllPlayers.filter(p => !p.role.startsWith('mafia_'));
    const allMafia = AllPlayers.filter(p => p.role.startsWith('mafia_'));
    const winMessage = `# ${EMOJI.CITIZEN} فوز المواطنين!\n${allCitizens.map(p => `- <@${p.id}> ${ROLE_EMOJI[p.role]} ${ROLE_NAMES[p.role]}`).join('\n')}\n\nجميع الفائزين حصلوا على 10 نقاط`;

    if (USE_GAME_IMAGES) {
      try {
        await context.channel.send({
          content: winMessage,
          files: [await drawGame(context, AllPlayers, "end", "citizen")]
        });
      } catch(e) {
        await context.channel.send(winMessage);
      }
    } else {
      await context.channel.send(winMessage);
    }

    for (const p of allCitizens) await win(p.id, context);
    for (const p of allMafia) await lose(p.id, context);
    resetGameData();
    callback(null, false, 0, "Citizens win!");
    return;
  }

  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  // 2. جولة الطبيب
  let savedPlayer = null;
  if (killTarget) {
    players.forEach(p => { p.voteCount = 0; p.takeVote = false; });
    const { savedPlayer: saved, players: updated } = await doctorRound(context, players, AllPlayers);
    savedPlayer = saved;
    players = updated;
    if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

    if (savedPlayer && killTarget.id === savedPlayer.id) {
      await context.channel.send(`${EMOJI.OK} | لقد نجح الطبيب في حماية <@${savedPlayer.id}> من الاغتيال!`);
    } else {
      const roleName = ROLE_NAMES[killTarget.role] || 'مواطن';
      await context.channel.send(`${EMOJI.KILL} | لقد قتلت المافيا <@${killTarget.id}> وكان **${roleName}**`);
      players = players.filter(p => p.id !== killTarget.id);
      AllPlayers.splice(AllPlayers.findIndex(p => p.id === killTarget.id), 1);
      if ((await checkWin(context, players, AllPlayers, callback)) === true) return;
    }
  }

  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  // 3. جولة المحقق
  players = await investigatorRound(context, players, AllPlayers);
  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  // 4. جولة القناص
  players = await sniperRound(context, players, AllPlayers);
  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  // 5. جولة التصويت العام
  players.forEach(p => { p.voteCount = 0; p.takeVote = false; });
  const { players: afterKick } = await citizenRound(context, players, silencedId);
  players = afterKick;

  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  await context.channel.send(`--- ${EMOJI.NIGHT} تبدأ جولة جديدة ${EMOJI.NIGHT} ---`);
  await sleep(3000);
  await gameRound(context, players, AllPlayers, callback);
}

// ======================== التحقق من الفوز (مع الإيموجيات الصحيحة ورسالة النقاط) ========================
async function checkWin(context, players, AllPlayers, callback) {
  const mafiaAlive = players.filter(p => p.role && p.role.startsWith('mafia_'));
  const citizensAlive = players.filter(p => p.role && !p.role.startsWith('mafia_'));

  const allMafia = AllPlayers.filter(p => p.role && p.role.startsWith('mafia_'));
  const allCitizens = AllPlayers.filter(p => p.role && !p.role.startsWith('mafia_'));

  if (mafiaAlive.length >= citizensAlive.length && citizensAlive.length > 0) {
    const winMsg = `# ${EMOJI.MAFIA} فوز المافيا!\n${allMafia.map(p => `- <@${p.id}> ${ROLE_EMOJI[p.role]} ${ROLE_NAMES[p.role]}`).join('\n')}\n\nجميع الفائزين حصلوا على 10 نقاط`;
    if (USE_GAME_IMAGES) {
      try {
        await context.channel.send({ content: winMsg, files: [await drawGame(context, AllPlayers, "end", "mafia")] });
      } catch(e) {
        await context.channel.send(winMsg);
      }
    } else {
      await context.channel.send(winMsg);
    }
    for (const p of allMafia) await win(p.id, context);
    for (const p of allCitizens) await lose(p.id, context);
    resetGameData();
    callback(null, false, 0, "Mafia win!");
    return true;
  }

  if (mafiaAlive.length === 0) {
    const winMsg = `# ${EMOJI.CITIZEN} فوز المواطنين!\n${allCitizens.map(p => `- <@${p.id}> ${ROLE_EMOJI[p.role]} ${ROLE_NAMES[p.role]}`).join('\n')}\n\nجميع الفائزين حصلوا على 10 نقاط`;
    if (USE_GAME_IMAGES) {
      try {
        await context.channel.send({ content: winMsg, files: [await drawGame(context, AllPlayers, "end", "citizen")] });
      } catch(e) {
        await context.channel.send(winMsg);
      }
    } else {
      await context.channel.send(winMsg);
    }
    for (const p of allCitizens) await win(p.id, context);
    for (const p of allMafia) await lose(p.id, context);
    resetGameData();
    callback(null, false, 0, "Citizen win!");
    return true;
  }

  return false;
}

// ======================== دالة الرسم (محفوظة) ========================
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

    const scale = 1.44;
    const mafiaIconW = 22 * scale,
          mafiaIconH = 43 * scale;
    const citizenIconW = 27 * scale,
          citizenIconH = 43 * scale;
    const doctorIconW = 27 * scale,
          doctorIconH = 43 * scale;
    const iconGap = 9 * scale;
    const iconsPerRow = 5;
    const containerW = (mafiaIconW * iconsPerRow) + (iconGap * (iconsPerRow - 1));
    const raiseAmount = 60;
    const baseY = 150;
    const mafiaContainerX = 120,
          mafiaContainerY = baseY - raiseAmount;
    const citizenContainerX = 400,
          citizenContainerY = baseY - raiseAmount;

    const drawRoleIcon = (icon, x, y, w, h, roleLetter, color) => {
      if (icon) {
        ctx.drawImage(icon, x, y, w, h);
      } else {
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

    mafiaPlayers.forEach((p, index) => {
      const row = Math.floor(index / iconsPerRow);
      const col = index % iconsPerRow;
      const xOffset = mafiaContainerX + (containerW - (iconsPerRow * mafiaIconW + (iconsPerRow - 1) * iconGap)) / 2;
      const xPos = xOffset + col * (mafiaIconW + iconGap);
      const yPos = mafiaContainerY + row * (mafiaIconH + iconGap);
      drawRoleIcon(mafiaIcon, xPos, yPos, mafiaIconW, mafiaIconH, "M", "#e74c3c");
    });

    citizenPlayers.forEach((p, index) => {
      const row = Math.floor(index / iconsPerRow);
      const col = index % iconsPerRow;
      const xOffset = citizenContainerX + (containerW - (iconsPerRow * citizenIconW + (iconsPerRow - 1) * iconGap)) / 2;
      const xPos = xOffset + col * (citizenIconW + iconGap);
      const yPos = citizenContainerY + row * (citizenIconH + iconGap);
      drawRoleIcon(citizenIcon, xPos, yPos, citizenIconW, citizenIconH, "C", "#3498db");
    });

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