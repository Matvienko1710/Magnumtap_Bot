require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

if (!process.env.BOT_TOKEN) throw new Error('Не задан BOT_TOKEN!');
if (!process.env.MONGODB_URI) throw new Error('Не задан MONGODB_URI!');

const bot = new Telegraf(process.env.BOT_TOKEN);
const mongo = new MongoClient(process.env.MONGODB_URI);
let users, promocodes;

async function connectDB() {
  await mongo.connect();
  const db = mongo.db();
  users = db.collection('users');
  promocodes = db.collection('promocodes');
  tasks = db.collection('tasks'); // добавляем коллекцию заданий
}

function now() { return Math.floor(Date.now() / 1000); }

async function getUser(id) {
  let user = await users.findOne({ id });
  if (!user) {
    user = { id, stars: 0, lastFarm: 0, lastBonus: 0, invited: 0 };
    await users.insertOne(user);
  }
  return user;
}

const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
function isAdmin(userId) { return ADMIN_IDS.includes(String(userId)); }

function getWelcomeText(balance, invited) {
  return `
💫 ═══════════════════════════ 💫
🌟        𝗠𝗔𝗚𝗡𝗨𝗠 𝗧𝗔𝗣        🌟
💫 ═══════════════════════════ 💫

✨ 〈 𝙴𝚕𝚒𝚝𝚗𝚊𝚢 𝙸𝚐𝚛𝚘𝚟𝚊𝚢 𝙿𝚕𝚊𝚝𝚏𝚘𝚛𝚖𝚊 〉 ✨

🎯 Зарабатывайте звёзды премиум-класса
👑 Выполняйте эксклюзивные задания  
🏆 Становитесь лидером элитного сообщества

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 💎 Баланс: *${balance}* ⭐ звёзд           ┃
┃ 👥 Друзей: *${invited}* приглашено        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

🚀 ⟪ 𝗩𝘆𝗯𝗲𝗿𝗶𝘁𝗲 𝗱𝗲𝗷𝘀𝘁𝘃𝗶𝗲 𝗶 𝗻𝗮𝗰𝗵𝗻𝗶𝘁𝗲 𝗽𝘂𝘁𝗲 𝗸 𝘀𝗹𝗮𝘃𝗲! ⟫ 🚀`;
}

// Ежедневные задания
const dailyTasks = [
  { id: 'login', name: '🌅 Утренний визит', reward: 5, description: '✨ Начните день с посещения бота' },
  { id: 'bonus', name: '🎁 Золотой бонус', reward: 10, description: '💎 Получите ежедневную награду' },
  { id: 'invite', name: '👫 Элитное приглашение', reward: 20, description: '🌟 Пригласите друга в наше сообщество' }
];

// Задания от спонсора
const sponsorTasks = [
  { id: 'channel1', name: '📺 Премиум подписка', reward: 15, description: '🔔 Присоединитесь к эксклюзивному каналу', url: 'https://t.me/example' },
  { id: 'website', name: '🌐 Веб-путешествие', reward: 25, description: '🚀 Исследуйте партнёрский сайт', url: 'https://example.com' }
];

async function getUserTasks(userId, isDaily = true) {
  const today = new Date().toDateString();
  let userTasks = await tasks.findOne({ 
    userId, 
    date: isDaily ? today : 'sponsor',
    type: isDaily ? 'daily' : 'sponsor'
  });
  
  if (!userTasks) {
    const taskList = isDaily ? dailyTasks : sponsorTasks;
    userTasks = {
      userId,
      date: isDaily ? today : 'sponsor',
      type: isDaily ? 'daily' : 'sponsor',
      completed: {},
      claimed: {}
    };
    taskList.forEach(task => {
      userTasks.completed[task.id] = false;
      userTasks.claimed[task.id] = false;
    });
    await tasks.insertOne(userTasks);
  }
  return userTasks;
}

function getMainMenu(ctx, balance, invited) {
  const adminRow = isAdmin(ctx.from.id) ? [[Markup.button.callback('⚙️ 𝗔𝗱𝗺𝗶𝗻-𝗣𝗮𝗻𝗲𝗹', 'admin_panel')]] : [];
  return {
    text: getWelcomeText(balance, invited),
    extra: {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⭐ 𝗙𝗮𝗿𝗺 𝗭𝘃ё𝘇𝗱', 'farm'), Markup.button.callback('🎁 𝗕𝗼𝗻𝘂𝘀', 'bonus')],
        [Markup.button.callback('👤 𝗣𝗿𝗼𝗳𝗶𝗹𝘆', 'profile'), Markup.button.callback('🏆 𝗧𝗼𝗽', 'top')],
        [Markup.button.callback('🤝 𝗣𝗿𝗶𝗴𝗹𝗮𝘀𝗶𝘁𝘆', 'invite'), Markup.button.callback('🎫 𝗣𝗿𝗼𝗺𝗼𝗸𝗼𝗱', 'promo')],
        [Markup.button.callback('📋 𝗗𝗻𝗲𝘃𝗻𝘆𝗲 𝗤𝘂𝗲𝘀𝘁𝘆', 'daily_tasks'), Markup.button.callback('🎯 𝗦𝗽𝗼𝗻𝘀𝗼𝗿 𝗭𝗮𝗱𝗮𝗻𝗶𝘆𝗮', 'sponsor_tasks')],
        ...adminRow
      ])
    }
  };
}

bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id);
  const balance = user.stars || 0;
  const invited = user.invited || 0;
  const menu = getMainMenu(ctx, balance, invited);
  await ctx.reply(menu.text, menu.extra);
});

bot.action('main_menu', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) {}
  const user = await getUser(ctx.from.id);
  const balance = user.stars || 0;
  const invited = user.invited || 0;
  const adminRow = isAdmin(ctx.from.id) ? [[Markup.button.callback('⚙️ 𝗔𝗱𝗺𝗶𝗻-𝗣𝗮𝗻𝗲𝗹', 'admin_panel')]] : [];
  ctx.reply(
    getWelcomeText(balance, invited),
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⭐ 𝗙𝗮𝗿𝗺 𝗭𝘃ё𝘇𝗱', 'farm'), Markup.button.callback('🎁 𝗕𝗼𝗻𝘂𝘀', 'bonus')],
        [Markup.button.callback('👤 𝗣𝗿𝗼𝗳𝗶𝗹𝘆', 'profile'), Markup.button.callback('🏆 𝗧𝗼𝗽', 'top')],
        [Markup.button.callback('🤝 𝗣𝗿𝗶𝗴𝗹𝗮𝘀𝗶𝘁𝘆', 'invite'), Markup.button.callback('🎫 𝗣𝗿𝗼𝗺𝗼𝗸𝗼𝗱', 'promo')],
        [Markup.button.callback('📋 𝗗𝗻𝗲𝘃𝗻𝘆𝗲 𝗤𝘂𝗲𝘀𝘁𝘆', 'daily_tasks'), Markup.button.callback('🎯 𝗦𝗽𝗼𝗻𝘀𝗼𝗿 𝗭𝗮𝗱𝗮𝗻𝗶𝘆𝗮', 'sponsor_tasks')],
        ...adminRow
      ])
    }
  );
});

bot.action('profile', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const profileText = `
🎭 ═══════════════════════════ 🎭
👤     𝗩𝗔𝗦̆ 𝗘́𝗟𝗜𝗧𝗡𝗬𝗝 𝗣𝗥𝗢𝗙𝗜𝗟𝗬     👤
🎭 ═══════════════════════════ 🎭

💫 〈 𝙰𝚔𝚝𝚒𝚟𝚗𝚢𝚓 𝙼𝚊𝚜𝚝𝚎𝚛 𝙸𝚐𝚛𝚢 〉 💫

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ⭐ Баланс: *${user.stars || 0}* звёзд        ┃
┃ 👥 Команда: *${user.invited || 0}* друзей      ┃
┃ 📅 С нами: ${new Date(user.created * 1000).toLocaleDateString()}          ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

🌟 ⟪ 𝗣𝗿𝗼𝗱𝗼𝗹𝗷𝗮𝗷𝘁𝗲 𝗶𝗴𝗿𝗮𝘁𝘆 𝗶 𝘀𝘁𝗮𝗻𝗼𝘃𝗶𝘁𝗲𝘀𝘆 𝗹𝗲𝗴𝗲𝗻𝗱𝗼𝗷! ⟫ 🌟`;

  ctx.editMessageText(profileText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('❓ 𝗙𝗔𝗤 & 𝗣𝗼𝗺𝗼𝘀̧𝘩𝘆', 'faq')],
      [Markup.button.callback('🏠 𝗚𝗹𝗮𝘃𝗻𝗼𝗲 𝗠𝗲𝗻𝘆', 'main_menu')]
    ])
  });
});

bot.action('top', async (ctx) => {
  const topUsers = await users.find({}).sort({ stars: -1 }).limit(10).toArray();
  let topText = `
🏆 ═══════════════════════════ 🏆
👑      𝗘́𝗟𝗜𝗧𝗡𝗬𝗝 𝗥𝗘𝗝𝗧𝗜𝗡𝗚      👑
🏆 ═══════════════════════════ 🏆

✨ 〈 𝚃𝚘𝚙-𝟷𝟶 𝙼𝚊𝚜𝚝𝚎𝚛𝚘𝚟 𝙸𝚐𝚛𝚢 〉 ✨

`;

  topUsers.forEach((user, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '💎';
    const username = user.username ? `@${user.username}` : `ID${user.id}`;
    topText += `${medal} *${index + 1}.* ${username} — *${user.stars || 0}* ⭐\n`;
  });

  topText += `\n🌟 ⟪ 𝗦𝘁𝗮𝗻𝘆𝘁𝗲 𝗰̧𝗮𝘀𝘁𝘆𝘆 𝗲́𝗹𝗶𝘁𝘆! ⟫ 🌟`;

  ctx.editMessageText(topText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🏠 𝗚𝗹𝗮𝘃𝗻𝗼𝗲 𝗠𝗲𝗻𝘆', 'main_menu')]])
  });
});

bot.action('invite', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const refLink = `https://t.me/${ctx.me}?start=${ctx.from.id}`;
  const inviteText = `
🤝 ═══════════════════════════ 🤝
👥     𝗥𝗘𝗙𝗘𝗥𝗔𝗟𝗬𝗡𝗔𝗬 𝗦𝗜𝗦𝗧𝗘𝗠𝗔     👥
🤝 ═══════════════════════════ 🤝

💫 〈 𝙴𝚔𝚜𝚔𝚕𝚞𝚣𝚒𝚟𝚗𝚊𝚢 𝙿𝚛𝚘𝚐𝚛𝚊𝚖𝚖𝚊 〉 💫

🌟 Приглашайте друзей в элитный клуб!
💎 За каждого друга: *+5* звёзд
🎁 Ваши друзья получают стартовый бонус

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 🔗 Ваша эксклюзивная ссылка:       ┃
┃ \`${refLink}\`                     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

📊 ⟪ 𝗦𝘁𝗮𝘁𝗶𝘀𝘁𝗶𝗸𝗮 ⟫
👥 Приглашено: *${user.invited || 0}* элитных друзей
💰 Заработано: *${(user.invited || 0) * 5}* ⭐ с рефералов`;

  ctx.editMessageText(inviteText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🏠 𝗚𝗹𝗮𝘃𝗻𝗼𝗲 𝗠𝗲𝗻𝘆', 'main_menu')]])
  });
});

// Промокоды (минималистично, если не нужны — удалить этот блок)
const promoCodes = { 'MAGNUM10': 10, 'STAR50': 50 };
const userPromoUsed = {};
bot.action('promo', async (ctx) => {
  await ctx.reply('🎫 Введите промокод одним сообщением:', { reply_markup: { force_reply: true } });
});
bot.on('text', async (ctx) => {
  if (ctx.message.reply_to_message && ctx.message.reply_to_message.text.includes('Введите промокод')) {
    const code = ctx.message.text.trim().toUpperCase();
    const userId = ctx.from.id;
    if (userPromoUsed[userId + ':' + code]) {
      return ctx.reply('❗ Вы уже использовали этот промокод.', Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
    }
    if (promoCodes[code]) {
      await users.updateOne({ id: userId }, { $inc: { stars: promoCodes[code] } });
      userPromoUsed[userId + ':' + code] = true;
      return ctx.reply(`✅ Промокод активирован! Вы получили ${promoCodes[code]} звёзд.`, Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
    } else {
      return ctx.reply('❌ Неверный промокод.', Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
    }
  }
});

bot.action('admin_panel', async (ctx) => {
  const adminText = `
⚙️ ═══════════════════════════ ⚙️
👑     𝗖𝗘𝗡𝗧𝗥 𝗨𝗣𝗥𝗔𝗩𝗟𝗘𝗡𝗜𝗬𝗔     👑
⚙️ ═══════════════════════════ ⚙️

✨ 〈 𝙰𝚍𝚖𝚒𝚗𝚒𝚜𝚝𝚛𝚊𝚝𝚒𝚟𝚗𝚊𝚢 𝚉𝚘𝚗𝚊 〉 ✨

💫 Добро пожаловать, Мастер Системы!

🌟 ⟪ 𝗩𝘆𝗯𝗲𝗿𝗶𝘁𝗲 𝗱𝗲𝗷𝘀𝘁𝘃𝗶𝗲: ⟫`;

  ctx.editMessageText(adminText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📢 𝗥𝗮𝘀𝘀𝘆𝗹𝗸𝗮', 'admin_broadcast')],
      [Markup.button.callback('🎫 𝗖𝗼𝘇𝗱𝗮𝘁𝘆 𝗣𝗿𝗼𝗺𝗼', 'admin_addpromo')],
      [Markup.button.callback('📊 𝗔𝗻𝗮𝗹𝗶𝘁𝗶𝗸𝗮', 'admin_stats')],
      [Markup.button.callback('⭐ 𝗨𝗽𝗿𝗮𝘃𝗹𝗲𝗻𝗶𝗲 𝗭𝘃ё𝘇𝗱', 'admin_stars')],
      [Markup.button.callback('👥 𝗥𝗲𝗳𝗲𝗿𝗮𝗹𝗼𝘃', 'admin_refs')],
      [Markup.button.callback('🏠 𝗚𝗹𝗮𝘃𝗻𝗼𝗲 𝗠𝗲𝗻𝘆', 'main_menu')]
    ])
  });
});

bot.action('admin_cancel', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) {}
  ctx.answerCbQuery();
  const adminText = `
⚙️ ═══════════════════════════ ⚙️
👑     𝗖𝗘𝗡𝗧𝗥 𝗨𝗣𝗥𝗔𝗩𝗟𝗘𝗡𝗜𝗬𝗔     👑
⚙️ ═══════════════════════════ ⚙️

✨ 〈 𝙰𝚍𝚖𝚒𝚗𝚒𝚜𝚝𝚛𝚊𝚝𝚒𝚟𝚗𝚊𝚢 𝚉𝚘𝚗𝚊 〉 ✨

💫 Добро пожаловать, Мастер Системы!

🌟 ⟪ 𝗩𝘆𝗯𝗲𝗿𝗶𝘁𝗲 𝗱𝗲𝗷𝘀𝘁𝘃𝗶𝗲: ⟫`;

  ctx.reply(adminText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📢 𝗥𝗮𝘀𝘀𝘆𝗹𝗸𝗮', 'admin_broadcast')],
      [Markup.button.callback('🎫 𝗖𝗼𝘇𝗱𝗮𝘁𝘆 𝗣𝗿𝗼𝗺𝗼', 'admin_addpromo')],
      [Markup.button.callback('📊 𝗔𝗻𝗮𝗹𝗶𝘁𝗶𝗸𝗮', 'admin_stats')],
      [Markup.button.callback('⭐ 𝗨𝗽𝗿𝗮𝘃𝗹𝗲𝗻𝗶𝗲 𝗭𝘃ё𝘇𝗱', 'admin_stars')],
      [Markup.button.callback('👥 𝗥𝗲𝗳𝗲𝗿𝗮𝗹𝗼𝘃', 'admin_refs')],
      [Markup.button.callback('🏠 𝗚𝗹𝗮𝘃𝗻𝗼𝗲 𝗠𝗲𝗻𝘆', 'main_menu')]
    ])
  });
});

// Рассылка
bot.action('admin_broadcast', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await adminForceReply(ctx, '📢 Введите текст для рассылки:');
});

// Добавить промокод
bot.action('admin_addpromo', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await adminForceReply(ctx, '➕ Введите промокод и количество звёзд через пробел (например: NEWCODE 25):');
});

// Статистика
bot.action('admin_stats', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const totalUsers = await users.countDocuments();
  const totalStars = await users.aggregate([{ $group: { _id: null, sum: { $sum: "$stars" } } }]).toArray();
  const totalInvited = await users.aggregate([{ $group: { _id: null, sum: { $sum: "$invited" } } }]).toArray();
  ctx.editMessageText(
    `📊 Статистика бота\n\n` +
    `👥 Пользователей: ${totalUsers}\n` +
    `💫 Всего звёзд: ${totalStars[0]?.sum || 0}\n` +
    `🤝 Всего приглашений: ${totalInvited[0]?.sum || 0}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Главное меню', 'main_menu'), Markup.button.callback('❌ Отмена', 'admin_panel')]
    ])
  );
});

// Выдать/забрать звёзды
bot.action('admin_stars', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await adminForceReply(ctx, '⭐ Введите ID пользователя и количество звёзд через пробел (например: 123456789 10 или 123456789 -5):');
});

// Рефералы пользователя
bot.action('admin_refs', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await adminForceReply(ctx, '👥 Введите ID пользователя для просмотра его рефералов:');
});

// Обновлённые force_reply для админки с кнопками и удалением по отмене
function adminForceReply(ctx, text) {
  return ctx.reply(text, {
    reply_markup: {
      force_reply: true,
      inline_keyboard: [[
        { text: '🏠 Главное меню', callback_data: 'main_menu' },
        { text: '❌ Отмена', callback_data: 'admin_cancel' }
      ]]
    }
  });
}

bot.on('text', async (ctx) => {
  if (!isAdmin(ctx.from.id) || !ctx.message.reply_to_message) return;
  const replyText = ctx.message.reply_to_message.text;
  const adminButtons = Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Главное меню', 'main_menu'), Markup.button.callback('❌ Отмена', 'admin_panel')]
  ]);
  // Рассылка
  if (replyText.includes('текст для рассылки')) {
    const text = ctx.message.text;
    const allUsers = await users.find().toArray();
    let sent = 0;
    for (const u of allUsers) {
      try { await ctx.telegram.sendMessage(u.id, `📢 Сообщение от администрации:\n\n${text}`); sent++; } catch {}
    }
    return ctx.reply(`✅ Рассылка завершена. Доставлено: ${sent} пользователям.`, adminButtons);
  }
  // Промокод
  if (replyText.includes('Введите промокод и количество звёзд')) {
    const [code, stars] = ctx.message.text.trim().split(/\s+/);
    if (!code || isNaN(Number(stars))) return ctx.reply('❌ Формат: КОД 10', adminButtons);
    promoCodes[code.toUpperCase()] = Number(stars);
    return ctx.reply(`✅ Промокод ${code.toUpperCase()} на ${stars} звёзд добавлен.`, adminButtons);
  }
  // Выдать/забрать звёзды
  if (replyText.includes('ID пользователя и количество звёзд')) {
    const [id, stars] = ctx.message.text.trim().split(/\s+/);
    if (!id || isNaN(Number(stars))) return ctx.reply('❌ Формат: ID 10', adminButtons);
    await users.updateOne({ id: Number(id) }, { $inc: { stars: Number(stars) } });
    return ctx.reply(`✅ Пользователю ${id} выдано/забрано ${stars} звёзд.`, adminButtons);
  }
  // Рефералы пользователя
  if (replyText.includes('для просмотра его рефералов')) {
    const id = ctx.message.text.trim();
    const refs = await users.find({ invitedBy: id }).toArray();
    if (!refs.length) return ctx.reply('У пользователя нет рефералов.', adminButtons);
    let msg = `👥 Рефералы пользователя ${id}:\n\n`;
    refs.forEach((u, i) => { msg += `${i + 1}. ${u.id}\n`; });
    return ctx.reply(msg, adminButtons);
  }
});

bot.action('daily_tasks', async (ctx) => {
  const userTasks = await getUserTasks(ctx.from.id, true);
  let msg = `
📋 ═══════════════════════════ 📋
🌟     𝗘́𝗝𝗘𝗗𝗡𝗘𝗩𝗡𝗬𝗘 𝗤𝗨𝗘𝗦𝗧𝗬     🌟
📋 ═══════════════════════════ 📋

✨ 〈 𝚅𝚢𝚙𝚘𝚕𝚗𝚢𝚊𝚢𝚝𝚎 𝚒 𝙿𝚘𝚕𝚞𝚌̧𝚊𝚢𝚝𝚎 𝙽𝚊𝚐𝚛𝚊𝚍𝚢! 〉 ✨

`;
  
  dailyTasks.forEach(task => {
    const completed = userTasks.completed[task.id];
    const claimed = userTasks.claimed[task.id];
    const status = claimed ? '✅ 𝗣𝗼𝗹𝘂𝗰̧𝗲𝗻𝗼' : completed ? '🎁 𝗭𝗮𝗯𝗿𝗮𝘁𝘆' : '⏳ 𝗩𝘆𝗽𝗼𝗹𝗻𝗶𝘁𝘆';
    msg += `${status} *${task.name}* (+${task.reward} ⭐)\n${task.description}\n\n`;
  });
  
  const buttons = [];
  dailyTasks.forEach(task => {
    const completed = userTasks.completed[task.id];
    const claimed = userTasks.claimed[task.id];
    if (completed && !claimed) {
      buttons.push([Markup.button.callback(`🎁 ${task.name}`, `claim_daily_${task.id}`)]);
    }
  });
  
  msg += `💫 ⟪ 𝗩𝗼𝘇𝘃𝗿𝗮𝘀̧𝗮𝗷𝘁𝗲𝘀𝘆 𝘇𝗮𝘃𝘁𝗿𝗮 𝘇𝗮 𝗻𝗼𝘃𝗶𝗺𝗶 𝗶𝘀𝗽𝘆𝘁𝗮𝗻𝗶𝗲𝗺𝗶! ⟫ 💫`;
  buttons.push([Markup.button.callback('🏠 𝗚𝗹𝗮𝘃𝗻𝗼𝗲 𝗠𝗲𝗻𝘆', 'main_menu')]);
  
  ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action('sponsor_tasks', async (ctx) => {
  const userTasks = await getUserTasks(ctx.from.id, false);
  let msg = `
🎯 ═══════════════════════════ 🎯
💎    𝗦𝗣𝗢𝗡𝗦𝗢𝗥 𝗭𝗔𝗗𝗔𝗡𝗜𝗬𝗔    💎
🎯 ═══════════════════════════ 🎯

✨ 〈 𝙿𝚊𝚛𝚝𝚗ё𝚛𝚜𝚔𝚒𝚎 𝙼𝚒𝚜𝚜𝚒𝚒 𝚜 𝙿𝚛𝚎𝚖𝚒𝚞𝚖 𝙽𝚊𝚐𝚛𝚊𝚍𝚊𝚖𝚒 〉 ✨

`;
  
  const buttons = [];
  sponsorTasks.forEach(task => {
    const completed = userTasks.completed[task.id];
    const claimed = userTasks.claimed[task.id];
    const status = claimed ? '✅ 𝗣𝗼𝗹𝘂𝗰̧𝗲𝗻𝗼' : completed ? '🎁 𝗭𝗮𝗯𝗿𝗮𝘁𝘆' : '⏳ 𝗩𝘆𝗽𝗼𝗹𝗻𝗶𝘁𝘆';
    msg += `${status} *${task.name}* (+${task.reward} ⭐)\n${task.description}\n\n`;
    
    if (!completed) {
      buttons.push([
        Markup.button.url('🔗 𝗣𝗲𝗿𝗲𝗷𝘁𝗶', task.url),
        Markup.button.callback('✅ 𝗣𝗿𝗼𝘃𝗲𝗿𝗶𝘁𝘆', `check_sponsor_${task.id}`)
      ]);
    } else if (!claimed) {
      buttons.push([Markup.button.callback(`🎁 ${task.name}`, `claim_sponsor_${task.id}`)]);
    }
  });
  
  msg += `🌟 ⟪ 𝗕𝗼𝗹𝘆𝘀̧𝗲 𝗲́𝗸𝘀𝗸𝗹𝘂𝘇𝗶𝘃𝗻𝘆𝗵 𝗺𝗶𝘀𝘀𝗶𝗷 𝘀𝗸𝗼𝗿𝗼! ⟫ 🌟`;
  buttons.push([Markup.button.callback('🏠 𝗚𝗹𝗮𝘃𝗻𝗼𝗲 𝗠𝗲𝗻𝘆', 'main_menu')]);
  
  ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action('faq', async (ctx) => {
  const faqText = `
❓ ═══════════════════════════ ❓
💫      𝗣𝗢𝗠𝗢𝗦̧𝗖̧ & 𝗙𝗔𝗤      💫
❓ ═══════════════════════════ ❓

✨ 〈 𝙲̧𝚊𝚜𝚝𝚘 𝚉𝚊𝚍𝚊𝚟𝚊𝚎𝚖𝚢𝚎 𝚅𝚘𝚙𝚛𝚘𝚜𝚢 〉 ✨

🌟 *Как зарабатывать звёзды?*
⭐ Фармите каждую минуту
🎁 Собирайте ежедневные сокровища
📋 Выполняйте эксклюзивные квесты
👥 Приглашайте элитных друзей

💫 *Что такое задания?*
Увлекательные миссии с премиум наградами

🎯 *Как выполнять задания?*
Следуйте интуитивным инструкциям в боте

🎫 *Где найти промокоды?*
Следите за анонсами и партнёрскими акциями

🌟 ⟪ 𝗜𝗴𝗿𝗮𝗷𝘁𝗲 𝗶 𝘀𝘁𝗮𝗻𝗼𝘃𝗶𝘁𝗲𝘀𝘆 𝗹𝗲𝗴𝗲𝗻𝗱𝗮𝗺𝗶! ⟫ 🌟`;

  ctx.editMessageText(faqText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🏠 𝗚𝗹𝗮𝘃𝗻𝗼𝗲 𝗠𝗲𝗻𝘆', 'main_menu')]])
  });
});

// Уведомления фарма и бонуса
bot.action('farm', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const canFarm = !user.lastFarm || (now() - user.lastFarm) >= 60;
  
  if (canFarm) {
    await users.updateOne({ id: ctx.from.id }, { 
      $inc: { stars: 1 }, 
      $set: { lastFarm: now() } 
    });
    ctx.answerCbQuery('✨ +1 элитная звезда добыта! ⭐');
  } else {
    const timeLeft = 60 - (now() - user.lastFarm);
    ctx.answerCbQuery(`⏳ Следующая добыча через ${timeLeft} сек.`);
  }
});

bot.action('bonus', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const today = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const canBonus = !user.lastBonus || user.lastBonus < today;
  
  if (canBonus) {
    await users.updateOne({ id: ctx.from.id }, { 
      $inc: { stars: 10 }, 
      $set: { lastBonus: today } 
    });
    ctx.answerCbQuery('🎁 Эксклюзивный бонус +10 звёзд! ✨');
  } else {
    const hoursLeft = 24 - Math.floor((Date.now() % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    ctx.answerCbQuery(`🕐 Следующее сокровище через ${hoursLeft}ч`);
  }
});

// Уведомления заданий
bot.action(/^claim_daily_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const task = dailyTasks.find(t => t.id === taskId);
  if (!task) return;
  
  await tasks.updateOne(
    { userId: ctx.from.id, type: 'daily' },
    { $set: { [`claimed.${taskId}`]: true } }
  );
  await users.updateOne({ id: ctx.from.id }, { $inc: { stars: task.reward } });
  
  ctx.answerCbQuery(`🎁 Элитная награда получена! +${task.reward} ⭐`);
  ctx.action('daily_tasks')(ctx);
});

bot.action(/^claim_sponsor_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const task = sponsorTasks.find(t => t.id === taskId);
  if (!task) return;
  
  await tasks.updateOne(
    { userId: ctx.from.id, type: 'sponsor' },
    { $set: { [`claimed.${taskId}`]: true } }
  );
  await users.updateOne({ id: ctx.from.id }, { $inc: { stars: task.reward } });
  
  ctx.answerCbQuery(`💎 Премиум награда добыта! +${task.reward} ⭐`);
  ctx.action('sponsor_tasks')(ctx);
});

bot.action(/^check_sponsor_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  await tasks.updateOne(
    { userId: ctx.from.id, type: 'sponsor' },
    { $set: { [`completed.${taskId}`]: true } }
  );
  
  ctx.answerCbQuery('✅ Эксклюзивная миссия завершена! 🌟');
  ctx.action('sponsor_tasks')(ctx);
});

connectDB().then(() => {
  bot.launch();
  console.log('Бот запущен!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));