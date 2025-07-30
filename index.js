require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const dbFile = 'db.js';

// Загрузка базы
function loadDB() {
  if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(dbFile));
}

// Сохранение базы
function saveDB(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

function getUser(id) {
  const db = loadDB();
  if (!db[id]) db[id] = { stars: 0, bonusTime: 0, referrals: [], balance: 0 };
  saveDB(db);
  return db[id];
}

bot.start((ctx) => {
  const user = getUser(ctx.from.id);
  ctx.reply('Добро пожаловать!', Markup.inlineKeyboard([
    [Markup.button.callback('🚀 Фарм звёзд', 'farm')],
    [Markup.button.callback('🎁 Бонус', 'bonus')],
    [Markup.button.callback('🎯 Задания', 'tasks')],
    [Markup.button.callback('👥 Рефералы', 'ref')],
    [Markup.button.callback('💸 Вывод', 'withdraw')],
  ]));
});

bot.hears('👨‍🌾 Фарм', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const now = Date.now();

  if (user.lastFarm && now - user.lastFarm < 60000) {
    const secondsLeft = Math.ceil((60000 - (now - user.lastFarm)) / 1000);
    await ctx.reply(`⏳ Подожди ${secondsLeft} сек.`);
    return;
  }

  user.stars += 1;
  user.lastFarm = now;

  await saveUser(ctx.from.id, user);
  await ctx.reply(`⭐️ +1 звезда`);
});

bot.action('bonus', (ctx) => {
  const db = loadDB();
  const user = getUser(ctx.from.id);
  const now = Date.now();
  if (now - user.bonusTime >= 86400000) {
    user.stars += 10;
    user.bonusTime = now;
    saveDB(db);
    ctx.answerCbQuery('🎉 Бонус +10 звёзд!');
  } else {
    const timeLeft = 86400000 - (now - user.bonusTime);
    const hours = Math.floor(timeLeft / 3600000);
    ctx.answerCbQuery(`Ещё ${hours} ч до следующего бонуса`);
  }
});

bot.action('tasks', (ctx) => {
  ctx.answerCbQuery('Задания скоро появятся!');
});

bot.action('ref', (ctx) => {
  ctx.answerCbQuery(`Ваша ссылка: t.me/${ctx.botInfo.username}?start=${ctx.from.id}`);
});

bot.action('withdraw', (ctx) => {
  ctx.answerCbQuery('Минимум для вывода: 100 звёзд');
});

bot.launch();
