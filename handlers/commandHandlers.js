const { Markup } = require('telegraf');
const config = require('../config/constants');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

class CommandHandlers {
  constructor(db) {
    this.db = db;
  }

  // Обработчик команды /start
  async handleStart(ctx) {
    try {
      const userId = ctx.from.id;
      const username = ctx.from.username || ctx.from.first_name;
      
      logger.userAction(userId, 'start_command', { username });

      // Проверяем, существует ли пользователь
      let user = await this.db.collection('users').findOne({ userId: userId });
      
      if (!user) {
        // Создаем нового пользователя
        user = {
          userId: userId,
          username: username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          magnumCoins: 100, // Начальный бонус
          stars: 50,
          level: 1,
          experience: 0,
          joinDate: new Date(),
          lastActivity: new Date(),
          miningStats: {
            totalMinedMC: 0,
            totalMinedStars: 0,
            seasonMinedMC: 0,
            seasonMinedStars: 0,
            passiveRewards: 0,
            activeClicks: 0,
            activeRewards: 0
          },
          miners: [
            { type: 'magnumCoins', level: 1, speed: 1, active: true },
            { type: 'stars', level: 1, speed: 1, active: true }
          ],
          achievements: [],
          referrals: [],
          referralBy: null,
          settings: {
            notifications: true,
            language: 'ru'
          }
        };

        await this.db.collection('users').insertOne(user);
        logger.info(`Новый пользователь зарегистрирован: ${userId} (${username})`);
      } else {
        // Обновляем время последней активности
        await this.db.collection('users').updateOne(
          { userId: userId },
          { $set: { lastActivity: new Date() } }
        );
      }

      // Кэшируем данные пользователя
      cache.setUser(userId, user);

      const welcomeMessage = `🎉 *Добро пожаловать в Magnum Stars!*

💰 *Ваш баланс:*
• Magnum Coins: ${user.magnumCoins}
• Stars: ${user.stars}

🏆 *Уровень:* ${user.level} (${user.experience} XP)

Выберите действие:`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⛏️ Майнинг', 'miner')],
        [Markup.button.callback('🎯 Задания', 'tasks')],
        [Markup.button.callback('🏆 Достижения', 'achievements')],
        [Markup.button.callback('👥 Рефералы', 'referrals')],
        [Markup.button.callback('⚙️ Настройки', 'settings')],
        [Markup.button.callback('📊 Статистика', 'stats')]
      ]);

      await ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

    } catch (error) {
      logger.error('Ошибка в обработчике /start', { userId: ctx.from.id, error: error.message });
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }

  // Обработчик команды /help
  async handleHelp(ctx) {
    try {
      const helpMessage = `📚 *Справка по командам*

🎮 *Основные команды:*
• /start - Главное меню
• /help - Эта справка
• /balance - Показать баланс
• /mining - Управление майнингом
• /tasks - Доступные задания
• /referral - Реферальная программа

💰 *Валюты:*
• Magnum Coins (MC) - основная валюта
• Stars - премиум валюта

⛏️ *Майнинг:*
• Пассивный майнинг каждую минуту
• Активный клик (только для админов)
• Апгрейд майнеров

🎯 *Задания:*
• RichAds офферы
• Спонсорские задания
• Ежедневные бонусы

🏆 *Достижения:*
• За выполнение различных действий
• Награды за достижения

👥 *Рефералы:*
• Приглашайте друзей
• Получайте бонусы за рефералов

⚙️ *Настройки:*
• Уведомления
• Язык интерфейса

Для получения помощи обратитесь к администратору.`;

      await ctx.reply(helpMessage, { parse_mode: 'Markdown' });

    } catch (error) {
      logger.error('Ошибка в обработчике /help', { userId: ctx.from.id, error: error.message });
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }

  // Обработчик команды /balance
  async handleBalance(ctx) {
    try {
      const userId = ctx.from.id;
      
      // Получаем данные пользователя из кэша или БД
      let user = cache.getUser(userId);
      if (!user) {
        user = await this.db.collection('users').findOne({ userId: userId });
        if (user) {
          cache.setUser(userId, user);
        }
      }

      if (!user) {
        await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
        return;
      }

      const balanceMessage = `💰 *Ваш баланс*

🪙 *Magnum Coins:* ${user.magnumCoins}
⭐ *Stars:* ${user.stars}

📊 *Статистика майнинга:*
• Всего добыто MC: ${user.miningStats?.totalMinedMC || 0}
• Всего добыто Stars: ${user.miningStats?.totalMinedStars || 0}
• Активные клики: ${user.miningStats?.activeClicks || 0}

🏆 *Уровень:* ${user.level} (${user.experience} XP)`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Обмен валют', 'exchange')],
        [Markup.button.callback('📈 Детальная статистика', 'detailed_stats')],
        [Markup.button.callback('🔙 Назад', 'main_menu')]
      ]);

      await ctx.reply(balanceMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

    } catch (error) {
      logger.error('Ошибка в обработчике /balance', { userId: ctx.from.id, error: error.message });
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }

  // Обработчик команды /admin
  async handleAdmin(ctx) {
    try {
      const userId = ctx.from.id;
      
      if (!config.ADMIN_IDS.includes(userId)) {
        await ctx.reply('❌ У вас нет прав администратора.');
        return;
      }

      const adminMessage = `🔧 *Панель администратора*

Выберите действие:`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📊 Статистика бота', 'admin_stats')],
        [Markup.button.callback('👥 Управление пользователями', 'admin_users')],
        [Markup.button.callback('💰 Управление экономикой', 'admin_economy')],
        [Markup.button.callback('🎯 Управление заданиями', 'admin_tasks')],
        [Markup.button.callback('🔙 Назад', 'main_menu')]
      ]);

      await ctx.reply(adminMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

    } catch (error) {
      logger.error('Ошибка в обработчике /admin', { userId: ctx.from.id, error: error.message });
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }

  // Обработчик команды /stats
  async handleStats(ctx) {
    try {
      const userId = ctx.from.id;
      
      let user = cache.getUser(userId);
      if (!user) {
        user = await this.db.collection('users').findOne({ userId: userId });
        if (user) {
          cache.setUser(userId, user);
        }
      }

      if (!user) {
        await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
        return;
      }

      // Получаем общую статистику бота
      const totalUsers = await this.db.collection('users').countDocuments();
      const activeUsers = await this.db.collection('users').countDocuments({
        lastActivity: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      const statsMessage = `📊 *Ваша статистика*

👤 *Профиль:*
• ID: ${user.userId}
• Имя: ${user.firstName || 'Не указано'}
• Дата регистрации: ${user.joinDate.toLocaleDateString('ru-RU')}
• Последняя активность: ${user.lastActivity.toLocaleDateString('ru-RU')}

💰 *Экономика:*
• Magnum Coins: ${user.magnumCoins}
• Stars: ${user.stars}
• Уровень: ${user.level}
• Опыт: ${user.experience}

⛏️ *Майнинг:*
• Всего добыто MC: ${user.miningStats?.totalMinedMC || 0}
• Всего добыто Stars: ${user.miningStats?.totalMinedStars || 0}
• Пассивные награды: ${user.miningStats?.passiveRewards || 0}
• Активные клики: ${user.miningStats?.activeClicks || 0}
• Активные награды: ${user.miningStats?.activeRewards || 0}

🏆 *Достижения:*
• Выполнено: ${user.achievements?.length || 0}

👥 *Рефералы:*
• Приглашено: ${user.referrals?.length || 0}

📈 *Статистика бота:*
• Всего пользователей: ${totalUsers}
• Активных за 24ч: ${activeUsers}`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📈 Детальная статистика', 'detailed_stats')],
        [Markup.button.callback('🏆 Достижения', 'achievements')],
        [Markup.button.callback('🔙 Назад', 'main_menu')]
      ]);

      await ctx.reply(statsMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

    } catch (error) {
      logger.error('Ошибка в обработчике /stats', { userId: ctx.from.id, error: error.message });
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }
}

module.exports = CommandHandlers;

