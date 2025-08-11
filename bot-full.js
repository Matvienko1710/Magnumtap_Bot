require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');

// Конфигурация
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
const SUPPORT_CHANNEL = process.env.SUPPORT_CHANNEL;
const WITHDRAWAL_CHANNEL = process.env.WITHDRAWAL_CHANNEL;
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL;
const REQUIRED_BOT_LINK = process.env.REQUIRED_BOT_LINK || 'https://t.me/ReferalStarsRobot?start=6587897295';
const FIRESTARS_BOT_LINK = process.env.FIRESTARS_BOT_LINK || 'https://t.me/firestars_rbot?start=6587897295';
const FARMIK_BOT_LINK = process.env.FARMIK_BOT_LINK || 'https://t.me/farmikstars_bot?start=6587897295';
const BASKET_BOT_LINK = process.env.BASKET_BOT_LINK || 'https://t.me/basket_gift_bot?start=6587897295';
const PRIVATE_CHANNEL_LINK = process.env.PRIVATE_CHANNEL_LINK || 'https://t.me/+4BUF9S_rLZw3NDQ6';
const PROMO_NOTIFICATIONS_CHAT = process.env.PROMO_NOTIFICATIONS_CHAT;
const BOT_PHOTO_URL = process.env.BOT_PHOTO_URL;

// Кеш пользователей для оптимизации (время жизни 30 секунд)
const userCache = new Map();
const USER_CACHE_TTL = 30000; // 30 seconds

// Функция для получения общей статистики бота с кешированием
async function getBotStatistics() {
  try {
    const stats = await db.collection('users').aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          totalMagnumCoins: { $sum: { $ifNull: ['$totalEarnedMagnumCoins', '$magnumCoins'] } },
          totalStars: { $sum: { $ifNull: ['$stars', 0] } },
          activeMiners: { $sum: { $cond: [{ $eq: ['$miner.active', true] }, 1, 0] } }
        }
      }
    ]).toArray();
    
    return stats[0] || {
      totalUsers: 0,
      totalMagnumCoins: 0,
      totalStars: 0,
      activeMiners: 0
    };
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    return {
      totalUsers: 0,
      totalMagnumCoins: 0,
      totalStars: 0,
      activeMiners: 0
    };
  }
}

// Подключение к MongoDB
let db;
async function connectDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db();
    
    // Создаем индексы для оптимизации
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('users').createIndex({ username: 1 });
    await db.collection('users').createIndex({ 'miner.active': 1 });
    await db.collection('users').createIndex({ lastSeen: -1 });
    
    await db.collection('promocodes').createIndex({ code: 1 }, { unique: true });
    await db.collection('promocodes').createIndex({ isActive: 1 });
    await db.collection('promocodes').createIndex({ expiresAt: 1 });
    
    await db.collection('withdrawalRequests').createIndex({ userId: 1 });
    await db.collection('withdrawalRequests').createIndex({ status: 1 });
    await db.collection('withdrawalRequests').createIndex({ createdAt: -1 });
    
    await db.collection('supportTickets').createIndex({ userId: 1 });
    await db.collection('supportTickets').createIndex({ status: 1 });
    await db.collection('supportTickets').createIndex({ createdAt: -1 });
    
    await db.collection('taskChecks').createIndex({ userId: 1 });
    await db.collection('taskChecks').createIndex({ status: 1 });
    await db.collection('taskChecks').createIndex({ createdAt: -1 });
    
    console.log('✅ Подключение к MongoDB установлено');
  } catch (error) {
    console.error('❌ Ошибка подключения к MongoDB:', error);
    process.exit(1);
  }
}

// Получение пользователя с кешированием
async function getUser(id, ctx = null) {
  try {
    // Проверяем кеш
    const cacheKey = id.toString();
    const cached = userCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < USER_CACHE_TTL) {
      return cached.user;
    }

    // Получаем из базы данных
    let user = await db.collection('users').findOne({ id: parseInt(id) });
    
    if (!user) {
      // Создаем нового пользователя
      user = await db.collection('users').insertOne({
        id: parseInt(id),
        username: ctx?.from?.username || '',
        first_name: ctx?.from?.first_name || '',
        stars: 100,
        magnumCoins: 0,
        totalEarnedMagnumCoins: 0,
        lastFarm: 0,
        lastBonus: 0,
        lastExchange: 0,
        created: Math.floor(Date.now() / 1000),
        invited: 0,
        invitedBy: null,
        titles: [],
        achievements: [],
        farmCount: 0,
        bonusCount: 0,
        promoCount: 0,
        taskCount: 0,
        dailyStreak: 0,
        lastSeen: Math.floor(Date.now() / 1000),
        status: 'member',
        dailyTasks: {},
        dailyFarms: 0,
        miner: { active: false, totalEarned: 0, lastReward: 0 }
      });
      user = await db.collection('users').findOne({ id: parseInt(id) });
    } else {
      // Обновляем информацию пользователя если нужно
      if (ctx) {
        const updates = {};
        if (ctx.from.username && ctx.from.username !== user.username) {
          updates.username = ctx.from.username;
        }
        if (ctx.from.first_name && ctx.from.first_name !== user.first_name) {
          updates.first_name = ctx.from.first_name;
        }
        
        if (Object.keys(updates).length > 0) {
          await db.collection('users').updateOne(
            { id: parseInt(id) },
            { $set: { ...updates, lastSeen: Math.floor(Date.now() / 1000) } }
          );
          Object.assign(user, updates);
        }
      }
    }

    // Кешируем пользователя
    userCache.set(cacheKey, {
      user: user,
      timestamp: Date.now()
    });

    return user;
  } catch (error) {
    console.error('Ошибка получения пользователя:', error);
    return null;
  }
}

// Инициализация бота
const bot = new Telegraf(BOT_TOKEN);

// Обработка команды /start
bot.start(async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId, ctx);
    
    // Проверяем подписку если требуется
    if (REQUIRED_CHANNEL) {
      const isSubscribed = await checkSubscription(ctx);
      if (!isSubscribed) {
        return showSubscriptionMessage(ctx);
      }
    }
    
    // Обрабатываем реферальный параметр
    const startParam = ctx.startPayload;
    if (startParam && startParam !== userId.toString()) {
      await handleReferral(userId, startParam);
    }
    
    // Показываем главное меню
    await showMainMenu(ctx, user);
    
  } catch (error) {
    console.error('Ошибка в /start:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Проверка подписки
async function checkSubscription(ctx) {
  if (!REQUIRED_CHANNEL) return true;
  
  try {
    const channelId = REQUIRED_CHANNEL.startsWith('@') ? 
      REQUIRED_CHANNEL : `@${REQUIRED_CHANNEL}`;
    const member = await ctx.telegram.getChatMember(channelId, ctx.from.id);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error('Ошибка проверки подписки:', error);
    return false;
  }
}

// Показать сообщение о подписке
async function showSubscriptionMessage(ctx) {
  const message = `🔔 **Обязательная подписка**\n\n` +
                  `Для использования бота необходимо:\n\n` +
                  `1️⃣ Подписаться на канал\n` +
                  `2️⃣ Запустить бота по ссылке\n\n` +
                  `После выполнения нажмите "✅ Проверить"`;
  
  const channelName = REQUIRED_CHANNEL.replace('@', '');
  const channelLink = `https://t.me/${channelName}`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('📢 Подписаться на канал', channelLink)],
    [Markup.button.url('🤖 Запустить бота', REQUIRED_BOT_LINK)],
    [Markup.button.callback('✅ Проверить', 'check_subscription')]
  ]);
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

// Обработка реферала
async function handleReferral(userId, referrerId) {
  try {
    const referrer = await getUser(referrerId);
    if (referrer) {
      await db.collection('users').updateOne(
        { id: parseInt(referrerId) },
        { 
          $inc: { invited: 1, stars: 50 },
          $set: { lastSeen: Math.floor(Date.now() / 1000) }
        }
      );
      
      // Обновляем пригласившего пользователя
      await db.collection('users').updateOne(
        { id: parseInt(userId) },
        { 
          $set: { invitedBy: referrerId, lastSeen: Math.floor(Date.now() / 1000) }
        }
      );
    }
  } catch (error) {
    console.error('Ошибка обработки реферала:', error);
  }
}

// Главное меню
async function showMainMenu(ctx, user) {
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('⭐ Фармить звёзды', 'farm'),
      Markup.button.callback('🎁 Бонус', 'bonus')
    ],
    [
      Markup.button.callback('📋 Задания', 'tasks'),
      Markup.button.callback('🎫 Промокод', 'promocode')
    ],
    [
      Markup.button.callback('👤 Профиль', 'profile'),
      Markup.button.callback('👥 Рефералы', 'referrals')
    ],
    [
      Markup.button.callback('⛏️ Майнер', 'miner'),
      Markup.button.callback('💱 Обмен', 'exchange')
    ],
    [
      Markup.button.callback('💳 Вывод', 'withdrawal'),
      Markup.button.callback('📞 Поддержка', 'support')
    ]
  ]);
  
  const text = `🎮 **Добро пожаловать в Magnum Tap!**\n\n` +
               `💰 Баланс: ${formatNumber(user.magnumCoins || 0)}🪙\n` +
               `⭐ Звезды: ${formatNumber(user.stars || 0)}⭐\n` +
               `👥 Приглашено: ${user.invited || 0} человек\n\n` +
               `Выберите действие:`;
  
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

// Обработчик фарма
bot.action('farm', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    const now = Math.floor(Date.now() / 1000);
    
    // Проверяем кулдаун (10 секунд)
    if (now - user.lastFarm < 10) {
      const timeLeft = 10 - (now - user.lastFarm);
      await ctx.answerCbQuery(`⏰ Подождите ${timeLeft} секунд до следующего фарма`, { show_alert: true });
      return;
    }

    // Рассчитываем награду
    const baseReward = 0.01;
    let reward = baseReward;
    
    // Бонусы за достижения
    if (user.achievements) {
      const farmBoost = user.achievements.find(a => a.type === 'farm_boost');
      if (farmBoost) {
        reward *= (1 + farmBoost.level * 0.1); // +10% за каждый уровень
      }
    }
    
    // Множители от титулов
    if (user.titles && user.titles.length > 0) {
      const farmTitle = user.titles.find(t => t.type === 'farm_boost');
      if (farmTitle) {
        reward *= (1 + farmTitle.boost);
      }
    }
    
    reward = Math.max(reward, 0.1); // Минимум 0.1 звезды
    
    // Обновляем пользователя
    await db.collection('users').updateOne(
      { id: parseInt(userId) },
      {
        $inc: { 
          stars: reward,
          farmCount: 1,
          dailyFarms: 1
        },
        $set: { 
          lastFarm: now,
          lastSeen: now
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(userId.toString());
    
    await ctx.answerCbQuery(
      `✅ +${formatNumber(reward)}⭐\n` +
      `💰 Баланс: ${formatNumber((user.stars || 0) + reward)}⭐`,
      { show_alert: true }
    );
    
    // Проверяем достижения
    await checkAchievements(userId);
    
  } catch (error) {
    console.error('Ошибка фарма:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик бонуса
bot.action('bonus', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    const now = Math.floor(Date.now() / 1000);
    const today = Math.floor(now / (24 * 60 * 60));
    
    // Проверяем, получал ли уже бонус сегодня
    if (user.lastBonus === today) {
      const nextBonus = (today + 1) * 24 * 60 * 60;
      const timeLeft = nextBonus - now;
      const hoursLeft = Math.ceil(timeLeft / (60 * 60));
      
      await ctx.answerCbQuery(
        `⏰ Ежедневный бонус уже получен. Следующий через ${hoursLeft} часов`,
        { show_alert: true }
      );
      return;
    }

    // Рассчитываем награду и серию
    const baseReward = 3;
    const streak = user.lastBonus === today - 1 ? (user.dailyStreak || 0) + 1 : 1;
    const reward = baseReward + Math.floor(streak / 7) * 2; // Бонус за недельную серию
    
    // Обновляем пользователя
    await db.collection('users').updateOne(
      { id: parseInt(userId) },
      {
        $inc: { 
          stars: reward,
          bonusCount: 1
        },
        $set: { 
          lastBonus: today,
          dailyStreak: streak,
          lastSeen: now
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(userId.toString());
    
    await ctx.answerCbQuery(
      `🎁 +${formatNumber(reward)}⭐\n` +
      `🔥 Серия: ${streak} дней`,
      { show_alert: true }
    );
    
    // Проверяем достижения
    await checkAchievements(userId);
    
  } catch (error) {
    console.error('Ошибка бонуса:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик заданий
bot.action('tasks', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📋 Ежедневные задания', 'daily_tasks'),
        Markup.button.callback('🎯 Спонсорские задания', 'sponsor_tasks')
      ],
      [
        Markup.button.callback('📊 Прогресс', 'task_progress'),
        Markup.button.callback('🏆 Награды', 'task_rewards')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const text = `📋 **Задания**\n\n` +
                 `Выполняйте задания для получения наград!\n\n` +
                 `📊 Статистика:\n` +
                 `✅ Выполнено заданий: ${user.taskCount || 0}\n` +
                 `🎁 Получено наград: ${formatNumber(user.stars || 0)}⭐\n\n` +
                 `Выберите тип заданий:`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
  } catch (error) {
    console.error('Ошибка заданий:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик промокодов
bot.action('promocode', async (ctx) => {
  try {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🎁 Активировать промокод', 'activate_promo')],
      [Markup.button.callback('📊 Статистика промокодов', 'promo_stats')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const text = `🎫 **Промокоды**\n\n` +
                 `Введите промокод для получения награды!\n\n` +
                 `💡 Промокоды можно найти в нашем канале или получить от друзей.`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
  } catch (error) {
    console.error('Ошибка промокодов:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик профиля
bot.action('profile', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    const stats = await getBotStatistics();
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Статистика', 'statistics'),
        Markup.button.callback('🏆 Достижения', 'achievements')
      ],
      [
        Markup.button.callback('👥 Рефералы', 'referrals'),
        Markup.button.callback('⚙️ Настройки', 'settings')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const rank = getUserRank(user);
    const mainTitle = getUserMainTitle(user);
    const titleText = mainTitle ? `\n🏆 Титул: ${mainTitle.name}` : '';
    
    const text = `👤 **Профиль**\n\n` +
                 `👤 Имя: ${ctx.from.first_name}\n` +
                 `🆔 ID: ${ctx.from.id}\n` +
                 `⭐ Ранг: ${rank.name}\n` +
                 `💰 Magnum Coins: ${formatNumber(user.magnumCoins || 0)}🪙\n` +
                 `⭐ Звезды: ${formatNumber(user.stars || 0)}⭐\n` +
                 `👥 Приглашено: ${user.invited || 0} человек\n` +
                 `🌾 Фармов: ${user.farmCount || 0}\n` +
                 `🎁 Промокодов: ${user.promoCount || 0}${titleText}\n\n` +
                 `📊 Всего пользователей: ${formatNumber(stats.totalUsers)}`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
  } catch (error) {
    console.error('Ошибка профиля:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик рефералов
bot.action('referrals', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${userId}`;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🔗 Поделиться ссылкой', `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Присоединяйся к Magnum Tap Bot! 🚀')}`)],
      [Markup.button.callback('📊 Статистика рефералов', 'referral_stats')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const text = `👥 **Реферальная система**\n\n` +
                 `🔗 Ваша ссылка: \`${referralLink}\`\n\n` +
                 `📊 Статистика:\n` +
                 `👤 Приглашено друзей: ${user.invited || 0}\n` +
                 `⭐ Заработано с рефералов: ${formatNumber((user.invited || 0) * 50)} звезд\n\n` +
                 `💡 За каждого приглашенного друга вы получаете +50 звезд!`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
  } catch (error) {
    console.error('Ошибка рефералов:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик майнера
bot.action('miner', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    
    const keyboard = Markup.inlineKeyboard([
      [
        user.miner?.active ? 
          Markup.button.callback('⏹️ Остановить майнер', 'stop_miner') :
          Markup.button.callback('▶️ Запустить майнер', 'start_miner')
      ],
      [
        Markup.button.callback('📊 Статистика майнера', 'miner_stats'),
        Markup.button.callback('⚡ Улучшить майнер', 'upgrade_miner')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const status = user.miner?.active ? '🟢 Активен' : '🔴 Неактивен';
    const totalEarned = user.miner?.totalEarned || 0;
    const rewardPerHour = 0.1; // 0.1 звезды в час
    
    const text = `⛏️ **Майнер**\n\n` +
                 `📊 Статус: ${status}\n` +
                 `💰 Доход в час: ${formatNumber(rewardPerHour)}⭐\n` +
                 `💎 Всего заработано: ${formatNumber(totalEarned)}⭐\n\n` +
                 `💡 Майнер автоматически добывает звезды каждые 30 минут.`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
  } catch (error) {
    console.error('Ошибка майнера:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик обмена
bot.action('exchange', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🪙 → ⭐ Купить звезды', 'buy_stars'),
        Markup.button.callback('⭐ → 🪙 Продать звезды', 'sell_stars')
      ],
      [
        Markup.button.callback('📊 Курсы валют', 'exchange_rates'),
        Markup.button.callback('🏦 Резерв биржи', 'reserve_info')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const text = `💱 **Обмен валют**\n\n` +
                 `💰 Ваши Magnum Coins: ${formatNumber(user.magnumCoins || 0)}🪙\n` +
                 `⭐ Ваши звезды: ${formatNumber(user.stars || 0)}⭐\n\n` +
                 `📊 Текущий курс: 1🪙 = 1⭐\n` +
                 `💰 Комиссия: 2.5%\n\n` +
                 `Выберите операцию:`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
  } catch (error) {
    console.error('Ошибка обмена:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик вывода
bot.action('withdrawal', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('💳 Создать заявку', 'create_withdrawal'),
        Markup.button.callback('📋 Мои заявки', 'my_withdrawals')
      ],
      [
        Markup.button.callback('📊 Статистика выводов', 'withdrawal_stats'),
        Markup.button.callback('❓ Правила', 'withdrawal_rules')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const text = `💳 **Вывод средств**\n\n` +
                 `💰 Доступно для вывода: ${formatNumber(user.magnumCoins || 0)}🪙\n` +
                 `⭐ Звезды: ${formatNumber(user.stars || 0)}⭐\n\n` +
                 `💡 Минимальная сумма вывода: 100🪙\n` +
                 `⏱️ Время обработки: 1-24 часа\n\n` +
                 `Выберите действие:`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
  } catch (error) {
    console.error('Ошибка вывода:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик поддержки
bot.action('support', async (ctx) => {
  try {
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📞 Создать тикет', 'create_ticket'),
        Markup.button.callback('📋 Мои тикеты', 'my_tickets')
      ],
      [
        Markup.button.callback('❓ FAQ', 'faq'),
        Markup.button.callback('📢 Канал поддержки', 'support_channel')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const text = `📞 **Поддержка**\n\n` +
                 `Если у вас возникли вопросы или проблемы, мы готовы помочь!\n\n` +
                 `💬 Создайте тикет для получения помощи\n` +
                 `📢 Присоединяйтесь к нашему каналу поддержки\n` +
                 `❓ Изучите часто задаваемые вопросы`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
  } catch (error) {
    console.error('Ошибка поддержки:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Возврат в главное меню
bot.action('main_menu', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    await showMainMenu(ctx, user);
  } catch (error) {
    console.error('Ошибка главного меню:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Вспомогательные функции
function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  } else {
    return num.toFixed(2);
  }
}

function getUserRank(user) {
  const stars = user.stars || 0;
  
  if (stars >= 1000000) return { name: 'Легенда', level: 10 };
  if (stars >= 500000) return { name: 'Мастер', level: 9 };
  if (stars >= 100000) return { name: 'Эксперт', level: 8 };
  if (stars >= 50000) return { name: 'Профессионал', level: 7 };
  if (stars >= 10000) return { name: 'Опытный', level: 6 };
  if (stars >= 5000) return { name: 'Продвинутый', level: 5 };
  if (stars >= 1000) return { name: 'Активный', level: 4 };
  if (stars >= 500) return { name: 'Начинающий', level: 3 };
  if (stars >= 100) return { name: 'Новичок', level: 2 };
  return { name: 'Новичок', level: 1 };
}

function getUserMainTitle(user) {
  if (!user.titles || user.titles.length === 0) return null;
  
  const mainTitle = user.titles.find(t => t.isMain);
  if (mainTitle) return mainTitle;
  
  // Возвращаем первый титул если главный не установлен
  return user.titles[0];
}

async function checkAchievements(userId) {
  try {
    const user = await getUser(userId);
    const newAchievements = [];
    
    // Проверяем достижения по фарму
    const farmCount = user.farmCount || 0;
    if (farmCount >= 1000 && !hasAchievement(user, 'farm_master')) {
      newAchievements.push({
        id: 'farm_master',
        name: 'Мастер фарма',
        description: 'Фармил 1000 раз',
        type: 'farm_boost',
        level: 1,
        reward: 100
      });
    }
    
    if (farmCount >= 100 && !hasAchievement(user, 'farm_expert')) {
      newAchievements.push({
        id: 'farm_expert',
        name: 'Эксперт фарма',
        description: 'Фармил 100 раз',
        type: 'farm_boost',
        level: 1,
        reward: 50
      });
    }
    
    // Проверяем достижения по промокодам
    const promoCount = user.promoCount || 0;
    if (promoCount >= 50 && !hasAchievement(user, 'promo_collector')) {
      newAchievements.push({
        id: 'promo_collector',
        name: 'Коллекционер промокодов',
        description: 'Активировал 50 промокодов',
        type: 'bonus_boost',
        level: 1,
        reward: 200
      });
    }
    
    // Выдаем новые достижения
    if (newAchievements.length > 0) {
      const currentAchievements = user.achievements || [];
      const updatedAchievements = [...currentAchievements, ...newAchievements];
      
      await db.collection('users').updateOne(
        { id: parseInt(userId) },
        { $set: { achievements: updatedAchievements } }
      );
      
      // Выдаем награды
      for (const achievement of newAchievements) {
        await db.collection('users').updateOne(
          { id: parseInt(userId) },
          { $inc: { stars: achievement.reward } }
        );
      }
      
      // Очищаем кеш
      userCache.delete(userId.toString());
      
      // Уведомляем пользователя
      try {
        const achievementsText = newAchievements.map(a => a.name).join(', ');
        await ctx.telegram.sendMessage(userId,
          `🏆 **Новые достижения!**\n\n` +
          `Поздравляем! Вы получили новые достижения:\n` +
          `${achievementsText}\n\n` +
          `Продолжайте играть и получайте больше наград!`,
          { parse_mode: 'Markdown' }
        );
      } catch (notifyError) {
        console.log(`⚠️ Не удалось уведомить пользователя ${userId} о новых достижениях`);
      }
    }
  } catch (error) {
    console.error('Ошибка проверки достижений:', error);
  }
}

function hasAchievement(user, achievementId) {
  return user.achievements && user.achievements.some(a => a.id === achievementId);
}

// Обработка майнеров каждые 30 минут
async function processMinerRewards() {
  try {
    console.log('⛏️ Обработка майнеров...');
    const now = Math.floor(Date.now() / 1000);
    const oneHour = 3600;
    
    const usersWithMiners = await db.collection('users').find({ 'miner.active': true }).toArray();
    console.log(`🔍 Найдено ${usersWithMiners.length} активных майнеров`);
    
    for (const user of usersWithMiners) {
      const timeSinceLastReward = now - (user.miner.lastReward || 0);
      const hoursElapsed = Math.floor(timeSinceLastReward / oneHour);
      
      if (hoursElapsed > 0) {
        const rewardPerHour = 0.1;
        const totalReward = hoursElapsed * rewardPerHour;
        
        console.log(`⛏️ Майнер ${user.id}: ${rewardPerHour}⭐/час, ${hoursElapsed}ч = ${totalReward}⭐`);
        
        await db.collection('users').updateOne(
          { id: user.id },
          {
            $inc: { 
              stars: totalReward,
              'miner.totalEarned': totalReward
            },
            $set: { 'miner.lastReward': now }
          }
        );
        
        // Очищаем кеш
        userCache.delete(user.id.toString());
        
        // Отправляем уведомление
        try {
          await ctx.telegram.sendMessage(user.id, 
            `⛏️ **Майнер принес доход!**\n\n` +
            `💎 Получено: ${totalReward.toFixed(4)} ⭐ звезд\n` +
            `⏰ За период: ${hoursElapsed} час(ов)\n` +
            `📈 Доход в час: ${rewardPerHour.toFixed(4)} ⭐\n` +
            `📊 Всего заработано: ${((user.miner.totalEarned || 0) + totalReward).toFixed(4)} ⭐\n\n` +
            `Майнер продолжает работать автоматически!`,
            { parse_mode: 'Markdown' }
          );
        } catch (notifyError) {
          console.log(`⚠️ Не удалось уведомить пользователя ${user.id} о доходе майнера`);
        }
      }
    }
  } catch (error) {
    console.error('Ошибка обработки майнеров:', error);
  }
}

// Глобальная обработка ошибок
bot.catch(async (err, ctx) => {
  console.error('🚨 Глобальная ошибка бота:', err);
  console.error('📍 Контекст ошибки:', {
    updateType: ctx.updateType,
    userId: ctx.from?.id,
    chatId: ctx.chat?.id,
    messageText: ctx.message?.text,
    callbackData: ctx.callbackQuery?.data
  });
  
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⚠️ Временно недоступно. Повторите через пару секунд.', { show_alert: true });
    } else if (ctx.message) {
      await ctx.reply('⚠️ Временно недоступно. Повторите через пару секунд.');
    }
  } catch (notifyError) {
    console.error('❌ Не удалось уведомить пользователя об ошибке:', notifyError);
  }
});

// Обработка необработанных промисов
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Необработанный отказ промиса:', reason);
  console.error('📍 Promise:', promise);
});

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
  console.error('💥 Необработанное исключение:', error);
  console.error('📍 Stack trace:', error.stack);
  console.log('🔄 Пытаемся продолжить работу бота...');
});

// Запуск бота
async function startBot() {
  try {
    console.log('🔧 Проверяем переменные окружения...');
    console.log('🤖 BOT_TOKEN:', BOT_TOKEN ? 'установлен' : 'НЕ УСТАНОВЛЕН');
    console.log('🗄️ MONGODB_URI:', MONGODB_URI ? 'установлен' : 'НЕ УСТАНОВЛЕН');
    console.log('👑 ADMIN_IDS:', ADMIN_IDS.length ? ADMIN_IDS.join(', ') : 'НЕ УСТАНОВЛЕНЫ');
    
    if (!BOT_TOKEN) throw new Error('Не задан BOT_TOKEN!');
    if (!MONGODB_URI) throw new Error('Не задан MONGODB_URI!');
    
    // Подключаемся к базе данных
    await connectDB();
    
    // Запускаем обработку майнеров
    setInterval(processMinerRewards, 30 * 60 * 1000); // каждые 30 минут
    
    // Запускаем бота
    bot.launch();
    console.log('✅ Бот запущен успешно!');
    console.log('📱 Готов к обработке сообщений');
    
    // Обработка сигналов завершения
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
    
  } catch (error) {
    console.error('❌ Ошибка запуска бота:', error);
    process.exit(1);
  }
}

// Запускаем бота
startBot();