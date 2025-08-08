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
🏆 *ДОБРО ПОЖАЛОВАТЬ В MAGNUM TAP* 🏆
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💎 *ЭКСКЛЮЗИВНАЯ ПЛАТФОРМА* 💎
🌟 Зарабатывайте звёзды премиум-класса
🎯 Выполняйте VIP-задания  
👑 Становитесь элитой MagnumTap

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 *Ваш баланс:* \`${balance} ⭐\` звёзд
👥 *Приглашено:* \`${invited}\` VIP-друзей
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 *Выберите действие и станьте легендой!* 🔥`;
}

// Ежедневные задания с VIP дизайном
const dailyTasks = [
  { id: 'login', name: '👑 VIP Визит', reward: 5, description: '🌟 Зайдите в элитный бот!' },
  { id: 'bonus', name: '💎 Премиум Бонус', reward: 10, description: '🎁 Получите эксклюзивный бонус' },
  { id: 'invite', name: '🔥 Элитное Приглашение', reward: 20, description: '👥 Пригласите VIP-друга' }
];

// Задания от спонсора с VIP дизайном
const sponsorTasks = [
  { id: 'channel1', name: '💎 Эксклюзивная Подписка', reward: 15, description: '📢 Подпишитесь на партнёрский канал', url: 'https://t.me/example' },
  { id: 'website', name: '🌟 Премиум Визит', reward: 25, description: '🔗 Посетите VIP-сайт партнёра', url: 'https://example.com' }
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
  const adminRow = isAdmin(ctx.from.id) ? [[Markup.button.callback('⚙️ АДМИН-ЦЕНТР', 'admin_panel')]] : [];
  return {
    text: getWelcomeText(balance, invited),
    extra: {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⭐ ФАРМ ЗВЁЗД', 'farm'), Markup.button.callback('🎁 VIP БОНУС', 'bonus')],
        [Markup.button.callback('👑 МОЙ ПРОФИЛЬ', 'profile'), Markup.button.callback('🏆 ЭЛИТНЫЙ ТОП', 'top')],
        [Markup.button.callback('💎 ПРИГЛАСИТЬ VIP', 'invite'), Markup.button.callback('🎫 ПРОМОКОД', 'promo')],
        [Markup.button.callback('📋 ЕЖЕДНЕВНЫЕ КВЕСТЫ', 'daily_tasks'), Markup.button.callback('🎯 СПОНСОР ЗАДАНИЯ', 'sponsor_tasks')],
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
  const adminRow = isAdmin(ctx.from.id) ? [[Markup.button.callback('⚙️ АДМИН-ЦЕНТР', 'admin_panel')]] : [];
  ctx.reply(
    getWelcomeText(balance, invited),
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⭐ ФАРМ ЗВЁЗД', 'farm'), Markup.button.callback('🎁 VIP БОНУС', 'bonus')],
        [Markup.button.callback('👑 МОЙ ПРОФИЛЬ', 'profile'), Markup.button.callback('🏆 ЭЛИТНЫЙ ТОП', 'top')],
        [Markup.button.callback('💎 ПРИГЛАСИТЬ VIP', 'invite'), Markup.button.callback('🎫 ПРОМОКОД', 'promo')],
        [Markup.button.callback('📋 ЕЖЕДНЕВНЫЕ КВЕСТЫ', 'daily_tasks'), Markup.button.callback('🎯 СПОНСОР ЗАДАНИЯ', 'sponsor_tasks')],
        ...adminRow
      ])
    }
  );
});

bot.action('profile', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const profileText = `
👑 *ВАШ VIP ПРОФИЛЬ* 👑
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💎 *Статус:* Элитный пользователь
⭐ *Баланс:* \`${user.stars || 0}\` звёзд
👥 *Приглашено VIP:* \`${user.invited || 0}\` друзей
📅 *Дата регистрации:* ${new Date(user.created * 1000).toLocaleDateString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 *Продолжайте зарабатывать и становитесь легендой!*`;

  ctx.editMessageText(profileText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('❓ FAQ & ПОМОЩЬ', 'faq')],
      [Markup.button.callback('🏠 ГЛАВНОЕ МЕНЮ', 'main_menu')]
    ])
  });
});

bot.action('top', async (ctx) => {
  const topUsers = await users.find({}).sort({ stars: -1 }).limit(10).toArray();
  let topText = `
🏆 *ЭЛИТНЫЙ РЕЙТИНГ* 🏆
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💎 *ТОП-10 VIP ИГРОКОВ* 💎

`;

  topUsers.forEach((user, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔸';
    const username = user.username ? `@${user.username}` : `ID${user.id}`;
    topText += `${medal} \`${index + 1}.\` ${username} — \`${user.stars || 0}\` ⭐\n`;
  });

  topText += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔥 *Станьте частью элиты!*`;

  ctx.editMessageText(topText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🏠 ГЛАВНОЕ МЕНЮ', 'main_menu')]])
  });
});

bot.action('invite', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const refLink = `https://t.me/${ctx.me}?start=${ctx.from.id}`;
  const inviteText = `
💎 *VIP ПРИГЛАШЕНИЯ* 💎
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 *Приглашайте друзей в элитный клуб!*
🌟 За каждого друга: \`+5\` звёзд
👑 Ваши друзья получают стартовый бонус

🔗 *Ваша эксклюзивная ссылка:*
\`${refLink}\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 *Приглашено VIP-друзей:* \`${user.invited || 0}\`
💰 *Заработано с рефералов:* \`${(user.invited || 0) * 5}\` ⭐`;

  ctx.editMessageText(inviteText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🏠 ГЛАВНОЕ МЕНЮ', 'main_menu')]])
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
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа', { show_alert: true });
  const adminText = `
⚙️ *ЦЕНТР УПРАВЛЕНИЯ VIP* ⚙️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👑 *Добро пожаловать, Администратор!*
🔥 Управляйте элитной платформой

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 *Выберите действие:*`;

  ctx.editMessageText(adminText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📢 VIP РАССЫЛКА', 'admin_broadcast')],
      [Markup.button.callback('🎫 СОЗДАТЬ ПРОМОКОД', 'admin_addpromo')],
      [Markup.button.callback('📊 СТАТИСТИКА', 'admin_stats')],
      [Markup.button.callback('⭐ УПРАВЛЕНИЕ ЗВЁЗДАМИ', 'admin_stars')],
      [Markup.button.callback('👥 РЕФЕРАЛЫ ПОЛЬЗОВАТЕЛЯ', 'admin_refs')],
      [Markup.button.callback('🏠 ГЛАВНОЕ МЕНЮ', 'main_menu')]
    ])
  });
});

bot.action('admin_cancel', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) {}
  ctx.answerCbQuery();
  const adminText = `
⚙️ *ЦЕНТР УПРАВЛЕНИЯ VIP* ⚙️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👑 *Добро пожаловать, Администратор!*
🔥 Управляйте элитной платформой

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 *Выберите действие:*`;

  ctx.editMessageText(adminText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📢 VIP РАССЫЛКА', 'admin_broadcast')],
      [Markup.button.callback('🎫 СОЗДАТЬ ПРОМОКОД', 'admin_addpromo')],
      [Markup.button.callback('📊 СТАТИСТИКА', 'admin_stats')],
      [Markup.button.callback('⭐ УПРАВЛЕНИЕ ЗВЁЗДАМИ', 'admin_stars')],
      [Markup.button.callback('👥 РЕФЕРАЛЫ ПОЛЬЗОВАТЕЛЯ', 'admin_refs')],
      [Markup.button.callback('🏠 ГЛАВНОЕ МЕНЮ', 'main_menu')]
    ])
  );
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
📋 *ЕЖЕДНЕВНЫЕ VIP КВЕСТЫ* 📋
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 *Выполняйте задания и получайте награды!*

`;
  
  dailyTasks.forEach(task => {
    const completed = userTasks.completed[task.id];
    const claimed = userTasks.claimed[task.id];
    const status = claimed ? '✅ ПОЛУЧЕНО' : completed ? '🎁 ЗАБРАТЬ' : '⏳ ВЫПОЛНИТЬ';
    msg += `${status} ${task.name} \`+${task.reward}\` ⭐\n${task.description}\n\n`;
  });
  
  const buttons = [];
  dailyTasks.forEach(task => {
    const completed = userTasks.completed[task.id];
    const claimed = userTasks.claimed[task.id];
    if (completed && !claimed) {
      buttons.push([Markup.button.callback(`🎁 ${task.name}`, `claim_daily_${task.id}`)]);
    }
  });
  
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n💎 *Возвращайтесь завтра за новыми квестами!*`;
  buttons.push([Markup.button.callback('🏠 ГЛАВНОЕ МЕНЮ', 'main_menu')]);
  
  ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action('sponsor_tasks', async (ctx) => {
  const userTasks = await getUserTasks(ctx.from.id, false);
  let msg = `
🎯 *ЭКСКЛЮЗИВНЫЕ СПОНСОР ЗАДАНИЯ* 🎯
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💎 *Партнёрские задания с премиум наградами!*

`;
  
  const buttons = [];
  sponsorTasks.forEach(task => {
    const completed = userTasks.completed[task.id];
    const claimed = userTasks.claimed[task.id];
    const status = claimed ? '✅ ПОЛУЧЕНО' : completed ? '🎁 ЗАБРАТЬ' : '⏳ ВЫПОЛНИТЬ';
    msg += `${status} ${task.name} \`+${task.reward}\` ⭐\n${task.description}\n\n`;
    
    if (!completed) {
      buttons.push([
        Markup.button.url('🔗 ПЕРЕЙТИ', task.url),
        Markup.button.callback('✅ ПРОВЕРИТЬ', `check_sponsor_${task.id}`)
      ]);
    } else if (!claimed) {
      buttons.push([Markup.button.callback(`🎁 ${task.name}`, `claim_sponsor_${task.id}`)]);
    }
  });
  
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔥 *Больше заданий скоро появится!*`;
  buttons.push([Markup.button.callback('🏠 ГЛАВНОЕ МЕНЮ', 'main_menu')]);
  
  ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action('faq', async (ctx) => {
  const faqText = `
❓ *VIP ПОМОЩЬ И FAQ* ❓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 *Как зарабатывать звёзды?*
⭐ Фармите каждую минуту
🎁 Получайте ежедневный бонус
📋 Выполняйте квесты
👥 Приглашайте друзей

💎 *Что такое VIP статус?*
Все пользователи MagnumTap — элита!

🎯 *Как выполнять задания?*
Нажимайте на задания и следуйте инструкциям

🎫 *Где взять промокоды?*
Следите за нашими анонсами и партнёрами

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👑 *Станьте легендой MagnumTap!*`;

  ctx.editMessageText(faqText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🏠 ГЛАВНОЕ МЕНЮ', 'main_menu')]])
  });
});

// Обновляем уведомления фарма и бонуса
bot.action('farm', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const canFarm = !user.lastFarm || (now() - user.lastFarm) >= 60;
  
  if (canFarm) {
    await users.updateOne({ id: ctx.from.id }, { 
      $inc: { stars: 1 }, 
      $set: { lastFarm: now() } 
    });
    ctx.answerCbQuery('💎 +1 VIP звезда получена! ⭐');
  } else {
    const timeLeft = 60 - (now() - user.lastFarm);
    ctx.answerCbQuery(`🔥 Фарм через ${timeLeft} сек. Элита ждёт!`);
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
    ctx.answerCbQuery('🎁 VIP бонус +10 звёзд! Элитно! 💎');
  } else {
    const hoursLeft = 24 - Math.floor((Date.now() % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    ctx.answerCbQuery(`👑 Следующий VIP бонус через ${hoursLeft}ч!`);
  }
});

// Обновляем уведомления заданий
bot.action(/^claim_daily_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const task = dailyTasks.find(t => t.id === taskId);
  if (!task) return;
  
  await tasks.updateOne(
    { userId: ctx.from.id, type: 'daily' },
    { $set: { [`claimed.${taskId}`]: true } }
  );
  await users.updateOne({ id: ctx.from.id }, { $inc: { stars: task.reward } });
  
  ctx.answerCbQuery(`🎁 VIP награда получена! +${task.reward} ⭐`);
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
  
  ctx.answerCbQuery(`💎 Премиум награда! +${task.reward} ⭐`);
  ctx.action('sponsor_tasks')(ctx);
});

bot.action(/^check_sponsor_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  await tasks.updateOne(
    { userId: ctx.from.id, type: 'sponsor' },
    { $set: { [`completed.${taskId}`]: true } }
  );
  
  ctx.answerCbQuery('✅ VIP задание выполнено! 🔥');
  ctx.action('sponsor_tasks')(ctx);
});

connectDB().then(() => {
  bot.launch();
  console.log('Бот запущен!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));