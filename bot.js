require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

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

bot.start(async (ctx) => {
  await getUser(ctx.from.id);
  return ctx.reply('Добро пожаловать! Фармите звёзды каждую минуту и получайте бонус раз в 24 часа!',
    Markup.inlineKeyboard([
      [Markup.button.callback('🌟 Фармить звёзды', 'farm')],
      [Markup.button.callback('🎁 Получить бонус', 'bonus')]
    ]));
});

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

connectDB().then(() => {
  bot.launch();
  console.log('Бот запущен!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));