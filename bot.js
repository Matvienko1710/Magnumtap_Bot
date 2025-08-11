require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

// Импорт модулей
const UserModule = require('./userModule');
const MinerModule = require('./minerModule');
const ExchangeModule = require('./exchangeModule');
const WithdrawalModule = require('./withdrawalModule');
const AdminModule = require('./adminModule');
const TasksModule = require('./tasksModule');
const SupportModule = require('./supportModule');
const InterfaceModule = require('./interfaceModule');

// Конфигурация
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
  
  // Майнер
  MINER_PROCESS_INTERVAL: 30 * 60 * 1000, // 30 минут
  
  // Резерв биржи
  INITIAL_RESERVE_MAGNUM_COINS: 1000000,
  INITIAL_RESERVE_STARS: 1000000
};

// Класс для работы с базой данных
class Database {
  constructor() {
    this.client = null;
    this.db = null;
    this.collections = {};
  }

  async connect() {
    try {
      this.client = new MongoClient(config.MONGODB_URI);
      await this.client.connect();
      this.db = this.client.db();
      
      // Инициализируем коллекции
      this.collections.users = this.db.collection('users');
      this.collections.promocodes = this.db.collection('promocodes');
      this.collections.withdrawals = this.db.collection('withdrawalRequests');
      this.collections.support = this.db.collection('supportTickets');
      this.collections.tasks = this.db.collection('taskChecks');
      this.collections.reserve = this.db.collection('reserve');
      this.collections.transactions = this.db.collection('transactions');
      this.collections.achievements = this.db.collection('achievements');
      this.collections.titles = this.db.collection('titles');
      this.collections.ranks = this.db.collection('ranks');
      this.collections.dailyTasks = this.db.collection('dailyTasks');
      this.collections.sponsorTasks = this.db.collection('sponsorTasks');
      this.collections.minerRewards = this.db.collection('minerRewards');
      this.collections.exchangeHistory = this.db.collection('exchangeHistory');
      this.collections.userStats = this.db.collection('userStats');
      this.collections.botStats = this.db.collection('botStats');
      this.collections.adminLogs = this.db.collection('adminLogs');
      this.collections.errorLogs = this.db.collection('errorLogs');
      this.collections.notifications = this.db.collection('notifications');
      
      await this.createIndexes();
      await this.initializeReserve();
      
      console.log('✅ База данных подключена');
    } catch (error) {
      console.error('❌ Ошибка подключения к БД:', error);
      throw error;
    }
  }

  async createIndexes() {
    try {
      // Индексы для пользователей
      await this.collections.users.createIndex({ id: 1 }, { unique: true });
      await this.collections.users.createIndex({ username: 1 });
      await this.collections.users.createIndex({ 'miner.active': 1 });
      await this.collections.users.createIndex({ lastSeen: -1 });
      await this.collections.users.createIndex({ invitedBy: 1 });
      await this.collections.users.createIndex({ status: 1 });
      await this.collections.users.createIndex({ created: -1 });
      
      // Индексы для промокодов
      await this.collections.promocodes.createIndex({ code: 1 }, { unique: true });
      await this.collections.promocodes.createIndex({ isActive: 1 });
      await this.collections.promocodes.createIndex({ expiresAt: 1 });
      await this.collections.promocodes.createIndex({ createdBy: 1 });
      
      // Индексы для выводов
      await this.collections.withdrawals.createIndex({ userId: 1 });
      await this.collections.withdrawals.createIndex({ status: 1 });
      await this.collections.withdrawals.createIndex({ createdAt: -1 });
      await this.collections.withdrawals.createIndex({ amount: 1 });
      
      // Индексы для поддержки
      await this.collections.support.createIndex({ userId: 1 });
      await this.collections.support.createIndex({ status: 1 });
      await this.collections.support.createIndex({ createdAt: -1 });
      
      // Индексы для заданий
      await this.collections.tasks.createIndex({ userId: 1 });
      await this.collections.tasks.createIndex({ status: 1 });
      await this.collections.tasks.createIndex({ createdAt: -1 });
      await this.collections.tasks.createIndex({ taskType: 1 });
      
      // Индексы для транзакций
      await this.collections.transactions.createIndex({ userId: 1 });
      await this.collections.transactions.createIndex({ type: 1 });
      await this.collections.transactions.createIndex({ createdAt: -1 });
      
      // Индексы для достижений
      await this.collections.achievements.createIndex({ userId: 1 });
      await this.collections.achievements.createIndex({ type: 1 });
      
      // Индексы для титулов
      await this.collections.titles.createIndex({ userId: 1 });
      await this.collections.titles.createIndex({ isMain: 1 });
      
      // Индексы для рангов
      await this.collections.ranks.createIndex({ minStars: 1 });
      
      // Индексы для ежедневных заданий
      await this.collections.dailyTasks.createIndex({ userId: 1 });
      await this.collections.dailyTasks.createIndex({ date: 1 });
      
      // Индексы для спонсорских заданий
      await this.collections.sponsorTasks.createIndex({ userId: 1 });
      await this.collections.sponsorTasks.createIndex({ status: 1 });
      
      // Индексы для наград майнера
      await this.collections.minerRewards.createIndex({ userId: 1 });
      await this.collections.minerRewards.createIndex({ createdAt: -1 });
      
      // Индексы для истории обменов
      await this.collections.exchangeHistory.createIndex({ userId: 1 });
      await this.collections.exchangeHistory.createIndex({ createdAt: -1 });
      
      // Индексы для статистики пользователей
      await this.collections.userStats.createIndex({ userId: 1 });
      await this.collections.userStats.createIndex({ date: 1 });
      
      // Индексы для статистики бота
      await this.collections.botStats.createIndex({ date: 1 });
      
      // Индексы для логов админов
      await this.collections.adminLogs.createIndex({ adminId: 1 });
      await this.collections.adminLogs.createIndex({ action: 1 });
      await this.collections.adminLogs.createIndex({ createdAt: -1 });
      
      // Индексы для логов ошибок
      await this.collections.errorLogs.createIndex({ createdAt: -1 });
      await this.collections.errorLogs.createIndex({ type: 1 });
      
      // Индексы для уведомлений
      await this.collections.notifications.createIndex({ userId: 1 });
      await this.collections.notifications.createIndex({ isRead: 1 });
      await this.collections.notifications.createIndex({ createdAt: -1 });
      
      console.log('✅ Индексы созданы');
    } catch (error) {
      console.error('❌ Ошибка создания индексов:', error);
      throw error;
    }
  }

  async initializeReserve() {
    try {
      const reserve = await this.collections.reserve.findOne({});
      if (!reserve) {
        await this.collections.reserve.insertOne({
          magnumCoins: config.INITIAL_RESERVE_MAGNUM_COINS,
          stars: config.INITIAL_RESERVE_STARS,
          totalExchanges: 0,
          totalVolume: 0,
          lastUpdated: new Date()
        });
        console.log('✅ Резерв биржи инициализирован');
      }
    } catch (error) {
      console.error('❌ Ошибка инициализации резерва:', error);
    }
  }

  async close() {
    if (this.client) {
      await this.client.close();
    }
  }
}

// Класс для кеширования
class Cache {
  constructor() {
    this.userCache = new Map();
    this.statsCache = new Map();
    this.rateLimitCache = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // каждую минуту
  }

  setUser(userId, userData) {
    this.userCache.set(userId.toString(), {
      data: userData,
      timestamp: Date.now()
    });
  }

  getUser(userId) {
    const cached = this.userCache.get(userId.toString());
    if (cached && (Date.now() - cached.timestamp) < config.USER_CACHE_TTL) {
      return cached.data;
    }
    this.userCache.delete(userId.toString());
    return null;
  }

  setStats(key, data) {
    this.statsCache.set(key, {
      data: data,
      timestamp: Date.now()
    });
  }

  getStats(key) {
    const cached = this.statsCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < config.STATS_CACHE_TTL) {
      return cached.data;
    }
    this.statsCache.delete(key);
    return null;
  }

  checkRateLimit(userId) {
    const now = Date.now();
    const userLimits = this.rateLimitCache.get(userId.toString()) || [];
    
    // Удаляем старые запросы
    const validRequests = userLimits.filter(time => now - time < config.RATE_LIMIT_WINDOW);
    
    if (validRequests.length >= config.RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }
    
    validRequests.push(now);
    this.rateLimitCache.set(userId.toString(), validRequests);
    return true;
  }

  cleanup() {
    const now = Date.now();
    
    // Очистка кеша пользователей
    for (const [key, value] of this.userCache.entries()) {
      if (now - value.timestamp > config.USER_CACHE_TTL) {
        this.userCache.delete(key);
      }
    }
    
    // Очистка кеша статистики
    for (const [key, value] of this.statsCache.entries()) {
      if (now - value.timestamp > config.STATS_CACHE_TTL) {
        this.statsCache.delete(key);
      }
    }
    
    // Очистка rate limit кеша
    for (const [key, requests] of this.rateLimitCache.entries()) {
      const validRequests = requests.filter(time => now - time < config.RATE_LIMIT_WINDOW);
      if (validRequests.length === 0) {
        this.rateLimitCache.delete(key);
      } else {
        this.rateLimitCache.set(key, validRequests);
      }
    }
  }

  clear() {
    this.userCache.clear();
    this.statsCache.clear();
    this.rateLimitCache.clear();
  }
}

// Класс для утилит
class Utils {
  static formatNumber(num) {
    if (num === null || num === undefined) return '0';
    
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(2) + 'B';
    } else if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(2) + 'K';
    } else {
      return num.toFixed(2);
    }
  }

  static formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}ч ${minutes}м ${secs}с`;
    } else if (minutes > 0) {
      return `${minutes}м ${secs}с`;
    } else {
      return `${secs}с`;
    }
  }

  static formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  static calculateCommission(amount) {
    return amount * (config.EXCHANGE_COMMISSION / 100);
  }

  static calculateExchangeRate(fromCurrency, toCurrency, reserve) {
    if (fromCurrency === 'magnumCoins' && toCurrency === 'stars') {
      return reserve.stars / reserve.magnumCoins;
    } else if (fromCurrency === 'stars' && toCurrency === 'magnumCoins') {
      return reserve.magnumCoins / reserve.stars;
    }
    return 1;
  }

  static calculateMinerReward() {
    return config.MINER_REWARD_PER_HOUR;
  }

  static calculateFarmReward(user, baseReward = config.FARM_BASE_REWARD) {
    let reward = baseReward;
    
    // Бонусы за достижения
    if (user.achievements) {
      const farmBoost = user.achievements.find(a => a.type === 'farm_boost');
      if (farmBoost) {
        reward *= (1 + farmBoost.level * 0.1);
      }
    }
    
    // Множители от титулов
    if (user.titles && user.titles.length > 0) {
      const farmTitle = user.titles.find(t => t.type === 'farm_boost');
      if (farmTitle) {
        reward *= (1 + farmTitle.boost);
      }
    }
    
    // Бонус за серию ежедневных бонусов
    if (user.dailyStreak) {
      reward *= (1 + Math.floor(user.dailyStreak / 7) * 0.1);
    }
    
    return Math.max(reward, 0.1);
  }

  static checkCooldown(lastAction, cooldownSeconds) {
    const now = Math.floor(Date.now() / 1000);
    return now - lastAction >= cooldownSeconds;
  }

  static validatePromocode(code) {
    return /^[A-Z0-9]{4,12}$/.test(code);
  }

  static validateWithdrawalAmount(amount) {
    return amount >= config.MIN_WITHDRAWAL && amount <= config.MAX_WITHDRAWAL;
  }

  static validateWallet(wallet, method) {
    if (method === 'USDT_TRC20') {
      return /^T[A-Za-z1-9]{33}$/.test(wallet);
    } else if (method === 'BTC') {
      return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(wallet);
    } else if (method === 'ETH') {
      return /^0x[a-fA-F0-9]{40}$/.test(wallet);
    }
    return false;
  }

  static handleError(error, context = '') {
    console.error(`❌ Ошибка ${context}:`, error);
    
    if (error.code === 11000) {
      return 'Дублирование данных';
    } else if (error.name === 'ValidationError') {
      return 'Ошибка валидации данных';
    } else if (error.name === 'CastError') {
      return 'Неверный формат данных';
    } else if (error.code === 121) {
      return 'Ошибка документа';
    }
    
    return 'Внутренняя ошибка сервера';
  }

  static isAdmin(userId) {
    return config.ADMIN_IDS.includes(parseInt(userId));
  }

  static now() {
    return Math.floor(Date.now() / 1000);
  }

  static getCurrentDay() {
    return Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  }

  static isNewDay(lastBonusDay) {
    return this.getCurrentDay() > lastBonusDay;
  }

  static calculateProgress(current, target) {
    return Math.min((current / target) * 100, 100);
  }

  static formatProgress(current, target) {
    const progress = this.calculateProgress(current, target);
    const filled = Math.floor(progress / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty) + ` ${progress.toFixed(1)}%`;
  }

  static generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  static generatePromocode(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  static filterObject(obj, allowedKeys) {
    const filtered = {};
    for (const key of allowedKeys) {
      if (obj.hasOwnProperty(key)) {
        filtered[key] = obj[key];
      }
    }
    return filtered;
  }

  static sortBy(array, key, order = 'asc') {
    return array.sort((a, b) => {
      let aVal = a[key];
      let bVal = b[key];
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (order === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }

  static truncate(str, length = 100) {
    if (str.length <= length) return str;
    return str.substring(0, length) + '...';
  }

  static escapeMarkdown(text) {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  static roundTo(num, decimals = 2) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  static clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
  }

  static random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidPhone(phone) {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }

  static isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

// Инициализация
const database = new Database();
const cache = new Cache();

// Инициализация модулей
const userModule = new UserModule(database, cache);
const minerModule = new MinerModule(database, cache);
const exchangeModule = new ExchangeModule(database, cache);
const withdrawalModule = new WithdrawalModule(database, cache);
const adminModule = new AdminModule(database, cache);
const tasksModule = new TasksModule(database, cache);
const supportModule = new SupportModule(database, cache);
const interfaceModule = new InterfaceModule(database, cache);

// Создание бота
const bot = new Telegraf(config.BOT_TOKEN);

// Middleware для rate limiting
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (userId && !Utils.isAdmin(userId)) {
    if (!cache.checkRateLimit(userId)) {
      await ctx.reply('⚠️ Слишком много запросов. Подождите немного.');
      return;
    }
  }
  await next();
});

// Middleware для логирования
bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  
  if (ctx.from) {
    console.log(`📱 ${ctx.from.id} (${ctx.from.username || 'Unknown'}) - ${ctx.updateType} - ${ms}ms`);
  }
});

// Обработка команды /start
bot.start(async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  
  try {
    const userId = ctx.from.id;
    const user = await userModule.getUser(userId, ctx);
    
    // Проверяем подписку если требуется
    if (config.REQUIRED_CHANNEL) {
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
  if (!config.REQUIRED_CHANNEL) return true;
  
  try {
    const channelId = config.REQUIRED_CHANNEL.startsWith('@') ? 
      config.REQUIRED_CHANNEL : `@${config.REQUIRED_CHANNEL}`;
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
  
  const channelName = config.REQUIRED_CHANNEL.replace('@', '');
  const channelLink = `https://t.me/${channelName}`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('📢 Подписаться на канал', channelLink)],
    [Markup.button.url('🤖 Запустить бота', config.REQUIRED_BOT_LINK)],
    [Markup.button.callback('✅ Проверить', 'check_subscription')]
  ]);
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

// Обработка реферальной системы
async function handleReferral(userId, referrerId) {
  try {
    const user = await userModule.getUser(userId);
    const referrer = await userModule.getUser(referrerId);
    
    if (user.invitedBy) {
      return; // Пользователь уже был приглашен
    }
    
    if (userId === referrerId) {
      return; // Нельзя пригласить самого себя
    }
    
    // Обновляем данные пользователя
    await userModule.updateUser(userId, {
      invitedBy: parseInt(referrerId)
    });
    
    // Обновляем данные пригласившего
    await userModule.incrementUserField(referrerId, 'invited', 1);
    await userModule.incrementUserField(referrerId, 'stars', config.REFERRAL_BONUS);
    
    console.log(`👥 Реферал: ${referrerId} пригласил ${userId}`);
  } catch (error) {
    console.error('Ошибка обработки реферала:', error);
  }
}

// Показать главное меню
async function showMainMenu(ctx, user) {
  const welcomeMessage = `🎉 **Добро пожаловать в Magnum Stars!**\n\n` +
                        `💰 Ваш баланс:\n` +
                        `⭐ Звезды: ${Utils.formatNumber(user.stars)}\n` +
                        `🪙 Magnum Coins: ${Utils.formatNumber(user.magnumCoins)}\n\n` +
                        `Выберите действие:`;
  
  await ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: interfaceModule.getMainMenu(user).reply_markup
  });
}

// Обработчики кнопок
bot.action('main_menu', async (ctx) => {
  try {
    const user = await userModule.getUser(ctx.from.id);
    await showMainMenu(ctx, user);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка главного меню:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Фарм
bot.action('farm', async (ctx) => {
  try {
    const result = await userModule.farmStars(ctx.from.id, ctx);
    
    if (result.success) {
      const message = `🌾 **Фарм выполнен!**\n\n` +
                     `💎 Получено: ${result.reward.toFixed(4)}⭐\n` +
                     `💰 Новый баланс: ${Utils.formatNumber(result.newBalance)}⭐\n\n` +
                     `⏰ Следующий фарм через 10 секунд`;
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: interfaceModule.getMainMenu(await userModule.getUser(ctx.from.id)).reply_markup
      });
    } else {
      await ctx.reply(result.message, {
        reply_markup: interfaceModule.getMainMenu(await userModule.getUser(ctx.from.id)).reply_markup
      });
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка фарма:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Ежедневный бонус
bot.action('bonus', async (ctx) => {
  try {
    const result = await userModule.claimDailyBonus(ctx.from.id, ctx);
    
    if (result.success) {
      const message = `🎁 **Ежедневный бонус получен!**\n\n` +
                     `💎 Получено: ${result.reward}⭐\n` +
                     `📅 Серия: ${result.streak} дней\n` +
                     `💰 Новый баланс: ${Utils.formatNumber(result.newBalance)}⭐\n\n` +
                     `🔄 Следующий бонус завтра`;
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: interfaceModule.getMainMenu(await userModule.getUser(ctx.from.id)).reply_markup
      });
    } else {
      await ctx.reply(result.message, {
        reply_markup: interfaceModule.getMainMenu(await userModule.getUser(ctx.from.id)).reply_markup
      });
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка бонуса:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Майнер
bot.action('miner', async (ctx) => {
  try {
    const user = await userModule.getUser(ctx.from.id);
    const minerStats = await minerModule.getMinerStats(ctx.from.id, ctx);
    
    const message = interfaceModule.formatMinerStats(minerStats);
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: interfaceModule.getMinerMenu(user, minerStats).reply_markup
    });
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка майнера:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Запуск майнера
bot.action('start_miner', async (ctx) => {
  try {
    const result = await minerModule.startMiner(ctx.from.id, ctx);
    
    if (result.success) {
      await ctx.reply(result.message, {
        reply_markup: interfaceModule.getMinerMenu(
          await userModule.getUser(ctx.from.id),
          await minerModule.getMinerStats(ctx.from.id, ctx)
        ).reply_markup
      });
    } else {
      await ctx.reply(result.message);
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка запуска майнера:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Остановка майнера
bot.action('stop_miner', async (ctx) => {
  try {
    const result = await minerModule.stopMiner(ctx.from.id, ctx);
    
    if (result.success) {
      await ctx.reply(result.message, {
        reply_markup: interfaceModule.getMinerMenu(
          await userModule.getUser(ctx.from.id),
          await minerModule.getMinerStats(ctx.from.id, ctx)
        ).reply_markup
      });
    } else {
      await ctx.reply(result.message);
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка остановки майнера:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Обмен
bot.action('exchange', async (ctx) => {
  try {
    const rates = await exchangeModule.getExchangeRates();
    
    if (rates.success) {
      const message = interfaceModule.formatExchangeRates(rates);
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: interfaceModule.getExchangeMenu().reply_markup
      });
    } else {
      await ctx.reply(rates.message);
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка обмена:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Вывод
bot.action('withdrawal', async (ctx) => {
  try {
    const user = await userModule.getUser(ctx.from.id);
    
    const message = `💳 **Вывод средств**\n\n` +
                   `💰 Доступно для вывода: ${Utils.formatNumber(user.magnumCoins)}🪙\n` +
                   `📊 Минимальная сумма: 100🪙\n` +
                   `📈 Максимальная сумма: 10,000🪙\n\n` +
                   `💡 Выберите действие:`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: interfaceModule.getWithdrawalMenu().reply_markup
    });
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка вывода:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Промокоды
bot.action('promocodes', async (ctx) => {
  try {
    const message = `🎫 **Промокоды**\n\n` +
                   `💡 Активируйте промокоды для получения бонусов!\n\n` +
                   `🎁 Награды могут включать:\n` +
                   `• Звезды ⭐\n` +
                   `• Magnum Coins 🪙\n` +
                   `• Специальные награды 🏆\n\n` +
                   `Выберите действие:`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: interfaceModule.getPromocodesMenu().reply_markup
    });
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка промокодов:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Рефералы
bot.action('referrals', async (ctx) => {
  try {
    const user = await userModule.getUser(ctx.from.id);
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${user.id}`;
    
    const message = `👥 **Реферальная система**\n\n` +
                   `🔗 Ваша ссылка:\n` +
                   `\`${referralLink}\`\n\n` +
                   `📊 Статистика:\n` +
                   `👥 Приглашено: ${user.invited || 0} человек\n` +
                   `💰 Заработано: ${Utils.formatNumber((user.invited || 0) * config.REFERRAL_BONUS)}⭐\n\n` +
                   `💡 За каждого приглашенного друга вы получаете ${config.REFERRAL_BONUS}⭐`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: interfaceModule.getReferralsMenu(user).reply_markup
    });
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка рефералов:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Достижения
bot.action('achievements', async (ctx) => {
  try {
    const result = await tasksModule.getAchievements(ctx.from.id, ctx);
    
    if (result.success) {
      const message = interfaceModule.formatAchievements(result.achievements);
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: interfaceModule.getAchievementsMenu().reply_markup
      });
    } else {
      await ctx.reply(result.message);
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка достижений:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Задания
bot.action('tasks', async (ctx) => {
  try {
    const message = `📋 **Задания**\n\n` +
                   `🎯 Выполняйте задания для получения наград!\n\n` +
                   `📅 **Ежедневные задания** - обновляются каждый день\n` +
                   `🎁 **Спонсорские задания** - разовые задания с наградами\n\n` +
                   `💡 Выберите тип заданий:`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: interfaceModule.getTasksMenu().reply_markup
    });
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка заданий:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Профиль
bot.action('profile', async (ctx) => {
  try {
    const result = await userModule.getProfile(ctx.from.id, ctx);
    
    if (result) {
      const message = interfaceModule.formatProfile(
        result.user,
        result.rank,
        result.mainTitle,
        result.botStats
      );
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: interfaceModule.getMainMenu(result.user).reply_markup
      });
    } else {
      await ctx.reply('❌ Ошибка получения профиля');
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка профиля:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Поддержка
bot.action('support', async (ctx) => {
  try {
    const message = `❓ **Поддержка**\n\n` +
                   `📞 Нужна помощь? Мы готовы помочь!\n\n` +
                   `📝 **Создать тикет** - для решения проблем\n` +
                   `❓ **FAQ** - часто задаваемые вопросы\n` +
                   `📞 **Связаться** - прямая связь с поддержкой\n\n` +
                   `⏱️ Время ответа: 1-24 часа`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: interfaceModule.getSupportMenu().reply_markup
    });
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка поддержки:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Настройки
bot.action('settings', async (ctx) => {
  try {
    const message = `⚙️ **Настройки**\n\n` +
                   `🔧 Настройте бота под себя:\n\n` +
                   `🔔 **Уведомления** - управление уведомлениями\n` +
                   `🌍 **Язык** - выбор языка интерфейса\n` +
                   `🔒 **Приватность** - настройки приватности\n` +
                   `📱 **Интерфейс** - настройки отображения`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: interfaceModule.getSettingsMenu().reply_markup
    });
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка настроек:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Админ панель
bot.action('admin', async (ctx) => {
  try {
    if (!Utils.isAdmin(ctx.from.id)) {
      await ctx.reply('❌ Доступ запрещен');
      await ctx.answerCbQuery();
      return;
    }
    
    const stats = await adminModule.getAdminStats();
    
    if (stats) {
      const message = `🔧 **Админ панель**\n\n` +
                     `📊 **Статистика**\n` +
                     `👥 Пользователей: ${Utils.formatNumber(stats.users.totalUsers)}\n` +
                     `⛏️ Активных майнеров: ${Utils.formatNumber(stats.users.activeMiners)}\n` +
                     `💰 Выводов в ожидании: ${Utils.formatNumber(stats.withdrawals.pendingCount)}\n` +
                     `📋 Открытых тикетов: ${Utils.formatNumber(stats.support?.openTickets || 0)}\n\n` +
                     `📈 **Сегодня**\n` +
                     `🆕 Новых пользователей: ${Utils.formatNumber(stats.today.newUsers)}\n` +
                     `💳 Новых выводов: ${Utils.formatNumber(stats.today.newWithdrawals)}`;
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: interfaceModule.getAdminMenu().reply_markup
      });
    } else {
      await ctx.reply('❌ Ошибка получения статистики');
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка админ панели:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Проверка подписки
bot.action('check_subscription', async (ctx) => {
  try {
    const isSubscribed = await checkSubscription(ctx);
    
    if (isSubscribed) {
      const user = await userModule.getUser(ctx.from.id, ctx);
      await showMainMenu(ctx, user);
    } else {
      await ctx.reply('❌ Вы не подписаны на канал. Подпишитесь и попробуйте снова.');
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка проверки подписки:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

// Запуск бота
async function startBot() {
  try {
    await database.connect();
    
    // Запускаем обработку майнеров
    setInterval(async () => {
      await minerModule.processMinerRewards();
    }, config.MINER_PROCESS_INTERVAL);
    
    await bot.launch();
    console.log('🚀 Бот запущен!');
    
    // Graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error('❌ Ошибка запуска бота:', error);
    process.exit(1);
  }
}

console.log('🚀 Бот инициализирован. Загружаем модули...');

// Запускаем бота
startBot();