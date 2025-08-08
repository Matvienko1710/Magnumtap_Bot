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

// Универсальная обёртка для подписки
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

// Универсальный обработчик force_reply
bot.on('text', withSubscription(async (ctx) => {
  if (ctx.message.reply_to_message) {
    const replyText = ctx.message.reply_to_message.text;
    // Создание промокода (админ)
    if (replyText.includes('Введите промокод, количество звёзд')) {
      if (!isAdmin(ctx.from.id)) return;
      const [code, stars, max] = ctx.message.text.trim().split(/\s+/);
      if (!code || isNaN(Number(stars)) || isNaN(Number(max))) {
        console.log(`[ADMIN] ${ctx.from.id} ошибка формата промокода: ${ctx.message.text}`);
        return ctx.reply('❌ Формат: КОД 10 5', mainMenuButton(ctx.from.id));
      }
      promoCodes[code.toUpperCase()] = { stars: Number(stars), max: Number(max), used: 0 };
      console.log(`[ADMIN] ${ctx.from.id} добавил промокод ${code.toUpperCase()} на ${stars} звёзд, ${max} активаций`);
      return ctx.reply(`✅ Промокод ${code.toUpperCase()} на ${stars} звёзд, ${max} активаций добавлен.`, mainMenuButton(ctx.from.id));
    }
    // Активация промокода (пользователь)
    if (replyText.includes('Введите промокод одним сообщением')) {
      const code = ctx.message.text.trim().toUpperCase();
      const userId = ctx.from.id;
      if (userPromoUsed[userId + ':' + code]) {
        console.log(`[USER] ${userId} повторная попытка промокода ${code}`);
        return ctx.reply('❗ Вы уже использовали этот промокод.', mainMenuButton(userId));
      }
      const promo = promoCodes[code];
      if (promo && promo.used < promo.max) {
        await users.updateOne({ id: userId }, { $inc: { stars: promo.stars } });
        userPromoUsed[userId + ':' + code] = true;
        promoCodes[code].used++;
        console.log(`[USER] ${userId} активировал промокод ${code}, осталось ${promo.max - promo.used}`);
        return ctx.reply(`✅ Промокод активирован! Вы получили ${promo.stars} звёзд. Осталось активаций: ${promo.max - promo.used}`, mainMenuButton(userId));
      } else if (promo) {
        console.log(`[USER] ${userId} попытка исчерпанного промокода ${code}`);
        return ctx.reply('❌ Лимит активаций промокода исчерпан.', mainMenuButton(userId));
      } else {
        console.log(`[USER] ${userId} неверный промокод ${code}`);
        return ctx.reply('❌ Неверный промокод.', mainMenuButton(userId));
      }
    }
    // Рассылка (админ)
    if (replyText.includes('текст для рассылки')) {
      if (!isAdmin(ctx.from.id)) return;
      const text = ctx.message.text;
      const allUsers = await users.find().toArray();
      let sent = 0;
      for (const u of allUsers) {
        try {
          await ctx.telegram.sendMessage(u.id, `📢 Сообщение от администрации:\n\n${text}`);
          sent++;
        } catch {}
      }
      console.log(`[ADMIN] ${ctx.from.id} сделал рассылку, доставлено: ${sent}`);
      return ctx.reply(`✅ Рассылка завершена. Доставлено: ${sent} пользователям.`, mainMenuButton(ctx.from.id));
    }
  }
}));

// Промокоды с количеством активаций
const promoCodes = {
  // 'CODE': { stars: 10, max: 5, used: 0 }
  'MAGNUM10': { stars: 10, max: 100, used: 0 },
  'STAR50': { stars: 50, max: 10, used: 0 }
};

// Активация промокода с учётом количества активаций
const userPromoUsed = {};

// Хелпер для гашения старых панелей
async function tryDisableOldPanel(ctx) {
  try {
    await ctx.editMessageText('Панель устарела, используйте /start для новой панели.');
  } catch (e) {}
}

// Обёртка для action: если action не из последнего сообщения, гасим старую панель
function withPanelGuard(handler) {
  return async (ctx, ...args) => {
    // Если это callback_query и message не последнее (например, message_id не совпадает с последним /start), гасим панель
    if (ctx.updateType === 'callback_query' && ctx.callbackQuery && ctx.callbackQuery.message) {
      // Можно добавить проверку на "устаревшее" сообщение, но проще всегда гасить старую панель
      try {
        await handler(ctx, ...args);
      } catch (e) {
        await tryDisableOldPanel(ctx);
      }
    } else {
      await handler(ctx, ...args);
    }
  };
}

// Применить withSubscription ко всем action и start
// Удаляем ошибочную перезапись методов bot.start, bot.action, bot.command
// Вместо этого оборачиваем каждый handler вручную:

bot.start(withSubscription(async (ctx) => {
  // Просто отправляем новую панель, не пытаясь удалять старые сообщения
  // Реферал: только если пользователь впервые запускает бота по чужой ссылке
  let ref = null;
  if (ctx.startPayload && ctx.startPayload !== String(ctx.from.id)) {
    ref = ctx.startPayload;
    const refUser = await getUser(ref);
    const user = await users.findOne({ id: ctx.from.id });
    if (refUser && ref !== String(ctx.from.id) && user && (!user.invitedBy)) {
      await users.updateOne({ id: ref }, { $inc: { invited: 1, stars: 5 } });
      await users.updateOne({ id: ctx.from.id }, { $set: { invitedBy: ref } });
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
    `Выбери действие и стань звездой MagnumTapBot! 🌟`,
    mainMenuKeyboard(ctx.from.id)
  );
}));

bot.action('invite', withPanelGuard(withSubscription(async (ctx) => {
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
    `Выбери действие и стань звездой MagnumTapBot! 🌟`,
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
    Markup.inlineKeyboard([
      [Markup.button.callback('❓ FAQ', 'faq')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')],
      ...(isAdmin(ctx.from.id) ? [[Markup.button.callback('⚙️ Админ-панель', 'admin')]] : [])
    ])
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

connectDB().then(() => {
  bot.launch();
  console.log('Бот запущен!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.action('faq', withSubscription(async (ctx) => {
  ctx.editMessageText(
    `❓ <b>FAQ MagnumTapBot</b>\n\n` +
    `• Фармите звёзды раз в минуту\n` +
    `• Получайте бонус раз в 24 часа\n` +
    `• Приглашайте друзей по реферальной ссылке и получайте звёзды\n` +
    `• Используйте промокоды для получения дополнительных звёзд\n\n` +
    `Все звёзды и приглашения хранятся в вашем профиле.`,
    { parse_mode: 'HTML', ...mainMenuButton(ctx.from.id) }
  );
}));