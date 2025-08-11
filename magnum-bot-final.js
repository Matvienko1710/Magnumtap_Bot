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
    if (cached) {
      // Проверяем, не заблокирован ли пользователь
      if (cached.banned) {
        if (ctx) {
          await ctx.reply('🚫 Вы заблокированы в боте. Обратитесь к администратору.');
        }
        return null;
      }
      return cached;
    }

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
      // Проверяем, не заблокирован ли пользователь
      if (user.banned) {
        if (ctx) {
          await ctx.reply('🚫 Вы заблокированы в боте. Обратитесь к администратору.');
        }
        return null;
      }
      
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
          magnumCoins: config.REFERRAL_BONUS,
          totalEarnedMagnumCoins: config.REFERRAL_BONUS
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
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

async function showMainMenuStart(ctx, user) {
  const rank = getUserRank(user);
  
  // Создаем базовые кнопки
  const buttons = [
    [
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
  
  await ctx.editMessageText(message, {
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
    [
      Markup.button.callback('⛏️ Майнер', 'miner')
    ],
    [Markup.button.callback('🔙 Назад', 'main_menu')]
  ]);
  
  const message = 
    `🌾 *Фарм*\n\n` +
    `⏰ *Статус:* ${canFarm ? '🟢 Готов' : '🔴 Кулдаун'}\n` +
    `💰 *Базовая награда:* ${formatNumber(baseReward)} Magnum Coins\n` +
    `🎯 *Бонус за уровень:* +${formatNumber(bonus)} Magnum Coins\n` +
    `💎 *Итого награда:* ${formatNumber(totalReward)} Magnum Coins\n` +
    `📊 *Всего фармов:* ${farm.farmCount}\n` +
    `💎 *Всего заработано:* ${formatNumber(farm.totalFarmEarnings)} Magnum Coins\n\n` +
    `🎯 Выберите действие:`;
  
  await ctx.editMessageText(message, {
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
      
      // Запускаем таймер для автоматического обновления меню после истечения кулдауна
      setTimeout(async () => {
        try {
          const updatedUser = await getUser(ctx.from.id);
          if (updatedUser) {
            await updateFarmMenu(ctx, updatedUser);
            log(`🔄 Автоматическое обновление меню фарма для пользователя ${user.id} после истечения кулдауна`);
          }
        } catch (error) {
          logError(error, 'Автоматическое обновление меню фарма');
        }
      }, remaining * 1000);
      
      return;
    }
    
    const baseReward = config.FARM_BASE_REWARD;
    const bonus = Math.min(user.level * 0.1, 2);
    const totalReward = baseReward + bonus;
    
    log(`💰 Расчет награды: базовая ${baseReward}, бонус ${bonus}, итого ${totalReward} Magnum Coins`);
    
    // Обновляем пользователя
    log(`💾 Обновление базы данных для пользователя ${user.id}`);
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $inc: { 
          magnumCoins: totalReward,
          totalEarnedMagnumCoins: totalReward,
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
    
    log(`✅ Фарм успешно завершен для пользователя ${user.id}, заработано: ${totalReward} Magnum Coins`);
    await ctx.answerCbQuery(
      `🌾 Фарм завершен! Заработано: ${formatNumber(totalReward)} Magnum Coins`
    );
    
    log(`🔄 Обновление меню фарма для пользователя ${user.id}`);
    // Обновляем меню фарма
    await updateFarmMenu(ctx, { ...user, farm: { ...farm, lastFarm: new Date() } });
  } catch (error) {
    logError(error, 'Фарм');
    await ctx.answerCbQuery('❌ Ошибка фарма');
  }
}

// ==================== СТАТИСТИКА ФАРМА ====================
async function showFarmStats(ctx, user) {
  try {
    log(`📊 Показ статистики фарма для пользователя ${user.id}`);
    
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
      [Markup.button.callback('🔙 Назад', 'farm')]
    ]);
    
    const message = 
      `🌾 *Статистика фарма*\n\n` +
      `📊 *Общая статистика:*\n` +
      `├ Всего фармов: \`${farm.farmCount || 0}\`\n` +
      `├ Всего заработано: \`${formatNumber(farm.totalFarmEarnings || 0)}\` Magnum Coins\n` +
      `└ Средняя награда: \`${farm.farmCount > 0 ? formatNumber((farm.totalFarmEarnings || 0) / farm.farmCount) : '0.00'}\` Magnum Coins\n\n` +
      `⏰ *Текущий статус:*\n` +
      `├ Статус: ${canFarm ? '🟢 Готов' : '🔴 Кулдаун'}\n` +
      `├ Базовая награда: \`${formatNumber(baseReward)}\` Magnum Coins\n` +
      `├ Бонус за уровень: \`+${formatNumber(bonus)}\` Magnum Coins\n` +
      `└ Итого награда: \`${formatNumber(totalReward)}\` Magnum Coins\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ статистики фарма');
    await ctx.answerCbQuery('❌ Ошибка загрузки статистики');
  }
}

// ==================== БОНУСЫ ФАРМА ====================
async function showFarmBonuses(ctx, user) {
  try {
    log(`🎯 Показ бонусов фарма для пользователя ${user.id}`);
    
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
      [Markup.button.callback('🔙 Назад', 'farm')]
    ]);
    
    const message = 
      `🎯 *Бонусы фарма*\n\n` +
      `💰 *Система бонусов:*\n` +
      `├ Базовая награда: \`${formatNumber(baseReward)}\` Magnum Coins\n` +
      `├ Бонус за уровень: \`+${formatNumber(bonus)}\` Magnum Coins\n` +
      `└ Итого награда: \`${formatNumber(totalReward)}\` Magnum Coins\n\n` +
      `📈 *Как увеличить бонусы:*\n` +
      `├ Повышайте уровень для увеличения бонуса\n` +
      `├ Максимальный бонус: \`+2.00\` Magnum Coins\n` +
      `└ Текущий уровень: \`${user.level || 1}\`\n\n` +
      `⏰ *Текущий статус:*\n` +
      `├ Статус: ${canFarm ? '🟢 Готов' : '🔴 Кулдаун'}\n` +
      `└ ${canFarm ? 'Можете фармить!' : `Осталось: ${formatTime(remainingTime)}`}\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ бонусов фарма');
    await ctx.answerCbQuery('❌ Ошибка загрузки бонусов');
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
    [
      Markup.button.callback('⛏️ Майнер', 'miner')
    ],
    [Markup.button.callback('🔙 Назад', 'main_menu')]
  ]);
  
  const message = 
    `🌾 *Фарм*\n\n` +
    `⏰ *Статус:* ${canFarm ? '🟢 Готов' : '🔴 Кулдаун'}\n` +
    `💰 *Базовая награда:* ${formatNumber(baseReward)} Magnum Coins\n` +
    `🎯 *Бонус за уровень:* +${formatNumber(bonus)} Magnum Coins\n` +
    `💎 *Итого награда:* ${formatNumber(totalReward)} Magnum Coins\n` +
    `📊 *Всего фармов:* ${farm.farmCount}\n` +
    `💎 *Всего заработано:* ${formatNumber(farm.totalFarmEarnings)} Magnum Coins\n\n` +
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
    `💰 *Базовая награда:* ${formatNumber(baseReward)} Magnum Coins\n` +
    `🔥 *Бонус серии:* +${formatNumber(streakBonus)} Magnum Coins\n` +
    `💎 *Итого награда:* ${formatNumber(totalReward)} Magnum Coins\n` +
    `📊 *Текущая серия:* ${bonus.streak} дней\n` +
    `🏆 *Максимальная серия:* ${bonus.maxStreak} дней\n\n` +
    `🎯 Выберите действие:`;
  
  await ctx.editMessageText(message, {
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
    `💰 *Базовая награда:* ${formatNumber(baseReward)} Magnum Coins\n` +
    `🔥 *Бонус серии:* +${formatNumber(streakBonus)} Magnum Coins\n` +
    `💎 *Итого награда:* ${formatNumber(totalReward)} Magnum Coins\n` +
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
      
      // Запускаем таймер для автоматического обновления меню после истечения кулдауна
      setTimeout(async () => {
        try {
          const updatedUser = await getUser(ctx.from.id);
          if (updatedUser) {
            await updateBonusMenu(ctx, updatedUser);
            log(`🔄 Автоматическое обновление меню бонуса для пользователя ${user.id} после истечения кулдауна`);
          }
        } catch (error) {
          logError(error, 'Автоматическое обновление меню бонуса');
        }
      }, remaining);
      
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
          magnumCoins: totalReward,
          totalEarnedMagnumCoins: totalReward,
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
    
    log(`✅ Бонус успешно получен для пользователя ${user.id}, заработано: ${totalReward} Magnum Coins, серия: ${newStreak} дней`);
    await ctx.answerCbQuery(
      `🎁 Бонус получен! Заработано: ${formatNumber(totalReward)} Magnum Coins, серия: ${newStreak} дней`
    );
    
    log(`🔄 Обновление меню бонуса для пользователя ${user.id}`);
    // Обновляем меню бонуса
    await updateBonusMenu(ctx, { ...user, dailyBonus: { ...bonus, lastBonus: now, streak: newStreak } });
  } catch (error) {
    logError(error, 'Получение бонуса');
    await ctx.answerCbQuery('❌ Ошибка получения бонуса');
  }
}

// ==================== СТАТИСТИКА БОНУСА ====================
async function showBonusStats(ctx, user) {
  try {
    log(`📊 Показ статистики бонуса для пользователя ${user.id}`);
    
    const bonus = user.dailyBonus;
    const totalEarned = bonus.totalEarned || 0;
    const claimedCount = bonus.claimedCount || 0;
    const maxStreak = bonus.maxStreak || 0;
    const currentStreak = bonus.streak || 0;
    
    const averageReward = claimedCount > 0 ? totalEarned / claimedCount : 0;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'bonus')]
    ]);
    
    const message = 
      `📊 *Статистика бонусов*\n\n` +
      `💰 *Общая статистика:*\n` +
      `├ Получено бонусов: \`${claimedCount}\`\n` +
      `├ Всего заработано: \`${formatNumber(totalEarned)}\` Magnum Coins\n` +
      `├ Средняя награда: \`${formatNumber(averageReward)}\` Magnum Coins\n` +
      `└ Максимальная серия: \`${maxStreak}\` дней\n\n` +
      `🔥 *Текущая серия:*\n` +
      `├ Активная серия: \`${currentStreak}\` дней\n` +
      `└ Рекордная серия: \`${maxStreak}\` дней\n\n` +
      `📈 *Прогресс:*\n` +
      `├ До 7 дней: \`${Math.min(currentStreak, 7)}/7\`\n` +
      `├ До 30 дней: \`${Math.min(currentStreak, 30)}/30\`\n` +
      `└ До 100 дней: \`${Math.min(currentStreak, 100)}/100\`\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Статистика бонуса показана для пользователя ${user.id}`);
  } catch (error) {
    logError(error, `Показ статистики бонуса для пользователя ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа статистики');
  }
}

async function showBonusStreak(ctx, user) {
  try {
    log(`🔥 Показ серии бонусов для пользователя ${user.id}`);
    
    const bonus = user.dailyBonus;
    const currentStreak = bonus.streak || 0;
    const maxStreak = bonus.maxStreak || 0;
    const lastBonus = bonus.lastBonus;
    
    // Рассчитываем время до следующего бонуса
    let timeUntilNext = 0;
    if (lastBonus) {
      const now = new Date();
      const timeSince = now.getTime() - lastBonus.getTime();
      const dayInMs = 24 * 60 * 60 * 1000;
      timeUntilNext = Math.max(0, dayInMs - timeSince);
    }
    
    const canClaim = timeUntilNext === 0;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          canClaim ? '🎁 Получить бонус' : `⏳ ${formatTime(Math.floor(timeUntilNext / 1000))}`,
          canClaim ? 'claim_bonus' : 'bonus_cooldown'
        )
      ],
      [Markup.button.callback('🔙 Назад', 'bonus')]
    ]);
    
    const message = 
      `🔥 *Серия бонусов*\n\n` +
      `📊 *Ваша серия:*\n` +
      `├ Текущая серия: \`${currentStreak}\` дней\n` +
      `├ Рекордная серия: \`${maxStreak}\` дней\n` +
      `└ Статус: ${canClaim ? '🟢 Можете получить' : '🔴 Кулдаун'}\n\n` +
      `⏰ *Время до следующего бонуса:*\n` +
      `└ ${canClaim ? 'Сейчас доступен!' : formatTime(Math.floor(timeUntilNext / 1000))}\n\n` +
      `🏆 *Достижения серии:*\n` +
      `├ 7 дней подряд: ${currentStreak >= 7 ? '✅' : '❌'}\n` +
      `├ 30 дней подряд: ${currentStreak >= 30 ? '✅' : '❌'}\n` +
      `└ 100 дней подряд: ${currentStreak >= 100 ? '✅' : '❌'}\n\n` +
      `💡 *Совет:* Чем длиннее серия, тем больше бонус!\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Серия бонусов показана для пользователя ${user.id}`);
  } catch (error) {
    logError(error, `Показ серии бонусов для пользователя ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа серии');
  }
}

// ==================== АДМИН ПАНЕЛЬ ====================
async function showAdminPanel(ctx, user) {
  try {
    log(`👨‍💼 Показ админ панели для пользователя ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Статистика бота', 'admin_stats'),
        Markup.button.callback('👥 Управление пользователями', 'admin_users')
      ],
      [
        Markup.button.callback('💰 Управление балансами', 'admin_balance'),
        Markup.button.callback('⚙️ Настройки бота', 'admin_settings')
      ],
      [
        Markup.button.callback('📢 Рассылка', 'admin_broadcast'),
        Markup.button.callback('🔄 Обновление кеша', 'admin_cache')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ]);
    
    const message = 
      `👨‍💼 *Админ панель*\n\n` +
      `Добро пожаловать в панель администратора!\n\n` +
      `🔧 *Доступные функции:*\n` +
      `├ 📊 Статистика бота - общая статистика\n` +
      `├ 👥 Управление пользователями - поиск и управление\n` +
      `├ 💰 Управление балансами - изменение балансов\n` +
      `├ ⚙️ Настройки бота - конфигурация\n` +
      `├ 📢 Рассылка - отправка сообщений\n` +
      `└ 🔄 Обновление кеша - очистка кеша\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Админ панель показана для пользователя ${user.id}`);
  } catch (error) {
    logError(error, `Показ админ панели для пользователя ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа админ панели');
  }
}

async function showAdminStats(ctx, user) {
  try {
    log(`📊 Показ статистики бота для админа ${user.id}`);
    
    // Получаем статистику из базы данных
    const totalUsers = await db.collection('users').countDocuments();
    const activeUsers = await db.collection('users').countDocuments({
      'lastSeen': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    const newUsersToday = await db.collection('users').countDocuments({
      'createdAt': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    // Статистика по валютам
    const totalMagnumCoins = await db.collection('users').aggregate([
      { $group: { _id: null, total: { $sum: '$magnumCoins' } } }
    ]).toArray();
    
    const totalStars = await db.collection('users').aggregate([
      { $group: { _id: null, total: { $sum: '$stars' } } }
    ]).toArray();
    
    const totalMagnum = totalMagnumCoins.length > 0 ? totalMagnumCoins[0].total : 0;
    const totalStarsAmount = totalStars.length > 0 ? totalStars[0].total : 0;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin')]
    ]);
    
    const message = 
      `📊 *Статистика бота*\n\n` +
      `👥 *Пользователи:*\n` +
      `├ Всего пользователей: \`${totalUsers}\`\n` +
      `├ Активных за неделю: \`${activeUsers}\`\n` +
      `└ Новых за день: \`${newUsersToday}\`\n\n` +
      `💰 *Экономика:*\n` +
      `├ Всего Magnum Coins: \`${formatNumber(totalMagnum)}\`\n` +
      `└ Всего Stars: \`${formatNumber(totalStarsAmount)}\`\n\n` +
      `📈 *Активность:*\n` +
      `├ Средняя активность: \`${Math.round((activeUsers / totalUsers) * 100)}%\`\n` +
      `└ Прирост за день: \`${newUsersToday}\` пользователей\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Статистика бота показана для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ статистики бота для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа статистики');
  }
}

async function showAdminUsers(ctx, user) {
  try {
    log(`👥 Показ управления пользователями для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔍 Поиск пользователя', 'admin_search_user'),
        Markup.button.callback('📊 Топ пользователей', 'admin_top_users')
      ],
      [
        Markup.button.callback('🚫 Заблокировать', 'admin_ban_user'),
        Markup.button.callback('✅ Разблокировать', 'admin_unban_user')
      ],
      [Markup.button.callback('🔙 Назад', 'admin')]
    ]);
    
    const message = 
      `👥 *Управление пользователями*\n\n` +
      `🔧 *Доступные действия:*\n` +
      `├ 🔍 Поиск пользователя - найти по ID\n` +
      `├ 📊 Топ пользователей - лучшие игроки\n` +
      `├ 🚫 Заблокировать - ограничить доступ\n` +
      `└ ✅ Разблокировать - восстановить доступ\n\n` +
      `💡 *Совет:* Используйте поиск для быстрого нахождения пользователей\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Управление пользователями показано для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ управления пользователями для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа управления пользователями');
  }
}

async function showAdminBalance(ctx, user) {
  try {
    log(`💰 Показ управления балансами для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Добавить Magnum Coins', 'admin_add_magnum'),
        Markup.button.callback('➖ Убрать Magnum Coins', 'admin_remove_magnum')
      ],
      [
        Markup.button.callback('➕ Добавить Stars', 'admin_add_stars'),
        Markup.button.callback('➖ Убрать Stars', 'admin_remove_stars')
      ],
      [
        Markup.button.callback('💰 Массовая выдача', 'admin_mass_give'),
        Markup.button.callback('📊 Статистика балансов', 'admin_balance_stats')
      ],
      [Markup.button.callback('🔙 Назад', 'admin')]
    ]);
    
    const message = 
      `💰 *Управление балансами*\n\n` +
      `🔧 *Доступные действия:*\n` +
      `├ ➕ Добавить Magnum Coins - пополнить баланс\n` +
      `├ ➖ Убрать Magnum Coins - списать средства\n` +
      `├ ➕ Добавить Stars - выдать звезды\n` +
      `├ ➖ Убрать Stars - списать звезды\n` +
      `├ 💰 Массовая выдача - всем пользователям\n` +
      `└ 📊 Статистика балансов - общая статистика\n\n` +
      `⚠️ *Внимание:* Все изменения необратимы!\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Управление балансами показано для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ управления балансами для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа управления балансами');
  }
}

async function showAdminSettings(ctx, user) {
  try {
    log(`⚙️ Показ настроек бота для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🎯 Награды фарма', 'admin_farm_rewards'),
        Markup.button.callback('⏰ Кулдауны', 'admin_cooldowns')
      ],
      [
        Markup.button.callback('🎁 Ежедневный бонус', 'admin_daily_bonus'),
        Markup.button.callback('⛏️ Настройки майнера', 'admin_miner_settings')
      ],
      [
        Markup.button.callback('👥 Реферальная система', 'admin_referral_settings'),
        Markup.button.callback('📢 Каналы подписки', 'admin_subscription_channels')
      ],
      [Markup.button.callback('🔙 Назад', 'admin')]
    ]);
    
    const message = 
      `⚙️ *Настройки бота*\n\n` +
      `🔧 *Текущие настройки:*\n` +
      `├ 🎯 Базовая награда фарма: \`${config.FARM_BASE_REWARD}\` Magnum Coins\n` +
      `├ ⏰ Кулдаун фарма: \`${config.FARM_COOLDOWN}\` секунд\n` +
      `├ 🎁 Базовый бонус: \`${config.DAILY_BONUS_BASE}\` Magnum Coins\n` +
      `├ ⛏️ Награда майнера: \`${config.MINER_REWARD_PER_HOUR}\` Magnum Coins/час\n` +
      `├ 👥 Реферальная награда: \`${config.REFERRAL_REWARD}\` Magnum Coins\n` +
      `└ 📢 Обязательный канал: \`${config.REQUIRED_CHANNEL || 'Не настроен'}\`\n\n` +
      `🎯 Выберите настройку для изменения:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Настройки бота показаны для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ настроек бота для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа настроек');
  }
}

async function showAdminFarmRewards(ctx, user) {
  try {
    log(`🎯 Показ настроек наград фарма для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Увеличить награду', 'admin_farm_reward_increase'),
        Markup.button.callback('➖ Уменьшить награду', 'admin_farm_reward_decrease')
      ],
      [
        Markup.button.callback('🎯 Установить точное значение', 'admin_farm_reward_set'),
        Markup.button.callback('📊 Статистика наград', 'admin_farm_reward_stats')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_settings')]
    ]);
    
    const message = 
      `🎯 *Награды фарма*\n\n` +
      `💰 *Текущие настройки:*\n` +
      `├ Базовая награда: \`${config.FARM_BASE_REWARD}\` Magnum Coins\n` +
      `├ Бонус за уровень: \`${Math.min(user.level * 0.1, 2)}\` Magnum Coins\n` +
      `└ Максимальная награда: \`${config.FARM_BASE_REWARD + 2}\` Magnum Coins\n\n` +
      `📊 *Статистика:*\n` +
      `├ Всего фармов: \`${user.farm?.farmCount || 0}\`\n` +
      `├ Заработано фармом: \`${formatNumber(user.farm?.totalFarmEarnings || 0)}\` Magnum Coins\n` +
      `└ Средняя награда: \`${user.farm?.farmCount > 0 ? formatNumber((user.farm?.totalFarmEarnings || 0) / user.farm?.farmCount) : '0.00'}\` Magnum Coins\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Настройки наград фарма показаны для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ настроек наград фарма для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа настроек наград');
  }
}

async function showAdminCooldowns(ctx, user) {
  try {
    log(`⏰ Показ настроек кулдаунов для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('⏰ Кулдаун фарма', 'admin_cooldown_farm'),
        Markup.button.callback('🎁 Кулдаун бонуса', 'admin_cooldown_bonus')
      ],
      [
        Markup.button.callback('⛏️ Кулдаун майнера', 'admin_cooldown_miner'),
        Markup.button.callback('📊 Статистика кулдаунов', 'admin_cooldown_stats')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_settings')]
    ]);
    
    const message = 
      `⏰ *Кулдауны*\n\n` +
      `⏳ *Текущие настройки:*\n` +
      `├ Фарм: \`${config.FARM_COOLDOWN}\` секунд (\`${Math.floor(config.FARM_COOLDOWN / 60)}\` минут)\n` +
      `├ Ежедневный бонус: \`24\` часа\n` +
      `└ Майнер: \`60\` минут\n\n` +
      `📊 *Статистика использования:*\n` +
      `├ Среднее время между фармами: \`${user.farm?.farmCount > 1 ? Math.floor(config.FARM_COOLDOWN / 60) : 'Н/Д'}\` минут\n` +
      `├ Последний фарм: ${user.farm?.lastFarm ? user.farm.lastFarm.toLocaleString() : 'Никогда'}\n` +
      `└ Последний бонус: ${user.dailyBonus?.lastBonus ? user.dailyBonus.lastBonus.toLocaleString() : 'Никогда'}\n\n` +
      `🎯 Выберите кулдаун для изменения:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Настройки кулдаунов показаны для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ настроек кулдаунов для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа настроек кулдаунов');
  }
}

async function showAdminDailyBonus(ctx, user) {
  try {
    log(`🎁 Показ настроек ежедневного бонуса для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('💰 Базовая награда', 'admin_bonus_base'),
        Markup.button.callback('🔥 Бонус серии', 'admin_bonus_streak')
      ],
      [
        Markup.button.callback('📊 Статистика бонусов', 'admin_bonus_stats'),
        Markup.button.callback('🎯 Настройка серии', 'admin_bonus_series')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_settings')]
    ]);
    
    const message = 
      `🎁 *Ежедневный бонус*\n\n` +
      `💰 *Текущие настройки:*\n` +
      `├ Базовая награда: \`${config.DAILY_BONUS_BASE}\` Magnum Coins\n` +
      `├ Бонус за серию: \`+0.5\` Magnum Coins за день\n` +
      `├ Максимальный бонус серии: \`5\` Magnum Coins\n` +
      `└ Максимальная награда: \`${config.DAILY_BONUS_BASE + 5}\` Magnum Coins\n\n` +
      `📊 *Статистика пользователя:*\n` +
      `├ Текущая серия: \`${user.dailyBonus?.streak || 0}\` дней\n` +
      `├ Максимальная серия: \`${user.dailyBonus?.maxStreak || 0}\` дней\n` +
      `├ Получено бонусов: \`${user.dailyBonus?.claimedCount || 0}\`\n` +
      `└ Заработано бонусами: \`${formatNumber(user.dailyBonus?.totalEarned || 0)}\` Magnum Coins\n\n` +
      `🎯 Выберите настройку для изменения:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Настройки ежедневного бонуса показаны для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ настроек ежедневного бонуса для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа настроек бонуса');
  }
}

async function showAdminMinerSettings(ctx, user) {
  try {
    log(`⛏️ Показ настроек майнера для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('💰 Награда за час', 'admin_miner_reward'),
        Markup.button.callback('⚡ Эффективность', 'admin_miner_efficiency')
      ],
      [
        Markup.button.callback('📊 Статистика майнера', 'admin_miner_stats'),
        Markup.button.callback('🎯 Настройка уровней', 'admin_miner_levels')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_settings')]
    ]);
    
    const message = 
      `⛏️ *Настройки майнера*\n\n` +
      `💰 *Текущие настройки:*\n` +
      `├ Награда за час: \`${config.MINER_REWARD_PER_HOUR}\` Magnum Coins\n` +
      `├ Базовая эффективность: \`1.0\`\n` +
      `├ Максимальная эффективность: \`5.0\`\n` +
      `└ Максимальная награда: \`${config.MINER_REWARD_PER_HOUR * 5}\` Magnum Coins/час\n\n` +
      `📊 *Статистика пользователя:*\n` +
      `├ Уровень майнера: \`${user.miner?.level || 1}\`\n` +
      `├ Эффективность: \`${user.miner?.efficiency || 1.0}\`\n` +
      `├ Статус: ${user.miner?.active ? '🟢 Активен' : '🔴 Неактивен'}\n` +
      `├ Всего добыто: \`${formatNumber(user.miner?.totalMined || 0)}\` Magnum Coins\n` +
      `└ Последняя награда: ${user.miner?.lastReward ? user.miner.lastReward.toLocaleString() : 'Никогда'}\n\n` +
      `🎯 Выберите настройку для изменения:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Настройки майнера показаны для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ настроек майнера для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа настроек майнера');
  }
}

async function showAdminReferralSettings(ctx, user) {
  try {
    log(`👥 Показ настроек реферальной системы для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('💰 Награда за реферала', 'admin_referral_reward'),
        Markup.button.callback('🏆 Бонусы за количество', 'admin_referral_bonuses')
      ],
      [
        Markup.button.callback('📊 Статистика рефералов', 'admin_referral_stats'),
        Markup.button.callback('🎯 Настройка уровней', 'admin_referral_levels')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_settings')]
    ]);
    
    const message = 
      `👥 *Реферальная система*\n\n` +
      `💰 *Текущие настройки:*\n` +
      `├ Награда за реферала: \`${config.REFERRAL_REWARD}\` Magnum Coins\n` +
      `├ Бонус за 5 рефералов: \`50\` Magnum Coins\n` +
      `├ Бонус за 10 рефералов: \`100\` Magnum Coins\n` +
      `├ Бонус за 25 рефералов: \`250\` Magnum Coins\n` +
      `└ Бонус за 50 рефералов: \`500\` Magnum Coins\n\n` +
      `📊 *Статистика пользователя:*\n` +
      `├ Рефералов: \`${user.referralsCount || 0}\`\n` +
      `├ Заработано: \`${formatNumber(user.referralsEarnings || 0)}\` Magnum Coins\n` +
      `├ Уровень: \`${getReferralLevel(user.referralsCount || 0)}\`\n` +
      `└ Реферальный код: \`${user.referralCode}\`\n\n` +
      `🎯 Выберите настройку для изменения:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Настройки реферальной системы показаны для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ настроек реферальной системы для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа настроек рефералов');
  }
}

async function showAdminSubscriptionChannels(ctx, user) {
  try {
    log(`📢 Показ настроек каналов подписки для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Добавить канал', 'admin_subscription_add'),
        Markup.button.callback('➖ Удалить канал', 'admin_subscription_remove')
      ],
      [
        Markup.button.callback('📊 Статистика подписок', 'admin_subscription_stats'),
        Markup.button.callback('🎯 Настройка проверки', 'admin_subscription_check')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_settings')]
    ]);
    
    const message = 
      `📢 *Каналы подписки*\n\n` +
      `📺 *Текущие настройки:*\n` +
      `├ Обязательный канал: \`${config.REQUIRED_CHANNEL || 'Не настроен'}\`\n` +
      `├ Проверка подписки: ${config.REQUIRED_CHANNEL ? '🟢 Включена' : '🔴 Отключена'}\n` +
      `└ Автоматическая проверка: \`При каждом действии\`\n\n` +
      `📊 *Статистика:*\n` +
      `├ Всего пользователей: \`${await db.collection('users').countDocuments()}\`\n` +
      `├ Активных пользователей: \`${await db.collection('users').countDocuments({ 'lastSeen': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })}\`\n` +
      `└ Процент активности: \`${Math.round((await db.collection('users').countDocuments({ 'lastSeen': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })) / (await db.collection('users').countDocuments()) * 100)}%\`\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Настройки каналов подписки показаны для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ настроек каналов подписки для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа настроек подписки');
  }
}

async function showAdminTopUsers(ctx, user) {
  try {
    log(`📊 Показ топ пользователей для админа ${user.id}`);
    
    // Получаем топ пользователей по разным критериям
    const topByLevel = await db.collection('users').find().sort({ level: -1 }).limit(10).toArray();
    const topByMagnumCoins = await db.collection('users').find().sort({ magnumCoins: -1 }).limit(10).toArray();
    const topByStars = await db.collection('users').find().sort({ stars: -1 }).limit(10).toArray();
    const topByReferrals = await db.collection('users').find().sort({ referralsCount: -1 }).limit(10).toArray();
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('⭐ По уровню', 'admin_top_level'),
        Markup.button.callback('🪙 По Magnum Coins', 'admin_top_magnum')
      ],
      [
        Markup.button.callback('💎 По Stars', 'admin_top_stars'),
        Markup.button.callback('👥 По рефералам', 'admin_top_referrals')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_users')]
    ]);
    
    let message = `📊 *Топ пользователей*\n\n`;
    
    // Показываем топ по уровню
    message += `⭐ *Топ по уровню:*\n`;
    topByLevel.forEach((user, index) => {
      message += `${index + 1}. ID: \`${user.id}\` - Уровень: \`${user.level}\`\n`;
    });
    
    message += `\n🪙 *Топ по Magnum Coins:*\n`;
    topByMagnumCoins.forEach((user, index) => {
      message += `${index + 1}. ID: \`${user.id}\` - \`${formatNumber(user.magnumCoins)}\` MC\n`;
    });
    
    message += `\n🎯 Выберите категорию для подробного просмотра:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Топ пользователей показан для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ топ пользователей для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа топ пользователей');
  }
}

async function showAdminSearchUser(ctx, user) {
  try {
    log(`🔍 Показ поиска пользователя для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_users')]
    ]);
    
    const message = 
      `🔍 *Поиск пользователя*\n\n` +
      `📝 *Инструкция:*\n` +
      `├ Отправьте ID пользователя в чат\n` +
      `├ ID можно найти в профиле пользователя\n` +
      `└ Или используйте @username\n\n` +
      `💡 *Пример:* \`123456789\` или \`@username\`\n\n` +
      `🎯 Отправьте ID пользователя:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    // Сохраняем состояние поиска
    user.adminState = 'searching_user';
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'searching_user', updatedAt: new Date() } }
    );
    
    log(`✅ Поиск пользователя показан для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ поиска пользователя для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа поиска');
  }
}

async function showAdminBanUser(ctx, user) {
  try {
    log(`🚫 Показ блокировки пользователя для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_users')]
    ]);
    
    const message = 
      `🚫 *Блокировка пользователя*\n\n` +
      `📝 *Инструкция:*\n` +
      `├ Отправьте ID пользователя для блокировки\n` +
      `├ Пользователь потеряет доступ к боту\n` +
      `└ Для разблокировки используйте соответствующую функцию\n\n` +
      `⚠️ *Внимание:* Блокировка необратима!\n\n` +
      `🎯 Отправьте ID пользователя для блокировки:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    // Сохраняем состояние блокировки
    user.adminState = 'banning_user';
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'banning_user', updatedAt: new Date() } }
    );
    
    log(`✅ Блокировка пользователя показана для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ блокировки пользователя для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа блокировки');
  }
}

async function showAdminUnbanUser(ctx, user) {
  try {
    log(`✅ Показ разблокировки пользователя для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_users')]
    ]);
    
    const message = 
      `✅ *Разблокировка пользователя*\n\n` +
      `📝 *Инструкция:*\n` +
      `├ Отправьте ID пользователя для разблокировки\n` +
      `├ Пользователь восстановит доступ к боту\n` +
      `└ Все данные пользователя сохранятся\n\n` +
      `🎯 Отправьте ID пользователя для разблокировки:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    // Сохраняем состояние разблокировки
    user.adminState = 'unbanning_user';
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'unbanning_user', updatedAt: new Date() } }
    );
    
    log(`✅ Разблокировка пользователя показана для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ разблокировки пользователя для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа разблокировки');
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
            magnumCoins: reward,
            totalEarnedMagnumCoins: reward,
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
      log(`⛏️ Майнер награда: ${user.id} +${reward} Magnum Coins`);
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

// ==================== ОБМЕН ====================
async function showExchangeMenu(ctx, user) {
  try {
    log(`💱 Показ меню обмена для пользователя ${user.id}`);
    
    const exchangeRate = 1; // 1 Magnum Coin = 1 Star
    const maxExchange = Math.floor(user.magnumCoins);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🪙 10 Magnum Coins → 10 Stars', 'exchange_10'),
        Markup.button.callback('🪙 50 Magnum Coins → 50 Stars', 'exchange_50')
      ],
      [
        Markup.button.callback('🪙 100 Magnum Coins → 100 Stars', 'exchange_100'),
        Markup.button.callback('🪙 500 Magnum Coins → 500 Stars', 'exchange_500')
      ],
      [
        Markup.button.callback('🪙 Все Magnum Coins', 'exchange_all'),
        Markup.button.callback('📊 Статистика обменов', 'exchange_stats')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ]);
    
    const message = 
      `💱 *Обмен валют*\n\n` +
      `💰 *Ваши балансы:*\n` +
      `├ 🪙 Magnum Coins: \`${formatNumber(user.magnumCoins)}\`\n` +
      `└ ⭐ Stars: \`${formatNumber(user.stars)}\`\n\n` +
      `💱 *Курс обмена:*\n` +
      `├ 1 Magnum Coin = 1 Star\n` +
      `└ Комиссия: 0%\n\n` +
      `📊 *Статистика обменов:*\n` +
      `├ Всего обменов: \`${user.exchange?.totalExchanges || 0}\`\n` +
      `└ Всего обменено: \`${formatNumber(user.exchange?.totalExchanged || 0)}\` Magnum Coins\n\n` +
      `🎯 Выберите сумму для обмена:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ меню обмена');
    await ctx.answerCbQuery('❌ Ошибка загрузки меню обмена');
  }
}

async function performExchange(ctx, user, amount) {
  try {
    log(`💱 Попытка обмена ${amount} Magnum Coins для пользователя ${user.id}`);
    
    if (amount > user.magnumCoins) {
      log(`❌ Недостаточно Magnum Coins для пользователя ${user.id}`);
      await ctx.answerCbQuery('❌ Недостаточно Magnum Coins для обмена!');
      return;
    }
    
    if (amount <= 0) {
      log(`❌ Некорректная сумма обмена для пользователя ${user.id}`);
      await ctx.answerCbQuery('❌ Некорректная сумма обмена!');
      return;
    }
    
    // Обновляем пользователя
    log(`💾 Обновление базы данных для пользователя ${user.id}`);
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $inc: { 
          magnumCoins: -amount,
          stars: amount,
          'exchange.totalExchanges': 1,
          'exchange.totalExchanged': amount,
          'statistics.totalActions': 1
        },
        $set: { 
          updatedAt: new Date()
        }
      }
    );
    
    log(`🗑️ Очистка кеша для пользователя ${user.id}`);
    userCache.delete(user.id);
    
    log(`✅ Обмен успешно выполнен для пользователя ${user.id}: ${amount} Magnum Coins → ${amount} Stars`);
    await ctx.answerCbQuery(
      `✅ Обмен выполнен! ${formatNumber(amount)} Magnum Coins → ${formatNumber(amount)} Stars`
    );
    
    // Обновляем меню обмена
    const updatedUser = await getUser(ctx.from.id);
    if (updatedUser) {
      await showExchangeMenu(ctx, updatedUser);
    }
  } catch (error) {
    logError(error, 'Обмен валют');
    await ctx.answerCbQuery('❌ Ошибка обмена');
  }
}

// ==================== ДОСТИЖЕНИЯ ====================
async function showAchievementsMenu(ctx, user) {
  try {
    log(`🏆 Показ меню достижений для пользователя ${user.id}`);
    
    // Определяем достижения
    const achievements = getAchievementsList(user);
    
    const completedAchievements = achievements.filter(a => a.condition);
    const totalAchievements = achievements.length;
    const completionRate = Math.round((completedAchievements.length / totalAchievements) * 100);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Прогресс', 'achievements_progress'),
        Markup.button.callback('🎁 Награды', 'achievements_rewards')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ]);
    
    let message = `🏆 *Достижения*\n\n`;
    message += `📊 *Прогресс:* ${completedAchievements.length}/${totalAchievements} (${completionRate}%)\n\n`;
    
    // Показываем последние 5 достижений
    const recentAchievements = achievements.slice(0, 5);
    message += `🎯 *Достижения:*\n`;
    
    recentAchievements.forEach((achievement, index) => {
      const status = achievement.condition ? '✅' : '❌';
      message += `${status} ${achievement.title}\n`;
      if (index < 4) message += `└ ${achievement.description}\n\n`;
    });
    
    if (achievements.length > 5) {
      message += `\n... и еще ${achievements.length - 5} достижений\n`;
    }
    
    message += `\n🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ меню достижений');
    await ctx.answerCbQuery('❌ Ошибка загрузки достижений');
  }
}

function getAchievementsList(user) {
  return [
          {
        id: 'first_farm',
        title: '🌾 Первый фарм',
        description: 'Выполните первый фарм',
        condition: user.farm?.farmCount >= 1,
        progress: user.farm?.farmCount || 0,
        target: 1,
        reward: '10 Magnum Coins'
      },
      {
        id: 'farm_master',
        title: '👑 Мастер фарма',
        description: 'Выполните 100 фармов',
        condition: user.farm?.farmCount >= 100,
        progress: user.farm?.farmCount || 0,
        target: 100,
        reward: '500 Magnum Coins'
      },
      {
        id: 'magnum_collector',
        title: '🪙 Коллекционер Magnum',
        description: 'Накопите 1000 Magnum Coins',
        condition: user.magnumCoins >= 1000,
        progress: user.magnumCoins || 0,
        target: 1000,
        reward: '200 Magnum Coins'
      },
      {
        id: 'exchange_trader',
        title: '💱 Трейдер',
        description: 'Выполните 50 обменов',
        condition: user.exchange?.totalExchanges >= 50,
        progress: user.exchange?.totalExchanges || 0,
        target: 50,
        reward: '300 Magnum Coins'
      },
      {
        id: 'level_10',
        title: '⭐ Уровень 10',
        description: 'Достигните 10 уровня',
        condition: user.level >= 10,
        progress: user.level || 1,
        target: 10,
        reward: '100 Magnum Coins'
      },
      {
        id: 'level_50',
        title: '⭐⭐ Уровень 50',
        description: 'Достигните 50 уровня',
        condition: user.level >= 50,
        progress: user.level || 1,
        target: 50,
        reward: '1000 Magnum Coins'
      },
      {
        id: 'referral_king',
        title: '👥 Король рефералов',
        description: 'Пригласите 10 рефералов',
        condition: user.referralsCount >= 10,
        progress: user.referralsCount || 0,
        target: 10,
        reward: '400 Magnum Coins'
      },
      {
        id: 'daily_streak',
        title: '🔥 Серия дней',
        description: 'Получите бонус 7 дней подряд',
        condition: user.dailyBonus?.streak >= 7,
        progress: user.dailyBonus?.streak || 0,
        target: 7,
        reward: '150 Magnum Coins'
      }
  ];
}

async function showAchievementsProgress(ctx, user) {
  try {
    log(`📊 Показ прогресса достижений для пользователя ${user.id}`);
    
    const achievements = getAchievementsList(user);
    const completedAchievements = achievements.filter(a => a.condition);
    const totalAchievements = achievements.length;
    const completionRate = Math.round((completedAchievements.length / totalAchievements) * 100);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к достижениям', 'achievements')]
    ]);
    
    let message = `📊 *Прогресс достижений*\n\n`;
    message += `📈 *Общий прогресс:* ${completedAchievements.length}/${totalAchievements} (${completionRate}%)\n\n`;
    
    // Показываем прогресс каждого достижения
    message += `🎯 *Детальный прогресс:*\n\n`;
    
    achievements.forEach((achievement, index) => {
      const status = achievement.condition ? '✅' : '🔄';
      const progressPercent = Math.min(Math.round((achievement.progress / achievement.target) * 100), 100);
      const progressBar = createProgressBar(progressPercent);
      
      message += `${status} *${achievement.title}*\n`;
      message += `└ ${achievement.description}\n`;
      message += `└ Прогресс: \`${achievement.progress}/${achievement.target}\` (${progressPercent}%)\n`;
      message += `└ ${progressBar}\n\n`;
    });
    
    message += `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ прогресса достижений');
    await ctx.answerCbQuery('❌ Ошибка загрузки прогресса');
  }
}

async function showAchievementsRewards(ctx, user) {
  try {
    log(`🎁 Показ наград достижений для пользователя ${user.id}`);
    
    const achievements = getAchievementsList(user);
    const completedAchievements = achievements.filter(a => a.condition);
    const totalRewards = completedAchievements.reduce((sum, a) => {
      const rewardAmount = parseInt(a.reward.split(' ')[0]);
      return sum + rewardAmount;
    }, 0);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к достижениям', 'achievements')]
    ]);
    
    let message = `🎁 *Награды достижений*\n\n`;
    message += `💰 *Общая статистика:*\n`;
    message += `├ Выполнено достижений: \`${completedAchievements.length}\`\n`;
    message += `├ Всего наград: \`${totalRewards} Magnum Coins\`\n`;
    message += `└ Средняя награда: \`${completedAchievements.length > 0 ? Math.round(totalRewards / completedAchievements.length) : 0} Magnum Coins\`\n\n`;
    
    // Показываем награды по категориям
    message += `🏆 *Награды по категориям:*\n\n`;
    
    const categories = {
      '🌾 Фарм': achievements.filter(a => a.id.includes('farm')),
      '🪙 Magnum Coins': achievements.filter(a => a.id.includes('magnum')),
      '💱 Обмен': achievements.filter(a => a.id.includes('exchange')),
      '⭐ Уровни': achievements.filter(a => a.id.includes('level')),
      '👥 Рефералы': achievements.filter(a => a.id.includes('referral')),
      '🔥 Серии': achievements.filter(a => a.id.includes('daily'))
    };
    
    Object.entries(categories).forEach(([category, categoryAchievements]) => {
      if (categoryAchievements.length > 0) {
        const completed = categoryAchievements.filter(a => a.condition);
        const totalReward = completed.reduce((sum, a) => {
          const rewardAmount = parseInt(a.reward.split(' ')[0]);
          return sum + rewardAmount;
        }, 0);
        
        message += `*${category}:*\n`;
        message += `├ Выполнено: \`${completed.length}/${categoryAchievements.length}\`\n`;
        message += `└ Награды: \`${totalReward} Magnum Coins\`\n\n`;
      }
    });
    
    // Показываем топ-3 самых ценных достижения
    const valuableAchievements = achievements
      .filter(a => !a.condition)
      .sort((a, b) => {
        const rewardA = parseInt(a.reward.split(' ')[0]);
        const rewardB = parseInt(b.reward.split(' ')[0]);
        return rewardB - rewardA;
      })
      .slice(0, 3);
    
    if (valuableAchievements.length > 0) {
      message += `💎 *Самые ценные недостигнутые:*\n`;
      valuableAchievements.forEach((achievement, index) => {
        const rewardAmount = parseInt(achievement.reward.split(' ')[0]);
        message += `${index + 1}. ${achievement.title} - \`${achievement.reward}\`\n`;
      });
      message += `\n`;
    }
    
    message += `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ наград достижений');
    await ctx.answerCbQuery('❌ Ошибка загрузки наград');
  }
}

function createProgressBar(percent) {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ==================== РЕФЕРАЛЫ ====================
async function showReferralsMenu(ctx, user) {
  try {
    log(`👥 Показ меню рефералов для пользователя ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔗 Реферальная ссылка', 'referral_link'),
        Markup.button.callback('📊 Статистика', 'referral_stats')
      ],
      [
        Markup.button.callback('🎁 Награды', 'referral_rewards'),
        Markup.button.callback('👥 Список рефералов', 'referral_list')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ]);
    
    const message = 
      `👥 *Реферальная система*\n\n` +
      `📊 *Ваша статистика:*\n` +
      `├ Рефералов: \`${user.referralsCount || 0}\`\n` +
      `├ Заработано: \`${formatNumber(user.referralsEarnings || 0)}\` Magnum Coins\n` +
      `└ Уровень: \`${getReferralLevel(user.referralsCount || 0)}\`\n\n` +
      `💰 *Награды за рефералов:*\n` +
      `├ За каждого реферала: \`${config.REFERRAL_REWARD || 10}\` Magnum Coins\n` +
      `├ Бонус за 5 рефералов: \`50\` Magnum Coins\n` +
      `└ Бонус за 10 рефералов: \`100\` Magnum Coins\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ меню рефералов');
    await ctx.answerCbQuery('❌ Ошибка загрузки меню рефералов');
  }
}

async function showReferralLink(ctx, user) {
  try {
    log(`🔗 Показ реферальной ссылки для пользователя ${user.id}`);
    
    const botUsername = (await ctx.telegram.getMe()).username;
    const referralLink = `https://t.me/${botUsername}?start=${user.id}`;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.url('🔗 Открыть ссылку', referralLink),
        Markup.button.callback('📋 Скопировать', 'copy_referral_link')
      ],
      [Markup.button.callback('🔙 Назад', 'referrals')]
    ]);
    
    const message = 
      `🔗 *Ваша реферальная ссылка*\n\n` +
      `📝 *Ссылка:*\n` +
      `\`${referralLink}\`\n\n` +
      `💡 *Как использовать:*\n` +
      `├ Отправьте эту ссылку друзьям\n` +
      `├ При переходе по ссылке они автоматически станут вашими рефералами\n` +
      `└ Вы получите награду за каждого нового реферала\n\n` +
      `💰 *Награда:* \`${config.REFERRAL_REWARD || 10}\` Magnum Coins за каждого реферала\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ реферальной ссылки');
    await ctx.answerCbQuery('❌ Ошибка загрузки реферальной ссылки');
  }
}

async function showReferralStats(ctx, user) {
  try {
    log(`📊 Показ статистики рефералов для пользователя ${user.id}`);
    
    // Получаем список рефералов из базы данных
    const referrals = await db.collection('users').find(
      { referrerId: user.id },
      { projection: { id: 1, firstName: 1, username: 1, level: 1, createdAt: 1 } }
    ).toArray();
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'referrals')]
    ]);
    
    let message = `📊 *Статистика рефералов*\n\n`;
    
    // Общая статистика
    message += `📈 *Общая статистика:*\n`;
    message += `├ Всего рефералов: \`${user.referralsCount || 0}\`\n`;
    message += `├ Заработано: \`${formatNumber(user.referralsEarnings || 0)}\` Magnum Coins\n`;
    message += `├ Уровень: \`${getReferralLevel(user.referralsCount || 0)}\`\n`;
    message += `└ Средний уровень рефералов: \`${referrals.length > 0 ? Math.round(referrals.reduce((sum, r) => sum + (r.level || 1), 0) / referrals.length) : 0}\`\n\n`;
    
    // Прогресс к следующим бонусам
    const nextBonus5 = 5 - (user.referralsCount || 0);
    const nextBonus10 = 10 - (user.referralsCount || 0);
    
    message += `🎯 *Прогресс к бонусам:*\n`;
    if (nextBonus5 > 0) {
      message += `├ До бонуса за 5 рефералов: \`${nextBonus5}\` рефералов\n`;
    } else {
      message += `├ ✅ Бонус за 5 рефералов получен\n`;
    }
    
    if (nextBonus10 > 0) {
      message += `└ До бонуса за 10 рефералов: \`${nextBonus10}\` рефералов\n`;
    } else {
      message += `└ ✅ Бонус за 10 рефералов получен\n`;
    }
    
    message += `\n🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ статистики рефералов');
    await ctx.answerCbQuery('❌ Ошибка загрузки статистики');
  }
}

async function showReferralRewards(ctx, user) {
  try {
    log(`🎁 Показ наград рефералов для пользователя ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'referrals')]
    ]);
    
    const referralReward = config.REFERRAL_REWARD || 10;
    const totalEarnings = user.referralsEarnings || 0;
    const referralsCount = user.referralsCount || 0;
    
    let message = `🎁 *Награды рефералов*\n\n`;
    
    // Текущие награды
    message += `💰 *Текущие награды:*\n`;
    message += `├ За каждого реферала: \`${referralReward}\` Stars\n`;
    message += `├ Всего заработано: \`${formatNumber(totalEarnings)}\` Stars\n`;
    message += `└ Средняя награда: \`${referralsCount > 0 ? Math.round(totalEarnings / referralsCount) : 0}\` Stars\n\n`;
    
    // Система бонусов
    message += `🏆 *Система бонусов:*\n`;
    message += `├ 5 рефералов: \`50\` Magnum Coins (бонус)\n`;
    message += `├ 10 рефералов: \`100\` Magnum Coins (бонус)\n`;
    message += `├ 25 рефералов: \`250\` Magnum Coins (бонус)\n`;
    message += `└ 50 рефералов: \`500\` Magnum Coins (бонус)\n\n`;
    
    // Прогресс к бонусам
    message += `📊 *Ваш прогресс:*\n`;
    const bonuses = [
      { count: 5, reward: 50, achieved: referralsCount >= 5 },
      { count: 10, reward: 100, achieved: referralsCount >= 10 },
      { count: 25, reward: 250, achieved: referralsCount >= 25 },
      { count: 50, reward: 500, achieved: referralsCount >= 50 }
    ];
    
    bonuses.forEach(bonus => {
      const status = bonus.achieved ? '✅' : '🔄';
      const progress = bonus.achieved ? 
        `Выполнено!` : 
        `Осталось: ${bonus.count - referralsCount} рефералов`;
      
      message += `${status} ${bonus.count} рефералов - \`${bonus.reward}\` Stars\n`;
      message += `└ ${progress}\n\n`;
    });
    
    message += `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ наград рефералов');
    await ctx.answerCbQuery('❌ Ошибка загрузки наград');
  }
}

function getReferralLevel(referralsCount) {
  if (referralsCount >= 50) return '👑 Легенда';
  if (referralsCount >= 25) return '⭐ Мастер';
  if (referralsCount >= 10) return '🔥 Эксперт';
  if (referralsCount >= 5) return '💎 Профессионал';
  if (referralsCount >= 1) return '🌱 Новичок';
  return '🔰 Без рефералов';
}

async function showReferralList(ctx, user) {
  try {
    log(`👥 Показ списка рефералов для пользователя ${user.id}`);
    
    // Получаем список рефералов из базы данных
    const referrals = await db.collection('users').find(
      { referrerId: user.id },
      { 
        projection: { 
          id: 1, 
          firstName: 1, 
          username: 1, 
          level: 1, 
          createdAt: 1,
          stars: 1,
          magnumCoins: 1
        },
        sort: { createdAt: -1 }
      }
    ).toArray();
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'referrals')]
    ]);
    
    let message = `👥 *Список ваших рефералов*\n\n`;
    
    if (referrals.length === 0) {
      message += `📭 *У вас пока нет рефералов*\n\n`;
      message += `💡 *Как привлечь рефералов:*\n`;
      message += `├ Поделитесь своей реферальной ссылкой\n`;
      message += `├ Расскажите друзьям о боте\n`;
      message += `└ Получайте награды за каждого реферала\n\n`;
    } else {
      message += `📊 *Всего рефералов:* \`${referrals.length}\`\n\n`;
      
      // Показываем последние 10 рефералов
      const recentReferrals = referrals.slice(0, 10);
      message += `👤 *Последние рефералы:*\n\n`;
      
      recentReferrals.forEach((referral, index) => {
        const daysAgo = Math.floor((Date.now() - referral.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const timeText = daysAgo === 0 ? 'сегодня' : daysAgo === 1 ? 'вчера' : `${daysAgo} дн. назад`;
        
        message += `${index + 1}. ${referral.firstName || 'Пользователь'}\n`;
        message += `├ ID: \`${referral.id}\`\n`;
        message += `├ Уровень: \`${referral.level || 1}\`\n`;
        message += `├ Баланс: \`${formatNumber(referral.stars || 0)}\` Stars\n`;
        message += `├ Magnum Coins: \`${formatNumber(referral.magnumCoins || 0)}\`\n`;
        message += `└ Присоединился: ${timeText}\n\n`;
      });
      
      if (referrals.length > 10) {
        message += `... и еще \`${referrals.length - 10}\` рефералов\n\n`;
      }
      
      // Статистика активности рефералов
      const activeReferrals = referrals.filter(r => r.level > 1);
      const totalReferralStars = referrals.reduce((sum, r) => sum + (r.stars || 0), 0);
      const totalReferralMagnum = referrals.reduce((sum, r) => sum + (r.magnumCoins || 0), 0);
      
      message += `📈 *Статистика рефералов:*\n`;
      message += `├ Активных: \`${activeReferrals.length}\`\n`;
      message += `├ Всего Stars у рефералов: \`${formatNumber(totalReferralStars)}\`\n`;
      message += `└ Всего Magnum Coins у рефералов: \`${formatNumber(totalReferralMagnum)}\`\n\n`;
    }
    
    message += `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ списка рефералов');
    await ctx.answerCbQuery('❌ Ошибка загрузки списка рефералов');
  }
}

// ==================== НАСТРОЙКИ ====================
async function showSettingsMenu(ctx, user) {
  try {
    log(`⚙️ Показ меню настроек для пользователя ${user.id}`);
    
    const settings = user.settings || {};
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔔 Уведомления', 'settings_notifications'),
        Markup.button.callback('🔒 Приватность', 'settings_privacy')
      ],
      [
        Markup.button.callback('🌐 Язык', 'settings_language'),
        Markup.button.callback('🔄 Сброс', 'settings_reset')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ]);
    
    const message = 
      `⚙️ *Настройки*\n\n` +
      `🔔 *Уведомления:* ${settings.notifications !== false ? '🟢 Включены' : '🔴 Выключены'}\n` +
      `🔒 *Приватность:* ${settings.privacy !== false ? '🟢 Стандартная' : '🔴 Расширенная'}\n` +
      `🌐 *Язык:* ${settings.language === 'en' ? '🇺🇸 English' : '🇷🇺 Русский'}\n\n` +
      `💡 *Выберите раздел для настройки:*\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ меню настроек');
    await ctx.answerCbQuery('❌ Ошибка загрузки настроек');
  }
}

async function showNotificationSettings(ctx, user) {
  try {
    log(`🔔 Показ настроек уведомлений для пользователя ${user.id}`);
    
    const settings = user.settings || {};
    const notificationsEnabled = settings.notifications !== false;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          notificationsEnabled ? '🔴 Отключить уведомления' : '🟢 Включить уведомления',
          'toggle_notifications'
        )
      ],
      [Markup.button.callback('🔙 Назад', 'settings')]
    ]);
    
    const message = 
      `🔔 *Настройки уведомлений*\n\n` +
      `📱 *Текущий статус:* ${notificationsEnabled ? '🟢 Включены' : '🔴 Выключены'}\n\n` +
      `📋 *Типы уведомлений:*\n` +
      `├ Уведомления о фарме\n` +
      `├ Уведомления о майнинге\n` +
      `├ Уведомления о бонусах\n` +
      `├ Уведомления о достижениях\n` +
      `└ Уведомления о рефералах\n\n` +
      `💡 *При отключении уведомлений вы не будете получать:*\n` +
      `├ Уведомления о готовности фарма\n` +
      `├ Уведомления о наградах майнера\n` +
      `├ Уведомления о ежедневных бонусах\n` +
      `└ Другие системные уведомления\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ настроек уведомлений');
    await ctx.answerCbQuery('❌ Ошибка загрузки настроек уведомлений');
  }
}

async function showPrivacySettings(ctx, user) {
  try {
    log(`🔒 Показ настроек приватности для пользователя ${user.id}`);
    
    const settings = user.settings || {};
    const privacyEnabled = settings.privacy !== false;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          privacyEnabled ? '🔴 Расширенная приватность' : '🟢 Стандартная приватность',
          'toggle_privacy'
        )
      ],
      [Markup.button.callback('🔙 Назад', 'settings')]
    ]);
    
    const message = 
      `🔒 *Настройки приватности*\n\n` +
      `🛡️ *Текущий режим:* ${privacyEnabled ? '🟢 Стандартная' : '🔴 Расширенная'}\n\n` +
      `📊 *Стандартная приватность:*\n` +
      `├ Ваш ID виден в статистике\n` +
      `├ Имя отображается в списках\n` +
      `├ Уровень виден другим игрокам\n` +
      `└ Балансы скрыты\n\n` +
      `🔒 *Расширенная приватность:*\n` +
      `├ ID скрыт в статистике\n` +
      `├ Имя скрыто в списках\n` +
      `├ Уровень скрыт\n` +
      `└ Все данные приватны\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ настроек приватности');
    await ctx.answerCbQuery('❌ Ошибка загрузки настроек приватности');
  }
}

async function showLanguageSettings(ctx, user) {
  try {
    log(`🌐 Показ настроек языка для пользователя ${user.id}`);
    
    const settings = user.settings || {};
    const currentLanguage = settings.language || 'ru';
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          currentLanguage === 'ru' ? '✅ 🇷🇺 Русский' : '🇷🇺 Русский',
          'set_language_ru'
        ),
        Markup.button.callback(
          currentLanguage === 'en' ? '✅ 🇺🇸 English' : '🇺🇸 English',
          'set_language_en'
        )
      ],
      [Markup.button.callback('🔙 Назад', 'settings')]
    ]);
    
    const message = 
      `🌐 *Настройки языка*\n\n` +
      `🗣️ *Текущий язык:* ${currentLanguage === 'ru' ? '🇷🇺 Русский' : '🇺🇸 English'}\n\n` +
      `📝 *Выберите язык интерфейса:*\n\n` +
      `🇷🇺 *Русский:*\n` +
      `├ Полная поддержка русского языка\n` +
      `├ Все меню и сообщения на русском\n` +
      `└ Рекомендуется для русскоязычных пользователей\n\n` +
      `🇺🇸 *English:*\n` +
      `├ Full English language support\n` +
      `├ All menus and messages in English\n` +
      `└ Recommended for English-speaking users\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ настроек языка');
    await ctx.answerCbQuery('❌ Ошибка загрузки настроек языка');
  }
}

async function showResetSettings(ctx, user) {
  try {
    log(`🔄 Показ настроек сброса для пользователя ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('⚠️ Сбросить настройки', 'confirm_reset'),
        Markup.button.callback('🔙 Назад', 'settings')
      ]
    ]);
    
    const message = 
      `🔄 *Сброс настроек*\n\n` +
      `⚠️ *Внимание!* Это действие нельзя отменить.\n\n` +
      `🗑️ *Что будет сброшено:*\n` +
      `├ Все настройки уведомлений\n` +
      `├ Настройки приватности\n` +
      `├ Языковые настройки\n` +
      `└ Другие пользовательские настройки\n\n` +
      `✅ *Что НЕ будет затронуто:*\n` +
      `├ Ваш прогресс в игре\n` +
      `├ Балансы (Stars, Magnum Coins)\n` +
      `├ Достижения и рефералы\n` +
      `└ Статистика и уровень\n\n` +
      `💡 *После сброса:*\n` +
      `├ Уведомления будут включены\n` +
      `├ Приватность будет стандартной\n` +
      `└ Язык будет русский\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ настроек сброса');
    await ctx.answerCbQuery('❌ Ошибка загрузки настроек сброса');
  }
}

async function toggleNotificationSetting(ctx, user) {
  try {
    log(`🔔 Переключение настроек уведомлений для пользователя ${user.id}`);
    
    const settings = user.settings || {};
    const newNotificationState = settings.notifications === false ? true : false;
    
    // Обновляем настройки в базе данных
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $set: { 
          'settings.notifications': newNotificationState,
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(user.id);
    
    const status = newNotificationState ? 'включены' : 'выключены';
    log(`✅ Уведомления ${status} для пользователя ${user.id}`);
    
    await ctx.answerCbQuery(`✅ Уведомления ${status}!`);
    
    // Обновляем меню настроек уведомлений
    const updatedUser = await getUser(ctx.from.id);
    if (updatedUser) {
      await showNotificationSettings(ctx, updatedUser);
    }
  } catch (error) {
    logError(error, 'Переключение уведомлений');
    await ctx.answerCbQuery('❌ Ошибка изменения настроек');
  }
}

async function togglePrivacySetting(ctx, user) {
  try {
    log(`🔒 Переключение настроек приватности для пользователя ${user.id}`);
    
    const settings = user.settings || {};
    const newPrivacyState = settings.privacy === false ? true : false;
    
    // Обновляем настройки в базе данных
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $set: { 
          'settings.privacy': newPrivacyState,
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(user.id);
    
    const status = newPrivacyState ? 'стандартная' : 'расширенная';
    log(`✅ Приватность изменена на ${status} для пользователя ${user.id}`);
    
    await ctx.answerCbQuery(`✅ Приватность: ${status}!`);
    
    // Обновляем меню настроек приватности
    const updatedUser = await getUser(ctx.from.id);
    if (updatedUser) {
      await showPrivacySettings(ctx, updatedUser);
    }
  } catch (error) {
    logError(error, 'Переключение приватности');
    await ctx.answerCbQuery('❌ Ошибка изменения настроек');
  }
}

async function setLanguage(ctx, user, language) {
  try {
    log(`🌐 Установка языка ${language} для пользователя ${user.id}`);
    
    // Обновляем настройки в базе данных
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $set: { 
          'settings.language': language,
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(user.id);
    
    const langName = language === 'ru' ? 'русский' : 'English';
    log(`✅ Язык изменен на ${langName} для пользователя ${user.id}`);
    
    await ctx.answerCbQuery(`✅ Язык изменен на ${langName}!`);
    
    // Обновляем меню настроек языка
    const updatedUser = await getUser(ctx.from.id);
    if (updatedUser) {
      await showLanguageSettings(ctx, updatedUser);
    }
  } catch (error) {
    logError(error, 'Установка языка');
    await ctx.answerCbQuery('❌ Ошибка изменения языка');
  }
}

async function resetUserSettings(ctx, user) {
  try {
    log(`🔄 Сброс настроек для пользователя ${user.id}`);
    
    // Сбрасываем все настройки к значениям по умолчанию
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $set: { 
          'settings': {
            notifications: true,
            privacy: true,
            language: 'ru'
          },
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(user.id);
    
    log(`✅ Настройки сброшены для пользователя ${user.id}`);
    
    await ctx.answerCbQuery('✅ Настройки сброшены!');
    
    // Возвращаемся в главное меню настроек
    const updatedUser = await getUser(ctx.from.id);
    if (updatedUser) {
      await showSettingsMenu(ctx, updatedUser);
    }
  } catch (error) {
    logError(error, 'Сброс настроек');
    await ctx.answerCbQuery('❌ Ошибка сброса настроек');
  }
}

// ==================== ЗАДАНИЯ ====================
async function showTasksMenu(ctx, user) {
  try {
    log(`📋 Показ меню заданий для пользователя ${user.id}`);
    
    const tasks = user.tasks || {};
    const completedTasks = tasks.completedTasks || 0;
    const totalEarnings = tasks.totalTaskEarnings || 0;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🎯 Спонсорские задания', 'tasks_sponsor'),
        Markup.button.callback('📅 Ежедневные задания', 'tasks_daily')
      ],
      [
        Markup.button.callback('📊 Прогресс', 'tasks_progress'),
        Markup.button.callback('🏆 Достижения', 'tasks_achievements')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ]);
    
    const message = 
      `📋 *Система заданий*\n\n` +
      `📊 *Ваша статистика:*\n` +
      `├ Выполнено заданий: \`${completedTasks}\`\n` +
      `├ Заработано: \`${formatNumber(totalEarnings)}\` Stars\n` +
      `└ Средняя награда: \`${completedTasks > 0 ? formatNumber(totalEarnings / completedTasks) : '0.00'}\` Stars\n\n` +
      `🎯 *Типы заданий:*\n` +
      `├ 🎯 Спонсорские задания (подписки, запуски ботов)\n` +
      `├ 📅 Ежедневные задания (фарм, майнинг, бонусы)\n` +
      `└ 🏆 Достижения (долгосрочные цели)\n\n` +
      `💡 *Выберите тип заданий:*\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ меню заданий');
    await ctx.answerCbQuery('❌ Ошибка загрузки меню заданий');
  }
}

async function showSponsorTasks(ctx, user) {
  try {
    log(`🎯 Показ спонсорских заданий для пользователя ${user.id}`);
    
    const sponsorTasks = getSponsorTasks();
    const userTasks = user.tasks?.sponsorTasks || {};
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'tasks')]
    ]);
    
    let message = `🎯 *Спонсорские задания*\n\n`;
    message += `💰 *Выполняйте задания от спонсоров и получайте награды!*\n\n`;
    
    sponsorTasks.forEach((task, index) => {
      const isCompleted = userTasks[task.id]?.completed || false;
      const isClaimed = userTasks[task.id]?.claimed || false;
      const status = isCompleted ? (isClaimed ? '✅' : '🎁') : '🔄';
      
      message += `${status} *${task.title}*\n`;
      message += `├ ${task.description}\n`;
      message += `├ Награда: \`${task.reward}\` Magnum Coins\n`;
      message += `└ Сложность: ${task.difficulty}\n\n`;
    });
    
    message += `💡 *Как выполнить:*\n`;
    message += `├ Нажмите на задание для подробностей\n`;
    message += `├ Выполните требуемое действие\n`;
    message += `├ Нажмите "Проверить выполнение"\n`;
    message += `└ Получите награду!\n\n`;
    message += `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ спонсорских заданий');
    await ctx.answerCbQuery('❌ Ошибка загрузки спонсорских заданий');
  }
}

async function showSponsorTaskDetails(ctx, user, taskId) {
  try {
    log(`🎯 Показ деталей спонсорского задания ${taskId} для пользователя ${user.id}`);
    
    const sponsorTasks = getSponsorTasks();
    const task = sponsorTasks.find(t => t.id === taskId);
    
    if (!task) {
      await ctx.answerCbQuery('❌ Задание не найдено');
      return;
    }
    
    const userTasks = user.tasks?.sponsorTasks || {};
    const userTask = userTasks[taskId] || {};
    const isCompleted = userTask.completed || false;
    const isClaimed = userTask.claimed || false;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.url('🔗 Выполнить задание', task.url),
        Markup.button.callback('✅ Проверить выполнение', `verify_sponsor_${taskId}`)
      ]
    ]);
    
    if (isCompleted && !isClaimed) {
      keyboard.reply_markup.inline_keyboard.push([
        Markup.button.callback('🎁 Получить награду', `claim_sponsor_${taskId}`)
      ]);
    }
    
    keyboard.reply_markup.inline_keyboard.push([
      Markup.button.callback('🔙 Назад', 'tasks_sponsor')
    ]);
    
    let message = `🎯 *${task.title}*\n\n`;
    message += `📝 *Описание:*\n${task.description}\n\n`;
    message += `💰 *Награда:* \`${task.reward}\` Magnum Coins\n`;
    message += `⭐ *Сложность:* ${task.difficulty}\n`;
    message += `⏰ *Время выполнения:* ${task.estimatedTime}\n\n`;
    
    if (task.requirements) {
      message += `📋 *Требования:*\n`;
      task.requirements.forEach(req => {
        message += `├ ${req}\n`;
      });
      message += `\n`;
    }
    
    if (isCompleted) {
      message += `✅ *Статус:* Задание выполнено\n`;
      if (isClaimed) {
        message += `🎁 *Награда:* Получена\n`;
      } else {
        message += `🎁 *Награда:* Готова к получению\n`;
      }
    } else {
      message += `🔄 *Статус:* Задание не выполнено\n`;
    }
    
    message += `\n🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ деталей спонсорского задания');
    await ctx.answerCbQuery('❌ Ошибка загрузки деталей задания');
  }
}

async function verifySponsorTask(ctx, user, taskId) {
  try {
    log(`✅ Проверка выполнения спонсорского задания ${taskId} для пользователя ${user.id}`);
    
    const sponsorTasks = getSponsorTasks();
    const task = sponsorTasks.find(t => t.id === taskId);
    
    if (!task) {
      await ctx.answerCbQuery('❌ Задание не найдено');
      return;
    }
    
    const userTasks = user.tasks?.sponsorTasks || {};
    const userTask = userTasks[taskId] || {};
    
    if (userTask.completed) {
      await ctx.answerCbQuery('✅ Задание уже выполнено!');
      return;
    }
    
    // Здесь должна быть логика проверки выполнения задания
    // Для демонстрации считаем, что задание выполнено
    const isCompleted = await checkTaskCompletion(ctx, user, task);
    
    if (isCompleted) {
      // Обновляем статус задания в базе данных
      await db.collection('users').updateOne(
        { id: user.id },
        { 
          $set: { 
            [`tasks.sponsorTasks.${taskId}.completed`]: true,
            [`tasks.sponsorTasks.${taskId}.completedAt`]: new Date(),
            updatedAt: new Date()
          }
        }
      );
      
      // Очищаем кеш
      userCache.delete(user.id);
      
      log(`✅ Спонсорское задание ${taskId} выполнено пользователем ${user.id}`);
      await ctx.answerCbQuery(`✅ Задание выполнено! Награда: ${task.reward} Magnum Coins`);
      
      // Обновляем детали задания
      const updatedUser = await getUser(ctx.from.id);
      if (updatedUser) {
        await showSponsorTaskDetails(ctx, updatedUser, taskId);
      }
    } else {
      await ctx.answerCbQuery('❌ Задание не выполнено. Проверьте требования.');
    }
  } catch (error) {
    logError(error, 'Проверка спонсорского задания');
    await ctx.answerCbQuery('❌ Ошибка проверки задания');
  }
}

async function claimSponsorTask(ctx, user, taskId) {
  try {
    log(`🎁 Получение награды спонсорского задания ${taskId} для пользователя ${user.id}`);
    
    const sponsorTasks = getSponsorTasks();
    const task = sponsorTasks.find(t => t.id === taskId);
    
    if (!task) {
      await ctx.answerCbQuery('❌ Задание не найдено');
      return;
    }
    
    const userTasks = user.tasks?.sponsorTasks || {};
    const userTask = userTasks[taskId] || {};
    
    if (!userTask.completed) {
      await ctx.answerCbQuery('❌ Задание не выполнено');
      return;
    }
    
    if (userTask.claimed) {
      await ctx.answerCbQuery('❌ Награда уже получена');
      return;
    }
    
    // Начисляем награду
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $inc: { 
          magnumCoins: task.reward,
          'tasks.completedTasks': 1,
          'tasks.totalTaskEarnings': task.reward
        },
        $set: { 
          [`tasks.sponsorTasks.${taskId}.claimed`]: true,
          [`tasks.sponsorTasks.${taskId}.claimedAt`]: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(user.id);
    
    log(`🎁 Награда спонсорского задания ${taskId} получена пользователем ${user.id}: ${task.reward} Magnum Coins`);
    await ctx.answerCbQuery(`🎁 Награда получена! +${task.reward} Magnum Coins`);
    
    // Обновляем детали задания
    const updatedUser = await getUser(ctx.from.id);
    if (updatedUser) {
      await showSponsorTaskDetails(ctx, updatedUser, taskId);
    }
  } catch (error) {
    logError(error, 'Получение награды спонсорского задания');
    await ctx.answerCbQuery('❌ Ошибка получения награды');
  }
}

async function showDailyTasks(ctx, user) {
  try {
    log(`📅 Показ ежедневных заданий для пользователя ${user.id}`);
    
    const dailyTasks = getDailyTasks();
    const userTasks = user.tasks?.dailyTasks || {};
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'tasks')]
    ]);
    
    let message = `📅 *Ежедневные задания*\n\n`;
    message += `🔄 *Эти задания обновляются каждый день!*\n\n`;
    
    dailyTasks.forEach((task, index) => {
      const userTask = userTasks[task.id] || {};
      const progress = userTask.progress || 0;
      const isCompleted = progress >= task.target;
      const isClaimed = userTask.claimed || false;
      const status = isCompleted ? (isClaimed ? '✅' : '🎁') : '🔄';
      
      message += `${status} *${task.title}*\n`;
      message += `├ ${task.description}\n`;
      message += `├ Прогресс: \`${progress}/${task.target}\`\n`;
      message += `├ Награда: \`${task.reward}\` Magnum Coins\n`;
      message += `└ ${isCompleted ? '✅ Выполнено' : '🔄 В процессе'}\n\n`;
    });
    
    message += `💡 *Как выполнить:*\n`;
    message += `├ Выполняйте обычные действия в боте\n`;
    message += `├ Прогресс обновляется автоматически\n`;
    message += `├ При достижении цели получите награду\n`;
    message += `└ Задания обновляются каждый день\n\n`;
    message += `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ ежедневных заданий');
    await ctx.answerCbQuery('❌ Ошибка загрузки ежедневных заданий');
  }
}

async function showTasksProgress(ctx, user) {
  try {
    log(`📊 Показ прогресса заданий для пользователя ${user.id}`);
    
    const tasks = user.tasks || {};
    const completedTasks = tasks.completedTasks || 0;
    const totalEarnings = tasks.totalTaskEarnings || 0;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'tasks')]
    ]);
    
    let message = `📊 *Прогресс заданий*\n\n`;
    
    // Общая статистика
    message += `📈 *Общая статистика:*\n`;
    message += `├ Выполнено заданий: \`${completedTasks}\`\n`;
    message += `├ Заработано: \`${formatNumber(totalEarnings)}\` Magnum Coins\n`;
    message += `└ Средняя награда: \`${completedTasks > 0 ? formatNumber(totalEarnings / completedTasks) : '0.00'}\` Magnum Coins\n\n`;
    
    // Статистика по типам
    const sponsorTasks = tasks.sponsorTasks || {};
    const dailyTasks = tasks.dailyTasks || {};
    
    const completedSponsor = Object.values(sponsorTasks).filter(t => t.completed).length;
    const completedDaily = Object.values(dailyTasks).filter(t => t.claimed).length;
    
    message += `🎯 *По типам заданий:*\n`;
    message += `├ Спонсорские: \`${completedSponsor}\` выполнено\n`;
    message += `├ Ежедневные: \`${completedDaily}\` выполнено\n`;
    message += `└ Всего: \`${completedSponsor + completedDaily}\` заданий\n\n`;
    
    // Недавние достижения
    message += `🏆 *Недавние достижения:*\n`;
    
    const allTasks = [];
    Object.entries(sponsorTasks).forEach(([id, task]) => {
      if (task.claimedAt) {
        allTasks.push({ ...task, type: 'sponsor', id });
      }
    });
    Object.entries(dailyTasks).forEach(([id, task]) => {
      if (task.claimedAt) {
        allTasks.push({ ...task, type: 'daily', id });
      }
    });
    
    const recentTasks = allTasks
      .sort((a, b) => new Date(b.claimedAt) - new Date(a.claimedAt))
      .slice(0, 5);
    
    if (recentTasks.length > 0) {
      recentTasks.forEach((task, index) => {
        const daysAgo = Math.floor((Date.now() - task.claimedAt.getTime()) / (1000 * 60 * 60 * 24));
        const timeText = daysAgo === 0 ? 'сегодня' : daysAgo === 1 ? 'вчера' : `${daysAgo} дн. назад`;
        
        message += `${index + 1}. ${task.type === 'sponsor' ? '🎯' : '📅'} Задание выполнено\n`;
        message += `└ ${timeText}\n\n`;
      });
    } else {
      message += `Пока нет выполненных заданий\n\n`;
    }
    
    message += `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ прогресса заданий');
    await ctx.answerCbQuery('❌ Ошибка загрузки прогресса');
  }
}

// Вспомогательные функции
function getSponsorTasks() {
  return [
    {
      id: 1,
      title: 'Подписка на канал',
      description: 'Подпишитесь на наш официальный канал',
      reward: 50,
      difficulty: '⭐ Легкое',
      estimatedTime: '1 минута',
      url: 'https://t.me/magnumstars',
      requirements: [
        'Подпишитесь на канал @magnumstars',
        'Останьтесь подписанным минимум 24 часа'
      ]
    },
    {
      id: 2,
      title: 'Запуск бота',
      description: 'Запустите нашего партнерского бота',
      reward: 100,
      difficulty: '⭐⭐ Среднее',
      estimatedTime: '2 минуты',
      url: 'https://t.me/partner_bot',
      requirements: [
        'Запустите бота @partner_bot',
        'Нажмите кнопку /start',
        'Выполните одно действие в боте'
      ]
    },
    {
      id: 3,
      title: 'Приглашение друзей',
      description: 'Пригласите 3 друзей в наш бот',
      reward: 200,
      difficulty: '⭐⭐⭐ Сложное',
      estimatedTime: '10 минут',
      url: 'https://t.me/magnumstars',
      requirements: [
        'Отправьте реферальную ссылку 3 друзьям',
        'Друзья должны присоединиться к боту',
        'Каждый друг должен выполнить одно действие'
      ]
    }
  ];
}

function getDailyTasks() {
  return [
    {
      id: 'daily_farm',
      title: 'Фармер дня',
      description: 'Выполните 5 фармов за день',
      target: 5,
      reward: 25
    },
    {
      id: 'daily_bonus',
      title: 'Бонус дня',
      description: 'Получите ежедневный бонус',
      target: 1,
      reward: 15
    },
    {
      id: 'daily_exchange',
      title: 'Трейдер дня',
      description: 'Выполните 3 обмена Magnum Coins',
      target: 3,
      reward: 30
    }
  ];
}

async function checkTaskCompletion(ctx, user, task) {
  // Здесь должна быть реальная логика проверки выполнения задания
  // Для демонстрации возвращаем true (задание выполнено)
  return true;
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
    
    // Для команды /start используем ctx.reply вместо editMessageText
    await showMainMenuStart(ctx, user);
  } catch (error) {
    logError(error, 'Команда /start');
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Обработка текстовых сообщений для админ функций
bot.on('text', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) return;
    
    const text = ctx.message.text;
    
    // Проверяем состояние админа
    if (user.adminState === 'searching_user') {
      await handleAdminSearchUser(ctx, user, text);
    } else if (user.adminState === 'banning_user') {
      await handleAdminBanUser(ctx, user, text);
    } else if (user.adminState === 'unbanning_user') {
      await handleAdminUnbanUser(ctx, user, text);
    } else if (user.adminState === 'setting_farm_reward') {
      await handleAdminSetFarmReward(ctx, user, text);
    } else if (user.adminState === 'setting_farm_cooldown') {
      await handleAdminSetFarmCooldown(ctx, user, text);
    } else if (user.adminState === 'setting_bonus_base') {
      await handleAdminSetBonusBase(ctx, user, text);
    } else if (user.adminState === 'setting_miner_reward') {
      await handleAdminSetMinerReward(ctx, user, text);
    } else if (user.adminState === 'setting_referral_reward') {
      await handleAdminSetReferralReward(ctx, user, text);
    } else if (user.adminState === 'setting_subscription_channel') {
      await handleAdminSetSubscriptionChannel(ctx, user, text);
    }
  } catch (error) {
    logError(error, 'Обработка текстового сообщения админа');
  }
});

// Функции обработки админ действий
async function handleAdminSearchUser(ctx, user, text) {
  try {
    let targetUser;
    
    // Пытаемся найти пользователя по ID или username
    if (text.startsWith('@')) {
      const username = text.substring(1);
      targetUser = await db.collection('users').findOne({ username: username });
    } else {
      const userId = parseInt(text);
      if (isNaN(userId)) {
        await ctx.reply('❌ Неверный формат ID. Используйте число или @username');
        return;
      }
      targetUser = await db.collection('users').findOne({ id: userId });
    }
    
    if (!targetUser) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🚫 Заблокировать', `admin_ban_${targetUser.id}`),
        Markup.button.callback('✅ Разблокировать', `admin_unban_${targetUser.id}`)
      ],
      [
        Markup.button.callback('💰 Изменить баланс', `admin_balance_${targetUser.id}`),
        Markup.button.callback('📊 Подробная статистика', `admin_stats_${targetUser.id}`)
      ],
      [Markup.button.callback('🔙 Назад', 'admin_users')]
    ]);
    
    const message = 
      `👤 *Информация о пользователе*\n\n` +
      `🆔 *ID:* \`${targetUser.id}\`\n` +
      `👤 *Имя:* ${targetUser.firstName || 'Не указано'}\n` +
      `📅 *Дата регистрации:* ${targetUser.createdAt ? targetUser.createdAt.toLocaleDateString() : 'Неизвестно'}\n` +
      `⏰ *Последний вход:* ${targetUser.lastSeen ? targetUser.lastSeen.toLocaleDateString() : 'Неизвестно'}\n\n` +
      `📊 *Статистика:*\n` +
      `├ Уровень: \`${targetUser.level || 1}\`\n` +
      `├ Опыт: \`${targetUser.experience || 0}\`\n` +
      `├ Magnum Coins: \`${formatNumber(targetUser.magnumCoins || 0)}\`\n` +
      `├ Stars: \`${formatNumber(targetUser.stars || 0)}\`\n` +
      `├ Рефералов: \`${targetUser.referralsCount || 0}\`\n` +
      `└ Статус: ${targetUser.banned ? '🚫 Заблокирован' : '✅ Активен'}\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
  } catch (error) {
    logError(error, 'Поиск пользователя админом');
    await ctx.reply('❌ Ошибка поиска пользователя');
  }
}

async function handleAdminBanUser(ctx, user, text) {
  try {
    const userId = parseInt(text);
    if (isNaN(userId)) {
      await ctx.reply('❌ Неверный формат ID. Используйте число');
      return;
    }
    
    const targetUser = await db.collection('users').findOne({ id: userId });
    if (!targetUser) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }
    
    if (targetUser.banned) {
      await ctx.reply('❌ Пользователь уже заблокирован');
      return;
    }
    
    // Блокируем пользователя
    await db.collection('users').updateOne(
      { id: userId },
      { $set: { banned: true, bannedAt: new Date(), bannedBy: user.id, updatedAt: new Date() } }
    );
    
    await ctx.reply(`✅ Пользователь ${userId} успешно заблокирован`);
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
  } catch (error) {
    logError(error, 'Блокировка пользователя админом');
    await ctx.reply('❌ Ошибка блокировки пользователя');
  }
}

async function handleAdminUnbanUser(ctx, user, text) {
  try {
    const userId = parseInt(text);
    if (isNaN(userId)) {
      await ctx.reply('❌ Неверный формат ID. Используйте число');
      return;
    }
    
    const targetUser = await db.collection('users').findOne({ id: userId });
    if (!targetUser) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }
    
    if (!targetUser.banned) {
      await ctx.reply('❌ Пользователь не заблокирован');
      return;
    }
    
    // Разблокируем пользователя
    await db.collection('users').updateOne(
      { id: userId },
      { $unset: { banned: "", bannedAt: "", bannedBy: "" }, $set: { updatedAt: new Date() } }
    );
    
    await ctx.reply(`✅ Пользователь ${userId} успешно разблокирован`);
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
  } catch (error) {
    logError(error, 'Разблокировка пользователя админом');
    await ctx.reply('❌ Ошибка разблокировки пользователя');
  }
}

// Функции для изменения настроек
async function handleAdminSetFarmReward(ctx, user, text) {
  try {
    const newReward = parseFloat(text);
    if (isNaN(newReward) || newReward < 0) {
      await ctx.reply('❌ Неверное значение. Введите положительное число');
      return;
    }
    
    // Обновляем настройку в базе данных
    await db.collection('config').updateOne(
      { key: 'FARM_BASE_REWARD' },
      { $set: { value: newReward, updatedAt: new Date() } },
      { upsert: true }
    );
    
    // Обновляем конфиг в памяти
    config.FARM_BASE_REWARD = newReward;
    
    await ctx.reply(`✅ Базовая награда фарма изменена на ${newReward} Magnum Coins`);
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
  } catch (error) {
    logError(error, 'Изменение награды фарма админом');
    await ctx.reply('❌ Ошибка изменения награды');
  }
}

async function handleAdminSetFarmCooldown(ctx, user, text) {
  try {
    const newCooldown = parseInt(text);
    if (isNaN(newCooldown) || newCooldown < 0) {
      await ctx.reply('❌ Неверное значение. Введите положительное число в секундах');
      return;
    }
    
    // Обновляем настройку в базе данных
    await db.collection('config').updateOne(
      { key: 'FARM_COOLDOWN' },
      { $set: { value: newCooldown, updatedAt: new Date() } },
      { upsert: true }
    );
    
    // Обновляем конфиг в памяти
    config.FARM_COOLDOWN = newCooldown;
    
    await ctx.reply(`✅ Кулдаун фарма изменен на ${newCooldown} секунд (${Math.floor(newCooldown / 60)} минут)`);
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
  } catch (error) {
    logError(error, 'Изменение кулдауна фарма админом');
    await ctx.reply('❌ Ошибка изменения кулдауна');
  }
}

async function handleAdminSetBonusBase(ctx, user, text) {
  try {
    const newBonus = parseFloat(text);
    if (isNaN(newBonus) || newBonus < 0) {
      await ctx.reply('❌ Неверное значение. Введите положительное число');
      return;
    }
    
    // Обновляем настройку в базе данных
    await db.collection('config').updateOne(
      { key: 'DAILY_BONUS_BASE' },
      { $set: { value: newBonus, updatedAt: new Date() } },
      { upsert: true }
    );
    
    // Обновляем конфиг в памяти
    config.DAILY_BONUS_BASE = newBonus;
    
    await ctx.reply(`✅ Базовая награда ежедневного бонуса изменена на ${newBonus} Magnum Coins`);
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
  } catch (error) {
    logError(error, 'Изменение базового бонуса админом');
    await ctx.reply('❌ Ошибка изменения бонуса');
  }
}

async function handleAdminSetMinerReward(ctx, user, text) {
  try {
    const newReward = parseFloat(text);
    if (isNaN(newReward) || newReward < 0) {
      await ctx.reply('❌ Неверное значение. Введите положительное число');
      return;
    }
    
    // Обновляем настройку в базе данных
    await db.collection('config').updateOne(
      { key: 'MINER_REWARD_PER_HOUR' },
      { $set: { value: newReward, updatedAt: new Date() } },
      { upsert: true }
    );
    
    // Обновляем конфиг в памяти
    config.MINER_REWARD_PER_HOUR = newReward;
    
    await ctx.reply(`✅ Награда майнера изменена на ${newReward} Magnum Coins в час`);
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
  } catch (error) {
    logError(error, 'Изменение награды майнера админом');
    await ctx.reply('❌ Ошибка изменения награды майнера');
  }
}

async function handleAdminSetReferralReward(ctx, user, text) {
  try {
    const newReward = parseFloat(text);
    if (isNaN(newReward) || newReward < 0) {
      await ctx.reply('❌ Неверное значение. Введите положительное число');
      return;
    }
    
    // Обновляем настройку в базе данных
    await db.collection('config').updateOne(
      { key: 'REFERRAL_REWARD' },
      { $set: { value: newReward, updatedAt: new Date() } },
      { upsert: true }
    );
    
    // Обновляем конфиг в памяти
    config.REFERRAL_REWARD = newReward;
    
    await ctx.reply(`✅ Награда за реферала изменена на ${newReward} Magnum Coins`);
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
  } catch (error) {
    logError(error, 'Изменение награды реферала админом');
    await ctx.reply('❌ Ошибка изменения награды реферала');
  }
}

async function handleAdminSetSubscriptionChannel(ctx, user, text) {
  try {
    let channel = text.trim();
    
    // Проверяем формат канала
    if (!channel.startsWith('@') && !channel.startsWith('https://t.me/')) {
      await ctx.reply('❌ Неверный формат канала. Используйте @channel или https://t.me/channel');
      return;
    }
    
    // Обновляем настройку в базе данных
    await db.collection('config').updateOne(
      { key: 'REQUIRED_CHANNEL' },
      { $set: { value: channel, updatedAt: new Date() } },
      { upsert: true }
    );
    
    // Обновляем конфиг в памяти
    config.REQUIRED_CHANNEL = channel;
    
    await ctx.reply(`✅ Обязательный канал подписки изменен на ${channel}`);
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
  } catch (error) {
    logError(error, 'Изменение канала подписки админом');
    await ctx.reply('❌ Ошибка изменения канала подписки');
  }
}

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

// Обмен
bot.action('exchange', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeMenu(ctx, user);
  } catch (error) {
    logError(error, 'Меню обмена');
  }
});

bot.action('exchange_10', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await performExchange(ctx, user, 10);
  } catch (error) {
    logError(error, 'Обмен 10 Magnum Coins');
  }
});

bot.action('exchange_50', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await performExchange(ctx, user, 50);
  } catch (error) {
    logError(error, 'Обмен 50 Magnum Coins');
  }
});

bot.action('exchange_100', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await performExchange(ctx, user, 100);
  } catch (error) {
    logError(error, 'Обмен 100 Magnum Coins');
  }
});

bot.action('exchange_500', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await performExchange(ctx, user, 500);
  } catch (error) {
    logError(error, 'Обмен 500 Magnum Coins');
  }
});

bot.action('exchange_all', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const amount = Math.floor(user.magnumCoins);
    if (amount <= 0) {
      await ctx.answerCbQuery('❌ У вас нет Magnum Coins для обмена!');
      return;
    }
    
    await performExchange(ctx, user, amount);
  } catch (error) {
    logError(error, 'Обмен всех Magnum Coins');
  }
});

// Достижения
bot.action('achievements', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAchievementsMenu(ctx, user);
  } catch (error) {
    logError(error, 'Меню достижений');
  }
});

bot.action('achievements_progress', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAchievementsProgress(ctx, user);
  } catch (error) {
    logError(error, 'Прогресс достижений');
  }
});

bot.action('achievements_rewards', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAchievementsRewards(ctx, user);
  } catch (error) {
    logError(error, 'Награды достижений');
  }
});

// Рефералы
bot.action('referrals', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showReferralsMenu(ctx, user);
  } catch (error) {
    logError(error, 'Меню рефералов');
  }
});

bot.action('referral_link', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showReferralLink(ctx, user);
  } catch (error) {
    logError(error, 'Реферальная ссылка');
  }
});

bot.action('referral_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showReferralStats(ctx, user);
  } catch (error) {
    logError(error, 'Статистика рефералов');
  }
});

bot.action('referral_rewards', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showReferralRewards(ctx, user);
  } catch (error) {
    logError(error, 'Награды рефералов');
  }
});

bot.action('referral_list', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showReferralList(ctx, user);
  } catch (error) {
    logError(error, 'Список рефералов');
  }
});

bot.action('copy_referral_link', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const botUsername = (await ctx.telegram.getMe()).username;
    const referralLink = `https://t.me/${botUsername}?start=${user.id}`;
    
    await ctx.answerCbQuery('📋 Ссылка скопирована в буфер обмена!');
    await ctx.reply(`🔗 Ваша реферальная ссылка:\n\`${referralLink}\``, { parse_mode: 'Markdown' });
  } catch (error) {
    logError(error, 'Копирование реферальной ссылки');
    await ctx.answerCbQuery('❌ Ошибка копирования ссылки');
  }
});

// Настройки
bot.action('settings', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showSettingsMenu(ctx, user);
  } catch (error) {
    logError(error, 'Меню настроек');
  }
});

bot.action('settings_notifications', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showNotificationSettings(ctx, user);
  } catch (error) {
    logError(error, 'Настройки уведомлений');
  }
});

bot.action('settings_privacy', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showPrivacySettings(ctx, user);
  } catch (error) {
    logError(error, 'Настройки приватности');
  }
});

bot.action('settings_language', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showLanguageSettings(ctx, user);
  } catch (error) {
    logError(error, 'Настройки языка');
  }
});

bot.action('settings_reset', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showResetSettings(ctx, user);
  } catch (error) {
    logError(error, 'Сброс настроек');
  }
});

// Переключатели настроек
bot.action('toggle_notifications', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await toggleNotificationSetting(ctx, user);
  } catch (error) {
    logError(error, 'Переключение уведомлений');
  }
});

bot.action('toggle_privacy', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await togglePrivacySetting(ctx, user);
  } catch (error) {
    logError(error, 'Переключение приватности');
  }
});

bot.action('set_language_ru', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await setLanguage(ctx, user, 'ru');
  } catch (error) {
    logError(error, 'Установка языка RU');
  }
});

bot.action('set_language_en', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await setLanguage(ctx, user, 'en');
  } catch (error) {
    logError(error, 'Установка языка EN');
  }
});

bot.action('confirm_reset', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await resetUserSettings(ctx, user);
  } catch (error) {
    logError(error, 'Сброс настроек пользователя');
  }
});

// Задания
bot.action('tasks', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showTasksMenu(ctx, user);
  } catch (error) {
    logError(error, 'Меню заданий');
  }
});

bot.action('tasks_sponsor', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showSponsorTasks(ctx, user);
  } catch (error) {
    logError(error, 'Спонсорские задания');
  }
});

bot.action('tasks_daily', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showDailyTasks(ctx, user);
  } catch (error) {
    logError(error, 'Ежедневные задания');
  }
});

bot.action('tasks_progress', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showTasksProgress(ctx, user);
  } catch (error) {
    logError(error, 'Прогресс заданий');
  }
});

// Обработка спонсорских заданий
bot.action(/^sponsor_task_(\d+)$/, async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const taskId = parseInt(ctx.match[1]);
    await showSponsorTaskDetails(ctx, user, taskId);
  } catch (error) {
    logError(error, 'Детали спонсорского задания');
  }
});

bot.action(/^claim_sponsor_(\d+)$/, async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const taskId = parseInt(ctx.match[1]);
    await claimSponsorTask(ctx, user, taskId);
  } catch (error) {
    logError(error, 'Получение награды спонсорского задания');
  }
});

bot.action(/^verify_sponsor_(\d+)$/, async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const taskId = parseInt(ctx.match[1]);
    await verifySponsorTask(ctx, user, taskId);
  } catch (error) {
    logError(error, 'Проверка спонсорского задания');
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

// Статистика фарма
bot.action('farm_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showFarmStats(ctx, user);
  } catch (error) {
    logError(error, 'Статистика фарма (обработчик)');
  }
});

// Бонусы фарма
bot.action('farm_bonuses', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showFarmBonuses(ctx, user);
  } catch (error) {
    logError(error, 'Бонусы фарма (обработчик)');
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

bot.action('bonus_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showBonusStats(ctx, user);
  } catch (error) {
    logError(error, 'Статистика бонуса (обработчик)');
  }
});

bot.action('bonus_streak', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showBonusStreak(ctx, user);
  } catch (error) {
    logError(error, 'Серия бонуса (обработчик)');
  }
});

// Обработка кулдаунов
bot.action('farm_cooldown', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const farm = user.farm;
    const now = Date.now();
    const lastFarm = farm.lastFarm ? farm.lastFarm.getTime() : 0;
    const timeSince = Math.floor((now - lastFarm) / 1000);
    const cooldown = config.FARM_COOLDOWN;
    
    if (timeSince < cooldown) {
      const remaining = cooldown - timeSince;
      await ctx.answerCbQuery(`⏳ Подождите ${formatTime(remaining)} перед следующим фармом!`);
      
      // Запускаем таймер для автоматического обновления меню после истечения кулдауна
      setTimeout(async () => {
        try {
          const updatedUser = await getUser(ctx.from.id);
          if (updatedUser) {
            await updateFarmMenu(ctx, updatedUser);
            log(`🔄 Автоматическое обновление меню фарма для пользователя ${user.id} после истечения кулдауна`);
          }
        } catch (error) {
          logError(error, 'Автоматическое обновление меню фарма');
        }
      }, remaining * 1000);
    } else {
      // Если кулдаун уже истек, обновляем меню
      await updateFarmMenu(ctx, user);
    }
  } catch (error) {
    logError(error, 'Кулдаун фарма');
  }
});

bot.action('bonus_cooldown', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const bonus = user.dailyBonus;
    const now = Date.now();
    const lastBonus = bonus.lastBonus ? bonus.lastBonus.getTime() : 0;
    const timeSince = now - lastBonus;
    const dayInMs = 24 * 60 * 60 * 1000;
    
    if (timeSince < dayInMs) {
      const remaining = dayInMs - timeSince;
      await ctx.answerCbQuery(`⏳ Подождите ${formatTime(Math.floor(remaining / 1000))} до следующего бонуса!`);
      
      // Запускаем таймер для автоматического обновления меню после истечения кулдауна
      setTimeout(async () => {
        try {
          const updatedUser = await getUser(ctx.from.id);
          if (updatedUser) {
            await updateBonusMenu(ctx, updatedUser);
            log(`🔄 Автоматическое обновление меню бонуса для пользователя ${user.id} после истечения кулдауна`);
          }
        } catch (error) {
          logError(error, 'Автоматическое обновление меню бонуса');
        }
      }, remaining);
    } else {
      // Если кулдаун уже истек, обновляем меню
      await updateBonusMenu(ctx, user);
    }
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

// Админ панель
bot.action('admin', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminPanel(ctx, user);
  } catch (error) {
    logError(error, 'Админ панель (обработчик)');
  }
});

bot.action('admin_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminStats(ctx, user);
  } catch (error) {
    logError(error, 'Статистика бота (обработчик)');
  }
});

bot.action('admin_users', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminUsers(ctx, user);
  } catch (error) {
    logError(error, 'Управление пользователями (обработчик)');
  }
});

bot.action('admin_balance', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminBalance(ctx, user);
  } catch (error) {
    logError(error, 'Управление балансами (обработчик)');
  }
});

bot.action('admin_settings', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminSettings(ctx, user);
  } catch (error) {
    logError(error, 'Настройки бота (обработчик)');
  }
});

bot.action('admin_search_user', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminSearchUser(ctx, user);
  } catch (error) {
    logError(error, 'Поиск пользователя (обработчик)');
  }
});

bot.action('admin_top_users', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminTopUsers(ctx, user);
  } catch (error) {
    logError(error, 'Топ пользователей (обработчик)');
  }
});

bot.action('admin_ban_user', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminBanUser(ctx, user);
  } catch (error) {
    logError(error, 'Блокировка пользователя (обработчик)');
  }
});

bot.action('admin_unban_user', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminUnbanUser(ctx, user);
  } catch (error) {
    logError(error, 'Разблокировка пользователя (обработчик)');
  }
});

// Обработчики настроек бота
bot.action('admin_farm_rewards', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminFarmRewards(ctx, user);
  } catch (error) {
    logError(error, 'Настройки наград фарма (обработчик)');
  }
});

bot.action('admin_cooldowns', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminCooldowns(ctx, user);
  } catch (error) {
    logError(error, 'Настройки кулдаунов (обработчик)');
  }
});

bot.action('admin_daily_bonus', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminDailyBonus(ctx, user);
  } catch (error) {
    logError(error, 'Настройки ежедневного бонуса (обработчик)');
  }
});

bot.action('admin_miner_settings', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminMinerSettings(ctx, user);
  } catch (error) {
    logError(error, 'Настройки майнера (обработчик)');
  }
});

bot.action('admin_referral_settings', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminReferralSettings(ctx, user);
  } catch (error) {
    logError(error, 'Настройки реферальной системы (обработчик)');
  }
});

bot.action('admin_subscription_channels', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminSubscriptionChannels(ctx, user);
  } catch (error) {
    logError(error, 'Настройки каналов подписки (обработчик)');
  }
});

// Обработчики возврата к настройкам
bot.action('admin_settings', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminSettings(ctx, user);
  } catch (error) {
    logError(error, 'Возврат к настройкам (обработчик)');
  }
});

bot.action('admin_users', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminUsers(ctx, user);
  } catch (error) {
    logError(error, 'Управление пользователями (обработчик)');
  }
});

// Обработчики изменения настроек
bot.action('admin_farm_reward_set', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Устанавливаем состояние для ввода награды
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'setting_farm_reward', updatedAt: new Date() } }
    );
    
    await ctx.reply('🎯 Введите новую базовую награду фарма (в Magnum Coins):');
  } catch (error) {
    logError(error, 'Установка награды фарма (обработчик)');
  }
});

bot.action('admin_cooldown_farm', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Устанавливаем состояние для ввода кулдауна
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'setting_farm_cooldown', updatedAt: new Date() } }
    );
    
    await ctx.reply('⏰ Введите новый кулдаун фарма (в секундах):');
  } catch (error) {
    logError(error, 'Установка кулдауна фарма (обработчик)');
  }
});

bot.action('admin_bonus_base', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Устанавливаем состояние для ввода базового бонуса
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'setting_bonus_base', updatedAt: new Date() } }
    );
    
    await ctx.reply('🎁 Введите новую базовую награду ежедневного бонуса (в Magnum Coins):');
  } catch (error) {
    logError(error, 'Установка базового бонуса (обработчик)');
  }
});

bot.action('admin_miner_reward', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Устанавливаем состояние для ввода награды майнера
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'setting_miner_reward', updatedAt: new Date() } }
    );
    
    await ctx.reply('⛏️ Введите новую награду майнера (в Magnum Coins за час):');
  } catch (error) {
    logError(error, 'Установка награды майнера (обработчик)');
  }
});

bot.action('admin_referral_reward', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Устанавливаем состояние для ввода награды реферала
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'setting_referral_reward', updatedAt: new Date() } }
    );
    
    await ctx.reply('👥 Введите новую награду за реферала (в Magnum Coins):');
  } catch (error) {
    logError(error, 'Установка награды реферала (обработчик)');
  }
});

bot.action('admin_subscription_add', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Устанавливаем состояние для ввода канала подписки
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'setting_subscription_channel', updatedAt: new Date() } }
    );
    
    await ctx.reply('📢 Введите канал для обязательной подписки (@channel или https://t.me/channel):');
  } catch (error) {
    logError(error, 'Добавление канала подписки (обработчик)');
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