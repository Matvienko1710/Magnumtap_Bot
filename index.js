const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN || '7668979667:AAFrTOKH0nz0pS_XumlAa3xhYKffDm4Sjnk');

const dbPath = './db.json';

// Загрузка базы данных
function loadDB() {
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

// Сохранение базы данных
function saveDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// Получить пользователя
function getUser(id) {
  const db = loadDB();
  if (!db[id]) {
    db[id] = {
      stars: 0,
      lastFarm: 0,
      lastBonus: 0,
      invitedBy: null,
    };
    saveDB(db);
  }
  return db[id];
}

// Сохранить пользователя
function saveUser(id, userData) {
  const db = loadDB();
  db[id] = userData;
  saveDB(db);
}

// 👤 /start с поддержкой рефералов
bot.start((ctx) => {
  const userId = ctx.from.id.toString();
  const db = loadDB();

  const args = ctx.message.text.split(' ');
  const referrerId = args[1];

  if (!db[userId]) {
    db[userId] = {
      stars: 0,
      lastFarm: 0,
      lastBonus: 0,
      invitedBy: null,
    };

    // Если запущено по реферальной ссылке
    if (referrerId && referrerId !== userId && db[referrerId]) {
      db[userId].invitedBy = referrerId;
      db[referrerId].stars += 5;
      ctx.telegram.sendMessage(referrerId, `🎉 Вы пригласили нового игрока! +5 звёзд`);
    }

    saveDB(db);
  }

  ctx.reply(
    `Добро пожаловать, ${ctx.from.first_name}!\n\n⭐️ У тебя ${db[userId].stars} звёзд.\n\nИспользуй кнопки ниже:`,
    Markup.keyboard([['👨‍🌾 Фарм', '🎁 Бонус'], ['📊 Баланс']]).resize()
  );
});

// 👨‍🌾 Фарм
bot.hears('👨‍🌾 Фарм', async (ctx) => {
  const userId = ctx.from.id.toString();
  const user = getUser(userId);
  const now = Date.now();

  if (now - user.lastFarm < 60 * 1000) {
    const secondsLeft = Math.ceil((60 * 1000 - (now - user.lastFarm)) / 1000);
    return ctx.reply(`⏳ Подожди ${secondsLeft} сек. до следующего фарма.`);
  }

  user.lastFarm = now;
  user.stars += 1;
  saveUser(userId, user);

  ctx.reply('⭐️ +1 звезда за фарм!');
});

// 🎁 Бонус (раз в 24 часа)
bot.hears('🎁 Бонус', async (ctx) => {
  const userId = ctx.from.id.toString();
  const user = getUser(userId);
  const now = Date.now();

  if (now - user.lastBonus < 24 * 60 * 60 * 1000) {
    const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - (now - user.lastBonus)) / (60 * 60 * 1000));
    return ctx.reply(`🎁 Бонус уже получен. Подожди ещё ${hoursLeft} ч.`);
  }

  user.lastBonus = now;
  user.stars += 10;
  saveUser(userId, user);

  ctx.reply('🎉 Ты получил +10 звёзд за ежедневный бонус!');
});

// 📊 Баланс
bot.hears('📊 Баланс', (ctx) => {
  const userId = ctx.from.id.toString();
  const user = getUser(userId);
  ctx.reply(`⭐️ У тебя сейчас: ${user.stars} звёзд`);
});

bot.launch();
console.log('🤖 Бот запущен');
