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

bot.action('invite', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const refLink = `https://t.me/${ctx.me}?start=${ctx.from.id}`;
  ctx.answerCbQuery();
  ctx.editMessageText(
    `🤝 Пригласить друзей\n\n` +
    `Отправь эту ссылку друзьям и получай звёзды за каждого, кто присоединится!\n\n` +
    `🔗 Твоя ссылка: ${refLink}\n\n` +
    `👥 Приглашено друзей: ${user.invited || 0}`,
    mainMenuKeyboard()
  );
});

// Учёт приглашённых друзей при старте по реферальной ссылке
bot.start(async (ctx) => {
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
    mainMenuKeyboard()
  );
});

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
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
  ]);
}

bot.action('farm', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const t = now();
  if (t - user.lastFarm < 60) {
    const wait = 60 - (t - user.lastFarm);
    return ctx.answerCbQuery(`Подождите ${wait} сек. до следующего фарма!`, { show_alert: true });
  }
  await users.updateOne({ id: ctx.from.id }, { $set: { lastFarm: t }, $inc: { stars: 1 } });
  ctx.answerCbQuery('Вы получили 1 звезду!');
  ctx.editMessageText(`У вас ${user.stars + 1} звёзд.

Фармить можно раз в минуту.`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🌟 Фармить звёзды', 'farm')],
      [Markup.button.callback('🎁 Получить бонус', 'bonus')]
    ]));
});

bot.action('bonus', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const t = now();
  if (t - user.lastBonus < 86400) {
    const hours = Math.floor((86400 - (t - user.lastBonus)) / 3600);
    const mins = Math.floor((86400 - (t - user.lastBonus)) % 3600 / 60);
    return ctx.answerCbQuery(`Бонус доступен через ${hours}ч ${mins}м!`, { show_alert: true });
  }
  await users.updateOne({ id: ctx.from.id }, { $set: { lastBonus: t }, $inc: { stars: 50 } });
  ctx.answerCbQuery('Вы получили 50 звёзд бонусом!');
  ctx.editMessageText(`У вас ${user.stars + 50} звёзд.

Следующий бонус через 24 часа.`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🌟 Фармить звёзды', 'farm')],
      [Markup.button.callback('🎁 Получить бонус', 'bonus')]
    ]));
});

bot.action('profile', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const balance = user.stars || 0;
  const invited = user.invited || 0;
  ctx.answerCbQuery();
  ctx.editMessageText(
    `👤 Профиль
\n💫 Баланс: ${balance} звёзд\n👥 Приглашено друзей: ${invited}\n\n` +
    `Фармите звёзды, приглашайте друзей и получайте бонусы!`,
    mainMenuKeyboard()
  );
});

bot.action('top', async (ctx) => {
  const top = await users.find().sort({ stars: -1 }).limit(10).toArray();
  let msg = '🏆 Топ-10 игроков по звёздам:\n\n';
  top.forEach((u, i) => {
    const name = u.username || u.id;
    msg += `${i + 1}. ${name} — ${u.stars || 0} звёзд\n`;
  });
  ctx.answerCbQuery();
  ctx.editMessageText(msg, mainMenuKeyboard());
});

const promoCodes = {
  'MAGNUM10': 10,
  'STAR50': 50
};

const userPromoUsed = {};

bot.action('promo', async (ctx) => {
  ctx.answerCbQuery();
  ctx.editMessageText(
    '🎫 Введите промокод одним сообщением:',
    Markup.forceReply()
  );
});

bot.on('text', async (ctx) => {
  if (ctx.message.reply_to_message && ctx.message.reply_to_message.text.includes('Введите промокод')) {
    const code = ctx.message.text.trim().toUpperCase();
    const userId = ctx.from.id;
    if (userPromoUsed[userId + ':' + code]) {
      return ctx.reply('❗ Вы уже использовали этот промокод.', mainMenuKeyboard());
    }
    if (promoCodes[code]) {
      await users.updateOne({ id: userId }, { $inc: { stars: promoCodes[code] } });
      userPromoUsed[userId + ':' + code] = true;
      return ctx.reply(`✅ Промокод активирован! Вы получили ${promoCodes[code]} звёзд.`, mainMenuKeyboard());
    } else {
      return ctx.reply('❌ Неверный промокод.', mainMenuKeyboard());
    }
  }
});

connectDB().then(() => {
  bot.launch();
  console.log('Бот запущен!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));