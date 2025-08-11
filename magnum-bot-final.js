require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const http = require('http');

// Импорт модулей удален - все функции перенесены в основной файл

// ==================== КОНФИГУРАЦИЯ ====================
log('🚀 Запуск Magnum Stars Bot...');
log('📋 Проверка переменных окружения...');

// Проверяем обязательные переменные окружения
if (!process.env.BOT_TOKEN) {
  logError(new Error('BOT_TOKEN не найден'), 'Переменные окружения');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  logError(new Error('MONGODB_URI не найден'), 'Переменные окружения');
  process.exit(1);
}

log('✅ Все обязательные переменные окружения найдены');

const config = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  MONGODB_URI: process.env.MONGODB_URI,
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [],
  SUPPORT_CHANNEL: process.env.SUPPORT_CHANNEL,
  WITHDRAWAL_CHANNEL: process.env.WITHDRAWAL_CHANNEL,
  REQUIRED_CHANNEL: process.env.REQUIRED_CHANNEL,
  REQUIRED_BOT_LINK: process.env.REQUIRED_BOT_LINK || 'https://t.me/ReferalStarsRobot?start=6587897295',
  FIRESTARS_BOT_LINK: process.env.FIRESTARS_BOT_LINK || 'https://t.me/firestars_rbot?start=6587897295',
  FARMIK_BOT_LINK: process.env.FARMIK_BOT_LINK || 'https://t.me/farmikstars_bot?start=6587897295',
  BASKET_BOT_LINK: process.env.BASKET_BOT_LINK || 'https://t.me/basket_gift_bot?start=6587897295',
  PRIVATE_CHANNEL_LINK: process.env.PRIVATE_CHANNEL_LINK || 'https://t.me/+4BUF9S_rLZw3NDQ6',
  PROMO_NOTIFICATIONS_CHAT: process.env.PROMO_NOTIFICATIONS_CHAT,
  BOT_PHOTO_URL: process.env.BOT_PHOTO_URL,
  
  // Игровые настройки
  INITIAL_STARS: 100,
  INITIAL_MAGNUM_COINS: 0,
  FARM_COOLDOWN: 10, // секунды
  FARM_BASE_REWARD: 0.01,
  DAILY_BONUS_BASE: 3,
  REFERRAL_BONUS: 50,
  MINER_REWARD_PER_HOUR: 0.1,
  EXCHANGE_COMMISSION: 2.5,
  MIN_WITHDRAWAL: 100,
  MAX_WITHDRAWAL: 10000,
  
  // Кеширование
  USER_CACHE_TTL: 30000,
  STATS_CACHE_TTL: 120000,
  
  // Rate limiting
  RATE_LIMIT_WINDOW: 60000,
  RATE_LIMIT_MAX_REQUESTS: 30,
  
  // Резерв биржи
  INITIAL_RESERVE_STARS: 1000000,
  INITIAL_RESERVE_MAGNUM_COINS: 1000000
};

// ==================== HTTP СЕРВЕР ДЛЯ HEALTH CHECK ====================
let server;
const PORT = process.env.PORT || 3000;

function startHttpServer() {
  log(`🔧 Создание HTTP сервера на порту ${PORT}...`);
  
  server = http.createServer((req, res) => {
    log(`📡 HTTP запрос: ${req.method} ${req.url}`);
    
    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok', 
        message: 'Magnum Stars Bot is running',
        timestamp: new Date().toISOString()
      }));
      log('✅ Health check ответ отправлен');
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      log('❌ 404 ответ отправлен');
    }
  });

  server.listen(PORT, () => {
    log(`🌐 HTTP сервер запущен на порту ${PORT}`);
  });
  
  server.on('error', (error) => {
    logError(error, 'HTTP сервер');
  });
}

// ==================== БАЗА ДАННЫХ ====================
let db;
let client;

async function connectDB() {
  try {
    log('🔌 Подключение к MongoDB...');
    client = new MongoClient(config.MONGODB_URI);
    await client.connect();
    log('🔌 MongoDB клиент подключен');
    db = client.db();
    log('📊 База данных получена');
    
    // Создаем индексы для оптимизации
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('users').createIndex({ username: 1 });
    await db.collection('users').createIndex({ 'miner.active': 1 });
    await db.collection('users').createIndex({ lastSeen: -1 });
    await db.collection('users').createIndex({ referrerId: 1 });
    
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
    
    await db.collection('dailyTasks').createIndex({ userId: 1 });
    await db.collection('dailyTasks').createIndex({ date: 1 });
    await db.collection('dailyTasks').createIndex({ completed: 1 });
    
    await db.collection('exchangeHistory').createIndex({ userId: 1 });
    await db.collection('exchangeHistory').createIndex({ timestamp: -1 });
    
    // Создаем индекс для резерва с проверкой на существующие записи
    try {
      await db.collection('reserve').createIndex({ currency: 1 }, { unique: true });
    } catch (error) {
      if (error.code === 11000) {
        // Если есть дублирующиеся записи, удаляем их и создаем индекс заново
        log('🔄 Исправляем дублирующиеся записи в резерве...');
        await db.collection('reserve').deleteMany({ currency: null });
        await db.collection('reserve').createIndex({ currency: 1 }, { unique: true });
      } else {
        throw error;
      }
    }
    
    log('✅ База данных подключена');
    
    log('💰 Инициализация резерва...');
    // Инициализируем резерв
    await initializeReserve();
    log('✅ Резерв инициализирован');
  } catch (error) {
    logError(error, 'Подключение к MongoDB');
    process.exit(1);
  }
}

// Инициализация резерва
async function initializeReserve() {
  try {
    // Очищаем некорректные записи
    await db.collection('reserve').deleteMany({ currency: null });
    
    let reserve = await db.collection('reserve').findOne({ currency: 'main' });
    
    if (!reserve) {
      reserve = {
        currency: 'main',
        stars: config.INITIAL_RESERVE_STARS,
        magnumCoins: config.INITIAL_RESERVE_MAGNUM_COINS,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection('reserve').insertOne(reserve);
      log('💰 Резерв валют инициализирован');
          } else {
        log('💰 Резерв валют уже существует');
      }
  } catch (error) {
    logError(error, 'Инициализация резерва');
  }
}

// ==================== КЕШИРОВАНИЕ ====================
const userCache = new Map();
const statsCache = new Map();

function getCachedUser(id) {
  const cached = userCache.get(id);
  if (cached && (Date.now() - cached.timestamp) < config.USER_CACHE_TTL) {
    return cached.user;
  }
  return null;
}

function setCachedUser(id, user) {
  userCache.set(id, { user, timestamp: Date.now() });
}

function getCachedStats(key) {
  const cached = statsCache.get(key);
  if (cached && (Date.now() - cached.timestamp) < config.STATS_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedStats(key, data) {
  statsCache.set(key, { data, timestamp: Date.now() });
}

// ==================== УТИЛИТЫ ====================
function formatNumber(num) {
  // Проверяем, что num является числом
  if (num === null || num === undefined || isNaN(num)) {
    return '0.00';
  }
  
  // Преобразуем в число на всякий случай
  num = Number(num);
  
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(2);
}

function formatTime(seconds) {
  // Проверяем, что seconds является числом
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return '0с';
  }
  
  // Преобразуем в число на всякий случай
  seconds = Number(seconds);
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}ч ${minutes}м ${secs}с`;
  } else if (minutes > 0) {
    return `${minutes}м ${secs}с`;
  }
  return `${secs}с`;
}

function getUserRank(user) {
  const stars = user.stars || 0;
  if (stars >= 1000000) return '👑 Легенда';
  if (stars >= 500000) return '💎 Алмаз';
  if (stars >= 100000) return '🏆 Чемпион';
  if (stars >= 50000) return '⭐ Звезда';
  if (stars >= 10000) return '🌟 Профессионал';
  if (stars >= 5000) return '💫 Эксперт';
  if (stars >= 1000) return '✨ Мастер';
  if (stars >= 500) return '🎯 Опытный';
  if (stars >= 100) return '🚀 Начинающий';
  return '🌱 Новичок';
}

function isAdmin(userId) {
  return config.ADMIN_IDS.includes(userId);
}

// ==================== РАБОТА С ПОЛЬЗОВАТЕЛЯМИ ====================
// Функция для проверки и инициализации недостающих полей пользователя
function ensureUserFields(user) {
  // Проверяем и инициализируем статистику
  if (!user.statistics) {
    user.statistics = {
      joinDate: user.createdAt || new Date(),
      lastSeen: new Date(),
      totalSessions: 1,
      totalActions: 0,
      favoriteAction: null
    };
  }
  
  // Проверяем и инициализируем ферму
  if (!user.farm) {
    user.farm = {
      lastFarm: null,
      farmCount: 0,
      totalFarmEarnings: 0
    };
  }
  
  // Проверяем и инициализируем майнер
  if (!user.miner) {
    user.miner = {
      active: false,
      level: 1,
      efficiency: 1,
      lastReward: null,
      totalMined: 0
    };
  }
  
  // Проверяем и инициализируем ежедневный бонус
  if (!user.dailyBonus) {
    user.dailyBonus = {
      lastBonus: null,
      streak: 0,
      maxStreak: 0
    };
  }
  
  // Проверяем и инициализируем обмен
  if (!user.exchange) {
    user.exchange = {
      totalExchanged: 0,
      exchangeCount: 0
    };
  }
  
  // Проверяем и инициализируем вывод
  if (!user.withdrawal) {
    user.withdrawal = {
      totalWithdrawn: 0,
      withdrawalCount: 0,
      pendingAmount: 0
    };
  }
  
  // Проверяем и инициализируем задания
  if (!user.tasks) {
    user.tasks = {
      dailyTasks: [],
      sponsorTasks: [],
      lastDailyTasksReset: null,
      completedTasksCount: 0,
      totalTaskRewards: 0
    };
  }
  
  // Проверяем и инициализируем поддержку
  if (!user.support) {
    user.support = {
      ticketsCount: 0,
      lastTicket: null
    };
  }
  
  // Проверяем и инициализируем настройки
  if (!user.settings) {
    user.settings = {
      notifications: true,
      language: 'ru',
      theme: 'default'
    };
  }
  
  // Проверяем и инициализируем достижения
  if (!user.achievements) {
    user.achievements = [];
  }
  
  if (!user.achievementsCount) {
    user.achievementsCount = 0;
  }
  
  if (!user.achievementsProgress) {
    user.achievementsProgress = {};
  }
  
  if (!user.titles) {
    user.titles = ['🌱 Новичок'];
  }
  
  if (!user.mainTitle) {
    user.mainTitle = '🌱 Новичок';
  }
  
  if (!user.referrals) {
    user.referrals = [];
  }
  
  if (!user.referralsCount) {
    user.referralsCount = 0;
  }
  
  if (!user.totalReferralEarnings) {
    user.totalReferralEarnings = 0;
  }
  
  if (!user.totalEarnedStars) {
    user.totalEarnedStars = user.stars || 0;
  }
  
  if (!user.totalEarnedMagnumCoins) {
    user.totalEarnedMagnumCoins = user.magnumCoins || 0;
  }
  
  if (!user.level) {
    user.level = 1;
  }
  
  if (!user.experience) {
    user.experience = 0;
  }
  
  if (!user.experienceToNextLevel) {
    user.experienceToNextLevel = 100;
  }
  
  if (!user.rank) {
    user.rank = getUserRank(user);
  }
  
  if (!user.referralCode) {
    user.referralCode = generateReferralCode();
  }
  
  return user;
}

async function getUser(id, ctx = null) {
  try {
    // Проверяем кеш
    const cached = getCachedUser(id);
    if (cached) return cached;

    let user = await db.collection('users').findOne({ id: id });
    
    if (!user) {
      // Создаем нового пользователя
      user = {
        id: id,
        username: ctx?.from?.username || null,
        firstName: ctx?.from?.first_name || null,
        lastName: ctx?.from?.last_name || null,
        stars: config.INITIAL_STARS,
        magnumCoins: config.INITIAL_MAGNUM_COINS,
        totalEarnedStars: config.INITIAL_STARS,
        totalEarnedMagnumCoins: config.INITIAL_MAGNUM_COINS,
        level: 1,
        experience: 0,
        experienceToNextLevel: 100,
        rank: getUserRank({ stars: config.INITIAL_STARS }),
        mainTitle: '🌱 Новичок',
        titles: ['🌱 Новичок'],
        achievements: [],
        achievementsCount: 0,
        achievementsProgress: {},
        referralCode: generateReferralCode(),
        referrerId: null,
        referrals: [],
        referralsCount: 0,
        totalReferralEarnings: 0,
        farm: {
          lastFarm: null,
          farmCount: 0,
          totalFarmEarnings: 0
        },
        miner: {
          active: false,
          level: 1,
          efficiency: 1,
          lastReward: null,
          totalMined: 0
        },
        dailyBonus: {
          lastBonus: null,
          streak: 0,
          maxStreak: 0
        },
        exchange: {
          totalExchanged: 0,
          exchangeCount: 0
        },
        withdrawal: {
          totalWithdrawn: 0,
          withdrawalCount: 0,
          pendingAmount: 0
        },
        tasks: {
          dailyTasks: [],
          sponsorTasks: [],
          lastDailyTasksReset: null,
          completedTasksCount: 0,
          totalTaskRewards: 0
        },
        support: {
          ticketsCount: 0,
          lastTicket: null
        },
        settings: {
          notifications: true,
          language: 'ru',
          theme: 'default'
        },
        statistics: {
          joinDate: new Date(),
          lastSeen: new Date(),
          totalSessions: 1,
          totalActions: 0,
          favoriteAction: null
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection('users').insertOne(user);
      log(`👤 Создан новый пользователь: ${user.username || user.id}`);
    } else {
      // Проверяем и инициализируем все недостающие поля
      user = ensureUserFields(user);
      
      // Обновляем статистику
      user.statistics.lastSeen = new Date();
      user.statistics.totalSessions = (user.statistics.totalSessions || 0) + 1;
      
      // Обновляем пользователя в базе данных
      await db.collection('users').updateOne(
        { id: id },
        { 
          $set: { 
            ...user,
            updatedAt: new Date()
          }
        }
      );
    }
    
    // Сохраняем в кеш
    setCachedUser(id, user);
    return user;
  } catch (error) {
    logError(error, 'Получение пользователя');
    return null;
  }
}

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ==================== ПРОВЕРКА ПОДПИСКИ ====================
async function checkSubscription(ctx) {
  try {
    if (!config.REQUIRED_CHANNEL) return true;
    
    // Проверяем, что канал указан правильно
    if (!config.REQUIRED_CHANNEL.startsWith('@') && !config.REQUIRED_CHANNEL.startsWith('https://t.me/')) {
      return true;
    }
    
    const member = await ctx.telegram.getChatMember(config.REQUIRED_CHANNEL, ctx.from.id);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (error) {
    logError(error, 'Проверка подписки');
    // Если канал не найден, пропускаем проверку подписки
    return true;
  }
}

async function showSubscriptionMessage(ctx) {
  // Проверяем, что канал указан правильно
  if (!config.REQUIRED_CHANNEL || (!config.REQUIRED_CHANNEL.startsWith('@') && !config.REQUIRED_CHANNEL.startsWith('https://t.me/'))) {
    // Если канал не настроен, показываем главное меню
    const user = await getUser(ctx.from.id);
    if (user) {
      await showMainMenu(ctx, user);
    }
    return;
  }
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('📢 Подписаться на канал', config.REQUIRED_CHANNEL)],
    [Markup.button.callback('🔄 Проверить подписку', 'check_subscription')]
  ]);
  
  await ctx.reply(
    `🔒 Для использования бота необходимо подписаться на наш канал!\n\n` +
    `📢 Канал: ${config.REQUIRED_CHANNEL}\n\n` +
    `После подписки нажмите "🔄 Проверить подписку"`,
    keyboard
  );
}

// ==================== РЕФЕРАЛЬНАЯ СИСТЕМА ====================
async function handleReferral(userId, referrerId) {
  try {
    if (userId === referrerId) return;
    
    const user = await getUser(userId);
    if (user.referrerId) return; // Уже есть реферер
    
    const referrer = await getUser(referrerId);
    if (!referrer) return;
    
    // Обновляем пользователя
    await db.collection('users').updateOne(
      { id: userId },
      { 
        $set: { 
          referrerId: referrerId,
          updatedAt: new Date()
        }
      }
    );
    
    // Обновляем реферера
    await db.collection('users').updateOne(
      { id: referrerId },
      { 
        $inc: { 
          referralsCount: 1,
          totalReferralEarnings: config.REFERRAL_BONUS,
          stars: config.REFERRAL_BONUS,
          totalEarnedStars: config.REFERRAL_BONUS
        },
        $push: { referrals: userId },
        $set: { updatedAt: new Date() }
      }
    );
    
    // Очищаем кеш
    userCache.delete(userId);
    userCache.delete(referrerId);
    
    log(`👥 Реферал: ${userId} -> ${referrerId}`);
  } catch (error) {
    logError(error, 'Обработка реферала');
  }
}

// ==================== ГЛАВНОЕ МЕНЮ ====================
async function showMainMenu(ctx, user) {
  const rank = getUserRank(user);
  
  // Создаем базовые кнопки
  const buttons = [
    [
      Markup.button.callback('⛏️ Майнинг', 'miner'),
      Markup.button.callback('🌾 Фарм', 'farm')
    ],
    [
      Markup.button.callback('💱 Обмен', 'exchange'),
      Markup.button.callback('💰 Вывод', 'withdrawal')
    ],
    [
      Markup.button.callback('🎁 Бонус', 'bonus'),
      Markup.button.callback('📋 Задания', 'tasks')
    ],
    [
      Markup.button.callback('🏆 Достижения', 'achievements'),
      Markup.button.callback('👥 Рефералы', 'referrals')
    ],
    [
      Markup.button.callback('🆘 Поддержка', 'support'),
      Markup.button.callback('⚙️ Настройки', 'settings')
    ]
  ];
  
  // Добавляем админ кнопку если нужно
  if (isAdmin(user.id)) {
    buttons.push([
      Markup.button.callback('👨‍💼 Админ панель', 'admin')
    ]);
  }
  
  const keyboard = Markup.inlineKeyboard(buttons);
  
  const message = 
    `🌟 *Добро пожаловать в Magnum Stars!*\n\n` +
    `👤 *Профиль:*\n` +
    `├ ID: \`${user.id}\`\n` +
    `├ Имя: ${user.firstName || 'Не указано'}\n` +
    `├ Уровень: ${user.level}\n` +
    `├ Ранг: ${rank}\n` +
    `└ Титул: ${user.mainTitle}\n\n` +
    `💎 *Баланс:*\n` +
    `├ ⭐ Stars: \`${formatNumber(user.stars)}\`\n` +
    `└ 🪙 Magnum Coins: \`${formatNumber(user.magnumCoins)}\`\n\n` +
    `📊 *Статистика:*\n` +
    `├ Опыт: \`${user.experience}/${user.experienceToNextLevel}\`\n` +
    `├ Рефералы: \`${user.referralsCount}\`\n` +
    `└ Достижения: \`${user.achievementsCount}\`\n\n` +
    `🎯 Выберите действие:`;
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

// ==================== МАЙНИНГ ====================
async function showMinerMenu(ctx, user) {
  // Убеждаемся, что все поля майнера инициализированы
  if (!user.miner) {
    user.miner = {
      active: false,
      level: 1,
      efficiency: 1,
      lastReward: null,
      totalMined: 0
    };
  }
  
  const miner = user.miner;
  const isActive = miner.active || false;
  const efficiency = miner.efficiency || 1;
  const rewardPerHour = config.MINER_REWARD_PER_HOUR * efficiency;
  
  let statusText = isActive ? '🟢 Активен' : '🔴 Неактивен';
  let lastRewardText = '';
  
  if (miner.lastReward) {
    const timeSince = Math.floor((Date.now() - miner.lastReward.getTime()) / 1000);
    if (timeSince < 3600) {
      const remaining = 3600 - timeSince;
      lastRewardText = `\n⏰ Следующая награда через: ${formatTime(remaining)}`;
    }
  }
  
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isActive ? '⏹️ Остановить майнер' : '▶️ Запустить майнер',
        isActive ? 'stop_miner' : 'start_miner'
      )
    ],
    [
      Markup.button.callback('⬆️ Улучшить майнер', 'upgrade_miner'),
      Markup.button.callback('📊 Статистика', 'miner_stats')
    ],
    [Markup.button.callback('🔙 Назад', 'main_menu')]
  ]);
  
  const message = 
    `⛏️ *Майнер*\n\n` +
    `📊 *Статус:* ${statusText}\n` +
    `📈 *Уровень:* ${miner.level}\n` +
    `⚡ *Эффективность:* ${efficiency}x\n` +
    `💰 *Награда/час:* ${formatNumber(rewardPerHour)} Stars\n` +
    `💎 *Всего добыто:* ${formatNumber(miner.totalMined)} Stars${lastRewardText}\n\n` +
    `🎯 Выберите действие:`;
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

async function startMiner(ctx, user) {
  try {
    log(`⛏️ Попытка запуска майнера для пользователя ${user.id}`);
    
    if (user.miner.active) {
      log(`⚠️ Майнер уже запущен для пользователя ${user.id}`);
      await ctx.answerCbQuery('⚠️ Майнер уже запущен!');
      return;
    }
    
    log(`💾 Обновление базы данных для пользователя ${user.id}`);
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $set: { 
          'miner.active': true,
          'miner.lastReward': new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    log(`🗑️ Очистка кеша для пользователя ${user.id}`);
    userCache.delete(user.id);
    
    log(`✅ Майнер успешно запущен для пользователя ${user.id}`);
    await ctx.answerCbQuery('✅ Майнер запущен! Теперь вы будете получать Stars каждый час.');
    
    log(`🔄 Обновление меню майнера для пользователя ${user.id}`);
    // Обновляем меню майнера
    await updateMinerMenu(ctx, { ...user, miner: { ...user.miner, active: true } });
  } catch (error) {
    logError(error, 'Запуск майнера');
    await ctx.answerCbQuery('❌ Ошибка запуска майнера');
  }
}

async function stopMiner(ctx, user) {
  try {
    log(`⏹️ Попытка остановки майнера для пользователя ${user.id}`);
    
    if (!user.miner.active) {
      log(`⚠️ Майнер уже остановлен для пользователя ${user.id}`);
      await ctx.answerCbQuery('⚠️ Майнер уже остановлен!');
      return;
    }
    
    log(`💾 Обновление базы данных для пользователя ${user.id}`);
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $set: { 
          'miner.active': false,
          updatedAt: new Date()
        }
      }
    );
    
    log(`🗑️ Очистка кеша для пользователя ${user.id}`);
    userCache.delete(user.id);
    
    log(`✅ Майнер успешно остановлен для пользователя ${user.id}`);
    await ctx.answerCbQuery('⏹️ Майнер остановлен!');
    
    log(`🔄 Обновление меню майнера для пользователя ${user.id}`);
    // Обновляем меню майнера
    await updateMinerMenu(ctx, { ...user, miner: { ...user.miner, active: false } });
  } catch (error) {
    logError(error, 'Остановка майнера');
    await ctx.answerCbQuery('❌ Ошибка остановки майнера');
  }
}

// ==================== ФАРМ ====================
async function showFarmMenu(ctx, user) {
  const farm = user.farm;
  const now = Date.now();
  const lastFarm = farm.lastFarm ? farm.lastFarm.getTime() : 0;
  const timeSince = Math.floor((now - lastFarm) / 1000);
  const cooldown = config.FARM_COOLDOWN;
  
  const canFarm = timeSince >= cooldown;
  const remainingTime = canFarm ? 0 : cooldown - timeSince;
  
  const baseReward = config.FARM_BASE_REWARD;
  const bonus = Math.min(user.level * 0.1, 2); // Бонус за уровень
  const totalReward = baseReward + bonus;
  
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        canFarm ? '🌾 Фармить' : `⏳ ${formatTime(remainingTime)}`,
        canFarm ? 'do_farm' : 'farm_cooldown'
      )
    ],
    [
      Markup.button.callback('📊 Статистика', 'farm_stats'),
      Markup.button.callback('🎯 Бонусы', 'farm_bonuses')
    ],
    [Markup.button.callback('🔙 Назад', 'main_menu')]
  ]);
  
  const message = 
    `🌾 *Фарм*\n\n` +
    `⏰ *Статус:* ${canFarm ? '🟢 Готов' : '🔴 Кулдаун'}\n` +
    `💰 *Базовая награда:* ${formatNumber(baseReward)} Stars\n` +
    `🎯 *Бонус за уровень:* +${formatNumber(bonus)} Stars\n` +
    `💎 *Итого награда:* ${formatNumber(totalReward)} Stars\n` +
    `📊 *Всего фармов:* ${farm.farmCount}\n` +
    `💎 *Всего заработано:* ${formatNumber(farm.totalFarmEarnings)} Stars\n\n` +
    `🎯 Выберите действие:`;
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

async function doFarm(ctx, user) {
  try {
    log(`🌾 Попытка фарма для пользователя ${user.id}`);
    
    const farm = user.farm;
    const now = Date.now();
    const lastFarm = farm.lastFarm ? farm.lastFarm.getTime() : 0;
    const timeSince = Math.floor((now - lastFarm) / 1000);
    const cooldown = config.FARM_COOLDOWN;
    
    log(`⏰ Время с последнего фарма: ${timeSince}с, кулдаун: ${cooldown}с`);
    
    if (timeSince < cooldown) {
      const remaining = cooldown - timeSince;
      log(`⏳ Кулдаун фарма для пользователя ${user.id}, осталось: ${remaining}с`);
      await ctx.answerCbQuery(`⏳ Подождите ${formatTime(remaining)} перед следующим фармом!`);
      return;
    }
    
    const baseReward = config.FARM_BASE_REWARD;
    const bonus = Math.min(user.level * 0.1, 2);
    const totalReward = baseReward + bonus;
    
    log(`💰 Расчет награды: базовая ${baseReward}, бонус ${bonus}, итого ${totalReward} Stars`);
    
    // Обновляем пользователя
    log(`💾 Обновление базы данных для пользователя ${user.id}`);
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $inc: { 
          stars: totalReward,
          totalEarnedStars: totalReward,
          experience: Math.floor(totalReward * 10),
          'farm.farmCount': 1,
          'farm.totalFarmEarnings': totalReward,
          'statistics.totalActions': 1
        },
        $set: { 
          'farm.lastFarm': new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    log(`🗑️ Очистка кеша для пользователя ${user.id}`);
    userCache.delete(user.id);
    
    log(`✅ Фарм успешно завершен для пользователя ${user.id}, заработано: ${totalReward} Stars`);
    await ctx.answerCbQuery(
      `🌾 Фарм завершен! Заработано: ${formatNumber(totalReward)} Stars`
    );
    
    log(`🔄 Обновление меню фарма для пользователя ${user.id}`);
    // Обновляем меню фарма
    await updateFarmMenu(ctx, { ...user, farm: { ...farm, lastFarm: new Date() } });
  } catch (error) {
    logError(error, 'Фарм');
    await ctx.answerCbQuery('❌ Ошибка фарма');
  }
}

// ==================== ЕЖЕДНЕВНЫЙ БОНУС ====================
async function updateMinerMenu(ctx, user) {
  try {
    log(`🔄 Обновление меню майнера для пользователя ${user.id}`);
    
    // Убеждаемся, что все поля майнера инициализированы
    if (!user.miner) {
      log(`🔧 Инициализация полей майнера для пользователя ${user.id}`);
      user.miner = {
        active: false,
        level: 1,
        efficiency: 1,
        lastReward: null,
        totalMined: 0
      };
    }
  
  const miner = user.miner;
  const isActive = miner.active || false;
  const efficiency = miner.efficiency || 1;
  const rewardPerHour = config.MINER_REWARD_PER_HOUR * efficiency;
  
  let statusText = isActive ? '🟢 Активен' : '🔴 Неактивен';
  let lastRewardText = '';
  
  if (miner.lastReward) {
    const timeSince = Math.floor((Date.now() - miner.lastReward.getTime()) / 1000);
    if (timeSince < 3600) {
      const remaining = 3600 - timeSince;
      lastRewardText = `\n⏰ Следующая награда через: ${formatTime(remaining)}`;
    }
  }
  
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isActive ? '⏹️ Остановить майнер' : '▶️ Запустить майнер',
        isActive ? 'stop_miner' : 'start_miner'
      )
    ],
    [
      Markup.button.callback('⬆️ Улучшить майнер', 'upgrade_miner'),
      Markup.button.callback('📊 Статистика', 'miner_stats')
    ],
    [Markup.button.callback('🔙 Назад', 'main_menu')]
  ]);
  
  const message = 
    `⛏️ *Майнер*\n\n` +
    `📊 *Статус:* ${statusText}\n` +
    `📈 *Уровень:* ${miner.level}\n` +
    `⚡ *Эффективность:* ${efficiency}x\n` +
    `💰 *Награда/час:* ${formatNumber(rewardPerHour)} Stars\n` +
    `💎 *Всего добыто:* ${formatNumber(miner.totalMined)} Stars${lastRewardText}\n\n` +
    `🎯 Выберите действие:`;
  
    log(`📝 Отправка обновленного меню майнера для пользователя ${user.id}`);
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    log(`✅ Меню майнера успешно обновлено для пользователя ${user.id}`);
  } catch (error) {
    logError(error, `Обновление меню майнера для пользователя ${user.id}`);
    // Если не удалось обновить, показываем новое меню
    log(`🔄 Fallback: показ нового меню майнера для пользователя ${user.id}`);
    await showMinerMenu(ctx, user);
  }
}
}

async function updateFarmMenu(ctx, user) {
  try {
    log(`🔄 Обновление меню фарма для пользователя ${user.id}`);
    
    const farm = user.farm;
    const now = Date.now();
    const lastFarm = farm.lastFarm ? farm.lastFarm.getTime() : 0;
    const timeSince = Math.floor((now - lastFarm) / 1000);
    const cooldown = config.FARM_COOLDOWN;
  
  const canFarm = timeSince >= cooldown;
  const remainingTime = canFarm ? 0 : cooldown - timeSince;
  
  const baseReward = config.FARM_BASE_REWARD;
  const bonus = Math.min(user.level * 0.1, 2);
  const totalReward = baseReward + bonus;
  
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        canFarm ? '🌾 Фармить' : `⏳ ${formatTime(remainingTime)}`,
        canFarm ? 'do_farm' : 'farm_cooldown'
      )
    ],
    [
      Markup.button.callback('📊 Статистика', 'farm_stats'),
      Markup.button.callback('🎯 Бонусы', 'farm_bonuses')
    ],
    [Markup.button.callback('🔙 Назад', 'main_menu')]
  ]);
  
  const message = 
    `🌾 *Фарм*\n\n` +
    `⏰ *Статус:* ${canFarm ? '🟢 Готов' : '🔴 Кулдаун'}\n` +
    `💰 *Базовая награда:* ${formatNumber(baseReward)} Stars\n` +
    `🎯 *Бонус за уровень:* +${formatNumber(bonus)} Stars\n` +
    `💎 *Итого награда:* ${formatNumber(totalReward)} Stars\n` +
    `📊 *Всего фармов:* ${farm.farmCount}\n` +
    `💎 *Всего заработано:* ${formatNumber(farm.totalFarmEarnings)} Stars\n\n` +
    `🎯 Выберите действие:`;
  
    log(`📝 Отправка обновленного меню фарма для пользователя ${user.id}`);
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    log(`✅ Меню фарма успешно обновлено для пользователя ${user.id}`);
  } catch (error) {
    logError(error, `Обновление меню фарма для пользователя ${user.id}`);
    // Если не удалось обновить, показываем новое меню
    log(`🔄 Fallback: показ нового меню фарма для пользователя ${user.id}`);
    await showFarmMenu(ctx, user);
  }
}
}

async function showBonusMenu(ctx, user) {
  const bonus = user.dailyBonus;
  const now = new Date();
  const lastBonus = bonus.lastBonus;
  
  let canClaim = false;
  let timeUntilNext = 0;
  
  if (!lastBonus) {
    canClaim = true;
  } else {
    const timeSince = now.getTime() - lastBonus.getTime();
    const dayInMs = 24 * 60 * 60 * 1000;
    
    if (timeSince >= dayInMs) {
      canClaim = true;
    } else {
      timeUntilNext = dayInMs - timeSince;
    }
  }
  
  const baseReward = config.DAILY_BONUS_BASE;
  const streakBonus = Math.min(bonus.streak * 0.5, 5);
  const totalReward = baseReward + streakBonus;
  
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        canClaim ? '🎁 Получить бонус' : `⏳ ${formatTime(Math.floor(timeUntilNext / 1000))}`,
        canClaim ? 'claim_bonus' : 'bonus_cooldown'
      )
    ],
    [
      Markup.button.callback('📊 Статистика', 'bonus_stats'),
      Markup.button.callback('🔥 Серия', 'bonus_streak')
    ],
    [Markup.button.callback('🔙 Назад', 'main_menu')]
  ]);
  
  const message = 
    `🎁 *Ежедневный бонус*\n\n` +
    `⏰ *Статус:* ${canClaim ? '🟢 Доступен' : '🔴 Кулдаун'}\n` +
    `💰 *Базовая награда:* ${formatNumber(baseReward)} Stars\n` +
    `🔥 *Бонус серии:* +${formatNumber(streakBonus)} Stars\n` +
    `💎 *Итого награда:* ${formatNumber(totalReward)} Stars\n` +
    `📊 *Текущая серия:* ${bonus.streak} дней\n` +
    `🏆 *Максимальная серия:* ${bonus.maxStreak} дней\n\n` +
    `🎯 Выберите действие:`;
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

async function updateBonusMenu(ctx, user) {
  try {
    log(`🔄 Обновление меню бонуса для пользователя ${user.id}`);
    
    const bonus = user.dailyBonus;
    const now = new Date();
    const lastBonus = bonus.lastBonus;
  
  let canClaim = false;
  let timeUntilNext = 0;
  
  if (!lastBonus) {
    canClaim = true;
  } else {
    const timeSince = now.getTime() - lastBonus.getTime();
    const dayInMs = 24 * 60 * 60 * 1000;
    
    if (timeSince >= dayInMs) {
      canClaim = true;
    } else {
      timeUntilNext = dayInMs - timeSince;
    }
  }
  
  const baseReward = config.DAILY_BONUS_BASE;
  const streakBonus = Math.min(bonus.streak * 0.5, 5);
  const totalReward = baseReward + streakBonus;
  
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        canClaim ? '🎁 Получить бонус' : `⏳ ${formatTime(Math.floor(timeUntilNext / 1000))}`,
        canClaim ? 'claim_bonus' : 'bonus_cooldown'
      )
    ],
    [
      Markup.button.callback('📊 Статистика', 'bonus_stats'),
      Markup.button.callback('🔥 Серия', 'bonus_streak')
    ],
    [Markup.button.callback('🔙 Назад', 'main_menu')]
  ]);
  
  const message = 
    `🎁 *Ежедневный бонус*\n\n` +
    `⏰ *Статус:* ${canClaim ? '🟢 Доступен' : '🔴 Кулдаун'}\n` +
    `💰 *Базовая награда:* ${formatNumber(baseReward)} Stars\n` +
    `🔥 *Бонус серии:* +${formatNumber(streakBonus)} Stars\n` +
    `💎 *Итого награда:* ${formatNumber(totalReward)} Stars\n` +
    `📊 *Текущая серия:* ${bonus.streak} дней\n` +
    `🏆 *Максимальная серия:* ${bonus.maxStreak} дней\n\n` +
    `🎯 Выберите действие:`;
  
    log(`📝 Отправка обновленного меню бонуса для пользователя ${user.id}`);
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    log(`✅ Меню бонуса успешно обновлено для пользователя ${user.id}`);
  } catch (error) {
    logError(error, `Обновление меню бонуса для пользователя ${user.id}`);
    // Если не удалось обновить, показываем новое меню
    log(`🔄 Fallback: показ нового меню бонуса для пользователя ${user.id}`);
    await showBonusMenu(ctx, user);
  }
}
}

async function claimBonus(ctx, user) {
  try {
    log(`🎁 Попытка получения бонуса для пользователя ${user.id}`);
    
    const bonus = user.dailyBonus;
    const now = new Date();
    const lastBonus = bonus.lastBonus;
    
    if (lastBonus) {
      const timeSince = now.getTime() - lastBonus.getTime();
      const dayInMs = 24 * 60 * 60 * 1000;
      
      log(`⏰ Время с последнего бонуса: ${Math.floor(timeSince / 1000)}с`);
      
      if (timeSince < dayInMs) {
        const remaining = dayInMs - timeSince;
        log(`⏳ Кулдаун бонуса для пользователя ${user.id}, осталось: ${Math.floor(remaining / 1000)}с`);
        await ctx.answerCbQuery(`⏳ Подождите ${formatTime(Math.floor(remaining / 1000))} до следующего бонуса!`);
        return;
      }
    }
    
    const baseReward = config.DAILY_BONUS_BASE;
    const streakBonus = Math.min(bonus.streak * 0.5, 5);
    const totalReward = baseReward + streakBonus;
    
    log(`💰 Расчет бонуса: базовая ${baseReward}, серия ${bonus.streak}, бонус серии ${streakBonus}, итого ${totalReward} Stars`);
    
    // Проверяем, не пропустил ли день
    let newStreak = bonus.streak + 1;
    if (lastBonus) {
      const timeSince = now.getTime() - lastBonus.getTime();
      const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
      if (timeSince > twoDaysInMs) {
        newStreak = 1; // Сбрасываем серию
        log(`🔄 Сброс серии бонусов для пользователя ${user.id} (пропущен день)`);
      }
    }
    
    log(`📈 Новая серия бонусов: ${newStreak}`);
    
    // Обновляем пользователя
    log(`💾 Обновление базы данных для пользователя ${user.id}`);
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $inc: { 
          stars: totalReward,
          totalEarnedStars: totalReward,
          experience: Math.floor(totalReward * 5),
          'statistics.totalActions': 1
        },
        $set: { 
          'dailyBonus.lastBonus': now,
          'dailyBonus.streak': newStreak,
          'dailyBonus.maxStreak': Math.max(newStreak, bonus.maxStreak),
          updatedAt: new Date()
        }
      }
    );
    
    log(`🗑️ Очистка кеша для пользователя ${user.id}`);
    userCache.delete(user.id);
    
    log(`✅ Бонус успешно получен для пользователя ${user.id}, заработано: ${totalReward} Stars, серия: ${newStreak} дней`);
    await ctx.answerCbQuery(
      `🎁 Бонус получен! Заработано: ${formatNumber(totalReward)} Stars, серия: ${newStreak} дней`
    );
    
    log(`🔄 Обновление меню бонуса для пользователя ${user.id}`);
    // Обновляем меню бонуса
    await updateBonusMenu(ctx, { ...user, dailyBonus: { ...bonus, lastBonus: now, streak: newStreak } });
  } catch (error) {
    logError(error, 'Получение бонуса');
    await ctx.answerCbQuery('❌ Ошибка получения бонуса');
  }
}

// ==================== ОБРАБОТКА МАЙНЕРА ====================
async function processMinerRewards() {
  try {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const activeMiners = await db.collection('users').find({
      'miner.active': true,
      'miner.lastReward': { $lt: hourAgo }
    }).toArray();
    
    for (const user of activeMiners) {
      const reward = config.MINER_REWARD_PER_HOUR * user.miner.efficiency;
      
      await db.collection('users').updateOne(
        { id: user.id },
        { 
          $inc: { 
            stars: reward,
            totalEarnedStars: reward,
            experience: Math.floor(reward * 5),
            'miner.totalMined': reward
          },
          $set: { 
            'miner.lastReward': now,
            updatedAt: new Date()
          }
        }
      );
      
      userCache.delete(user.id);
      log(`⛏️ Майнер награда: ${user.id} +${reward} Stars`);
    }
  } catch (error) {
    logError(error, 'Обработка наград майнера');
  }
}

// ==================== ЛОГИРОВАНИЕ ====================
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type}] ${message}`;
  console.log(logMessage);
}

// Логирование ошибок
function logError(error, context = '') {
  const timestamp = new Date().toISOString();
  const errorMessage = `[${timestamp}] [ERROR] ${context}: ${error.message}`;
  console.error(errorMessage);
  if (error.stack) {
    console.error(`[${timestamp}] [ERROR] Stack: ${error.stack}`);
  }
}

// ==================== СОЗДАНИЕ БОТА ====================
const bot = new Telegraf(config.BOT_TOKEN);

// Обработка команды /start
bot.start(async (ctx) => {
  try {
    const user = await getUser(ctx.from.id, ctx);
    if (!user) {
      await ctx.reply('❌ Ошибка создания пользователя');
      return;
    }
    
    // Проверяем подписку
    const isSubscribed = await checkSubscription(ctx);
    if (!isSubscribed) {
      await showSubscriptionMessage(ctx);
      return;
    }
    
    // Обрабатываем реферальную ссылку
    const startPayload = ctx.startPayload;
    if (startPayload && startPayload !== user.id.toString()) {
      await handleReferral(user.id, parseInt(startPayload));
    }
    
    await showMainMenu(ctx, user);
  } catch (error) {
    logError(error, 'Команда /start');
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Обработка кнопок главного меню
bot.action('main_menu', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showMainMenu(ctx, user);
  } catch (error) {
    logError(error, 'Главное меню');
  }
});

// Майнинг
bot.action('miner', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showMinerMenu(ctx, user);
  } catch (error) {
    logError(error, 'Меню майнера');
  }
});

bot.action('start_miner', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await startMiner(ctx, user);
  } catch (error) {
    logError(error, 'Запуск майнера (обработчик)');
  }
});

bot.action('stop_miner', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await stopMiner(ctx, user);
  } catch (error) {
    logError(error, 'Остановка майнера (обработчик)');
  }
});

// Фарм
bot.action('farm', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showFarmMenu(ctx, user);
  } catch (error) {
    logError(error, 'Меню фарма');
  }
});

bot.action('do_farm', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await doFarm(ctx, user);
  } catch (error) {
    logError(error, 'Фарм (обработчик)');
  }
});

// Бонус
bot.action('bonus', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showBonusMenu(ctx, user);
  } catch (error) {
    logError(error, 'Меню бонуса');
  }
});

bot.action('claim_bonus', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await claimBonus(ctx, user);
  } catch (error) {
    logError(error, 'Получение бонуса (обработчик)');
  }
});

// Обработка кулдаунов
bot.action('farm_cooldown', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await ctx.answerCbQuery('⏳ Подождите окончания кулдауна!');
  } catch (error) {
    logError(error, 'Кулдаун фарма');
  }
});

bot.action('bonus_cooldown', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await ctx.answerCbQuery('⏳ Подождите до следующего бонуса!');
  } catch (error) {
    logError(error, 'Кулдаун бонуса');
  }
});

// Проверка подписки
bot.action('check_subscription', async (ctx) => {
  try {
    const isSubscribed = await checkSubscription(ctx);
    if (isSubscribed) {
      const user = await getUser(ctx.from.id);
      if (!user) return;
      
      await showMainMenu(ctx, user);
    } else {
      await showSubscriptionMessage(ctx);
    }
  } catch (error) {
    logError(error, 'Проверка подписки (обработчик)');
    // В случае ошибки показываем главное меню
    const user = await getUser(ctx.from.id);
    if (user) {
      await showMainMenu(ctx, user);
    }
  }
});

// Обработка ошибок
bot.catch((err, ctx) => {
  logError(err, `Обработка ${ctx.updateType}`);
});

// ==================== ЗАПУСК БОТА ====================
async function startBot() {
  try {
    log('🔗 Подключение к базе данных...');
    await connectDB();
    log('✅ База данных подключена успешно');
    
    log('🌐 Запуск HTTP сервера...');
    // Запускаем HTTP сервер для health check
    startHttpServer();
    log('✅ HTTP сервер запущен');
    
    log('⏰ Настройка интервалов...');
    // Запускаем обработку майнера каждые 30 минут
    setInterval(processMinerRewards, 30 * 60 * 1000);
    
    // Очистка кеша каждые 5 минут
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of userCache.entries()) {
        if (now - value.timestamp > config.USER_CACHE_TTL) {
          userCache.delete(key);
        }
      }
      for (const [key, value] of statsCache.entries()) {
        if (now - value.timestamp > config.STATS_CACHE_TTL) {
          statsCache.delete(key);
        }
      }
    }, 5 * 60 * 1000);
    
    await bot.launch();
    log('🚀 Magnum Stars Bot запущен!');
    
    // Graceful stop
    process.once('SIGINT', () => {
      log('🛑 Получен сигнал SIGINT, останавливаем бота...');
      if (server) {
        server.close(() => {
          log('🌐 HTTP сервер остановлен');
          bot.stop('SIGINT');
        });
      } else {
        bot.stop('SIGINT');
      }
    });
    
    process.once('SIGTERM', () => {
      log('🛑 Получен сигнал SIGTERM, останавливаем бота...');
      if (server) {
        server.close(() => {
          log('🌐 HTTP сервер остановлен');
          bot.stop('SIGTERM');
        });
      } else {
        bot.stop('SIGTERM');
      }
    });
  } catch (error) {
    logError(error, 'Запуск бота');
    process.exit(1);
  }
}

// Обработчики необработанных ошибок
process.on('uncaughtException', (error) => {
  logError(error, 'Необработанная ошибка (uncaughtException)');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(new Error(`Необработанное отклонение промиса: ${reason}`), 'unhandledRejection');
  process.exit(1);
});

// Запускаем бота
startBot();