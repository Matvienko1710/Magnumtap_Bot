require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

if (!process.env.BOT_TOKEN) {
  throw new Error('Не задан BOT_TOKEN в переменных окружения!');
}
if (!process.env.MONGODB_URI) {
  throw new Error('Не задан MONGODB_URI в переменных окружения!');
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const mongo = new MongoClient(process.env.MONGODB_URI);

let db, users;

async function connectDB() {
  await mongo.connect();
  db = mongo.db();
  users = db.collection('users');
}

function now() {
  return Math.floor(Date.now() / 1000);
}

async function getUser(id) {
  let user = await users.findOne({ id });
  if (!user) {
    user = { id, stars: 0, lastFarm: 0, lastBonus: 0 };
    await users.insertOne(user);
  }
  return user;
}

const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL;

async function checkSubscription(ctx) {
  if (!REQUIRED_CHANNEL) return true;
  try {
    const member = await ctx.telegram.getChatMember(REQUIRED_CHANNEL, ctx.from.id);
    if (["member", "administrator", "creator"].includes(member.status)) {
      return true;
    }
    // not subscribed
  } catch (e) {
    // channel not found or user not found
  }
  await ctx.reply(
    `❗ Для использования бота подпишитесь на канал!`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔗 Перейти в канал', url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` }
          ]
        ]
      }
    }
  );
  return false;
}

// Обёртка для всех action и команд
function withSubscription(handler) {
  return async (ctx, ...args) => {
    if (!(await checkSubscription(ctx))) return;
    return handler(ctx, ...args);
  };
}

const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean);

function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

function mainMenuKeyboard(userId) {
  const rows = [
    [
      Markup.button.callback('🌟 Фармить звёзды', 'farm'),
      Markup.button.callback('🎁 Бонус', 'bonus')
    ],
    [
      Markup.button.callback('👤 Профиль', 'profile'),
      Markup.button.callback('🏆 Топ', 'top')
    ],
    [
      Markup.button.callback('🤝 Пригласить друзей', 'invite'),
      Markup.button.callback('🎫 Ввести промокод', 'promo')
    ]
  ];
  if (isAdmin(userId)) {
    rows.push([Markup.button.callback('⚙️ Админ-панель', 'admin')]);
  }
  return Markup.inlineKeyboard(rows);
}

function mainMenuButton(userId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Главное меню', 'main_menu')],
    ...(isAdmin(userId) ? [[Markup.button.callback('⚙️ Админ-панель', 'admin')]] : [])
  ]);
}

// Применить withSubscription ко всем action и start
// Удаляем ошибочную перезапись методов bot.start, bot.action, bot.command
// Вместо этого оборачиваем каждый handler вручную:

bot.start(withSubscription(async (ctx) => {
  let ref = null;
  if (ctx.startPayload && ctx.startPayload !== String(ctx.from.id)) {
    ref = ctx.startPayload;
    const refUser = await getUser(ref);
    if (refUser && ref !== String(ctx.from.id)) {
      await users.updateOne({ id: ref }, { $inc: { invited: 1, stars: 5 } }); // 5 звёзд за приглашение
    }
  }
  const user = await getUser(ctx.from.id);
  const balance = user.stars || 0;
  const invited = user.invited || 0;
  return ctx.reply(
    `👋 Добро пожаловать в MagnumTapBot! 🌟\n\n` +
    `Ты в игре, где можно зарабатывать звёзды ✨, выполняя простые задания, приглашая друзей и собирая бонусы! 🚀\n\n` +
    `💫 Твой баланс: ${balance} звёзд\n` +
    `👥 Приглашено друзей: ${invited}\n\n` +
    `Выбери действие и стань звездой MagnumTapBot! 🌟\n` +
    `Подсказка: используй /help для справки по боту!`,
    mainMenuKeyboard(ctx.from.id)
  );
}));

bot.action('invite', withSubscription(async (ctx) => {
  const user = await getUser(ctx.from.id);
  const refLink = `https://t.me/${ctx.me}?start=${ctx.from.id}`;
  ctx.editMessageText(
    `🤝 Пригласить друзей\n\n` +
    `Отправь эту ссылку друзьям и получай звёзды за каждого, кто присоединится!\n\n` +
    `🔗 Твоя ссылка: ${refLink}\n\n` +
    `👥 Приглашено друзей: ${user.invited || 0}`,
    mainMenuButton(ctx.from.id)
  );
}));

bot.action('main_menu', withSubscription(async (ctx) => {
  const user = await getUser(ctx.from.id);
  const balance = user.stars || 0;
  const invited = user.invited || 0;
  ctx.editMessageText(
    `👋 Добро пожаловать в MagnumTapBot! 🌟\n\n` +
    `Ты в игре, где можно зарабатывать звёзды ✨, выполняя простые задания, приглашая друзей и собирая бонусы! 🚀\n\n` +
    `💫 Твой баланс: ${balance} звёзд\n` +
    `👥 Приглашено друзей: ${invited}\n\n` +
    `Выбери действие и стань звездой MagnumTapBot! 🌟\n` +
    `Подсказка: используй /help для справки по боту!`,
    mainMenuKeyboard(ctx.from.id)
  );
}));

bot.action('farm', withSubscription(async (ctx) => {
  const user = await getUser(ctx.from.id);
  const t = now();
  if (t - user.lastFarm < 60) {
    const wait = 60 - (t - user.lastFarm);
    return ctx.answerCbQuery(`⏳ До следующего фарма: ${wait} сек.`, { show_alert: true });
  }
  await users.updateOne({ id: ctx.from.id }, { $set: { lastFarm: t }, $inc: { stars: 1 } });
  ctx.answerCbQuery(`🌟 +1 звезда! Баланс: ${user.stars + 1}. Следующий фарм через 60 сек.`, { show_alert: true });
}));

bot.action('bonus', withSubscription(async (ctx) => {
  const user = await getUser(ctx.from.id);
  const t = now();
  if (t - user.lastBonus < 86400) {
    const hours = Math.floor((86400 - (t - user.lastBonus)) / 3600);
    const mins = Math.floor((86400 - (t - user.lastBonus)) % 3600 / 60);
    return ctx.answerCbQuery(`⏳ До следующего бонуса: ${hours}ч ${mins}м.`, { show_alert: true });
  }
  await users.updateOne({ id: ctx.from.id }, { $set: { lastBonus: t }, $inc: { stars: 50 } });
  ctx.answerCbQuery(`🎁 +50 звёзд! Баланс: ${user.stars + 50}. Следующий бонус через 24ч.`, { show_alert: true });
}));

bot.action('profile', withSubscription(async (ctx) => {
  const user = await getUser(ctx.from.id);
  const balance = user.stars || 0;
  const invited = user.invited || 0;
  ctx.editMessageText(
    `👤 Профиль\n\n💫 Баланс: ${balance} звёзд\n👥 Приглашено друзей: ${invited}\n\nФармите звёзды, приглашайте друзей и получайте бонусы!`,
    mainMenuButton(ctx.from.id)
  );
}));

bot.action('top', withSubscription(async (ctx) => {
  const top = await users.find().sort({ stars: -1 }).limit(10).toArray();
  let msg = '🏆 Топ-10 игроков по звёздам:\n\n';
  top.forEach((u, i) => {
    const name = u.username || u.id;
    msg += `${i + 1}. ${name} — ${u.stars || 0} звёзд\n`;
  });
  ctx.editMessageText(msg, mainMenuButton(ctx.from.id));
}));

bot.action('admin', withSubscription(async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('Нет доступа', { show_alert: true });
  }
  ctx.editMessageText(
    '⚙️ Админ-панель\n\nВыберите действие:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📢 Рассылка', 'admin_broadcast')],
      [Markup.button.callback('➕ Добавить промокод', 'admin_addpromo')],
      [Markup.button.callback('📊 Статистика', 'admin_stats')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ])
  );
}));

bot.action('admin_addpromo', withSubscription(async (ctx) => {
  await ctx.reply('➕ Введите промокод, количество звёзд и активаций через пробел (например: NEWCODE 25 10):', { reply_markup: { force_reply: true } });
  console.log(`[ADMIN] ${ctx.from.id} начал создание промокода`);
}));

bot.action('promo', withSubscription(async (ctx) => {
  await ctx.reply('🎫 Введите промокод одним сообщением:', { reply_markup: { force_reply: true } });
  console.log(`[USER] ${ctx.from.id} начал ввод промокода`);
}));

bot.action('admin_broadcast', withSubscription(async (ctx) => {
  await ctx.reply('📢 Введите текст для рассылки:', { reply_markup: { force_reply: true } });
  console.log(`[ADMIN] ${ctx.from.id} начал рассылку`);
}));

bot.action('admin_stats', withSubscription(async (ctx) => {
  const totalUsers = await users.countDocuments();
  const totalStars = await users.aggregate([{ $group: { _id: null, sum: { $sum: "$stars" } } }]).toArray();
  const totalInvited = await users.aggregate([{ $group: { _id: null, sum: { $sum: "$invited" } } }]).toArray();
  ctx.editMessageText(
    `📊 Статистика бота\n\n` +
    `👥 Пользователей: ${totalUsers}\n` +
    `💫 Всего звёзд: ${totalStars[0]?.sum || 0}\n` +
    `🤝 Всего приглашений: ${totalInvited[0]?.sum || 0}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Главное меню', 'main_menu')],
      [Markup.button.callback('⚙️ Админ-панель', 'admin')]
    ])
  );
}));

// Промокоды с количеством активаций
const promoCodes = {
  // 'CODE': { stars: 10, max: 5, used: 0 }
  'MAGNUM10': { stars: 10, max: 100, used: 0 },
  'STAR50': { stars: 50, max: 10, used: 0 }
};

// Активация промокода с учётом количества активаций
const userPromoUsed = {};

connectDB().then(() => {
  bot.launch();
  console.log('Бот запущен!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));