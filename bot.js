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
  promocodes = db.collection('promocodes'); // если не нужен функционал промокодов — можно убрать
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

bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id);
  const balance = user.stars || 0;
  const invited = user.invited || 0;
  await ctx.reply(
    `👋 Добро пожаловать в MagnumTapBot! 🌟\n\n` +
    `Ты в игре, где можно зарабатывать звёзды ✨, выполняя простые задания, приглашая друзей и собирая бонусы! 🚀\n\n` +
    `💫 Твой баланс: ${balance} звёзд\n` +
    `👥 Приглашено друзей: ${invited}\n\n` +
    `Выбери действие и стань звездой MagnumTapBot! 🌟`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🌟 Фармить звёзды', 'farm'), Markup.button.callback('🎁 Бонус', 'bonus')],
      [Markup.button.callback('👤 Профиль', 'profile'), Markup.button.callback('🏆 Топ', 'top')],
      [Markup.button.callback('🤝 Пригласить друзей', 'invite'), Markup.button.callback('🎫 Промокод', 'promo')]
    ])
  );
});

bot.action('farm', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const t = now();
  if (t - user.lastFarm < 60) {
    const wait = 60 - (t - user.lastFarm);
    return ctx.answerCbQuery(`⏳ До следующего фарма: ${wait} сек.`, { show_alert: true });
  }
  await users.updateOne({ id: ctx.from.id }, { $set: { lastFarm: t }, $inc: { stars: 1 } });
  ctx.answerCbQuery(`🌟 +1 звезда! Баланс: ${user.stars + 1}.`, { show_alert: true });
});

bot.action('bonus', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const t = now();
  if (t - user.lastBonus < 86400) {
    const hours = Math.floor((86400 - (t - user.lastBonus)) / 3600);
    const mins = Math.floor((86400 - (t - user.lastBonus)) % 3600 / 60);
    return ctx.answerCbQuery(`⏳ До следующего бонуса: ${hours}ч ${mins}м.`, { show_alert: true });
  }
  await users.updateOne({ id: ctx.from.id }, { $set: { lastBonus: t }, $inc: { stars: 50 } });
  ctx.answerCbQuery(`🎁 +50 звёзд! Баланс: ${user.stars + 50}.`, { show_alert: true });
});

bot.action('profile', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const balance = user.stars || 0;
  const invited = user.invited || 0;
  ctx.editMessageText(
    `👤 Профиль\n\n💫 Баланс: ${balance} звёзд\n👥 Приглашено друзей: ${invited}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ])
  );
});

bot.action('main_menu', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const balance = user.stars || 0;
  const invited = user.invited || 0;
  ctx.editMessageText(
    `👋 Добро пожаловать в MagnumTapBot! 🌟\n\n` +
    `Ты в игре, где можно зарабатывать звёзды ✨, выполняя простые задания, приглашая друзей и собирая бонусы! 🚀\n\n` +
    `💫 Твой баланс: ${balance} звёзд\n` +
    `👥 Приглашено друзей: ${invited}\n\n` +
    `Выбери действие и стань звездой MagnumTapBot! 🌟`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🌟 Фармить звёзды', 'farm'), Markup.button.callback('🎁 Бонус', 'bonus')],
      [Markup.button.callback('👤 Профиль', 'profile'), Markup.button.callback('🏆 Топ', 'top')],
      [Markup.button.callback('🤝 Пригласить друзей', 'invite'), Markup.button.callback('🎫 Промокод', 'promo')]
    ])
  );
});

bot.action('top', async (ctx) => {
  const top = await users.find().sort({ stars: -1 }).limit(10).toArray();
  let msg = '🏆 Топ-10 игроков по звёздам:\n\n';
  top.forEach((u, i) => {
    const name = u.username || u.id;
    msg += `${i + 1}. ${name} — ${u.stars || 0} звёзд\n`;
  });
  ctx.editMessageText(msg, Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
});

bot.action('invite', async (ctx) => {
  const refLink = `https://t.me/${ctx.me}?start=${ctx.from.id}`;
  ctx.editMessageText(
    `🤝 Пригласить друзей\n\n` +
    `Отправь эту ссылку друзьям и получай звёзды за каждого, кто присоединится!\n\n` +
    `🔗 Твоя ссылка: ${refLink}`,
    Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]])
  );
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

connectDB().then(() => {
  bot.launch();
  console.log('Бот запущен!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));