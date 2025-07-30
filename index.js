const { Telegraf, Markup } = require('telegraf');
const { getUser, updateUser } = require('./database');

const bot = new Telegraf('7668979667:AAFrTOKH0nz0pS_XumlAa3xhYKffDm4Sjnk'); // 🔁 вставь свой токен
const COOLDOWN = 60 * 1000;            // 60 сек фарм
const BONUS_COOLDOWN = 3600 * 1000;    // 1 час бонус

// Главное меню
function mainKeyboard() {
  return Markup.keyboard([
    ['🔨 Фарм', '🎁 Бонус'],
    ['👤 Профиль']
  ]).resize();
}

bot.start((ctx) => {
  getUser(ctx.from.id, (err, user) => {
    if (err) return ctx.reply('❌ Ошибка БД');

    ctx.reply(
      `👋 Привет, ${ctx.from.first_name}!\nТы можешь фармить звёзды и получать бонусы.`,
      mainKeyboard()
    );
  });
});

bot.hears('🔨 Фарм', (ctx) => {
  getUser(ctx.from.id, (err, user) => {
    if (err) return ctx.reply('❌ Ошибка БД');

    const now = Date.now();
    if (now - user.lastFarm < COOLDOWN) {
      const seconds = Math.ceil((COOLDOWN - (now - user.lastFarm)) / 1000);
      return ctx.reply(`⏳ Подожди ${seconds} сек до следующего фарма.`);
    }

    user.stars += 1;
    user.lastFarm = now;

    updateUser(ctx.from.id, user, () => {
      ctx.reply(`⭐️ +1 звезда! Сейчас у тебя: ${user.stars} ⭐️`);
    });
  });
});

bot.hears('🎁 Бонус', (ctx) => {
  getUser(ctx.from.id, (err, user) => {
    if (err) return ctx.reply('❌ Ошибка БД');

    const now = Date.now();
    if (now - user.lastBonus < BONUS_COOLDOWN) {
      const mins = Math.ceil((BONUS_COOLDOWN - (now - user.lastBonus)) / 60000);
      return ctx.reply(`🎁 Бонус доступен через ${mins} мин.`);
    }

    user.stars += 5;
    user.lastBonus = now;

    updateUser(ctx.from.id, user, () => {
      ctx.reply(`🎉 +5 бонусных звёзд! У тебя теперь: ${user.stars} ⭐️`);
    });
  });
});

bot.hears('👤 Профиль', (ctx) => {
  getUser(ctx.from.id, (err, user) => {
    if (err) return ctx.reply('❌ Ошибка БД');

    ctx.reply(`👤 Профиль @${ctx.from.username || ctx.from.first_name}\n⭐️ Звёзды: ${user.stars}\n💰 Баланс: ${user.balance}`);
  });
});

bot.launch();
