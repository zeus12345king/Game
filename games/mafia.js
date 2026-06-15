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
};

// ======================== أيقونات أرقام التصويت ========================
const DIGIT_EMOJIS = ['<:z2:1515948329975021608>','<:zn1:1515295486704353340>','<:zn2:1515294909572059168>','<:zn3:1515295579746336849>','<:zn4:1515295655889731685>','<:zn5:1515295717063659600>','<:zn6:1515295780670537828>','<:zn7:1515295840376197240>','<:zn8:1515295897339170836>','<:zn9:1515295978494759032>'];
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

async function win(playerId, context) {
  try {
    // نقوم فقط بإضافة النقاط دون إرسال رسالة منفصلة
    await db.addPoints(playerId, 10);
    console.log(`[Mafia] Gave 10 points to winner ${playerId}`);
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
              hasBullet: false,    // للقناص
              silenced: false,     // هل هو مسكت حاليًا
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

  // تحديد عدد المافيا وأدواردها
  let mafiaCount;
  if (count <= 6) mafiaCount = 1;
  else if (count <= 8) mafiaCount = 2;
  else if (count <= 12) mafiaCount = 3;
  else if (count <= 16) mafiaCount = 4;
  else mafiaCount = 5;  // 17-20

  // أدوار المافيا
  roles.push('mafia_killer'); // دائمًا
  if (mafiaCount >= 2) roles.push('mafia_godfather');
  if (mafiaCount >= 3) roles.push('mafia_silencer');
  for (let i = 3; i < mafiaCount; i++) roles.push('mafia_regular');

  // أدوار الصالحين
  roles.push('doctor', 'detective'); // دائمًا
  if (count >= 9) roles.push('sniper');
  if (count >= 10) roles.push('mayor');

  // باقي المواطنين
  const remaining = count - roles.length;
  for (let i = 0; i < remaining; i++) roles.push('citizen');

  // خلط الأدوار وإسنادها
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  roles.sort(() => Math.random() - 0.5);
  shuffled.forEach((player, i) => player.role = roles[i]);

  // إعداد خاصية الرصاصة للقناص
  players.forEach(p => {
    if (p.role === 'sniper') p.hasBullet = true;
    else p.hasBullet = false;
    p.silenced = false;
  });
}

// ======================== رسائل الأدوار الخاصة ========================
async function sendRoleMessages(context, players, AllPlayers) {
  // إعلان بدء توزيع الأدوار
  await context.channel.send(`${EMOJI.TIMER} | تم الانتهاء من تسجيل اللاعبين ، جاري توزيع الادوار على اللاعبين...`);

  // ملخص الأدوار
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

  // إرسال الأدوار الخاصة لكل لاعب
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

  // بداية اللعبة (بدون صورة إذا كانت معطلة)
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

// ======================== جولة المافيا (القتل + الإسكات) ========================
async function mafiaRound(context, players, callback) {
  // دالة داخلية لتنفيذ جولة تصويت المافيا على القتل مع معالجة الطرد وإعادة التصويت
  async function resolveMafiaKill(currentMafia, nonMafia) {
    // currentMafia: المافيا المطلوب منهم التصويت الآن
    if (currentMafia.length === 0) {
      // لم يتبقى مافيا -> فوز المواطنين
      return { topVotedPlayers: "citizens_win", players, silencedId: null };
    }
    if (nonMafia.length === 0) {
      return { topVotedPlayers: null, players, silencedId: null };
    }

    // إرسال رسالة عامة بأن المافيا تختار
    await context.channel.send(`${EMOJI.KILL} | جاري انتظار المافيا لاختيار شخص لقتله...`);

    // إعادة تعيين حالة التصويت
    nonMafia.forEach(p => p.voteCount = 0);
    currentMafia.forEach(p => p.takeVote = false);

    let killButtons = await generateButtons(nonMafia);
    for (const player of currentMafia) {
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
        player.takeVote = true; // نعتبره لم يصوت لأنه لم يستلم الأزرار
      }
    }

    const killResult = await new Promise((resolve) => {
      const filter = (i) => i.customId.startsWith("vote_") && currentMafia.some(p => p.id === i.user.id);
      const collector = context.channel.createMessageComponentCollector({ filter, time: 25000 });

      collector.on("collect", async (i) => {
        const playerId = i.customId.split("_")[1];
        const voter = currentMafia.find(p => p.id === i.user.id);
        if (!voter || voter.takeVote) {
          await i.reply({ content: `${EMOJI.ERROR} لقد صوتت بالفعل`, ephemeral: true });
          return;
        }
        const target = nonMafia.find(p => p.id === playerId);
        if (target) target.voteCount++;
        voter.takeVote = true;
        await i.reply({ content: `${EMOJI.SUCCESS} | لقد صوتت على <@${target.id}>`, ephemeral: true });

        const updatedButtons = await generateButtons(nonMafia);
        for (const p of currentMafia) {
          if (!p.msgInfo.messageId) continue;
          try {
            const webhook = new InteractionWebhook(context.client, p.msgInfo.applicationId, p.msgInfo.interactionToken);
            await webhook.editMessage(p.msgInfo.messageId, { components: updatedButtons });
          } catch (error) {}
        }

        // إنهاء فوري إذا صوت جميع المافيا الحاليين
        if (currentMafia.every(p => p.takeVote)) {
          collector.stop();
        }
      });

      collector.on("end", async () => {
        const disabled = await disableButtons(killButtons);
        for (const p of currentMafia) {
          if (!p.msgInfo.messageId) continue;
          try {
            const webhook = new InteractionWebhook(context.client, p.msgInfo.applicationId, p.msgInfo.interactionToken);
            await webhook.editMessage(p.msgInfo.messageId, { components: disabled, content: `${EMOJI.KILL} | انتهى وقت التصويت` });
          } catch (error) {}
        }

        // معالجة من لم يصوت (طرد)
        const votedMafia = currentMafia.filter(p => p.takeVote);
        const nonVotedMafia = currentMafia.filter(p => !p.takeVote);

        if (nonVotedMafia.length > 0) {
          // طرد من لم يصوت
          for (const p of nonVotedMafia) {
            players = players.filter(pl => pl.id !== p.id);
            await context.channel.send(`${EMOJI.KICK} | <@${p.id}> لم يصوت في جولة المافيا → تم طرده من اللعبة!`);
          }
          // التحقق من الفوز بعد الطرد
          if ((await checkWin(context, players, players, callback)) === true) {
            resolve({ topVotedPlayers: "game_ended" }); // إشارة لإنهاء
            return;
          }
          // إعادة الجولة للمافيا المتبقين الذين صوتوا (إذا كان هناك منهم أحد)
          const remainingMafia = players.filter(p => p.role && p.role.startsWith('mafia_'));
          if (remainingMafia.length === 0) {
            resolve({ topVotedPlayers: "citizens_win" });
            return;
          }
          const newNonMafia = players.filter(p => !p.role.startsWith('mafia_'));
          // إعادة الجولة
          const recursiveResult = await resolveMafiaKill(remainingMafia, newNonMafia);
          resolve(recursiveResult);
          return;
        }

        // الكل صوتوا
        const maxVotes = Math.max(...nonMafia.map(p => p.voteCount), 0);
        if (maxVotes === 0) {
          resolve({ topVotedPlayers: null });
          return;
        }

        const top = nonMafia.filter(p => p.voteCount === maxVotes);
        if (top.length > 1) {
          // اختلاف الأصوات -> اختيار عشوائي بينهم
          const randomTarget = top[Math.floor(Math.random() * top.length)];
          // إرسال الرسالة العامة بأن المافيا اختارت هدفاً (دون ذكر الاسم)
          await context.channel.send(`${EMOJI.MAFIA} | تم اختيار الشخص الذي سيتم اغتياله من قبل المافيا`);
          resolve({ topVotedPlayers: randomTarget });
        } else {
          // إجماع
          await context.channel.send(`${EMOJI.MAFIA} | تم اختيار الشخص الذي سيتم اغتياله من قبل المافيا`);
          resolve({ topVotedPlayers: top[0] });
        }
      });
    });

    return killResult;
  }

  const mafiaPlayers = players.filter(p => p.role && p.role.startsWith('mafia_'));
  if (mafiaPlayers.length === 0) return { topVotedPlayers: null, players, silencedId: null };

  const nonMafia = players.filter(p => !p.role.startsWith('mafia_'));
  if (nonMafia.length === 0) return { topVotedPlayers: null, players, silencedId: null };

  // بدء عملية القتل (مع إعادة المحاولة عند الطرد)
  let killResult = await resolveMafiaKill([...mafiaPlayers], [...nonMafia]);
  if (killResult.topVotedPlayers === "game_ended") {
    // انتهت اللعبة أثناء الطرد
    return { topVotedPlayers: "citizens_win", players, silencedId: null };
  }

  // ==== اختيار الإسكات (إذا وُجد المسكت) ====
  const silencer = players.find(p => p.role === 'mafia_silencer');
  if (silencer && !silencer.takeVote) {
    silencer.takeVote = false;
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
      return { topVotedPlayers: killResult.topVotedPlayers, players, silencedId: null };
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

    return { topVotedPlayers: killResult.topVotedPlayers, players, silencedId: silenceResult };
  }

  return { topVotedPlayers: killResult.topVotedPlayers, players, silencedId: null };
}

// ======================== جولة الطبيب ========================
async function doctorRound(context, players) {
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
    // إذا فشل الإرسال نعتبره لم يصوت -> طرد
    players = players.filter(p => p.id !== doctor.id);
    await context.channel.send(`${EMOJI.KICK} | <@${doctor.id}> لم يصوت في جولة الطبيب → تم طرده من اللعبة!`);
    return { savedPlayer: null, players };
  }

  await context.channel.send(`${EMOJI.DOCTOR} | جاري انتظار الطبيب لاختيار شخص لحمايته...`);

  return new Promise((resolve) => {
    const filter = (i) => i.customId.startsWith("vote_") && i.user.id === doctor.id;
    const collector = context.channel.createMessageComponentCollector({ filter, time: 25000 });

    let votedPlayer = null;

    collector.on("collect", async (i) => {
      const playerId = i.customId.split("_")[1];
      if (doctor.takeVote) {
        await i.reply({ content: `${EMOJI.ERROR} لقد صوتت بالفعل`, ephemeral: true });
        return;
      }
      votedPlayer = players.find(p => p.id === playerId);
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

      if (doctor.takeVote === true) {
        await context.channel.send(`${EMOJI.PROTECT} | اختار الطبيب الشخص الذي سيحميه.`);
        resolve({ savedPlayer: votedPlayer, players });
      } else {
        // لم يصوت -> طرد
        players = players.filter(p => p.id !== doctor.id);
        await context.channel.send(`${EMOJI.KICK} | <@${doctor.id}> لم يصوت في جولة الطبيب → تم طرده من اللعبة!`);
        await context.channel.send(`${EMOJI.PROTECT} | لم يقم الطبيب بإنقاذ أي شخص!`);
        resolve({ savedPlayer: null, players });
      }
    });
  });
}

// ======================== جولة المحقق ========================
async function investigatorRound(context, players) {
  const detective = players.find(p => p.role === 'detective');
  if (!detective) return;

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
    // طرد لعدم التمكن من الإرسال
    players = players.filter(p => p.id !== detective.id);
    await context.channel.send(`${EMOJI.KICK} | <@${detective.id}> لم يصوت في جولة المحقق → تم طرده من اللعبة!`);
    return;
  }

  await context.channel.send(`${EMOJI.DETECTIVE} | جاري انتظار المحقق...`);

  return new Promise((resolve) => {
    const filter = (i) => i.customId.startsWith("vote_") && i.user.id === detective.id;
    const collector = context.channel.createMessageComponentCollector({ filter, time: 20000 });

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
      collector.stop();
      resolve();
    });

    collector.on("end", async () => {
      const disabled = await disableButtons(buttons);
      try {
        const webhook = new InteractionWebhook(context.client, detective.msgInfo.applicationId, detective.msgInfo.interactionToken);
        await webhook.editMessage(detective.msgInfo.messageId, { components: disabled, content: `${EMOJI.DETECTIVE} | انتهى وقت التحقيق` });
      } catch (error) {}

      if (detective.takeVote === false) {
        // لم يختر -> طرد
        players = players.filter(p => p.id !== detective.id);
        await context.channel.send(`${EMOJI.KICK} | <@${detective.id}> لم يصوت في جولة المحقق → تم طرده من اللعبة!`);
      }
      resolve();
    });
  });
}

// ======================== جولة القناص ========================
async function sniperRound(context, players) {
  const sniper = players.find(p => p.role === 'sniper' && p.hasBullet);
  if (!sniper) return;

  const targets = players.filter(p => p.id !== sniper.id);
  if (targets.length === 0) return;

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
    // طرد لفشل الإرسال
    players = players.filter(p => p.id !== sniper.id);
    await context.channel.send(`${EMOJI.KICK} | <@${sniper.id}> لم يصوت في جولة القناص → تم طرده من اللعبة!`);
    return;
  }

  await context.channel.send(`${EMOJI.SNIPER} | القناص يجهز رصاصته...`);

  return new Promise((resolve) => {
    const filter = (i) => (i.customId.startsWith("vote_") || i.customId === 'sniper_skip') && i.user.id === sniper.id;
    const collector = context.channel.createMessageComponentCollector({ filter, time: 20000 });

    collector.on("collect", async (i) => {
      if (i.customId === 'sniper_skip') {
        sniper.hasBullet = true; // لم يستخدمها
        await i.reply({ content: `${EMOJI.SKIP} | تخطيت هذا الدور.`, ephemeral: true });
        collector.stop();
        resolve();
        return;
      }

      const targetId = i.customId.split("_")[1];
      const target = players.find(p => p.id === targetId);
      if (!target) return;

      sniper.hasBullet = false;
      await i.reply({ content: `${EMOJI.SUCCESS} | أطلقت الرصاصة على <@${target.id}>`, ephemeral: true });

      if (target.role.startsWith('mafia_')) {
        await context.channel.send(`${EMOJI.BULLET} | أطلق القناص رصاصته على <@${target.id}> وأصاب **مافيا**! تم قتله.`);
        players = players.filter(p => p.id !== target.id);
      } else {
        await context.channel.send(`${EMOJI.BULLET} | أطلق القناص رصاصته على <@${target.id}> لكنه كان **مواطناً صالحاً**! يموت القناص وهدفه معاً.`);
        players = players.filter(p => p.id !== target.id && p.id !== sniper.id);
      }
      collector.stop();
      resolve();
    });

    collector.on("end", async () => {
      const disabled = await disableButtons(buttons);
      try {
        const webhook = new InteractionWebhook(context.client, sniper.msgInfo.applicationId, sniper.msgInfo.interactionToken);
        await webhook.editMessage(sniper.msgInfo.messageId, { components: disabled, content: `${EMOJI.SNIPER} | انتهى وقت القناص` });
      } catch (error) {}

      if (sniper.takeVote === false && sniper.hasBullet) {
        // لم يختر أي شيء -> طرد
        players = players.filter(p => p.id !== sniper.id);
        await context.channel.send(`${EMOJI.KICK} | <@${sniper.id}> لم يصوت في جولة القناص → تم طرده من اللعبة!`);
      }
      resolve();
    });
  });
}

// ======================== جولة التصويت العام (المواطنين) ========================
async function citizenRound(context, players, silencedId) {
  if (players.length === 0) return { topVotedPlayers: null, players };

  // استبعاد المسكت من التصويت
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

      // إنهاء فوري إذا صوت جميع المؤهلين
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

  // إعادة تعيين التصويت
  players.forEach(p => { p.voteCount = 0; p.takeVote = false; p.silenced = false; });

  // 1. جولة المافيا (قتل + إسكات)
  let { topVotedPlayers: killTarget, players: afterMafia, silencedId } = await mafiaRound(context, players, callback);
  players = afterMafia;

  // معالجة فوز المواطنين بسبب عدم تصويت المافيا
  if (killTarget === "citizens_win") {
    // تم استدعاء checkWin مسبقاً داخل mafiaRound، هنا ننهي فقط
    resetGameData();
    callback(null, false, 0, "Citizens win!");
    return;
  }

  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  // 2. جولة الطبيب
  let savedPlayer = null;
  if (killTarget) {
    players.forEach(p => { p.voteCount = 0; p.takeVote = false; });
    const { savedPlayer: saved, players: updated } = await doctorRound(context, players);
    savedPlayer = saved;
    players = updated;
    if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

    if (savedPlayer && killTarget.id === savedPlayer.id) {
      await context.channel.send(`${EMOJI.PROTECT} | لقد نجح الطبيب في حماية <@${savedPlayer.id}> من الاغتيال!`);
    } else {
      const roleName = ROLE_NAMES[killTarget.role] || 'مواطن';
      await context.channel.send(`${EMOJI.KILL} | لقد قتلت المافيا <@${killTarget.id}> وكان **${roleName}**`);
      players = players.filter(p => p.id !== killTarget.id);
      if ((await checkWin(context, players, AllPlayers, callback)) === true) return;
    }
  }

  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  // 3. جولة المحقق
  await investigatorRound(context, players);
  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  // 4. جولة القناص
  await sniperRound(context, players);
  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  // 5. جولة التصويت العام (مع مراعاة الإسكات)
  players.forEach(p => { p.voteCount = 0; p.takeVote = false; });
  const { players: afterKick } = await citizenRound(context, players, silencedId);
  players = afterKick;

  if ((await checkWin(context, players, AllPlayers, callback)) === true) return;

  await context.channel.send(`--- ${EMOJI.NIGHT} تبدأ جولة جديدة ${EMOJI.NIGHT} ---`);
  await sleep(3000);
  await gameRound(context, players, AllPlayers, callback);
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

// ======================== التحقق من الفوز ========================
async function checkWin(context, players, AllPlayers, callback) {
  const mafiaAlive = players.filter(p => p.role && p.role.startsWith('mafia_'));
  const citizensAlive = players.filter(p => p.role && !p.role.startsWith('mafia_'));

  const allMafia = AllPlayers.filter(p => p.role && p.role.startsWith('mafia_'));
  const allCitizens = AllPlayers.filter(p => p.role && !p.role.startsWith('mafia_'));

  if (mafiaAlive.length >= citizensAlive.length && citizensAlive.length > 0) {
    // فوز المافيا
    const winMsg = `# ${EMOJI.MAFIA} فوز المافيا!\n${allMafia.map(p => `- <@${p.id}> ${ROLE_EMOJI[p.role] || EMOJI.MAFIA} ${ROLE_NAMES[p.role]}`).join('\n')}\n\nجميع الفائزين حصلوا على 10 نقاط.`;
    if (USE_GAME_IMAGES) {
      try {
        await context.channel.send({ content: winMsg, files: [await drawGame(context, AllPlayers, "end", "mafia")] });
      } catch(e) {
        await context.channel.send(winMsg);
      }
    } else {
      await context.channel.send(winMsg);
    }
    // إضافة النقاط للفائزين بصمت
    await Promise.all(allMafia.map(p => win(p.id, context)));
    resetGameData();
    callback(null, false, 0, "Mafia win!");
    return true;
  }

  if (mafiaAlive.length === 0) {
    // فوز المواطنين
    const winMsg = `# ${EMOJI.CITIZEN} فوز المواطنين!\n${allCitizens.map(p => `- <@${p.id}> ${ROLE_EMOJI[p.role] || EMOJI.CITIZEN} ${ROLE_NAMES[p.role]}`).join('\n')}\n\nجميع الفائزين حصلوا على 10 نقاط.`;
    if (USE_GAME_IMAGES) {
      try {
        await context.channel.send({ content: winMsg, files: [await drawGame(context, AllPlayers, "end", "citizen")] });
      } catch(e) {
        await context.channel.send(winMsg);
      }
    } else {
      await context.channel.send(winMsg);
    }
    await Promise.all(allCitizens.map(p => win(p.id, context)));
    resetGameData();
    callback(null, false, 0, "Citizen win!");
    return true;
  }

  return false;
}

// ======================== دالة الرسم (محفوظة للاستخدام المستقبلي) ========================
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