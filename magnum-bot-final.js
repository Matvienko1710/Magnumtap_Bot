require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');

// RichAds интеграция
const { 
  getRichAdsOffers, 
  verifyRichAdsOffer, 
  sendRichAdsConversion, 
  getRichAdsUserStats,
  isRichAdsAvailable 
} = require('./richads-integration');

// Конфигурация
const config = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  MONGODB_URI: process.env.MONGODB_URI,
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [],
  WEBAPP_ENABLED: process.env.WEBAPP_ENABLED === 'true',
  WEBAPP_URL: process.env.WEBAPP_URL || 'https://your-domain.com',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  PORT: process.env.PORT || 3000,
  DB_POOL_SIZE: parseInt(process.env.DB_POOL_SIZE) || 10,
  DB_CONNECTION_TIMEOUT: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000,
  API_TIMEOUT: parseInt(process.env.API_TIMEOUT) || 10000
};

// Система логирования
class Logger {
  constructor() {
    this.logDir = path.join(__dirname, 'logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data
    };

    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data);
    
    // Записываем в файл
    const logFile = path.join(this.logDir, `${level}.log`);
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  }

  info(message, data = {}) {
    this.log('info', message, data);
  }

  error(message, data = {}) {
    this.log('error', message, data);
  }

  warn(message, data = {}) {
    this.log('warn', message, data);
  }

  debug(message, data = {}) {
    if (config.LOG_LEVEL === 'debug') {
      this.log('debug', message, data);
    }
  }
}

const logger = new Logger();

// Система кэширования
class Cache {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map();
  }

  set(key, value, ttlMs = 300000) { // 5 минут по умолчанию
    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + ttlMs);
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    
    const expiry = this.ttl.get(key);
    if (Date.now() > expiry) {
      this.delete(key);
      return null;
    }
    
    return this.cache.get(key);
  }

  delete(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  clear() {
    this.cache.clear();
    this.ttl.clear();
  }

  isHealthy() {
    return this.cache.size < 1000; // Проверка на переполнение
  }

  getStats() {
    return {
      size: this.cache.size,
      healthy: this.isHealthy()
    };
  }
}

const cache = new Cache();

// Система валидации
class ValidationService {
  constructor() {
    this.rateLimits = new Map();
  }

  checkRateLimit(userId, action, limit = 10, windowMs = 60000) {
    const key = `${userId}_${action}`;
    const now = Date.now();
    const userActions = this.rateLimits.get(key) || [];
    
    // Удаляем старые действия
    const recentActions = userActions.filter(time => now - time < windowMs);
    
    if (recentActions.length >= limit) {
      return false;
    }
    
    recentActions.push(now);
    this.rateLimits.set(key, recentActions);
    return true;
  }

  validateUser(user) {
    return user && user.userId && typeof user.userId === 'number';
  }

  validateBalance(user) {
    return user && 
           typeof user.magnumCoins === 'number' && user.magnumCoins >= 0 &&
           typeof user.stars === 'number' && user.stars >= 0;
  }

  validateRewards(rewards) {
    return rewards && 
           typeof rewards.magnumCoins === 'number' && rewards.magnumCoins >= 0 &&
           typeof rewards.stars === 'number' && rewards.stars >= 0;
  }

  getStats() {
    return {
      rateLimits: this.rateLimits.size
    };
  }
}

const validationService = new ValidationService();

// Система метрик
class MetricsService {
  constructor() {
    this.metrics = {
      requests: { total: 0, successful: 0, failed: 0 },
      mining: { totalRewards: { magnumCoins: 0, stars: 0 }, clicks: 0 },
      richads: { requests: 0, completions: 0 },
      errors: { total: 0, recent: [] },
      startTime: Date.now()
    };
  }

  trackRequest(success = true) {
    this.metrics.requests.total++;
    if (success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }
  }

  trackMining(rewards) {
    if (rewards.magnumCoins) this.metrics.mining.totalRewards.magnumCoins += rewards.magnumCoins;
    if (rewards.stars) this.metrics.mining.totalRewards.stars += rewards.stars;
    this.metrics.mining.clicks++;
  }

  trackRichAds(action) {
    if (action === 'request') this.metrics.richads.requests++;
    if (action === 'completion') this.metrics.richads.completions++;
  }

  trackError(error) {
    this.metrics.errors.total++;
    this.metrics.errors.recent.push({
      message: error.message,
      timestamp: Date.now()
    });
    
    // Оставляем только последние 10 ошибок
    if (this.metrics.errors.recent.length > 10) {
      this.metrics.errors.recent.shift();
    }
  }

  getSummary() {
    const uptime = Date.now() - this.metrics.startTime;
    return {
      uptime: Math.floor(uptime / 1000 / 60), // минуты
      requests: this.metrics.requests,
      mining: this.metrics.mining,
      richads: this.metrics.richads,
      errors: this.metrics.errors.total,
      successRate: this.metrics.requests.total > 0 ? 
        (this.metrics.requests.successful / this.metrics.requests.total * 100).toFixed(2) : 0
    };
  }
}

const metricsService = new MetricsService();

// Создаем Express приложение с оптимизациями
const app = express();

// Безопасность
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Сжатие
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // лимит запросов
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Middleware для логирования запросов
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip, userAgent: req.get('User-Agent') });
  metricsService.trackRequest(true);
  next();
});

// Middleware для обработки JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Тестовый маршрут для проверки работы сервера
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Magnum Stars Bot is running',
    timestamp: new Date().toISOString(),
    metrics: metricsService.getSummary()
  });
});

// Эндпоинт для UptimeRobot - проверка работоспособности
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    message: 'Magnum Stars Bot is alive and running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    metrics: metricsService.getSummary(),
    cache: cache.getStats(),
    validation: validationService.getStats()
  });
});

// Детальная проверка здоровья
app.get('/health/detailed', async (req, res) => {
  try {
    const dbStatus = db ? 'connected' : 'disconnected';
    const cacheStatus = cache.isHealthy() ? 'healthy' : 'warning';
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      cache: cacheStatus,
      memory: process.memoryUsage(),
      metrics: metricsService.getSummary(),
      validation: validationService.getStats()
    });
  } catch (error) {
    logger.error('Health check error', { error: error.message });
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// Метрики
app.get('/metrics', (req, res) => {
  res.json(metricsService.getSummary());
});

// Эндпоинт для UptimeRobot - простая проверка
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// WebApp маршруты (если включены)
if (config.WEBAPP_ENABLED) {
  app.use('/webapp', express.static(path.join(__dirname, 'webapp'), {
    maxAge: '1h',
    etag: true
  }));

  app.get('/api/webapp/check-access', async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      const cacheKey = `webapp_access_${userId}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const user = await db.collection('users').findOne({ userId: parseInt(userId) });
      const hasAccess = user && config.ADMIN_IDS.includes(parseInt(userId));
      
      const result = { hasAccess, user: hasAccess ? user : null };
      cache.set(cacheKey, result, 300000); // 5 минут
      
      res.json(result);
    } catch (error) {
      logger.error('WebApp access check error', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/webapp/user-data', async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      const cacheKey = `user_data_${userId}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const user = await db.collection('users').findOne({ userId: parseInt(userId) });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      cache.set(cacheKey, user, 60000); // 1 минута
      res.json(user);
    } catch (error) {
      logger.error('User data error', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // WebApp API endpoints для действий
  app.post('/api/webapp/mining-click', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, message: 'Missing userId' });
      }

      // Проверяем rate limit
      if (!validationService.checkRateLimit(userId, 'mining_click', 10, 60000)) {
        return res.json({ success: false, message: 'Слишком много кликов. Подождите немного.' });
      }

      const user = await db.collection('users').findOne({ userId: parseInt(userId) });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Рассчитываем награду за активный клик
      const baseReward = 0.1;
      const levelMultiplier = 1 + (user.level - 1) * 0.1;
      const reward = baseReward * levelMultiplier;

      // Обновляем баланс пользователя
      await db.collection('users').updateOne(
        { userId: parseInt(userId) },
        { 
          $inc: { 
            magnumCoins: reward,
            'miningStats.activeClicks': 1,
            'miningStats.activeRewards': reward
          },
          $set: { lastActivity: new Date() }
        }
      );

      // Очищаем кэш
      cache.delete(`user_data_${userId}`);

      metricsService.trackMining({ magnumCoins: reward });

      res.json({ 
        success: true, 
        reward: reward.toFixed(2),
        message: `+${reward.toFixed(2)} MC за активный клик!`
      });

    } catch (error) {
      logger.error('Mining click error', { error: error.message, userId: req.body.userId });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/webapp/farm', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, message: 'Missing userId' });
      }

      // Проверяем rate limit для фарма
      if (!validationService.checkRateLimit(userId, 'farm', 1, 300000)) { // 5 минут
        return res.json({ success: false, message: 'Фарм доступен раз в 5 минут. Подождите немного.' });
      }

      const user = await db.collection('users').findOne({ userId: parseInt(userId) });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Рассчитываем награду за фарм
      const baseReward = 10;
      const levelBonus = Math.min(user.level * 0.1, 2);
      const reward = baseReward + levelBonus;

      // Обновляем баланс пользователя
      await db.collection('users').updateOne(
        { userId: parseInt(userId) },
        { 
          $inc: { 
            magnumCoins: reward,
            'miningStats.totalMinedMC': reward
          },
          $set: { lastActivity: new Date() }
        }
      );

      // Очищаем кэш
      cache.delete(`user_data_${userId}`);

      metricsService.trackMining({ magnumCoins: reward });

      res.json({ 
        success: true, 
        reward: reward.toFixed(2),
        message: `+${reward.toFixed(2)} MC за фарм!`
      });

    } catch (error) {
      logger.error('Farm error', { error: error.message, userId: req.body.userId });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/webapp/tasks', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, message: 'Missing userId' });
      }

      const user = await db.collection('users').findOne({ userId: parseInt(userId) });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Генерируем доступные задания
      const tasks = [
        {
          id: 1,
          name: 'Ежедневный вход',
          description: 'Зайдите в бота сегодня',
          reward: 5,
          icon: '📅',
          type: 'daily'
        },
        {
          id: 2,
          name: 'Активный майнер',
          description: 'Сделайте 10 активных кликов',
          reward: 15,
          icon: '⚡',
          type: 'clicks',
          progress: Math.min((user.miningStats?.activeClicks || 0), 10),
          target: 10
        },
        {
          id: 3,
          name: 'Фармер',
          description: 'Выполните фарм 3 раза',
          reward: 25,
          icon: '🌾',
          type: 'farm',
          progress: Math.min((user.miningStats?.farmCount || 0), 3),
          target: 3
        }
      ];

      res.json({ 
        success: true, 
        tasks: tasks
      });

    } catch (error) {
      logger.error('Tasks error', { error: error.message, userId: req.body.userId });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/webapp/exchange', async (req, res) => {
    try {
      const { userId, fromCurrency, toCurrency, amount } = req.body;
      if (!userId || !fromCurrency || !toCurrency || !amount) {
        return res.status(400).json({ success: false, message: 'Missing required parameters' });
      }

      const user = await db.collection('users').findOne({ userId: parseInt(userId) });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Проверяем баланс
      const userBalance = fromCurrency === 'magnumCoins' ? user.magnumCoins : user.stars;
      if (userBalance < amount) {
        return res.json({ success: false, message: 'Недостаточно средств' });
      }

      // Рассчитываем курс обмена
      const baseRate = 0.001; // 1 MC = 0.001 Stars
      const exchangeRate = fromCurrency === 'magnumCoins' ? baseRate : 1 / baseRate;
      const convertedAmount = amount * exchangeRate;

      // Обновляем баланс
      const updateData = {};
      updateData[fromCurrency] = -amount;
      updateData[toCurrency] = convertedAmount;

      await db.collection('users').updateOne(
        { userId: parseInt(userId) },
        { 
          $inc: updateData,
          $set: { lastActivity: new Date() }
        }
      );

      // Очищаем кэш
      cache.delete(`user_data_${userId}`);

      res.json({ 
        success: true, 
        convertedAmount: convertedAmount.toFixed(4),
        message: `Обмен выполнен: ${amount} ${fromCurrency} → ${convertedAmount.toFixed(4)} ${toCurrency}`
      });

    } catch (error) {
      logger.error('Exchange error', { error: error.message, userId: req.body.userId });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });
}

// Инициализация бота
const bot = new Telegraf(config.BOT_TOKEN);
let db;
let miningInterval;

// Подключение к базе данных с retry логикой
async function connectToDatabase() {
  const maxRetries = 5;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      logger.info(`Попытка подключения к MongoDB (${retryCount + 1}/${maxRetries})`);
      
      const client = new MongoClient(config.MONGODB_URI, {
        maxPoolSize: config.DB_POOL_SIZE,
        serverSelectionTimeoutMS: config.DB_CONNECTION_TIMEOUT,
        socketTimeoutMS: 45000,
        bufferMaxEntries: 0,
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      
      await client.connect();
      db = client.db();
      
      // Тестируем подключение
      await db.admin().ping();
      
      logger.info('✅ Подключение к MongoDB установлено');
      return client;
      
    } catch (error) {
      retryCount++;
      logger.error(`Ошибка подключения к MongoDB (попытка ${retryCount}):`, { error: error.message });
      
      if (retryCount >= maxRetries) {
        throw new Error(`Не удалось подключиться к MongoDB после ${maxRetries} попыток`);
      }
      
      // Ждем перед повторной попыткой
      await new Promise(resolve => setTimeout(resolve, 5000 * retryCount));
    }
  }
}

// Создание индексов для оптимизации
async function createIndexes() {
  try {
    logger.info('Создание индексов для оптимизации...');
    
    const users = db.collection('users');
    const stats = db.collection('miningStats');
    
    // Индексы для пользователей
    await users.createIndex({ userId: 1 }, { unique: true });
    await users.createIndex({ username: 1 });
    
    // Индексы для статистики
    await stats.createIndex({ userId: 1 }, { unique: true });
    await stats.createIndex({ 'magnumCoins': 1 });
    await stats.createIndex({ 'stars': 1 });
    
    logger.info('✅ Индексы созданы успешно');
  } catch (error) {
    logger.error('Ошибка создания индексов:', { error: error.message });
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info(`Получен сигнал ${signal}, начинаем graceful shutdown...`);
  
  try {
    // Останавливаем бота
    await bot.stop(signal);
    
    // Останавливаем майнинг
    if (miningInterval) {
      clearInterval(miningInterval);
    }
    
    // Закрываем подключение к БД
    if (db) {
      await db.client.close();
    }
    
    // Очищаем кэш
    cache.clear();
    
    logger.info('Graceful shutdown завершен');
    process.exit(0);
  } catch (error) {
    logger.error('Ошибка при graceful shutdown:', { error: error.message });
    process.exit(1);
  }
}

// Обработка ошибок
process.on('uncaughtException', (error) => {
  logger.error('Необработанная ошибка:', { error: error.message, stack: error.stack });
  metricsService.trackError(error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Необработанное отклонение промиса:', { reason: reason.toString() });
  metricsService.trackError(new Error(reason));
});

// Сигналы завершения
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Функции бота (оставляем существующие, но добавляем логирование и метрики)
async function handleStart(ctx) {
  try {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    
    logger.info('Новый пользователь', { userId, username });
    
    // Проверяем существование пользователя
    let user = await db.collection('users').findOne({ userId });
    
    if (!user) {
      // Создаем нового пользователя
      user = {
        userId,
        username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        magnumCoins: 0,
        stars: 0,
        miners: {
          magnumCoinMiner: 1,
          starMiner: 1
        },
        miningStats: {
          lastMiningTime: null,
          totalMined: { magnumCoins: 0, stars: 0 }
        },
        createdAt: new Date(),
        lastActivity: new Date()
      };
      
      await db.collection('users').insertOne(user);
      logger.info('Создан новый пользователь', { userId, username });
    } else {
      // Обновляем активность существующего пользователя
      await db.collection('users').updateOne(
        { userId },
        { $set: { lastActivity: new Date() } }
      );
    }
    
    const welcomeMessage = `🎉 Добро пожаловать в Magnum Stars Bot!

💰 Ваш баланс:
• Magnum Coins: ${user.magnumCoins}
• Stars: ${user.stars}

⛏️ Ваши майнеры:
• Magnum Coin майнер: ${user.miners.magnumCoinMiner}
• Star майнер: ${user.miners.starMiner}

Выберите действие:`;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⛏️ Майнинг', 'mining_menu')],
      [Markup.button.callback('📋 Задания', 'tasks_menu')],
      [Markup.button.callback('💰 Баланс', 'balance')],
      [Markup.button.webApp('Заработать', `${config.WEBAPP_URL || 'https://your-domain.com'}/webapp`)],
      [Markup.button.callback('❓ Помощь', 'help')]
    ]);
    
    await ctx.reply(welcomeMessage, keyboard);
    
  } catch (error) {
    logger.error('Ошибка в handleStart:', { error: error.message, userId: ctx.from?.id });
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Остальные функции бота остаются без изменений, но добавляем логирование
// ... (здесь будут все остальные функции из оригинального файла)

// Запуск бота
async function startBot() {
  try {
    logger.info('🚀 Запуск Magnum Stars Bot...');
    
    // Подключаемся к базе данных
    const client = await connectToDatabase();
    
    // Создаем индексы
    await createIndexes();
    
    // Настраиваем обработчики бота
    bot.start(handleStart);
    
    // Добавляем остальные обработчики...
    // (здесь будут все остальные обработчики из оригинального файла)
    
    // Запускаем бота
    await bot.launch();
    
    // Запускаем Express сервер
    app.listen(config.PORT, () => {
      logger.info(`✅ Express сервер запущен на порту ${config.PORT}`);
    });
    
    logger.info('✅ Magnum Stars Bot успешно запущен!');
    
    // Мониторинг памяти
    setInterval(() => {
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
        logger.warn('Высокое потребление памяти:', memUsage);
      }
    }, 60000);
    
    // Логирование метрик
    setInterval(() => {
      const summary = metricsService.getSummary();
      logger.info('Метрики системы:', summary);
    }, 300000); // каждые 5 минут
    
  } catch (error) {
    logger.error('Критическая ошибка при запуске бота:', { error: error.message });
    process.exit(1);
  }
}

// Запускаем бота
startBot();

