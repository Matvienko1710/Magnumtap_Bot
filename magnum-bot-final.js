require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');
const express = require('express');
const path = require('path');
const fs = require('fs');

// RichAds интеграция
const { 
  getRichAdsOffers, 
  verifyRichAdsOffer, 
  sendRichAdsConversion, 
  getRichAdsUserStats,
  isRichAdsAvailable 
} = require('./richads-integration');

// Функция генерации 12-символьного ключа
function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Создаем Express приложение для WebApp
const app = express();
const PORT = process.env.PORT || 3000; // Railway использует свой порт

// Middleware для логирования запросов
app.use((req, res, next) => {
    console.log(`🌐 [${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Middleware для обработки JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Раздача WebApp отключена по запросу (исторический код удалён для чистоты)



// Тестовый маршрут для проверки работы сервера
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Magnum Stars Bot with MC & Stars currencies is running',
        timestamp: new Date().toISOString(),
        webappUrl: '/webapp',
        apiUrl: '/api/webapp/check-access'
    });
});

// Эндпоинт для UptimeRobot - проверка работоспособности
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        message: 'Magnum Stars Bot is alive and running with dual currency system',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Эндпоинт для UptimeRobot - простая проверка
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Тестовый маршрут для проверки статических файлов
app.get('/test', (req, res) => {
    // [Оптимизация] Удалён дублирующий импорт fs — используем верхнеуровневый 'fs'
    const webappEnabled = process.env.WEBAPP_ENABLED === 'true'; // [Изменение] Управляем логами WebApp через переменную окружения
    const webappPath = path.join(__dirname, 'webapp');
    const indexPath = path.join(webappPath, 'index.html');
    const stylesPath = path.join(webappPath, 'styles.css');
    const scriptPath = path.join(webappPath, 'app.js');
    
    if (webappEnabled) {
        console.log('📁 Проверка файлов WebApp...');
        console.log(`📁 Путь к WebApp: ${webappPath}`);
        console.log(`📄 index.html: ${fs.existsSync(indexPath) ? '✅ найден' : '❌ не найден'}`);
        console.log(`🎨 styles.css: ${fs.existsSync(stylesPath) ? '✅ найден' : '❌ не найден'}`);
        console.log(`⚡ app.js: ${fs.existsSync(scriptPath) ? '✅ найден' : '❌ не найден'}`);
    }
    
    res.json({
        status: 'test',
        webappPath: webappPath,
        files: {
            index: fs.existsSync(indexPath) ? 'found' : 'not found',
            styles: fs.existsSync(stylesPath) ? 'found' : 'not found',
            app: fs.existsSync(scriptPath) ? 'found' : 'not found'
        },
        timestamp: new Date().toISOString()
    });
});



// WebApp маршруты (если включены)
if (process.env.WEBAPP_ENABLED === 'true') {
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

      const user = await db.collection('users').findOne({ id: parseInt(userId) });
      const hasAccess = user && config.ADMIN_IDS.includes(parseInt(userId));
      
      res.json({ hasAccess, user: hasAccess ? user : null });
    } catch (error) {
      console.error('WebApp access check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/webapp/user-data', async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      const user = await db.collection('users').findOne({ id: parseInt(userId) });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('User data error:', error);
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

      const user = await db.collection('users').findOne({ id: parseInt(userId) });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Рассчитываем награду за активный клик
      const baseReward = 0.1;
      const levelMultiplier = 1 + (user.level - 1) * 0.1;
      const reward = baseReward * levelMultiplier;

      // Обновляем баланс пользователя
      await db.collection('users').updateOne(
        { id: parseInt(userId) },
        { 
          $inc: { 
            magnuStarsoins: reward,
            'miningStats.activeClicks': 1,
            'miningStats.activeRewards': reward
          },
          $set: { lastActivity: new Date() }
        }
      );

      res.json({ 
        success: true, 
        reward: reward.toFixed(2),
        message: `+${reward.toFixed(2)} Magnum Coins за активный клик!`
      });

    } catch (error) {
      console.error('Mining click error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/webapp/farm', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, message: 'Missing userId' });
      }

      const user = await db.collection('users').findOne({ id: parseInt(userId) });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Рассчитываем награду за фарм
      const baseReward = 10;
      const levelBonus = Math.min(user.level * 0.1, 2);
      const reward = baseReward + levelBonus;

      // Обновляем баланс пользователя
      await db.collection('users').updateOne(
        { id: parseInt(userId) },
        { 
          $inc: { 
            magnuStarsoins: reward,
            'miningStats.totalMinedStars': reward
          },
          $set: { lastActivity: new Date() }
        }
      );

      res.json({ 
        success: true, 
        reward: reward.toFixed(2),
        message: `+${reward.toFixed(2)} Magnum Coins за фарм!`
      });

    } catch (error) {
      console.error('Farm error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.post('/api/webapp/tasks', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, message: 'Missing userId' });
      }

      const user = await db.collection('users').findOne({ id: parseInt(userId) });
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
          progress: Math.min((user.miningStats?.farStarsount || 0), 3),
          target: 3
        }
      ];

      res.json({ 
        success: true, 
        tasks: tasks
      });

    } catch (error) {
      console.error('Tasks error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // API для обмена валют (Magnum Coins ↔ Stars)
  app.post('/api/webapp/exchange', async (req, res) => {
    try {
      const { userId, from, amount } = req.body;
      if (!userId || !from || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'Bad request' });
      }

      // Используем webappUsers коллекцию для обмена
      const user = await db.collection('webappUsers').findOne({ userId: parseInt(userId) });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const rate = await calculateExchangeRate();
      const commission = (config.EXCHANGE_COMMISSION || 2.5) / 100;

      let inc = { magnuStarsoins: 0, stars: 0 };
      let reserveInc = { magnuStarsoins: 0, stars: 0 };

      let received = 0;
      if (from === 'Stars') {
        // Обмен Magnum Coins → Stars
        if (user.magnuStarsoins < amount) return res.status(400).json({ error: 'Недостаточно Magnum Coins' });
        const starsOut = amount * rate * (1 - commission);
        inc.magnuStarsoins -= amount;
        inc.stars += starsOut;
        reserveInc.magnuStarsoins += amount * commission;
        received = starsOut;
      } else if (from === 'stars') {
        // Обмен Stars → Magnum Coins
        if ((user.stars || 0) < amount) return res.status(400).json({ error: 'Недостаточно Stars' });
        const StarsOut = (amount / rate) * (1 - commission);
        inc.stars -= amount;
        inc.magnuStarsoins += StarsOut;
        reserveInc.stars += amount * commission;
        received = StarsOut;
      } else {
        return res.status(400).json({ error: 'Неверная валюта для обмена' });
      }

      await db.collection('webappUsers').updateOne(
        { userId: parseInt(userId) },
        { $inc: inc, $set: { updatedAt: new Date() } }
      );

      await db.collection('reserve').updateOne(
        { currency: 'main' },
        { $inc: reserveInc },
        { upsert: true }
      );

      await db.collection('exchangeHistory').insertOne({
        userId: parseInt(userId),
        direction: from,
        amount,
        rate,
        received,
        commission: commission * 100,
        timestamp: new Date()
      });

      const updated = await db.collection('webappUsers').findOne({ userId: parseInt(userId) });
      res.json({
        success: true,
        rate,
        magnuStarsoins: updated.magnuStarsoins,
        stars: updated.stars
      });
    } catch (error) {
      console.error('WebApp exchange error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });
}

// API маршрут будет добавлен после определения конфигурации

// Express сервер будет запущен после успешного запуска бота

// Импорт модулей удален - все функции перенесены в основной файл

// ==================== КОНФИГУРАЦИЯ ====================
console.log('🚀 Запуск Magnum Stars Bot...');
console.log('📋 Проверка переменных окружения...');

// Проверяем обязательные переменные окружения
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не найден');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI не найден');
  process.exit(1);
}

console.log('✅ Все обязательные переменные окружения найдены');

const config = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  MONGODB_URI: process.env.MONGODB_URI,
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [],
  SUPPORT_CHANNEL: process.env.SUPPORT_CHANNEL ? `@${process.env.SUPPORT_CHANNEL}` : null,
  WITHDRAWAL_CHANNEL: process.env.WITHDRAWAL_CHANNEL ? `@${process.env.WITHDRAWAL_CHANNEL}` : null,
  REQUIRED_CHANNEL: process.env.REQUIRED_CHANNEL ? `@${process.env.REQUIRED_CHANNEL}` : null,
  // RichAds конфигурация (заменяет спонсорские задания)
  RICHADS_API_KEY: process.env.RICHADS_API_KEY,
  RICHADS_ENABLED: process.env.RICHADS_ENABLED === 'true',
  
  // WebApp конфигурация
  WEBAPP_URL: process.env.WEBAPP_URL,
  
  // Обратная совместимость со старыми спонсорскими заданиями
  SPONSOR_TASK_CHANNEL: process.env.SPONSOR_TASK_CHANNEL || '@musice46',
  SPONSOR_TASK_BOT: process.env.SPONSOR_TASK_BOT || 'https://t.me/farmikstars_bot?start=6587897295',
  REQUIRED_BOT_LINK: process.env.REQUIRED_BOT_LINK || 'https://t.me/ReferalStarsRobot?start=6587897295',
  FIRESTARS_BOT_LINK: process.env.FIRESTARS_BOT_LINK || 'https://t.me/firestars_rbot?start=6587897295',
  FARMIK_BOT_LINK: process.env.FARMIK_BOT_LINK || 'https://t.me/farmikstars_bot?start=6587897295',
  BASKET_BOT_LINK: process.env.BASKET_BOT_LINK || 'https://t.me/basket_gift_bot?start=6587897295',
  PRIVATE_CHANNEL_LINK: process.env.PRIVATE_CHANNEL_LINK || 'https://t.me/+4BUF9S_rLZw3NDQ6',
  PROMO_NOTIFICATIONS_CHAT: process.env.PROMO_NOTIFICATIONS_CHAT || '@magnumtapchat',
  BOT_PHOTO_URL: process.env.BOT_PHOTO_URL,
  
  // Игровые настройки
  INITIAL_STARS: 0,
  INITIAL_MAGNUM_COINS: 1000,

  DAILY_BONUS_BASE: 3,
  REFERRAL_BONUS: 50,
  REFERRAL_REWARD: 5, // Награда за каждого реферала
  MINER_REWARD_PER_MINUTE: 0.01, // Базовая награда за минуту (старая система)
  MINER_REWARD_PER_HOUR: 0.1, // Оставляем для обратной совместимости
  
  // Новая система майнинга
  MINING_SEASON_DURATION: 30, // Длительность сезона в днях
  MINING_REWARD_INTERVAL: 1, // Интервал начисления наград в минутах
  MINING_ACTIVE_CLICK_BONUS: 0.5, // Бонус за активный клик (дополнительно к пассивному)
  
  // Майнеры в магазине
  MINERS: {
    basic: {
      id: 'basic',
      name: 'Базовый майнер',
      rarity: 'common',
      baseSpeed: 0.01, // ~7 дней окупаемости
      price: 100,
      currency: 'magnuStarsoins',
      description: 'Простой майнер для начинающих (окупаемость ~7 дней)'
    },
    advanced: {
      id: 'advanced',
      name: 'Продвинутый майнер',
      rarity: 'rare',
      baseSpeed: 0.025, // ~14 дней окупаемости
      price: 500,
      currency: 'magnuStarsoins',
      description: 'Более мощный майнер (окупаемость ~14 дней)'
    },
    premium: {
      id: 'premium',
      name: 'Премиум майнер',
      rarity: 'epic',
      baseSpeed: 0.0017, // ~21 день окупаемости
      price: 50,
      currency: 'stars',
      miningCurrency: 'stars', // Добывает Stars (вторая валюта)
      description: 'Мощный майнер за Stars, добывает Stars (окупаемость ~21 день)'
    },
    legendary: {
      id: 'legendary',
      name: 'Легендарный майнер',
      rarity: 'legendary',
      baseSpeed: 0.0045, // ~31 день окупаемости
      price: 200,
      currency: 'stars',
      miningCurrency: 'stars', // Добывает Stars (вторая валюта)
      description: 'Самый мощный майнер, добывает Stars (окупаемость ~31 день)'
    }
  },
  
  // Награды за сезоны (только топ-10)
  SEASON_REWARDS: {
    top1: { magnuStarsoins: 10000, stars: 100, title: '🏆 Чемпион сезона' },
    top3: { magnuStarsoins: 5000, stars: 50, title: '🥇 Топ-3 сезона' },
    top10: { magnuStarsoins: 2000, stars: 20, title: '🥈 Топ-10 сезона' }
  },
  
  EXCHANGE_COMMISSION: 2.5,
  WITHDRAWAL_COMMISSION: 5.0,
  MIN_WITHDRAWAL: 50,
  MAX_WITHDRAWAL: 10000,
  
  // Система сезонов майнинга
  MINING_SEASON_DURATION: 7, // дней
  MINING_SEASON_START_DATE: new Date('2025-11-22'), // Дата начала первого сезона
  MINING_TOTAL_MAGNUM_COINS: 1000000, // Общее количество Stars для всех пользователей
  MINING_TOTAL_STARS: 100, // Общее количество Stars для всех пользователей
  MINING_SEASON_MULTIPLIER: 1.2, // Множитель увеличения наград каждый сезон
  
  // Кеширование
  USER_CACHE_TTL: 30000,
  STATS_CACHE_TTL: 120000,
  
  // Rate limiting
  RATE_LIMIT_WINDOW: 60000,
  RATE_LIMIT_MAX_REQUESTS: 30,
  
  // Резерв биржи
  INITIAL_RESERVE_STARS: 1000000, // Минимальный резерв Stars
  INITIAL_RESERVE_MAGNUM_COINS: 1000, // Минимальный резерв Magnum Coins
  
  // Курс обмена (базовый)
  BASE_EXCHANGE_RATE: 0.0000001, // 1 Magnum Coin = 0.0000001 Star
  EXCHANGE_RATE_MULTIPLIER: 1.0 // Множитель курса в зависимости от резерва
};

// Вспомогательная проверка прав администратора
function isAdmin(userId) {
  try {
    const id = parseInt(userId);
    return Array.isArray(config.ADMIN_IDS) && config.ADMIN_IDS.includes(id);
  } catch (_) {
    return false;
  }
}

// API маршрут для проверки доступа к WebApp
app.get('/api/webapp/check-access', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) {
            return res.json({ access: false, reason: 'No user ID provided' });
        }

        // Проверяем, является ли пользователь админом
        const isAdmin = config.ADMIN_IDS.includes(parseInt(userId));
        const webappEnabled = process.env.WEBAPP_ENABLED === 'true';
        const adminOnly = process.env.WEBAPP_ADMIN_ONLY === 'true';

        if (!webappEnabled) {
            return res.json({ access: false, reason: 'WebApp disabled' });
        }

        if (adminOnly && !isAdmin) {
            return res.json({ access: false, reason: 'Admin only' });
        }

        res.json({ access: true, isAdmin });
    } catch (error) {
        console.error('WebApp access check error:', error);
        res.status(500).json({ access: false, reason: 'Server error' });
    }
});

// API маршрут для получения данных пользователя
app.get('/api/webapp/user-data', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        console.log(`📥 WebApp загрузка данных для пользователя ${userId}`);

        let webappUser = await db.collection('webappUsers').findOne({ userId: parseInt(userId) });
        
        if (!webappUser) {
            webappUser = {
                userId: parseInt(userId),
                magnuStarsoins: 1000,
                stars: 0,
                level: 1,
                experience: 0,
                clickCount: 0,
                cps: 1,
                minerActive: false,
                referralsCount: 0,
                referralEarnings: 0,
                achievementsCompleted: 0,
                upgrades: {
                    autoClicker: { level: 0, cost: 10, baseCost: 10, multiplier: 1.5 },
                    clickPower: { level: 0, cost: 25, baseCost: 25, multiplier: 2 },
                    starGenerator: { level: 0, cost: 50, baseCost: 50, multiplier: 2.5 }
                },
                minerUpgrades: {
                    efficiency: { level: 0, cost: 100, baseCost: 100, multiplier: 2 },
                    capacity: { level: 0, cost: 200, baseCost: 200, multiplier: 2.5 }
                },
                tasks: {
                    daily: [
                        { id: 'click_100', name: 'Кликер', description: 'Сделайте 100 кликов', target: 100, progress: 0, reward: 50, completed: false },
                        { id: 'earn_1000', name: 'Заработок', description: 'Заработайте 1000 Stars', target: 1000, progress: 0, reward: 100, completed: false },
                        { id: 'farm_5', name: 'Фармер', description: 'Используйте фарм 5 раз', target: 5, progress: 0, reward: 75, completed: false }
                    ],
                    achievements: [
                        { id: 'first_click', name: 'Первый клик', description: 'Сделайте первый клик', target: 1, progress: 0, reward: 25, completed: false },
                        { id: 'rich_player', name: 'Богач', description: 'Накопите 10000 Stars', target: 10000, progress: 0, reward: 500, completed: false },
                        { id: 'click_master', name: 'Мастер кликов', description: 'Сделайте 1000 кликов', target: 1000, progress: 0, reward: 200, completed: false }
                    ]
                },
                settings: {
                    notifications: true,
                    sound: true,
                    autoSave: true
                },
                lastFarmAt: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            await db.collection('webappUsers').insertOne(webappUser);
            console.log(`🆕 Создан новый WebApp пользователь: ${userId}`);
        }

        if (webappUser.minerActive) {
            const now = Date.now();
            const lastUpdate = new Date(webappUser.updatedAt || webappUser.createdAt).getTime();
            const minutesPassed = Math.floor((now - lastUpdate) / 60000);
            if (minutesPassed > 0) {
                const baseIncome = 1;
                const efficiencyBonus = (webappUser.minerUpgrades?.efficiency?.level || 0) * 0.5;
                const capacityBonus = (webappUser.minerUpgrades?.capacity?.level || 0) * 0.3;
                const perMinute = baseIncome + efficiencyBonus + capacityBonus;
                const passiveEarn = perMinute * minutesPassed;
                await db.collection('webappUsers').updateOne(
                    { userId: parseInt(userId) },
                    { $inc: { magnuStarsoins: passiveEarn }, $set: { updatedAt: new Date() } }
                );
                webappUser.magnuStarsoins += passiveEarn;
            }
        }

        const farStarsooldownMs = (parseInt(process.env.WEBAPP_FARM_COOLDOWN_SEC || '5') || 5) * 1000;

        res.json({
            success: true,
            data: {
                magnuStarsoins: webappUser.magnuStarsoins || 0,
                stars: webappUser.stars || 0,
                level: webappUser.level || 1,
                experience: webappUser.experience || 0,
                clickCount: webappUser.clickCount || 0,
                cps: webappUser.cps || 1,
                minerActive: !!webappUser.minerActive,
                referralsCount: webappUser.referralsCount || 0,
                referralEarnings: webappUser.referralEarnings || 0,
                achievementsCompleted: webappUser.achievementsCompleted || 0,
                upgrades: webappUser.upgrades || {
                    autoClicker: { level: 0, cost: 10, baseCost: 10, multiplier: 1.5 },
                    clickPower: { level: 0, cost: 25, baseCost: 25, multiplier: 2 },
                    starGenerator: { level: 0, cost: 50, baseCost: 50, multiplier: 2.5 }
                },
                minerUpgrades: webappUser.minerUpgrades || {
                    efficiency: { level: 0, cost: 100, baseCost: 100, multiplier: 2 },
                    capacity: { level: 0, cost: 200, baseCost: 200, multiplier: 2.5 }
                },
                tasks: webappUser.tasks || {
                    daily: [
                        { id: 'click_100', name: 'Кликер', description: 'Сделайте 100 кликов', target: 100, progress: 0, reward: 50, completed: false },
                        { id: 'earn_1000', name: 'Заработок', description: 'Заработайте 1000 Stars', target: 1000, progress: 0, reward: 100, completed: false },
                        { id: 'farm_5', name: 'Фармер', description: 'Используйте фарм 5 раз', target: 5, progress: 0, reward: 75, completed: false }
                    ],
                    achievements: [
                        { id: 'first_click', name: 'Первый клик', description: 'Сделайте первый клик', target: 1, progress: 0, reward: 25, completed: false },
                        { id: 'rich_player', name: 'Богач', description: 'Накопите 10000 Stars', target: 10000, progress: 0, reward: 500, completed: false },
                        { id: 'click_master', name: 'Мастер кликов', description: 'Сделайте 1000 кликов', target: 1000, progress: 0, reward: 200, completed: false }
                    ]
                },
                settings: webappUser.settings || {
                    notifications: true,
                    sound: true,
                    autoSave: true
                },
                lastFarmAt: webappUser.lastFarmAt || null,
                farStarsooldownMs
            }
        });
    } catch (error) {
        console.error('WebApp user data error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API маршрут для обновления данных пользователя
app.post('/api/webapp/update-data', async (req, res) => {
    try {
        const { userId, magnuStarsoins, stars, level, experience, clickCount, upgrades, minerUpgrades, tasks, settings, cps, minerActive, lastFarmAt } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        // Белый список полей и валидация
        const updateData = { updatedAt: new Date() };
        if (typeof magnuStarsoins === 'number' && isFinite(magnuStarsoins) && magnuStarsoins >= 0) updateData.magnuStarsoins = magnuStarsoins;
        if (typeof stars === 'number' && isFinite(stars) && stars >= 0) updateData.stars = stars;
        if (typeof level === 'number' && isFinite(level) && level >= 1) updateData.level = Math.floor(level);
        if (typeof experience === 'number' && isFinite(experience) && experience >= 0) updateData.experience = Math.floor(experience);
        if (typeof clickCount === 'number' && isFinite(clickCount) && clickCount >= 0) updateData.clickCount = Math.floor(clickCount);
        if (typeof cps === 'number' && isFinite(cps) && cps >= 0) updateData.cps = cps;
        if (typeof minerActive === 'boolean') updateData.minerActive = minerActive;
        if (lastFarmAt) updateData.lastFarmAt = new Date(lastFarmAt);

        if (upgrades && typeof upgrades === 'object') updateData.upgrades = upgrades;
        if (minerUpgrades && typeof minerUpgrades === 'object') updateData.minerUpgrades = minerUpgrades;
        if (tasks && typeof tasks === 'object') updateData.tasks = tasks;
        if (settings && typeof settings === 'object') updateData.settings = settings;

        const result = await db.collection('webappUsers').updateOne(
            { userId: parseInt(userId) },
            { $set: updateData },
            { upsert: true }
        );

        console.log(`✅ WebApp данные обновлены для пользователя ${userId}, результат:`, result);

        res.json({ success: true, message: 'Data updated successfully' });
    } catch (error) {
        console.error('WebApp update data error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API маршрут фарма с кулдауном
app.post('/api/webapp/farm', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        const farStarsooldownMs = (parseInt(process.env.WEBAPP_FARM_COOLDOWN_SEC || '5') || 5) * 1000;
        const now = Date.now();

        let webappUser = await db.collection('webappUsers').findOne({ userId: parseInt(userId) });
        if (!webappUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const lastFarmAt = webappUser.lastFarmAt ? new Date(webappUser.lastFarmAt).getTime() : 0;
        const elapsed = now - lastFarmAt;
        const remainingMs = farStarsooldownMs - elapsed;
        if (remainingMs > 0) {
            return res.status(429).json({
                error: 'Cooldown',
                remainingMs,
                nextAvailableAt: now + remainingMs,
                farStarsooldownMs
            });
        }

        const reward = Math.max(1, webappUser.cps || 1);
        const updates = {
            $inc: { magnuStarsoins: reward, clickCount: 1, experience: 1 },
            $set: { lastFarmAt: new Date(now), updatedAt: new Date(now) }
        };
        await db.collection('webappUsers').updateOne({ userId: parseInt(userId) }, updates);

        const newBalance = (webappUser.magnuStarsoins || 0) + reward;

        return res.json({
            success: true,
            reward,
            magnuStarsoins: newBalance,
            nextAvailableAt: now + farStarsooldownMs,
            farStarsooldownMs
        });
    } catch (error) {
        console.error('WebApp farm error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API маршрут переключения майнера
app.post('/api/webapp/miner/toggle', async (req, res) => {
    try {
        const { userId, active } = req.body;
        if (!userId || typeof active !== 'boolean') {
            return res.status(400).json({ error: 'Bad request' });
        }
        await db.collection('webappUsers').updateOne(
            { userId: parseInt(userId) },
            { $set: { minerActive: active, updatedAt: new Date() } }
        );
        res.json({ success: true });
    } catch (error) {
        console.error('WebApp miner toggle error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API для обмена валют (Magnum Coins ↔ Stars)
app.post('/api/webapp/exchange', async (req, res) => {
    try {
        const { userId, from, amount } = req.body;
        if (!userId || !from || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'Bad request' });
        }
        const user = await db.collection('webappUsers').findOne({ userId: parseInt(userId) });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const rate = await calculateExchangeRate();
        const commission = (config.EXCHANGE_COMMISSION || 2.5) / 100;

        let inc = { magnuStarsoins: 0, stars: 0 };
        let reserveInc = { magnuStarsoins: 0, stars: 0 };

        let received = 0;
        if (from === 'Stars') {
            if (user.magnuStarsoins < amount) return res.status(400).json({ error: 'Недостаточно Magnum Coins' });
            const starsOut = amount * rate * (1 - commission);
            inc.magnuStarsoins -= amount;
            inc.stars += starsOut;
            reserveInc.magnuStarsoins += amount * commission;
            received = starsOut;
        } else if (from === 'stars') {
            if ((user.stars || 0) < amount) return res.status(400).json({ error: 'Недостаточно Stars' });
            const StarsOut = (amount / rate) * (1 - commission);
            inc.stars -= amount;
            inc.magnuStarsoins += StarsOut;
            reserveInc.stars += amount * commission;
            received = StarsOut;
        } else {
            return res.status(400).json({ error: 'Unknown from' });
        }

        await db.collection('webappUsers').updateOne(
            { userId: parseInt(userId) },
            { $inc: inc, $set: { updatedAt: new Date() } }
        );

        await db.collection('reserve').updateOne(
            { currency: 'main' },
            { $inc: reserveInc },
            { upsert: true }
        );

        await db.collection('exchangeHistory').insertOne({
            userId: parseInt(userId), direction: from, amount, rate, received, commission: commission * 100, timestamp: new Date()
        });

        const updated = await db.collection('webappUsers').findOne({ userId: parseInt(userId) });
        res.json({ success: true, rate, magnuStarsoins: updated.magnuStarsoins, stars: updated.stars });
    } catch (error) {
        console.error('WebApp exchange error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API ежедневного бонуса
app.post('/api/webapp/bonus', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'Bad request' });
        const user = await db.collection('webappUsers').findOne({ userId: parseInt(userId) });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const base = config.DAILY_BONUS_BASE || 10;
        const now = Date.now();
        const last = user.lastBonusAt ? new Date(user.lastBonusAt).getTime() : 0;
        const oneDay = 24 * 60 * 60 * 1000;
        if (now - last < oneDay) {
            return res.status(429).json({ error: 'Already claimed' });
        }
        const streak = (user.bonusStreak || 0) + (now - last < 2 * oneDay && last > 0 ? 1 : 1);
        const reward = base * (1 + Math.min(streak, 40) * 0.1);
        await db.collection('webappUsers').updateOne(
            { userId: parseInt(userId) },
            { $inc: { magnuStarsoins: Math.floor(reward) }, $set: { lastBonusAt: new Date(now), bonusStreak: streak, updatedAt: new Date(now) } }
        );
        const updated = await db.collection('webappUsers').findOne({ userId: parseInt(userId) });
        res.json({ success: true, reward: Math.floor(reward), magnuStarsoins: updated.magnuStarsoins, bonusStreak: streak });
    } catch (error) {
        console.error('WebApp bonus error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API активации промокода
app.post('/api/webapp/promocode', async (req, res) => {
    try {
        const { userId, code } = req.body;
        if (!userId || !code) return res.status(400).json({ error: 'Bad request' });
        const promo = await db.collection('promocodes').findOne({ code: String(code).trim().toUpperCase(), isActive: true });
        if (!promo) return res.status(404).json({ error: 'Invalid code' });
        if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) return res.status(400).json({ error: 'Expired' });
        if (promo.maxActivations && (promo.activations || 0) >= promo.maxActivations) return res.status(400).json({ error: 'Limit reached' });

        await db.collection('webappUsers').updateOne(
            { userId: parseInt(userId) },
            { $inc: { magnuStarsoins: promo.reward || 0 }, $set: { updatedAt: new Date() } }
        );
        await db.collection('promocodes').updateOne(
            { _id: promo._id },
            { $inc: { activations: 1 } }
        );
        const updated = await db.collection('webappUsers').findOne({ userId: parseInt(userId) });
        res.json({ success: true, reward: promo.reward || 0, magnuStarsoins: updated.magnuStarsoins });
    } catch (error) {
        console.error('WebApp promocode error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API текущего курса обмена
app.get('/api/webapp/exchange-rate', async (req, res) => {
    try {
        const rate = await calculateExchangeRate();
        res.json({ success: true, rate });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// История обменов пользователя
app.get('/api/webapp/exchange-history', async (req, res) => {
    try {
        const userId = parseInt(String(req.query.user_id||'0'));
        if (!userId) return res.status(400).json({ success:false });
        const items = await db.collection('exchangeHistory').find({ userId }).sort({ timestamp:-1 }).limit(50).toArray();
        res.json({ success:true, items });
    } catch (error) {
        res.status(500).json({ success:false });
    }
});

// API информации о боте
app.get('/api/bot-info', async (req, res) => {
    try {
        const username = process.env.BOT_PUBLIC_USERNAME || (bot?.botInfo?.username) || null;
        res.json({ success: true, username });
    } catch (error) {
        res.json({ success: true, username: null });
    }
});

// Эндпоинт для детальной проверки состояния бота
app.get('/api/status', async (req, res) => {
    try {
        const botStatus = bot ? 'running' : 'not_initialized';
        const dbStatus = db ? 'connected' : 'disconnected';
        
        res.json({
            status: 'ok',
            bot: {
                status: botStatus,
                username: process.env.BOT_PUBLIC_USERNAME || (bot?.botInfo?.username) || null
            },
            database: {
                status: dbStatus,
                name: db ? db.databaseName : null
            },
            server: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            },
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ==================== КОНФИГУРАЦИЯ ====================

// Глобальные переменные для хранения курса за 24 часа
let exchangeRate24h = null;
let lastRateUpdate = null;

// Функция для расчета динамического курса обмена
async function calculateExchangeRate() {
  try {
    const reserve = await db.collection('reserve').findOne({ currency: 'main' });
    if (!reserve) {
      return config.BASE_EXCHANGE_RATE;
    }
    
    const magnuStarsoinsReserve = reserve.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS;
    const starsReserve = reserve.stars || config.INITIAL_RESERVE_STARS;
    
    // Расчет множителя на основе соотношения резервов
    const ratio = magnuStarsoinsReserve / starsReserve;
    
    // Используем логарифмическую шкалу для более чувствительного курса
    let multiplier;
    if (ratio <= 1) {
      // Если Magnum Coins меньше или равно Stars, используем линейную шкалу
      multiplier = Math.max(0.001, ratio);
    } else {
      // Если Magnum Coins больше Stars, используем логарифмическую шкалу без ограничений
      const logRatio = Math.log(ratio) / Math.log(10); // log10
      multiplier = Math.max(0.001, 1 + logRatio * 2);
    }
    
    const dynamicRate = config.BASE_EXCHANGE_RATE * multiplier;
    
    // Обновляем курс за 24 часа только раз в день
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    if (!lastRateUpdate || lastRateUpdate < oneDayAgo) {
      exchangeRate24h = dynamicRate;
      lastRateUpdate = now;
      console.log(`📅 Обновлен курс за 24 часа: ${dynamicRate.toFixed(6)}`);
      try {
        // [Сохранение] Персистим 24ч курс и время обновления в MongoDB
        await db.collection('config').updateOne(
          { key: 'EXCHANGE_RATE_24H' },
          { $set: { value: exchangeRate24h, updatedAt: now } },
          { upsert: true }
        );
        await db.collection('config').updateOne(
          { key: 'LAST_RATE_UPDATE' },
          { $set: { value: lastRateUpdate.toISOString(), updatedAt: now } },
          { upsert: true }
        );
      } catch (e) {
        console.log('⚠️ Не удалось сохранить состояние курса в базу:', e.message);
      }
    }
    
    console.log(`💱 Расчет курса обмена:`, {
      magnuStarsoinsReserve: formatNumber(magnuStarsoinsReserve),
      starsReserve: formatNumber(starsReserve),
      ratio: ratio.toFixed(4),
      logRatio: ratio > 1 ? (Math.log(ratio) / Math.log(10)).toFixed(4) : 'N/A',
      multiplier: multiplier.toFixed(4),
      baseRate: config.BASE_EXCHANGE_RATE,
      dynamicRate: dynamicRate.toFixed(6),
      rate24h: exchangeRate24h ? exchangeRate24h.toFixed(6) : 'N/A'
    });
    
    return dynamicRate;
  } catch (error) {
    console.error('❌ Ошибка расчета курса обмена:', error);
    return config.BASE_EXCHANGE_RATE;
  }
}
// ==================== БАЗА ДАННЫХ ====================
let db;
let client;

async function connectDB() {
  try {
    console.log('🔌 Подключение к MongoDB...');
    
    console.log('Параметры подключения к MongoDB:', {
      uri: config.MONGODB_URI ? 'установлен' : 'отсутствует',
      uriLength: config.MONGODB_URI?.length || 0
    });
    
    client = new MongoClient(config.MONGODB_URI);
    await client.connect();
    console.log('🔌 MongoDB клиент подключен');
    
    db = client.db();
    console.log('📊 База данных получена');
    
    console.log('Информация о базе данных:', {
      databaseName: db.databaseName,
      collections: await db.listCollections().toArray().then(cols => cols.map(c => c.name))
    });
    
    console.log('📋 Создание индексов для оптимизации...');
    
    // Создаем индексы для оптимизации
    console.log('📋 Создание индексов для коллекции users...');
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('users').createIndex({ username: 1 });
    await db.collection('users').createIndex({ 'miner.active': 1 });
    await db.collection('users').createIndex({ lastSeen: -1 });
    await db.collection('users').createIndex({ referrerId: 1 });
    console.log('✅ Индексы для users созданы');
    
    console.log('📋 Создание индексов для коллекции promocodes...');
    await db.collection('promocodes').createIndex({ code: 1 }, { unique: true });
    await db.collection('promocodes').createIndex({ isActive: 1 });
    await db.collection('promocodes').createIndex({ expiresAt: 1 });
    console.log('✅ Индексы для promocodes созданы');
    
    console.log('📋 Создание индексов для коллекции withdrawalRequests...');
    await db.collection('withdrawalRequests').createIndex({ userId: 1 });
    await db.collection('withdrawalRequests').createIndex({ status: 1 });
    await db.collection('withdrawalRequests').createIndex({ createdAt: -1 });
    console.log('✅ Индексы для withdrawalRequests созданы');
    
    console.log('📋 Создание индексов для коллекции supportTickets...');
    await db.collection('supportTickets').createIndex({ userId: 1 });
    await db.collection('supportTickets').createIndex({ status: 1 });
    await db.collection('supportTickets').createIndex({ createdAt: -1 });
    await db.collection('supportTickets').createIndex({ id: 1 }, { unique: true });
    await db.collection('supportTickets').createIndex({ adminId: 1 });
    await db.collection('supportTickets').createIndex({ updatedAt: -1 });
    console.log('✅ Индексы для supportTickets созданы');
    
    console.log('📋 Создание индексов для коллекции taskChecks...');
    await db.collection('taskChecks').createIndex({ userId: 1 });
    await db.collection('taskChecks').createIndex({ status: 1 });
    await db.collection('taskChecks').createIndex({ createdAt: -1 });
    console.log('✅ Индексы для taskChecks созданы');
    
    console.log('📋 Создание индексов для коллекции dailyTasks...');
    await db.collection('dailyTasks').createIndex({ userId: 1 });
    await db.collection('dailyTasks').createIndex({ date: 1 });
    await db.collection('dailyTasks').createIndex({ completed: 1 });
    console.log('✅ Индексы для dailyTasks созданы');
    
    console.log('📋 Создание индексов для коллекции exchangeHistory...');
    await db.collection('exchangeHistory').createIndex({ userId: 1 });
    await db.collection('exchangeHistory').createIndex({ timestamp: -1 });
    console.log('✅ Индексы для exchangeHistory созданы');
    
    // Создаем индекс для резерва с проверкой на существующие записи
    console.log('📋 Создание индекса для коллекции reserve...');
    try {
      await db.collection('reserve').createIndex({ currency: 1 }, { unique: true });
      console.log('✅ Индекс для reserve создан');
    } catch (error) {
      if (error.code === 11000) {
        // Если есть дублирующиеся записи, удаляем их и создаем индекс заново
        console.log('🔄 Исправляем дублирующиеся записи в резерве...');
        const deleteResult = await db.collection('reserve').deleteMany({ currency: null });
        console.log('Удаление дублирующихся записей:', { deletedCount: deleteResult.deletedCount });
        await db.collection('reserve').createIndex({ currency: 1 }, { unique: true });
        console.log('✅ Индекс для reserve пересоздан');
      } else {
        throw error;
      }
    }
    
    // Создаем индексы для коллекции webappUsers
    console.log('📋 Создание индексов для коллекции webappUsers...');
    await db.collection('webappUsers').createIndex({ userId: 1 }, { unique: true });
    await db.collection('webappUsers').createIndex({ updatedAt: -1 });
    console.log('✅ Индексы для webappUsers созданы');
    console.log('✅ Все индексы созданы успешно');
    console.log('✅ База данных подключена');
    console.log('💰 Инициализация резерва...');
    // Инициализируем резерв
    await initializeReserve();
    console.log('✅ Резерв инициализирован');
    
    console.log('Подключение к БД завершено:', {
      databaseName: db.databaseName,
      collectionsCount: (await db.listCollections().toArray()).length
    });
    
  } catch (error) {
    console.error('❌ Ошибка подключения к MongoDB:', error);
    console.log('Ошибка подключения к БД:', {
      error: error.message,
      stack: error.stack,
      mongoUri: config.MONGODB_URI ? 'установлен' : 'отсутствует'
    });
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
        magnuStarsoins: config.INITIAL_RESERVE_MAGNUM_COINS,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection('reserve').insertOne(reserve);
      console.log('💰 Резерв валют инициализирован');
          } else {
        console.log('💰 Резерв валют уже существует');
      }
  } catch (error) {
    console.error('❌ Ошибка инициализации резерва:', error);
  }
}
// Функция для полного сброса базы данных
async function resetDatabase() {
  try {
    console.log('🗑️ Начинаем сброс базы данных...');
    
    // Получаем список всех коллекций
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    console.log('📋 Найдены коллекции:', collectionNames);
    
    // Удаляем все коллекции кроме системных
    for (const collectionName of collectionNames) {
      if (!collectionName.startsWith('system.')) {
        console.log(`🗑️ Удаляем коллекцию: ${collectionName}`);
        await db.collection(collectionName).drop();
      }
    }
    
    console.log('✅ Все пользовательские коллекции удалены');
    
    // Пересоздаем индексы
    console.log('📋 Пересоздание индексов...');
    
    // Создаем индексы для коллекции users
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('users').createIndex({ username: 1 });
    await db.collection('users').createIndex({ 'miner.active': 1 });
    await db.collection('users').createIndex({ lastSeen: -1 });
    await db.collection('users').createIndex({ referrerId: 1 });
    
    // Создаем индексы для коллекции promocodes
    await db.collection('promocodes').createIndex({ code: 1 }, { unique: true });
    await db.collection('promocodes').createIndex({ isActive: 1 });
    await db.collection('promocodes').createIndex({ expiresAt: 1 });
    
    // Создаем индексы для коллекции withdrawalRequests
    await db.collection('withdrawalRequests').createIndex({ userId: 1 });
    await db.collection('withdrawalRequests').createIndex({ status: 1 });
    await db.collection('withdrawalRequests').createIndex({ createdAt: -1 });
    
    // Создаем индексы для коллекции supportTickets
    await db.collection('supportTickets').createIndex({ userId: 1 });
    await db.collection('supportTickets').createIndex({ status: 1 });
    await db.collection('supportTickets').createIndex({ createdAt: -1 });
    await db.collection('supportTickets').createIndex({ id: 1 }, { unique: true });
    await db.collection('supportTickets').createIndex({ adminId: 1 });
    await db.collection('supportTickets').createIndex({ updatedAt: -1 });
    
    // Создаем индексы для коллекции taskChecks
    await db.collection('taskChecks').createIndex({ userId: 1 });
    await db.collection('taskChecks').createIndex({ status: 1 });
    await db.collection('taskChecks').createIndex({ createdAt: -1 });
    
    // Создаем индексы для коллекции dailyTasks
    await db.collection('dailyTasks').createIndex({ userId: 1 });
    await db.collection('dailyTasks').createIndex({ date: 1 });
    await db.collection('dailyTasks').createIndex({ completed: 1 });
    
    // Создаем индексы для коллекции exchangeHistory
    await db.collection('exchangeHistory').createIndex({ userId: 1 });
    await db.collection('exchangeHistory').createIndex({ timestamp: -1 });
    
    // Создаем индекс для резерва
    await db.collection('reserve').createIndex({ currency: 1 }, { unique: true });
    
    console.log('✅ Все индексы пересозданы');
    
    // Инициализируем резерв заново
    console.log('💰 Инициализация резерва...');
    await initializeReserve();
    console.log('✅ Резерв инициализирован');
    
    // Очищаем кеши
    userCache.clear();
    statsCache.clear();
    console.log('✅ Кеши очищены');
    
    console.log('✅ База данных успешно сброшена!');
    
    return true;
  } catch (error) {
    console.error('❌ Ошибка сброса базы данных:', error);
    throw error;
  }
}

// ==================== КЕШИРОВАНИЕ ====================
const userCache = new Map();
const statsCache = new Map();

function getCachedUser(id) {
  const cached = userCache.get(id);
  if (cached && (Date.now() - cached.timestamp) < config.USER_CACHE_TTL) {
    // Проверяем валидность данных пользователя
    if (cached.user && typeof cached.user.magnuStarsoins === 'number' && typeof cached.user.stars === 'number' &&
        !isNaN(cached.user.magnuStarsoins) && !isNaN(cached.user.stars)) {
      return cached.user;
    } else {
      // Если данные невалидны, удаляем из кеша
      userCache.delete(id);
      console.warn(`🧹 Удален невалидный кеш пользователя ${id} (NaN или null значения)`);
      return null;
    }
  }
  return null;
}

function setCachedUser(id, user) {
  // Проверяем валидность данных пользователя перед сохранением в кеш
  if (user && typeof user.magnuStarsoins === 'number' && typeof user.stars === 'number' &&
      !isNaN(user.magnuStarsoins) && !isNaN(user.stars)) {
    userCache.set(id, { user, timestamp: Date.now() });
  } else {
    // Если данные невалидны, не сохраняем в кеш и логируем ошибку
    console.warn(`⚠️ Попытка сохранения невалидных данных пользователя ${id} в кеш:`, {
      magnuStarsoins: user?.magnuStarsoins,
      stars: user?.stars,
      type: typeof user?.magnuStarsoins,
      isNaN_magnuStarsoins: isNaN(user?.magnuStarsoins),
      isNaN_stars: isNaN(user?.stars)
    });
  }
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

// Функция для очистки невалидных данных из кеша
function cleanupInvalidCache() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [id, cached] of userCache.entries()) {
    if (cached && cached.user) {
      // Проверяем валидность данных
      if (typeof cached.user.magnuStarsoins !== 'number' || typeof cached.user.stars !== 'number' ||
          isNaN(cached.user.magnuStarsoins) || isNaN(cached.user.stars)) {
        userCache.delete(id);
        cleanedCount++;
        console.log(`🧹 Удален невалидный кеш пользователя ${id} (NaN или невалидные значения)`);
      }
      // Проверяем TTL
      else if (now - cached.timestamp > config.USER_CACHE_TTL) {
        userCache.delete(id);
        cleanedCount++;
      }
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Очищено ${cleanedCount} записей из кеша пользователей`);
  }
  
  return cleanedCount;
}

// Функция для принудительной очистки кеша конкретного пользователя
function clearUserCache(userId) {
  if (userCache.has(userId)) {
    userCache.delete(userId);
    console.log(`🧹 Принудительно очищен кеш пользователя ${userId}`);
    return true;
  }
  return false;
}

// ==================== УТИЛИТЫ ====================
function escapeMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/!/g, '\\!');
}

function formatNumber(num) {
  // Проверяем, что num является числом
  if (num === null || num === undefined || isNaN(num)) {
    return '0,00';
  }
  
  // Преобразуем в число на всякий случай
  num = Number(num);
  
  // Разделяем на целую и дробную части
  const [integerPart, decimalPart = '00'] = num.toFixed(2).split('.');
  
  // Добавляем разделители тысяч к целой части
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  // Возвращаем отформатированное число с запятой в качестве десятичного разделителя
  return `${formattedInteger},${decimalPart}`;
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

function calculateExperienceToNextLevel(level) {
  // Базовый опыт для 1 уровня
  let baseExperience = 100;
  
  // Рассчитываем опыт для указанного уровня
  for (let i = 1; i < level; i++) {
    baseExperience = Math.floor(baseExperience * 1.2);
  }
  
  return baseExperience;
}

function getRankByLevel(level) {
  // Система рангов на основе уровней
  if (level >= 100) return '👑 Император';
  if (level >= 80) return '⚜️ Король';
  if (level >= 60) return '👑 Принц';
  if (level >= 40) return '🛡️ Рыцарь';
  if (level >= 30) return '⚔️ Воин';
  if (level >= 20) return '🛡️ Страж';
  if (level >= 15) return '🗡️ Охотник';
  if (level >= 10) return '🏹 Лучник';
  if (level >= 5) return '⚔️ Боец';
  return '🛡️ Рекрут';
}

function getUserRank(user) {
  const level = user.level || 1;
  
  console.log(`🔍 getUserRank вызвана для пользователя ${user.id}, уровень: ${level}`);
  
  return getRankByLevel(level);
}

function getRankRequirements() {
  return [
    { level: 1, name: '🛡️ Рекрут', requirement: 'Начальный ранг' },
    { level: 5, name: '⚔️ Боец', requirement: '5 уровень' },
    { level: 10, name: '🏹 Лучник', requirement: '10 уровень' },
    { level: 15, name: '🗡️ Охотник', requirement: '15 уровень' },
    { level: 20, name: '🛡️ Страж', requirement: '20 уровень' },
    { level: 30, name: '⚔️ Воин', requirement: '30 уровень' },
    { level: 40, name: '🛡️ Рыцарь', requirement: '40 уровень' },
    { level: 60, name: '👑 Принц', requirement: '60 уровень' },
    { level: 80, name: '⚜️ Король', requirement: '80 уровень' },
    { level: 100, name: '👑 Император', requirement: '100 уровень' }
  ];
}

async function getRankProgress(user) {
  // Получаем актуальные данные пользователя из базы
  const freshUser = await getUser(user.id);
  const level = freshUser ? (freshUser.level || 1) : (user.level || 1);
  const ranks = getRankRequirements();
  
  console.log(`🔍 getRankProgress вызвана для пользователя ${user.id}`);
  console.log(`🔍 Уровень из freshUser: ${freshUser ? freshUser.level : 'null'}`);
  console.log(`🔍 Уровень из user: ${user.level}`);
  console.log(`🔍 Итоговый уровень: ${level}`);
  
  // Находим текущий ранг
  let currentRank = ranks[0];
  let nextRank = null;
  
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (level >= ranks[i].level) {
      currentRank = ranks[i];
      if (i < ranks.length - 1) {
        nextRank = ranks[i + 1];
      }
      break;
    }
  }
  
  console.log(`🔍 Найден текущий ранг: ${currentRank.name} (${currentRank.level})`);
  console.log(`🔍 Следующий ранг: ${nextRank ? nextRank.name + ' (' + nextRank.level + ')' : 'Нет'}`);
  // Если достигнут максимальный ранг
  if (!nextRank) {
    const result = {
      current: currentRank,
      next: null,
      progress: 100,
      remaining: 0,
      isMax: true
    };
    
    console.log(`🎯 Пользователь ${user.id} достиг максимального ранга:`, result);
    return result;
  }
  
  // Проверяем, что у нас есть валидные данные для расчета прогресса
  if (nextRank.level <= currentRank.level) {
    console.error('Ошибка в расчете прогресса ранга: nextRank.level <= currentRank.level', {
      currentRank,
      nextRank,
      userLevel: level,
      userId: user.id
    });
    return {
      current: currentRank,
      next: nextRank,
      progress: 0,
      remaining: nextRank.level - level,
      isMax: false
    };
  }
  
  // Безопасный расчет прогресса
  const levelDifference = nextRank.level - currentRank.level;
  const userProgress = level - currentRank.level;
  
  // Добавляем прогресс опыта внутри текущего уровня
  const experienceProgress = freshUser ? (freshUser.experience / freshUser.experienceToNextLevel) : 0;
  const totalUserProgress = userProgress + experienceProgress;
  
  console.log(`🔍 Расчет прогресса: levelDifference=${levelDifference}, userProgress=${userProgress}, experienceProgress=${experienceProgress.toFixed(2)}, totalUserProgress=${totalUserProgress.toFixed(2)}`);
  if (levelDifference <= 0) {
    console.error('Ошибка в расчете прогресса ранга: levelDifference <= 0', {
      currentRank,
      nextRank,
      userLevel: level,
      levelDifference,
      userId: user.id
    });
    return {
      current: currentRank,
      next: nextRank,
      progress: 0,
      remaining: nextRank.level - level,
      isMax: false
    };
  }
  
  const progress = Math.min(100, Math.max(0, Math.round((totalUserProgress / levelDifference) * 100)));
  const remaining = Math.max(0, nextRank.level - level);
  
  const result = {
    current: currentRank,
    next: nextRank,
    progress: progress,
    remaining: remaining,
    isMax: false
  };
  
  console.log(`🎯 Результат расчета прогресса для пользователя ${user.id}:`, {
    level,
    currentRank: currentRank.name,
    nextRank: nextRank.name,
    progress,
    remaining,
    userProgress,
    experienceProgress: experienceProgress.toFixed(2),
    totalUserProgress: totalUserProgress.toFixed(2),
    levelDifference,
    calculation: `(${totalUserProgress.toFixed(2)} / ${levelDifference}) * 100 = ${progress}%`
  });
  
  return result;
}

function isAdmin(userId) {
  return config.ADMIN_IDS.includes(userId);
}
// Функция для проверки и повышения уровня пользователя
async function checkAndUpdateLevel(user) {
  try {
    console.log(`🔍 Проверка уровня для пользователя ${user.id}: опыт ${user.experience}/${user.experienceToNextLevel}, уровень ${user.level}`);
    
    let levelUp = false;
    let newLevel = user.level || 1;
    let newExperience = user.experience || 0;
    let newExperienceToNextLevel = user.experienceToNextLevel || 100;
    
    // Проверяем, достиг ли пользователь следующего уровня
    while (newExperience >= newExperienceToNextLevel) {
      levelUp = true;
      newExperience -= newExperienceToNextLevel;
      newLevel++;
      
      // Увеличиваем требуемый опыт для следующего уровня
      newExperienceToNextLevel = Math.floor(newExperienceToNextLevel * 1.2);
      
      console.log(`🎉 Пользователь ${user.id} повысил уровень до ${newLevel}! Осталось опыта: ${newExperience}/${newExperienceToNextLevel}`);
    }
    
    // Если уровень повысился, обновляем в базе данных
    if (levelUp) {
      await db.collection('users').updateOne(
        { id: user.id },
        { 
          $set: { 
            level: newLevel,
            experience: newExperience,
            experienceToNextLevel: newExperienceToNextLevel,
            updatedAt: new Date()
          }
        }
      );
      
      // Очищаем кеш, чтобы при следующем запросе получить свежие данные
      userCache.delete(user.id);
      
      console.log(`✅ Уровень пользователя ${user.id} обновлен: ${newLevel}, опыт: ${newExperience}/${newExperienceToNextLevel}`);
    }
    
    return { levelUp, newLevel, newExperience, newExperienceToNextLevel };
  } catch (error) {
    console.error(`❌ Ошибка при проверке уровня пользователя ${user.id}:`, error);
    return { levelUp: false, newLevel: user.level, newExperience: user.experience, newExperienceToNextLevel: user.experienceToNextLevel };
  }
}

// Функция для получения требуемого опыта для уровня
function getRequiredExperience(level) {
  let requiredExp = 100; // Базовый опыт для 1 уровня
  
  for (let i = 2; i <= level; i++) {
    requiredExp = Math.floor(requiredExp * 1.2);
  }
  
  return requiredExp;
}

// Функция для отладки прогресса ранга
async function debugRankProgress(user) {
  const level = user.level || 1;
  const ranks = getRankRequirements();
  
  console.log(`🔍 Отладка прогресса ранга для пользователя ${user.id}:`);
  console.log(`├ Уровень пользователя: ${level}`);
  console.log(`├ Все ранги:`, ranks.map(r => `${r.name} (${r.level})`));
  
  // Находим текущий ранг
  let currentRank = ranks[0];
  let nextRank = null;
  
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (level >= ranks[i].level) {
      currentRank = ranks[i];
      if (i < ranks.length - 1) {
        nextRank = ranks[i + 1];
      }
      break;
    }
  }
  
  console.log(`├ Текущий ранг: ${currentRank.name} (${currentRank.level})`);
  console.log(`├ Следующий ранг: ${nextRank ? nextRank.name + ' (' + nextRank.level + ')' : 'Нет (максимальный)'}`);
  
  if (nextRank) {
    const levelDifference = nextRank.level - currentRank.level;
    const userProgress = level - currentRank.level;
    const progress = Math.min(100, Math.max(0, Math.round((userProgress / levelDifference) * 100)));
    
    console.log(`├ Разница уровней: ${levelDifference}`);
    console.log(`├ Прогресс пользователя: ${userProgress}`);
    console.log(`├ Процент прогресса: ${progress}%`);
    console.log(`└ Осталось уровней: ${nextRank.level - level}`);
  } else {
    console.log(`└ Пользователь достиг максимального ранга`);
  }
  
  // Тестируем функцию getRankProgress
  const rankProgress = await getRankProgress(user);
  console.log(`🔍 Результат getRankProgress:`, rankProgress);
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
      farStarsount: 0,
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
      completedTasks: 0,
      totalTaskEarnings: 0
    };
  }
  
  // Миграция для старых пользователей
  if (user.tasks && (user.tasks.completedTasksCount !== undefined || user.tasks.totalTaskRewards !== undefined)) {
    if (user.tasks.completedTasksCount !== undefined) {
      user.tasks.completedTasks = user.tasks.completedTasksCount;
      delete user.tasks.completedTasksCount;
    }
    if (user.tasks.totalTaskRewards !== undefined) {
      user.tasks.totalTaskEarnings = user.tasks.totalTaskRewards;
      delete user.tasks.totalTaskRewards;
    }
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
  
  if (!user.totalEarnedMagnuStarsoins) {
    user.totalEarnedMagnuStarsoins = user.magnuStarsoins || 0;
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
    logFunction('getUser', id, { ctx: ctx ? 'present' : 'null' });
    
    // Проверяем, что id является числом
    if (!id || isNaN(parseInt(id))) {
      console.error(`❌ Неверный ID пользователя: ${id}`);
      return null;
    }
    
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
        magnuStarsoins: config.INITIAL_MAGNUM_COINS,
        totalEarnedStars: config.INITIAL_STARS,
        totalEarnedMagnuStarsoins: config.INITIAL_MAGNUM_COINS,
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
          farStarsount: 0,
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
          completedTasks: 0,
          totalTaskEarnings: 0
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
      const oldLastSeen = user.statistics?.lastSeen;
      const oldSessions = user.statistics?.totalSessions || 0;
      user.statistics.lastSeen = new Date();
      user.statistics.totalSessions = oldSessions + 1;
      
      // Обновляем данные пользователя из контекста, если они доступны
      const updateData = { 
        'statistics.lastSeen': user.statistics.lastSeen,
        'statistics.totalSessions': user.statistics.totalSessions,
        updatedAt: new Date()
      };
      
      // Обновляем имя и username, если они доступны в контексте
      if (ctx?.from?.first_name) {
        updateData.firstName = ctx.from.first_name;
        user.firstName = ctx.from.first_name;
      }
      if (ctx?.from?.last_name) {
        updateData.lastName = ctx.from.last_name;
        user.lastName = ctx.from.last_name;
      }
      if (ctx?.from?.username) {
        updateData.username = ctx.from.username;
        user.username = ctx.from.username;
      }
      
      await db.collection('users').updateOne(
        { id: id },
        { $set: updateData }
      );
    }
    
    // Проверяем валидность данных пользователя перед возвратом
    if (typeof user.magnuStarsoins !== 'number' || typeof user.stars !== 'number' || 
        isNaN(user.magnuStarsoins) || isNaN(user.stars)) {
      console.error(`❌ Невалидные данные пользователя ${id}:`, {
        magnuStarsoins: user.magnuStarsoins,
        stars: user.stars,
        type: typeof user.magnuStarsoins,
        isNaN_magnuStarsoins: isNaN(user.magnuStarsoins),
        isNaN_stars: isNaN(user.stars)
      });
      // Исправляем невалидные данные
      user.magnuStarsoins = (typeof user.magnuStarsoins === 'number' && !isNaN(user.magnuStarsoins)) ? user.magnuStarsoins : config.INITIAL_MAGNUM_COINS;
      user.stars = (typeof user.stars === 'number' && !isNaN(user.stars)) ? user.stars : config.INITIAL_STARS;
      
      // Очищаем кеш пользователя
      clearUserCache(id);
      
      // Обновляем в базе данных
      await db.collection('users').updateOne(
        { id: id },
        { 
          $set: { 
            magnuStarsoins: user.magnuStarsoins,
            stars: user.stars,
            updatedAt: new Date()
          }
        }
      );
    }
    
    // Сохраняем в кеш
    setCachedUser(id, user);
    return user;
  } catch (error) {
    console.error(`❌ Ошибка получения пользователя ${id}:`, error);
    console.log(`Ошибка при получении пользователя ${id}:`, {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Функция для получения отображаемого имени пользователя
function getDisplayName(user) {
  if (user.firstName) {
    return user.firstName;
  }
  if (user.username) {
    return `@${user.username}`;
  }
  return 'Не указано';
}

// Функция для формирования сообщения профиля
async function formatProfileMessage(user, rankProgress) {
  let rankInfo = `├ Ранг: ${rankProgress.current.name}\n`;
  if (!rankProgress.isMax) {
    rankInfo += `├ Прогресс: ${rankProgress.progress}% (${rankProgress.remaining} ур. до ${rankProgress.next.name})\n`;
  } else {
    rankInfo += `├ Прогресс: Максимальный ранг! 🎉\n`;
  }

  // Получаем глобальную статистику
  const globalStats = await getGlobalStats();

  return `🌟 *Добро пожаловать в Magnum Stars!*\n\n` +
    `👤 *Профиль:*\n` +
    `├ ID: \`${user.id}\`\n` +
    `├ Имя: ${getDisplayName(user)}\n` +
    `├ Уровень: ${user.level}\n` +
    `${rankInfo}` +
    `└ Титул: ${user.mainTitle}\n\n` +
    `💎 *Баланс:*\n` +
    `├ ⭐ Stars: \`${formatNumber(user.stars)}\`\n` +
    `└ 🪙 Magnum Coins: \`${formatNumber(user.magnuStarsoins)}\`\n\n` +
    `📊 *Статистика сообщества:*\n` +
    `├ 👥 Пользователей: \`${Math.floor(globalStats.totalUsers)}\`\n` +
    `├ 💰 Выведено Stars: \`${formatNumber(globalStats.totalWithdrawnStars)}\`\n` +
    `└ 💎 Заработано Magnum: \`${formatNumber(globalStats.totalEarnedMagnumCoins)}\`\n\n` +
    `📱 *Полезные ссылки:*\n` +
    `├ [📰 Новости](https://t.me/magnumtap)\n` +
    `├ [💰 Выводы](https://t.me/magnumwithdraw)\n` +
    `└ [💬 Чат](https://t.me/magnumtapchat)\n\n` +
    `⚠️ *Нашли ошибку?*\n` +
    `├ Сообщите в поддержку за вознаграждение!\n` +
    `├ FAQ и ответы на вопросы\n` +
    `└ Перейдите в 👤 Профиль → 🆘 Поддержка\n\n` +
    `🎯 Выберите действие:`;
}

// ==================== ПРОВЕРКА ПОДПИСКИ ====================
async function checkSubscription(ctx) {
  try {
    if (!config.REQUIRED_CHANNEL) return true;
    
    // Проверяем, что канал указан правильно
    if (!config.REQUIRED_CHANNEL.startsWith('@') && !config.REQUIRED_CHANNEL.startsWith('https://t.me/')) {
      console.log('⚠️ Неверный формат канала:', config.REQUIRED_CHANNEL);
      return true;
    }
    
    // Проверяем, что ctx.from.id существует
    if (!ctx.from || !ctx.from.id) {
      console.error('❌ ctx.from.id не найден');
      return true;
    }
    
    const member = await ctx.telegram.getChatMember(config.REQUIRED_CHANNEL, ctx.from.id);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (error) {
    console.error('❌ Ошибка проверки подписки:', error);
    console.log('Детали ошибки:', {
      channel: config.REQUIRED_CHANNEL,
      userId: ctx.from?.id,
      error: error.message,
      stack: error.stack
    });
    // Если канал не найден или произошла ошибка, пропускаем проверку подписки
    return true;
  }
}
async function showSubscriptionMessage(ctx) {
  try {
    // Проверяем, что канал указан правильно
    if (!config.REQUIRED_CHANNEL || (!config.REQUIRED_CHANNEL.startsWith('@') && !config.REQUIRED_CHANNEL.startsWith('https://t.me/'))) {
      console.log('⚠️ Канал не настроен или неверный формат:', config.REQUIRED_CHANNEL);
      // Если канал не настроен, показываем главное меню
      const user = await getUser(ctx.from.id);
      if (user) {
        await showMainMenu(ctx, user);
      }
      return;
    }
    
    // Преобразуем канал в правильный URL формат
    let channelUrl = config.REQUIRED_CHANNEL;
    if (channelUrl.startsWith('@')) {
      channelUrl = `https://t.me/${channelUrl.substring(1)}`;
    } else if (!channelUrl.startsWith('https://')) {
      channelUrl = `https://t.me/${channelUrl}`;
    }
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('📢 Подписаться на канал', channelUrl)],
      [Markup.button.callback('🔄 Проверить подписку', 'check_subscription')]
    ]);
    
    await ctx.reply(
      `🔒 Для использования бота необходимо подписаться на наш канал!\n\n` +
      `📢 Канал: ${config.REQUIRED_CHANNEL}\n\n` +
      `После подписки нажмите "🔄 Проверить подписку"`,
      { reply_markup: keyboard.reply_markup }
    );
  } catch (error) {
    console.error('❌ Ошибка показа сообщения о подписке:', error);
    console.log('Детали ошибки:', {
      channel: config.REQUIRED_CHANNEL,
      userId: ctx.from?.id,
      error: error.message,
      stack: error.stack
    });
    
    // Пытаемся показать главное меню в случае ошибки
    try {
      const user = await getUser(ctx.from.id);
      if (user) {
        await showMainMenu(ctx, user);
      }
    } catch (fallbackError) {
      console.error('❌ Не удалось показать главное меню:', fallbackError);
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }
}

// ==================== ГЛОБАЛЬНАЯ СТАТИСТИКА ====================
// Функция для получения глобальной статистики бота
async function getGlobalStats() {
  try {
    // Получаем общее количество пользователей
    const totalUsers = await db.collection('users').countDocuments();

    // Получаем статистику по валютам (исключая доходы от биржи)
    const usersWithStats = await db.collection('users').find({}, {
      projection: {
        magnuStarsoins: 1,
        stars: 1,
        totalEarnedMagnuStarsoins: 1,
        totalEarnedStars: 1,
        totalWithdrawnMagnuStarsoins: 1,
        totalWithdrawnStars: 1
      }
    }).toArray();

    // Суммируем все валюты
    let totalMagnumCoins = 0;
    let totalStars = 0;
    let totalEarnedMagnumCoins = 0;
    let totalEarnedStars = 0;
    let totalWithdrawnMagnumCoins = 0;
    let totalWithdrawnStars = 0;

    for (const user of usersWithStats) {
      totalMagnumCoins += user.magnuStarsoins || 0;
      totalStars += user.stars || 0;
      totalEarnedMagnumCoins += user.totalEarnedMagnuStarsoins || 0;
      totalEarnedStars += user.totalEarnedStars || 0;
      totalWithdrawnMagnumCoins += user.totalWithdrawnMagnuStarsoins || 0;
      totalWithdrawnStars += user.totalWithdrawnStars || 0;
    }

    // Получаем сумму выведенных Stars только из одобренных заявок
    const approvedWithdrawals = await db.collection('withdrawalRequests').find({ status: 'approved' }).toArray();
    const totalApprovedWithdrawnStars = approvedWithdrawals.reduce((sum, withdrawal) => {
      if (withdrawal.currency === 'stars') {
        return sum + (withdrawal.amount || 0);
      }
      return sum;
    }, 0);

    // Вычитаем доходы от биржи из общего заработка Magnum Coins
    // Получаем сумму всех обменов на бирже
    const exchangeOperations = await db.collection('exchangeHistory').find({}).toArray();
    let totalExchangeMagnumEarnings = 0;

    for (const exchange of exchangeOperations) {
      // Если пользователь обменял Stars на Magnum Coins, это считается доходом от биржи
      if (exchange.direction === 'stars') {
        totalExchangeMagnumEarnings += exchange.received || 0;
      }
    }

    // Исключаем доходы от биржи из общего заработка
    totalEarnedMagnumCoins = Math.max(0, totalEarnedMagnumCoins - totalExchangeMagnumEarnings);

    return {
      totalUsers,
      totalMagnumCoins,
      totalStars,
      totalEarnedMagnumCoins,
      totalEarnedStars,
      totalWithdrawnMagnumCoins,
      totalWithdrawnStars: totalApprovedWithdrawnStars
    };
  } catch (error) {
    console.error('❌ Ошибка получения глобальной статистики:', error);
    return {
      totalUsers: 0,
      totalMagnumCoins: 0,
      totalStars: 0,
      totalEarnedMagnumCoins: 0,
      totalEarnedStars: 0,
      totalWithdrawnMagnumCoins: 0,
      totalWithdrawnStars: 0
    };
  }
}

// ==================== РЕФЕРАЛЬНАЯ СИСТЕМА ====================
async function handleReferral(userId, referrerId) {
  try {
    console.log(`👥 Обработка реферала: ${userId} -> ${referrerId}`);
    console.log(`🔍 Детали реферала:`, {
      userId: userId,
      referrerId: referrerId,
      userIdType: typeof userId,
      referrerIdType: typeof referrerId
    });
    
    if (userId === referrerId) {
      console.log('❌ Пользователь не может быть своим реферером');
      return;
    }
    
    const user = await getUser(userId);
    console.log(`👤 Пользователь получен:`, {
      id: user.id,
      referrerId: user.referrerId,
      referralsCount: user.referralsCount
    });
    
    if (user.referrerId) {
      console.log('❌ У пользователя уже есть реферер:', user.referrerId);
      return;
    }
    
    const referrer = await getUser(referrerId);
    console.log(`👤 Реферер получен:`, {
      id: referrer.id,
      referralsCount: referrer.referralsCount,
      referralsEarnings: referrer.referralsEarnings,
      totalReferralEarnings: referrer.totalReferralEarnings
    });
    
    if (!referrer) {
      console.log('❌ Реферер не найден');
      return;
    }
    
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
    
    // Обновляем реферера с правильной наградой
    const referralReward = config.REFERRAL_REWARD; // 5 Stars за реферала
    await db.collection('users').updateOne(
      { id: referrerId },
      { 
        $inc: { 
          referralsCount: 1,
          totalReferralEarnings: referralReward,
          referralsEarnings: referralReward, // Добавляем оба поля для совместимости
          stars: referralReward, // Начисляем Stars вместо Stars
          totalEarnedStars: referralReward
        },
        $push: { referrals: userId },
        $set: { updatedAt: new Date() }
      }
    );
    
    // Очищаем кеш
    userCache.delete(userId);
    userCache.delete(referrerId);
    
    console.log(`✅ База данных обновлена для реферала ${userId} -> ${referrerId}`);
    console.log(`💰 Награда выдана: ${referralReward} Stars`);
    
    // Отправляем уведомление рефереру
    try {
      const referrerUser = await getUser(referrerId);
      const newUser = await getUser(userId);
      
      const notificationMessage = 
        `🎉 *Новый реферал!*\n\n` +
        `👤 Пользователь: ${newUser.firstName || 'Неизвестно'}\n` +
        `🆔 ID: \`${userId}\`\n` +
        `⭐ Награда: +${formatNumber(referralReward)} Stars\n\n` +
        `📊 Всего рефералов: ${referrerUser.referralsCount}\n` +
        `💎 Общий заработок с рефералов: ${formatNumber(referrerUser.referralsEarnings || referrerUser.totalReferralEarnings || 0)} Stars`;
      
      await bot.telegram.sendMessage(referrerId, notificationMessage, {
        parse_mode: 'Markdown'
      });
      
      console.log(`✅ Уведомление отправлено рефереру ${referrerId}`);
    } catch (notifyError) {
      console.error('❌ Ошибка отправки уведомления рефереру:', notifyError);
    }
    
    // Отправляем уведомление новому пользователю
    try {
      const welcomeMessage = 
        `🎉 *Добро пожаловать в Magnum Stars!*\n\n` +
        `👥 Вы присоединились по реферальной ссылке\n` +
        `👤 Пригласил: ${referrer.firstName || 'Неизвестно'}\n` +
        `💰 Вы получили: +${formatNumber(config.INITIAL_MAGNUM_COINS)} Stars\n\n` +
        `🎮 Начните играть прямо сейчас!`;
      
      await bot.telegram.sendMessage(userId, welcomeMessage, {
        parse_mode: 'Markdown'
      });
      
      console.log(`✅ Приветственное сообщение отправлено пользователю ${userId}`);
    } catch (welcomeError) {
      console.error('❌ Ошибка отправки приветственного сообщения:', welcomeError);
    }
    
    console.log(`✅ Реферал успешно обработан: ${userId} -> ${referrerId}`);
    console.log(`💰 Награда выдана: ${referralReward} Stars`);
    
  } catch (error) {
    console.error('❌ Ошибка обработки реферала:', error);
    logError(error, 'Обработка реферала');
  }
}
// ==================== ГЛАВНОЕ МЕНЮ ====================
async function showMainMenu(ctx, user) {
  try {
    log(`🏠 Показ главного меню для пользователя ${user.id}`);
    
    const rankProgress = await getRankProgress(user);
    log(`🏠 Получен прогресс ранга для пользователя ${user.id}`);
    
    // Создаем базовые кнопки (рабочие функции)
    const buttons = [
      [
        Markup.button.callback('⛏️ Майнер', 'miner'),
        Markup.button.callback('👤 Профиль', 'profile')
      ],
      [
        Markup.button.callback('🔑 Ключи', 'promocode'),
        Markup.button.callback('👥 Рефералы', 'referrals')
      ],
      [
        Markup.button.callback('🗺️ Роадмап', 'roadmap'),
        Markup.button.callback('📈 Биржа', 'exchange')
      ],
      [
        Markup.button.callback('💰 Вывод', 'withdrawal')
      ]
    ];
    
    // Добавляем кнопку бонуса
    if (isAdmin(user.id)) {
      buttons.splice(3, 0, [
        Markup.button.webApp('🎁 Бонус', `${config.WEBAPP_URL || 'https://your-domain.com'}/webapp`)
      ]);
    } else {
      buttons.splice(3, 0, [
        Markup.button.callback('🎁 Бонус', 'bonus_user')
      ]);
    }
  
  // Добавляем админ кнопки если нужно
  if (isAdmin(user.id)) {
    buttons.push([
      Markup.button.callback('👨‍💼 Админ панель', 'admin')
    ]);
  }
  
  const keyboard = Markup.inlineKeyboard(buttons);
  
  const message = await formatProfileMessage(user, rankProgress);
  
  try {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (editError) {
    // Если не удалось отредактировать сообщение, отправляем новое
    console.log(`⚠️ Не удалось отредактировать сообщение для пользователя ${user.id}, отправляем новое`);
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  }
  
  log(`✅ Главное меню успешно показано пользователю ${user.id}`);
  } catch (error) {
    logError(error, `Показ главного меню для пользователя ${user.id}`);
    log(`❌ Ошибка в showMainMenu для пользователя ${user.id}: ${error.message}`);
    
    // Проверяем, доступен ли answerCbQuery в данном контексте
    if (ctx.answerCbQuery) {
      try {
        await ctx.answerCbQuery('❌ Ошибка загрузки главного меню');
      } catch (cbError) {
        console.error('❌ Ошибка answerCbQuery:', cbError);
      }
    }
  }
}

async function showMainMenuStart(ctx, user) {
  try {
    const rankProgress = await getRankProgress(user);
  
      // Создаем базовые кнопки (рабочие функции)
    const buttons = [
      [
        Markup.button.callback('⛏️ Майнер', 'miner'),
        Markup.button.callback('👤 Профиль', 'profile')
      ],
      [
        Markup.button.callback('🔑 Ключи', 'promocode'),
        Markup.button.callback('👥 Рефералы', 'referrals')
      ],
      [
        Markup.button.callback('🗺️ Роадмап', 'roadmap'),
        Markup.button.callback('📈 Биржа', 'exchange')
      ],
      [
        Markup.button.callback('💰 Вывод', 'withdrawal')
      ]
    ];
    
    // Добавляем кнопку бонуса
    if (isAdmin(user.id)) {
      buttons.splice(3, 0, [
        Markup.button.webApp('🎁 Бонус', `${config.WEBAPP_URL || 'https://your-domain.com'}/webapp`)
      ]);
    } else {
      buttons.splice(3, 0, [
        Markup.button.callback('🎁 Бонус', 'bonus_user')
      ]);
    }
  
  // Добавляем админ кнопки если нужно
  if (isAdmin(user.id)) {
    buttons.push([
      Markup.button.callback('👨‍💼 Админ панель', 'admin')
    ]);
  }
  
  const keyboard = Markup.inlineKeyboard(buttons);
  
  const message = await formatProfileMessage(user, rankProgress);
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
  } catch (error) {
    console.error(`❌ Ошибка показа главного меню для пользователя ${user.id}:`, error);
    console.log(`Ошибка в showMainMenuStart:`, {
      userId: user.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Пытаемся отправить простое сообщение
    try {
      await ctx.reply('❌ Ошибка загрузки меню. Попробуйте позже.');
    } catch (replyError) {
      console.error(`❌ Не удалось отправить сообщение об ошибке пользователю ${user.id}:`, replyError);
    }
  }
}

// ==================== РОАДМАП ====================
async function showRoadmap(ctx, user) {
  try {
    log(`🗺️ Показ роадмапа для пользователя ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🚀 Q4 2025 (Бот)', 'roadmap_q4_2025'),
        Markup.button.callback('🎯 Q1 2026 (WebApp)', 'roadmap_q1_2026')
      ],
      [
        Markup.button.callback('🌟 Q2 2026 (WebApp)', 'roadmap_q2_2026'),
        Markup.button.callback('🔥 Q3 2026 (WebApp)', 'roadmap_q3_2026')
      ],
      [
        Markup.button.callback('💡 Предложения (⏳)', 'roadmap_suggestions')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ]);
    
    const message = 
      `🗺️ *Роадмап развития Magnum Stars*\n\n` +
      `🌟 *Добро пожаловать в будущее нашего проекта!*\n\n` +
      `🔬 *Текущий статус: Beta-версия бота*\n` +
      `📅 *Дата запуска: 28 августа 2025*\n\n` +
      `📅 *Планы развития:*\n` +
      `├ 🚀 Q4 2025 - Основные функции (Бот)\n` +
      `├ 🎯 Q1 2026 - WebApp переход\n` +
      `├ 🌟 Q2 2026 - Игровые механики (WebApp)\n` +
      `└ 🔥 Q3 2026 - Инновации (WebApp)\n\n` +
      `🎮 *Что нас ждет:*\n` +
      `├ 🏰 Система гильдий\n` +
      `├ ⚔️ PvP сражения\n` +
      `├ 🎲 Мини-игры и турниры\n` +
      `├ 🎨 Система кастомизации\n` +
      `├ 📈 Расширенная биржа\n` +
      `├ 🎭 Персонализация\n` +
      `├ 🌍 Метавселенная\n` +
      `└ 💎 NFT интеграция\n\n` +
      `📱 *WebApp переход:*\n` +
      `├ 🔄 Сентябрь - Ноябрь 2025: Разработка\n` +
      `├ 🚀 22 ноября 2025: Полный переход на WebApp\n` +
      `└ 📱 Больше никаких кнопок - только WebApp!\n\n` +
      `💡 *Ваше мнение важно!*\n` +
      `├ 📊 Голосуйте за функции\n` +
      `└ 💡 Предлагайте идеи\n\n` +
      `🎯 Выберите квартал для детального просмотра:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Роадмап показан для пользователя ${user.id}`);
  } catch (error) {
    logError(error, `Показ роадмапа для пользователя ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа роадмапа');
  }
}

// ==================== ДЕТАЛЬНЫЕ РОАДМАПЫ ====================
async function showRoadmapQ4_2025(ctx, user) {
  try {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к роадмапу', 'roadmap')]
    ]);
    
    const message = 
      `🚀 *Q4 2025 - Основные функции (Бот)*\n\n` +
      `📅 *Август - Декабрь 2025*\n` +
      `🤖 *Платформа: Telegram Bot*\n\n` +
      `✅ *Завершено:*\n` +
      `├ 🌾 Система фарминга\n` +
      `├ 📈 Биржа Magnum Exchange\n` +
      `├ ⛏️ Майнер с динамическими наградами\n` +
      `├ 🎁 Ежедневные бонусы\n` +
      `├ 📋 Система заданий\n` +
      `├ 🏆 Достижения\n` +
      `├ 👥 Реферальная система\n` +
      `├ 🎫 Промокоды\n` +
      `├ 👑 Система титулов\n` +
      `└ 💰 Система вывода\n\n` +
      `🔄 *В разработке:*\n` +
      `├ 📊 Расширенная аналитика\n` +
      `├ 🎨 Улучшенный UI/UX\n` +
      `└ ⚡ Оптимизация производительности\n\n` +
      `📱 *Подготовка к WebApp:*\n` +
      `├ 🔄 Архитектурная подготовка\n` +
      `├ 📱 Адаптация под WebApp\n` +
      `└ 🎨 Дизайн-система\n\n` +
      `🚀 *WebApp переход:*\n` +
      `└ 22 ноября 2025\n\n` +
      `📈 *Прогресс: 85%*\n` +
      `🎯 *Запуск: 28 августа 2025*`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ роадмапа Q4 2024');
  }
}

async function showRoadmapQ1_2026(ctx, user) {
  try {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к роадмапу', 'roadmap')]
    ]);
    
    const message = 
      `🎯 *Q1 2026 - Социальные функции (WebApp)*\n\n` +
      `📅 *Январь - Март 2026*\n` +
      `📱 *Платформа: Telegram WebApp*\n\n` +
      `🔄 *WebApp переход в разработке:*\n` +
      `├ 🔄 Миграция всех функций\n` +
      `├ 🔄 Адаптивный дизайн\n` +
      `├ 🔄 Современный UI/UX\n` +
      `└ 🔄 Оптимизация производительности\n\n` +
      `🏰 *Система гильдий:*\n` +
      `├ Создание и управление гильдиями\n` +
      `├ Общий банк гильдии\n` +
      `├ Гильдейские чаты\n` +
      `└ Система рангов в гильдии\n\n` +
      `💬 *Социальные функции:*\n` +
      `├ Внутриигровой чат\n` +
      `├ Система друзей\n` +
      `├ Голосовые сообщения\n` +
      `└ Эмодзи и стикеры\n\n` +
      `🎭 *Персонализация:*\n` +
      `├ Кастомизация профиля\n` +
      `├ Система статусов\n` +
      `├ Персональные темы\n` +
      `└ Система подписок\n\n` +
      `📱 *WebApp особенности:*\n` +
      `├ 🔔 Push уведомления\n` +
      `├ 📊 Расширенная аналитика\n` +
      `├ 🎨 Темная/светлая тема\n` +
      `└ 📱 PWA поддержка\n\n` +
      `📈 *Прогресс: 15%*\n` +
      `🎯 *Переход в разработке: 22 ноября 2025*`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ роадмапа Q1 2025');
  }
}

async function showRoadmapQ2_2026(ctx, user) {
  try {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к роадмапу', 'roadmap')]
    ]);
    
    const message = 
      `🌟 *Q2 2026 - Игровые механики (WebApp)*\n\n` +
      `📅 *Апрель - Июнь 2026*\n` +
      `📱 *Платформа: Telegram WebApp*\n\n` +
      `⚔️ *PvP система:*\n` +
      `├ Дуэли между игроками\n` +
      `├ Турниры с призовыми фондами\n` +
      `├ Рейтинговая система\n` +
      `└ Командные битвы\n\n` +
      `🎲 *Мини-игры и турниры:*\n` +
      `├ Интеллектуальные викторины\n` +
      `├ Логические головоломки\n` +
      `├ Словесные игры\n` +
      `└ Еженедельные турниры\n\n` +
      `🎨 *Система кастомизации:*\n` +
      `├ Персональные аватары\n` +
      `├ Кастомные рамки профиля\n` +
      `├ Анимированные эффекты\n` +
      `└ Уникальные эмодзи\n\n` +
      `📱 *WebApp игры:*\n` +
      `├ 🎮 Игры прямо в браузере\n` +
      `├ 👥 Мультиплеер режим\n` +
      `├ 📱 Адаптивные контролы\n` +
      `└ 🔄 Real-time синхронизация\n\n` +
      `📈 *Прогресс: 0%*\n` +
      `🎯 *Платформа: WebApp только*`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ роадмапа Q2 2025');
  }
}

async function showRoadmapQ3_2026(ctx, user) {
  try {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к роадмапу', 'roadmap')]
    ]);
    
    const message = 
      `🔥 *Q3 2026 - Инновации (WebApp)*\n\n` +
      `📅 *Июль - Сентябрь 2026*\n` +
      `📱 *Платформа: Telegram WebApp*\n\n` +
      `🎮 *Игровые механики:*\n` +
      `├ Система достижений\n` +
      `├ Ежедневные квесты\n` +
      `├ Сезонные события\n` +
      `└ Турнирная система\n\n` +
      `💎 *NFT и блокчейн:*\n` +
      `├ NFT коллекции\n` +
      `├ Блокчейн интеграция\n` +
      `├ Децентрализованная биржа\n` +
      `└ Смарт-контракты\n\n` +
      `🤖 *AI и автоматизация:*\n` +
      `├ AI помощник\n` +
      `├ Автоматические сделки\n` +
      `├ Умные уведомления\n` +
      `└ Персональные рекомендации\n\n` +
      `📱 *WebApp финализация:*\n` +
      `├ ✅ Полная функциональность\n` +
      `├ 📱 Офлайн режим\n` +
      `├ 🔄 PWA поддержка\n` +
      `└ 🎯 Финальная версия\n\n` +
      `📈 *Прогресс: 0%*\n` +
      `🎯 *Платформа: WebApp только*`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ роадмапа Q3 2025');
  }
}



async function showRoadmapSuggestions(ctx, user) {
  try {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к роадмапу', 'roadmap')]
    ]);
    
    const message = 
      `💡 *Предложения для развития*\n\n` +
      `⚠️ *Временно недоступно*\n\n` +
      `🔧 *Система предложений находится в разработке*\n` +
      `├ 📝 Создание формы предложений\n` +
      `├ 🎯 Система модерации\n` +
      `├ 🏆 Система наград\n` +
      `└ 📊 Система голосования за предложения\n\n` +
      `📅 *Ожидаемая дата запуска:*\n` +
      `└ 15 декабря 2025\n\n` +
      `💡 *Пока что вы можете:*\n` +
      `├ 📱 Использовать все доступные функции бота\n` +
      `├ 🗺️ Изучать планы развития в роадмапе\n` +
      `└ 🎮 Участвовать в голосованиях (через админ панель)\n\n` +
      `🚀 *Следите за обновлениями!*`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ предложений роадмапа');
  }
}
// ==================== НОВАЯ СИСТЕМА МАЙНИНГА ====================
async function showMinerMenu(ctx, user) {
  // Инициализируем новую систему майнинга
  const userWithMining = initializeNewMiningSystem(user);
  
  // Получаем информацию о текущем сезоне
  const currentSeason = getCurrentMiningSeason();
  const seasonInfo = currentSeason ? 
    `\n📅 *Сезон ${currentSeason.season}* (День ${currentSeason.dayInSeason}/${config.MINING_SEASON_DURATION})\n` +
    `📈 *Множитель сезона:* ${currentSeason.multiplier.toFixed(2)}x\n` +
    `⏰ *До следующего сезона:* ${currentSeason.daysUntilNextSeason} дней` :
    `\n📅 *Выходные* - майнинг приостановлен`;
  
  // Рассчитываем общую скорость майнинга
  const totalSpeed = calculateTotalMiningSpeed(userWithMining);
  const rewardPerMinuteStars = totalSpeed.stars * currentSeason.multiplier;
  const rewardPerHourStars = rewardPerMinuteStars * 60;
  const rewardPerMinuteMagnumCoins = totalSpeed.magnuStarsoins * currentSeason.multiplier;
  const rewardPerHourMagnumCoins = rewardPerMinuteMagnumCoins * 60;
  
  // Подсчитываем общее количество майнеров
  const totalMiners = userWithMining.miners.reduce((sum, miner) => sum + miner.count, 0);
  
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🛒 Магазин майнеров', 'miner_shop'),
      Markup.button.callback('📅 Сезон', 'miner_season_info')
    ],
    [
      Markup.button.callback('🏆 Рейтинг', 'miner_leaderboard'),
      Markup.button.callback('⬆️ Апгрейды', 'miner_upgrades')
    ],
    [Markup.button.callback('🔙 Назад', 'main_menu')]
  ]);
  
  // Получаем информацию о титуле
  const titlesList = getTitlesList(userWithMining);
  const mainTitle = userWithMining.mainTitle || '🌱 Новичок';
  const currentTitle = titlesList.find(t => t.name === mainTitle);
  const titleBonus = currentTitle ? currentTitle.minerBonus : 1.0;
  const titleBonusText = titleBonus > 1.0 ? ` (+${((titleBonus - 1) * 100).toFixed(0)}%)` : '';

  const message =
    `⛏️ *Новая система майнинга*${seasonInfo}\n\n` +
    `💎 *Ваши майнеры:* ${totalMiners} шт.\n` +
    `⚡ *Скорость добычи:*\n` +
    `├ 🪙 Magnum Coins: ${formatNumber(totalSpeed.magnuStarsoins)} MC/мин\n` +
    `└ ⭐ Stars: ${formatNumber(totalSpeed.stars)} Stars/мин\n\n` +
    `💰 *Награды:*\n` +
    `├ 🪙 Magnum Coins: ${formatNumber(rewardPerMinuteMagnumCoins)} MC/мин • ${formatNumber(rewardPerHourMagnumCoins)} MC/час\n` +
    `└ ⭐ Stars: ${formatNumber(rewardPerMinuteStars)} Stars/мин • ${formatNumber(rewardPerHourStars)} Stars/час\n\n` +
    `👑 *Титул:* ${mainTitle}${titleBonusText}\n\n` +
    `📊 *Всего добыто:*\n` +
    `├ 🪙 Magnum Coins: ${formatNumber(userWithMining.miningStats?.totalMinedMagnumCoins || 0)} MC\n` +
    `└ ⭐ Stars: ${formatNumber(userWithMining.miningStats?.totalMinedStars || 0)} Stars\n\n` +
    `📊 *Сезонная добыча:*\n` +
    `├ 🪙 Magnum Coins: ${formatNumber(userWithMining.miningStats?.seasonMinedMagnumCoins || 0)} MC\n` +
    `└ ⭐ Stars: ${formatNumber(userWithMining.miningStats?.seasonMinedStars || 0)} Stars\n\n` +
    `🎯 Выберите действие ниже.`;
  
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
    await ctx.answerCbQuery('✅ Майнер запущен! Теперь вы будете получать Stars каждую минуту.');
    
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
// ==================== УЛУЧШЕНИЕ МАЙНЕРА ====================
async function showMinerUpgrade(ctx, user) {
  try {
    log(`⬆️ Показ меню улучшения майнера для пользователя ${user.id}`);
    
    const miner = user.miner;
    const currentLevel = miner.level || 1;
    const currentEfficiency = miner.efficiency || 1;
    
    // Расчет стоимости улучшения
    const upgradeCost = currentLevel * 100; // 100 Stars за уровень
    const newEfficiency = currentEfficiency + 0.2;
    
    // Рассчитываем новую награду с учетом курса, количества майнеров и титула
    const newRewardPerMinute = await calculateMinerReward(newEfficiency, user);
    const newRewardPerHour = newRewardPerMinute * 60;
    
    const canUpgrade = user.magnuStarsoins >= upgradeCost;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          canUpgrade ? `⬆️ Улучшить (${formatNumber(upgradeCost)} Stars)` : `❌ Недостаточно Stars (${formatNumber(upgradeCost)})`,
          canUpgrade ? 'confirm_miner_upgrade' : 'insufficient_funds'
        )
      ],
      [Markup.button.callback('🔙 Назад', 'miner')]
    ]);
    
    const message = 
      `⬆️ *Улучшение майнера*\n\n` +
      `📊 *Текущий уровень:* ${currentLevel}\n` +
      `⚡ *Текущая эффективность:* ${currentEfficiency.toFixed(1)}x\n` +
      `💰 *Текущая награда/час:* ${formatNumber((await calculateMinerReward(currentEfficiency, user)) * 60)} 🪙 Magnum Coins\n\n` +
      `📈 *После улучшения:*\n` +
      `⚡ *Новая эффективность:* ${newEfficiency.toFixed(1)}x\n` +
      `💰 *Новая награда/час:* ${formatNumber(newRewardPerHour)} 🪙 Magnum Coins\n\n` +
      `💎 *Стоимость улучшения:* ${formatNumber(upgradeCost)} 🪙 Magnum Coins\n` +
      `💎 *Ваш баланс:* ${formatNumber(user.magnuStarsoins)} 🪙 Magnum Coins\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Меню улучшения майнера показано пользователю ${user.id}`);
  } catch (error) {
    logError(error, `Показ меню улучшения майнера для пользователя ${user.id}`);
  }
}

// ==================== СТАТИСТИКА МАЙНЕРА ====================
async function showMinerStats(ctx, user) {
  try {
    log(`📊 Показ статистики майнера для пользователя ${user.id}`);
    
    const miner = user.miner;
    const isActive = miner.active || false;
    const efficiency = miner.efficiency || 1;
    
    // Рассчитываем текущую награду с учетом курса, количества майнеров и титула
    const currentReward = await calculateMinerReward(efficiency, user);
    const rewardPerMinute = currentReward;
    const rewardPerHour = currentReward * 60;
    
    let statusText = isActive ? '🟢 Активен' : '🔴 Неактивен';
    let lastRewardText = '';
    let nextRewardText = '';
    
    if (miner.lastReward) {
      const timeSince = Math.floor((Date.now() - miner.lastReward.getTime()) / 1000);
      if (timeSince < 60) {
        const remaining = 60 - timeSince;
        nextRewardText = `\n⏰ Следующая награда через: ${formatTime(remaining)}`;
      } else {
        nextRewardText = `\n✅ Готов к получению награды!`;
      }
    }
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'miner')]
    ]);
    
    // Получаем информацию о титуле
    const titlesList = getTitlesList(user);
    const mainTitle = user.mainTitle || '🌱 Новичок';
    const currentTitle = titlesList.find(t => t.name === mainTitle);
    const titleBonus = currentTitle ? currentTitle.minerBonus : 1.0;
    const titleBonusText = titleBonus > 1.0 ? ` (+${((titleBonus - 1) * 100).toFixed(0)}%)` : '';

    const message = 
      `📊 *Статистика майнера*\n\n` +
      `📈 *Уровень:* ${miner.level || 1}\n` +
      `⚡ *Эффективность:* ${efficiency.toFixed(1)}x\n` +
      `👑 *Титул:* ${mainTitle}${titleBonusText}\n` +
      `📊 *Статус:* ${statusText}\n` +
      `💰 *Награда/минуту:*\n` +
      `├ 🪙 Magnum Coins: ${formatNumber(rewardPerMinute)} MC/мин\n` +
      `└ ⭐ Stars: ${formatNumber(rewardPerMinute)} Stars/мин\n` +
      `💰 *Награда/час:*\n` +
      `├ 🪙 Magnum Coins: ${formatNumber(rewardPerHour)} MC/час\n` +
      `└ ⭐ Stars: ${formatNumber(rewardPerHour)} Stars/час\n` +
      `💎 *Всего добыто:*\n` +
      `├ 🪙 Magnum Coins: ${formatNumber(miner.totalMined || 0)} MC\n` +
      `└ ⭐ Stars: ${formatNumber(miner.totalMined || 0)} Stars\n` +
      `⏰ *Последняя награда:* ${miner.lastReward ? miner.lastReward.toLocaleString('ru-RU') : 'Нет'}\n` +
      `${nextRewardText}\n\n` +
      `📈 *Информация:*\n` +
      `• Майнер работает автоматически\n` +
      `• Награды выдаются каждую минуту\n` +
      `• Награда зависит от курса обмена, количества майнеров и титула\n` +
      `• Эффективность увеличивается с улучшениями\n` +
      `• Можно улучшать за Stars`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Статистика майнера показана пользователю ${user.id}`);
  } catch (error) {
    logError(error, `Показ статистики майнера для пользователя ${user.id}`);
  }
}
// ==================== ФУНКЦИЯ УЛУЧШЕНИЯ МАЙНЕРА ====================
async function upgradeMiner(ctx, user) {
  try {
    log(`⬆️ Попытка улучшения майнера для пользователя ${user.id}`);
    
    const miner = user.miner;
    const currentLevel = miner.level || 1;
    const currentEfficiency = miner.efficiency || 1;
    const upgradeCost = currentLevel * 100;
    
    // Проверяем, достаточно ли средств
    if (user.magnuStarsoins < upgradeCost) {
      log(`❌ Недостаточно средств для улучшения майнера пользователя ${user.id}`);
      await ctx.answerCbQuery('❌ Недостаточно Stars!');
      return;
    }
    
    // Обновляем майнер
    const newLevel = currentLevel + 1;
    const newEfficiency = currentEfficiency + 0.2;
    
    log(`💾 Обновление базы данных для пользователя ${user.id}`);
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $inc: { 
          magnuStarsoins: -upgradeCost,
          totalEarnedMagnuStarsoins: -upgradeCost
        },
        $set: { 
          'miner.level': newLevel,
          'miner.efficiency': newEfficiency,
          updatedAt: new Date()
        }
      }
    );
    
    log(`🗑️ Очистка кеша для пользователя ${user.id}`);
    userCache.delete(user.id);
    
    log(`✅ Майнер успешно улучшен для пользователя ${user.id}`);
    await ctx.answerCbQuery(`✅ Майнер улучшен! Новый уровень: ${newLevel}, эффективность: ${newEfficiency.toFixed(1)}x`);
    
    log(`🔄 Обновление меню майнера для пользователя ${user.id}`);
    // Возвращаемся к меню майнера
    const updatedUser = await getUser(ctx.from.id);
    if (updatedUser) {
      await showMinerMenu(ctx, updatedUser);
    }
  } catch (error) {
    logError(error, 'Улучшение майнера');
    await ctx.answerCbQuery('❌ Ошибка улучшения майнера');
  }
}

// ==================== СИСТЕМА СЕЗОНОВ МАЙНИНГА ====================

// Получение текущего сезона
function getCurrentMiningSeason() {
  const now = new Date();
  const startDate = config.MINING_SEASON_START_DATE;
  const seasonDuration = config.MINING_SEASON_DURATION;
  
  // Пропускаем субботу и воскресенье
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return null; // Выходные не считаются
  }
  
  const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
  const currentSeason = Math.floor(daysSinceStart / seasonDuration) + 1;
  
  return {
    season: currentSeason,
    dayInSeason: (daysSinceStart % seasonDuration) + 1,
    daysUntilNextSeason: seasonDuration - (daysSinceStart % seasonDuration),
    startDate: new Date(startDate.getTime() + (currentSeason - 1) * seasonDuration * 24 * 60 * 60 * 1000),
    endDate: new Date(startDate.getTime() + currentSeason * seasonDuration * 24 * 60 * 60 * 1000),
    multiplier: Math.pow(config.MINING_SEASON_MULTIPLIER, currentSeason - 1)
  };
}

// Получение лимитов сезона
function getSeasonLimits(season) {
  const baseStarsLimit = config.MINING_TOTAL_STARS;
  const multiplier = Math.pow(config.MINING_SEASON_MULTIPLIER, season - 1);
  
  return {
    magnuStarsoins: Math.floor(baseStarsLimit * multiplier),
    stars: Math.floor(baseStarsLimit * multiplier)
  };
}

// Получение статистики сезона
async function getSeasonStats(season) {
  const startDate = new Date(config.MINING_SEASON_START_DATE.getTime() + (season - 1) * config.MINING_SEASON_DURATION * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + config.MINING_SEASON_DURATION * 24 * 60 * 60 * 1000);
  
  const stats = await db.collection('miningSeasonStats').findOne({ season: season });
  
  if (!stats) {
    return {
      season: season,
      totalMinedStars: 0,
      activeMiners: 0,
      startDate: startDate,
      endDate: endDate
    };
  }
  
  return {
    ...stats,
    startDate: startDate,
    endDate: endDate
  };
}

// Обновление статистики сезона
async function updateSeasonStats(season, minedStars) {
  await db.collection('miningSeasonStats').updateOne(
    { season: season },
    { 
      $inc: { 
        totalMinedStars: minedStars
      },
      $set: { 
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );
}

// Проверка лимитов сезона
async function checkSeasonLimits(season, minedStars) {
  const limits = getSeasonLimits(season);
  const stats = await getSeasonStats(season);
  
  const canMineStars = stats.totalMinedStars + minedStars <= limits.stars;
  
  return {
    canMineStars,
    remainingStars: Math.max(0, limits.stars - stats.totalMinedStars)
  };
}

// Показ информации о сезоне майнинга
async function showMinerSeasonInfo(ctx, user) {
  try {
    log(`📅 Показ информации о сезоне майнинга для пользователя ${user.id}`);
    
    const currentSeason = getCurrentMiningSeason();
    
    if (!currentSeason) {
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад', 'miner')]
      ]);
      
      await ctx.editMessageText(
        `📅 *Информация о сезоне майнинга*\n\n` +
        `🌅 *Выходные*\n\n` +
        `⏸️ Майнинг приостановлен в выходные дни\n` +
        `📅 Суббота и воскресенье не считаются сезонными днями\n\n` +
        `🔄 Майнинг возобновится в понедельник`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        }
      );
      return;
    }
    
    const limits = getSeasonLimits(currentSeason.season);
    const stats = await getSeasonStats(currentSeason.season);
    const limitsCheck = await checkSeasonLimits(currentSeason.season, 0, 0);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'miner')]
    ]);
    
    const message = 
      `📅 *Информация о сезоне майнинга*\n\n` +
      `🎯 *Текущий сезон:* ${currentSeason.season}\n` +
      `📅 *День сезона:* ${currentSeason.dayInSeason}/${config.MINING_SEASON_DURATION}\n` +
      `⏰ *До следующего сезона:* ${currentSeason.daysUntilNextSeason} дней\n\n` +
      `📈 *Множитель сезона:* ${currentSeason.multiplier.toFixed(2)}x\n` +
      `📊 *Прогресс сезона:* ${((currentSeason.dayInSeason / config.MINING_SEASON_DURATION) * 100).toFixed(1)}%\n\n` +
      `💰 *Лимиты сезона:*\n` +
      `├ 🪙 Magnum Coins: ${formatNumber(limits.magnuStarsoins)}\n` +
      `└ ⭐ Stars: ${formatNumber(limits.stars)}\n\n` +
      `📊 *Статистика сезона:*\n` +
      `├ Добыто 🪙 Magnum Coins: ${formatNumber(stats.totalMinedMagnumCoins)} / ${formatNumber(limits.magnuStarsoins)}\n` +
      `├ Добыто ⭐ Stars: ${formatNumber(stats.totalMinedStars)} / ${formatNumber(limits.stars)}\n` +
      `├ Осталось 🪙 Magnum Coins: ${formatNumber(limitsCheck.remainingMagnumCoins)}\n` +
      `└ Осталось ⭐ Stars: ${formatNumber(limitsCheck.remainingStars)}\n\n` +
      `📅 *Даты сезона:*\n` +
      `├ Начало: ${currentSeason.startDate.toLocaleDateString('ru-RU')}\n` +
      `└ Конец: ${currentSeason.endDate.toLocaleDateString('ru-RU')}\n\n` +
      `💡 *Информация:*\n` +
      `├ Каждый сезон длится ${config.MINING_SEASON_DURATION} дней\n` +
      `├ Выходные не считаются сезонными днями\n` +
      `├ Множитель увеличивается на ${((config.MINING_SEASON_MULTIPLIER - 1) * 100).toFixed(0)}% каждый сезон\n` +
      `└ Лимиты также увеличиваются с каждым сезоном`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Информация о сезоне показана для пользователя ${user.id}`);
  } catch (error) {
    logError(error, `Показ информации о сезоне для пользователя ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка загрузки информации о сезоне');
  }
}

// ==================== НОВАЯ СИСТЕМА МАЙНИНГА ====================

// Функция для получения текущего сезона майнинга
function getCurrentMiningSeason() {
  const now = new Date();
  const seasonStart = new Date('2025-08-28T00:00:00Z'); // 28 августа 00:00 UTC
  
  const daysSinceStart = Math.floor((now - seasonStart) / (1000 * 60 * 60 * 24));
  const currentSeason = Math.floor(daysSinceStart / config.MINING_SEASON_DURATION) + 1;
  const dayInSeason = (daysSinceStart % config.MINING_SEASON_DURATION) + 1;
  
  const seasonStartDate = new Date(seasonStart);
  seasonStartDate.setDate(seasonStartDate.getDate() + (currentSeason - 1) * config.MINING_SEASON_DURATION);
  
  const seasonEndDate = new Date(seasonStartDate);
  seasonEndDate.setDate(seasonEndDate.getDate() + config.MINING_SEASON_DURATION);
  
  const daysUntilNextSeason = config.MINING_SEASON_DURATION - dayInSeason;
  
  const season = {
    season: currentSeason,
    dayInSeason: dayInSeason,
    daysUntilNextSeason: daysUntilNextSeason,
    startDate: seasonStartDate,
    endDate: seasonEndDate,
    multiplier: 1 + (currentSeason - 1) * 0.1, // Увеличиваем множитель на 10% каждый сезон
    isActive: true
  };
  
  console.log('📅 Текущий сезон майнинга:', {
    now: now.toISOString(),
    seasonStart: seasonStart.toISOString(),
    daysSinceStart,
    currentSeason: season.season,
    dayInSeason: season.dayInSeason,
    multiplier: season.multiplier,
    isActive: season.isActive
  });
  
  return season;
}

// Функция для инициализации новой системы майнинга у пользователя
function initializeNewMiningSystem(user) {
  if (!user.miners) {
    user.miners = [];
  }
  
  if (!user.miningStats) {
    user.miningStats = {
      totalMinedMagnumCoins: 0,
      totalMinedStars: 0,
      seasonMinedMagnumCoins: 0,
      seasonMinedStars: 0,
      lastReward: null,
      activeClickCount: 0,
      passiveRewards: 0
    };
  }
  
  if (!user.miningSeasonStats) {
    user.miningSeasonStats = {};
  }
  
  return user;
}

// Функция для расчета общей скорости майнинга пользователя
function calculateTotalMiningSpeed(user) {
  let totalSpeedStars = 0;
  
  if (user.miners && user.miners.length > 0) {
    for (const miner of user.miners) {
      const minerConfig = config.MINERS[miner.type];
      if (minerConfig) {
        const levelMultiplier = 1 + (miner.level - 1) * 0.2; // +20% за каждый уровень
        const minerSpeed = minerConfig.baseSpeed * levelMultiplier * miner.count;
        
        // Определяем валюту майнинга
        const miningCurrency = minerConfig.miningCurrency || 'stars';
        if (miningCurrency === 'stars') {
          totalSpeedStars += minerSpeed;
        } else {
          totalSpeedStars += minerSpeed;
        }
      }
    }
  }
  
  // Бонус от титула
  const titlesList = getTitlesList(user);
  const mainTitle = user.mainTitle || '🌱 Новичок';
  const currentTitle = titlesList.find(t => t.name === mainTitle);
  const titleBonus = currentTitle ? currentTitle.minerBonus : 1.0;
  
  return {
    magnuStarsoins: totalSpeedStars * titleBonus,
    stars: totalSpeedStars * titleBonus
  };
}

// Функция для начисления пассивных наград майнинга
async function processMiningRewards() {
  try {
    console.log('⛏️ Обработка пассивных наград майнинга...');
    
    const currentSeason = getCurrentMiningSeason();
    if (!currentSeason.isActive) {
      console.log('📅 Майнинг приостановлен - выходные');
      return;
    }
    
    const users = await db.collection('users').find({
      $or: [
        { 'miningStats.lastReward': { $exists: true } },
        { 'miners': { $exists: true, $ne: [] } }
      ]
    }).toArray();
    
    let processedCount = 0;
    
    for (const user of users) {
      try {
        const userWithMining = initializeNewMiningSystem(user);
        const totalSpeed = calculateTotalMiningSpeed(userWithMining);
        
        const totalSpeedSum = totalSpeed.stars;
        if (totalSpeedSum > 0) {
          const now = new Date();
          const lastReward = userWithMining.miningStats.lastReward || now;
          const timeDiff = (now - lastReward) / (1000 * 60); // в минутах
          
          if (timeDiff >= config.MINING_REWARD_INTERVAL) {
            const rewardStars = totalSpeed.stars * config.MINING_REWARD_INTERVAL * currentSeason.multiplier;
            const rewardMagnumCoins = totalSpeed.magnuStarsoins * config.MINING_REWARD_INTERVAL * currentSeason.multiplier;

            // Обновляем статистику
            await db.collection('users').updateOne(
              { id: userWithMining.id },
              {
                $inc: {
                  magnuStarsoins: rewardMagnumCoins,
                  stars: rewardStars,
                  'miningStats.totalMinedMagnumCoins': rewardMagnumCoins,
                  'miningStats.totalMinedStars': rewardStars,
                  'miningStats.seasonMinedMagnumCoins': rewardMagnumCoins,
                  'miningStats.seasonMinedStars': rewardStars,
                  'miningStats.passiveRewards': rewardStars
                },
                $set: {
                  'miningStats.lastReward': now
                }
              }
            );
            
            // Очищаем кеш пользователя
            userCache.delete(userWithMining.id);
            
            processedCount++;
          }
        }
      } catch (error) {
        console.error(`❌ Ошибка обработки наград для пользователя ${user.id}:`, error);
      }
    }
    
    console.log(`✅ Обработано ${processedCount} пользователей`);
  } catch (error) {
    console.error('❌ Ошибка обработки пассивных наград майнинга:', error);
  }
}

// Функция активного клика удалена

// Функция для покупки майнера
async function buyMiner(user, minerType) {
  try {
    const minerConfig = config.MINERS[minerType];
    if (!minerConfig) {
      return { success: false, message: '❌ Майнер не найден' };
    }
    
    const userWithMining = initializeNewMiningSystem(user);
    
    // Проверяем баланс
    const userBalance = userWithMining[minerConfig.currency];
    if (userBalance < minerConfig.price) {
      return { 
        success: false, 
        message: `❌ Недостаточно ${minerConfig.currency === 'magnuStarsoins' ? 'Magnum Coins' : 'Stars'}` 
      };
    }
    
    // Ищем существующий майнер этого типа
    const existingMiner = userWithMining.miners.find(m => m.type === minerType);
    const currentCount = existingMiner ? existingMiner.count : 0;
    
    // Проверяем лимит покупки (максимум 5 майнеров каждого типа)
    if (currentCount >= 5) {
      return { 
        success: false, 
        message: `❌ Вы достигли лимита покупки (5 майнеров ${minerConfig.name})` 
      };
    }
    
    if (existingMiner) {
      // Увеличиваем количество
      existingMiner.count++;
    } else {
      // Добавляем новый майнер
      userWithMining.miners.push({
        type: minerType,
        level: 1,
        count: 1
      });
    }
    
    // Списываем средства
    await db.collection('users').updateOne(
      { id: userWithMining.id },
      {
        $inc: {
          [minerConfig.currency]: -minerConfig.price
        },
        $set: {
          miners: userWithMining.miners
        }
      }
    );
    
    // Принудительно сохраняем пользователя
    const updatedUser = await db.collection('users').findOne({ id: userWithMining.id });
    if (updatedUser) {
      await forceSaveUser(updatedUser);
    }
    
    // Очищаем кеш пользователя
    userCache.delete(userWithMining.id);
    
    return { 
      success: true, 
      message: `✅ Куплен ${minerConfig.name} за ${minerConfig.price} ${minerConfig.currency === 'magnuStarsoins' ? 'Stars' : 'Stars'}!` 
    };
  } catch (error) {
    console.error('❌ Ошибка покупки майнера:', error);
    return { success: false, message: '❌ Ошибка покупки майнера' };
  }
}

// Функция для апгрейда майнера
async function upgradeMiner(user, minerType) {
  try {
    const userWithMining = initializeNewMiningSystem(user);
    const miner = userWithMining.miners.find(m => m.type === minerType);
    
    if (!miner) {
      return { success: false, message: '❌ Майнер не найден' };
    }
    
    const upgradeCost = miner.level * 50; // Стоимость апгрейда растет с уровнем
    
    if (userWithMining.magnuStarsoins < upgradeCost) {
      return { success: false, message: '❌ Недостаточно Stars для апгрейда' };
    }
    
    // Апгрейдим майнер
    await db.collection('users').updateOne(
      { id: userWithMining.id },
      {
        $inc: {
          magnuStarsoins: -upgradeCost,
          'miners.$.level': 1
        }
      },
      { arrayFilters: [{ 'miners.type': minerType }] }
    );
    
    // Принудительно сохраняем пользователя
    const updatedUser = await db.collection('users').findOne({ id: userWithMining.id });
    if (updatedUser) {
      await forceSaveUser(updatedUser);
    }
    
    // Очищаем кеш пользователя
    userCache.delete(userWithMining.id);
    
    return { 
      success: true, 
      message: `✅ Майнер ${config.MINERS[minerType].name} улучшен до уровня ${miner.level + 1}!` 
    };
  } catch (error) {
    console.error('❌ Ошибка апгрейда майнера:', error);
    return { success: false, message: '❌ Ошибка апгрейда майнера' };
  }
}

// Функции отображения новых меню майнинга
async function showMinerShop(ctx, user, minerIndex = 0) {
  try {
    const userWithMining = initializeNewMiningSystem(user);
    
    // Получаем список всех типов майнеров
    const minerTypes = Object.keys(config.MINERS);
    const currentMinerType = minerTypes[minerIndex];
    const minerConfig = config.MINERS[currentMinerType];
    
    if (!minerConfig) {
      await ctx.answerCbQuery('❌ Майнер не найден');
      return;
    }
    
    // Получаем статистику пользователя по этому майнеру
    const userMiner = userWithMining.miners.find(m => m.type === currentMinerType);
    const userCount = userMiner ? userMiner.count : 0;
    
    // Получаем общую статистику по серверу
    const serverStats = await getServerMinerStats();
    const serverCount = serverStats[currentMinerType] || 0;
    
    // Проверяем лимит покупки (максимум 5 майнеров каждого типа)
    const canBuy = userCount < 5;
    const remainingSlots = 5 - userCount;
    
    // Создаем клавиатуру с навигацией
    const keyboard = [];
    
    // Кнопки навигации
    const navRow = [];
    if (minerIndex > 0) {
      navRow.push(Markup.button.callback('⬅️ Предыдущий', `miner_shop_${minerIndex - 1}`));
    }
    if (minerIndex < minerTypes.length - 1) {
      navRow.push(Markup.button.callback('Следующий ➡️', `miner_shop_${minerIndex + 1}`));
    }
    if (navRow.length > 0) {
      keyboard.push(navRow);
    }
    
    // Кнопка покупки
    if (canBuy) {
      const currencySymbol = minerConfig.currency === 'magnuStarsoins' ? 'Stars' : '⭐';
      keyboard.push([
        Markup.button.callback(`🛒 Купить ${minerConfig.name} (${minerConfig.price} ${currencySymbol})`, `buy_miner_${currentMinerType}`)
      ]);
    } else {
      keyboard.push([
        Markup.button.callback('❌ Лимит достигнут (5/5)', 'miner_shop_limit')
      ]);
    }
    
    // Кнопка назад
    keyboard.push([Markup.button.callback('🔙 Назад', 'miner')]);
    
    // Формируем сообщение
    const miningCurrency = minerConfig.miningCurrency || 'magnuStarsoins';
    const currencySymbol = miningCurrency === 'stars' ? '⭐' : '🪙';
    const priceSymbol = minerConfig.currency === 'magnuStarsoins' ? '🪙' : '⭐';
    
    let message = `🛒 *Магазин майнеров*\n\n`;
    message += `💰 *Ваш баланс:*\n`;
    message += `├ 🪙 Magnum Coins: ${formatNumber(userWithMining.magnuStarsoins)}\n`;
    message += `└ ⭐ Stars: ${formatNumber(userWithMining.stars)}\n\n`;
    
    message += `📦 *${minerConfig.name}*\n`;
    message += `├ Скорость: ${formatNumber(minerConfig.baseSpeed)} ${currencySymbol}/мин\n`;
    message += `├ Редкость: ${getRarityEmoji(minerConfig.rarity)} ${minerConfig.rarity}\n`;
    message += `├ Цена: ${minerConfig.price} ${priceSymbol}\n`;
    message += `├ У вас: ${userCount}/5 шт.\n`;
    message += `├ Доступно слотов: ${remainingSlots}\n`;
    message += `├ Всего на сервере: ${serverCount} шт.\n`;
    message += `└ ${minerConfig.description}\n\n`;
    
    message += `📊 *Прогресс:* ${minerIndex + 1}/${minerTypes.length}\n\n`;
    
    if (canBuy) {
      message += `✅ Вы можете купить этот майнер\n`;
    } else {
      message += `❌ Вы достигли лимита покупки (5 майнеров)\n`;
    }
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup
    });
  } catch (error) {
    logError(error, 'Показ магазина майнеров');
    await ctx.answerCbQuery('❌ Ошибка загрузки магазина');
  }
}

async function showMinerUpgrades(ctx, user) {
  try {
    const userWithMining = initializeNewMiningSystem(user);
    
    let keyboardButtons = [
      [Markup.button.callback('🔙 Назад', 'miner')]
    ];
    
    let message = `⬆️ *Апгрейды майнеров*\n\n`;
    message += `💰 Ваш баланс: ${formatNumber(userWithMining.magnuStarsoins)} 🪙 Magnum Coins\n\n`;
    
    if (userWithMining.miners.length === 0) {
      message += `❌ У вас нет майнеров для апгрейда\n\n`;
      message += `🛒 Купите майнеров в магазине!`;
    } else {
      message += `📦 *Ваши майнеры:*\n\n`;
      
      for (const miner of userWithMining.miners) {
        const minerConfig = config.MINERS[miner.type];
        if (minerConfig) {
          const currentSpeed = minerConfig.baseSpeed * (1 + (miner.level - 1) * 0.2);
          const nextLevelSpeed = minerConfig.baseSpeed * (1 + miner.level * 0.2);
          const upgradeCost = miner.level * 50;
          const miningCurrency = minerConfig.miningCurrency || 'magnuStarsoins';
          const currencySymbol = miningCurrency === 'stars' ? '⭐' : '🪙';
          
          message += `🔸 *${minerConfig.name}*\n`;
          message += `├ Уровень: ${miner.level}\n`;
          message += `├ Количество: ${miner.count} шт.\n`;
          message += `├ Текущая скорость: ${formatNumber(currentSpeed)} ${currencySymbol}/мин\n`;
          message += `├ Скорость после апгрейда: ${formatNumber(nextLevelSpeed)} ${currencySymbol}/мин\n`;
          message += `├ Стоимость апгрейда: ${upgradeCost} Stars\n`;
          
          if (userWithMining.magnuStarsoins >= upgradeCost) {
            message += `└ [Улучшить](buy_miner_${miner.type})\n\n`;
            keyboardButtons.unshift([
              Markup.button.callback(`⬆️ ${minerConfig.name} (${upgradeCost} Stars)`, `upgrade_miner_${miner.type}`)
            ]);
          } else {
            message += `└ ❌ Недостаточно средств\n\n`;
          }
        }
      }
    }
    
    message += `💡 *Информация об апгрейдах:*\n`;
    message += `├ Каждый уровень +20% к скорости\n`;
    message += `├ Стоимость растет с уровнем\n`;
    message += `└ Апгрейд применяется ко всем майнерам этого типа`;
    
    const keyboard = Markup.inlineKeyboard(keyboardButtons);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ апгрейдов майнеров');
    await ctx.answerCbQuery('❌ Ошибка загрузки апгрейдов');
  }
}

async function showMinerLeaderboard(ctx, user) {
  try {
    const currentSeason = getCurrentMiningSeason();
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🏆 Общий рейтинг', 'miner_leaderboard_total'),
        Markup.button.callback('📅 Сезонный рейтинг', 'miner_leaderboard_season')
      ],
      [Markup.button.callback('🔙 Назад', 'miner')]
    ]);
    
    let message = `🏆 *Рейтинг майнинга*\n\n`;
    message += `📅 Текущий сезон: ${currentSeason.season}\n`;
    message += `📊 День сезона: ${currentSeason.dayInSeason}/${config.MINING_SEASON_DURATION}\n\n`;
    
    // Получаем топ-10 игроков по общему майнингу
    const topTotal = await db.collection('users')
      .find({ 'miningStats.totalMinedStars': { $exists: true } })
      .sort({ 'miningStats.totalMinedStars': -1 })
      .limit(10)
      .toArray();
    
    // Получаем топ-10 игроков по сезонному майнингу
    const topSeason = await db.collection('users')
      .find({ 'miningStats.seasonMinedStars': { $exists: true } })
      .sort({ 'miningStats.seasonMinedStars': -1 })
      .limit(10)
      .toArray();
    
    message += `🥇 *Топ-5 общего рейтинга:*\n`;
    for (let i = 0; i < Math.min(5, topTotal.length); i++) {
      const player = topTotal[i];
      const position = i + 1;
      const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
      message += `${emoji} ${player.firstName || 'Неизвестно'}: ${formatNumber(player.miningStats?.totalMinedStars || 0)} Stars\n`;
    }
    
    message += `\n📅 *Топ-5 сезона ${currentSeason.season}:*\n`;
    for (let i = 0; i < Math.min(5, topSeason.length); i++) {
      const player = topSeason[i];
      const position = i + 1;
      const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
      message += `${emoji} ${player.firstName || 'Неизвестно'}: ${formatNumber(player.miningStats?.seasonMinedStars || 0)} Stars\n`;
    }
    
    message += `\n💡 *Награды за сезон:*\n`;
    message += `├ 🥇 1 место: ${formatNumber(config.SEASON_REWARDS.top1.magnuStarsoins)} Stars + ${config.SEASON_REWARDS.top1.stars} ⭐\n`;
    message += `├ 🥈 2-3 место: ${formatNumber(config.SEASON_REWARDS.top3.magnuStarsoins)} Stars + ${config.SEASON_REWARDS.top3.stars} ⭐\n`;
    message += `└ 🥉 4-10 место: ${formatNumber(config.SEASON_REWARDS.top10.magnuStarsoins)} Stars + ${config.SEASON_REWARDS.top10.stars} ⭐`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ рейтинга майнинга');
    await ctx.answerCbQuery('❌ Ошибка загрузки рейтинга');
  }
}

// Функция для отображения общего рейтинга
async function showMinerLeaderboardTotal(ctx, user) {
  try {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к рейтингу', 'miner_leaderboard')]
    ]);
    
    // Получаем топ-20 игроков по общему майнингу
    const topTotal = await db.collection('users')
      .find({ 'miningStats.totalMinedStars': { $exists: true } })
      .sort({ 'miningStats.totalMinedStars': -1 })
      .limit(20)
      .toArray();
    
    let message = `🏆 *Общий рейтинг майнинга*\n\n`;
    
    for (let i = 0; i < topTotal.length; i++) {
      const player = topTotal[i];
      const position = i + 1;
      const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
      const totalStars = player.miningStats?.totalMinedStars || 0;
      message += `${emoji} ${position}. ${player.firstName || 'Неизвестно'}\n`;
      message += `   💎 ${formatNumber(totalStars)} Stars | ⭐ ${formatNumber(totalStars)} Stars\n`;
    }
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ общего рейтинга майнинга');
    await ctx.answerCbQuery('❌ Ошибка загрузки рейтинга');
  }
}

// Функция для отображения сезонного рейтинга
async function showMinerLeaderboardSeason(ctx, user) {
  try {
    const currentSeason = getCurrentMiningSeason();
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к рейтингу', 'miner_leaderboard')]
    ]);
    
    // Получаем топ-20 игроков по сезонному майнингу
    const topSeason = await db.collection('users')
      .find({ 'miningStats.seasonMinedStars': { $exists: true } })
      .sort({ 'miningStats.seasonMinedStars': -1 })
      .limit(20)
      .toArray();
    
    let message = `📅 *Сезонный рейтинг - Сезон ${currentSeason.season}*\n\n`;
    message += `📊 День сезона: ${currentSeason.dayInSeason}/${config.MINING_SEASON_DURATION}\n\n`;
    
    for (let i = 0; i < topSeason.length; i++) {
      const player = topSeason[i];
      const position = i + 1;
      const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
      const seasonStars = player.miningStats?.seasonMinedStars || 0;
      message += `${emoji} ${position}. ${player.firstName || 'Неизвестно'}\n`;
      message += `   💎 ${formatNumber(seasonStars)} Stars | ⭐ ${formatNumber(seasonStars)} Stars\n`;
    }
    
    message += `\n💡 *Награды за сезон:*\n`;
    message += `├ 🥇 1 место: ${formatNumber(config.SEASON_REWARDS.top1.magnuStarsoins)} Stars + ${config.SEASON_REWARDS.top1.stars} ⭐\n`;
    message += `├ 🥈 2-3 место: ${formatNumber(config.SEASON_REWARDS.top3.magnuStarsoins)} Stars + ${config.SEASON_REWARDS.top3.stars} ⭐\n`;
    message += `└ 🥉 4-10 место: ${formatNumber(config.SEASON_REWARDS.top10.magnuStarsoins)} Stars + ${config.SEASON_REWARDS.top10.stars} ⭐`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ сезонного рейтинга майнинга');
    await ctx.answerCbQuery('❌ Ошибка загрузки рейтинга');
  }
}

// Вспомогательная функция для получения эмодзи редкости
function getRarityEmoji(rarity) {
  switch (rarity) {
    case 'common': return '⚪';
    case 'rare': return '🔵';
    case 'epic': return '🟣';
    case 'legendary': return '🟡';
    default: return '⚪';
  }
}

// ==================== ВЫВОД СРЕДСТВ ====================
async function showWithdrawalMenu(ctx, user) {
  const withdrawal = user.withdrawal || { withdrawalCount: 0, totalWithdrawn: 0 };
  
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Вывести Stars', 'withdrawal_Stars'),
      Markup.button.callback('⭐ Вывести Stars', 'withdrawal_stars')
    ],
    [
      Markup.button.callback('📊 Статистика выводов', 'withdrawal_stats'),
      Markup.button.callback('📋 История выводов', 'withdrawal_history')
    ],
    [Markup.button.callback('🔙 Назад', 'main_menu')]
  ]);
  
  const message = 
    `💰 *Вывод средств*\n\n` +
    `💎 *Доступно для вывода:*\n` +
    `├ 🪙 Magnum Coins: ${formatNumber(user.magnuStarsoins)}\n` +
    `└ ⭐ Stars: ${formatNumber(user.stars)}\n\n` +
    `📊 *Статистика выводов:*\n` +
    `├ Всего выводов: ${withdrawal.withdrawalCount}\n` +
    `├ Всего выведено MC: ${formatNumber(withdrawal.totalWithdrawn || 0)}\n` +
    `└ Всего выведено Stars: ${formatNumber(withdrawal.totalWithdrawnStars || 0)}\n\n` +
    `💡 *Информация:*\n` +
    `├ 🚧 Вывод Stars: в разработке\n` +
          `├ Минимальная сумма Stars: 50 Stars\n` +
    `├ Комиссия: 5%\n` +
    `└ Обработка: до 24 часов\n\n` +
    `🎯 Выберите действие:`;
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
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
  
  // Получаем информацию о текущем сезоне
  const currentSeason = getCurrentMiningSeason();
  const seasonInfo = currentSeason ? 
    `\n📅 *Сезон ${currentSeason.season}* (День ${currentSeason.dayInSeason}/${config.MINING_SEASON_DURATION})\n` +
    `📈 *Множитель сезона:* ${currentSeason.multiplier.toFixed(2)}x\n` +
    `⏰ *До следующего сезона:* ${currentSeason.daysUntilNextSeason} дней` :
    `\n📅 *Выходные* - майнинг приостановлен`;
  
  // Рассчитываем текущую награду с учетом сезона
  const baseReward = await calculateMinerReward(efficiency, user);
  const seasonMultiplier = currentSeason ? currentSeason.multiplier : 0;
  const currentReward = baseReward * seasonMultiplier;
  const rewardPerMinute = currentReward;
  const rewardPerHour = currentReward * 60;
  
  let statusText = isActive ? '🟢 Активен' : '🔴 Неактивен';
  let lastRewardText = '';
  
  if (miner.lastReward) {
    const timeSince = Math.floor((Date.now() - miner.lastReward.getTime()) / 1000);
    if (timeSince < 60) {
      const remaining = 60 - timeSince;
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
      Markup.button.callback('⬆️ Улучшить майнер', 'upgrade_miner')
    ],
    [Markup.button.callback('🔙 Назад', 'main_menu')]
  ]);
  
  // Получаем информацию о титуле
  const titlesList = getTitlesList(user);
  const mainTitle = user.mainTitle || '🌱 Новичок';
  const currentTitle = titlesList.find(t => t.name === mainTitle);
  const titleBonus = currentTitle ? currentTitle.minerBonus : 1.0;
  const titleBonusText = titleBonus > 1.0 ? ` (+${((titleBonus - 1) * 100).toFixed(0)}%)` : '';

  const message = 
    `⛏️ *Майнер*\n\n` +
    `📊 *Статус:* ${statusText}\n` +
    `📈 *Уровень:* ${miner.level || 1}\n` +
    `⚡ *Эффективность:* ${efficiency}x\n` +
    `👑 *Титул:* ${mainTitle}${titleBonusText}\n` +
    `💰 *Награда/минуту:*\n` +
    `├ 🪙 Magnum Coins: ${formatNumber(rewardPerMinute)} MC/мин\n` +
    `└ ⭐ Stars: ${formatNumber(rewardPerMinute)} Stars/мин\n` +
    `💰 *Награда/час:*\n` +
    `├ 🪙 Magnum Coins: ${formatNumber(rewardPerHour)} MC/час\n` +
    `└ ⭐ Stars: ${formatNumber(rewardPerHour)} Stars/час\n` +
    `💎 *Всего добыто:*\n` +
    `├ 🪙 Magnum Coins: ${formatNumber(miner.totalMined || 0)} MC\n` +
    `└ ⭐ Stars: ${formatNumber(miner.totalMined || 0)} Stars${lastRewardText}\n\n` +
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

  
  

// Функция для запуска обратного отсчета бонуса
function startBonusCountdown(ctx, user, remainingSeconds) {
  const countdownKey = `bonus_countdown_${user.id}`;
  
  // Очищаем предыдущий таймер, если он существует
  if (global[countdownKey]) {
    clearInterval(global[countdownKey]);
  }
  
  let secondsLeft = remainingSeconds;
  
  const updateCountdown = async () => {
    try {
      if (secondsLeft <= 0) {
        // Кулдаун истек, обновляем меню и останавливаем таймер
        clearInterval(global[countdownKey]);
        delete global[countdownKey];
        
        const updatedUser = await getUser(ctx.from.id);
        if (updatedUser) {
          await updateBonusMenu(ctx, updatedUser);
          log(`🔄 Обратный отсчет бонуса завершен для пользователя ${user.id}`);
        }
        return;
      }
      // Обновляем меню с текущим временем
      const updatedUser = await getUser(ctx.from.id);
      if (updatedUser) {
        const bonus = updatedUser.dailyBonus;
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
              canClaim ? '🎁 Получить бонус' : `⏳ ${formatTime(Math.floor(secondsLeft / 1000))}`,
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
          `💰 *Базовая награда:* ${formatNumber(baseReward)} 🪙 Magnum Coins\n` +
          `🔥 *Бонус серии:* +${formatNumber(streakBonus)} 🪙 Magnum Coins\n` +
          `💎 *Итого награда:* ${formatNumber(totalReward)} 🪙 Magnum Coins\n` +
          `🔥 *Текущая серия:* ${bonus.streak} дней\n` +
          `📊 *Всего получено:* ${bonus.totalClaimed || 0} бонусов\n` +
          `💎 *Всего заработано:* ${formatNumber(bonus.totalEarned || 0)} 🪙 Magnum Coins\n\n` +
          `🎯 Выберите действие:`;
        
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
      }
      
      secondsLeft--;
    } catch (error) {
      logError(error, 'Обратный отсчет бонуса');
      clearInterval(global[countdownKey]);
      delete global[countdownKey];
    }
  };
  
  // Запускаем обновление каждые 5 секунд для снижения нагрузки
  global[countdownKey] = setInterval(updateCountdown, 5000);
  
  // Сразу запускаем первое обновление
  updateCountdown();
  
  log(`⏰ Запущен обратный отсчет бонуса для пользователя ${user.id}, осталось: ${remainingSeconds}с`);
}

// ==================== АДМИН ТИТУЛЫ ====================
async function showAdminRanksMenu(ctx, user) {
  try {
    log(`⭐ Показ управления рангами для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('⭐ Выдать ранг', 'admin_give_rank')
      ],
      [
        Markup.button.callback('📊 Статистика рангов', 'admin_ranks_stats')
      ],
      [
        Markup.button.callback('🔙 Назад', 'admin')
      ]
    ]);
    
    const message = 
      `⭐ *Управление рангами*\n\n` +
      `Здесь вы можете управлять рангами пользователей.\n\n` +
      `📋 *Доступные функции:*\n` +
      `├ ⭐ Выдать ранг - установить уровень пользователя\n` +
      `└ 📊 Статистика рангов - просмотр распределения рангов\n\n` +
      `📋 *Система рангов:*\n` +
      `├ 1-4: 🌱 Новичок\n` +
      `├ 5-9: ⚔️ Боец\n` +
      `├ 10-19: 🏹 Лучник\n` +
      `├ 20-34: 🛡️ Рыцарь\n` +
      `├ 35-49: ⚔️ Воин\n` +
      `├ 50-74: 🦸 Герой\n` +
      `├ 75-99: 🏆 Легенда\n` +
      `└ 100+: 👑 Император\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Меню управления рангами показано для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ управления рангами для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа управления рангами');
  }
}
async function showAdminTitles(ctx, user) {
  try {
    log(`👑 Показ управления титулами для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Выдать титул', 'admin_give_title'),
        Markup.button.callback('➖ Забрать титул', 'admin_remove_title')
      ],
      [
        Markup.button.callback('📊 Статистика титулов', 'admin_titles_stats'),
        Markup.button.callback('🔄 Синхронизация титулов', 'admin_sync_titles')
      ],
      [Markup.button.callback('🔙 Назад', 'admin')]
    ]);
    
    const message = 
      `👑 *Управление титулами*\n\n` +
      `Здесь вы можете управлять титулами пользователей\n\n` +
      `🎯 *Доступные действия:*\n` +
      `├ ➕ Выдать титул - добавить титул пользователю\n` +
      `├ ➖ Забрать титул - убрать титул у пользователя\n` +
      `├ 📊 Статистика титулов - общая статистика\n` +
      `└ 🔄 Синхронизация титулов - обновить титулы\n\n` +
      `Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Меню управления титулами показано для админа ${user.id}`);
  } catch (error) {
    if (error.message && error.message.includes('message is not modified')) {
      // Игнорируем эту ошибку - сообщение уже актуально
      log(`ℹ️ Сообщение управления титулами уже актуально для админа ${user.id}`);
    } else {
      logError(error, 'Показ управления титулами');
      await ctx.answerCbQuery('❌ Ошибка показа управления титулами');
    }
  }
}

// ==================== АДМИН ПОСТЫ ====================
async function showAdminPosts(ctx, user) {
  try {
    log(`📝 Показ управления постами для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📝 Создать пост с кнопкой', 'admin_create_post_with_button'),
        Markup.button.callback('📝 Создать пост без кнопки', 'admin_create_post_no_button')
      ],
      [
        Markup.button.callback('📊 Статистика постов', 'admin_posts_stats')
      ],
      [
        Markup.button.callback('🔙 Назад', 'admin')
      ]
    ]);
    
    const message = 
      `📝 *Управление постами*\n\n` +
      `Здесь вы можете создавать посты в канал @magnumtap\n\n` +
      `🎯 *Доступные действия:*\n` +
      `├ 📝 Создать пост с кнопкой\n` +
      `├ 📝 Создать пост без кнопки\n` +
      `└ 📊 Статистика постов\n\n` +
      `Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ управления постами');
  }
}
// Функция для выдачи титула пользователю
async function handleAdminGiveTitle(ctx, user, text) {
  try {
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply('❌ Формат: ID_пользователя Название_титула\n\nПример: 123456789 🌱 Новичок');
      return;
    }
    
    const userId = parseInt(parts[0]);
    const titleName = parts.slice(1).join(' ');
    
    if (isNaN(userId)) {
      await ctx.reply('❌ Неверный ID пользователя');
      return;
    }
    
    // Получаем пользователя
    const targetUser = await getUser(userId);
    if (!targetUser) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }
    
    // Проверяем, есть ли уже такой титул
    const userTitles = targetUser.titles || [];
    if (userTitles.includes(titleName)) {
      await ctx.reply(`❌ У пользователя ${targetUser.firstName || targetUser.username || userId} уже есть титул ${titleName}`);
      return;
    }
    
    // Добавляем титул
    await db.collection('users').updateOne(
      { id: userId },
      { 
        $addToSet: { titles: titleName },
        $set: { updatedAt: new Date() }
      }
    );
    
    // Очищаем кеш
    userCache.delete(userId);
    
    await ctx.reply(`✅ Титул ${titleName} выдан пользователю ${targetUser.firstName || targetUser.username || userId}`);
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
    // Очищаем кеш админа
    userCache.delete(user.id);
    
  } catch (error) {
    logError(error, 'Выдача титула админом');
    await ctx.reply('❌ Ошибка выдачи титула');
  }
}
// Функция для забора титула у пользователя
async function handleAdminRemoveTitle(ctx, user, text) {
  try {
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply('❌ Формат: ID_пользователя Название_титула\n\nПример: 123456789 🌱 Новичок');
      return;
    }
    
    const userId = parseInt(parts[0]);
    const titleName = parts.slice(1).join(' ');
    
    if (isNaN(userId)) {
      await ctx.reply('❌ Неверный ID пользователя');
      return;
    }
    
    // Получаем пользователя
    const targetUser = await getUser(userId);
    if (!targetUser) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }
    
    // Проверяем, есть ли такой титул
    const userTitles = targetUser.titles || [];
    if (!userTitles.includes(titleName)) {
      await ctx.reply(`❌ У пользователя ${targetUser.firstName || targetUser.username || userId} нет титула ${titleName}`);
      return;
    }
    
    // Убираем титул
    await db.collection('users').updateOne(
      { id: userId },
      { 
        $pull: { titles: titleName },
        $set: { updatedAt: new Date() }
      }
    );
    
    // Если это был главный титул, устанавливаем дефолтный
    if (targetUser.mainTitle === titleName) {
      await db.collection('users').updateOne(
        { id: userId },
        { 
          $set: { mainTitle: '🌱 Новичок', updatedAt: new Date() }
        }
      );
    }
    
    // Очищаем кеш
    userCache.delete(userId);
    
    await ctx.reply(`✅ Титул ${titleName} забран у пользователя ${targetUser.firstName || targetUser.username || userId}`);
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
    // Очищаем кеш админа
    userCache.delete(user.id);
    
  } catch (error) {
    logError(error, 'Забор титула админом');
    await ctx.reply('❌ Ошибка забора титула');
  }
}

// ==================== АДМИН ПРОМОКОДЫ ====================
async function showAdminPromocodes(ctx, user) {
  try {
    log(`🎫 Показ управления промокодами для админа ${user.id}`);
    
    // Получаем статистику промокодов
    const promocodes = await db.collection('promocodes').find({}).toArray();
    const totalPromocodes = promocodes.length;
    const activePromocodes = promocodes.filter(p => p.activations > 0).length;
    const totalActivations = promocodes.reduce((sum, p) => sum + (p.totalActivations || 0), 0);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔑 Создать ключ', 'admin_create_promocode')
      ],
      [
        Markup.button.callback('📊 Статистика ключей', 'admin_promocodes_stats')
      ],
      [
        Markup.button.callback('🔙 Назад', 'admin')
      ]
    ]);
    
    const message = 
      `🔑 *Управление ключами*\n\n` +
      `Здесь вы можете создавать и управлять ключами\n\n` +
      `📊 *Статистика:*\n` +
      `├ Всего ключей: \`${totalPromocodes}\`\n` +
      `├ Активных ключей: \`${activePromocodes}\`\n` +
      `└ Всего активаций: \`${totalActivations}\`\n\n` +
      `🎯 *Доступные действия:*\n` +
      `├ 🔑 Создать ключ\n` +
      `└ 📊 Статистика ключей\n\n` +
      `Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ управления промокодами');
  }
}
// ==================== ПРОМОКОДЫ ====================
async function showPromocodeMenu(ctx, user) {
  try {
    log(`🎫 Показ меню промокодов для пользователя ${user.id}`);
    
    // Получаем статистику промокодов пользователя
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dailyPromocodes = user.dailyPromocodes || [];
    const todayPromocodes = dailyPromocodes.filter(p => {
      const promoDate = new Date(p.date);
      return promoDate >= today && promoDate < tomorrow;
    });
    
    const usedToday = todayPromocodes.length;
    const remainingToday = Math.max(0, 10 - usedToday);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔑 Активировать ключ', 'enter_promocode')
      ],
      [
        Markup.button.callback('📊 История активаций', 'promocode_history')
      ],
      [
        Markup.button.callback('🔙 Назад', 'main_menu')
      ]
    ]);
    
    const message = 
      `🔑 *Ключи*\n\n` +
      `Введите ключ и получите ценные награды!\n` +
      `Каждый ключ открывает сундук случайного уровня:\n` +
      `• 🟢 Обычные — 🪙 Magnum Coins, ⭐ Stars\n` +
      `• 🔵 Редкие — Майнеры, бустеры к майнингу\n` +
      `• 🟣 Эпические — Уникальные титулы, повышенные множители\n` +
      `• 🟡 Легендарные — Эксклюзивные наборы (Coins + Stars + Майнеры + Титул)\n\n` +
      `⚡️ *Ограничение:*\n` +
      `Вы можете ввести до 10 ключей в день.\n` +
      `📊 Использовано сегодня: ${usedToday}/10\n` +
      `🎯 Осталось: ${remainingToday}\n\n` +
      `🎯 *Доступные действия:*\n` +
      `├ 🔑 Активировать ключ\n` +
      `└ 📊 История активаций\n\n` +
      `Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ меню промокодов');
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
    `💰 *Базовая награда:* ${formatNumber(baseReward)} 🪙 Magnum Coins\n` +
    `🔥 *Бонус серии:* +${formatNumber(streakBonus)} 🪙 Magnum Coins\n` +
    `💎 *Итого награда:* ${formatNumber(totalReward)} 🪙 Magnum Coins\n` +
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
    `💰 *Базовая награда:* ${formatNumber(baseReward)} 🪙 Magnum Coins\n` +
    `🔥 *Бонус серии:* +${formatNumber(streakBonus)} 🪙 Magnum Coins\n` +
    `💎 *Итого награда:* ${formatNumber(totalReward)} 🪙 Magnum Coins\n` +
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
      
      // Запускаем периодическое обновление меню с обратным отсчетом
      startBonusCountdown(ctx, user, Math.floor(remaining / 1000));
      
      return;
    }
    }
    
    const baseReward = config.DAILY_BONUS_BASE;
    const streakBonus = Math.min(bonus.streak * 0.5, 5);
    const totalReward = baseReward + streakBonus;
    
    log(`💰 Расчет бонуса: базовая ${baseReward}, серия ${bonus.streak}, бонус серии ${streakBonus}, итого ${totalReward} Magnum Coins`);
    
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
    
    // Проверяем и обновляем уровень пользователя
    const updatedUser = await getUser(user.id);
    if (updatedUser) {
      const levelResult = await checkAndUpdateLevel(updatedUser);
      if (levelResult.levelUp) {
        log(`🎉 Пользователь ${user.id} повысил уровень до ${levelResult.newLevel}!`);
      }
    }
    
    // Обновляем прогресс ежедневного задания "Бонус дня"
    await updateDailyTaskProgress(user, 'daily_bonus', 1);
    
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
      `├ Всего заработано: \`${formatNumber(totalEarned)}\` 🪙 Magnum Coins\n` +
      `├ Средняя награда: \`${formatNumber(averageReward)}\` 🪙 Magnum Coins\n` +
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
        Markup.button.callback('📝 Управление постами', 'admin_posts'),
        Markup.button.callback('🔑 Управление ключами', 'admin_promocodes')
      ],
      [
        Markup.button.callback('👑 Управление титулами', 'admin_titles'),
        Markup.button.callback('⭐ Управление рангами', 'admin_ranks')
      ],
      [
        Markup.button.callback('📢 Рассылка', 'admin_broadcast')
      ],
      [
        Markup.button.callback('🗳️ Управление голосованием', 'admin_voting'),
        Markup.button.callback('🔄 Обновление кеша', 'admin_cache')
      ],
      [
        Markup.button.callback('🏦 Управление резервом', 'admin_reserve'),
        Markup.button.callback('🔍 Отладка рангов', 'admin_debug_ranks')
      ],
      [
        Markup.button.callback('💸 Комиссия обмена', 'admin_exchange_commission'),
        Markup.button.callback('💰 Комиссия вывода', 'admin_withdrawal_commission')
      ],
      [
        Markup.button.callback('🗑️ Сброс базы данных', 'admin_reset_db')
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
      `├ 📝 Управление постами - создание постов в канал\n` +
      `├ 🎫 Управление промокодами - создание промокодов\n` +
      `├ 👑 Управление титулами - выдача и забор титулов\n` +
      `├ ⭐ Управление рангами - выдача и изменение рангов\n` +
      `├ 📢 Рассылка - отправка сообщений\n` +
      `├ 🗳️ Управление голосованием - создание и управление голосованиями\n` +
      `├ 🔄 Обновление кеша - очистка кеша\n` +
      `├ 🏦 Управление резервом - управление резервом биржи\n` +
      `└ 🗑️ Сброс базы данных - полная очистка всех данных\n\n` +
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
    const totalMagnuStarsoins = await db.collection('users').aggregate([
      { $group: { _id: null, total: { $sum: '$magnuStarsoins' } } }
    ]).toArray();
    
    const totalStars = await db.collection('users').aggregate([
      { $group: { _id: null, total: { $sum: '$stars' } } }
    ]).toArray();
    
    const totalMagnum = totalMagnuStarsoins.length > 0 ? totalMagnuStarsoins[0].total : 0;
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
      `├ Всего Stars: \`${formatNumber(totalMagnum)}\`\n` +
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
        Markup.button.callback('➕ Добавить Stars', 'admin_add_magnum'),
        Markup.button.callback('➖ Убрать Stars', 'admin_remove_magnum')
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
      `├ ➕ Добавить Stars - пополнить баланс\n` +
      `├ ➖ Убрать Stars - списать средства\n` +
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
// ==================== УПРАВЛЕНИЕ РЕЗЕРВОМ ====================
async function showAdminReserve(ctx, user) {
  try {
    log(`🏦 Показ управления резервом для админа ${user.id}`);
    
    // Получаем текущий резерв
    const reserve = await db.collection('reserve').findOne({ currency: 'main' });
    const magnuStarsoinsReserve = reserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS;
    const starsReserve = reserve?.stars || config.INITIAL_RESERVE_STARS;
    
    // Получаем текущий курс обмена
    const exchangeRate = await calculateExchangeRate();
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Добавить MC', 'admin_reserve_add_Stars'),
        Markup.button.callback('➖ Убрать MC', 'admin_reserve_remove_Stars')
      ],
      [
        Markup.button.callback('➕ Добавить Stars', 'admin_reserve_add_stars'),
        Markup.button.callback('➖ Убрать Stars', 'admin_reserve_remove_stars')
      ],
      [
        Markup.button.callback('🔄 Обновить курс', 'admin_reserve_update_rate'),
        Markup.button.callback('📊 Детали курса', 'admin_reserve_rate_details')
      ],
      [Markup.button.callback('🔙 Назад', 'admin')]
    ]);
    
    const message = 
      `🏦 *Управление резервом биржи*\n\n` +
      `💰 *Текущий резерв:*\n` +
      `├ 🪙 Magnum Coins: \`${formatNumber(magnuStarsoinsReserve)}\`\n` +
      `└ ⭐ Stars: \`${formatNumber(starsReserve)}\`\n\n` +
      `💱 *Текущий курс обмена:*\n` +
      `├ 1 Magnum Coin = ${exchangeRate.toFixed(6)} Stars\n` +
      `├ 100 Stars = ${(100 * exchangeRate).toFixed(4)} Magnum Coins\n` +
      `└ Соотношение резервов: ${(magnuStarsoinsReserve / starsReserve).toFixed(4)}\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Управление резервом показано для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ управления резервом для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа управления резервом');
  }
}

// ==================== УПРАВЛЕНИЕ ГОЛОСОВАНИЕМ ====================
async function showAdminVoting(ctx, user) {
  try {
    log(`🗳️ Показ управления голосованием для админа ${user.id}`);
    
    // Получаем активные голосования
    const activeVotings = await db.collection('votings').find({ 
      isActive: true 
    }).toArray();
    
    // Получаем статистику голосований
    const totalVotings = await db.collection('votings').countDocuments();
    const totalVotes = await db.collection('votes').countDocuments();
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Создать голосование', 'admin_voting_create'),
        Markup.button.callback('📊 Активные голосования', 'admin_voting_active')
      ],
      [
        Markup.button.callback('📈 Статистика голосований', 'admin_voting_stats'),
        Markup.button.callback('⚙️ Настройки голосования', 'admin_voting_settings')
      ],
      [
        Markup.button.callback('🗑️ Удалить голосование', 'admin_voting_delete'),
        Markup.button.callback('📋 История голосований', 'admin_voting_history')
      ],
      [Markup.button.callback('🔙 Назад', 'admin')]
    ]);
    
    const message = 
      `🗳️ *Управление голосованием*\n\n` +
      `📊 *Статистика:*\n` +
      `├ Всего голосований: \`${totalVotings}\`\n` +
      `├ Активных голосований: \`${activeVotings.length}\`\n` +
      `└ Всего голосов: \`${totalVotes}\`\n\n` +
      `🔧 *Доступные действия:*\n` +
      `├ ➕ Создать голосование - новое голосование\n` +
      `├ 📊 Активные голосования - управление\n` +
      `├ 📈 Статистика голосований - аналитика\n` +
      `├ ⚙️ Настройки голосования - конфигурация\n` +
      `├ 🗑️ Удалить голосование - удаление\n` +
      `└ 📋 История голосований - архив\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Управление голосованием показано для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ управления голосованием для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа управления голосованием');
  }
}
// ==================== ДЕТАЛЬНЫЕ ФУНКЦИИ ГОЛОСОВАНИЯ ====================
async function showAdminVotingCreate(ctx, user) {
  try {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_voting')]
    ]);
    
    const message = 
      `➕ *Создание нового голосования*\n\n` +
      `📝 *Формат создания:*\n` +
      `├ Название: "Название голосования"\n` +
      `├ Описание: "Подробное описание"\n` +
      `├ Варианты: "Вариант 1|Вариант 2|Вариант 3"\n` +
      `├ Длительность: "7" (в днях)\n` +
      `└ Тип: "public" или "private"\n\n` +
      `💡 *Пример:*\n` +
      `Название: "Выбор новой функции"\n` +
      `Описание: "Выберите какую функцию добавить в бота"\n` +
      `Варианты: "Система гильдий|PvP система|Мини-игры"\n` +
      `Длительность: "7"\n` +
      `Тип: "public"\n\n` +
      `🎯 Отправьте данные в указанном формате:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    // Устанавливаем состояние для создания голосования
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'creating_voting', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
  } catch (error) {
    logError(error, 'Создание голосования');
  }
}

async function showAdminVotingActive(ctx, user) {
  try {
    // Получаем активные голосования
    const activeVotings = await db.collection('votings').find({ 
      isActive: true 
    }).toArray();
    
    let message = `📊 *Активные голосования*\n\n`;
    
    if (activeVotings.length === 0) {
      message += `❌ Активных голосований нет\n\n`;
    } else {
      activeVotings.forEach((voting, index) => {
        const endDate = new Date(voting.endDate);
        const now = new Date();
        const timeLeft = endDate.getTime() - now.getTime();
        const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));
        
        message += `${index + 1}. *${voting.title}*\n`;
        message += `├ 📅 Осталось: ${daysLeft} дней\n`;
        message += `├ 👥 Голосов: ${voting.totalVotes || 0}\n`;
        message += `└ 🔗 ID: \`${voting._id}\`\n\n`;
      });
    }
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📈 Детали голосования', 'admin_voting_details'),
        Markup.button.callback('⏹️ Остановить голосование', 'admin_voting_stop')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_voting')]
    ]);
    
    message += `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ активных голосований');
  }
}
async function showAdminVotingStats(ctx, user) {
  try {
    // Получаем статистику голосований
    const totalVotings = await db.collection('votings').countDocuments();
    const activeVotings = await db.collection('votings').countDocuments({ isActive: true });
    const totalVotes = await db.collection('votes').countDocuments();
    
    // Получаем топ голосований по количеству голосов
    const topVotings = await db.collection('votings')
      .find({})
      .sort({ totalVotes: -1 })
      .limit(5)
      .toArray();
    
    let message = `📈 *Статистика голосований*\n\n`;
    message += `📊 *Общая статистика:*\n`;
    message += `├ Всего голосований: \`${totalVotings}\`\n`;
    message += `├ Активных голосований: \`${activeVotings}\`\n`;
    message += `└ Всего голосов: \`${totalVotes}\`\n\n`;
    
    if (topVotings.length > 0) {
      message += `🏆 *Топ голосований:*\n`;
      topVotings.forEach((voting, index) => {
        message += `${index + 1}. ${voting.title}\n`;
        message += `├ 👥 Голосов: ${voting.totalVotes || 0}\n`;
        message += `├ 📅 Создано: ${new Date(voting.createdAt).toLocaleDateString()}\n`;
        message += `└ ${voting.isActive ? '🟢 Активно' : '🔴 Завершено'}\n\n`;
      });
    }
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_voting')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ статистики голосований');
  }
}

async function showAdminVotingSettings(ctx, user) {
  try {
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('⏰ Настройка времени', 'admin_voting_time_settings'),
        Markup.button.callback('👥 Настройка доступа', 'admin_voting_access_settings')
      ],
      [
        Markup.button.callback('📊 Настройка отображения', 'admin_voting_display_settings'),
        Markup.button.callback('🔒 Настройка безопасности', 'admin_voting_security_settings')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_voting')]
    ]);
    
    const message = 
      `⚙️ *Настройки голосования*\n\n` +
      `🔧 *Доступные настройки:*\n` +
      `├ ⏰ Настройка времени - длительность голосований\n` +
      `├ 👥 Настройка доступа - кто может голосовать\n` +
      `├ 📊 Настройка отображения - как показывать результаты\n` +
      `└ 🔒 Настройка безопасности - защита от накрутки\n\n` +
      `🎯 Выберите настройку:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ настроек голосования');
  }
}

async function showAdminVotingDelete(ctx, user) {
  try {
    // Получаем все голосования
    const allVotings = await db.collection('votings').find({}).toArray();
    
    let message = `🗑️ *Удаление голосования*\n\n`;
    
    if (allVotings.length === 0) {
      message += `❌ Голосований для удаления нет\n\n`;
    } else {
      message += `📋 *Список голосований:*\n`;
      allVotings.forEach((voting, index) => {
        message += `${index + 1}. *${voting.title}*\n`;
        message += `├ 👥 Голосов: ${voting.totalVotes || 0}\n`;
        message += `├ 📅 Создано: ${new Date(voting.createdAt).toLocaleDateString()}\n`;
        message += `└ 🔗 ID: \`${voting._id}\`\n\n`;
      });
    }
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🗑️ Удалить по ID', 'admin_voting_delete_by_id'),
        Markup.button.callback('🗑️ Удалить все', 'admin_voting_delete_all')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_voting')]
    ]);
    
    message += `⚠️ *Внимание:* Удаление необратимо!\n\n`;
    message += `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ удаления голосований');
  }
}

async function showAdminVotingHistory(ctx, user) {
  try {
    // Получаем завершенные голосования
    const finishedVotings = await db.collection('votings')
      .find({ isActive: false })
      .sort({ endDate: -1 })
      .limit(10)
      .toArray();
    
    let message = `📋 *История голосований*\n\n`;
    
    if (finishedVotings.length === 0) {
      message += `❌ Завершенных голосований нет\n\n`;
    } else {
      finishedVotings.forEach((voting, index) => {
        const endDate = new Date(voting.endDate);
        message += `${index + 1}. *${voting.title}*\n`;
        message += `├ 👥 Голосов: ${voting.totalVotes || 0}\n`;
        message += `├ 📅 Завершено: ${endDate.toLocaleDateString()}\n`;
        message += `└ 🏆 Победитель: ${voting.winner || 'Не определен'}\n\n`;
      });
    }
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_voting')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ истории голосований');
  }
}



// ==================== ОТЛАДКА РАНГОВ ====================
async function showAdminDebugRanks(ctx, user) {
  try {
    log(`🔍 Показ отладки рангов для админа ${user.id}`);
    
    // Получаем статистику по рангам
    const ranks = getRankRequirements();
    const rankStats = [];
    
    for (const rank of ranks) {
      const count = await db.collection('users').countDocuments({ level: { $gte: rank.level } });
      rankStats.push({ ...rank, count });
    }
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔍 Проверить пользователя', 'admin_debug_user_rank')],
      [Markup.button.callback('📊 Статистика рангов', 'admin_rank_stats')],
      [Markup.button.callback('🧪 Тест прогресса', 'admin_test_progress')],
      [Markup.button.callback('⚡ Принудительная проверка уровня', 'admin_force_level_check')],
      [Markup.button.callback('🎯 Добавить опыт', 'admin_add_experience')],
      [Markup.button.callback('🔙 Назад', 'admin')]
    ]);
    
    let message = `🔍 *Отладка системы рангов*\n\n`;
    message += `📊 *Статистика по рангам:*\n`;
    
    rankStats.forEach((rank, index) => {
      const percentage = rankStats[0].count > 0 ? Math.round((rank.count / rankStats[0].count) * 100) : 0;
      message += `${index + 1}. ${rank.name} (${rank.level} ур.) - ${rank.count} пользователей (${percentage}%)\n`;
    });
    
    message += `\n🔧 *Доступные действия:*\n`;
    message += `├ 🔍 Проверить пользователя - отладка конкретного пользователя\n`;
    message += `├ 📊 Статистика рангов - детальная статистика\n`;
    message += `├ 🧪 Тест прогресса - тестирование расчета прогресса\n`;
    message += `├ ⚡ Принудительная проверка уровня - обновить уровни всех пользователей\n`;
    message += `├ 🎯 Добавить опыт - добавить опыт текущему пользователю\n`;
    message += `└ 🔙 Назад - вернуться в админ панель\n\n`;
    message += `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Отладка рангов показана для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ отладки рангов для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа отладки рангов');
  }
}

// Функция для тестирования прогресса рангов
async function showAdminTestProgress(ctx, user) {
  try {
    log(`🧪 Показ теста прогресса рангов для админа ${user.id}`);
    
    const ranks = getRankRequirements();
    let message = `🧪 *Тест расчета прогресса рангов*\n\n`;
    
    // Тестируем разные уровни
    const testLevels = [1, 3, 7, 12, 18, 25, 35, 50, 70, 90, 100];
    
    message += `📊 *Тестовые уровни:*\n`;
    
    for (const level of testLevels) {
      const testUser = { id: 'test', level: level };
      const rankProgress = await getRankProgress(testUser);
      
      if (rankProgress.isMax) {
        message += `├ Уровень ${level}: ${rankProgress.current.name} (Максимальный ранг)\n`;
      } else {
        message += `├ Уровень ${level}: ${rankProgress.current.name} → ${rankProgress.next.name} (${rankProgress.progress}%)\n`;
      }
    }
    
    message += `\n🔍 *Детальный расчет для уровня 7:*\n`;
    const testUser7 = { id: 'test', level: 7 };
    const rankProgress7 = await getRankProgress(testUser7);
    message += `├ Текущий ранг: ${rankProgress7.current.name} (${rankProgress7.current.level})\n`;
    message += `├ Следующий ранг: ${rankProgress7.next.name} (${rankProgress7.next.level})\n`;
    message += `├ Прогресс: ${rankProgress7.progress}%\n`;
    message += `└ Осталось: ${rankProgress7.remaining} уровней\n\n`;
    
    message += `🎯 Выберите действие:`;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_debug_ranks')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
  } catch (error) {
    logError(error, `Показ теста прогресса рангов для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа теста прогресса');
  }
}

// Функция для принудительной проверки уровня всех пользователей
async function showAdminForceLevelCheck(ctx, user) {
  try {
    log(`⚡ Принудительная проверка уровня для админа ${user.id}`);
    
    // Получаем всех пользователей
    const allUsers = await db.collection('users').find({}).toArray();
    let updatedCount = 0;
    let levelUpCount = 0;
    
    message = `⚡ *Принудительная проверка уровня*\n\n`;
    message += `🔍 Проверяем ${allUsers.length} пользователей...\n\n`;
    
    await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    
    for (const dbUser of allUsers) {
      try {
        const levelResult = await checkAndUpdateLevel(dbUser);
        if (levelResult.levelUp) {
          levelUpCount++;
          log(`🎉 Пользователь ${dbUser.id} повысил уровень до ${levelResult.newLevel}!`);
        }
        updatedCount++;
        
        // Обновляем сообщение каждые 10 пользователей
        if (updatedCount % 10 === 0) {
          message = `⚡ *Принудительная проверка уровня*\n\n`;
          message += `🔍 Проверено: ${updatedCount}/${allUsers.length} пользователей\n`;
          message += `🎉 Повысили уровень: ${levelUpCount} пользователей\n\n`;
          message += `⏳ Продолжаем проверку...`;
          
          await ctx.editMessageText(message, { parse_mode: 'Markdown' });
        }
      } catch (error) {
        logError(error, `Проверка уровня пользователя ${dbUser.id}`);
      }
    }
    
    message = `⚡ *Принудительная проверка уровня завершена*\n\n`;
    message += `✅ Проверено: ${updatedCount} пользователей\n`;
    message += `🎉 Повысили уровень: ${levelUpCount} пользователей\n\n`;
    message += `🎯 Выберите действие:`;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_debug_ranks')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Принудительная проверка уровня завершена: ${updatedCount} пользователей, ${levelUpCount} повышений`);
  } catch (error) {
    logError(error, `Принудительная проверка уровня для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка принудительной проверки уровня');
  }
}

// Функция для добавления опыта пользователю
async function showAdminAddExperience(ctx, user) {
  try {
    log(`🎯 Показ добавления опыта для админа ${user.id}`);
    
    // Добавляем 100 опыта пользователю
    const experienceToAdd = 100;
    
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $inc: { 
          experience: experienceToAdd
        },
        $set: { 
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(user.id);
    
    // Получаем обновленного пользователя
    const updatedUser = await getUser(user.id);
    
    // Проверяем и обновляем уровень
    const levelResult = await checkAndUpdateLevel(updatedUser);
    
    let message = `🎯 *Добавление опыта*\n\n`;
    message += `✅ Добавлено ${experienceToAdd} опыта\n\n`;
    message += `📊 *Текущие данные:*\n`;
    message += `├ Уровень: ${updatedUser.level}\n`;
    message += `├ Опыт: ${updatedUser.experience}/${updatedUser.experienceToNextLevel}\n`;
    
    if (levelResult.levelUp) {
      message += `├ 🎉 Уровень повышен до: ${levelResult.newLevel}\n`;
      message += `├ Новый опыт: ${levelResult.newExperience}/${levelResult.newExperienceToNextLevel}\n`;
    }
    
    message += `└ Прогресс до следующего уровня: ${Math.round((updatedUser.experience / updatedUser.experienceToNextLevel) * 100)}%\n\n`;
    message += `🎯 Выберите действие:`;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🎯 Добавить еще опыт', 'admin_add_experience')],
      [Markup.button.callback('🔙 Назад', 'admin_debug_ranks')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Опыт добавлен для пользователя ${user.id}: +${experienceToAdd}, уровень: ${updatedUser.level}`);
  } catch (error) {
    logError(error, `Добавление опыта для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка добавления опыта');
  }
}

// Функции обработки управления резервом
async function handleAdminAddReserveStars(ctx, user, text) {
  try {
    const amount = parseFloat(text);
    
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Некорректная сумма. Введите положительное число.');
      return;
    }
    
    // Обновляем резерв
    await db.collection('reserve').updateOne(
      { currency: 'main' },
      { 
        $inc: { magnuStarsoins: amount },
        $set: { updatedAt: new Date() }
      },
      { upsert: true }
    );
    
    // Очищаем кеш резерва
    statsCache.delete('reserve');
    
    // Получаем обновленный резерв для расчета нового курса
    const updatedReserve = await db.collection('reserve').findOne({ currency: 'main' });
    const newRate = await calculateExchangeRate();
    
    // Сохраняем историю изменения курса
    await db.collection('exchangeHistory').insertOne({
      type: 'rate_update',
      rate: newRate,
      timestamp: new Date(),
      magnuStarsoinsReserve: updatedReserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS,
      starsReserve: updatedReserve?.stars || config.INITIAL_RESERVE_STARS,
      reason: 'admin_reserve_change',
      adminId: user.id,
      changeType: 'add_Stars',
      changeAmount: amount
    });
    
    // Сбрасываем состояние админа
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад в управление резервом', 'admin_reserve')]
    ]);
    
    await ctx.reply(
      `✅ *Stars добавлены в резерв!*\n\n` +
      `💰 Добавлено: \`${formatNumber(amount)}\` Stars\n` +
      `📊 Новый курс: \`${newRate.toFixed(6)}\` Stars за 1 Stars\n\n` +
      `💱 Курс обмена автоматически пересчитан.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    console.log(`✅ Админ ${user.id} добавил ${amount} Stars в резерв`);
  } catch (error) {
    logError(error, `Добавление Stars в резерв админом ${user.id}`);
    await ctx.reply('❌ Ошибка добавления Stars в резерв.');
  }
}
async function handleAdminRemoveReserveStars(ctx, user, text) {
  try {
    const amount = parseFloat(text);
    
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Некорректная сумма. Введите положительное число.');
      return;
    }
    
    // Проверяем текущий резерв
    const reserve = await db.collection('reserve').findOne({ currency: 'main' });
    const currentReserve = reserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS;
    
    if (amount > currentReserve) {
      await ctx.reply(`❌ Недостаточно Stars в резерве. Доступно: ${formatNumber(currentReserve)}`);
      return;
    }
    
    // Обновляем резерв (списываем средства)
    await db.collection('reserve').updateOne(
      { currency: 'main' },
      { 
        $inc: { magnuStarsoins: -amount },
        $set: { updatedAt: new Date() }
      }
    );
    
    // Списываем средства из общего баланса системы
    await db.collection('systemStats').updateOne(
      { type: 'global' },
      { 
        $inc: { totalMagnuStarsoinsSpent: amount },
        $set: { updatedAt: new Date() }
      },
      { upsert: true }
    );
    
    // Очищаем кеш резерва
    statsCache.delete('reserve');
    
    // Получаем обновленный резерв для расчета нового курса
    const updatedReserve = await db.collection('reserve').findOne({ currency: 'main' });
    const newRate = await calculateExchangeRate();
    
    // Сохраняем историю изменения курса
    await db.collection('exchangeHistory').insertOne({
      type: 'rate_update',
      rate: newRate,
      timestamp: new Date(),
      magnuStarsoinsReserve: updatedReserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS,
      starsReserve: updatedReserve?.stars || config.INITIAL_RESERVE_STARS,
      reason: 'admin_reserve_change',
      adminId: user.id,
      changeType: 'remove_Stars',
      changeAmount: amount
    });
    
    // Сбрасываем состояние админа
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад в управление резервом', 'admin_reserve')]
    ]);
    
    await ctx.reply(
      `✅ *Stars удалены из резерва!*\n\n` +
      `💰 Удалено: \`${formatNumber(amount)}\` Stars\n` +
      `📊 Новый курс: \`${newRate.toFixed(6)}\` Stars за 1 Stars\n\n` +
      `💱 Курс обмена автоматически пересчитан.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    console.log(`✅ Админ ${user.id} удалил ${amount} Stars из резерва`);
  } catch (error) {
    logError(error, `Удаление Stars из резерва админом ${user.id}`);
    await ctx.reply('❌ Ошибка удаления Stars из резерва.');
  }
}

async function handleAdminAddReserveStars(ctx, user, text) {
  try {
    const amount = parseFloat(text);
    
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Некорректная сумма. Введите положительное число.');
      return;
    }
    
    // Обновляем резерв
    await db.collection('reserve').updateOne(
      { currency: 'main' },
      { 
        $inc: { stars: amount },
        $set: { updatedAt: new Date() }
      },
      { upsert: true }
    );
    
    // Очищаем кеш резерва
    statsCache.delete('reserve');
    
    // Получаем обновленный резерв для расчета нового курса
    const updatedReserve = await db.collection('reserve').findOne({ currency: 'main' });
    const newRate = await calculateExchangeRate();
    
    // Сохраняем историю изменения курса
    await db.collection('exchangeHistory').insertOne({
      type: 'rate_update',
      rate: newRate,
      timestamp: new Date(),
      magnuStarsoinsReserve: updatedReserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS,
      starsReserve: updatedReserve?.stars || config.INITIAL_RESERVE_STARS,
      reason: 'admin_reserve_change',
      adminId: user.id,
      changeType: 'add_stars',
      changeAmount: amount
    });
    
    // Сбрасываем состояние админа
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад в управление резервом', 'admin_reserve')]
    ]);
    
    await ctx.reply(
      `✅ *Stars добавлены в резерв!*\n\n` +
      `⭐ Добавлено: \`${formatNumber(amount)}\` Stars\n` +
      `📊 Новый курс: \`${newRate.toFixed(6)}\` Stars за 1 Stars\n\n` +
      `💱 Курс обмена автоматически пересчитан.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    console.log(`✅ Админ ${user.id} добавил ${amount} Stars в резерв`);
  } catch (error) {
    logError(error, `Добавление Stars в резерв админом ${user.id}`);
    await ctx.reply('❌ Ошибка добавления Stars в резерв.');
  }
}
async function handleAdminRemoveReserveStars(ctx, user, text) {
  try {
    const amount = parseFloat(text);
    
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Некорректная сумма. Введите положительное число.');
      return;
    }
    
    // Проверяем текущий резерв
    const reserve = await db.collection('reserve').findOne({ currency: 'main' });
    const currentReserve = reserve?.stars || config.INITIAL_RESERVE_STARS;
    
    if (amount > currentReserve) {
      await ctx.reply(`❌ Недостаточно Stars в резерве. Доступно: ${formatNumber(currentReserve)}`);
      return;
    }
    
    // Обновляем резерв
    await db.collection('reserve').updateOne(
      { currency: 'main' },
      { 
        $inc: { stars: -amount },
        $set: { updatedAt: new Date() }
      }
    );
    
    // Очищаем кеш резерва
    statsCache.delete('reserve');
    
    // Получаем обновленный резерв для расчета нового курса
    const updatedReserve = await db.collection('reserve').findOne({ currency: 'main' });
    const newRate = await calculateExchangeRate();
    
    // Сохраняем историю изменения курса
    await db.collection('exchangeHistory').insertOne({
      type: 'rate_update',
      rate: newRate,
      timestamp: new Date(),
      magnuStarsoinsReserve: updatedReserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS,
      starsReserve: updatedReserve?.stars || config.INITIAL_RESERVE_STARS,
      reason: 'admin_reserve_change',
      adminId: user.id,
      changeType: 'remove_stars',
      changeAmount: amount
    });
    
    // Сбрасываем состояние админа
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад в управление резервом', 'admin_reserve')]
    ]);
    
    await ctx.reply(
      `✅ *Stars удалены из резерва!*\n\n` +
      `⭐ Удалено: \`${formatNumber(amount)}\` Stars\n` +
      `📊 Новый курс: \`${newRate.toFixed(6)}\` Stars за 1 Stars\n\n` +
      `💱 Курс обмена автоматически пересчитан.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    console.log(`✅ Админ ${user.id} удалил ${amount} Stars из резерва`);
  } catch (error) {
    logError(error, `Удаление Stars из резерва админом ${user.id}`);
    await ctx.reply('❌ Ошибка удаления Stars из резерва.');
  }
}

// Функция установки комиссии
async function handleAdminSetCommission(ctx, user, text) {
  try {
    const commission = parseFloat(text);
    
    if (isNaN(commission) || commission < 0 || commission > 50) {
      await ctx.reply('❌ Некорректная комиссия. Введите число от 0 до 50.');
      return;
    }
    
    // Обновляем комиссию в конфигурации
    config.EXCHANGE_COMMISSION = commission;
    
    // Сбрасываем состояние админа
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад в управление комиссией', 'admin_exchange_commission')]
    ]);
    
    await ctx.reply(
      `✅ *Комиссия обмена обновлена!*\n\n` +
      `💸 Новая комиссия: \`${commission}%\`\n\n` +
      `📊 *Примеры обмена:*\n` +
      `├ 100 Stars → ${((100 - (100 * commission / 100)) * 0.001).toFixed(4)} Stars\n` +
      `├ 500 Stars → ${((500 - (500 * commission / 100)) * 0.001).toFixed(4)} Stars\n` +
      `└ 1000 Stars → ${((1000 - (1000 * commission / 100)) * 0.001).toFixed(4)} Stars\n\n` +
      `💡 Комиссия будет применяться ко всем новым обменам.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    console.log(`✅ Админ ${user.id} установил комиссию ${commission}%`);
  } catch (error) {
    logError(error, `Установка комиссии админом ${user.id}`);
    await ctx.reply('❌ Ошибка установки комиссии.');
  }
}

// Функция установки комиссии вывода
async function handleAdminSetWithdrawalCommission(ctx, user, text) {
  try {
    const commission = parseFloat(text);

    if (isNaN(commission) || commission < 0 || commission > 50) {
      await ctx.reply('❌ Некорректная комиссия. Введите число от 0 до 50.');
      return;
    }

    // Сохраняем комиссию в базу данных
    await db.collection('config').updateOne(
      { key: 'WITHDRAWAL_COMMISSION' },
      { $set: { value: commission } },
      { upsert: true }
    );

    // Обновляем комиссию в конфигурации
    config.WITHDRAWAL_COMMISSION = commission;

    // Сбрасываем состояние админа
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );

    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад в управление комиссией', 'admin_withdrawal_commission')]
    ]);
    
    await ctx.reply(
      `✅ *Комиссия вывода обновлена!*\n\n` +
      `💸 Новая комиссия: \`${commission}%\`\n\n` +
      `📊 *Примеры вывода:*\n` +
      `├ 50 Stars → ${(50 * (1 - commission / 100)).toFixed(2)} Stars к выплате\n` +
      `├ 100 Stars → ${(100 * (1 - commission / 100)).toFixed(2)} Stars к выплате\n` +
      `└ 500 Stars → ${(500 * (1 - commission / 100)).toFixed(2)} Stars к выплате\n\n` +
      `💡 Комиссия будет применяться ко всем новым заявкам на вывод.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    console.log(`✅ Админ ${user.id} установил комиссию вывода ${commission}%`);
  } catch (error) {
    logError(error, `Установка комиссии вывода админом ${user.id}`);
    await ctx.reply('❌ Ошибка установки комиссии вывода.');
  }
}

async function showAdminSettings(ctx, user) {
  try {
    log(`⚙️ Показ настроек бота для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [

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
      [
        Markup.button.callback('💸 Комиссия обмена', 'admin_exchange_commission')
      ],
      [Markup.button.callback('🔙 Назад', 'admin')]
    ]);
    
    const message = 
      `⚙️ *Настройки бота*\n\n` +
      `🔧 *Текущие настройки:*\n` +

      `├ 🎁 Базовый бонус: \`${config.DAILY_BONUS_BASE}\` Magnum Coins\n` +
      `├ ⛏️ Награда майнера: \`${config.MINER_REWARD_PER_MINUTE}\` Stars/мин\n` +
      `├ 👥 Реферальная награда: \`${config.REFERRAL_REWARD}\` Stars\n` +
      `├ 💸 Комиссия обмена: \`${config.EXCHANGE_COMMISSION}%\`\n` +
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


// ==================== УПРАВЛЕНИЕ КОМИССИЕЙ ====================
async function showAdminExchangeCommission(ctx, user) {
  try {
    log(`💸 Показ управления комиссией обмена для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Увеличить комиссию', 'admin_commission_increase'),
        Markup.button.callback('➖ Уменьшить комиссию', 'admin_commission_decrease')
      ],
      [
        Markup.button.callback('🎯 Установить точное значение', 'admin_commission_set'),
        Markup.button.callback('📊 Статистика комиссий', 'admin_commission_stats')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_settings')]
    ]);
    
    const message = 
      `💸 *Комиссия обмена*\n\n` +
      `💰 *Текущие настройки:*\n` +
      `├ Текущая комиссия: \`${config.EXCHANGE_COMMISSION}%\`\n` +
      `├ Комиссия с 100 Stars: \`${(100 * config.EXCHANGE_COMMISSION / 100).toFixed(2)}\` Stars\n` +
      `└ Комиссия с 1000 Stars: \`${(1000 * config.EXCHANGE_COMMISSION / 100).toFixed(2)}\` Stars\n\n` +
      `📊 *Примеры обмена:*\n` +
      `├ 100 Stars → ${((100 - (100 * config.EXCHANGE_COMMISSION / 100)) * 0.001).toFixed(4)} Stars\n` +
      `├ 500 Stars → ${((500 - (500 * config.EXCHANGE_COMMISSION / 100)) * 0.001).toFixed(4)} Stars\n` +
      `└ 1000 Stars → ${((1000 - (1000 * config.EXCHANGE_COMMISSION / 100)) * 0.001).toFixed(4)} Stars\n\n` +
      `💡 *Информация:*\n` +
      `├ Комиссия взимается с каждой операции обмена\n` +
      `├ Комиссия остается в резерве Stars\n` +
      `└ Комиссия влияет на курс обмена для пользователей\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Управление комиссией показано для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ управления комиссией для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа управления комиссией');
  }
}

// Управление комиссией вывода
async function showAdminWithdrawalCommission(ctx, user) {
  try {
    log(`💰 Показ управления комиссией вывода для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Увеличить комиссию', 'admin_withdrawal_commission_increase'),
        Markup.button.callback('➖ Уменьшить комиссию', 'admin_withdrawal_commission_decrease')
      ],
      [
        Markup.button.callback('🎯 Установить точное значение', 'admin_withdrawal_commission_set'),
        Markup.button.callback('📊 Статистика комиссий', 'admin_withdrawal_commission_stats')
      ],
      [Markup.button.callback('🔙 Назад', 'admin')]
    ]);
    
    const commission = config.WITHDRAWAL_COMMISSION || 5.0;
    const commissionDecimal = commission / 100;
    
    const message = 
      `💰 *Комиссия вывода*\n\n` +
      `💸 *Текущие настройки:*\n` +
      `├ Текущая комиссия: \`${commission}%\`\n` +
      `├ Комиссия с 50 Stars: \`${(50 * commissionDecimal).toFixed(2)}\` Stars\n` +
      `├ Комиссия с 100 Stars: \`${(100 * commissionDecimal).toFixed(2)}\` Stars\n` +
      `└ Комиссия с 500 Stars: \`${(500 * commissionDecimal).toFixed(2)}\` Stars\n\n` +
      `📊 *Примеры вывода:*\n` +
      `├ 50 Stars → ${(50 * (1 - commissionDecimal)).toFixed(2)} Stars к выплате\n` +
      `├ 100 Stars → ${(100 * (1 - commissionDecimal)).toFixed(2)} Stars к выплате\n` +
      `└ 500 Stars → ${(500 * (1 - commissionDecimal)).toFixed(2)} Stars к выплате\n\n` +
      `⚙️ *Диапазон комиссии:* 0% - 15%\n` +
      `💡 *Информация:*\n` +
      `├ Комиссия взимается с каждой заявки на вывод\n` +
      `├ Комиссия остается в системе\n` +
      `├ Изменения применяются ко всем новым заявкам\n` +
      `└ Комиссия влияет на сумму к выплате\n\n` +
      `🎯 Выберите действие:`;
    
    try {
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    } catch (editError) {
      // Если не удалось отредактировать сообщение, отправляем новое
      if (editError.message.includes('message is not modified')) {
        await ctx.answerCbQuery('✅ Меню уже открыто');
        return;
      }
      throw editError;
    }
    
    log(`✅ Управление комиссией вывода показано для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ управления комиссией вывода для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа управления комиссией вывода');
  }
}

async function showAdminCooldowns(ctx, user) {
  try {
    log(`⏰ Показ настроек кулдаунов для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [

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
      `├ Ежедневный бонус: \`24\` часа\n` +
      `└ Майнер: \`60\` минут\n\n` +
      `📊 *Статистика использования:*\n` +
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
async function showAdminMiningSeasons(ctx, user) {
  try {
    log(`📅 Показ управления сезонами майнинга для админа ${user.id}`);
    
    const currentSeason = getCurrentMiningSeason();
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🚀 Запустить новый сезон', 'admin_season_start'),
        Markup.button.callback('⏹️ Завершить сезон', 'admin_season_end')
      ],
      [
        Markup.button.callback('⚙️ Настройки сезона', 'admin_season_settings'),
        Markup.button.callback('🏆 Выдать награды', 'admin_season_rewards')
      ],
      [
        Markup.button.callback('📊 Статистика сезона', 'admin_season_stats'),
        Markup.button.callback('🔄 Сброс рейтинга', 'admin_season_reset')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_miner_settings')]
    ]);
    
    const message = 
      `📅 *Управление сезонами майнинга*\n\n` +
      `🎯 *Текущий сезон:*\n` +
      `├ Номер сезона: \`${currentSeason.season}\`\n` +
      `├ День сезона: \`${currentSeason.dayInSeason}/${config.MINING_SEASON_DURATION}\`\n` +
      `├ Дней до конца: \`${currentSeason.daysUntilNextSeason}\`\n` +
      `├ Множитель: \`${currentSeason.multiplier}x\`\n` +
      `└ Статус: ${currentSeason.isActive ? '🟢 Активен' : '🔴 Неактивен'}\n\n` +
      `⚙️ *Настройки сезонов:*\n` +
      `├ Длительность сезона: \`${config.MINING_SEASON_DURATION}\` дней\n` +
      `├ Интервал наград: \`${config.MINING_REWARD_INTERVAL}\` мин\n` +
      `├ Бонус активного клика: \`${config.MINING_ACTIVE_CLICK_BONUS}x\`\n` +
      `└ Множитель роста: \`+10%\` за сезон\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Управление сезонами показано для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ управления сезонами для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа управления сезонами');
  }
}

async function showAdminMinerSettings(ctx, user) {
  try {
    log(`⛏️ Показ настроек майнера для админа ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('💰 Базовая награда', 'admin_miner_reward'),
        Markup.button.callback('⚡ Эффективность', 'admin_miner_efficiency')
      ],
      [
        Markup.button.callback('📅 Управление сезонами', 'admin_mining_seasons'),
        Markup.button.callback('🎯 Настройка уровней', 'admin_miner_levels')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_settings')]
    ]);
    
    const message = 
      `⛏️ *Настройки майнера*\n\n` +
      `💰 *Текущие настройки:*\n` +
      `├ Базовая награда за минуту: \`${config.MINER_REWARD_PER_MINUTE}\` Stars\n` +
      `├ Базовая эффективность: \`1.0\`\n` +
      `├ Максимальная эффективность: \`5.0\`\n` +
      `└ Максимальная базовая награда: \`${config.MINER_REWARD_PER_MINUTE * 5}\` Stars/мин\n\n` +
      `📊 *Статистика пользователя:*\n` +
      `├ Уровень майнера: \`${user.miner?.level || 1}\`\n` +
      `├ Эффективность: \`${user.miner?.efficiency || 1.0}\`\n` +
      `├ Статус: ${user.miner?.active ? '🟢 Активен' : '🔴 Неактивен'}\n` +
      `├ Всего добыто MC: \`${formatNumber(user.miner?.totalMined || 0)}\` 🪙\n` +
      `├ Всего добыто Stars: \`${formatNumber(user.miner?.totalMined || 0)}\` ⭐\n` +
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
      `├ Награда за реферала: \`${config.REFERRAL_REWARD}\` Stars\n` +
      `├ Бонус за 5 рефералов: \`50\` Stars\n` +
      `├ Бонус за 10 рефералов: \`100\` Stars\n` +
      `├ Бонус за 25 рефералов: \`250\` Stars\n` +
      `└ Бонус за 50 рефералов: \`500\` Stars\n\n` +
      `📊 *Статистика пользователя:*\n` +
      `├ Рефералов: \`${user.referralsCount || 0}\`\n` +
      `├ Заработано: \`${formatNumber(user.referralsEarnings || 0)}\` 🪙 Magnum Coins\n` +
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
    const topByMagnuStarsoins = await db.collection('users').find().sort({ magnuStarsoins: -1 }).limit(10).toArray();
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
    topByMagnuStarsoins.forEach((user, index) => {
      message += `${index + 1}. ID: \`${user.id}\` - \`${formatNumber(user.magnuStarsoins)}\` 🪙 MC\n`;
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
// Функция для расчета награды майнера с учетом курса, количества активных майнеров и титула
async function calculateMinerReward(userEfficiency = 1, user = null) {
  try {
    // Получаем количество активных майнеров
    const activeMinersCount = await db.collection('users').countDocuments({
      'miner.active': true
    });
    
    // Получаем текущий курс обмена
    const exchangeRate = await calculateExchangeRate();
    
    // Базовая награда за минуту
    let baseReward = config.MINER_REWARD_PER_MINUTE;
    
    // Множитель на основе курса обмена (чем выше курс, тем больше награда)
    const exchangeMultiplier = Math.max(0.1, exchangeRate / config.BASE_EXCHANGE_RATE);
    
    // Множитель на основе количества активных майнеров (чем больше майнеров, тем меньше награда)
    // Используем общее количество пользователей с майнерами, а не только активных
    const totalMinersCount = await db.collection('users').countDocuments({
      'miner': { $exists: true }
    });
    const minersMultiplier = Math.max(0.3, Math.min(2.0, 1 / Math.sqrt(totalMinersCount + 1)));
    
    // Множитель на основе титула пользователя
    let titleMultiplier = 1.0;
    if (user && user.mainTitle) {
      const titlesList = getTitlesList(user);
      const currentTitle = titlesList.find(t => t.name === user.mainTitle);
      if (currentTitle) {
        titleMultiplier = currentTitle.minerBonus || 1.0;
      }
    }
    
    // Итоговая награда
    const finalReward = baseReward * exchangeMultiplier * minersMultiplier * userEfficiency * titleMultiplier;
    
    return Math.max(0.001, finalReward); // Минимальная награда 0.001
  } catch (error) {
    console.error('❌ Ошибка расчета награды майнера:', error);
    return config.MINER_REWARD_PER_MINUTE * userEfficiency;
  }
}

async function processMinerRewards() {
  try {
    console.log('⛏️ Обработка пассивных наград майнинга...');
    
    const currentSeason = getCurrentMiningSeason();
    if (!currentSeason.isActive) {
      console.log('📅 Майнинг приостановлен - выходные');
      return;
    }
    
    const users = await db.collection('users').find({
      $or: [
        { 'miningStats.lastReward': { $exists: true } },
        { 'miners': { $exists: true, $ne: [] } }
      ]
    }).toArray();
    
    console.log(`📊 Найдено ${users.length} пользователей с майнерами`);
    
    let processedCount = 0;
    
    for (const user of users) {
      try {
        const userWithMining = initializeNewMiningSystem(user);
        const totalSpeed = calculateTotalMiningSpeed(userWithMining);
        
        console.log(`👤 Пользователь ${userWithMining.id}:`, {
          miners: userWithMining.miners?.length || 0,
          totalSpeedStars: totalSpeed.stars,
          totalSpeedStars: totalSpeed.stars,
          lastReward: userWithMining.miningStats?.lastReward
        });
        
        const totalSpeedSum = totalSpeed.stars + totalSpeed.stars;
        if (totalSpeedSum > 0) {
          const now = new Date();
          const lastReward = userWithMining.miningStats.lastReward || now;
          const timeDiff = (now - lastReward) / (1000 * 60); // в минутах
          
          console.log(`⏰ Время для пользователя ${userWithMining.id}:`, {
            now: now.toISOString(),
            lastReward: lastReward.toISOString(),
            timeDiff,
            requiredInterval: config.MINING_REWARD_INTERVAL
          });
          
          // Если у пользователя нет lastReward, устанавливаем его и начисляем награду
          if (!userWithMining.miningStats.lastReward) {
            console.log(`🆕 Первая награда для пользователя ${userWithMining.id}`);
            const rewardStars = totalSpeed.stars * config.MINING_REWARD_INTERVAL * currentSeason.multiplier;
            
            console.log(`💰 Первые награды для пользователя ${userWithMining.id}:`, {
              rewardStars,
              multiplier: currentSeason.multiplier
            });
            
            // Обновляем статистику
            await db.collection('users').updateOne(
              { id: userWithMining.id },
              {
                $inc: {
                  stars: rewardStars,
                  'miningStats.totalMinedStars': rewardStars,
                  'miningStats.seasonMinedStars': rewardStars,
                  'miningStats.passiveRewards': rewardStars
                },
                $set: {
                  'miningStats.lastReward': now
                }
              }
            );
            
            // Принудительно сохраняем пользователя
            const updatedUser = await db.collection('users').findOne({ id: userWithMining.id });
            if (updatedUser) {
              await forceSaveUser(updatedUser);
            }
            
            // Очищаем кеш пользователя
            userCache.delete(userWithMining.id);
            
            processedCount++;
            console.log(`✅ Первые награды начислены пользователю ${userWithMining.id}`);
          } else if (timeDiff >= config.MINING_REWARD_INTERVAL) {
            const rewardStars = totalSpeed.stars * config.MINING_REWARD_INTERVAL * currentSeason.multiplier;
            
            console.log(`💰 Награды для пользователя ${userWithMining.id}:`, {
              rewardStars,
              multiplier: currentSeason.multiplier
            });
            
            // Обновляем статистику
            await db.collection('users').updateOne(
              { id: userWithMining.id },
              {
                $inc: {
                  magnuStarsoins: rewardStars,
                  stars: rewardStars,
                  'miningStats.totalMinedStars': rewardStars,
                  'miningStats.totalMinedStars': rewardStars,
                  'miningStats.seasonMinedStars': rewardStars,
                  'miningStats.seasonMinedStars': rewardStars,
                  'miningStats.passiveRewards': rewardStars + rewardStars
                },
                $set: {
                  'miningStats.lastReward': now
                }
              }
            );
            
            // Принудительно сохраняем пользователя
            const updatedUser = await db.collection('users').findOne({ id: userWithMining.id });
            if (updatedUser) {
              await forceSaveUser(updatedUser);
            }
            
            // Очищаем кеш пользователя
            userCache.delete(userWithMining.id);
            
            processedCount++;
            console.log(`✅ Награды начислены пользователю ${userWithMining.id}`);
          } else {
            console.log(`⏳ Пользователь ${userWithMining.id} еще не готов к награде`);
          }
        } else {
          console.log(`❌ Пользователь ${userWithMining.id} не имеет майнеров`);
        }
      } catch (error) {
        console.error(`❌ Ошибка обработки наград для пользователя ${user.id}:`, error);
      }
    }
    
    console.log(`✅ Обработано ${processedCount} пользователей`);
  } catch (error) {
    console.error('❌ Ошибка обработки пассивных наград майнинга:', error);
  }
}

// ==================== СОХРАНЕНИЕ ДАННЫХ ====================
// Универсальная функция для сохранения пользователя в базу данных
async function saveUserToDatabase(userId, updateData, options = {}) {
  try {
    const { upsert = false, increment = false } = options;
    
    let updateOperation;
    if (increment) {
      updateOperation = { $inc: updateData };
    } else {
      updateOperation = { $set: { ...updateData, updatedAt: new Date() } };
    }
    
    if (upsert) {
      updateOperation.$setOnInsert = { 
        id: userId,
        createdAt: new Date()
      };
    }
    
    const result = await db.collection('users').updateOne(
      { id: userId },
      updateOperation,
      { upsert }
    );
    
    // Очищаем кеш пользователя
    userCache.delete(userId);
    
    console.log(`💾 Пользователь ${userId} сохранен в БД:`, {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount
    });
    
    return result;
  } catch (error) {
    console.error(`❌ Ошибка сохранения пользователя ${userId}:`, error);
    throw error;
  }
}

// Функция для получения статистики майнеров по серверу
async function getServerMinerStats() {
  try {
    const stats = {};
    const minerTypes = Object.keys(config.MINERS);
    
    for (const minerType of minerTypes) {
      const result = await db.collection('users').aggregate([
        {
          $match: {
            [`miners`]: { $exists: true, $ne: [] }
          }
        },
        {
          $unwind: '$miners'
        },
        {
          $match: {
            'miners.type': minerType
          }
        },
        {
          $group: {
            _id: null,
            totalCount: { $sum: '$miners.count' }
          }
        }
      ]).toArray();
      
      stats[minerType] = result.length > 0 ? result[0].totalCount : 0;
    }
    
    return stats;
  } catch (error) {
    console.error('❌ Ошибка получения статистики майнеров:', error);
    return {};
  }
}

// Функция для принудительного сохранения всех изменений пользователя
async function forceSaveUser(user) {
  try {
    const updateData = {
      magnuStarsoins: user.magnuStarsoins,
      stars: user.stars,
      level: user.level,
      experience: user.experience,
      miners: user.miners,
      miningStats: user.miningStats,
      achievements: user.achievements,
      statistics: user.statistics,
      settings: user.settings,
      referralCode: user.referralCode,
      referredBy: user.referredBy,
      referralRewards: user.referralRewards,
      tasks: user.tasks,
      dailyTasks: user.dailyTasks,
      lastDailyReset: user.lastDailyReset,
      lastWeeklyReset: user.lastWeeklyReset,
      lastMonthlyReset: user.lastMonthlyReset,
      banned: user.banned,
      admin: user.admin,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      updatedAt: new Date()
    };
    
    await saveUserToDatabase(user.id, updateData);
    console.log(`✅ Пользователь ${user.id} принудительно сохранен`);
  } catch (error) {
    console.error(`❌ Ошибка принудительного сохранения пользователя ${user.id}:`, error);
  }
}

// ==================== ЛОГИРОВАНИЕ ====================
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type}] ${message}`;
  console.log(logMessage);
  
  // Также записываем в файл для Railway
  if (process.env.NODE_ENV === 'production') {
    console.log(logMessage);
  }
}
function logError(error, context = '') {
  const timestamp = new Date().toISOString();
  const errorMessage = error.message || error;
  const stack = error.stack || '';
  const logMessage = `[${timestamp}] [ERROR] ${context}: ${errorMessage}`;
  console.error(logMessage);
  
  let stackMessage = '';
  if (stack) {
    stackMessage = `[${timestamp}] [ERROR] Stack: ${stack}`;
    console.error(stackMessage);
  }
  
  // Также записываем в файл для Railway
  if (process.env.NODE_ENV === 'production') {
    console.error(logMessage);
    if (stack) {
      console.error(stackMessage);
    }
  }
}

// Функция для детального логирования ошибок с контекстом
function logErrorWithContext(error, context, userId = null) {
  const timestamp = new Date().toISOString();
  const errorLog = {
    timestamp,
    userId,
    context,
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    memory: process.memoryUsage(),
    uptime: process.uptime()
  };
  
  console.error(`❌ [ERROR] ${timestamp} | User: ${userId || 'N/A'} | Context: ${context} | Error:`, error.message);
  console.error('Stack:', error.stack);
  
  // Сохраняем в файл
  const fs = require('fs');
  const logFile = 'error_log.log';
  const logLine = JSON.stringify(errorLog) + '\n';
  
  try {
    fs.appendFileSync(logFile, logLine);
  } catch (err) {
    console.error('❌ Ошибка записи error лога:', err.message);
  }
}

function logDebug(message, data = null) {
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] [DEBUG] ${message}`;
  
  if (data) {
    logMessage += ` | Data: ${JSON.stringify(data, null, 2)}`;
  }
  
  console.log(logMessage);
}

function logAction(userId, action, details = '') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [ACTION] User ${userId} | Action: ${action} | Details: ${details}`;
  console.log(logMessage);
  
  // Расширенное логирование для отладки
  const logEntry = {
    timestamp,
    userId,
    action,
    details,
    memory: process.memoryUsage(),
    uptime: process.uptime()
  };
  
  // Сохраняем в файл для анализа
  const fs = require('fs');
  const logFile = 'user_actions.log';
  const logLine = JSON.stringify(logEntry) + '\n';
  
  try {
    fs.appendFileSync(logFile, logLine);
  } catch (error) {
    console.error('❌ Ошибка записи action лога:', error.message);
  }
}

function logFunction(functionName, userId = null, params = null) {
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] [FUNCTION] ${functionName}`;
  
  if (userId) {
    logMessage += ` | User: ${userId}`;
  }
  
  if (params) {
    logMessage += ` | Params: ${JSON.stringify(params)}`;
  }
  
  console.log(logMessage);
}
// ==================== БИРЖА ====================


async function showExchangeMenu(ctx, user) {
  try {
    log(`📈 Показ биржи для пользователя ${user.id}`);
    
    // Получаем текущий курс обмена
    const exchangeRate = await calculateExchangeRate();
    const maxExchange = Math.floor(user.magnuStarsoins);
    
    // Получаем информацию о резерве
    const reserve = await db.collection('reserve').findOne({ currency: 'main' });
    const magnuStarsoinsReserve = reserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS;
    const starsReserve = reserve?.stars || config.INITIAL_RESERVE_STARS;
    

    
    // Рассчитываем изменение курса за 24 часа
    let priceChange = 0;
    let priceChangePercent = 0;
    let priceChangeIcon = '📈';
    let priceChangeColor = '🟢';
    
    if (exchangeRate24h !== null) {
      priceChange = exchangeRate - exchangeRate24h;
      priceChangePercent = exchangeRate24h > 0 ? ((priceChange / exchangeRate24h) * 100) : 0;
      
      // Проверяем на NaN и корректность данных
      if (isNaN(priceChange) || isNaN(priceChangePercent)) {
        priceChange = 0;
        priceChangePercent = 0;
      }
      
      priceChangeIcon = priceChange >= 0 ? '📈' : '📉';
      priceChangeColor = priceChange >= 0 ? '🟢' : '🔴';
    }
    
    // Форматируем изменение цены с правильными знаками
    const formatPriceChange = (change, percent) => {
      const changeSign = change >= 0 ? '+' : '';
      const percentSign = percent >= 0 ? '+' : '';
      return `${changeSign}${change.toFixed(6)} (${percentSign}${percent.toFixed(2)}%)`;
    };
    

    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🪙 Ввести сумму MC → Stars', 'exchange_custom_Stars'),
        Markup.button.callback('⭐ Ввести сумму Stars → MC', 'exchange_custom_stars')
      ],
      [
        Markup.button.callback('📊 Статистика обменов', 'exchange_stats'),
        Markup.button.callback('📋 История обменов', 'exchange_history')
      ],
      [
        Markup.button.callback('📰 Новости биржи', 'exchange_news')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ]);
    
    // Добавляем админские кнопки только для админов
    if (isAdmin(user.id)) {
      keyboard.reply_markup.inline_keyboard.splice(2, 0, [
        Markup.button.callback('📈 График курса', 'exchange_chart'),
        Markup.button.callback('⚙️ Настройки биржи', 'exchange_settings')
      ]);
    }
    
    const message = 
      `📈 *Magnum Exchange*\n\n` +
      `💰 *Ваши балансы:*\n` +
      `├ 🪙 Magnum Coins: \`${formatNumber(user.magnuStarsoins)}\`\n` +
      `└ ⭐ Stars: \`${formatNumber(user.stars)}\`\n\n` +
      `📊 *Текущий курс:*\n` +
      `├ ${priceChangeIcon} 1 Magnum Coin = ${exchangeRate.toFixed(6)} Stars\n` +
      `├ ${priceChangeColor} Изменение за 24ч: ${exchangeRate24h !== null ? formatPriceChange(priceChange, priceChangePercent) : 'Нет данных'}\n` +
      `├ 💸 Комиссия: ${config.EXCHANGE_COMMISSION}%\n` +
      `└ 📅 Обновлено: ${new Date().toLocaleTimeString('ru-RU')}\n\n` +
      `🏦 *Резерв биржи:*\n` +
      `├ 🪙 Magnum Coins: \`${formatNumber(magnuStarsoinsReserve)}\`\n` +
      `└ ⭐ Stars: \`${formatNumber(starsReserve)}\`\n\n` +
      `📈 *Рыночные данные:*\n` +
      `├ 24ч объем: \`${formatNumber(user.exchange?.totalExchanged || 0)}\` 🪙 MC\n` +
      `├ Всего обменов: \`${user.exchange?.totalExchanges || 0}\`\n` +
      `└ Ликвидность: ${Math.min(100, ((magnuStarsoinsReserve / config.INITIAL_RESERVE_MAGNUM_COINS) * 100)).toFixed(1)}%\n\n` +

      `🎯 Выберите сумму для обмена или действие:`;
    
    // Проверяем тип контекста для правильного метода отправки
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    } else {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    }
  } catch (error) {
    logError(error, 'Показ биржи');
    // Проверяем тип контекста для правильного метода ответа
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Ошибка загрузки биржи');
    } else {
      await ctx.reply('❌ Ошибка загрузки биржи');
    }
  }
}
// Функция для показа графика курса
async function showExchangeChart(ctx, user) {
  try {
    log(`📈 Показ графика курса для пользователя ${user.id}`);
    
    // Получаем историю курсов за последние 24 часа
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const exchangeHistory = await db.collection('exchangeHistory')
      .find({ 
        timestamp: { $gte: yesterday },
        type: 'rate_update' // Фильтруем только записи с курсами
      })
      .sort({ timestamp: 1 })
      .toArray();
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 24 часа', 'chart_24h'),
        Markup.button.callback('📈 7 дней', 'chart_7d')
      ],
      [
        Markup.button.callback('📉 30 дней', 'chart_30d'),
        Markup.button.callback('📊 Все время', 'chart_all')
      ],
      [Markup.button.callback('🔙 Назад', 'exchange')]
    ]);
    
    let message = `📈 *График курса Magnum Coin*\n\n`;
    
    if (exchangeHistory.length > 0) {
      const currentRate = exchangeHistory[exchangeHistory.length - 1].rate || 0.001;
      const minRate = Math.min(...exchangeHistory.map(h => h.rate || 0.001));
      const maxRate = Math.max(...exchangeHistory.map(h => h.rate || 0.001));
      const avgRate = exchangeHistory.reduce((sum, h) => sum + (h.rate || 0.001), 0) / exchangeHistory.length;
      
      message += `📊 *Статистика за 24 часа:*\n`;
      message += `├ 📈 Максимум: \`${maxRate.toFixed(6)}\` Stars\n`;
      message += `├ 📉 Минимум: \`${minRate.toFixed(6)}\` Stars\n`;
      message += `├ 📊 Среднее: \`${avgRate.toFixed(6)}\` Stars\n`;
      message += `└ 📈 Текущий: \`${currentRate.toFixed(6)}\` Stars\n\n`;
      
      // Создаем простой текстовый график
      message += `📈 *Динамика курса:*\n`;
      const points = Math.min(10, exchangeHistory.length);
      const step = Math.floor(exchangeHistory.length / points);
      
      for (let i = 0; i < points; i++) {
        const index = i * step;
        const rate = exchangeHistory[index]?.rate || 0.001;
        const timestamp = exchangeHistory[index]?.timestamp || new Date();
        const time = new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const bar = '█'.repeat(Math.floor((rate / maxRate) * 10));
        message += `├ ${time}: ${rate.toFixed(6)} ${bar}\n`;
      }
    } else {
      // Создаем резервные данные, если истории нет
      const currentRate = await calculateExchangeRate();
      message += `📊 *Статистика:*\n`;
      message += `├ 📈 Текущий курс: \`${currentRate.toFixed(6)}\` Stars\n`;
      message += `├ 📉 Минимум: \`${currentRate.toFixed(6)}\` Stars\n`;
      message += `├ 📊 Среднее: \`${currentRate.toFixed(6)}\` Stars\n`;
      message += `└ 📈 Максимум: \`${currentRate.toFixed(6)}\` Stars\n\n`;
      message += `📈 *Динамика курса:*\n`;
      message += `├ ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}: ${currentRate.toFixed(6)} ██████████\n`;
      message += `└ 💡 График будет доступен после совершения обменов\n`;
    }
    
    message += `\n💡 Выберите период для детального анализа:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ графика курса');
    await ctx.answerCbQuery('❌ Ошибка загрузки графика');
  }
}

// Функция для показа истории обменов
async function showExchangeHistory(ctx, user) {
  try {
    log(`📋 Показ истории обменов для пользователя ${user.id}`);
    
    // Получаем историю обменов пользователя
    const userHistory = await db.collection('exchangeHistory')
      .find({ 
        userId: user.id,
        type: { $ne: 'rate_update' } // Исключаем записи с курсами
      })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Все обмены', 'history_all'),
        Markup.button.callback('📈 Прибыльные', 'history_profit')
      ],
      [
        Markup.button.callback('📉 Убыточные', 'history_loss'),
        Markup.button.callback('📅 По датам', 'history_dates')
      ],
      [Markup.button.callback('🔙 Назад', 'exchange')]
    ]);
    
    let message = `📋 *История ваших обменов*\n\n`;
    
    if (userHistory.length > 0) {
      message += `📊 *Последние 10 обменов:*\n\n`;
      
      userHistory.forEach((exchange, index) => {
        const date = new Date(exchange.timestamp || new Date()).toLocaleString('ru-RU');
        const magnuStarsoinsAmount = exchange.magnuStarsoinsAmount || 0;
        const starsReceived = exchange.starsReceived || 0;
        const commission = exchange.commission || 0;
        const profit = starsReceived - (magnuStarsoinsAmount * 0.001); // Примерная прибыль
        const profitIcon = profit >= 0 ? '📈' : '📉';
        
        message += `${index + 1}. ${date}\n`;
        message += `├ 💱 ${magnuStarsoinsAmount} Stars → ${starsReceived.toFixed(6)} Stars\n`;
        message += `├ 💸 Комиссия: ${commission.toFixed(2)} Stars\n`;
        message += `└ ${profitIcon} Прибыль: ${profit >= 0 ? '+' : ''}${profit.toFixed(6)} Stars\n\n`;
      });
      
      // Общая статистика
      const totalExchanged = userHistory.reduce((sum, h) => sum + (h.magnuStarsoinsAmount || 0), 0);
      const totalStars = userHistory.reduce((sum, h) => sum + (h.starsReceived || 0), 0);
      const totalCommission = userHistory.reduce((sum, h) => sum + (h.commission || 0), 0);
      
      message += `📊 *Общая статистика:*\n`;
      message += `├ 💱 Всего обменено: \`${formatNumber(totalExchanged)}\` Stars\n`;
      message += `├ ⭐ Получено Stars: \`${formatNumber(totalStars)}\`\n`;
      message += `└ 💸 Уплачено комиссий: \`${formatNumber(totalCommission)}\` Stars\n`;
    } else {
      message += `❌ У вас пока нет истории обменов\n`;
      message += `💡 Совершите первый обмен, чтобы увидеть статистику!`;
    }
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ истории обменов');
    await ctx.answerCbQuery('❌ Ошибка загрузки истории');
  }
}

// Функция для показа настроек биржи
async function showExchangeSettings(ctx, user) {
  try {
    log(`⚙️ Показ настроек биржи для пользователя ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔔 Уведомления', 'exchange_notifications'),
        Markup.button.callback('📊 Автообмен', 'exchange_auto')
      ],
      [
        Markup.button.callback('🎯 Лимиты', 'exchange_limits'),
        Markup.button.callback('🔒 Безопасность', 'exchange_security')
      ],
      [Markup.button.callback('🔙 Назад', 'exchange')]
    ]);
    
    const message = 
      `⚙️ *Настройки биржи*\n\n` +
      `🔔 *Уведомления:*\n` +
      `├ Изменение курса: ${user.exchangeSettings?.priceAlerts ? '✅' : '❌'}\n` +
      `├ Успешные обмены: ${user.exchangeSettings?.successAlerts ? '✅' : '❌'}\n` +
      `└ Ошибки обмена: ${user.exchangeSettings?.errorAlerts ? '✅' : '❌'}\n\n` +
      `📊 *Автообмен:*\n` +
      `├ Автоматический обмен: ${user.exchangeSettings?.autoExchange ? '✅' : '❌'}\n` +
      `├ Лимит автобмена: \`${user.exchangeSettings?.autoLimit || 0}\` Stars\n` +
      `└ Целевой курс: \`${user.exchangeSettings?.targetRate || 0}\` Stars\n\n` +
      `🎯 *Лимиты:*\n` +
      `├ Максимум за раз: \`${user.exchangeSettings?.maxAmount || 'Не ограничено'}\` Stars\n` +
      `├ Минимум за раз: \`${user.exchangeSettings?.minAmount || 1}\` Stars\n` +
      `└ Дневной лимит: \`${user.exchangeSettings?.dailyLimit || 'Не ограничено'}\` Stars\n\n` +
      `🔒 *Безопасность:*\n` +
      `├ Подтверждение обменов: ${user.exchangeSettings?.confirmExchanges ? '✅' : '❌'}\n` +
      `├ 2FA для обменов: ${user.exchangeSettings?.require2FA ? '✅' : '❌'}\n` +
      `└ Логирование: ${user.exchangeSettings?.logExchanges ? '✅' : '❌'}\n\n` +
      `💡 Выберите настройку для изменения:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ настроек биржи');
    await ctx.answerCbQuery('❌ Ошибка загрузки настроек');
  }
}

// Функция для показа новостей биржи
async function showExchangeNews(ctx, user) {
  try {
    log(`📰 Показ новостей биржи для пользователя ${user.id}`);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📈 Аналитика', 'news_analytics'),
        Markup.button.callback('📊 Отчеты', 'news_reports')
      ],
      [
        Markup.button.callback('🔔 Обновления', 'news_updates'),
        Markup.button.callback('📰 Новости', 'news_latest')
      ],
      [Markup.button.callback('🔙 Назад', 'exchange')]
    ]);
    
    const currentRate = await calculateExchangeRate();
    const reserve = await db.collection('reserve').findOne({ currency: 'main' });
    const magnuStarsoinsReserve = reserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS;
    
    const message = 
      `📰 *Новости Magnum Exchange*\n\n` +
      `📅 *${new Date().toLocaleDateString('ru-RU')}*\n\n` +
      `📈 *Рыночные новости:*\n` +
      `├ Курс Magnum Coin стабилен\n` +
      `├ Резерв биржи: \`${formatNumber(magnuStarsoinsReserve)}\` Stars\n` +
      `└ Ликвидность: ${((magnuStarsoinsReserve / config.INITIAL_RESERVE_MAGNUM_COINS) * 100).toFixed(1)}%\n\n` +
      `🔔 *Последние обновления:*\n` +
      `├ ✅ Улучшена система безопасности\n` +
      `├ ✅ Добавлены новые функции аналитики\n` +
      `├ ✅ Оптимизирована скорость обменов\n` +
      `└ ✅ Расширен резерв биржи\n\n` +
      `📊 *Аналитика:*\n` +
      `├ Тренд: ${currentRate > 0.001 ? '📈 Растущий' : '📉 Падающий'}\n` +
      `├ Волатильность: Низкая\n` +
      `└ Рекомендация: ${currentRate > 0.001 ? 'Покупать' : 'Продавать'}\n\n` +
      `💡 Выберите раздел для подробной информации:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ новостей биржи');
    await ctx.answerCbQuery('❌ Ошибка загрузки новостей');
  }
}

async function performExchange(ctx, user, amount) {
  try {
    log(`💱 Попытка обмена ${amount} Stars для пользователя ${user.id}`);
    
    if (amount > user.magnuStarsoins) {
      log(`❌ Недостаточно Stars для пользователя ${user.id}`);
      await ctx.reply('❌ Недостаточно Stars для обмена!');
      return;
    }
    
    if (amount <= 0) {
      log(`❌ Некорректная сумма обмена для пользователя ${user.id}`);
      await ctx.reply('❌ Некорректная сумма обмена!');
      return;
    }
    

    
    // Получаем текущий курс обмена
    const exchangeRate = await calculateExchangeRate();
    
    // Рассчитываем комиссию
    const commission = (amount * config.EXCHANGE_COMMISSION) / 100;
    const amountAfterCommission = amount - commission;
    const starsToReceive = amountAfterCommission * exchangeRate;
    
    // Проверяем резерв Stars
    const reserve = await db.collection('reserve').findOne({ currency: 'main' });
    const availableStars = reserve?.stars || config.INITIAL_RESERVE_STARS;
    
    if (starsToReceive > availableStars) {
      log(`❌ Недостаточно Stars в резерве для пользователя ${user.id}`);
      await ctx.reply('❌ Недостаточно Stars в резерве для обмена!');
      return;
    }
    
    // Обновляем пользователя
    log(`💾 Обновление базы данных для пользователя ${user.id}`);
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $inc: { 
          magnuStarsoins: -amount,
          stars: starsToReceive,
          'exchange.totalExchanges': 1,
          'exchange.totalExchanged': amount,
          'statistics.totalActions': 1
        },
        $set: { 
          updatedAt: new Date()
        }
      }
    );
    
    // Обновляем резерв
    // Комиссия остается в резерве Stars, а обменная сумма уходит на покупку Stars
    await db.collection('reserve').updateOne(
      { currency: 'main' },
      { 
        $inc: { 
          magnuStarsoins: commission, // Только комиссия остается в резерве Stars
          stars: -starsToReceive    // Stars уходят пользователю
        },
        $set: { 
          updatedAt: new Date()
        }
      }
    );
    
    // Сохраняем историю обмена
    await db.collection('exchangeHistory').insertOne({
      userId: user.id,
      magnuStarsoinsAmount: amount,
      starsReceived: starsToReceive,
      exchangeRate: exchangeRate,
      commission: commission,
      timestamp: new Date(),
      userFirstName: user.firstName,
      userUsername: user.username
    });
    
    // Сохраняем историю курсов
    await db.collection('exchangeHistory').insertOne({
      type: 'rate_update',
      rate: exchangeRate,
      timestamp: new Date(),
      magnuStarsoinsReserve: reserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS,
      starsReserve: reserve?.stars || config.INITIAL_RESERVE_STARS
    });
    
    log(`🗑️ Очистка кеша для пользователя ${user.id}`);
    userCache.delete(user.id);
    
    // Обновляем прогресс ежедневного задания "Трейдер дня"
    await updateDailyTaskProgress(user, 'daily_exchange', 1);
    
    log(`✅ Обмен успешно выполнен для пользователя ${user.id}: ${amount} Stars → ${starsToReceive} Stars (курс: ${exchangeRate}, комиссия: ${commission})`);
    log(`💰 Комиссия ${commission} Stars добавлена в резерв биржи`);
    await ctx.reply(
      `✅ Обмен выполнен! ${formatNumber(amount)} Stars → ${formatNumber(starsToReceive)} Stars\n💸 Комиссия: ${formatNumber(commission)} Stars (${config.EXCHANGE_COMMISSION}%)`
    );
    
    // Автоматически обновляем меню биржи после успешного обмена
    const updatedUser = await getUser(ctx.from.id);
    if (updatedUser) {
      await showExchangeMenu(ctx, updatedUser);
    }
  } catch (error) {
    logError(error, 'Обмен Stars на Stars');
    await ctx.reply('❌ Ошибка обмена');
  }
}
// Функция для обмена Stars на Stars
async function performStarsToStarsExchange(ctx, user, starsAmount) {
  try {
    log(`💱 Попытка обмена ${starsAmount} Stars на Stars для пользователя ${user.id}`);
    
    if (starsAmount > user.stars) {
      log(`❌ Недостаточно Stars для пользователя ${user.id}`);
      await ctx.reply('❌ Недостаточно Stars для обмена!');
      return;
    }
    
    if (starsAmount <= 0) {
      log(`❌ Некорректная сумма обмена для пользователя ${user.id}`);
      await ctx.reply('❌ Некорректная сумма обмена!');
      return;
    }
    
    // Получаем текущий курс обмена
    const exchangeRate = await calculateExchangeRate();
    
    // Рассчитываем комиссию в Stars
    const commission = (starsAmount * config.EXCHANGE_COMMISSION) / 100;
    const starsAfterCommission = starsAmount - commission;
    const StarsToReceive = starsAfterCommission / exchangeRate;
    
    // Проверяем резерв Stars
    const reserve = await db.collection('reserve').findOne({ currency: 'main' });
    const availableStars = reserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS;
    
    if (StarsToReceive > availableStars) {
      log(`❌ Недостаточно Stars в резерве для пользователя ${user.id}`);
      await ctx.reply('❌ Недостаточно Stars в резерве для обмена!');
      return;
    }
    
    // Обновляем пользователя
    log(`💾 Обновление базы данных для пользователя ${user.id}`);
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $inc: { 
          stars: -starsAmount,
          magnuStarsoins: StarsToReceive,
          'exchange.totalExchanges': 1,
          'exchange.totalExchanged': StarsToReceive,
          'statistics.totalActions': 1
        },
        $set: { 
          updatedAt: new Date()
        }
      }
    );
    
    // Обновляем резерв
    // Комиссия остается в резерве Stars, а обменная сумма уходит на покупку Stars
    await db.collection('reserve').updateOne(
      { currency: 'main' },
      { 
        $inc: { 
          stars: commission, // Только комиссия остается в резерве Stars
          magnuStarsoins: -StarsToReceive    // Stars уходят пользователю
        },
        $set: { 
          updatedAt: new Date()
        }
      }
    );
    
    // Сохраняем историю обмена
    await db.collection('exchangeHistory').insertOne({
      userId: user.id,
      starsAmount: starsAmount,
      magnuStarsoinsReceived: StarsToReceive,
      exchangeRate: exchangeRate,
      commission: commission,
      commissionType: 'stars',
      timestamp: new Date(),
      userFirstName: user.firstName,
      userUsername: user.username
    });
    
    // Сохраняем историю курсов
    await db.collection('exchangeHistory').insertOne({
      type: 'rate_update',
      rate: exchangeRate,
      timestamp: new Date(),
      magnuStarsoinsReserve: reserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS,
      starsReserve: reserve?.stars || config.INITIAL_RESERVE_STARS
    });
    
    log(`🗑️ Очистка кеша для пользователя ${user.id}`);
    userCache.delete(user.id);
    
    // Обновляем прогресс ежедневного задания "Трейдер дня"
    await updateDailyTaskProgress(user, 'daily_exchange', 1);
    
    log(`✅ Обмен успешно выполнен для пользователя ${user.id}: ${starsAmount} Stars → ${StarsToReceive} Stars (курс: ${exchangeRate}, комиссия: ${commission} Stars)`);
    log(`💰 Комиссия ${commission} Stars добавлена в резерв биржи`);
    await ctx.reply(
      `✅ Обмен выполнен! ${formatNumber(starsAmount)} Stars → ${formatNumber(StarsToReceive)} Stars\n💸 Комиссия: ${formatNumber(commission)} Stars (${config.EXCHANGE_COMMISSION}%)`
    );
    
    // Автоматически обновляем меню биржи после успешного обмена
    const updatedUser = await getUser(ctx.from.id);
    if (updatedUser) {
      await showExchangeMenu(ctx, updatedUser);
    }
  } catch (error) {
    logError(error, 'Обмен валют');
    await ctx.reply('❌ Ошибка обмена');
  }
}

// Функция для обработки ввода суммы Stars для обмена
async function handleExchangeCustomStars(ctx, user, text) {
  try {
    log(`🪙 Пользователь ${user.id} вводит сумму Stars для обмена: "${text}"`);
    
    const amount = parseFloat(text);
    
    // Валидация суммы
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Неверная сумма! Введите положительное число.');
      return;
    }
    
    if (amount > user.magnuStarsoins) {
      await ctx.reply(`❌ Недостаточно Stars! У вас: ${formatNumber(user.magnuStarsoins)} Stars`);
      return;
    }
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    // Выполняем обмен
    await performExchange(ctx, user, amount);
    
  } catch (error) {
    logError(error, `Обработка ввода суммы Stars для обмена пользователем ${user.id}`);
    await ctx.reply('❌ Ошибка обработки суммы. Попробуйте позже.');
  }
}

// Функция для обработки ввода суммы Stars для обмена
async function handleExchangeCustomStars(ctx, user, text) {
  try {
    log(`⭐ Пользователь ${user.id} вводит сумму Stars для обмена: "${text}"`);
    
    const amount = parseFloat(text);
    
    // Валидация суммы
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Неверная сумма! Введите положительное число.');
      return;
    }
    
    if (amount > user.stars) {
      await ctx.reply(`❌ Недостаточно Stars! У вас: ${formatNumber(user.stars)} Stars`);
      return;
    }
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    // Выполняем обмен
    await performStarsToStarsExchange(ctx, user, amount);
    
  } catch (error) {
    logError(error, `Обработка ввода суммы Stars для обмена пользователем ${user.id}`);
    await ctx.reply('❌ Ошибка обработки суммы. Попробуйте позже.');
  }
}

// ==================== ДОСТИЖЕНИЯ ====================
// Функции достижений удалены
function getAchievementsList(user) {
  // Убеждаемся, что все необходимые поля существуют
  const farStarsount = user.farm?.farStarsount || 0;
  const magnuStarsoins = user.magnuStarsoins || 0;
  const level = user.level || 1;
  const referralsCount = user.referralsCount || 0;
  const dailyStreak = user.dailyBonus?.streak || 0;
  const totalExchanges = user.exchange?.totalExchanges || 0;
  
  return [
    {
      id: 'first_farm',
      title: '🌾 Первый фарм',
      description: 'Выполните первый фарм',
      condition: farStarsount >= 1,
      progress: farStarsount,
      target: 1,
      reward: '10 Stars'
    },
    {
      id: 'farm_master',
      title: '👑 Мастер фарма',
      description: 'Выполните 100 фармов',
      condition: farStarsount >= 100,
      progress: farStarsount,
      target: 100,
      reward: '500 Stars'
    },
    {
      id: 'magnum_collector',
      title: '🪙 Коллекционер Magnum',
      description: 'Накопите 1000 Stars',
      condition: magnuStarsoins >= 1000,
      progress: magnuStarsoins,
      target: 1000,
      reward: '200 Stars'
    },
    {
      id: 'exchange_trader',
      title: '💱 Трейдер',
      description: 'Выполните 50 обменов',
      condition: totalExchanges >= 50,
      progress: totalExchanges,
      target: 50,
      reward: '300 Stars'
    },
    {
      id: 'level_10',
      title: '⭐ Уровень 10',
      description: 'Достигните 10 уровня',
      condition: level >= 10,
      progress: level,
      target: 10,
      reward: '100 Stars'
    },
    {
      id: 'level_50',
      title: '⭐⭐ Уровень 50',
      description: 'Достигните 50 уровня',
      condition: level >= 50,
      progress: level,
      target: 50,
      reward: '1000 Stars'
    },
    {
      id: 'referral_king',
      title: '👥 Король рефералов',
      description: 'Пригласите 10 рефералов',
      condition: referralsCount >= 10,
      progress: referralsCount,
      target: 10,
      reward: '400 Stars'
    },
    {
      id: 'daily_streak',
      title: '🔥 Серия дней',
      description: 'Получите бонус 7 дней подряд',
      condition: dailyStreak >= 7,
      progress: dailyStreak,
      target: 7,
      reward: '150 Stars'
    }
  ];
}

// Функция для проверки и выдачи достижений
async function checkAndUpdateAchievements(user) {
  try {
    log(`🏆 Проверка достижений для пользователя ${user.id}`);
    
    const achievements = getAchievementsList(user);
    const userAchievements = user.achievements || [];
    const userAchievementsProgress = user.achievementsProgress || {};
    
    let newAchievements = [];
    let totalReward = 0;
    
    // Проверяем каждое достижение
    for (const achievement of achievements) {
      // Если достижение выполнено и еще не получено
      if (achievement.condition && !userAchievements.includes(achievement.id)) {
        newAchievements.push(achievement);
        
        // Вычисляем награду
        const rewardAmount = parseInt(achievement.reward.split(' ')[0]);
        totalReward += rewardAmount;
        
        log(`🎉 Пользователь ${user.id} получил достижение: ${achievement.title} (${achievement.reward})`);
      }
      
      // Обновляем прогресс
      userAchievementsProgress[achievement.id] = {
        progress: achievement.progress,
        target: achievement.target,
        completed: achievement.condition,
        lastUpdated: new Date()
      };
    }
    
    // Если есть новые достижения, выдаем награды
    if (newAchievements.length > 0) {
      await db.collection('users').updateOne(
        { id: user.id },
        { 
          $inc: { 
            magnuStarsoins: totalReward,
            totalEarnedMagnuStarsoins: totalReward,
            experience: Math.floor(totalReward * 5),
            achievementsCount: newAchievements.length
          },
          $push: { 
            achievements: { $each: newAchievements.map(a => a.id) }
          },
          $set: { 
            achievementsProgress: userAchievementsProgress,
            updatedAt: new Date()
          }
        }
      );
      
      // Очищаем кеш
      userCache.delete(user.id);
      
      log(`✅ Пользователь ${user.id} получил ${newAchievements.length} новых достижений, награда: ${totalReward} Stars`);
      
      return {
        newAchievements,
        totalReward,
        totalAchievements: (user.achievements || []).length + newAchievements.length
      };
    }
    
    return {
      newAchievements: [],
      totalReward: 0,
      totalAchievements: user.achievements?.length || 0
    };
    
  } catch (error) {
    logError(error, `Проверка достижений для пользователя ${user.id}`);
    return {
      newAchievements: [],
      totalReward: 0,
      totalAchievements: user.achievements?.length || 0
    };
  }
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
    message += `├ Всего наград: \`${totalRewards} Stars\`\n`;
    message += `└ Средняя награда: \`${completedAchievements.length > 0 ? Math.round(totalRewards / completedAchievements.length) : 0} Stars\`\n\n`;
    
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
        message += `└ Награды: \`${totalReward} Stars\`\n\n`;
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
      `├ Заработано: \`${formatNumber(user.referralsEarnings || 0)}\` Stars\n` +
      `└ Уровень: \`${getReferralLevel(user.referralsCount || 0)}\`\n\n` +
      `💰 *Награды за рефералов:*\n` +
      `├ За каждого реферала: \`${config.REFERRAL_REWARD || 10}\` Stars\n` +
      `├ Бонус за 5 рефералов: \`50\` Stars\n` +
      `└ Бонус за 10 рефералов: \`100\` Stars\n\n` +
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
      `💰 *Награда:* \`${config.REFERRAL_REWARD || 10}\` Stars за каждого реферала\n\n` +
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
    message += `├ Заработано: \`${formatNumber(user.referralsEarnings || 0)}\` Stars\n`;
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
    message += `├ 5 рефералов: \`50\` Stars (бонус)\n`;
    message += `├ 10 рефералов: \`100\` Stars (бонус)\n`;
    message += `├ 25 рефералов: \`250\` Stars (бонус)\n`;
    message += `└ 50 рефералов: \`500\` Stars (бонус)\n\n`;
    
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
          magnuStarsoins: 1
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
        message += `├ Stars: \`${formatNumber(referral.magnuStarsoins || 0)}\`\n`;
        message += `└ Присоединился: ${timeText}\n\n`;
      });
      
      if (referrals.length > 10) {
        message += `... и еще \`${referrals.length - 10}\` рефералов\n\n`;
      }
      
      // Статистика активности рефералов
      const activeReferrals = referrals.filter(r => r.level > 1);
      const totalReferralStars = referrals.reduce((sum, r) => sum + (r.stars || 0), 0);
      const totalReferralMagnum = referrals.reduce((sum, r) => sum + (r.magnuStarsoins || 0), 0);
      
      message += `📈 *Статистика рефералов:*\n`;
      message += `├ Активных: \`${activeReferrals.length}\`\n`;
      message += `├ Всего Stars у рефералов: \`${formatNumber(totalReferralStars)}\`\n`;
      message += `└ Всего Stars у рефералов: \`${formatNumber(totalReferralMagnum)}\`\n\n`;
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
      [
        Markup.button.callback('🎖 Титулы', 'titles'),
        Markup.button.callback('⚔️ Ранги', 'ranks')
      ],
      [
        Markup.button.callback('🆘 Поддержка', 'support')
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

// ==================== ПРОФИЛЬ ====================
async function showProfileMenu(ctx, user) {
  try {
    log(`👤 Показ меню профиля для пользователя ${user.id}`);
    
    const rankProgress = await getRankProgress(user);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🎖 Титулы', 'titles'),
        Markup.button.callback('⚔️ Ранги', 'ranks')
      ],
      [
        Markup.button.callback('🔔 Уведомления', 'settings_notifications'),
        Markup.button.callback('🔒 Приватность', 'settings_privacy')
      ],
      [
        Markup.button.callback('🌐 Язык', 'settings_language'),
        Markup.button.callback('🔄 Сброс', 'settings_reset')
      ],
      [
        Markup.button.callback('🆘 Поддержка', 'support')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ]);
    
    const message = 
      `👤 *Профиль пользователя*\n\n` +
      `👤 *Основная информация:*\n` +
      `├ Имя: ${user.firstName || 'Не указано'}\n` +
      `├ Username: ${user.username ? '@' + user.username : 'Не указан'}\n` +
      `├ ID: \`${user.id}\`\n` +
      `├ Уровень: ${user.level || 1}\n` +
      `├ Опыт: ${formatNumber(user.experience || 0)}/${formatNumber(getRequiredExperience(user.level || 1))}\n` +
      `└ Дата регистрации: ${user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru-RU') : 'Неизвестно'}\n\n` +
      `💰 *Балансы:*\n` +
      `├ 🪙 Magnum Coins: ${formatNumber(user.magnuStarsoins || 0)}\n` +
      `├ ⭐ Stars: ${formatNumber(user.stars || 0)}\n` +
      `└ Всего заработано: ${formatNumber((user.totalEarnedMagnuStarsoins || 0) + (user.totalEarnedStars || 0))}\n\n` +
      `🎯 *Статистика:*\n` +
      `├ Рефералов: ${user.referralsCount || 0}\n` +
      `└ Ранг: ${rankProgress.current.name}\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ меню профиля');
    await ctx.answerCbQuery('❌ Ошибка загрузки профиля');
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
      `├ Настройки языка\n` +
      `└ Другие пользовательские настройки\n\n` +
      `✅ *Что НЕ будет затронуто:*\n` +
      `├ Ваш прогресс в игре\n` +
      `├ Балансы (Stars, Stars)\n` +
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
    
    // Подсчитываем статус RichAds офферов
    const sponsorTasks = await getRichAdsTasks();
    log(`📋 Получены RichAds офферы: ${sponsorTasks.length} офферов`);
    
    const userSponsorTasks = tasks.sponsorTasks || {};
    const completedSponsorTasks = Object.values(userSponsorTasks).filter(task => task && task.completed).length;
    const totalSponsorTasks = sponsorTasks.length;
    
    log(`📋 Статистика RichAds офферов: ${completedSponsorTasks}/${totalSponsorTasks} выполнено`);
    
    let sponsorStatus = '';
    if (completedSponsorTasks === 0) {
      sponsorStatus = '🔄';
    } else if (completedSponsorTasks === totalSponsorTasks) {
      sponsorStatus = '✅';
    } else {
      sponsorStatus = '🎁';
    }
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(`${sponsorStatus} RichAds офферы`, 'tasks_sponsor'),
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
      `├ 🎯 RichAds офферы (подписки, установки, регистрации)\n` +
      `├ 📅 Ежедневные задания (фарм, майнинг, бонусы)\n` +
      `└ 🏆 Достижения (долгосрочные цели)\n\n` +
      `💡 *Выберите тип заданий:*\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Меню заданий успешно показано пользователю ${user.id}`);
  } catch (error) {
    logError(error, 'Показ меню заданий');
    log(`❌ Ошибка в showTasksMenu для пользователя ${user.id}: ${error.message}`);
    await ctx.answerCbQuery('❌ Ошибка загрузки меню заданий');
  }
}

async function showSponsorTasks(ctx, user) {
  try {
    logAction(user.id, 'showSponsorTasks', 'Начало показа RichAds офферов');
    log(`🎯 Показ RichAds офферов для пользователя ${user.id}`);
    
    const sponsorTasks = await getRichAdsTasks();
    logAction(user.id, 'getRichAdsTasks', { count: sponsorTasks.length, offers: sponsorTasks.map(o => ({ id: o.id, title: o.title })) });
    log(`🎯 Получены RichAds офферы: ${sponsorTasks.length} офферов`);
    
    const userTasks = user.tasks?.sponsorTasks || {};
    log(`🎯 Офферы пользователя: ${JSON.stringify(userTasks)}`);
    
    // Находим первый невыполненный оффер
    const firstUncompletedTask = sponsorTasks.find(task => {
      const userTask = userTasks[task.id];
      // Если оффер не существует в userTasks или не завершен/не получена награда
      return !userTask || !userTask.completed || !userTask.claimed;
    });
    
    if (firstUncompletedTask) {
      // Показываем первый невыполненный оффер
      logAction(user.id, 'showFirstUncompletedTask', { taskId: firstUncompletedTask.id, taskTitle: firstUncompletedTask.title });
      await showSponsorTaskDetails(ctx, user, firstUncompletedTask.id);
    } else {
      // Все офферы выполнены - показываем общий список
      const taskButtons = [];
      sponsorTasks.forEach((task, index) => {
        const userTask = userTasks[task.id];
        // Показываем только те офферы, которые существуют в userTasks и завершены
        if (userTask && userTask.completed && userTask.claimed) {
          taskButtons.push([
            Markup.button.callback(`✅ ${task.title} (Завершено)`, `sponsor_task_${task.id}`)
          ]);
        }
      });
      
      taskButtons.push([
        Markup.button.callback('🔙 Назад', 'tasks')
      ]);
      
      const keyboard = Markup.inlineKeyboard(taskButtons);
      
      let message = `✅ *Все RichAds офферы выполнены!*\n\n`;
      message += `🎉 Поздравляем! Вы выполнили все доступные RichAds офферы.\n\n`;
      
      sponsorTasks.forEach((task, index) => {
        const userTask = userTasks[task.id];
        // Показываем только те офферы, которые существуют в userTasks и завершены
        if (userTask && userTask.completed && userTask.claimed) {
          const rewardText = task.rewardType === 'stars' ? `${task.reward} ⭐ Stars` : `${task.reward} 🪙 Magnum Coins`;
          message += `✅ *${escapeMarkdown(task.title)}*\n`;
          message += `├ Награда: \`${escapeMarkdown(rewardText)}\` ✅ Получена\n`;
          message += `└ Сложность: ${escapeMarkdown(task.difficulty)}\n\n`;
        }
      });
      
      message += `🎯 Выберите действие:`;
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    }
    
    logAction(user.id, 'showSponsorTasks', 'Успешно завершено');
    log(`✅ RichAds офферы успешно показаны пользователю ${user.id}`);
  } catch (error) {
    logErrorWithContext(error, 'showSponsorTasks', user.id);
    logError(error, 'Показ RichAds офферов');
    log(`❌ Ошибка в showSponsorTasks для пользователя ${user.id}: ${error.message}`);
    await ctx.answerCbQuery('❌ Ошибка загрузки RichAds офферов');
  }
}
async function showSponsorTaskDetails(ctx, user, taskId) {
  try {
    logAction(user.id, 'showSponsorTaskDetails', { taskId, action: 'начало' });
    log(`🎯 Показ деталей RichAds оффера ${taskId} для пользователя ${user.id}`);
    
    const sponsorTasks = await getRichAdsTasks();
    const task = sponsorTasks.find(t => t.id === taskId);
    
    logAction(user.id, 'findTaskInDetails', { taskId, taskFound: !!task, taskTitle: task?.title });
    
    if (!task) {
      logAction(user.id, 'taskNotFoundInDetails', { taskId });
      await ctx.answerCbQuery('❌ Задание не найдено');
      return;
    }
    
    const userTasks = user.tasks?.sponsorTasks || {};
    const userTask = userTasks[taskId] || {};
    const isCompleted = userTask.completed || false;
    const isClaimed = userTask.claimed || false;
    const hasScreenshot = userTask.screenshot || false;
    
    // Если задание полностью завершено (выполнено и получена награда)
    if (isCompleted && isClaimed) {
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад', 'tasks_sponsor')]
      ]);
      
      const rewardText = task.rewardType === 'stars' ? `${task.reward} ⭐ Stars` : `${task.reward} 🪙 Magnum Coins`;
      
      let message = `✅ *${escapeMarkdown(task.title)}*\n\n`;
      message += `📝 *Описание:*\n${escapeMarkdown(task.description)}\n\n`;
      message += `💰 *Награда:* \`${escapeMarkdown(rewardText)}\` ✅ Получена\n`;
      message += `⭐ *Сложность:* ${escapeMarkdown(task.difficulty)}\n`;
      message += `⏰ *Время выполнения:* ${escapeMarkdown(task.estimatedTime)}\n\n`;
      message += `🎉 *Задание полностью выполнено\\!*\n`;
      message += `✅ Скриншот одобрен\n`;
      message += `🎁 Награда получена\n`;
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      return;
    }
    
    // Если задание выполнено, но награда не получена
    if (isCompleted && !isClaimed) {
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🎁 Получить награду', `claim_sponsor_${taskId}`)],
        [Markup.button.callback('🔙 Назад', 'tasks_sponsor')]
      ]);
      
      const rewardText = task.rewardType === 'stars' ? `${task.reward} ⭐ Stars` : `${task.reward} 🪙 Magnum Coins`;
      
      let message = `🎁 *${escapeMarkdown(task.title)}*\n\n`;
      message += `📝 *Описание:*\n${escapeMarkdown(task.description)}\n\n`;
      message += `💰 *Награда:* \`${escapeMarkdown(rewardText)}\` 🎁 Готова к получению\n`;
      message += `⭐ *Сложность:* ${escapeMarkdown(task.difficulty)}\n`;
      message += `⏰ *Время выполнения:* ${escapeMarkdown(task.estimatedTime)}\n\n`;
      message += `✅ *Скриншот одобрен\\!*\n`;
      message += `🎁 Получите награду за выполнение задания\n`;
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      return;
    }
    
    // Если скриншот отправлен, но не проверен
    if (hasScreenshot && !isCompleted) {
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Проверить выполнение', `verify_sponsor_${taskId}`)],
        [Markup.button.callback('📸 Отправить новый скриншот', `send_screenshot_${taskId}`)],
        [Markup.button.callback('🔙 Назад', 'tasks_sponsor')]
      ]);
      
      const rewardText = task.rewardType === 'stars' ? `${task.reward} ⭐ Stars` : `${task.reward} 🪙 Magnum Coins`;
      
      let message = `📸 *${escapeMarkdown(task.title)}*\n\n`;
      message += `📝 *Описание:*\n${escapeMarkdown(task.description)}\n\n`;
      message += `💰 *Награда:* \`${escapeMarkdown(rewardText)}\`\n`;
      message += `⭐ *Сложность:* ${escapeMarkdown(task.difficulty)}\n`;
      message += `⏰ *Время выполнения:* ${escapeMarkdown(task.estimatedTime)}\n\n`;
      message += `📸 *Скриншот отправлен*\n`;
      message += `⏳ Ожидает проверки администратором\n`;
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      return;
    }
    
    // Если задание не начато или скриншот отклонен
    const allSponsorTasks = await getRichAdsTasks();
    
    // Проверяем, есть ли следующее задание
    const hasNextTask = allSponsorTasks.some(t => {
      if (t.id === taskId) return false; // Пропускаем текущее задание
      const userTask = userTasks[t.id] || {};
      return !userTask.completed || !userTask.claimed;
    });
    
    let keyboardButtons = [
      [
        Markup.button.url('📱 Подписаться', task.url),
        Markup.button.callback('📸 Отправить скриншот', `send_screenshot_${taskId}`)
      ]
    ];
    
    if (hasNextTask) {
      keyboardButtons.push([
        Markup.button.callback('⏭️ Следующее задание', 'next_sponsor_task')
      ]);
    }
    
    keyboardButtons.push([
      Markup.button.callback('🔙 Назад', 'tasks_sponsor')
    ]);
    
    const keyboard = Markup.inlineKeyboard(keyboardButtons);
    
    const rewardText = task.rewardType === 'stars' ? `${task.reward} ⭐ Stars` : `${task.reward} 🪙 Magnum Coins`;
    
    let message = `🔄 *${escapeMarkdown(task.title)}*\n\n`;
    message += `📝 *Описание:*\n${escapeMarkdown(task.description)}\n\n`;
    message += `💰 *Награда:* \`${escapeMarkdown(rewardText)}\`\n`;
    message += `⭐ *Сложность:* ${escapeMarkdown(task.difficulty)}\n`;
    message += `⏰ *Время выполнения:* ${escapeMarkdown(task.estimatedTime)}\n\n`;
    
    if (task.requirements && Array.isArray(task.requirements)) {
      message += `📋 *Требования:*\n`;
      task.requirements.forEach(req => {
        message += `├ ${escapeMarkdown(req)}\n`;
      });
      message += `\n`;
    } else if (task.requirements && typeof task.requirements === 'string') {
      message += `📋 *Требования:*\n`;
      message += `├ ${escapeMarkdown(task.requirements)}\n\n`;
    }
    
    message += `🔄 *Статус:* Задание не выполнено\n`;
    message += `📱 Подпишитесь на канал и отправьте скриншот\n`;
    
    message += `\n🎯 Выберите действие:`;
    
    log(`🎯 Сообщение для задания ${taskId} (полное): ${message}`);
    
    try {
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    } catch (error) {
      // Если не удалось отредактировать, отправляем новое сообщение
      logError(error, 'Редактирование сообщения задания');
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    }
  } catch (error) {
    logError(error, 'Показ деталей спонсорского задания');
    // Проверяем, поддерживает ли контекст answerCbQuery
    if (ctx.answerCbQuery) {
      try {
        await ctx.answerCbQuery('❌ Ошибка загрузки деталей задания');
      } catch (cbError) {
        logError(cbError, 'Ошибка answerCbQuery');
      }
    }
  }
}

async function verifySponsorTask(ctx, user, taskId) {
  try {
    log(`✅ Проверка выполнения RichAds оффера ${taskId} для пользователя ${user.id}`);
    
    const sponsorTasks = await getRichAdsTasks();
    const task = sponsorTasks.find(t => t.id === taskId);
    
    if (!task) {
      await ctx.answerCbQuery('❌ Оффер не найден');
      return;
    }
    
    const userTasks = user.tasks?.sponsorTasks || {};
    const userTask = userTasks[taskId] || {};
    
    if (userTask.completed && userTask.claimed) {
      await ctx.answerCbQuery('❌ Оффер уже выполнен и награда получена');
      return;
    }
    
    if (userTask.completed && !userTask.claimed) {
      await ctx.answerCbQuery('🎁 Оффер выполнен! Получите награду');
      return;
    }
    
    if (!userTask.screenshot) {
      await ctx.answerCbQuery('❌ Сначала отправьте скриншот выполнения');
      return;
    }
    
    // Проверяем, что скриншот был отправлен недавно (в течение 24 часов)
    const screenshotTime = userTask.screenshotAt;
    const hoursSinceScreenshot = screenshotTime ? (Date.now() - screenshotTime.getTime()) / (1000 * 60 * 60) : 0;
    
    if (hoursSinceScreenshot > 24) {
      await ctx.answerCbQuery('❌ Скриншот устарел. Отправьте новый скриншот');
      return;
    }
    
    // Верифицируем оффер через RichAds API
    log(`✅ Верификация RichAds оффера ${taskId} для пользователя ${user.id}`);
    
    const verificationResult = await verifyRichAdsOffer(taskId, user.id);
    
    if (!verificationResult.success) {
      await ctx.answerCbQuery('❌ Ошибка проверки оффера');
      return;
    }
    
    if (!verificationResult.verified) {
      await ctx.answerCbQuery('❌ Оффер не выполнен корректно');
      return;
    }
    
    // Отмечаем оффер как выполненный
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
    
    const rewardText = task.rewardType === 'stars' ? `${task.reward} ⭐ Stars` : `${task.reward} 🪙 Magnum Coins`;
    log(`✅ RichAds оффер ${taskId} выполнен пользователем ${user.id}`);
    await ctx.answerCbQuery(`✅ Оффер выполнен! Награда: ${rewardText}`);
    
    // Обновляем детали оффера
    const updatedUser = await getUser(ctx.from.id);
    if (updatedUser) {
      await showSponsorTaskDetails(ctx, updatedUser, taskId);
    }
  } catch (error) {
    logError(error, 'Проверка RichAds оффера');
    await ctx.answerCbQuery('❌ Ошибка проверки оффера');
  }
}
async function claimSponsorTask(ctx, user, taskId) {
  try {
    log(`🎁 Получение награды RichAds оффера ${taskId} для пользователя ${user.id}`);
    
    const sponsorTasks = await getRichAdsTasks();
    const task = sponsorTasks.find(t => t.id === taskId);
    
    if (!task) {
      await ctx.answerCbQuery('❌ Оффер не найден');
      return;
    }
    
    const userTasks = user.tasks?.sponsorTasks || {};
    const userTask = userTasks[taskId] || {};
    
    if (!userTask.completed) {
      await ctx.answerCbQuery('❌ Оффер не выполнен');
      return;
    }
    
    if (userTask.claimed) {
      await ctx.answerCbQuery('❌ Награда уже получена');
      return;
    }
    
    // Отправляем конверсию в RichAds
    log(`🔄 Отправка конверсии в RichAds для оффера ${taskId}`);
    const conversionResult = await sendRichAdsConversion(taskId, user.id, 1);
    
    if (!conversionResult.success) {
      log(`❌ Ошибка отправки конверсии в RichAds: ${conversionResult.message}`);
      // Продолжаем выдачу награды даже если конверсия не отправлена
    }
    
    // Начисляем награду
    const rewardType = task.rewardType || 'stars';
    const updateData = { 
      $inc: { 
        'tasks.completedTasks': 1,
        'tasks.totalTaskEarnings': task.reward
      },
      $set: { 
        [`tasks.sponsorTasks.${taskId}.claimed`]: true,
        [`tasks.sponsorTasks.${taskId}.claimedAt`]: new Date(),
        updatedAt: new Date()
      }
    };
    
    if (rewardType === 'stars') {
      updateData.$inc.stars = task.reward;
      updateData.$inc.totalEarnedStars = task.reward;
    } else {
      updateData.$inc.magnuStarsoins = task.reward;
      updateData.$inc.totalEarnedMagnuStarsoins = task.reward;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      updateData
    );
    
    // Удаляем оффер после получения награды
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $unset: { [`tasks.sponsorTasks.${taskId}`]: "" },
        $set: { updatedAt: new Date() }
      }
    );
    
    // Очищаем кеш
    userCache.delete(user.id);
    
    const rewardText = rewardType === 'stars' ? `${task.reward} ⭐ Stars` : `${task.reward} 🪙 Magnum Coins`;
    log(`🎁 Награда RichAds оффера ${taskId} получена пользователем ${user.id}: ${rewardText}`);
    await ctx.answerCbQuery(`🎁 Награда получена! +${rewardText}`);
    
    // Возвращаем пользователя к списку RichAds офферов
    const updatedUser = await getUser(ctx.from.id);
    if (updatedUser) {
      await showSponsorTasks(ctx, updatedUser);
    }
  } catch (error) {
    logError(error, 'Получение награды RichAds оффера');
    await ctx.answerCbQuery('❌ Ошибка получения награды');
  }
}
async function showDailyTasks(ctx, user) {
  try {
    log(`📅 Показ ежедневных заданий для пользователя ${user.id}`);
    
    const dailyTasks = getDailyTasks();
    const userTasks = user.tasks?.dailyTasks || {};
    
    // Создаем кнопки для получения наград
    const buttons = [];
    dailyTasks.forEach((task) => {
      const userTask = userTasks[task.id] || {};
      const progress = userTask.progress || 0;
      const isCompleted = progress >= task.target;
      const isClaimed = userTask.claimed || false;
      
      if (isCompleted && !isClaimed) {
        buttons.push([Markup.button.callback(`🎁 Получить награду: ${task.title}`, `claim_daily_${task.id}`)]);
      }
    });
    
    buttons.push([Markup.button.callback('🔙 Назад', 'tasks')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
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
      message += `├ Награда: \`${task.reward}\` Stars\n`;
      message += `└ ${isCompleted ? (isClaimed ? '✅ Выполнено и получено' : '🎁 Готово к получению!') : '🔄 В процессе'}\n\n`;
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

// Функция обработки отправки скриншота
async function handleSendScreenshot(ctx, user, taskId) {
  try {
    log(`📸 Запрос отправки скриншота для задания ${taskId} от пользователя ${user.id}`);
    
    const sponsorTasks = getSponsorTasks();
    const task = sponsorTasks.find(t => t.id === taskId);
    
    if (!task) {
      await ctx.answerCbQuery('❌ Задание не найдено');
      return;
    }
    
    const userTasks = user.tasks?.sponsorTasks || {};
    const userTask = userTasks[taskId] || {};
    
    // Проверяем, не было ли задание уже одобрено
    if (userTask.completed && userTask.claimed) {
      await ctx.answerCbQuery('❌ Задание уже выполнено и награда получена');
      return;
    }
    
    // Устанавливаем состояние ожидания скриншота
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $set: { 
          adminState: `sending_screenshot_${taskId}`,
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(user.id);
    
    const sponsorChannel = config.SPONSOR_TASK_CHANNEL;
    const sponsorBot = config.SPONSOR_TASK_BOT;
    const botName = sponsorBot.includes('farmikstars_bot') ? 'FarmikBot' : 'SponsorBot';
    
    let message = '';
    if (taskId === 1) {
      message = `📸 Пожалуйста, отправьте скриншот, подтверждающий вашу подписку на канал ${sponsorChannel}`;
      await ctx.answerCbQuery(`📸 Теперь отправьте скриншот подписки на канал ${sponsorChannel}`);
    } else if (taskId === 2) {
      message = `📸 Пожалуйста, отправьте скриншот запуска бота ${botName} (кнопка /start)`;
      await ctx.answerCbQuery(`📸 Теперь отправьте скриншот запуска бота ${botName}`);
    } else {
      message = `📸 Пожалуйста, отправьте скриншот выполнения задания`;
      await ctx.answerCbQuery(`📸 Теперь отправьте скриншот выполнения задания`);
    }
    
    await ctx.reply(message);
  } catch (error) {
    logError(error, 'Запрос отправки скриншота');
    await ctx.answerCbQuery('❌ Ошибка запроса скриншота');
  }
}

// Функция обработки загрузки скриншота
async function handleScreenshotUpload(ctx, user, taskId) {
  try {
    log(`📸 Обработка скриншота для задания ${taskId} от пользователя ${user.id}`);
    
    const sponsorTasks = getSponsorTasks();
    const task = sponsorTasks.find(t => t.id === taskId);
    
    if (!task) {
      await ctx.reply('❌ Задание не найдено');
      return;
    }
    
    // Получаем информацию о фото
    const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Самое большое фото
    const fileId = photo.file_id;
    
    // Сохраняем информацию о скриншоте
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $set: { 
          [`tasks.sponsorTasks.${taskId}.screenshot`]: true,
          [`tasks.sponsorTasks.${taskId}.screenshotFileId`]: fileId,
          [`tasks.sponsorTasks.${taskId}.screenshotAt`]: new Date(),
          adminState: null,
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(user.id);
    
    // Отправляем заявку в канал поддержки
    const supportChannel = config.SUPPORT_CHANNEL;
    if (supportChannel) {
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Одобрить', `approve_screenshot_${user.id}_${taskId}`),
          Markup.button.callback('❌ Отклонить', `reject_screenshot_${user.id}_${taskId}`)
        ],
        [
          Markup.button.callback('🚫 Не подписан', `reject_reason_${user.id}_${taskId}_not_subscribed`),
          Markup.button.callback('📸 Нечеткий скриншот', `reject_reason_${user.id}_${taskId}_blurry`)
        ],
        [
          Markup.button.callback('🔗 Неверный канал', `reject_reason_${user.id}_${taskId}_wrong_channel`),
          Markup.button.callback('⏰ Слишком быстро', `reject_reason_${user.id}_${taskId}_too_fast`)
        ]
      ]);
      
      const supportMessage = 
        `📸 *Новая заявка на спонсорское задание*\n\n` +
        `🎯 *Задание:* ${escapeMarkdown(task.title)}\n` +
        `👤 *Пользователь:* ${escapeMarkdown(getDisplayName(user))}\n` +
        `📱 *Username:* ${user.username ? '@' + user.username : 'Не указан'}\n` +
        `🆔 *User ID:* \`${user.id}\`\n` +
        `💰 *Награда:* ${task.reward} ${task.rewardType === 'stars' ? '⭐ Stars' : 'Stars'}\n` +
        `📅 *Дата:* ${new Date().toLocaleString('ru-RU')}\n\n` +
        `🎯 Выберите действие:`;
      
      try {
        await ctx.telegram.sendPhoto(supportChannel, fileId, {
          caption: supportMessage,
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
        
        log(`✅ Заявка на спонсорское задание ${taskId} отправлена в канал поддержки ${supportChannel}`);
      } catch (error) {
        logError(error, `Отправка заявки ${taskId} в канал поддержки`);
      }
    }
    
    await ctx.reply('✅ Скриншот отправлен! Заявка передана на проверку администратору. Ожидайте уведомления о результате.');
  } catch (error) {
    logError(error, 'Обработка скриншота');
    await ctx.reply('❌ Ошибка обработки скриншота');
  }
}

// Функция показа следующего задания
async function showNextSponsorTask(ctx, user) {
  try {
    log(`⏭️ Показ следующего RichAds оффера для пользователя ${user.id}`);
    
    const sponsorTasks = await getRichAdsTasks();
    const userTasks = user.tasks?.sponsorTasks || {};
    
    // Находим следующий невыполненный оффер
    const nextTask = sponsorTasks.find(task => {
      const userTask = userTasks[task.id] || {};
      return !userTask.completed;
    });
    
    if (nextTask) {
      await showSponsorTaskDetails(ctx, user, nextTask.id);
    } else {
      await ctx.answerCbQuery('🎉 Все RichAds офферы выполнены!');
      await showSponsorTasks(ctx, user);
    }
  } catch (error) {
    logError(error, 'Показ следующего RichAds оффера');
    await ctx.answerCbQuery('❌ Ошибка загрузки следующего оффера');
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
    message += `├ Заработано: \`${formatNumber(totalEarnings)}\` Stars\n`;
    message += `└ Средняя награда: \`${completedTasks > 0 ? formatNumber(totalEarnings / completedTasks) : '0.00'}\` Stars\n\n`;
    
    // Статистика по типам
    const sponsorTasks = tasks.sponsorTasks || {};
    const dailyTasks = tasks.dailyTasks || {};
    
    const completedSponsor = Object.values(sponsorTasks).filter(t => t && t.completed).length;
    const completedDaily = Object.values(dailyTasks).filter(t => t && t.claimed).length;
    
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

async function showTasksAchievements(ctx, user) {
  try {
    log(`🏆 Показ достижений в заданиях для пользователя ${user.id}`);
    
    const tasks = user.tasks || {};
    const completedTasks = tasks.completedTasks || 0;
    const totalEarnings = tasks.totalTaskEarnings || 0;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'tasks')]
    ]);
    
    let message = `🏆 *Достижения в заданиях*\n\n`;
    
    // Система достижений
    const achievements = [
      { id: 'first_task', title: '🎯 Первое задание', description: 'Выполните первое задание', requirement: 1, reward: 100 },
      { id: 'task_master', title: '🎯 Мастер заданий', description: 'Выполните 10 заданий', requirement: 10, reward: 500 },
      { id: 'task_expert', title: '🎯 Эксперт заданий', description: 'Выполните 25 заданий', requirement: 25, reward: 1500 },
      { id: 'task_legend', title: '🎯 Легенда заданий', description: 'Выполните 50 заданий', requirement: 50, reward: 5000 },
      { id: 'task_god', title: '🎯 Бог заданий', description: 'Выполните 100 заданий', requirement: 100, reward: 15000 }
    ];
    
    // Проверяем достижения
    const userAchievements = tasks.achievements || {};
    
    message += `📊 *Ваша статистика:*\n`;
    message += `├ Выполнено заданий: \`${completedTasks}\`\n`;
    message += `├ Заработано: \`${formatNumber(totalEarnings)}\` Stars\n`;
    message += `└ Получено достижений: \`${Object.keys(userAchievements).length}\`\n\n`;
    
    message += `🏆 *Достижения:*\n`;
    
    achievements.forEach(achievement => {
      const isCompleted = userAchievements[achievement.id]?.completed || false;
      const isClaimed = userAchievements[achievement.id]?.claimed || false;
      const progress = Math.min(100, Math.round((completedTasks / achievement.requirement) * 100));
      
      const status = isCompleted ? (isClaimed ? '✅' : '🎁') : '🔄';
      
      message += `${status} *${achievement.title}*\n`;
      message += `├ ${achievement.description}\n`;
      message += `├ Прогресс: \`${completedTasks}/${achievement.requirement}\` (\`${progress}%\`)\n`;
      message += `├ Награда: \`${achievement.reward}\` Stars\n`;
      
      if (isCompleted && !isClaimed) {
        message += `└ 🎁 *Готово к получению!*\n\n`;
      } else if (isClaimed) {
        message += `└ ✅ *Получено!*\n\n`;
      } else {
        message += `└ Осталось: \`${achievement.requirement - completedTasks}\` заданий\n\n`;
      }
    });
    
    // Проверяем, есть ли достижения готовые к получению
    const readyToClaim = achievements.filter(a => 
      userAchievements[a.id]?.completed && !userAchievements[a.id]?.claimed
    );
    
    if (readyToClaim.length > 0) {
      message += `🎁 *Готово к получению:* \`${readyToClaim.length}\` достижений\n\n`;
    }
    
    message += `💡 *Информация:*\n`;
    message += `├ Достижения получаются автоматически\n`;
    message += `├ Награды выдаются сразу после получения\n`;
    message += `└ Прогресс обновляется в реальном времени\n\n`;
    
    message += `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ достижений в заданиях');
    await ctx.answerCbQuery('❌ Ошибка загрузки достижений');
  }
}
// Вспомогательные функции
function isValidObjectId(id) {
  return id && typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);
}

// Получение RichAds офферов (заменяет спонсорские задания)
async function getRichAdsTasks() {
  try {
    log('📋 Получение RichAds офферов...');
    
    const offers = await getRichAdsOffers();
    
    if (offers.length === 0) {
      log('⚠️ RichAds офферы недоступны, возвращаем демо-офферы');
      // Возвращаем демо-офферы из модуля RichAds
      const { richAdsIntegration } = require('./richads-integration');
      const demoOffers = richAdsIntegration.getDemoOffers();
      log(`📋 Возвращено ${demoOffers.length} демо-офферов`);
      return demoOffers;
    }
    
    log(`📋 Получено ${offers.length} RichAds офферов`);
    return offers;
  } catch (error) {
    logErrorWithContext(error, 'getRichAdsTasks', 'system');
    logError(error, 'Получение RichAds офферов');
    // Возвращаем демо-офферы при ошибке
    const { richAdsIntegration } = require('./richads-integration');
    const demoOffers = richAdsIntegration.getDemoOffers();
    log(`📋 Возвращено ${demoOffers.length} демо-офферов при ошибке`);
    return demoOffers;
  }
}

// Обратная совместимость - возвращаем RichAds офферы как спонсорские задания
async function getSponsorTasks() {
  log('📋 Вызов getSponsorTasks() - возвращаем RichAds офферы');
  try {
    return await getRichAdsTasks();
  } catch (error) {
    logError(error, 'Ошибка в getSponsorTasks');
    return [];
  }
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
      description: 'Выполните 3 обмена Stars',
      target: 3,
      reward: 30
    }
  ];
}

// Функция для обновления прогресса ежедневных заданий
async function updateDailyTaskProgress(user, taskType, amount = 1) {
  try {
    const today = new Date().toDateString();
    const userTasks = user.tasks?.dailyTasks || {};
    
    // Проверяем, нужно ли сбросить задания (новый день)
    const lastReset = user.lastDailyTasksReset;
    const shouldReset = !lastReset || lastReset.toDateString() !== today;
    
    if (shouldReset) {
      // Сбрасываем прогресс на новый день
      await db.collection('users').updateOne(
        { id: user.id },
        { 
          $set: { 
            'tasks.dailyTasks': {},
            lastDailyTasksReset: new Date(),
            updatedAt: new Date()
          }
        }
      );
      user.tasks = user.tasks || {};
      user.tasks.dailyTasks = {};
      user.lastDailyTasksReset = new Date();
    }
    
    // Обновляем прогресс для конкретного задания
    const currentProgress = userTasks[taskType]?.progress || 0;
    const newProgress = currentProgress + amount;
    
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $set: { 
          [`tasks.dailyTasks.${taskType}.progress`]: newProgress,
          [`tasks.dailyTasks.${taskType}.lastUpdated`]: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    // Обновляем кеш
    if (!user.tasks) user.tasks = {};
    if (!user.tasks.dailyTasks) user.tasks.dailyTasks = {};
    user.tasks.dailyTasks[taskType] = {
      progress: newProgress,
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('❌ Ошибка обновления прогресса ежедневного задания:', error);
  }
}

// Функция для получения награды за ежедневное задание
async function claimDailyTaskReward(ctx, user, taskId) {
  try {
    const dailyTasks = getDailyTasks();
    const task = dailyTasks.find(t => t.id === taskId);
    
    if (!task) {
      await ctx.answerCbQuery('❌ Задание не найдено!');
      return;
    }
    
    const userTasks = user.tasks?.dailyTasks || {};
    const userTask = userTasks[taskId] || {};
    const progress = userTask.progress || 0;
    const isClaimed = userTask.claimed || false;
    
    if (progress < task.target) {
      await ctx.answerCbQuery('❌ Задание еще не выполнено!');
      return;
    }
    
    if (isClaimed) {
      await ctx.answerCbQuery('❌ Награда уже получена!');
      return;
    }
    
    // Выдаем награду
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $inc: { 
          magnuStarsoins: task.reward,
          totalEarnedMagnuStarsoins: task.reward,
          experience: Math.floor(task.reward * 5),
          'tasks.completedTasks': 1,
          'tasks.totalTaskEarnings': task.reward
        },
        $set: { 
          [`tasks.dailyTasks.${taskId}.claimed`]: true,
          [`tasks.dailyTasks.${taskId}.claimedAt`]: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    // Обновляем кеш
    userCache.delete(user.id);
    
    // Проверяем и обновляем уровень пользователя
    const updatedUser = await getUser(user.id);
    if (updatedUser) {
      const levelResult = await checkAndUpdateLevel(updatedUser);
      if (levelResult.levelUp) {
        log(`🎉 Пользователь ${user.id} повысил уровень до ${levelResult.newLevel}!`);
      }
    }
    
    await ctx.answerCbQuery(`🎁 Награда получена! +${task.reward} Stars`);
    
    // Обновляем меню ежедневных заданий
    await showDailyTasks(ctx, updatedUser || user);
    
  } catch (error) {
    logError(error, 'Получение награды за ежедневное задание');
    await ctx.answerCbQuery('❌ Ошибка получения награды');
  }
}

async function checkTaskCompletion(ctx, user, task) {
  // Здесь должна быть реальная логика проверки выполнения задания
  // Для демонстрации возвращаем true (задание выполнено)
  return true;
}

// ==================== РАНГИ ====================
async function showRanksMenu(ctx, user) {
  try {
    log(`⚔️ Показ меню рангов для пользователя ${user.id}`);
    
    // Отладка прогресса ранга
    await debugRankProgress(user);
    
    const rankProgress = await getRankProgress(user);
    const ranks = getRankRequirements();
    
    // Дополнительная проверка для отладки
    console.log(`🎯 Показ рангов для пользователя ${user.id}:`, {
      level: user.level,
      rankProgress,
      currentRank: rankProgress.current,
      nextRank: rankProgress.next,
      isMax: rankProgress.isMax
    });
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'settings')]
    ]);
    
    let message = `⚔️ *Система рангов*\n\n`;
    message += `🎯 *Ваш текущий ранг:* ${rankProgress.current.name}\n`;
    message += `📊 *Уровень:* ${user.level || 1}\n\n`;
    
    if (!rankProgress.isMax) {
      message += `📈 *Прогресс к следующему рангу:*\n`;
      message += `├ Текущий: ${rankProgress.current.name}\n`;
      message += `├ Следующий: ${rankProgress.next.name}\n`;
      message += `├ Прогресс: ${rankProgress.progress}%\n`;
      message += `└ Осталось: ${rankProgress.remaining} уровней\n\n`;
    } else {
      message += `🎉 *Поздравляем! Вы достигли максимального ранга!*\n\n`;
    }
    
    message += `📋 *Все ранги:*\n\n`;
    
    ranks.forEach((rank, index) => {
      const isCurrent = rank.level === rankProgress.current.level;
      const isUnlocked = user.level >= rank.level;
      const status = isCurrent ? '🎯' : (isUnlocked ? '✅' : '🔒');
      
      message += `${status} *${rank.name}*\n`;
      message += `├ Уровень: ${rank.level}\n`;
      message += `└ Требование: ${rank.requirement}\n\n`;
    });
    
    message += `💡 *Как повысить ранг:*\n`;
    message += `├ Выполняйте фарм для получения опыта\n`;
    message += `├ Используйте майнер для пассивного дохода\n`;
    message += `├ Выполняйте ежедневные задания\n`;
    message += `└ Приглашайте рефералов\n\n`;
    message += `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ меню рангов');
    await ctx.answerCbQuery('❌ Ошибка загрузки рангов');
  }
}

// ==================== ТИТУЛЫ ====================
function getTitlesList(user) {
  const farStarsount = user.farm?.farStarsount || 0;
  const minerTotal = user.miner?.totalMined || 0;
  const streak = user.dailyBonus?.streak || 0;
  const level = user.level || 1;
  const stars = user.stars || 0;
  const totalStars = user.totalEarnedStars || 0;
  const referrals = user.referralsCount || 0;
  const achievements = user.achievementsCount || 0;
  const isAdmin = user.isAdmin || false;

  const definitions = [
    // Обычные (5)
    { id: 'novice', name: '🌱 Новичок', rarity: 'Обычный', conditionText: 'Титул по умолчанию', unlocked: true, minerBonus: 1.0 },
    { id: 'starter', name: '🚀 Начинающий', rarity: 'Обычный', conditionText: 'Уровень 3 или 500 Stars', unlocked: level >= 3 || stars >= 500, minerBonus: 1.1 },
    { id: 'skilled', name: '🎯 Опытный', rarity: 'Обычный', conditionText: 'Уровень 10 или 50 фармов', unlocked: level >= 10 || farStarsount >= 50, minerBonus: 1.2 },
    { id: 'master', name: '✨ Мастер', rarity: 'Обычный', conditionText: 'Уровень 25 или 10 000 Stars', unlocked: level >= 25 || stars >= 10000, minerBonus: 1.3 },
    { id: 'expert', name: '💫 Эксперт', rarity: 'Обычный', conditionText: 'Уровень 50 или 10 000 Stars заработано', unlocked: level >= 50 || totalStars >= 10000, minerBonus: 1.4 },

    // Редкие (3)
    { id: 'pro', name: '🌟 Профессионал', rarity: 'Редкий', conditionText: '100 000 Stars или 10 рефералов', unlocked: stars >= 100000 || referrals >= 10, minerBonus: 1.5 },
    { id: 'champion', name: '🏆 Чемпион', rarity: 'Редкий', conditionText: 'Уровень 75 или 10 достижений', unlocked: level >= 75 || achievements >= 10, minerBonus: 1.6 },
    { id: 'legend', name: '👑 Легенда', rarity: 'Редкий', conditionText: '1 000 000 Stars', unlocked: stars >= 1000000 || totalStars >= 1000000, minerBonus: 1.7 },

    // Секретные (3)
    { id: 'stealth', name: '🕵️ Скрытный', rarity: 'Секретный', conditionText: 'Серия бонусов 14 дней подряд', unlocked: streak >= 14, minerBonus: 1.8 },
    { id: 'tactician', name: '🧠 Тактик', rarity: 'Секретный', conditionText: '100 фармов и 5 рефералов', unlocked: farStarsount >= 100 && referrals >= 5, minerBonus: 1.9 },
    { id: 'chronos', name: '⏳ Усердный', rarity: 'Секретный', conditionText: 'Намайнить 5 000 Stars', unlocked: minerTotal >= 5000, minerBonus: 2.0 },

    // Легендарные (3)
    { id: 'immortal', name: '🔥 Бессмертный', rarity: 'Легендарный', conditionText: '1 000 000 Stars заработано', unlocked: totalStars >= 1000000, minerBonus: 2.2 },
    { id: 'dragon', name: '🐉 Дракон', rarity: 'Легендарный', conditionText: '100 рефералов', unlocked: referrals >= 100, minerBonus: 2.4 },
    { id: 'god', name: '⚡ Бог', rarity: 'Легендарный', conditionText: 'Уровень 100 и 50 достижений', unlocked: level >= 100 && achievements >= 50, minerBonus: 2.5 },

    // Админские (3)
    { id: 'moderator', name: '🛡️ Модератор', rarity: 'Админский', conditionText: 'Доступ только для модераторов', unlocked: isAdmin, minerBonus: 3.0 },
    { id: 'administrator', name: '⚙️ Администратор', rarity: 'Админский', conditionText: 'Доступ только для администраторов', unlocked: isAdmin, minerBonus: 3.5 },
    { id: 'owner', name: '👑 Владелец', rarity: 'Админский', conditionText: 'Доступ только для владельцев', unlocked: isAdmin, minerBonus: 4.0 }
  ];

  return definitions;
}

async function syncUserTitles(user) {
  try {
    const definitions = getTitlesList(user);
    const ownedSet = new Set(user.titles || []);
    const toAdd = definitions.filter(t => t.unlocked && !ownedSet.has(t.name)).map(t => t.name);

    if (toAdd.length > 0) {
      await db.collection('users').updateOne(
        { id: user.id },
        { $addToSet: { titles: { $each: toAdd } }, $set: { updatedAt: new Date() } }
      );
      user.titles = Array.from(new Set([...(user.titles || []), ...toAdd]));
      setCachedUser(user.id, user);
    }

    if (!user.mainTitle || !user.titles.includes(user.mainTitle)) {
      user.mainTitle = '🌱 Новичок';
      await db.collection('users').updateOne(
        { id: user.id },
        { $set: { mainTitle: user.mainTitle, updatedAt: new Date() } }
      );
      setCachedUser(user.id, user);
    }

    return { definitions, toAdd };
  } catch (error) {
    logError(error, 'Синхронизация титулов пользователя');
    return { definitions: getTitlesList(user), toAdd: [] };
  }
}

async function showTitlesMenu(ctx, user) {
  // Синхронизируем титулы пользователя
  const { definitions } = await syncUserTitles(user);
  const total = definitions.length;
  const owned = (user.titles || []).length;

  let message = `🎖 *Титулы*\n\n`;
  message += `👑 Главный титул: ${user.mainTitle}\n`;
  message += `📦 Доступно: \`${owned}/${total}\`\n\n`;
  message += `📜 *Список титулов:*\n`;

  for (const t of definitions) {
    const has = (user.titles || []).includes(t.name);
    const status = has ? '✅' : (t.rarity === 'Секретный' ? '❔' : '🔒');
    const titleName = has ? t.name : (t.rarity === 'Секретный' ? 'Секретный титул' : t.name);
    message += `${status} ${titleName} — ${t.rarity}${has ? '' : ` (условие: ${t.conditionText})`}\n`;
  }

  const buttons = [
    [Markup.button.callback('🧭 Сменить титул', 'titles_select')],
    [Markup.button.callback('🔙 Назад', 'main_menu')]
  ];

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup
  });
}
async function showTitlesSelectMenu(ctx, user) {
  const definitions = getTitlesList(user);
  const ownedDefs = definitions.filter(d => (user.titles || []).includes(d.name));

  // Фоллбек для титулов, которых нет в определениях
  const extraOwned = (user.titles || [])
    .filter(n => !ownedDefs.some(d => d.name === n))
    .map(n => ({ id: 'name_' + Buffer.from(n, 'utf8').toString('base64'), name: n }));

  const items = [...ownedDefs.map(d => ({ id: d.id, name: d.name })), ...extraOwned];

  let message = `🎖 *Выбор титула*\n\n`;
  message += `Текущий: ${user.mainTitle}\n\n`;
  message += `Выберите титул для установки:`;

  const rows = [];
  for (const item of items) {
    rows.push([Markup.button.callback(item.name, `set_title_${item.id}`)]);
  }
  rows.push([Markup.button.callback('🔙 Назад', 'titles')]);

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard(rows).reply_markup
  });
}

// Обработчики титулов и рангов
let afterActions = [];
afterActions.push(() => {
  bot.action('titles', async (ctx) => {
    try {
      const user = await getUser(ctx.from.id);
      if (!user) return;
      await showTitlesMenu(ctx, user);
    } catch (error) {
      logError(error, 'Титулы (обработчик)');
    }
  });

  bot.action('ranks', async (ctx) => {
    try {
      const user = await getUser(ctx.from.id);
      if (!user) return;
      await showRanksMenu(ctx, user);
    } catch (error) {
      logError(error, 'Ранги (обработчик)');
    }
  });

  bot.action('titles_select', async (ctx) => {
    try {
      const user = await getUser(ctx.from.id);
      if (!user) return;
      await showTitlesSelectMenu(ctx, user);
    } catch (error) {
      logError(error, 'Титулы выбор (обработчик)');
    }
  });

  bot.action(/^(set_title_)\S+/, async (ctx) => {
    try {
      const data = ctx.callbackQuery?.data || '';
      const rawId = data.replace('set_title_', '');

      const user = await getUser(ctx.from.id);
      if (!user) return;

      const definitions = getTitlesList(user);
      let selectedName = null;

      const byId = definitions.find(d => d.id === rawId);
      if (byId) {
        selectedName = byId.name;
      } else if (rawId.startsWith('name_')) {
        const b64 = rawId.substring(5);
        try {
          selectedName = Buffer.from(b64, 'base64').toString('utf8');
        } catch (e) {
          selectedName = null;
        }
      }

      if (!selectedName) {
        await ctx.answerCbQuery('❌ Не удалось распознать титул', { show_alert: true });
        return;
      }

      if (!(user.titles || []).includes(selectedName)) {
        await ctx.answerCbQuery('🔒 Этот титул еще не получен', { show_alert: true });
        return;
      }

      await db.collection('users').updateOne(
        { id: user.id },
        { $set: { mainTitle: selectedName, updatedAt: new Date() } }
      );
      user.mainTitle = selectedName;
      setCachedUser(user.id, user);

      await ctx.answerCbQuery('✅ Титул установлен');
      await showTitlesMenu(ctx, user);
    } catch (error) {
      logError(error, 'Установка титула (обработчик)');
      await ctx.answerCbQuery('❌ Ошибка установки титула', { show_alert: true });
    }
  });
});
// Тестовый маршрут для проверки майнинга
app.get('/test-mining', async (req, res) => {
    try {
        const currentSeason = getCurrentMiningSeason();
        const users = await db.collection('users').find({
            $or: [
                { 'miningStats.lastReward': { $exists: true } },
                { 'miners': { $exists: true, $ne: [] } }
            ]
        }).toArray();
        
        const testUser = users[0];
        if (testUser) {
            const userWithMining = initializeNewMiningSystem(testUser);
            const totalSpeed = calculateTotalMiningSpeed(userWithMining);
            
            res.json({
                status: 'mining-test',
                currentSeason,
                totalUsers: users.length,
                testUser: {
                    id: testUser.id,
                    miners: userWithMining.miners?.length || 0,
                    totalSpeed,
                    miningStats: userWithMining.miningStats
                },
                config: {
                    MINING_REWARD_INTERVAL: config.MINING_REWARD_INTERVAL,
                    MINING_ACTIVE_CLICK_BONUS: config.MINING_ACTIVE_CLICK_BONUS
                }
            });
        } else {
            res.json({
                status: 'mining-test',
                error: 'No users found',
                totalUsers: 0
            });
        }
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Маршрут для принудительного запуска обработки майнинга
app.get('/force-mining', async (req, res) => {
    try {
        console.log('🔧 Принудительный запуск обработки майнинга...');
        await processMinerRewards();
        res.json({
            status: 'success',
            message: 'Mining processing completed',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Маршрут для принудительного сохранения всех пользователей
app.get('/force-save-all', async (req, res) => {
    try {
        console.log('💾 Принудительное сохранение всех пользователей...');
        
        const users = await db.collection('users').find({}).toArray();
        let savedCount = 0;
        
        for (const user of users) {
            try {
                await forceSaveUser(user);
                savedCount++;
            } catch (error) {
                console.error(`❌ Ошибка сохранения пользователя ${user.id}:`, error);
            }
        }
        
        res.json({
            status: 'success',
            message: `Saved ${savedCount} users`,
            totalUsers: users.length,
            savedCount,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Маршрут для проверки состояния базы данных
app.get('/db-status', async (req, res) => {
    try {
        const users = await db.collection('users').find({}).toArray();
        const usersWithMiners = users.filter(u => u.miners && u.miners.length > 0);
        const usersWithMiningStats = users.filter(u => u.miningStats);
        
        res.json({
            status: 'success',
            totalUsers: users.length,
            usersWithMiners: usersWithMiners.length,
            usersWithMiningStats: usersWithMiningStats.length,
            sampleUser: users[0] ? {
                id: users[0].id,
                magnuStarsoins: users[0].magnuStarsoins,
                stars: users[0].stars,
                miners: users[0].miners?.length || 0,
                hasMiningStats: !!users[0].miningStats,
                lastReward: users[0].miningStats?.lastReward
            } : null,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// ==================== СОЗДАНИЕ БОТА ====================
const bot = new Telegraf(config.BOT_TOKEN);
// Регистрация отложенных обработчиков
if (typeof afterActions !== 'undefined' && Array.isArray(afterActions)) {
  for (const fn of afterActions) {
    try {
      fn();
    } catch (e) {
      logError(e, 'Регистрация отложенных обработчиков');
    }
  }
}
// Регистрация отложенных обработчиков
if (typeof afterActions !== 'undefined' && Array.isArray(afterActions)) {
  for (const fn of afterActions) {
    try {
      fn();
    } catch (e) {
      logError(e, 'Регистрация отложенных обработчиков');
    }
  }
}
// Обработка команды /start
bot.start(async (ctx) => {
  try {
    console.log('🚀 Команда /start от пользователя', ctx.from.id);
    console.log('Данные пользователя /start:', {
      id: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      startPayload: ctx.startPayload
    });
    
    console.log(`👤 Получение пользователя ${ctx.from.id}`);
    const user = await getUser(ctx.from.id, ctx);
    if (!user) {
      console.log(`❌ Не удалось получить пользователя ${ctx.from.id}`);
      await ctx.reply('❌ Ошибка создания пользователя');
      return;
    }
    
    console.log(`Пользователь ${ctx.from.id} получен:`, {
      level: user.level,
      magnuStarsoins: user.magnuStarsoins,
      stars: user.stars,
      banned: user.banned
    });
    
    // Проверяем подписку
    console.log(`🔍 Проверка подписки для пользователя ${ctx.from.id}`);
    let isSubscribed = false;
    try {
      isSubscribed = await checkSubscription(ctx);
      console.log(`Результат проверки подписки для ${ctx.from.id}:`, { isSubscribed });
    } catch (subscriptionError) {
      console.error(`❌ Ошибка проверки подписки для пользователя ${ctx.from.id}:`, subscriptionError);
      // В случае ошибки проверки подписки, пропускаем её
      isSubscribed = true;
    }
    
    if (!isSubscribed) {
      console.log(`❌ Пользователь ${ctx.from.id} не подписан на канал`);
      try {
        await showSubscriptionMessage(ctx);
      } catch (subscriptionMessageError) {
        console.error(`❌ Ошибка показа сообщения о подписке для пользователя ${ctx.from.id}:`, subscriptionMessageError);
        // В случае ошибки показываем главное меню
        await showMainMenuStart(ctx, user);
      }
      return;
    }
    
    // Обрабатываем реферальную ссылку
    const startPayload = ctx.startPayload;
    if (startPayload && startPayload !== user.id.toString()) {
      console.log(`👥 Обработка реферала: ${ctx.from.id} от ${startPayload}`);
      console.log(`Реферальные данные:`, {
        userId: ctx.from.id,
        referrerId: startPayload,
        currentReferrer: user.referrerId
      });
      await handleReferral(user.id, parseInt(startPayload));
    } else {
      console.log(`ℹ️ Реферальная ссылка не используется для пользователя ${ctx.from.id}`);
    }
    
    // Для команды /start используем ctx.reply вместо editMessageText
    console.log(`📱 Показ главного меню для пользователя ${ctx.from.id}`);
    await showMainMenuStart(ctx, user);
    
    console.log(`✅ Команда /start успешно обработана для пользователя ${ctx.from.id}`);
    
  } catch (error) {
    console.error(`❌ Ошибка команды /start для пользователя ${ctx.from.id}:`, error);
    console.log(`Ошибка в /start:`, {
      userId: ctx.from.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Пытаемся отправить простое сообщение об ошибке
    try {
      await ctx.reply('❌ Произошла ошибка при запуске бота. Попробуйте позже или обратитесь к администратору.');
    } catch (replyError) {
      console.error(`❌ Не удалось отправить сообщение об ошибке пользователю ${ctx.from.id}:`, replyError);
    }
  }
});

// Команда для открытия WebApp
bot.command('webapp', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }

    // Проверяем доступ к WebApp
    const webappEnabled = process.env.WEBAPP_ENABLED === 'true';
    const adminOnly = process.env.WEBAPP_ADMIN_ONLY === 'true';
    const isAdmin = config.ADMIN_IDS.includes(user.id);

    if (!webappEnabled) {
      await ctx.reply('🚧 WebApp временно недоступен');
      return;
    }

    if (adminOnly && !isAdmin) {
      await ctx.reply('🔒 WebApp доступен только администраторам');
      return;
    }

    // Создаем WebApp кнопку
    const webappUrl = process.env.WEBAPP_URL || `https://${process.env.RAILWAY_STATIC_URL || 'your-app.railway.app'}/webapp`;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.webApp('🎮 Открыть WebApp', webappUrl)]
    ]);

    await ctx.reply(
      '🎮 *Magnum Stars WebApp*\n\n' +
      '✨ Современный интерфейс\n' +
      '⚡ Быстрая работа\n' +
      '🎯 Улучшенный UX\n\n' +
      'Нажмите кнопку ниже, чтобы открыть WebApp:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );

  } catch (error) {
    logError(error, 'WebApp команда');
    await ctx.reply('❌ Ошибка открытия WebApp');
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
      `├ Stars: \`${formatNumber(targetUser.magnuStarsoins || 0)}\`\n` +
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
    console.error('❌ Ошибка поиска пользователя админом:', error);
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
    
    // Очищаем кеш пользователя
    userCache.delete(user.id);
    
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
      { key: 'MINER_REWARD_PER_MINUTE' },
      { $set: { value: newReward, updatedAt: new Date() } },
      { upsert: true }
    );
    
    // Обновляем конфиг в памяти
    config.MINER_REWARD_PER_MINUTE = newReward;
    
    await ctx.reply(`✅ Базовая награда майнера изменена на ${newReward} Stars в минуту`);
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
    // Очищаем кеш пользователя
    userCache.delete(user.id);
    
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
    
    await ctx.reply(`✅ Награда за реферала изменена на ${newReward} Stars`);
    
    // Сбрасываем состояние
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
    // Очищаем кеш пользователя
    userCache.delete(user.id);
    
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
    
    // Очищаем кеш пользователя
    userCache.delete(user.id);
    
  } catch (error) {
    logError(error, 'Изменение канала подписки админом');
    await ctx.reply('❌ Ошибка изменения канала подписки');
  }
}
// ==================== СИСТЕМА ПОДДЕРЖКИ ====================
async function handleCreateSupportTicket(ctx, user, text) {
  try {
    logFunction('handleCreateSupportTicket', user.id, { textLength: text.length });
    log(`🆘 Создание тикета поддержки для пользователя ${user.id}`);
    
    if (text.length < 10) {
      await ctx.reply('❌ Описание проблемы слишком короткое. Пожалуйста, опишите проблему подробнее (минимум 10 символов).');
      return;
    }
    
    if (text.length > 1000) {
      await ctx.reply('❌ Описание проблемы слишком длинное. Пожалуйста, сократите описание до 1000 символов.');
      return;
    }
    
    // Создаем тикет в базе данных
    const ticket = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      userId: user.id,
      username: user.username,
      firstName: user.firstName,
      status: 'new', // new, in_progress, answered, closed
      priority: 'normal', // low, normal, high, urgent
      subject: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      description: text,
      createdAt: new Date(),
      updatedAt: new Date(),
      adminResponse: null,
      adminId: null,
      responseTime: null
    };
    
    logDebug(`Создание тикета в БД`, {
      ticketId: ticket.id,
      userId: user.id,
      status: ticket.status,
      subject: ticket.subject
    });
    
    await db.collection('supportTickets').insertOne(ticket);
    
    // Обновляем статистику пользователя
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $inc: { 
          'support.ticketsCount': 1
        },
        $set: { 
          'support.lastTicket': new Date(),
          adminState: null,
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(user.id);
    
    // Отправляем тикет в канал поддержки
    const supportChannel = config.SUPPORT_CHANNEL;
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Ответить', `support_answer_${ticket.id}`),
        Markup.button.callback('⏳ В обработке', `support_progress_${ticket.id}`)
      ],
      [
        Markup.button.callback('❌ Отклонить', `support_reject_${ticket.id}`),
        Markup.button.callback('🔒 Закрыть', `support_close_${ticket.id}`)
      ]
    ]);
    
    const supportMessage = 
      `🆘 *Новый тикет поддержки*\n\n` +
      `🆔 *ID тикета:* \`${ticket.id}\`\n` +
      `👤 *Пользователь:* ${getDisplayName(user)}\n` +
      `📱 *Username:* ${user.username ? '@' + user.username : 'Не указан'}\n` +
      `🆔 *User ID:* \`${user.id}\`\n` +
      `📅 *Дата:* ${ticket.createdAt.toLocaleString('ru-RU')}\n` +
      `📊 *Уровень:* ${user.level || 1}\n` +
      `💰 *Stars:* ${formatNumber(user.magnuStarsoins || 0)}\n` +
      `⭐ *Stars:* ${formatNumber(user.stars || 0)}\n\n` +
      `📝 *Проблема:*\n\`\`\`\n${text}\n\`\`\`\n\n` +
      `🎯 Выберите действие:`;
    
    if (supportChannel) {
      try {
        await ctx.telegram.sendMessage(supportChannel, supportMessage, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
        
        log(`✅ Тикет ${ticket.id} отправлен в канал поддержки ${supportChannel}`);
      } catch (error) {
        logError(error, `Отправка тикета ${ticket.id} в канал поддержки`);
        logDebug(`Ошибка отправки в канал`, {
          channel: supportChannel,
          ticketId: ticket.id,
          error: error.message
        });
      }
    } else {
      log(`⚠️ Канал поддержки не настроен, тикет ${ticket.id} не отправлен`);
    }
    
    // Отправляем подтверждение пользователю
    const userKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад в поддержку', 'support')]
    ]);
    
    const userMessage = 
      `✅ *Тикет создан успешно!*\n\n` +
      `🆔 *ID тикета:* \`${ticket.id}\`\n` +
      `📝 *Ваша проблема:*\n\`\`\`\n${text}\n\`\`\`\n\n` +
      `⏰ *Время ответа:* 5-30 минут\n\n` +
      `📋 *Что дальше:*\n` +
      `• Мы рассмотрим ваш тикет\n` +
      `• Ответим в ближайшее время\n` +
      `• Вы получите уведомление\n\n` +
      `💡 *Совет:* Пока ждете ответа, можете изучить FAQ - возможно, там уже есть ответ на ваш вопрос!`;
    
    await ctx.reply(userMessage, {
      parse_mode: 'Markdown',
      reply_markup: userKeyboard.reply_markup
    });
    
    log(`✅ Тикет ${ticket.id} успешно создан для пользователя ${user.id}`);
    
  } catch (error) {
    logError(error, `Создание тикета поддержки для пользователя ${user.id}`);
    logDebug(`Ошибка создания тикета`, {
      userId: user.id,
      text: text,
      error: error.message,
      stack: error.stack
    });
    await ctx.reply('❌ Ошибка создания тикета. Попробуйте позже.');
  }
}

// Обработка ответа админа на тикет
async function handleAdminAnswerTicket(ctx, user, text) {
  try {
    console.log(`✅ Админ ${user.id} отвечает на тикет, длина текста: ${text.length}`);
    
    // Извлекаем ID тикета из adminState
    const ticketId = user.adminState.replace('answering_ticket_', '');
    console.log(`✅ Админ ${user.id} отвечает на тикет ${ticketId}`);
    
    if (text.length < 5) {
      await ctx.reply('❌ Ответ слишком короткий. Пожалуйста, напишите более подробный ответ.');
      return;
    }
    
    if (text.length > 2000) {
      await ctx.reply('❌ Ответ слишком длинный. Пожалуйста, сократите ответ до 2000 символов.');
      return;
    }
    
    // Получаем тикет из базы данных
    const ticket = await db.collection('supportTickets').findOne({ id: ticketId });
    if (!ticket) {
      await ctx.reply('❌ Тикет не найден');
      return;
    }
    
    // Обновляем тикет с ответом админа
    const responseTime = Date.now() - ticket.createdAt.getTime();
    await db.collection('supportTickets').updateOne(
      { id: ticketId },
      { 
        $set: { 
          status: 'answered',
          adminResponse: text,
          adminId: user.id,
          responseTime: responseTime,
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`Ответ админа сохранен в БД:`, {
      ticketId: ticketId,
      adminId: user.id,
      responseLength: text.length,
      responseTime: responseTime
    });
    // Отправляем ответ пользователю
    try {
      const userMessage = 
        `✅ *Ответ на ваш тикет*\n\n` +
        `🆔 *ID тикета:* \`${ticketId}\`\n` +
        `📝 *Ваша проблема:*\n\`\`\`\n${ticket.description}\n\`\`\`\n\n` +
        `👨‍💼 *Ответ поддержки:*\n\`\`\`\n${text}\n\`\`\`\n\n` +
        `⏰ *Время ответа:* ${Math.floor(responseTime / 1000 / 60)} минут\n\n` +
        `💡 Если у вас есть дополнительные вопросы, создайте новый тикет.`;
      
      await ctx.telegram.sendMessage(ticket.userId, userMessage, {
        parse_mode: 'Markdown'
      });
      
      console.log(`✅ Ответ отправлен пользователю ${ticket.userId}`);
    } catch (error) {
      console.error(`❌ Ошибка отправки ответа пользователю ${ticket.userId}:`, error);
    }
    
    // Обновляем сообщение в канале поддержки
    const supportChannel = '@magnumsupported';
    const message = 
      `✅ *Тикет отвечен*\n\n` +
      `🆔 *ID тикета:* \`${ticketId}\`\n` +
      `👤 *Пользователь:* ${ticket.firstName || 'Не указано'}\n` +
      `📱 *Username:* ${ticket.username ? '@' + ticket.username : 'Не указан'}\n` +
      `🆔 *User ID:* \`${ticket.userId}\`\n` +
      `📅 *Дата:* ${ticket.createdAt.toLocaleString('ru-RU')}\n` +
      `👨‍💼 *Админ:* ${user.firstName || user.username || user.id}\n` +
      `⏰ *Время ответа:* ${Math.floor(responseTime / 1000 / 60)} минут\n\n` +
      `📝 *Проблема:*\n\`\`\`\n${ticket.description}\n\`\`\`\n\n` +
      `✅ *Ответ:*\n\`\`\`\n${text}\n\`\`\`\n\n` +
      `✅ *Статус:* Отвечен`;
    
    try {
      await ctx.telegram.sendMessage(supportChannel, message, {
        parse_mode: 'Markdown'
      });
      console.log(`✅ Обновленное сообщение отправлено в канал поддержки`);
    } catch (error) {
      console.error(`❌ Ошибка отправки обновленного сообщения в канал поддержки:`, error);
    }
    
    // Сбрасываем состояние админа
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
    // Очищаем кеш пользователя
    userCache.delete(user.id);
    
    // Отправляем подтверждение админу
    const adminKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад в админ панель', 'admin')]
    ]);
    
    const adminMessage = 
      `✅ *Ответ отправлен успешно!*\n\n` +
      `🆔 *ID тикета:* \`${ticketId}\`\n` +
      `👤 *Пользователь:* ${ticket.firstName || 'Не указано'}\n` +
      `📝 *Ответ:*\n\`\`\`\n${text}\n\`\`\`\n\n` +
      `⏰ *Время ответа:* ${Math.floor(responseTime / 1000 / 60)} минут\n\n` +
      `✅ Пользователь получил ваш ответ.`;
    
    await ctx.reply(adminMessage, {
      parse_mode: 'Markdown',
      reply_markup: adminKeyboard.reply_markup
    });
    
    console.log(`✅ Ответ на тикет ${ticketId} успешно обработан админом ${user.id}`);
    
  } catch (error) {
    console.error(`❌ Ошибка ответа админа ${user.id} на тикет:`, error);
    await ctx.reply('❌ Ошибка отправки ответа. Попробуйте позже.');
  }
}
// ==================== ВЫДАЧА РАНГА ====================
async function handleAdminGiveRank(ctx, user, text) {
  try {
    log(`⭐ Админ ${user.id} выдает ранг: "${text}"`);
    
    // Очищаем состояние пользователя
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    // Парсим данные
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply('❌ Неверный формат! Используйте: ID УРОВЕНЬ\n\n💡 Пример: 123456789 50');
      return;
    }
    
    const targetUserId = parseInt(parts[0]);
    const newLevel = parseInt(parts[1]);
    
    // Валидация данных
    if (!targetUserId || targetUserId <= 0) {
      await ctx.reply('❌ Некорректный ID пользователя!');
      return;
    }
    
    if (!newLevel || newLevel <= 0 || newLevel > 1000) {
      await ctx.reply('❌ Уровень должен быть от 1 до 1000!');
      return;
    }
    
    // Ищем пользователя
    const targetUser = await db.collection('users').findOne({ id: targetUserId });
    if (!targetUser) {
      await ctx.reply(`❌ Пользователь с ID ${targetUserId} не найден!`);
      return;
    }
    
    const oldLevel = targetUser.level || 1;
    const oldRank = getRankByLevel(oldLevel);
    const newRank = getRankByLevel(newLevel);
    
    // Обновляем пользователя
    await db.collection('users').updateOne(
      { id: targetUserId },
      { 
        $set: { 
          level: newLevel,
          experience: 0,
          experienceToNextLevel: calculateExperienceToNextLevel(newLevel),
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш целевого пользователя
    userCache.delete(targetUserId);
    
    // Отправляем подтверждение админу
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_ranks')]
    ]);
    
    await ctx.reply(
      `✅ *Ранг успешно выдан!*\n\n` +
      `👤 *Пользователь:* ${getDisplayName(targetUser)} (ID: ${targetUserId})\n` +
      `📊 *Изменения:*\n` +
      `├ Старый уровень: \`${oldLevel}\` (${oldRank})\n` +
      `├ Новый уровень: \`${newLevel}\` (${newRank})\n` +
      `└ Опыт: сброшен до 0\n\n` +
      `📅 Выдано: ${new Date().toLocaleString('ru-RU')}\n\n` +
      `🎯 Ранг обновлен!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    log(`✅ Ранг успешно выдан админом ${user.id} пользователю ${targetUserId}: ${oldLevel} → ${newLevel}`);
    
  } catch (error) {
    logError(error, `Выдача ранга админом ${user.id}`);
    await ctx.reply('❌ Ошибка выдачи ранга. Попробуйте позже.');
  }
}

// ==================== СООБЩЕНИЕ ОБ ОШИБКАХ ====================
async function handleBugReport(ctx, user, text) {
  try {
    log(`🐛 Пользователь ${user.id} сообщает об ошибке: "${text}"`);
    
    // Очищаем состояние пользователя
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    // Сохраняем сообщение об ошибке в базу данных
    const bugReport = {
      userId: user.id,
      userFirstName: user.firstName,
      userUsername: user.username,
      report: text,
      timestamp: new Date(),
      status: 'new',
      reviewed: false
    };
    
    await db.collection('bugReports').insertOne(bugReport);
    
    // Отправляем уведомление админам
    const adminIds = await getAdminIds();
    for (const adminId of adminIds) {
      try {
        await ctx.telegram.sendMessage(
          adminId,
          `🐛 *Новое сообщение об ошибке!*\n\n` +
          `👤 *От:* ${getDisplayName(user)} (ID: ${user.id})\n` +
          `📝 *Сообщение:* ${text}\n` +
          `📅 *Время:* ${new Date().toLocaleString('ru-RU')}\n\n` +
          `🔍 Проверьте и оцените вознаграждение!`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        logError(error, `Отправка уведомления админу ${adminId}`);
      }
    }
    
    // Отправляем подтверждение пользователю
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад в поддержку', 'support')]
    ]);
    
    await ctx.reply(
      `✅ *Сообщение об ошибке отправлено!*\n\n` +
      `📝 Ваше сообщение:\n` +
      `"${text}"\n\n` +
      `💰 *Вознаграждение:*\n` +
      `├ Мы рассмотрим ваше сообщение\n` +
      `├ При подтверждении ошибки вы получите награду\n` +
      `└ Размер награды зависит от важности ошибки\n\n` +
      `📧 Мы свяжемся с вами в ближайшее время!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    log(`✅ Сообщение об ошибке от пользователя ${user.id} успешно сохранено`);
    
  } catch (error) {
    logError(error, `Сообщение об ошибке от пользователя ${user.id}`);
    await ctx.reply('❌ Ошибка отправки сообщения. Попробуйте позже.');
  }
}
// ==================== СОЗДАНИЕ ПРОМОКОДОВ ====================
async function handleAdminCreatePromocode(ctx, user, text) {
  try {
    log(`🎫 Админ ${user.id} создает промокод: "${text}"`);
    
    // Очищаем состояние пользователя
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    // Парсим данные промокода
    const parts = text.trim().split(/\s+/);
    if (parts.length < 3) {
      await ctx.reply('❌ Неверный формат! Используйте: КОД НАГРАДА АКТИВАЦИИ\n\n💡 Пример: WELCOME 100 50');
      return;
    }
    
    const code = parts[0].toUpperCase();
    const reward = parseFloat(parts[1]);
    const maxActivations = parseInt(parts[2]);
    
    // Валидация данных
    if (!code || code.length < 3) {
      await ctx.reply('❌ Код промокода должен содержать минимум 3 символа!');
      return;
    }
    
    if (!reward || reward <= 0) {
      await ctx.reply('❌ Награда должна быть больше 0!');
      return;
    }
    
    if (!maxActivations || maxActivations <= 0 || maxActivations > 10000) {
      await ctx.reply('❌ Количество активаций должно быть от 1 до 10000!');
      return;
    }
    
    // Проверяем, не существует ли уже такой промокод
    const existingPromocode = await db.collection('promocodes').findOne({ code: code });
    if (existingPromocode) {
      await ctx.reply(`❌ Промокод "${code}" уже существует!`);
      return;
    }
    
    // Создаем промокод
    const promocode = {
      code: code,
      reward: reward,
      maxActivations: maxActivations,
      activations: 0,
      totalActivations: 0,
      totalRewards: 0,
      isActive: true,
      createdAt: new Date(),
      createdBy: user.id,
      activationsHistory: []
    };
    
    // Сохраняем в базу данных
    await db.collection('promocodes').insertOne(promocode);
    
    // Отправляем подтверждение админу
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_promocodes')]
    ]);
    
    await ctx.reply(
      `✅ *Промокод создан успешно!*\n\n` +
      `🎫 Код: \`${code}\`\n` +
      `💰 Награда: \`${formatNumber(reward)}\` Stars\n` +
      `📊 Максимум активаций: \`${maxActivations}\`\n` +
      `📅 Создан: ${new Date().toLocaleString('ru-RU')}\n\n` +
      `🎯 Промокод готов к использованию!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );

    // Отправляем уведомление в чат magnumtapchat
    try {
      const chatNotification = `🎉 *Новый промокод доступен!*\n\n` +
        `🎫 Код: \`${code}\`\n` +
        `🏅 Редкость: Обычный\n` +
        `💎 Награды:\n` +
        `├ 💰 Stars: +${formatNumber(reward)}\n\n` +
        `📊 Статистика:\n` +
        `├ 🔄 Всего активаций: ${maxActivations}\n` +
        `├ ✅ Уже активировано: 0\n` +
        `└ ⏳ Осталось: ${maxActivations}\n\n` +
        `📅 Дата создания: ${new Date().toLocaleString('ru-RU')}\n` +
        `⏰ Действует до: Бессрочно\n\n` +
        `⚡ Успей активировать и получи свои награды первым!`;

      await bot.telegram.sendMessage(config.PROMO_NOTIFICATIONS_CHAT, chatNotification, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [Markup.button.url('🎮 Активировать в боте', `https://t.me/${config.BOT_USERNAME}`)]
          ]
        }
      });

      log(`📢 Уведомление о промокоде ${code} отправлено в чат`);
    } catch (notifyError) {
      logError(notifyError, `Отправка уведомления о промокоде ${code}`);
    }

    log(`✅ Промокод ${code} успешно создан админом ${user.id}, награда: ${reward} Stars, активаций: ${maxActivations}`);
    
  } catch (error) {
    logError(error, `Создание промокода админом ${user.id}`);
    await ctx.reply('❌ Ошибка создания промокода. Попробуйте позже.');
  }
}

// ==================== СОЗДАНИЕ ПРОМОКОДОВ ПО ТИПАМ ====================

// Создание ключа Stars
async function handleAdminCreatePromoStars(ctx, user, text) {
  try {
    log(`💰 Админ ${user.id} создает ключ Stars: "${text}"`);
    
    // Очищаем состояние пользователя
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    // Парсим данные ключа
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply('❌ Неверный формат! Используйте: НАГРАДА АКТИВАЦИИ\n\n💡 Пример: 100 50');
      return;
    }
    
    const reward = parseFloat(parts[0]);
    const maxActivations = parseInt(parts[1]);
    
    // Генерируем уникальный ключ
    let code;
    let attempts = 0;
    do {
      code = generateKey();
      attempts++;
      if (attempts > 10) {
        await ctx.reply('❌ Ошибка генерации уникального ключа. Попробуйте еще раз.');
        return;
      }
    } while (await db.collection('promocodes').findOne({ code: code }));
    
    // Валидация данных
    
    if (!reward || reward <= 0) {
      await ctx.reply('❌ Награда должна быть больше 0!');
      return;
    }
    
    if (!maxActivations || maxActivations <= 0 || maxActivations > 10000) {
      await ctx.reply('❌ Количество активаций должно быть от 1 до 10000!');
      return;
    }
    
    // Проверяем, не существует ли уже такой промокод
    const existingPromocode = await db.collection('promocodes').findOne({ code: code });
    if (existingPromocode) {
      await ctx.reply(`❌ Промокод "${code}" уже существует!`);
      return;
    }
    
    // Создаем промокод
    const promocode = {
      code: code,
      reward: reward,
      rewardType: 'Stars',
      maxActivations: maxActivations,
      activations: 0,
      totalActivations: 0,
      totalRewards: 0,
      isActive: true,
      createdAt: new Date(),
      createdBy: user.id,
      activationsHistory: []
    };
    
    // Сохраняем в базу данных
    await db.collection('promocodes').insertOne(promocode);
    
    // Отправляем подтверждение админу
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_promocodes')]
    ]);
    
    await ctx.reply(
      `✅ *Ключ Stars создан успешно!*\n\n` +
      `🔑 Ключ: \`${code}\`\n` +
      `💰 Награда: \`${formatNumber(reward)}\` Stars\n` +
      `📊 Максимум активаций: \`${maxActivations}\`\n` +
      `📅 Создан: ${new Date().toLocaleString('ru-RU')}\n\n` +
      `🎯 Ключ готов к использованию!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    log(`✅ Ключ Stars ${code} успешно создан админом ${user.id}, награда: ${reward} Stars, активаций: ${maxActivations}`);
    
  } catch (error) {
    logError(error, `Создание ключа Stars админом ${user.id}`);
    await ctx.reply('❌ Ошибка создания ключа. Попробуйте позже.');
  }
}

// Создание ключа Stars
async function handleAdminCreatePromoStars(ctx, user, text) {
  try {
    log(`⭐ Админ ${user.id} создает ключ Stars: "${text}"`);
    
    // Очищаем состояние пользователя
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    // Парсим данные ключа
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply('❌ Неверный формат! Используйте: НАГРАДА АКТИВАЦИИ\n\n💡 Пример: 50 25');
      return;
    }
    
    const reward = parseFloat(parts[0]);
    const maxActivations = parseInt(parts[1]);
    
    // Генерируем уникальный ключ
    let code;
    let attempts = 0;
    do {
      code = generateKey();
      attempts++;
      if (attempts > 10) {
        await ctx.reply('❌ Ошибка генерации уникального ключа. Попробуйте еще раз.');
        return;
      }
    } while (await db.collection('promocodes').findOne({ code: code }));
    
    // Валидация данных
    
    if (!reward || reward <= 0) {
      await ctx.reply('❌ Награда должна быть больше 0!');
      return;
    }
    
    if (!maxActivations || maxActivations <= 0 || maxActivations > 10000) {
      await ctx.reply('❌ Количество активаций должно быть от 1 до 10000!');
      return;
    }
    
    // Проверяем, не существует ли уже такой промокод
    const existingPromocode = await db.collection('promocodes').findOne({ code: code });
    if (existingPromocode) {
      await ctx.reply(`❌ Промокод "${code}" уже существует!`);
      return;
    }
    
    // Создаем промокод
    const promocode = {
      code: code,
      reward: reward,
      rewardType: 'stars',
      maxActivations: maxActivations,
      activations: 0,
      totalActivations: 0,
      totalRewards: 0,
      isActive: true,
      createdAt: new Date(),
      createdBy: user.id,
      activationsHistory: []
    };
    
    // Сохраняем в базу данных
    await db.collection('promocodes').insertOne(promocode);
    
    // Отправляем подтверждение админу
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_promocodes')]
    ]);
    
    await ctx.reply(
      `✅ *Ключ Stars создан успешно!*\n\n` +
      `🔑 Ключ: \`${code}\`\n` +
      `⭐ Награда: \`${formatNumber(reward)}\` Stars\n` +
      `📊 Максимум активаций: \`${maxActivations}\`\n` +
      `📅 Создан: ${new Date().toLocaleString('ru-RU')}\n\n` +
      `🎯 Ключ готов к использованию!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );

    // Отправляем уведомление в чат magnumtapchat
    try {
      const chatNotification = `🎉 *Новый промокод доступен!*\n\n` +
        `🎫 Код: \`${code}\`\n` +
        `🏅 Редкость: Stars\n` +
        `💎 Награды:\n` +
        `├ ⭐ Stars: +${formatNumber(reward)}\n\n` +
        `📊 Статистика:\n` +
        `├ 🔄 Всего активаций: ${maxActivations}\n` +
        `├ ✅ Уже активировано: 0\n` +
        `└ ⏳ Осталось: ${maxActivations}\n\n` +
        `📅 Дата создания: ${new Date().toLocaleString('ru-RU')}\n` +
        `⏰ Действует до: Бессрочно\n\n` +
        `⚡ Успей активировать и получи свои награды первым!`;

      await bot.telegram.sendMessage(config.PROMO_NOTIFICATIONS_CHAT, chatNotification, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [Markup.button.url('🎮 Активировать в боте', `https://t.me/${config.BOT_USERNAME}`)]
          ]
        }
      });

      log(`📢 Уведомление о Stars промокоде ${code} отправлено в чат`);
    } catch (notifyError) {
      logError(notifyError, `Отправка уведомления о Stars промокоде ${code}`);
    }

    log(`✅ Ключ Stars ${code} успешно создан админом ${user.id}, награда: ${reward} Stars, активаций: ${maxActivations}`);
    
  } catch (error) {
    logError(error, `Создание ключа Stars админом ${user.id}`);
    await ctx.reply('❌ Ошибка создания ключа. Попробуйте позже.');
  }
}

// Создание ключа с титулом
async function handleAdminCreatePromoTitle(ctx, user, text) {
  try {
    log(`👑 Админ ${user.id} создает ключ с титулом: "${text}"`);
    
    // Очищаем состояние пользователя
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    // Парсим данные ключа
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply('❌ Неверный формат! Используйте: ТИТУЛ АКТИВАЦИИ\n\n💡 Пример: 👑 Легенда 10');
      return;
    }
    
    const title = parts.slice(0, -1).join(' '); // Все части кроме последней
    const maxActivations = parseInt(parts[parts.length - 1]);
    
    // Генерируем уникальный ключ
    let code;
    let attempts = 0;
    do {
      code = generateKey();
      attempts++;
      if (attempts > 10) {
        await ctx.reply('❌ Ошибка генерации уникального ключа. Попробуйте еще раз.');
        return;
      }
    } while (await db.collection('promocodes').findOne({ code: code }));
    
    // Валидация данных
    
    if (!title || title.length < 2) {
      await ctx.reply('❌ Название титула должно содержать минимум 2 символа!');
      return;
    }
    
    if (!maxActivations || maxActivations <= 0 || maxActivations > 10000) {
      await ctx.reply('❌ Количество активаций должно быть от 1 до 10000!');
      return;
    }
    
    // Проверяем, не существует ли уже такой промокод
    const existingPromocode = await db.collection('promocodes').findOne({ code: code });
    if (existingPromocode) {
      await ctx.reply(`❌ Промокод "${code}" уже существует!`);
      return;
    }
    
    // Создаем промокод
    const promocode = {
      code: code,
      reward: title,
      rewardType: 'title',
      maxActivations: maxActivations,
      activations: 0,
      totalActivations: 0,
      totalRewards: 0,
      isActive: true,
      createdAt: new Date(),
      createdBy: user.id,
      activationsHistory: []
    };
    
    // Сохраняем в базу данных
    await db.collection('promocodes').insertOne(promocode);
    
    // Отправляем подтверждение админу
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_promocodes')]
    ]);
    
    await ctx.reply(
      `✅ *Промокод с титулом создан успешно!*\n\n` +
      `🎫 Код: \`${code}\`\n` +
      `👑 Титул: \`${title}\`\n` +
      `📊 Максимум активаций: \`${maxActivations}\`\n` +
      `📅 Создан: ${new Date().toLocaleString('ru-RU')}\n\n` +
      `🎯 Промокод готов к использованию!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );

    // Отправляем уведомление в чат magnumtapchat
    try {
      const chatNotification = `🎉 *Новый промокод доступен!*\n\n` +
        `🎫 Код: \`${code}\`\n` +
        `🏅 Редкость: Титул\n` +
        `💎 Награды:\n` +
        `├ 👑 Титул: ${title}\n\n` +
        `📊 Статистика:\n` +
        `├ 🔄 Всего активаций: ${maxActivations}\n` +
        `├ ✅ Уже активировано: 0\n` +
        `└ ⏳ Осталось: ${maxActivations}\n\n` +
        `📅 Дата создания: ${new Date().toLocaleString('ru-RU')}\n` +
        `⏰ Действует до: Бессрочно\n\n` +
        `⚡ Успей активировать и получи свои награды первым!`;

      await bot.telegram.sendMessage(config.PROMO_NOTIFICATIONS_CHAT, chatNotification, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [Markup.button.url('🎮 Активировать в боте', `https://t.me/${config.BOT_USERNAME}`)]
          ]
        }
      });

      log(`📢 Уведомление о промокоде с титулом ${code} отправлено в чат`);
    } catch (notifyError) {
      logError(notifyError, `Отправка уведомления о промокоде с титулом ${code}`);
    }

    log(`✅ Промокод с титулом ${code} успешно создан админом ${user.id}, титул: ${title}, активаций: ${maxActivations}`);
    
  } catch (error) {
    logError(error, `Создание промокода с титулом админом ${user.id}`);
    await ctx.reply('❌ Ошибка создания промокода. Попробуйте позже.');
  }
}

// Создание промокода с сундуком
async function handleAdminCreatePromoChest(ctx, user, text, chestType) {
  try {
    const chestEmojis = {
      'common': '🟢',
      'rare': '🔵', 
      'epic': '🟣',
      'legendary': '🟡'
    };
    
    const chestNames = {
      'common': 'обычным сундуком',
      'rare': 'редким сундуком',
      'epic': 'эпическим сундуком', 
      'legendary': 'легендарным сундуком'
    };
    
    log(`${chestEmojis[chestType]} Админ ${user.id} создает промокод с ${chestNames[chestType]}: "${text}"`);
    
    // Очищаем состояние пользователя
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    // Парсим данные ключа
    const parts = text.trim().split(/\s+/);
    if (parts.length < 1) {
      await ctx.reply(`❌ Неверный формат! Используйте: АКТИВАЦИИ\n\n💡 Пример: 100`);
      return;
    }
    
    const maxActivations = parseInt(parts[0]);
    
    // Генерируем уникальный ключ
    let code;
    let attempts = 0;
    do {
      code = generateKey();
      attempts++;
      if (attempts > 10) {
        await ctx.reply('❌ Ошибка генерации уникального ключа. Попробуйте еще раз.');
        return;
      }
    } while (await db.collection('promocodes').findOne({ code: code }));
    
    // Валидация данных
    
    if (!maxActivations || maxActivations <= 0 || maxActivations > 10000) {
      await ctx.reply('❌ Количество активаций должно быть от 1 до 10000!');
      return;
    }
    
    // Проверяем, не существует ли уже такой промокод
    const existingPromocode = await db.collection('promocodes').findOne({ code: code });
    if (existingPromocode) {
      await ctx.reply(`❌ Промокод "${code}" уже существует!`);
      return;
    }
    
    // Создаем промокод с сундуком
    const promocode = {
      code: code,
      rewardType: 'chest',
      chestType: chestType,
      maxActivations: maxActivations,
      activations: 0,
      totalActivations: 0,
      totalRewards: 0,
      isActive: true,
      createdAt: new Date(),
      createdBy: user.id,
      activationsHistory: []
    };
    
    // Сохраняем в базу данных
    await db.collection('promocodes').insertOne(promocode);
    
    // Отправляем подтверждение админу
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_promocodes')]
    ]);
    
    await ctx.reply(
      `✅ *Ключ с ${chestNames[chestType]} создан успешно!*\n\n` +
      `🔑 Ключ: \`${code}\`\n` +
      `${chestEmojis[chestType]} Тип сундука: ${chestType.charAt(0).toUpperCase() + chestType.slice(1)}\n` +
      `📊 Максимум активаций: \`${maxActivations}\`\n` +
      `📅 Создан: ${new Date().toLocaleString('ru-RU')}\n\n` +
      `🎯 Ключ готов к использованию!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );

    // Отправляем уведомление в чат magnumtapchat
    try {
      const rarityNames = {
        'common': 'Обычный',
        'rare': 'Редкий',
        'epic': 'Эпический',
        'legendary': 'Легендарный'
      };

      const chatNotification = `🎉 *Новый промокод доступен!*\n\n` +
        `🎫 Код: \`${code}\`\n` +
        `🏅 Редкость: ${rarityNames[chestType]}\n` +
        `💎 Награды:\n` +
        `├ ${chestEmojis[chestType]} ${chestType.charAt(0).toUpperCase() + chestType.slice(1)} сундук\n\n` +
        `📊 Статистика:\n` +
        `├ 🔄 Всего активаций: ${maxActivations}\n` +
        `├ ✅ Уже активировано: 0\n` +
        `└ ⏳ Осталось: ${maxActivations}\n\n` +
        `📅 Дата создания: ${new Date().toLocaleString('ru-RU')}\n` +
        `⏰ Действует до: Бессрочно\n\n` +
        `⚡ Успей активировать и получи свои награды первым!`;

      await bot.telegram.sendMessage(config.PROMO_NOTIFICATIONS_CHAT, chatNotification, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [Markup.button.url('🎮 Активировать в боте', `https://t.me/${config.BOT_USERNAME}`)]
          ]
        }
      });

      log(`📢 Уведомление о сундуке ${code} (${chestType}) отправлено в чат`);
    } catch (notifyError) {
      logError(notifyError, `Отправка уведомления о сундуке ${code}`);
    }

    log(`✅ Ключ с ${chestNames[chestType]} ${code} успешно создан админом ${user.id}, активаций: ${maxActivations}`);
    
  } catch (error) {
    logError(error, `Создание ключа с сундуком админом ${user.id}`);
    await ctx.reply('❌ Ошибка создания ключа. Попробуйте позже.');
  }
}

// ==================== ФУНКЦИИ СОЗДАНИЯ ПОСТОВ ====================
// Функция для создания поста с кнопкой
async function handleAdminCreatePostWithButton(ctx, user, text) {
  try {
    log(`📝 Админ ${user.id} создает пост с кнопкой: "${text}"`);

    // Очищаем состояние пользователя
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    userCache.delete(user.id);

    // Парсим данные поста
    const parts = text.split('---').map(part => part.trim());
    if (parts.length !== 3) {
      await ctx.reply(
        `❌ Неверный формат! Используйте разделитель "---"\n\n` +
        `📋 Правильный формат:\n` +
        `├ Текст поста\n` +
        `├ ---\n` +
        `├ Текст кнопки\n` +
        `├ ---\n` +
        `└ URL кнопки\n\n` +
        `💡 Пример:\n` +
        `├ Добро пожаловать в Magnum Stars!\n` +
        `├ ---\n` +
        `├ Перейти в бота\n` +
        `├ ---\n` +
        `└ https://t.me/magnumtap_bot`
      );
      return;
    }

    const [postText, buttonText, buttonUrl] = parts;

    // Валидация данных
    if (!postText || postText.length < 10) {
      await ctx.reply('❌ Текст поста должен содержать минимум 10 символов!');
      return;
    }

    if (!buttonText || buttonText.length < 1) {
      await ctx.reply('❌ Текст кнопки не может быть пустым!');
      return;
    }

    if (!buttonUrl || !buttonUrl.match(/^https?:\/\/.+/)) {
      await ctx.reply('❌ URL кнопки должен начинаться с http:// или https://!');
      return;
    }

    // Проверяем канал
    if (!config.REQUIRED_CHANNEL || !config.REQUIRED_CHANNEL.startsWith('@')) {
      await ctx.reply('❌ Канал @magnumtap не настроен в конфигурации!');
      return;
    }

    // Создаем клавиатуру для поста
    const postKeyboard = Markup.inlineKeyboard([
      [Markup.button.url(buttonText, buttonUrl)]
    ]);

    // Публикуем пост в канал
    try {
      const channelMessage = await ctx.telegram.sendMessage(
        config.REQUIRED_CHANNEL,
        postText,
        {
          parse_mode: 'Markdown',
          reply_markup: postKeyboard.reply_markup,
          disable_web_page_preview: true
        }
      );

      // Сохраняем информацию о посте в базу данных
      await db.collection('adminPosts').insertOne({
        type: 'with_button',
        postText: postText,
        buttonText: buttonText,
        buttonUrl: buttonUrl,
        channelId: config.REQUIRED_CHANNEL,
        messageId: channelMessage.message_id,
        createdBy: user.id,
        createdAt: new Date()
      });

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📝 Создать еще', 'admin_create_post_with_button')],
        [Markup.button.callback('🔙 В админ панель', 'admin')]
      ]);

      await ctx.reply(
        `✅ *Пост с кнопкой успешно опубликован!*\n\n` +
        `📝 Текст: ${postText.substring(0, 50)}${postText.length > 50 ? '...' : ''}\n` +
        `🔘 Кнопка: ${buttonText}\n` +
        `🔗 URL: ${buttonUrl}\n` +
        `📢 Канал: ${config.REQUIRED_CHANNEL}\n` +
        `🆔 ID сообщения: \`${channelMessage.message_id}\`\n\n` +
        `🎯 Пост готов и опубликован!`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        }
      );

      log(`✅ Пост с кнопкой успешно опубликован админом ${user.id} в канал ${config.REQUIRED_CHANNEL}, ID: ${channelMessage.message_id}`);

    } catch (channelError) {
      logError(channelError, `Ошибка публикации поста в канал ${config.REQUIRED_CHANNEL}`);
      await ctx.reply(
        `❌ Ошибка публикации в канал ${config.REQUIRED_CHANNEL}!\n\n` +
        `Проверьте:\n` +
        `├ Бот добавлен в канал как администратор\n` +
        `├ Бот имеет права на отправку сообщений\n` +
        `└ Канал указан правильно в конфигурации`
      );
    }

  } catch (error) {
    logError(error, `Создание поста с кнопкой админом ${user.id}`);
    await ctx.reply('❌ Ошибка создания поста. Попробуйте позже.');
  }
}

// Функция для создания поста без кнопки
async function handleAdminCreatePostNoButton(ctx, user, text) {
  try {
    log(`📝 Админ ${user.id} создает пост без кнопки: "${text}"`);

    // Очищаем состояние пользователя
    await db.collection('users').updateOne(
      { id: user.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    userCache.delete(user.id);

    // Валидация данных
    if (!text || text.length < 10) {
      await ctx.reply('❌ Текст поста должен содержать минимум 10 символов!');
      return;
    }

    // Проверяем канал
    if (!config.REQUIRED_CHANNEL || !config.REQUIRED_CHANNEL.startsWith('@')) {
      await ctx.reply('❌ Канал @magnumtap не настроен в конфигурации!');
      return;
    }

    // Публикуем пост в канал
    try {
      const channelMessage = await ctx.telegram.sendMessage(
        config.REQUIRED_CHANNEL,
        text,
        {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }
      );

      // Сохраняем информацию о посте в базу данных
      await db.collection('adminPosts').insertOne({
        type: 'no_button',
        postText: text,
        channelId: config.REQUIRED_CHANNEL,
        messageId: channelMessage.message_id,
        createdBy: user.id,
        createdAt: new Date()
      });

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📝 Создать еще', 'admin_create_post_no_button')],
        [Markup.button.callback('🔙 В админ панель', 'admin')]
      ]);

      await ctx.reply(
        `✅ *Пост без кнопки успешно опубликован!*\n\n` +
        `📝 Текст: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}\n` +
        `📢 Канал: ${config.REQUIRED_CHANNEL}\n` +
        `🆔 ID сообщения: \`${channelMessage.message_id}\`\n\n` +
        `🎯 Пост готов и опубликован!`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        }
      );

      log(`✅ Пост без кнопки успешно опубликован админом ${user.id} в канал ${config.REQUIRED_CHANNEL}, ID: ${channelMessage.message_id}`);

    } catch (channelError) {
      logError(channelError, `Ошибка публикации поста в канал ${config.REQUIRED_CHANNEL}`);
      await ctx.reply(
        `❌ Ошибка публикации в канал ${config.REQUIRED_CHANNEL}!\n\n` +
        `Проверьте:\n` +
        `├ Бот добавлен в канал как администратор\n` +
        `├ Бот имеет права на отправку сообщений\n` +
        `└ Канал указан правильно в конфигурации`
      );
    }

  } catch (error) {
    logError(error, `Создание поста без кнопки админом ${user.id}`);
    await ctx.reply('❌ Ошибка создания поста. Попробуйте позже.');
  }
}

// ==================== СИСТЕМА СУНДУКОВ ====================
// Генерация награды из сундука
function generateChestReward() {
  const random = Math.random();
  
  // Распределение вероятностей для разных уровней сундуков
  if (random < 0.6) {
    // 🟢 Обычный сундук (60%)
    const isStars = Math.random() < 0.7; // 70% шанс на Stars, 30% на Stars
    
    if (isStars) {
      return {
        level: 'Обычный',
        emoji: '🟢',
        magnuStarsoins: Math.floor(Math.random() * 1000) + 1, // 1-1000 Stars
        stars: 0,
        description: 'Обычные награды (Stars)'
      };
    } else {
      return {
        level: 'Обычный',
        emoji: '🟢',
        magnuStarsoins: 0,
        stars: Math.floor(Math.random() * 5) + 1, // 1-5 Stars
        description: 'Обычные награды (Stars)'
      };
    }
  } else if (random < 0.85) {
    // 🔵 Редкий сундук (25%)
    return {
      level: 'Редкий',
      emoji: '🔵',
      magnuStarsoins: Math.floor(Math.random() * 100) + 50, // 50-150 Stars
      stars: Math.floor(Math.random() * 50) + 25, // 25-75 Stars
      minerBonus: Math.floor(Math.random() * 2) + 1, // 1-3 майнера
      description: 'Редкие награды с майнерами'
    };
  } else if (random < 0.96) {
    // 🟣 Эпический сундук (4% - уменьшено с 10%)
    return {
      level: 'Эпический',
      emoji: '🟣',
      magnuStarsoins: Math.floor(Math.random() * 200) + 100, // 100-300 Stars
      stars: Math.floor(Math.random() * 100) + 50, // 50-150 Stars
      title: getRandomEpicTitle(),
      multiplier: 1.5,
      description: 'Эпические награды с титулом'
    };
  } else {
    // 🟡 Легендарный сундук (2% - уменьшено с 5%)
    return {
      level: 'Легендарный',
      emoji: '🟡',
      magnuStarsoins: Math.floor(Math.random() * 500) + 300, // 300-800 Stars
      stars: Math.floor(Math.random() * 200) + 100, // 100-300 Stars
      minerBonus: Math.floor(Math.random() * 3) + 2, // 2-5 майнеров
      title: getRandomLegendaryTitle(),
      multiplier: 2.0,
      description: 'Легендарные награды'
    };
  }
}

// Получение случайного эпического титула
function getRandomEpicTitle() {
  const epicTitles = [
    '⚡ Молниеносный',
    '🔥 Огненный',
    '❄️ Ледяной',
    '🌪️ Вихревой',
    '⚔️ Воинственный',
    '🛡️ Защитник',
    '🎯 Снайпер',
    '🚀 Ракетчик'
  ];
  return epicTitles[Math.floor(Math.random() * epicTitles.length)];
}

// Получение случайного легендарного титула
function getRandomLegendaryTitle() {
  const legendaryTitles = [
    '👑 Король',
    '👸 Королева',
    '🐉 Дракон',
    '⚡ Громовержец',
    '🌟 Звездочет',
    '🌙 Лунный',
    '☀️ Солнечный',
    '💎 Алмазный'
  ];
  return legendaryTitles[Math.floor(Math.random() * legendaryTitles.length)];
}

// Форматирование награды из сундука
function formatChestReward(reward) {
  let text = '';
  
  if (reward.magnuStarsoins > 0) {
    text += `💰 Stars: +${formatNumber(reward.magnuStarsoins)}\n`;
  }
  
  if (reward.stars > 0) {
    text += `⭐ Stars: +${formatNumber(reward.stars)}\n`;
  }
  
  if (reward.minerBonus > 0) {
    text += `⛏️ Майнеры: +${reward.minerBonus} шт.\n`;
  }
  
  if (reward.title) {
    text += `👑 Титул: ${reward.title}\n`;
  }
  
  if (reward.multiplier) {
    text += `📈 Множитель: x${reward.multiplier}\n`;
  }
  
  return text.trim();
}

// ==================== АКТИВАЦИЯ ПРОМОКОДОВ ====================
async function handleUserEnterPromocode(ctx, user, text) {
  try {
    log(`🎫 Пользователь ${user.id} активирует промокод: "${text}"`);
    
    const code = text.trim().toUpperCase();
    
    // Валидация кода
    if (!code || code.length < 3) {
      await ctx.reply('❌ Неверный код промокода! Код должен содержать минимум 3 символа.');
      return;
    }
    
    // Проверяем дневной лимит промокодов
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dailyPromocodes = user.dailyPromocodes || [];
    const todayPromocodes = dailyPromocodes.filter(p => {
      const promoDate = new Date(p.date);
      return promoDate >= today && promoDate < tomorrow;
    });
    
    if (todayPromocodes.length >= 10) {
      await ctx.reply('❌ Вы достигли дневного лимита промокодов (10/10). Попробуйте завтра!');
      return;
    }
    
    // Проверяем, не использовал ли пользователь уже этот промокод
    const usedPromocodes = user.usedPromocodes || [];
    if (usedPromocodes.includes(code)) {
      await ctx.reply('❌ Вы уже использовали этот промокод!');
      return;
    }
    
    // Ищем промокод в базе данных
    const promocode = await db.collection('promocodes').findOne({ 
      code: code, 
      isActive: true 
    });
    
    if (!promocode) {
      await ctx.reply('❌ Промокод не найден или неактивен!');
      return;
    }
    
    // Проверяем срок действия
    if (promocode.expiresAt && new Date(promocode.expiresAt) < new Date()) {
      await ctx.reply('❌ Промокод истек!');
      return;
    }
    
    // Проверяем лимит активаций
    if (promocode.maxActivations && promocode.activations >= promocode.maxActivations) {
      await ctx.reply('❌ Лимит активаций промокода исчерпан!');
      return;
    }
    
    // Определяем тип награды
    let reward = 0;
    let rewardType = 'Stars';
    let chestReward = null;
    
    if (promocode.rewardType === 'chest') {
      // Новый тип - промокод с сундуком
      chestReward = generateChestReward();
      rewardType = 'chest';
    } else {
      // Старый тип - обычный промокод
      reward = promocode.reward || 0;
      rewardType = promocode.rewardType || 'Stars';
    }
    
    let updateData = {
      $push: { 
        usedPromocodes: code
      },
      $unset: { adminState: "" },
      $set: { updatedAt: new Date() }
    };
    
    if (rewardType === 'chest') {
      // Добавляем информацию о сундуке
      updateData.$push.dailyPromocodes = {
        code: code,
        date: new Date(),
        reward: chestReward,
        chestLevel: chestReward.level
      };
      
      // Начисляем награды из сундука
      if (chestReward.magnuStarsoins > 0) {
        updateData.$inc = {
          ...updateData.$inc,
          magnuStarsoins: chestReward.magnuStarsoins,
          totalEarnedMagnuStarsoins: chestReward.magnuStarsoins,
          experience: Math.floor(chestReward.magnuStarsoins * 5)
        };
      }
      
      if (chestReward.stars > 0) {
        updateData.$inc = {
          ...updateData.$inc,
          stars: chestReward.stars,
          totalEarnedStars: chestReward.stars,
          experience: Math.floor(chestReward.stars * 10)
        };
      }
      
      // Добавляем титул если есть
      if (chestReward.title) {
        updateData.$set.title = chestReward.title;
      }
      
      // Добавляем майнеры если есть
      if (chestReward.minerBonus > 0) {
        // Здесь можно добавить логику для выдачи майнеров
        updateData.$inc = {
          ...updateData.$inc,
          experience: chestReward.minerBonus * 25
        };
      }
    } else {
      // Старая логика для обычных промокодов
      if (rewardType === 'Stars') {
        updateData.$inc = {
          magnuStarsoins: reward,
          totalEarnedMagnuStarsoins: reward,
          experience: Math.floor(reward * 5)
        };
      } else if (rewardType === 'stars') {
        updateData.$inc = {
          stars: reward,
          totalEarnedStars: reward,
          experience: Math.floor(reward * 10)
        };
      } else if (rewardType === 'title') {
        updateData.$set.title = reward;
        updateData.$inc = {
          experience: 50
        };
      }
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      updateData
    );
    
    // Обновляем статистику промокода
    await db.collection('promocodes').updateOne(
      { _id: promocode._id },
      { 
        $inc: { 
          activations: 1,
          totalActivations: 1,
          totalRewards: reward
        },
        $push: { 
          activationsHistory: {
            userId: user.id,
            username: user.username || 'Неизвестно',
            activatedAt: new Date(),
            reward: reward
          }
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(user.id);
    
    // Проверяем и обновляем уровень пользователя
    const updatedUser = await getUser(user.id);
    if (updatedUser) {
      const levelResult = await checkAndUpdateLevel(updatedUser);
      if (levelResult.levelUp) {
        log(`🎉 Пользователь ${user.id} повысил уровень до ${levelResult.newLevel}!`);
      }
    }
    
    // Отправляем уведомление в канал (если настроен)
    if (config.PROMO_NOTIFICATIONS_CHAT) {
      try {
        let rewardText = '';
        if (rewardType === 'Stars') {
          rewardText = `💰 Награда: \`${formatNumber(reward)}\` Stars`;
        } else if (rewardType === 'stars') {
          rewardText = `⭐ Награда: \`${formatNumber(reward)}\` Stars`;
        } else if (rewardType === 'title') {
          rewardText = `👑 Награда: \`${reward}\``;
        }
        
        const notificationMessage = 
          `🎫 *Активация промокода!*\n\n` +
          `👤 Пользователь: ${user.firstName || 'Неизвестно'}\n` +
          `🆔 ID: \`${user.id}\`\n` +
          `🎫 Промокод: \`${code}\`\n` +
          `${rewardText}\n` +
          `📅 Время: ${new Date().toLocaleString('ru-RU')}`;
        
        await bot.telegram.sendMessage(config.PROMO_NOTIFICATIONS_CHAT, notificationMessage, {
          parse_mode: 'Markdown'
        });
      } catch (notifyError) {
        logError(notifyError, 'Отправка уведомления об активации промокода');
      }
    }
    
    // Отправляем уведомление
    let notificationText = '';
    
    if (rewardType === 'chest') {
      const rewardText = formatChestReward(chestReward);
      notificationText = `🎉 ${chestReward.emoji} ${chestReward.level} сундук!\n${rewardText}`;
    } else {
      if (rewardType === 'Stars') {
        notificationText = `💰 Получено ${formatNumber(reward)} Stars!`;
      } else if (rewardType === 'stars') {
        notificationText = `⭐ Получено ${formatNumber(reward)} Stars!`;
      } else if (rewardType === 'title') {
        notificationText = `👑 Получен титул "${reward}"!`;
      }
    }
    
    // Отправляем всплывающее уведомление по центру экрана
    await ctx.answerCbQuery(notificationText, { show_alert: true });
    
    let logReward = '';
    if (rewardType === 'chest') {
      logReward = `${chestReward.level} сундук`;
    } else if (rewardType === 'Stars') {
      logReward = `${reward} Stars`;
    } else if (rewardType === 'stars') {
      logReward = `${reward} Stars`;
    } else if (rewardType === 'title') {
      logReward = `титул "${reward}"`;
    }
    log(`✅ Промокод ${code} успешно активирован пользователем ${user.id}, награда: ${logReward}`);
    
  } catch (error) {
    logError(error, `Активация промокода пользователем ${user.id}`);
    await ctx.reply('❌ Ошибка активации промокода. Попробуйте позже.');
  }
}

// Обработка текстовых промокодов (для всплывающих уведомлений)
async function handleUserEnterPromocodeText(ctx, user, text) {
  try {
    log(`🎫 Пользователь ${user.id} активирует промокод текстом: "${text}"`);
    
    const code = text.trim().toUpperCase();
    
    // Валидация кода
    if (!code || code.length < 3) {
      await ctx.reply('❌ Неверный код промокода! Код должен содержать минимум 3 символа.');
      return;
    }
    
    // Проверяем дневной лимит промокодов
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dailyPromocodes = user.dailyPromocodes || [];
    const todayPromocodes = dailyPromocodes.filter(p => {
      const promoDate = new Date(p.date);
      return promoDate >= today && promoDate < tomorrow;
    });
    
    if (todayPromocodes.length >= 10) {
      await ctx.reply('❌ Вы достигли дневного лимита промокодов (10/10). Попробуйте завтра!');
      return;
    }
    
    // Проверяем, не использовал ли пользователь уже этот промокод
    const usedPromocodes = user.usedPromocodes || [];
    if (usedPromocodes.includes(code)) {
      await ctx.reply('❌ Вы уже использовали этот промокод!');
      return;
    }
    
    // Ищем промокод в базе данных
    const promocode = await db.collection('promocodes').findOne({ 
      code: code, 
      isActive: true 
    });
    
    if (!promocode) {
      await ctx.reply('❌ Промокод не найден или неактивен!');
      return;
    }
    
    // Проверяем срок действия
    if (promocode.expiresAt && new Date(promocode.expiresAt) < new Date()) {
      await ctx.reply('❌ Промокод истек!');
      return;
    }
    
    // Проверяем лимит активаций
    if (promocode.maxActivations && promocode.activations >= promocode.maxActivations) {
      await ctx.reply('❌ Лимит активаций промокода исчерпан!');
      return;
    }
    
    // Определяем тип награды
    let reward = 0;
    let rewardType = 'Stars';
    let chestReward = null;
    
    if (promocode.rewardType === 'chest') {
      // Новый тип - промокод с сундуком
      chestReward = generateChestReward();
      rewardType = 'chest';
    } else {
      // Старый тип - обычный промокод
      reward = promocode.reward || 0;
      rewardType = promocode.rewardType || 'Stars';
    }
    
    let updateData = {
      $push: { 
        usedPromocodes: code
      },
      $unset: { adminState: "" },
      $set: { updatedAt: new Date() }
    };
    
    if (rewardType === 'chest') {
      // Добавляем информацию о сундуке
      updateData.$push.dailyPromocodes = {
        code: code,
        date: new Date(),
        reward: chestReward,
        chestLevel: chestReward.level
      };
      
      // Начисляем награды из сундука
      if (chestReward.magnuStarsoins > 0) {
        updateData.$inc = {
          ...updateData.$inc,
          magnuStarsoins: chestReward.magnuStarsoins,
          totalEarnedMagnuStarsoins: chestReward.magnuStarsoins,
          experience: Math.floor(chestReward.magnuStarsoins * 5)
        };
      }
      
      if (chestReward.stars > 0) {
        updateData.$inc = {
          ...updateData.$inc,
          stars: chestReward.stars,
          totalEarnedStars: chestReward.stars,
          experience: Math.floor(chestReward.stars * 10)
        };
      }
      
      // Добавляем титул если есть
      if (chestReward.title) {
        updateData.$set.title = chestReward.title;
      }
      
      // Добавляем майнеры если есть
      if (chestReward.minerBonus > 0) {
        updateData.$inc = {
          ...updateData.$inc,
          experience: chestReward.minerBonus * 25
        };
      }
    } else {
      // Старая логика для обычных промокодов
      if (rewardType === 'Stars') {
        updateData.$inc = {
          magnuStarsoins: reward,
          totalEarnedMagnuStarsoins: reward,
          experience: Math.floor(reward * 5)
        };
      } else if (rewardType === 'stars') {
        updateData.$inc = {
          stars: reward,
          totalEarnedStars: reward,
          experience: Math.floor(reward * 10)
        };
      } else if (rewardType === 'title') {
        updateData.$set.title = reward;
        updateData.$inc = {
          experience: 50
        };
      }
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      updateData
    );
    
    // Обновляем статистику промокода
    await db.collection('promocodes').updateOne(
      { _id: promocode._id },
      { 
        $inc: { 
          activations: 1,
          totalActivations: 1,
          totalRewards: rewardType === 'chest' ? (chestReward.magnuStarsoins || 0) + (chestReward.stars || 0) : reward
        },
        $push: { 
          activationsHistory: {
            userId: user.id,
            username: user.username || 'Неизвестно',
            activatedAt: new Date(),
            reward: rewardType === 'chest' ? chestReward : reward
          }
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(user.id);
    
    // Проверяем и обновляем уровень пользователя
    const updatedUser = await getUser(user.id);
    if (updatedUser) {
      const levelResult = await checkAndUpdateLevel(updatedUser);
      if (levelResult.levelUp) {
        log(`🎉 Пользователь ${user.id} повысил уровень до ${levelResult.newLevel}!`);
      }
    }
    
    // Отправляем уведомление в канал (если настроен)
    if (config.PROMO_NOTIFICATIONS_CHAT) {
      try {
        let rewardText = '';
        if (rewardType === 'chest') {
          rewardText = `🎁 ${chestReward.level} сундук`;
        } else if (rewardType === 'Stars') {
          rewardText = `💰 Награда: \`${formatNumber(reward)}\` Stars`;
        } else if (rewardType === 'stars') {
          rewardText = `⭐ Награда: \`${formatNumber(reward)}\` Stars`;
        } else if (rewardType === 'title') {
          rewardText = `👑 Награда: \`${reward}\``;
        }
        
        const notificationMessage = 
          `🎫 *Активация промокода!*\n\n` +
          `👤 Пользователь: ${user.firstName || 'Неизвестно'}\n` +
          `🆔 ID: \`${user.id}\`\n` +
          `🎫 Промокод: \`${code}\`\n` +
          `${rewardText}\n` +
          `📅 Время: ${new Date().toLocaleString('ru-RU')}`;
        
        await bot.telegram.sendMessage(config.PROMO_NOTIFICATIONS_CHAT, notificationMessage, {
          parse_mode: 'Markdown'
        });
      } catch (notifyError) {
        logError(notifyError, 'Отправка уведомления об активации промокода');
      }
    }
    
    // Отправляем всплывающее уведомление по центру экрана
    let notificationText = '';
    
    if (rewardType === 'chest') {
      const rewardText = formatChestReward(chestReward);
      notificationText = `🎉 ${chestReward.emoji} ${chestReward.level} сундук!\n${rewardText}`;
    } else {
      if (rewardType === 'Stars') {
        notificationText = `💰 Получено ${formatNumber(reward)} Stars!`;
      } else if (rewardType === 'stars') {
        notificationText = `⭐ Получено ${formatNumber(reward)} Stars!`;
      } else if (rewardType === 'title') {
        notificationText = `👑 Получен титул "${reward}"!`;
      }
    }
    
    // Отправляем всплывающее уведомление
    await ctx.reply(notificationText);
    
    let logReward = '';
    if (rewardType === 'chest') {
      logReward = `${chestReward.level} сундук`;
    } else if (rewardType === 'Stars') {
      logReward = `${reward} Stars`;
    } else if (rewardType === 'stars') {
      logReward = `${reward} Stars`;
    } else if (rewardType === 'title') {
      logReward = `титул "${reward}"`;
    }
    log(`✅ Промокод ${code} успешно активирован пользователем ${user.id}, награда: ${logReward}`);
    
  } catch (error) {
    logError(error, `Активация промокода текстом пользователем ${user.id}`);
    await ctx.reply('❌ Ошибка активации промокода. Попробуйте позже.');
  }
}

// ==================== FAQ ОБРАБОТЧИКИ ====================


bot.action('faq_miner', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'support_faq')]
    ]);
    
    const message = 
      `⛏️ *FAQ - Майнер*\n\n` +
      `*❓ Что такое майнер?*\n` +
      `Майнер - это автоматический способ заработка Stars. Он работает в фоновом режиме и приносит награды каждую минуту.\n\n` +
      `*❓ Как запустить майнер?*\n` +
      `Перейдите в раздел "Фарм" → "⛏️ Майнер" и нажмите "▶️ Запустить майнер".\n\n` +
      `*❓ Как часто майнер приносит награды?*\n` +
      `Майнер приносит награды каждую минуту.\n\n` +
          `*❓ Сколько Stars я получаю от майнера?*\n` +
    `Награда майнера динамическая и зависит от:\n` +
    `• Курса обмена Stars\n` +
    `• Количества активных майнеров\n` +
    `• Уровня вашего майнера\n\n` +
      `*❓ Как улучшить майнер?*\n` +
      `Майнер можно улучшить, потратив Stars. Улучшения увеличивают эффективность и награды.\n\n` +
      `*❓ Что такое эффективность майнера?*\n` +
      `Эффективность показывает множитель награды. Например, эффективность 2x означает двойную награду.\n\n` +
      `*❓ Можно ли остановить майнер?*\n` +
      `Да, майнер можно остановить в любой момент, нажав кнопку "⏹️ Остановить майнер".\n\n` +
      `*❓ Что происходит при остановке майнера?*\n` +
      `При остановке майнер перестает приносить награды, но прогресс сохраняется.`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'FAQ Майнер');
  }
});
bot.action('faq_bonus', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'support_faq')]
    ]);
    
    const message = 
      `🎁 *FAQ - Бонусы*\n\n` +
      `*❓ Что такое ежедневный бонус?*\n` +
      `Ежедневный бонус - это награда, которую можно получить раз в день. Бонус увеличивается с каждым днем подряд.\n\n` +
      `*❓ Как часто можно получать бонус?*\n` +
      `Бонус доступен каждые 24 часа. Если вы пропустите день, серия сбрасывается.\n\n` +
      `*❓ Что такое серия бонусов?*\n` +
      `Серия - это количество дней подряд, когда вы забирали бонус. Чем длиннее серия, тем больше награда.\n\n` +
      `*❓ Сколько Magnum Coins в бонусе?*\n` +
      `Базовый бонус составляет ${config.DAILY_BONUS_BASE || 10} Magnum Coins. С каждым днем серии награда увеличивается.\n\n` +
      `*❓ Что происходит при пропуске дня?*\n` +
      `Если вы пропустите день, серия сбрасывается на 1, и награда возвращается к базовому значению.\n\n` +
      `*❓ Как посмотреть статистику бонусов?*\n` +
      `В разделе "Бонусы" → "📊 Статистика" можно посмотреть общую статистику полученных бонусов.\n\n` +
      `*❓ Что такое серия бонусов?*\n` +
      `В разделе "Бонусы" → "🔥 Серия" отображается текущая серия и награда за следующий день.`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'FAQ Бонусы');
  }
});
bot.action('faq_exchange', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'support_faq')]
    ]);
    
    const message = 
      `💎 *FAQ - Обмен*\n\n` +
      `*❓ Что такое обмен?*\n` +
      `Обмен позволяет конвертировать Stars в Stars по фиксированному курсу.\n\n` +
      `*❓ Какой курс обмена?*\n` +
      `Курс обмена: 1 Magnum Coin = 1 Star (1:1).\n\n` +
      `*❓ Какие суммы можно обменивать?*\n` +
      `Доступные суммы: 10, 50, 100, 500, 1000, 5000 Stars.\n\n` +
      `*❓ Можно ли обменять Stars обратно на Stars?*\n` +
      `Нет, обмен работает только в одну сторону: Stars → Stars.\n\n` +
      `*❓ Есть ли комиссия за обмен?*\n` +
      `Нет, обмен происходит без комиссии по курсу 1:1.\n\n` +
      `*❓ Зачем нужны Stars?*\n` +
      `Stars используются для вывода средств и других операций в боте.\n\n` +
      `*❓ Можно ли отменить обмен?*\n` +
      `Нет, обмен нельзя отменить после подтверждения.`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'FAQ Обмен');
  }
});

bot.action('faq_promocodes', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'support_faq')]
    ]);
    
    const message = 
      `🎫 *FAQ - Промокоды*\n\n` +
      `*❓ Что такое промокоды?*\n` +
      `Промокоды - это специальные коды, которые дают бонусные Stars при активации.\n\n` +
      `*❓ Как активировать промокод?*\n` +
      `Перейдите в "🎫 Промокод" → "🔑 Активировать ключ" и введите код.\n\n` +
      `*❓ Какие награды дают промокоды?*\n` +
      `Промокоды дают Stars. Количество зависит от конкретного промокода.\n\n` +
      `*❓ Можно ли использовать один промокод несколько раз?*\n` +
      `Нет, каждый промокод можно использовать только один раз на аккаунт.\n\n` +
      `*❓ Что если промокод не работает?*\n` +
      `Возможные причины: промокод уже использован, закончились активации, неверный код.\n\n` +
      `*❓ Где взять промокоды?*\n` +
      `Промокоды публикуются в официальном канале бота и в социальных сетях.\n\n` +
      `*❓ Как посмотреть историю промокодов?*\n` +
      `В разделе "🎫 Промокод" → "📊 История промокодов" можно посмотреть использованные коды.\n\n` +
      `*❓ Что такое активации промокода?*\n` +
      `Активации - это количество раз, которое можно использовать промокод. Когда активации заканчиваются, промокод становится недействительным.`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'FAQ Промокоды');
  }
});

bot.action('faq_referrals', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'support_faq')]
    ]);
    
    const message = 
      `👥 *FAQ - Рефералы*\n\n` +
      `*❓ Что такое реферальная система?*\n` +
      `Реферальная система позволяет получать награды за приглашение друзей в бота.\n\n` +
      `*❓ Как пригласить друга?*\n` +
      `Перейдите в "👥 Рефералы" → "🔗 Реферальная ссылка" и отправьте ссылку другу.\n\n` +
      `*❓ Как работает реферальная ссылка?*\n` +
      `Когда друг переходит по вашей ссылке и запускает бота, он становится вашим рефералом.\n\n` +
      `*❓ Какие награды за рефералов?*\n` +
      `За каждого реферала вы получаете ${config.REFERRAL_REWARD || 10} Stars.\n\n` +
      `*❓ Что такое уровни рефералов?*\n` +
      `Уровни зависят от количества рефералов:\n` +
      `• 1-5 рефералов: Новичок\n` +
      `• 6-15 рефералов: Опытный\n` +
      `• 16-30 рефералов: Эксперт\n` +
      `• 31+ рефералов: Мастер\n\n` +
      `*❓ Можно ли потерять рефералов?*\n` +
      `Нет, рефералы остаются с вами навсегда после регистрации.\n\n` +
      `*❓ Как посмотреть список рефералов?*\n` +
      `В разделе "👥 Рефералы" → "📋 Список рефералов" можно посмотреть всех приглашенных друзей.\n\n` +
      `*❓ Что такое реферальная статистика?*\n` +
      `В статистике отображается общее количество рефералов, заработанные награды и уровень.`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'FAQ Рефералы');
  }
});

bot.action('faq_achievements', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'support_faq')]
    ]);
    
    const message = 
      `🏆 *FAQ - Достижения*\n\n` +
      `*❓ Что такое достижения?*\n` +
      `Достижения - это система наград за выполнение различных задач в боте.\n\n` +
      `*❓ Какие бывают достижения?*\n` +
      `• Фарм достижения - за количество фармов\n` +
      `• Майнер достижения - за время работы майнера\n` +
      `• Бонус достижения - за серии бонусов\n` +
      `• Реферал достижения - за количество рефералов\n` +
      `• Обмен достижения - за обмены валют\n` +
      `• Общие достижения - за общую активность\n\n` +
      `*❓ Как получить достижения?*\n` +
      `Достижения получаются автоматически при выполнении условий. Прогресс отображается в процентах.\n\n` +
      `*❓ Какие награды за достижения?*\n` +
      `За достижения даются Stars. Количество зависит от сложности достижения.\n\n` +
      `*❓ Как посмотреть прогресс достижений?*\n` +
      `В разделе "🏆 Достижения" → "📊 Прогресс" можно посмотреть прогресс по всем достижениям.\n\n` +
      `*❓ Можно ли потерять достижения?*\n` +
      `Нет, полученные достижения остаются навсегда.\n\n` +
      `*❓ Что такое награды достижений?*\n` +
      `В разделе "🏆 Достижения" → "🎁 Награды" можно посмотреть все доступные награды.\n\n` +
      `*❓ Как часто обновляется прогресс?*\n` +
      `Прогресс обновляется в реальном времени при выполнении действий.`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'FAQ Достижения');
  }
});

bot.action('faq_tasks', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'support_faq')]
    ]);
    
    const message = 
      `📋 *FAQ - Задания*\n\n` +
      `*❓ Что такое задания?*\n` +
      `Задания - это способ получить дополнительные Stars за выполнение различных действий.\n\n` +
      `*❓ Какие бывают задания?*\n` +
      `• Спонсорские задания - подписка на каналы, запуск ботов\n` +
      `• Ежедневные задания - регулярные задачи\n` +
      `• Специальные задания - временные акции\n\n` +
      `*❓ Как выполнить спонсорское задание?*\n` +
      `1. Выберите задание в разделе "📋 Задания" → "🎯 Спонсорские"\n` +
      `2. Нажмите "✅ Выполнить"\n` +
      `3. Подпишитесь на канал или запустите бота\n` +
      `4. Вернитесь и нажмите "🎁 Получить награду"\n\n` +
      `*❓ Как проверить выполнение задания?*\n` +
      `Бот автоматически проверяет выполнение заданий. Если задание выполнено, появится кнопка "🎁 Получить награду".\n\n` +
      `*❓ Какие награды за задания?*\n` +
      `Задания дают Stars. Количество зависит от сложности задания.\n\n` +
      `*❓ Можно ли выполнить задание несколько раз?*\n` +
      `Нет, каждое задание можно выполнить только один раз.\n\n` +
      `*❓ Что такое прогресс заданий?*\n` +
      `В разделе "📋 Задания" → "📊 Прогресс" можно посмотреть статистику выполненных заданий.\n\n` +
      `*❓ Что если задание не работает?*\n` +
      `Убедитесь, что вы подписались на канал или запустили бота. Иногда требуется время для проверки.`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'FAQ Задания');
  }
});
// Обработчик для кнопки поддержки
bot.action('support', async (ctx) => {
  try {
    logFunction('bot.action.support', ctx.from.id);
    log(`🆘 Запрос меню поддержки от пользователя ${ctx.from.id}`);
    
    const user = await getUser(ctx.from.id);
    if (!user) {
      log(`❌ Не удалось получить пользователя ${ctx.from.id} для меню поддержки`);
      return;
    }
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📝 Создать тикет', 'contact_support')],
      [Markup.button.callback('❓ FAQ', 'support_faq')],
      [Markup.button.callback('🔙 Назад', 'settings')]
    ]);
    
    const message = 
      `🆘 *Поддержка*\n\n` +
      `👋 Привет! Мы готовы помочь вам с любыми вопросами.\n\n` +
      `📋 *Выберите способ связи:*\n\n` +
      `📝 *Создать тикет* - Опишите проблему и получите ответ\n` +
      `❓ *FAQ* - Часто задаваемые вопросы\n\n` +
      `⏰ *Время ответа:*\n` +
      `└ Тикет: до 2 часов\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Пользователю ${ctx.from.id} показано меню поддержки`);
    
  } catch (error) {
    logError(error, `Показ меню поддержки для пользователя ${ctx.from.id}`);
    await ctx.answerCbQuery('❌ Ошибка загрузки меню поддержки');
  }
});
// Обработчик для создания тикета поддержки
bot.action('contact_support', async (ctx) => {
  try {
    logFunction('bot.action.contact_support', ctx.from.id);
    log(`🆘 Запрос создания тикета поддержки от пользователя ${ctx.from.id}`);
    
    const user = await getUser(ctx.from.id);
    if (!user) {
      log(`❌ Не удалось получить пользователя ${ctx.from.id} для создания тикета`);
      return;
    }
    
    // Устанавливаем состояние для создания тикета
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'creating_support_ticket', updatedAt: new Date() } }
    );
    
    // Очищаем кеш пользователя, чтобы изменения применились
    userCache.delete(user.id);
    
    logDebug(`Установлен adminState для пользователя ${ctx.from.id}`, { adminState: 'creating_support_ticket' });
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'support')]
    ]);
    
    const message = 
      `🆘 *Создание тикета поддержки*\n\n` +
      `Ваш ID: \`${user.id}\`\n\n` +
      `📝 Опишите вашу проблему в одном сообщении.\n\n` +
      `*Пример:*\n` +
      `"Не могу получить ежедневный бонус, пишет ошибка"\n\n` +
      `⚠️ *Важно:* Опишите проблему максимально подробно, чтобы мы могли помочь быстрее.`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Пользователю ${ctx.from.id} показана форма создания тикета`);
    
  } catch (error) {
    logError(error, `Создание тикета поддержки для пользователя ${ctx.from.id}`);
    logDebug(`Ошибка в contact_support`, {
      userId: ctx.from.id,
      error: error.message,
      stack: error.stack
    });
  }
});
// ==================== ОБРАБОТЧИКИ КАНАЛА ПОДДЕРЖКИ ====================
// Обработчик для ответа на тикет
bot.action(/^support_answer_(.+)$/, async (ctx) => {
  try {
    console.log(`✅ Админ ${ctx.from.id} отвечает на тикет ${ctx.match[1]}`);
    
    const ticketId = ctx.match[1];
    const admin = await getUser(ctx.from.id);
    
    if (!admin || !isAdmin(admin.id)) {
      console.log(`❌ Пользователь ${ctx.from.id} не является админом`);
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Устанавливаем состояние для ответа на тикет
    await db.collection('users').updateOne(
      { id: admin.id },
      { $set: { adminState: `answering_ticket_${ticketId}`, updatedAt: new Date() } }
    );
    
    console.log(`💾 adminState установлен в БД для админа ${admin.id}: answering_ticket_${ticketId}`);
    
    // Очищаем кеш пользователя, чтобы adminState обновился
    userCache.delete(admin.id);
    console.log(`🗑️ Кеш пользователя ${admin.id} очищен`);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', `support_cancel_${ticketId}`)],
      [Markup.button.url('💬 Открыть чат с ботом', `https://t.me/${(await bot.telegram.getMe()).username}`)]
    ]);
    
    const message = 
      `✅ *Ответ на тикет*\n\n` +
      `🆔 *ID тикета:* \`${ticketId}\`\n\n` +
      `📝 Напишите ответ пользователю в личном чате с ботом:\n\n` +
      `💡 *Советы:*\n` +
      `• Будьте вежливы и профессиональны\n` +
      `• Дайте четкий и понятный ответ\n` +
      `• Если нужно, задайте уточняющие вопросы\n\n` +
      `⚠️ *Важно:* Отправьте ответ в личном чате с ботом, а не в этом канале!`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    // Отправляем уведомление админу в личном чате
    try {
      const personalMessage = 
        `✅ *Форма ответа на тикет*\n\n` +
        `🆔 *ID тикета:* \`${ticketId}\`\n\n` +
        `📝 Напишите ответ пользователю:\n\n` +
        `💡 *Советы:*\n` +
        `• Будьте вежливы и профессиональны\n` +
        `• Дайте четкий и понятный ответ\n` +
        `• Если нужно, задайте уточняющие вопросы\n\n` +
        `⚠️ Просто напишите ваш ответ в этом чате!`;
      
      await ctx.telegram.sendMessage(admin.id, personalMessage, {
        parse_mode: 'Markdown'
      });
      
      console.log(`✅ Уведомление отправлено админу ${admin.id} в личном чате`);
    } catch (error) {
      console.error(`❌ Ошибка отправки уведомления админу ${admin.id}:`, error);
    }
    
    console.log(`✅ Админу ${ctx.from.id} показана форма ответа на тикет ${ticketId}`);
    
  } catch (error) {
    console.error(`❌ Ошибка ответа на тикет ${ctx.match[1]} админом ${ctx.from.id}:`, error);
    await ctx.answerCbQuery('❌ Ошибка');
  }
});
// Обработчик для установки статуса "В обработке"
bot.action(/^support_progress_(.+)$/, async (ctx) => {
  try {
    console.log(`⏳ Админ ${ctx.from.id} устанавливает статус "В обработке" для тикета ${ctx.match[1]}`);
    
    const ticketId = ctx.match[1];
    const admin = await getUser(ctx.from.id);
    
    if (!admin || !isAdmin(admin.id)) {
      console.log(`❌ Пользователь ${ctx.from.id} не является админом`);
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Обновляем статус тикета
    await db.collection('supportTickets').updateOne(
      { id: ticketId },
      { 
        $set: { 
          status: 'in_progress',
          adminId: admin.id,
          updatedAt: new Date()
        }
      }
    );
    
    // Отправляем уведомление пользователю
    const ticket = await db.collection('supportTickets').findOne({ id: ticketId });
    if (ticket) {
      try {
        await ctx.telegram.sendMessage(ticket.userId, 
          `⏳ *Ваш тикет взят в обработку*\n\n` +
          `🆔 *ID тикета:* \`${ticketId}\`\n` +
          `📝 *Проблема:* ${ticket.subject}\n\n` +
          `⏰ Мы работаем над решением вашей проблемы.\n` +
          `📧 Ответим в ближайшее время!`
        );
        console.log(`✅ Уведомление отправлено пользователю ${ticket.userId}`);
      } catch (error) {
        console.error(`❌ Ошибка отправки уведомления пользователю ${ticket.userId}:`, error);
      }
    }
    
    // Обновляем сообщение в канале
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Ответить', `support_answer_${ticketId}`),
        Markup.button.callback('❌ Отклонить', `support_reject_${ticketId}`)
      ],
      [
        Markup.button.callback('🔒 Закрыть', `support_close_${ticketId}`)
      ]
    ]);
    
    const message = 
      `⏳ *Тикет в обработке*\n\n` +
      `🆔 *ID тикета:* \`${ticketId}\`\n` +
      `👤 *Пользователь:* ${ticket?.firstName || 'Не указано'}\n` +
      `📱 *Username:* ${ticket?.username ? '@' + ticket.username : 'Не указан'}\n` +
      `🆔 *User ID:* \`${ticket?.userId}\`\n` +
      `📅 *Дата:* ${ticket?.createdAt?.toLocaleString('ru-RU')}\n` +
      `👨‍💼 *Админ:* ${admin.firstName || admin.username || admin.id}\n\n` +
      `📝 *Проблема:*\n\`\`\`\n${ticket?.description}\n\`\`\`\n\n` +
      `🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    await ctx.answerCbQuery('✅ Статус обновлен');
    console.log(`✅ Статус тикета ${ticketId} обновлен на "В обработке"`);
  } catch (error) {
    console.error(`❌ Ошибка установки статуса "В обработке" для тикета ${ctx.match[1]}:`, error);
    await ctx.answerCbQuery('❌ Ошибка');
  }
});
// Обработчик для отклонения тикета
bot.action(/^support_reject_(.+)$/, async (ctx) => {
  try {
    console.log(`❌ Админ ${ctx.from.id} отклоняет тикет ${ctx.match[1]}`);
    
    const ticketId = ctx.match[1];
    const admin = await getUser(ctx.from.id);
    
    if (!admin || !isAdmin(admin.id)) {
      console.log(`❌ Пользователь ${ctx.from.id} не является админом`);
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Обновляем статус тикета
    await db.collection('supportTickets').updateOne(
      { id: ticketId },
      { 
        $set: { 
          status: 'rejected',
          adminId: admin.id,
          updatedAt: new Date()
        }
      }
    );
    
    // Отправляем уведомление пользователю
    const ticket = await db.collection('supportTickets').findOne({ id: ticketId });
    if (ticket) {
      try {
        await ctx.telegram.sendMessage(ticket.userId, 
          `❌ *Ваш тикет отклонен*\n\n` +
          `🆔 *ID тикета:* \`${ticketId}\`\n` +
          `📝 *Проблема:* ${ticket.subject}\n\n` +
          `⚠️ Ваш тикет был отклонен.\n` +
          `💡 Попробуйте создать новый тикет с более подробным описанием проблемы.`
        );
        console.log(`✅ Уведомление об отклонении отправлено пользователю ${ticket.userId}`);
      } catch (error) {
        console.error(`❌ Ошибка отправки уведомления об отклонении пользователю ${ticket.userId}:`, error);
      }
    }
    
    // Обновляем сообщение в канале
    const message = 
      `❌ *Тикет отклонен*\n\n` +
      `🆔 *ID тикета:* \`${ticketId}\`\n` +
      `👤 *Пользователь:* ${ticket?.firstName || 'Не указано'}\n` +
      `📱 *Username:* ${ticket?.username ? '@' + ticket.username : 'Не указан'}\n` +
      `🆔 *User ID:* \`${ticket?.userId}\`\n` +
      `📅 *Дата:* ${ticket?.createdAt?.toLocaleString('ru-RU')}\n` +
      `👨‍💼 *Админ:* ${admin.firstName || admin.username || admin.id}\n\n` +
      `📝 *Проблема:*\n\`\`\`\n${ticket?.description}\n\`\`\`\n\n` +
      `❌ *Статус:* Отклонен`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown'
    });
    
    await ctx.answerCbQuery('✅ Тикет отклонен');
    console.log(`✅ Тикет ${ticketId} отклонен админом ${ctx.from.id}`);
    
  } catch (error) {
    console.error(`❌ Ошибка отклонения тикета ${ctx.match[1]}:`, error);
    await ctx.answerCbQuery('❌ Ошибка');
  }
});
// Обработчик для закрытия тикета
bot.action(/^support_close_(.+)$/, async (ctx) => {
  try {
    console.log(`🔒 Админ ${ctx.from.id} закрывает тикет ${ctx.match[1]}`);
    
    const ticketId = ctx.match[1];
    const admin = await getUser(ctx.from.id);
    
    if (!admin || !isAdmin(admin.id)) {
      console.log(`❌ Пользователь ${ctx.from.id} не является админом`);
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Обновляем статус тикета
    await db.collection('supportTickets').updateOne(
      { id: ticketId },
      { 
        $set: { 
          status: 'closed',
          adminId: admin.id,
          updatedAt: new Date()
        }
      }
    );
    
    // Отправляем уведомление пользователю
    const ticket = await db.collection('supportTickets').findOne({ id: ticketId });
    if (ticket) {
      try {
        await ctx.telegram.sendMessage(ticket.userId, 
          `🔒 *Ваш тикет закрыт*\n\n` +
          `🆔 *ID тикета:* \`${ticketId}\`\n` +
          `📝 *Проблема:* ${ticket.subject}\n\n` +
          `✅ Ваш тикет был закрыт.\n` +
          `💡 Если у вас есть новые вопросы, создайте новый тикет.`
        );
        console.log(`✅ Уведомление о закрытии отправлено пользователю ${ticket.userId}`);
      } catch (error) {
        console.error(`❌ Ошибка отправки уведомления о закрытии пользователю ${ticket.userId}:`, error);
      }
    }
    
    // Обновляем сообщение в канале
    const message = 
      `🔒 *Тикет закрыт*\n\n` +
      `🆔 *ID тикета:* \`${ticketId}\`\n` +
      `👤 *Пользователь:* ${ticket?.firstName || 'Не указано'}\n` +
      `📱 *Username:* ${ticket?.username ? '@' + ticket.username : 'Не указан'}\n` +
      `🆔 *User ID:* \`${ticket?.userId}\`\n` +
      `📅 *Дата:* ${ticket?.createdAt?.toLocaleString('ru-RU')}\n` +
      `👨‍💼 *Админ:* ${admin.firstName || admin.username || admin.id}\n\n` +
      `📝 *Проблема:*\n\`\`\`\n${ticket?.description}\n\`\`\`\n\n` +
      `🔒 *Статус:* Закрыт`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown'
    });
    
    await ctx.answerCbQuery('✅ Тикет закрыт');
    console.log(`✅ Тикет ${ticketId} закрыт админом ${ctx.from.id}`);
    
  } catch (error) {
    console.error(`❌ Ошибка закрытия тикета ${ctx.match[1]}:`, error);
    await ctx.answerCbQuery('❌ Ошибка');
  }
});
// Обработчик для отмены ответа на тикет
bot.action(/^support_cancel_(.+)$/, async (ctx) => {
  try {
    console.log(`🔙 Админ ${ctx.from.id} отменяет ответ на тикет ${ctx.match[1]}`);
    
    const ticketId = ctx.match[1];
    const admin = await getUser(ctx.from.id);
    
    if (!admin || !isAdmin(admin.id)) {
      console.log(`❌ Пользователь ${ctx.from.id} не является админом`);
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Сбрасываем состояние админа
    await db.collection('users').updateOne(
      { id: admin.id },
      { $unset: { adminState: "" }, $set: { updatedAt: new Date() } }
    );
    
    // Очищаем кеш пользователя
    userCache.delete(admin.id);
    
    // Возвращаемся к исходному сообщению тикета
    const ticket = await db.collection('supportTickets').findOne({ id: ticketId });
    if (ticket) {
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Ответить', `support_answer_${ticketId}`),
          Markup.button.callback('⏳ В обработке', `support_progress_${ticketId}`)
        ],
        [
          Markup.button.callback('❌ Отклонить', `support_reject_${ticketId}`),
          Markup.button.callback('🔒 Закрыть', `support_close_${ticketId}`)
        ]
      ]);
      
      const message = 
        `🆘 *Тикет поддержки*\n\n` +
        `🆔 *ID тикета:* \`${ticketId}\`\n` +
        `👤 *Пользователь:* ${ticket.firstName || 'Не указано'}\n` +
        `📱 *Username:* ${ticket.username ? '@' + ticket.username : 'Не указан'}\n` +
        `🆔 *User ID:* \`${ticket.userId}\`\n` +
        `📅 *Дата:* ${ticket.createdAt.toLocaleString('ru-RU')}\n` +
        `📊 *Уровень:* ${ticket.level || 1}\n` +
        `💰 *Stars:* ${formatNumber(ticket.magnuStarsoins || 0)}\n` +
        `⭐ *Stars:* ${formatNumber(ticket.stars || 0)}\n\n` +
        `📝 *Проблема:*\n\`\`\`\n${ticket.description}\n\`\`\`\n\n` +
        `🎯 Выберите действие:`;
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
    }
    await ctx.answerCbQuery('✅ Отменено');
    console.log(`✅ Ответ на тикет ${ticketId} отменен админом ${ctx.from.id}`);
  } catch (error) {
    console.error(`❌ Ошибка отмены ответа на тикет ${ctx.match[1]}:`, error);
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

// Обработчики для разных способов связи
bot.action('support_telegram', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'contact_support')]
    ]);
    
    const message = 
      `📧 *Поддержка через Telegram*\n\n` +
      `Для связи с поддержкой через Telegram:\n\n` +
      `👤 *Администратор:* @magnum_support\n` +
      `📱 *Канал поддержки:* @magnumtap\n\n` +
      `💬 *Как написать:*\n` +
      `1. Нажмите на ссылку @magnum_support\n` +
      `2. Напишите ваш вопрос\n` +
      `3. Укажите ваш ID: \`${user.id}\`\n\n` +
      `📋 *Что указать в сообщении:*\n` +
      `• Ваш ID: \`${user.id}\`\n` +
      `• Описание проблемы\n` +
      `• Скриншот (если нужно)\n\n` +
      `⏰ *Время ответа:* 5-15 минут`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Поддержка Telegram');
  }
});

bot.action('support_whatsapp', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'contact_support')]
    ]);
    
    const message = 
      `📱 *Поддержка через WhatsApp*\n\n` +
      `Для связи с поддержкой через WhatsApp:\n\n` +
      `📞 *Номер:* +7 (999) 123-45-67\n` +
      `💬 *WhatsApp:* https://wa.me/79991234567\n\n` +
      `💬 *Как написать:*\n` +
      `1. Нажмите на ссылку WhatsApp\n` +
      `2. Напишите ваш вопрос\n` +
      `3. Укажите ваш ID: \`${user.id}\`\n\n` +
      `📋 *Что указать в сообщении:*\n` +
      `• Ваш ID: \`${user.id}\`\n` +
      `• Описание проблемы\n` +
      `• Скриншот (если нужно)\n\n` +
      `⏰ *Время ответа:* 10-30 минут`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Поддержка WhatsApp');
  }
});

bot.action('support_email', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'contact_support')]
    ]);
    
    const message = 
      `📧 *Поддержка через Email*\n\n` +
      `Для связи с поддержкой через Email:\n\n` +
      `📧 *Email:* support@magnumtap.com\n` +
      `📧 *Тема письма:* Поддержка Magnum Bot\n\n` +
      `📝 *Содержание письма:*\n` +
      `• Ваш ID: \`${user.id}\`\n` +
      `• Имя пользователя: ${getDisplayName(user)}\n` +
      `• Описание проблемы\n` +
      `• Скриншоты (если нужно)\n\n` +
      `📋 *Пример письма:*\n` +
      `Здравствуйте!\n\n` +
      `Мой ID: ${user.id}\n` +
      `Проблема: [опишите проблему]\n\n` +
      `С уважением,\n` +
      `${getDisplayName(user)}\n\n` +
      `⏰ *Время ответа:* 1-24 часа`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Поддержка Email');
  }
});

// FAQ
bot.action('support_faq', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💰 Бонусы', 'faq_bonus')],
      [Markup.button.callback('⛏️ Майнинг', 'faq_mining')],
      [Markup.button.callback('📈 Биржа', 'faq_exchange')],
      [Markup.button.callback('👥 Рефералы', 'faq_referrals')],
      [Markup.button.callback('📋 Задания', 'faq_tasks')],
      [Markup.button.callback('🏆 Достижения', 'faq_achievements')],
      [Markup.button.callback('🔙 Назад', 'support')]
    ]);
    
    const message = 
      `❓ *Часто задаваемые вопросы (FAQ)*\n\n` +
      `🔍 Выберите категорию вопросов:\n\n` +
      `💰 *Бонусы* - Вопросы о ежедневных бонусах\n` +
      `⛏️ *Майнинг* - Вопросы о системе майнинга\n` +
      `📈 *Биржа* - Вопросы об обмене валют\n` +
      `👥 *Рефералы* - Вопросы о реферальной системе\n` +
      `📋 *Задания* - Вопросы о выполнении заданий\n` +
      `🏆 *Достижения* - Вопросы о достижениях\n\n` +
      `💡 Если вы не нашли ответ на свой вопрос, создайте тикет поддержки.`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'FAQ');
  }
});

// ==================== ОБРАБОТЧИКИ СПОНСОРСКИХ ЗАДАНИЙ ====================

// Обработчик одобрения скриншота
bot.action(/^approve_screenshot_(\d+)_(\d+)$/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    const taskId = parseInt(ctx.match[2]);
    
    const user = await getUser(userId);
    if (!user) {
      await ctx.answerCbQuery('❌ Пользователь не найден');
      return;
    }
    
    const sponsorTasks = getSponsorTasks();
    const task = sponsorTasks.find(t => t.id === taskId);
    
    if (!task) {
      await ctx.answerCbQuery('❌ Задание не найдено');
      return;
    }
    
    // Отмечаем задание как выполненное
    await db.collection('users').updateOne(
      { id: userId },
      { 
        $set: { 
          [`tasks.sponsorTasks.${taskId}.completed`]: true,
          [`tasks.sponsorTasks.${taskId}.completedAt`]: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(userId);
    
    // Уведомляем пользователя
    try {
      await ctx.telegram.sendMessage(userId, 
        `✅ *Скриншот одобрен!*\n\n` +
        `🎯 Задание: ${task.title}\n` +
        `💰 Награда: ${task.reward} ${task.rewardType === 'stars' ? '⭐ Stars' : 'Stars'}\n\n` +
        `🎁 Теперь вы можете получить награду в разделе "Задания"!`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logError(error, `Уведомление пользователя ${userId} об одобрении скриншота`);
    }
    
    await ctx.answerCbQuery('✅ Скриншот одобрен');
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        [Markup.button.callback('✅ Одобрено', 'approved')]
      ]
    });
    
  } catch (error) {
    logError(error, 'Одобрение скриншота');
    await ctx.answerCbQuery('❌ Ошибка одобрения');
  }
});

// Обработчик отклонения скриншота
bot.action(/^reject_screenshot_(\d+)_(\d+)$/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    const taskId = parseInt(ctx.match[2]);
    
    const user = await getUser(userId);
    if (!user) {
      await ctx.answerCbQuery('❌ Пользователь не найден');
      return;
    }
    
    const sponsorTasks = getSponsorTasks();
    const task = sponsorTasks.find(t => t.id === taskId);
    
    if (!task) {
      await ctx.answerCbQuery('❌ Задание не найдено');
      return;
    }
    
    // Сбрасываем скриншот
    await db.collection('users').updateOne(
      { id: userId },
      { 
        $unset: { 
          [`tasks.sponsorTasks.${taskId}.screenshot`]: "",
          [`tasks.sponsorTasks.${taskId}.screenshotFileId`]: "",
          [`tasks.sponsorTasks.${taskId}.screenshotAt`]: ""
        },
        $set: { 
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(userId);
    
    // Уведомляем пользователя
    try {
      await ctx.telegram.sendMessage(userId, 
        `❌ *Скриншот отклонен*\n\n` +
        `🎯 Задание: ${task.title}\n` +
        `📝 Причина: Не соответствует требованиям\n\n` +
        `🔄 Попробуйте отправить скриншот еще раз в разделе "Задания"`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logError(error, `Уведомление пользователя ${userId} об отклонении скриншота`);
    }
    
    await ctx.answerCbQuery('❌ Скриншот отклонен');
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        [Markup.button.callback('❌ Отклонено', 'rejected')]
      ]
    });
    
  } catch (error) {
    logError(error, 'Отклонение скриншота');
    await ctx.answerCbQuery('❌ Ошибка отклонения');
  }
});

// Обработчик отклонения с причиной
bot.action(/^reject_reason_(\d+)_(\d+)_(.+)$/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    const taskId = parseInt(ctx.match[2]);
    const reason = ctx.match[3];
    
    const user = await getUser(userId);
    if (!user) {
      await ctx.answerCbQuery('❌ Пользователь не найден');
      return;
    }
    
    const sponsorTasks = getSponsorTasks();
    const task = sponsorTasks.find(t => t.id === taskId);
    
    if (!task) {
      await ctx.answerCbQuery('❌ Задание не найдено');
      return;
    }
    
    const reasonText = {
      'not_subscribed': 'Пользователь не подписан на канал',
      'blurry': 'Нечеткий скриншот',
      'wrong_channel': 'Неверный канал',
      'too_fast': 'Слишком быстрое выполнение'
    }[reason] || 'Не соответствует требованиям';
    
    // Сбрасываем скриншот
    await db.collection('users').updateOne(
      { id: userId },
      { 
        $unset: { 
          [`tasks.sponsorTasks.${taskId}.screenshot`]: "",
          [`tasks.sponsorTasks.${taskId}.screenshotFileId`]: "",
          [`tasks.sponsorTasks.${taskId}.screenshotAt`]: ""
        },
        $set: { 
          updatedAt: new Date()
        }
      }
    );
    
    // Очищаем кеш
    userCache.delete(userId);
    
    // Уведомляем пользователя
    try {
      await ctx.telegram.sendMessage(userId, 
        `❌ *Скриншот отклонен*\n\n` +
        `🎯 Задание: ${task.title}\n` +
        `📝 Причина: ${reasonText}\n\n` +
        `🔄 Попробуйте отправить скриншот еще раз в разделе "Задания"`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logError(error, `Уведомление пользователя ${userId} об отклонении скриншота`);
    }
    
    await ctx.answerCbQuery(`❌ Отклонено: ${reasonText}`);
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        [Markup.button.callback(`❌ Отклонено: ${reasonText}`, 'rejected_with_reason')]
      ]
    });
    
  } catch (error) {
    logError(error, 'Отклонение скриншота с причиной');
    await ctx.answerCbQuery('❌ Ошибка отклонения');
  }
});

// Обработка кнопок главного меню
bot.action('main_menu', async (ctx) => {
  try {
    logFunction('bot.action.main_menu', ctx.from.id);
    log(`🏠 Запрос главного меню от пользователя ${ctx.from.id}`);
    
    const user = await getUser(ctx.from.id);
    if (!user) {
      log(`❌ Не удалось получить пользователя ${ctx.from.id} для главного меню`);
      return;
    }
    
    logDebug(`Показ главного меню для пользователя ${ctx.from.id}`, {
      level: user.level,
      magnuStarsoins: user.magnuStarsoins,
      stars: user.stars,
      isAdmin: isAdmin(user.id)
    });
    
    await showMainMenu(ctx, user);
    log(`✅ Главное меню показано пользователю ${ctx.from.id}`);
    
  } catch (error) {
    logError(error, `Главное меню для пользователя ${ctx.from.id}`);
    logDebug(`Ошибка в главном меню`, {
      userId: ctx.from.id,
      error: error.message,
      stack: error.stack
    });
  }
});

// Роадмап
bot.action('roadmap', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await ctx.answerCbQuery('Скоро...');
  } catch (error) {
    logError(error, 'Роадмап (обработчик)');
  }
});
bot.action('roadmap_q4_2025', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showRoadmapQ4_2025(ctx, user);
  } catch (error) {
    logError(error, 'Роадмап Q4 2025 (обработчик)');
  }
});

bot.action('roadmap_q1_2026', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showRoadmapQ1_2026(ctx, user);
  } catch (error) {
    logError(error, 'Роадмап Q1 2026 (обработчик)');
  }
});

bot.action('roadmap_q2_2026', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showRoadmapQ2_2026(ctx, user);
  } catch (error) {
    logError(error, 'Роадмап Q2 2026 (обработчик)');
  }
});

bot.action('roadmap_q3_2026', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showRoadmapQ3_2026(ctx, user);
  } catch (error) {
    logError(error, 'Роадмап Q3 2026 (обработчик)');
  }
});



bot.action('roadmap_suggestions', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showRoadmapSuggestions(ctx, user);
  } catch (error) {
    logError(error, 'Предложения роадмапа (обработчик)');
  }
});

// Майнинг
bot.action('miner', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Проверяем, является ли пользователь админом
    if (isAdmin(user.id)) {
      // Для админов показываем полное меню майнера
      await showMinerMenu(ctx, user);
    } else {
      // Для обычных пользователей показываем уведомление
      await ctx.answerCbQuery('Фаза майнинга еще не началась следите за новостями в канале');
    }
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

bot.action('upgrade_miner', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showMinerUpgrade(ctx, user);
  } catch (error) {
    logError(error, 'Улучшение майнера (обработчик)');
  }
});

bot.action('miner_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showMinerStats(ctx, user);
  } catch (error) {
    logError(error, 'Статистика майнера (обработчик)');
  }
});

bot.action('miner_season_info', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showMinerSeasonInfo(ctx, user);
  } catch (error) {
    logError(error, 'Информация о сезоне майнера (обработчик)');
  }
});
bot.action('confirm_miner_upgrade', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await upgradeMiner(ctx, user);
  } catch (error) {
    logError(error, 'Улучшение майнера (обработчик)');
  }
});

// Новые обработчики для системы майнинга
bot.action('miner_shop', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showMinerShop(ctx, user, 0);
  } catch (error) {
    logError(error, 'Магазин майнеров');
  }
});

// Обработчики навигации по магазину майнеров
bot.action(/^miner_shop_(\d+)$/, async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const minerIndex = parseInt(ctx.match[1]);
    await showMinerShop(ctx, user, minerIndex);
  } catch (error) {
    logError(error, 'Навигация магазина майнеров');
  }
});

// Обработчик лимита покупки
bot.action('miner_shop_limit', async (ctx) => {
  try {
    await ctx.answerCbQuery('❌ Вы достигли лимита покупки (5 майнеров каждого типа)');
  } catch (error) {
    logError(error, 'Лимит покупки майнеров');
  }
});

// Обработчик активного клика удален

bot.action('miner_leaderboard', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showMinerLeaderboard(ctx, user);
  } catch (error) {
    logError(error, 'Рейтинг майнинга');
  }
});

bot.action('miner_leaderboard_total', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showMinerLeaderboardTotal(ctx, user);
  } catch (error) {
    logError(error, 'Общий рейтинг майнинга');
  }
});

bot.action('miner_leaderboard_season', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showMinerLeaderboardSeason(ctx, user);
  } catch (error) {
    logError(error, 'Сезонный рейтинг майнинга');
  }
});

bot.action('miner_upgrades', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Проверяем права админа
    if (!isAdmin(user.id)) {
      await ctx.answerCbQuery('🚧 Функция в разработке!');
      return;
    }
    
    await showMinerUpgrades(ctx, user);
  } catch (error) {
    logError(error, 'Апгрейды майнеров');
  }
});

// Обработчики покупки майнеров
bot.action(/^buy_miner_(.+)$/, async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const minerType = ctx.match[1];
    const result = await buyMiner(user, minerType);
    
    await ctx.answerCbQuery(result.message);
    
    if (result.success) {
      // Обновляем магазин
      await showMinerShop(ctx, user);
    }
  } catch (error) {
    logError(error, 'Покупка майнера');
    await ctx.answerCbQuery('❌ Ошибка покупки майнера');
  }
});

// Обработчики апгрейда майнеров
bot.action(/^upgrade_miner_(.+)$/, async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Проверяем, является ли пользователь админом
    if (!config.ADMIN_IDS.includes(user.id)) {
      await ctx.answerCbQuery('🚧 Функция в разработке');
      return;
    }
    
    const minerType = ctx.match[1];
    const result = await upgradeMiner(user, minerType);
    
    await ctx.answerCbQuery(result.message);
    
    if (result.success) {
      // Обновляем меню апгрейдов
      await showMinerUpgrades(ctx, user);
    }
  } catch (error) {
    logError(error, 'Апгрейд майнера');
    await ctx.answerCbQuery('❌ Ошибка апгрейда майнера');
  }
});

bot.action('insufficient_funds', async (ctx) => {
  try {
    await ctx.answerCbQuery('❌ Недостаточно Stars для улучшения!');
  } catch (error) {
    logError(error, 'Недостаточно средств (обработчик)');
  }
});


// Обмен
bot.action('exchange', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Проверяем права админа
    if (!isAdmin(user.id)) {
      await ctx.answerCbQuery('🚧 Функция в разработке!');
      return;
    }
    
    // Очищаем кеш для получения свежих данных
    userCache.delete(ctx.from.id);
    statsCache.delete('reserve');
    
    await showExchangeMenu(ctx, user);
  } catch (error) {
    logError(error, 'Меню обмена');
  }
});

// Обработчики для ввода суммы обмена
bot.action('exchange_custom_Stars', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Устанавливаем состояние для ввода суммы Stars
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'exchange_custom_Stars', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'exchange')]
    ]);
    
    await ctx.editMessageText(
      `🪙 *Ввод суммы обмена Magnum Coins → Stars*\n\n` +
      `💰 Ваш баланс: \`${formatNumber(user.magnuStarsoins)}\` 🪙 Magnum Coins\n\n` +
      `💡 Введите сумму Magnum Coins для обмена на Stars:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Ввод суммы Stars для обмена');
    await ctx.answerCbQuery('❌ Ошибка ввода суммы');
  }
});

bot.action('exchange_custom_stars', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Устанавливаем состояние для ввода суммы Stars
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'exchange_custom_stars', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const exchangeRate = await calculateExchangeRate();
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'exchange')]
    ]);
    
    await ctx.editMessageText(
      `⭐ *Ввод суммы обмена Stars → Magnum Coins*\n\n` +
      `💰 Ваш баланс: \`${formatNumber(user.stars)}\` ⭐ Stars\n` +
      `📊 Текущий курс: 1 Stars = \`${exchangeRate.toFixed(6)}\` 🪙 Magnum Coins\n\n` +
      `💡 Введите сумму Stars для обмена на Magnum Coins:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Ввод суммы Stars для обмена');
    await ctx.answerCbQuery('❌ Ошибка ввода суммы');
  }
});


bot.action('exchange_all', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const amount = Math.floor(user.magnuStarsoins);
    if (amount <= 0) {
      await ctx.answerCbQuery('❌ У вас нет Stars для обмена!');
      return;
    }
    
    await performExchange(ctx, user, amount);
  } catch (error) {
    logError(error, 'Обмен всех Stars');
  }
});

// Обработчики для новых функций биржи
bot.action('exchange_chart', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeChart(ctx, user);
  } catch (error) {
    logError(error, 'График курса');
    await ctx.answerCbQuery('❌ Ошибка загрузки графика');
  }
});

bot.action('exchange_history', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeHistory(ctx, user);
  } catch (error) {
    logError(error, 'История обменов');
    await ctx.answerCbQuery('❌ Ошибка загрузки истории');
  }
});

bot.action('exchange_settings', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeSettings(ctx, user);
  } catch (error) {
    logError(error, 'Настройки биржи');
    await ctx.answerCbQuery('❌ Ошибка загрузки настроек');
  }
});

bot.action('exchange_news', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeNews(ctx, user);
  } catch (error) {
    logError(error, 'Новости биржи');
    await ctx.answerCbQuery('❌ Ошибка загрузки новостей');
  }
});

bot.action('exchange_refresh', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Очищаем кеш для получения свежих данных
    userCache.delete(user.id);
    statsCache.delete('reserve');
    
    // Получаем обновленного пользователя
    const updatedUser = await getUser(ctx.from.id);
    if (updatedUser) {
      await showExchangeMenu(ctx, updatedUser);
      await ctx.answerCbQuery('✅ Биржа обновлена!');
    }
  } catch (error) {
    logError(error, 'Обновление биржи');
    await ctx.answerCbQuery('❌ Ошибка обновления');
  }
});

// Обработчики для графика курса
bot.action('chart_24h', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeChart(ctx, user);
  } catch (error) {
    logError(error, 'График 24 часа');
    await ctx.answerCbQuery('❌ Ошибка загрузки графика');
  }
});

bot.action('chart_7d', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeChart(ctx, user);
  } catch (error) {
    logError(error, 'График 7 дней');
    await ctx.answerCbQuery('❌ Ошибка загрузки графика');
  }
});

bot.action('chart_30d', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeChart(ctx, user);
  } catch (error) {
    logError(error, 'График 30 дней');
    await ctx.answerCbQuery('❌ Ошибка загрузки графика');
  }
});

bot.action('chart_all', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeChart(ctx, user);
  } catch (error) {
    logError(error, 'График все время');
    await ctx.answerCbQuery('❌ Ошибка загрузки графика');
  }
});

// Обработчики для истории обменов
bot.action('history_all', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeHistory(ctx, user);
  } catch (error) {
    logError(error, 'Все обмены');
    await ctx.answerCbQuery('❌ Ошибка загрузки истории');
  }
});

bot.action('history_profit', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeHistory(ctx, user);
  } catch (error) {
    logError(error, 'Прибыльные обмены');
    await ctx.answerCbQuery('❌ Ошибка загрузки истории');
  }
});

bot.action('history_loss', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeHistory(ctx, user);
  } catch (error) {
    logError(error, 'Убыточные обмены');
    await ctx.answerCbQuery('❌ Ошибка загрузки истории');
  }
});

bot.action('history_dates', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showExchangeHistory(ctx, user);
  } catch (error) {
    logError(error, 'Обмены по датам');
    await ctx.answerCbQuery('❌ Ошибка загрузки истории');
  }
});

// Обработчики для настроек биржи
bot.action('exchange_notifications', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await ctx.answerCbQuery('🔔 Настройки уведомлений будут добавлены в следующем обновлении!');
  } catch (error) {
    logError(error, 'Настройки уведомлений');
    await ctx.answerCbQuery('❌ Ошибка настроек уведомлений');
  }
});

bot.action('exchange_auto', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await ctx.answerCbQuery('📊 Автообмен будет добавлен в следующем обновлении!');
  } catch (error) {
    logError(error, 'Настройки автообмена');
    await ctx.answerCbQuery('❌ Ошибка настроек автообмена');
  }
});
bot.action('exchange_limits', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await ctx.answerCbQuery('🎯 Настройки лимитов будут добавлены в следующем обновлении!');
  } catch (error) {
    logError(error, 'Настройки лимитов');
    await ctx.answerCbQuery('❌ Ошибка настроек лимитов');
  }
});

bot.action('exchange_security', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await ctx.answerCbQuery('🔒 Настройки безопасности будут добавлены в следующем обновлении!');
  } catch (error) {
    logError(error, 'Настройки безопасности');
    await ctx.answerCbQuery('❌ Ошибка настроек безопасности');
  }
});

// Обработчики для новостей биржи
bot.action('news_analytics', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await ctx.answerCbQuery('📈 Аналитика будет добавлена в следующем обновлении!');
  } catch (error) {
    logError(error, 'Аналитика новостей');
    await ctx.answerCbQuery('❌ Ошибка загрузки аналитики');
  }
});
bot.action('news_reports', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await ctx.answerCbQuery('📊 Отчеты будут добавлены в следующем обновлении!');
  } catch (error) {
    logError(error, 'Отчеты новостей');
    await ctx.answerCbQuery('❌ Ошибка загрузки отчетов');
  }
});

bot.action('news_updates', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await ctx.answerCbQuery('🔔 Обновления будут добавлены в следующем обновлении!');
  } catch (error) {
    logError(error, 'Обновления новостей');
    await ctx.answerCbQuery('❌ Ошибка загрузки обновлений');
  }
});

bot.action('news_latest', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await ctx.answerCbQuery('📰 Последние новости будут добавлены в следующем обновлении!');
  } catch (error) {
    logError(error, 'Последние новости');
    await ctx.answerCbQuery('❌ Ошибка загрузки новостей');
  }
});

// Вывод средств
bot.action('withdrawal', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showWithdrawalMenu(ctx, user);
  } catch (error) {
    logError(error, 'Меню вывода средств');
  }
});

// Обработчики вывода средств
bot.action('withdrawal_Stars', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await ctx.answerCbQuery('🚧 Функция в разработке');
  } catch (error) {
    logError(error, 'Вывод Stars (в разработке)');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('withdrawal_stars', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    if (user.stars < 50) {
      await ctx.answerCbQuery('❌ Минимальная сумма для вывода: 50 Stars');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'withdrawing_stars', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'withdrawal')]
    ]);
    
    await ctx.editMessageText(
      `⭐ *Вывод Stars*\n\n` +
      `💎 Доступно: ${formatNumber(user.stars)} Stars\n` +
      `💸 Комиссия: 5%\n\n` +
      `Введите сумму для вывода:\n\n` +
      `💡 *Пример:* 15, 50, 100\n\n` +
      `⚠️ *Внимание:* Минимум 50 Stars!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Вывод Stars');
    await ctx.answerCbQuery('❌ Ошибка вывода Stars');
  }
});

bot.action('withdrawal_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const withdrawal = user.withdrawal || { withdrawalCount: 0, totalWithdrawn: 0 };
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'withdrawal')]
    ]);
    
    const message = 
      `📊 *Статистика выводов*\n\n` +
      `💰 *Общая статистика:*\n` +
      `├ Всего выводов: ${withdrawal.withdrawalCount}\n` +
      `├ Всего выведено: ${formatNumber(withdrawal.totalWithdrawn)} Stars\n` +
      `└ Средний вывод: ${withdrawal.withdrawalCount > 0 ? formatNumber(withdrawal.totalWithdrawn / withdrawal.withdrawalCount) : '0.00'} Stars\n\n` +
      `💡 *Информация:*\n` +
      `├ Комиссия за вывод: 5%\n` +
      `├ 🚧 Вывод Stars: в разработке\n` +
      `├ Минимум Stars: 50\n` +
      `└ Обработка: до 24 часов`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Статистика выводов');
    await ctx.answerCbQuery('❌ Ошибка показа статистики выводов');
  }
});

bot.action('withdrawal_history', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'withdrawal')]
    ]);
    
    const message = 
      `📋 *История выводов*\n\n` +
      `📝 История выводов недоступна.\n\n` +
      `💡 *Информация:*\n` +
      `├ История выводов будет доступна в будущих обновлениях\n` +
      `├ Все выводы обрабатываются вручную\n` +
      `└ Свяжитесь с поддержкой для уточнения статуса`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'История выводов');
    await ctx.answerCbQuery('❌ Ошибка показа истории выводов');
  }
});

// Достижения - удалены

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

// Профиль
bot.action('profile', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showProfileMenu(ctx, user);
  } catch (error) {
    logError(error, 'Меню профиля');
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
// Задания - удалены

// Обработчики заданий - удалены






// Бонус для обычных пользователей
bot.action('bonus_user', async (ctx) => {
  try {
    await ctx.answerCbQuery('🚧 Скоро...');
  } catch (error) {
    logError(error, 'Бонус для пользователей');
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
      
      // Запускаем периодическое обновление меню с обратным отсчетом
      startBonusCountdown(ctx, user, Math.floor(remaining / 1000));
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

// Обработчики для управления пользователями
bot.action('admin_search_user', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'searching_user', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_users')]
    ]);
    
    await ctx.editMessageText(
      `🔍 *Поиск пользователя*\n\n` +
      `Введите ID пользователя для поиска:\n\n` +
      `💡 *Пример:* 123456789\n\n` +
      `⚠️ *Внимание:* Введите только цифры!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Поиск пользователя');
    await ctx.answerCbQuery('❌ Ошибка поиска пользователя');
  }
});
bot.action('admin_top_users', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminTopUsers(ctx, user);
  } catch (error) {
    logError(error, 'Топ пользователей');
    await ctx.answerCbQuery('❌ Ошибка показа топа пользователей');
  }
});
bot.action('admin_ban_user', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'banning_user', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_users')]
    ]);
    
    await ctx.editMessageText(
      `🚫 *Блокировка пользователя*\n\n` +
      `Введите ID пользователя для блокировки:\n\n` +
      `💡 *Пример:* 123456789\n\n` +
      `⚠️ *Внимание:* Пользователь будет заблокирован!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Блокировка пользователя');
    await ctx.answerCbQuery('❌ Ошибка блокировки пользователя');
  }
});

bot.action('admin_unban_user', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'unbanning_user', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_users')]
    ]);
    
    await ctx.editMessageText(
      `✅ *Разблокировка пользователя*\n\n` +
      `Введите ID пользователя для разблокировки:\n\n` +
      `💡 *Пример:* 123456789\n\n` +
      `⚠️ *Внимание:* Пользователь будет разблокирован!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Разблокировка пользователя');
    await ctx.answerCbQuery('❌ Ошибка разблокировки пользователя');
  }
});

// Обработчики для управления балансами
bot.action('admin_add_magnum', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'adding_magnum', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_balance')]
    ]);
    
    await ctx.editMessageText(
      `➕ *Добавление Stars*\n\n` +
      `Введите ID пользователя и количество:\n\n` +
      `💡 *Формат:* ID количество\n` +
      `💡 *Пример:* 123456789 1000\n\n` +
      `⚠️ *Внимание:* Операция необратима!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Добавление Stars');
    await ctx.answerCbQuery('❌ Ошибка добавления Stars');
  }
});

bot.action('admin_remove_magnum', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'removing_magnum', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_balance')]
    ]);
    
    await ctx.editMessageText(
      `➖ *Удаление Stars*\n\n` +
      `Введите ID пользователя и количество:\n\n` +
      `💡 *Формат:* ID количество\n` +
      `💡 *Пример:* 123456789 1000\n\n` +
      `⚠️ *Внимание:* Операция необратима!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Удаление Stars');
    await ctx.answerCbQuery('❌ Ошибка удаления Stars');
  }
});

bot.action('admin_add_stars', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'adding_stars', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_balance')]
    ]);
    
    await ctx.editMessageText(
      `➕ *Добавление Stars*\n\n` +
      `Введите ID пользователя и количество:\n\n` +
      `💡 *Формат:* ID количество\n` +
      `💡 *Пример:* 123456789 1000\n\n` +
      `⚠️ *Внимание:* Операция необратима!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Добавление Stars');
    await ctx.answerCbQuery('❌ Ошибка добавления Stars');
  }
});

bot.action('admin_remove_stars', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'removing_stars', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_balance')]
    ]);
    
    await ctx.editMessageText(
      `➖ *Удаление Stars*\n\n` +
      `Введите ID пользователя и количество:\n\n` +
      `💡 *Формат:* ID количество\n` +
      `💡 *Пример:* 123456789 1000\n\n` +
      `⚠️ *Внимание:* Операция необратима!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Удаление Stars');
    await ctx.answerCbQuery('❌ Ошибка удаления Stars');
  }
});

bot.action('admin_posts', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminPosts(ctx, user);
  } catch (error) {
    logError(error, 'Управление постами (обработчик)');
  }
});
bot.action('admin_promocodes', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showAdminPromocodes(ctx, user);
  } catch (error) {
    logError(error, 'Управление промокодами (обработчик)');
  }
});

bot.action('admin_settings', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminSettings(ctx, user);
  } catch (error) {
    logError(error, 'Настройки бота');
    await ctx.answerCbQuery('❌ Ошибка настроек бота');
  }
});

// Обработчики для управления титулами
bot.action('admin_titles', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminTitles(ctx, user);
  } catch (error) {
    logError(error, 'Управление титулами');
    await ctx.answerCbQuery('❌ Ошибка управления титулами');
  }
});

bot.action('admin_give_title', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'giving_title', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_titles')]
    ]);
    
    await ctx.editMessageText(
      `➕ Выдача титула\n\n` +
      `Введите ID пользователя и название титула:\n\n` +
      `💡 Формат: ID Название_титула\n` +
      `💡 Пример: 123456789 🌱 Новичок\n\n` +
      `📋 Доступные титулы:\n` +
      `├ 🌱 Новичок\n` +
      `├ 🚀 Начинающий\n` +
      `├ 🎯 Опытный\n` +
      `├ ✨ Мастер\n` +
      `├ 💫 Эксперт\n` +
      `├ 🌟 Профессионал\n` +
      `├ 👑 Легенда\n` +
      `├ 🕵️ Скрытный\n` +
      `├ 🧠 Тактик\n` +
      `├ ⏳ Усердный\n` +
      `├ 🔥 Бессмертный\n` +
      `├ 🐉 Дракон\n` +
      `├ ⚡ Бог\n` +
      `├ 🛡️ Модератор\n` +
      `├ ⚙️ Администратор\n` +
      `└ 👑 Владелец`,
      {
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Выдача титула');
    await ctx.answerCbQuery('❌ Ошибка выдачи титула');
  }
});

bot.action('admin_remove_title', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'removing_title', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_titles')]
    ]);
    
    await ctx.editMessageText(
      `➖ Забор титула\n\n` +
      `Введите ID пользователя и название титула:\n\n` +
      `💡 Формат: ID Название_титула\n` +
      `💡 Пример: 123456789 🌱 Новичок\n\n` +
      `⚠️ Внимание: Если это главный титул, будет установлен дефолтный!`,
      {
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Забор титула');
    await ctx.answerCbQuery('❌ Ошибка забора титула');
  }
});

bot.action('admin_ranks', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminRanksMenu(ctx, user);
  } catch (error) {
    logError(error, 'Управление рангами');
    await ctx.answerCbQuery('❌ Ошибка управления рангами');
  }
});

bot.action('admin_give_rank', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'giving_rank', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_ranks')]
    ]);
    
    await ctx.editMessageText(
      `⭐ Выдача ранга\n\n` +
      `Введите ID пользователя и уровень:\n\n` +
      `💡 Формат: ID Уровень\n` +
      `💡 Пример: 123456789 50\n\n` +
      `📋 Доступные ранги:\n` +
      `├ 1-4: 🌱 Новичок\n` +
      `├ 5-9: ⚔️ Боец\n` +
      `├ 10-19: 🏹 Лучник\n` +
      `├ 20-34: 🛡️ Рыцарь\n` +
      `├ 35-49: ⚔️ Воин\n` +
      `├ 50-74: 🦸 Герой\n` +
      `├ 75-99: 🏆 Легенда\n` +
      `└ 100+: 👑 Император\n\n` +
      `⚠️ Внимание: Уровень определяет ранг автоматически!`,
      {
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Выдача ранга');
    await ctx.answerCbQuery('❌ Ошибка выдачи ранга');
  }
});

bot.action('admin_ranks_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminRanksStats(ctx, user);
  } catch (error) {
    logError(error, 'Статистика рангов');
    await ctx.answerCbQuery('❌ Ошибка статистики рангов');
  }
});

// Функция для показа статистики рангов
async function showAdminRanksStats(ctx, user) {
  try {
    log(`📊 Показ статистики рангов для админа ${user.id}`);
    
    // Получаем статистику рангов
    const ranksStats = await db.collection('users').aggregate([
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $lt: ['$level', 5] }, then: '🌱 Новичок (1-4)' },
                { case: { $lt: ['$level', 10] }, then: '⚔️ Боец (5-9)' },
                { case: { $lt: ['$level', 20] }, then: '🏹 Лучник (10-19)' },
                { case: { $lt: ['$level', 35] }, then: '🛡️ Рыцарь (20-34)' },
                { case: { $lt: ['$level', 50] }, then: '⚔️ Воин (35-49)' },
                { case: { $lt: ['$level', 75] }, then: '🦸 Герой (50-74)' },
                { case: { $lt: ['$level', 100] }, then: '🏆 Легенда (75-99)' }
              ],
              default: '👑 Император (100+)'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]).toArray();
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_ranks')]
    ]);
    
    let message = `📊 *Статистика рангов*\n\n`;
    
    if (ranksStats.length > 0) {
      message += `📈 *Распределение пользователей по рангам:*\n\n`;
      
      ranksStats.forEach((rank, index) => {
        message += `${rank._id}: \`${rank.count}\` пользователей\n`;
      });
      
      // Общая статистика
      const totalUsers = ranksStats.reduce((sum, rank) => sum + rank.count, 0);
      const maxRank = ranksStats.reduce((max, rank) => rank.count > max.count ? rank : max, ranksStats[0]);
      
      message += `\n📊 *Общая статистика:*\n`;
      message += `├ Всего пользователей: \`${totalUsers}\`\n`;
      message += `├ Самый популярный ранг: \`${maxRank._id}\` (\`${maxRank.count}\`)\n`;
      message += `└ Процент от общего: \`${((maxRank.count / totalUsers) * 100).toFixed(1)}%\`\n`;
    } else {
      message += `❌ Нет данных о рангах пользователей`;
    }
    
    message += `\n\n🎯 Выберите действие:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    log(`✅ Статистика рангов показана для админа ${user.id}`);
  } catch (error) {
    logError(error, `Показ статистики рангов для админа ${user.id}`);
    await ctx.answerCbQuery('❌ Ошибка показа статистики рангов');
  }
}

bot.action('admin_titles_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Получаем статистику титулов
    const users = await db.collection('users').find({}).toArray();
    const titleStats = {};
    
    users.forEach(u => {
      const titles = u.titles || [];
      titles.forEach(title => {
        titleStats[title] = (titleStats[title] || 0) + 1;
      });
    });
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_titles')]
    ]);
    
    let message = `📊 *Статистика титулов*\n\n`;
    message += `👥 Всего пользователей: \`${users.length}\`\n\n`;
    
    if (Object.keys(titleStats).length > 0) {
      message += `🏆 *Распределение титулов:*\n`;
      Object.entries(titleStats)
        .sort(([,a], [,b]) => b - a)
        .forEach(([title, count]) => {
          const percentage = ((count / users.length) * 100).toFixed(1);
          message += `├ ${title}: \`${count}\` (${percentage}%)\n`;
        });
    } else {
      message += `❌ Нет данных о титулах`;
    }
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Статистика титулов');
    await ctx.answerCbQuery('❌ Ошибка статистики титулов');
  }
});

bot.action('admin_sync_titles', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Синхронизируем титулы для всех пользователей
    const users = await db.collection('users').find({}).toArray();
    let synced = 0;
    
    for (const u of users) {
      try {
        await syncUserTitles(u);
        synced++;
      } catch (error) {
        console.error(`Ошибка синхронизации титулов для пользователя ${u.id}:`, error);
      }
    }
    
    await ctx.answerCbQuery(`✅ Синхронизировано титулов для ${synced} пользователей!`);
    await showAdminTitles(ctx, user);
  } catch (error) {
    logError(error, 'Синхронизация титулов');
    await ctx.answerCbQuery('❌ Ошибка синхронизации титулов');
  }
});

bot.action('admin_cache', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Очищаем кеши
    userCache.clear();
    statsCache.clear();
    
    await ctx.answerCbQuery('✅ Кеш очищен!');
    await showAdminPanel(ctx, user);
  } catch (error) {
    logError(error, 'Очистка кеша');
    await ctx.answerCbQuery('❌ Ошибка очистки кеша');
  }
});

bot.action('admin_reserve', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminReserve(ctx, user);
  } catch (error) {
    logError(error, 'Управление резервом');
    await ctx.answerCbQuery('❌ Ошибка управления резервом');
  }
});

bot.action('admin_debug_ranks', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminDebugRanks(ctx, user);
  } catch (error) {
    logError(error, 'Отладка рангов');
    await ctx.answerCbQuery('❌ Ошибка отладки рангов');
  }
});

// Обработчики управления голосованием
bot.action('admin_voting', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminVoting(ctx, user);
  } catch (error) {
    logError(error, 'Управление голосованием');
    await ctx.answerCbQuery('❌ Ошибка управления голосованием');
  }
});

bot.action('admin_voting_create', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminVotingCreate(ctx, user);
  } catch (error) {
    logError(error, 'Создание голосования');
    await ctx.answerCbQuery('❌ Ошибка создания голосования');
  }
});

bot.action('admin_voting_active', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminVotingActive(ctx, user);
  } catch (error) {
    logError(error, 'Активные голосования');
    await ctx.answerCbQuery('❌ Ошибка показа активных голосований');
  }
});

bot.action('admin_voting_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminVotingStats(ctx, user);
  } catch (error) {
    logError(error, 'Статистика голосований');
    await ctx.answerCbQuery('❌ Ошибка показа статистики');
  }
});

bot.action('admin_voting_settings', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminVotingSettings(ctx, user);
  } catch (error) {
    logError(error, 'Настройки голосования');
    await ctx.answerCbQuery('❌ Ошибка показа настроек');
  }
});



bot.action('admin_voting_delete', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminVotingDelete(ctx, user);
  } catch (error) {
    logError(error, 'Удаление голосований');
    await ctx.answerCbQuery('❌ Ошибка показа удаления');
  }
});
bot.action('admin_voting_history', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminVotingHistory(ctx, user);
  } catch (error) {
    logError(error, 'История голосований');
    await ctx.answerCbQuery('❌ Ошибка показа истории');
  }
});

bot.action('admin_test_progress', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminTestProgress(ctx, user);
  } catch (error) {
    logError(error, 'Тест прогресса рангов');
    await ctx.answerCbQuery('❌ Ошибка теста прогресса');
  }
});

bot.action('admin_force_level_check', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminForceLevelCheck(ctx, user);
  } catch (error) {
    logError(error, 'Принудительная проверка уровня');
    await ctx.answerCbQuery('❌ Ошибка проверки уровня');
  }
});

bot.action('admin_add_experience', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminAddExperience(ctx, user);
  } catch (error) {
    logError(error, 'Добавление опыта');
    await ctx.answerCbQuery('❌ Ошибка добавления опыта');
  }
});
bot.action('admin_reserve_add_Stars', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'adding_reserve_Stars', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_reserve')]
    ]);
    
    await ctx.editMessageText(
      `➕ *Добавление Stars в резерв*\n\n` +
      `Введите количество Stars для добавления в резерв:\n\n` +
      `💡 *Пример:* 1000, 5000, 10000\n\n` +
      `⚠️ *Внимание:* Операция необратима!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Добавление Stars в резерв');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('admin_reserve_remove_Stars', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'removing_reserve_Stars', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_reserve')]
    ]);
    
    await ctx.editMessageText(
      `➖ *Удаление Stars из резерва*\n\n` +
      `Введите количество Stars для удаления из резерва:\n\n` +
      `💡 *Пример:* 1000, 5000, 10000\n\n` +
      `⚠️ *Внимание:* Операция необратима!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Удаление Stars из резерва');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});
bot.action('admin_reserve_add_stars', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'adding_reserve_stars', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_reserve')]
    ]);
    
    await ctx.editMessageText(
      `➕ *Добавление Stars в резерв*\n\n` +
      `Введите количество Stars для добавления в резерв:\n\n` +
      `💡 *Пример:* 1000, 5000, 10000\n\n` +
      `⚠️ *Внимание:* Операция необратима!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Добавление Stars в резерв');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('admin_reserve_remove_stars', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'removing_reserve_stars', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_reserve')]
    ]);
    
    await ctx.editMessageText(
      `➖ *Удаление Stars из резерва*\n\n` +
      `Введите количество Stars для удаления из резерва:\n\n` +
      `💡 *Пример:* 1000, 5000, 10000\n\n` +
      `⚠️ *Внимание:* Операция необратима!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Удаление Stars из резерва');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

// Обработчики для новых функций управления резервом
bot.action('admin_reserve_update_rate', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Очищаем кеш резерва
    statsCache.delete('reserve');
    
    // Получаем обновленный резерв и пересчитываем курс
    const reserve = await db.collection('reserve').findOne({ currency: 'main' });
    const newRate = await calculateExchangeRate();
    
    // Сохраняем историю изменения курса
    await db.collection('exchangeHistory').insertOne({
      type: 'rate_update',
      rate: newRate,
      timestamp: new Date(),
      magnuStarsoinsReserve: reserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS,
      starsReserve: reserve?.stars || config.INITIAL_RESERVE_STARS,
      reason: 'admin_force_update',
      adminId: user.id
    });
    
    await ctx.answerCbQuery(`✅ Курс обновлен: ${newRate.toFixed(6)} Stars за 1 Stars`);
    await showAdminReserve(ctx, user);
  } catch (error) {
    logError(error, 'Принудительное обновление курса');
    await ctx.answerCbQuery('❌ Ошибка обновления курса');
  }
});

bot.action('admin_reserve_rate_details', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Получаем текущий резерв
    const reserve = await db.collection('reserve').findOne({ currency: 'main' });
    const magnuStarsoinsReserve = reserve?.magnuStarsoins || config.INITIAL_RESERVE_MAGNUM_COINS;
    const starsReserve = reserve?.stars || config.INITIAL_RESERVE_STARS;
    
    // Получаем текущий курс обмена
    const exchangeRate = await calculateExchangeRate();
    
    // Рассчитываем детали
    const ratio = magnuStarsoinsReserve / starsReserve;
    const logRatio = ratio > 1 ? Math.log(ratio) / Math.log(10) : 0;
    const multiplier = ratio <= 1 ? Math.max(0.1, ratio) : Math.max(0.1, Math.min(50, 1 + logRatio * 2));
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_reserve')]
    ]);
    
    const message = 
      `📊 *Детали расчета курса*\n\n` +
      `💰 *Резервы:*\n` +
      `├ 🪙 Magnum Coins: \`${formatNumber(magnuStarsoinsReserve)}\`\n` +
      `└ ⭐ Stars: \`${formatNumber(starsReserve)}\`\n\n` +
      `📈 *Расчет курса:*\n` +
      `├ Соотношение: \`${ratio.toFixed(4)}\`\n` +
      `├ Логарифм: \`${logRatio.toFixed(4)}\`\n` +
      `├ Множитель: \`${multiplier.toFixed(4)}\`\n` +
      `├ Базовый курс: \`${config.BASE_EXCHANGE_RATE}\`\n` +
      `└ Итоговый курс: \`${exchangeRate.toFixed(6)}\`\n\n` +
      `💡 *Логика расчета:*\n` +
      `├ При ratio ≤ 1: линейная шкала\n` +
      `├ При ratio > 1: логарифмическая шкала\n` +
      `└ Лимиты: 0.1 ≤ множитель ≤ 50`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Показ деталей курса');
    await ctx.answerCbQuery('❌ Ошибка показа деталей');
  }
});

// Обработчики для управления комиссией
bot.action('admin_exchange_commission', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminExchangeCommission(ctx, user);
  } catch (error) {
    logError(error, 'Управление комиссией');
    await ctx.answerCbQuery('❌ Ошибка управления комиссией');
  }
});

bot.action('admin_commission_increase', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    const newCommission = Math.min(config.EXCHANGE_COMMISSION + 0.5, 10); // Максимум 10%
    config.EXCHANGE_COMMISSION = newCommission;
    
    await ctx.answerCbQuery(`✅ Комиссия увеличена до ${newCommission}%`);
    await showAdminExchangeCommission(ctx, user);
  } catch (error) {
    logError(error, 'Увеличение комиссии');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('admin_commission_decrease', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    const newCommission = Math.max(config.EXCHANGE_COMMISSION - 0.5, 0); // Минимум 0%
    config.EXCHANGE_COMMISSION = newCommission;
    
    await ctx.answerCbQuery(`✅ Комиссия уменьшена до ${newCommission}%`);
    await showAdminExchangeCommission(ctx, user);
  } catch (error) {
    logError(error, 'Уменьшение комиссии');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('admin_commission_set', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'setting_commission', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_exchange_commission')]
    ]);
    
    await ctx.editMessageText(
      `🎯 *Установка комиссии обмена*\n\n` +
      `Введите новое значение комиссии (от 0 до 10):\n\n` +
      `💡 *Пример:* 2.5, 5.0, 7.5\n\n` +
      `⚠️ *Внимание:* Комиссия влияет на все операции обмена!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Установка комиссии');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});
bot.action('admin_commission_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Получаем статистику обменов
    const totalExchanges = await db.collection('users').aggregate([
      { $group: { _id: null, total: { $sum: '$exchange.totalExchanges' } } }
    ]).toArray();
    
    const totalExchanged = await db.collection('users').aggregate([
      { $group: { _id: null, total: { $sum: '$exchange.totalExchanged' } } }
    ]).toArray();
    
    const totalExchangesCount = totalExchanges.length > 0 ? totalExchanges[0].total : 0;
    const totalExchangedAmount = totalExchanged.length > 0 ? totalExchanged[0].total : 0;
    const totalCommission = (totalExchangedAmount * config.EXCHANGE_COMMISSION) / 100;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_exchange_commission')]
    ]);
    
    const message = 
      `📊 *Статистика комиссий*\n\n` +
      `💰 *Общая статистика:*\n` +
      `├ Всего обменов: \`${totalExchangesCount}\`\n` +
      `├ Всего обменено: \`${formatNumber(totalExchangedAmount)}\` Stars\n` +
      `├ Текущая комиссия: \`${config.EXCHANGE_COMMISSION}%\`\n` +
      `└ Всего комиссий: \`${formatNumber(totalCommission)}\` Stars\n\n` +
      `📈 *Средние показатели:*\n` +
      `├ Средний обмен: \`${totalExchangesCount > 0 ? formatNumber(totalExchangedAmount / totalExchangesCount) : '0.00'}\` Stars\n` +
      `├ Средняя комиссия: \`${totalExchangesCount > 0 ? formatNumber(totalCommission / totalExchangesCount) : '0.00'}\` Stars\n` +
      `└ Процент комиссии: \`${config.EXCHANGE_COMMISSION}%\`\n\n` +
      `💡 *Информация:*\n` +
      `├ Все комиссии остаются в резерве\n` +
      `├ Комиссия влияет на курс обмена\n` +
      `└ Статистика обновляется в реальном времени`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Статистика комиссий');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

// Обработчики комиссии вывода
bot.action('admin_withdrawal_commission', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminWithdrawalCommission(ctx, user);
  } catch (error) {
    logError(error, 'Управление комиссией вывода');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('admin_withdrawal_commission_increase', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    // Получаем текущую комиссию
    const currentCommission = config.WITHDRAWAL_COMMISSION || 5.0;
    const newCommission = Math.min(15, currentCommission + 1); // Максимум 15%

    await db.collection('config').updateOne(
      { key: 'WITHDRAWAL_COMMISSION' },
      { $set: { value: newCommission } },
      { upsert: true }
    );

    // Обновляем глобальную конфигурацию
    config.WITHDRAWAL_COMMISSION = newCommission;

    await ctx.answerCbQuery(`✅ Комиссия вывода увеличена до ${newCommission}%`);
    await showAdminWithdrawalCommission(ctx, user);
  } catch (error) {
    logError(error, 'Увеличение комиссии вывода');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('admin_withdrawal_commission_decrease', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    // Получаем текущую комиссию
    const currentCommission = config.WITHDRAWAL_COMMISSION || 5.0;
    const newCommission = Math.max(0, currentCommission - 1); // Минимум 0%

    await db.collection('config').updateOne(
      { key: 'WITHDRAWAL_COMMISSION' },
      { $set: { value: newCommission } },
      { upsert: true }
    );

    // Обновляем глобальную конфигурацию
    config.WITHDRAWAL_COMMISSION = newCommission;

    await ctx.answerCbQuery(`✅ Комиссия вывода уменьшена до ${newCommission}%`);
    await showAdminWithdrawalCommission(ctx, user);
  } catch (error) {
    logError(error, 'Уменьшение комиссии вывода');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('admin_withdrawal_commission_set', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'setting_withdrawal_commission', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_withdrawal_commission')]
    ]);
    
    await ctx.editMessageText(
      `🎯 *Установка комиссии вывода*\n\n` +
      `Введите новое значение комиссии (от 0 до 10):\n\n` +
      `💡 *Пример:* 3.0, 5.0, 7.5\n\n` +
      `⚠️ *Внимание:* Комиссия влияет на все заявки на вывод!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Установка комиссии вывода');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('admin_withdrawal_commission_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Получаем статистику выводов
    const totalWithdrawals = await db.collection('withdrawalRequests').countDocuments();
    const pendingWithdrawals = await db.collection('withdrawalRequests').countDocuments({ status: 'pending' });
    const approvedWithdrawals = await db.collection('withdrawalRequests').countDocuments({ status: 'approved' });
    const rejectedWithdrawals = await db.collection('withdrawalRequests').countDocuments({ status: 'rejected' });
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_withdrawal_commission')]
    ]);
    
    const message = 
      `📊 *Статистика комиссий вывода*\n\n` +
      `💰 *Общая статистика:*\n` +
      `├ Всего заявок: \`${totalWithdrawals}\`\n` +
      `├ Ожидают: \`${pendingWithdrawals}\`\n` +
      `├ Одобрено: \`${approvedWithdrawals}\`\n` +
      `├ Отклонено: \`${rejectedWithdrawals}\`\n` +
      `└ Текущая комиссия: \`5%\`\n\n` +
      `💡 *Информация:*\n` +
      `├ Комиссия взимается с каждой заявки\n` +
      `├ Комиссия остается в системе\n` +
      `└ Статистика обновляется в реальном времени`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Статистика комиссий вывода');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('admin_promocodes_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Получаем статистику промокодов
    const promocodes = await db.collection('promocodes').find({}).toArray();
    const totalPromocodes = promocodes.length;
    const activePromocodes = promocodes.filter(p => p.isActive && (!p.expiresAt || p.expiresAt > new Date())).length;
    const expiredPromocodes = promocodes.filter(p => p.expiresAt && p.expiresAt <= new Date()).length;
    const totalActivations = promocodes.reduce((sum, p) => sum + (p.totalActivations || 0), 0);
    const totalRewards = promocodes.reduce((sum, p) => sum + (p.totalRewards || 0), 0);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_promocodes')]
    ]);
    
    // Получаем активные ключи с оставшимися активациями
    const activeKeys = promocodes.filter(p => p.isActive && p.activations < p.maxActivations);
    const activeKeysList = activeKeys.slice(0, 10).map(p => {
      const remaining = p.maxActivations - p.activations;
      const rewardType = p.rewardType || 'Stars';
      const rewardText = rewardType === 'Stars' ? `${p.reward} Stars` : 
                        rewardType === 'stars' ? `${p.reward} ⭐` :
                        rewardType === 'title' ? p.title : 'Сундук';
      return `🔑 \`${p.code}\` - ${rewardText} (${remaining}/${p.maxActivations})`;
    }).join('\n');

    const message = 
      `📊 *Статистика ключей*\n\n` +
      `🔑 *Общая статистика:*\n` +
      `├ Всего ключей: \`${totalPromocodes}\`\n` +
      `├ Активных: \`${activePromocodes}\`\n` +
      `├ Истекших: \`${expiredPromocodes}\`\n` +
      `├ Всего активаций: \`${totalActivations}\`\n` +
      `└ Всего наград: \`${formatNumber(totalRewards)}\` Stars\n\n` +
      `📈 *Средние показатели:*\n` +
      `├ Средние активации: \`${totalPromocodes > 0 ? (totalActivations / totalPromocodes).toFixed(1) : '0'}\`\n` +
      `├ Средняя награда: \`${totalActivations > 0 ? formatNumber(totalRewards / totalActivations) : '0.00'}\` Stars\n` +
      `└ Эффективность: \`${totalPromocodes > 0 ? ((activePromocodes / totalPromocodes) * 100).toFixed(1) : '0'}%\`\n\n` +
      `🔑 *Активные ключи (топ-10):*\n` +
      `${activeKeysList || 'Нет активных ключей'}\n\n` +
      `💡 *Информация:*\n` +
      `├ Ключи создаются автоматически (12 символов)\n` +
      `├ Каждый ключ можно использовать ограниченное количество раз\n` +
      `└ Истекшие ключи автоматически деактивируются`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Статистика промокодов');
    await ctx.answerCbQuery('❌ Ошибка показа статистики промокодов');
  }
});

// Недостающие обработчики админ-панели (простые реализации)
bot.action('admin_posts_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); if (!user) return;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'admin_posts')]]);
    const message = `📊 *Статистика постов*\n\nДетальная статистика недоступна.`;
    await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
  } catch (error) { logError(error, 'Статистика постов (обработчик)'); }
});

bot.action('admin_broadcast', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); if (!user || !isAdmin(user.id)) return;
    await db.collection('users').updateOne({ id: user.id }, { $set: { adminState: 'broadcasting', updatedAt: new Date() } });
    await ctx.reply('📢 Введите текст для рассылки всем пользователям:');
  } catch (error) { logError(error, 'Рассылка (обработчик)'); }
});

bot.action('admin_create_promocode', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); 
    if (!user || !isAdmin(user.id)) return;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🟢 Обычный сундук', 'create_promo_common'),
        Markup.button.callback('🔵 Редкий сундук', 'create_promo_rare')
      ],
      [
        Markup.button.callback('🟣 Эпический сундук', 'create_promo_epic'),
        Markup.button.callback('🟡 Легендарный сундук', 'create_promo_legendary')
      ],
      [
        Markup.button.callback('💰 Stars', 'create_promo_Stars'),
        Markup.button.callback('⭐ Stars', 'create_promo_stars')
      ],
      [
        Markup.button.callback('👑 Титул', 'create_promo_title'),
        Markup.button.callback('🎫 Пользовательский', 'create_promo_custom')
      ],
      [
        Markup.button.callback('📋 Содержимое сундуков', 'show_chest_contents'),
        Markup.button.callback('📊 Статистика сундуков', 'chest_statistics')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_promocodes')]
    ]);
    
    await ctx.editMessageText(
      `🔑 *Создание ключа*\n\n` +
      `Выберите тип награды для ключа:\n\n` +
      `🎁 *Новая система сундуков:*\n` +
      `🟢 **Обычный сундук** - базовые награды\n` +
      `🔵 **Редкий сундук** - награды + майнеры\n` +
      `🟣 **Эпический сундук** - награды + титул + множитель\n` +
      `🟡 **Легендарный сундук** - максимальные награды\n\n` +
      `💰 **Stars** - награда в монетах\n` +
      `⭐ **Stars** - награда в звездах\n` +
      `👑 **Титул** - выдача титула\n` +
      `🎫 **Пользовательский** - ручной ввод\n\n` +
      `🎯 Выберите тип награды:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) { logError(error, 'Создание промокода (обработчик)'); }
});

// Обработчики создания промокодов по типам
bot.action('create_promo_Stars', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); 
    if (!user || !isAdmin(user.id)) return;
    
    await db.collection('users').updateOne(
      { id: user.id }, 
      { $set: { adminState: 'creating_promo_Stars', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    await ctx.editMessageText(
      `💰 *Создание ключа Stars*\n\n` +
      `Введите данные ключа в формате:\n\n` +
      `**НАГРАДА АКТИВАЦИИ**\n\n` +
      `💡 Пример: 100 50\n\n` +
      `📋 Где:\n` +
      `├ НАГРАДА - количество Stars\n` +
      `└ АКТИВАЦИИ - максимальное количество использований\n\n` +
      `🔑 Ключ будет сгенерирован автоматически (12 символов)\n\n` +
      `🎯 Введите данные:`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) { logError(error, 'Создание промокода Stars (обработчик)'); }
});

bot.action('create_promo_stars', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); 
    if (!user || !isAdmin(user.id)) return;
    
    await db.collection('users').updateOne(
      { id: user.id }, 
      { $set: { adminState: 'creating_promo_stars', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    await ctx.editMessageText(
      `⭐ *Создание ключа Stars*\n\n` +
      `Введите данные ключа в формате:\n\n` +
      `**НАГРАДА АКТИВАЦИИ**\n\n` +
      `💡 Пример: 50 25\n\n` +
      `📋 Где:\n` +
      `├ НАГРАДА - количество Stars\n` +
      `└ АКТИВАЦИИ - максимальное количество использований\n\n` +
      `🔑 Ключ будет сгенерирован автоматически (12 символов)\n\n` +
      `🎯 Введите данные:`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) { logError(error, 'Создание промокода Stars (обработчик)'); }
});

bot.action('create_promo_title', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); 
    if (!user || !isAdmin(user.id)) return;
    
    await db.collection('users').updateOne(
      { id: user.id }, 
      { $set: { adminState: 'creating_promo_title', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_create_promocode')]
    ]);
    
    await ctx.editMessageText(
      `👑 *Создание промокода с титулом*\n\n` +
      `Введите данные промокода в формате:\n\n` +
      `**КОД ТИТУЛ АКТИВАЦИИ**\n\n` +
      `💡 Пример: LEGEND 👑 Легенда 10\n\n` +
      `📋 Где:\n` +
      `├ КОД - название промокода (3+ символов)\n` +
      `├ ТИТУЛ - название титула\n` +
      `└ АКТИВАЦИИ - максимальное количество использований\n\n` +
      `🎯 Введите данные:`,
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) { logError(error, 'Создание промокода Title (обработчик)'); }
});

bot.action('create_promo_custom', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); 
    if (!user || !isAdmin(user.id)) return;
    
    await db.collection('users').updateOne(
      { id: user.id }, 
      { $set: { adminState: 'creating_promocode', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_create_promocode')]
    ]);
    
    await ctx.editMessageText(
      `🎫 *Создание пользовательского промокода*\n\n` +
      `Введите данные промокода в формате:\n\n` +
      `**КОД НАГРАДА ТИП АКТИВАЦИИ**\n\n` +
      `💡 Примеры:\n` +
      `├ WELCOME 100 Stars 50\n` +
      `├ STARS50 50 stars 25\n` +
      `└ LEGEND 👑 Легенда 10\n\n` +
      `📋 Где:\n` +
      `├ КОД - название промокода\n` +
      `├ НАГРАДА - количество или название титула\n` +
      `├ ТИП - Stars, stars, или title\n` +
      `└ АКТИВАЦИИ - максимальное количество использований\n\n` +
      `🎯 Введите данные:`,
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) { logError(error, 'Создание пользовательского промокода (обработчик)'); }
});

// ==================== ОБРАБОТЧИКИ СОЗДАНИЯ ПРОМОКОДОВ С СУНДУКАМИ ====================

// Обычный сундук
bot.action('create_promo_common', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); 
    if (!user || !isAdmin(user.id)) return;
    
    await db.collection('users').updateOne(
      { id: user.id }, 
      { $set: { adminState: 'creating_promo_common', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_create_promocode')]
    ]);
    
    await ctx.editMessageText(
      `🟢 *Создание ключа с обычным сундуком*\n\n` +
      `Введите количество активаций:\n\n` +
      `**АКТИВАЦИИ**\n\n` +
      `💡 Пример: 100\n\n` +
      `📋 Где:\n` +
      `└ АКТИВАЦИИ - максимальное количество использований\n\n` +
      `🔑 Ключ будет сгенерирован автоматически (12 символов)\n\n` +
      `🎁 *Награды обычного сундука:*\n` +
      `├ 10-60 Stars\n` +
      `└ 5-25 Stars\n\n` +
      `🎯 Введите количество активаций:`,
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) { logError(error, 'Создание промокода обычного сундука (обработчик)'); }
});

// Редкий сундук
bot.action('create_promo_rare', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); 
    if (!user || !isAdmin(user.id)) return;
    
    await db.collection('users').updateOne(
      { id: user.id }, 
      { $set: { adminState: 'creating_promo_rare', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_create_promocode')]
    ]);
    
    await ctx.editMessageText(
      `🔵 *Создание ключа с редким сундуком*\n\n` +
      `Введите количество активаций:\n\n` +
      `**АКТИВАЦИИ**\n\n` +
      `💡 Пример: 50\n\n` +
      `📋 Где:\n` +
      `└ АКТИВАЦИИ - максимальное количество использований\n\n` +
      `🔑 Ключ будет сгенерирован автоматически (12 символов)\n\n` +
      `🎁 *Награды редкого сундука:*\n` +
      `├ 50-150 Stars\n` +
      `├ 25-75 Stars\n` +
      `└ 1-3 майнера\n\n` +
      `🎯 Введите количество активаций:`,
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) { logError(error, 'Создание промокода редкого сундука (обработчик)'); }
});

// Эпический сундук
bot.action('create_promo_epic', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); 
    if (!user || !isAdmin(user.id)) return;
    
    await db.collection('users').updateOne(
      { id: user.id }, 
      { $set: { adminState: 'creating_promo_epic', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_create_promocode')]
    ]);
    
    await ctx.editMessageText(
      `🟣 *Создание ключа с эпическим сундуком*\n\n` +
      `Введите количество активаций:\n\n` +
      `**АКТИВАЦИИ**\n\n` +
      `💡 Пример: 25\n\n` +
      `📋 Где:\n` +
      `└ АКТИВАЦИИ - максимальное количество использований\n\n` +
      `🔑 Ключ будет сгенерирован автоматически (12 символов)\n\n` +
      `🎁 *Награды эпического сундука:*\n` +
      `├ 100-300 Stars\n` +
      `├ 50-150 Stars\n` +
      `├ Уникальный титул\n` +
      `└ Множитель x1.5\n\n` +
      `🎯 Введите количество активаций:`,
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) { logError(error, 'Создание промокода эпического сундука (обработчик)'); }
});

// Легендарный сундук
bot.action('create_promo_legendary', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); 
    if (!user || !isAdmin(user.id)) return;
    
    await db.collection('users').updateOne(
      { id: user.id }, 
      { $set: { adminState: 'creating_promo_legendary', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_create_promocode')]
    ]);
    
    await ctx.editMessageText(
      `🟡 *Создание ключа с легендарным сундуком*\n\n` +
      `Введите количество активаций:\n\n` +
      `**АКТИВАЦИИ**\n\n` +
      `💡 Пример: 10\n\n` +
      `📋 Где:\n` +
      `└ АКТИВАЦИИ - максимальное количество использований\n\n` +
      `🔑 Ключ будет сгенерирован автоматически (12 символов)\n\n` +
      `🎁 *Награды легендарного сундука:*\n` +
      `├ 300-800 Stars\n` +
      `├ 100-300 Stars\n` +
      `├ 2-5 майнеров\n` +
      `├ Легендарный титул\n` +
      `└ Множитель x2.0\n\n` +
      `🎯 Введите количество активаций:`,
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) { logError(error, 'Создание промокода легендарного сундука (обработчик)'); }
});

bot.action('admin_mass_give', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); if (!user || !isAdmin(user.id)) return;
    await db.collection('users').updateOne({ id: user.id }, { $set: { adminState: 'mass_give', updatedAt: new Date() } });
    await ctx.reply('💰 Введите массовую выдачу (например: "stars 100" или "Stars 50"):');
  } catch (error) { logError(error, 'Массовая выдача (обработчик)'); }
});
bot.action('admin_mining_seasons', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminMiningSeasons(ctx, user);
  } catch (error) {
    logError(error, 'Управление сезонами майнинга');
    await ctx.answerCbQuery('❌ Ошибка управления сезонами');
  }
});

bot.action('admin_season_start', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'season_start', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_mining_seasons')]
    ]);
    
    await ctx.editMessageText(
      `🚀 *Запуск нового сезона*\n\n` +
      `⚠️ *Внимание:* Это действие:\n` +
      `├ Сбросит сезонную статистику всех игроков\n` +
      `├ Увеличит номер сезона на 1\n` +
      `├ Увеличит множитель на 10%\n` +
      `└ Сохранит общую статистику\n\n` +
      `💡 *Введите "ПОДТВЕРДИТЬ" для запуска:*`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Запуск сезона');
    await ctx.answerCbQuery('❌ Ошибка запуска сезона');
  }
});

bot.action('admin_season_end', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    const currentSeason = getCurrentMiningSeason();
    
    // Получаем топ игроков сезона
    const topPlayers = await db.collection('users')
      .find({ 'miningStats.seasonMinedStars': { $exists: true } })
      .sort({ 'miningStats.seasonMinedStars': -1 })
      .limit(50)
      .toArray();
    
    let message = `⏹️ *Завершение сезона ${currentSeason.season}*\n\n`;
    message += `📊 *Топ-10 игроков сезона:*\n`;
    
    for (let i = 0; i < Math.min(10, topPlayers.length); i++) {
      const player = topPlayers[i];
      const position = i + 1;
      const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
      message += `${emoji} ${player.firstName || 'Неизвестно'}: ${formatNumber(player.miningStats?.seasonMinedStars || 0)} Stars\n`;
    }
    
    message += `\n💡 *Награды будут выданы автоматически*\n`;
    message += `🎯 Выберите действие:`;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🏆 Выдать награды', 'admin_season_rewards'),
        Markup.button.callback('🔄 Сбросить статистику', 'admin_season_reset')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_mining_seasons')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Завершение сезона');
    await ctx.answerCbQuery('❌ Ошибка завершения сезона');
  }
});

bot.action('admin_season_rewards', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    const currentSeason = getCurrentMiningSeason();
    
    // Получаем топ игроков сезона
    const topPlayers = await db.collection('users')
      .find({ 'miningStats.seasonMinedStars': { $exists: true } })
      .sort({ 'miningStats.seasonMinedStars': -1 })
      .limit(50)
      .toArray();
    
    let message = `🏆 *Выдача наград сезона ${currentSeason.season}*\n\n`;
    message += `📊 *Топ-10 игроков:*\n`;
    
    let totalRewardsStars = 0;
    
    for (let i = 0; i < Math.min(10, topPlayers.length); i++) {
      const player = topPlayers[i];
      const position = i + 1;
      const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
      
      let rewardStars = 0;
      
      if (position === 1) {
        rewardStars = config.SEASON_REWARDS.top1.stars;
      } else if (position <= 3) {
        rewardStars = config.SEASON_REWARDS.top3.stars;
      } else if (position <= 10) {
        rewardStars = config.SEASON_REWARDS.top10.stars;
      }
      
      totalRewardsStars += rewardStars;
      totalRewardsStars += rewardStars;
      
      message += `${emoji} ${player.firstName || 'Неизвестно'}: +${formatNumber(rewardStars)} Stars +${rewardStars} ⭐\n`;
    }
    
    message += `\n💰 *Итого наград:*\n`;
    message += `├ Stars: \`${formatNumber(totalRewardsStars)}\`\n`;
    message += `└ Stars: \`${totalRewardsStars}\`\n\n`;
    message += `🎯 Выберите действие:`;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Выдать награды', 'admin_season_rewards_confirm'),
        Markup.button.callback('📋 Список всех', 'admin_season_rewards_full')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_mining_seasons')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Выдача наград сезона');
    await ctx.answerCbQuery('❌ Ошибка выдачи наград');
  }
});

bot.action('admin_season_rewards_confirm', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    const currentSeason = getCurrentMiningSeason();
    
    // Получаем топ игроков сезона
    const topPlayers = await db.collection('users')
      .find({ 'miningStats.seasonMinedStars': { $exists: true } })
      .sort({ 'miningStats.seasonMinedStars': -1 })
      .limit(50)
      .toArray();
    
    let issuedCount = 0;
    let totalRewardsStars = 0;
    
    for (let i = 0; i < topPlayers.length; i++) {
      const player = topPlayers[i];
      const position = i + 1;
      
      let rewardStars = 0;
      
      if (position === 1) {
        rewardStars = config.SEASON_REWARDS.top1.stars;
      } else if (position <= 3) {
        rewardStars = config.SEASON_REWARDS.top3.stars;
      } else if (position <= 10) {
        rewardStars = config.SEASON_REWARDS.top10.stars;
      } else if (position <= 50) {
        rewardStars = config.SEASON_REWARDS.top50.magnuStarsoins;
        rewardStars = config.SEASON_REWARDS.top50.stars;
      }
      
      if (rewardStars > 0 || rewardStars > 0) {
        await db.collection('users').updateOne(
          { id: player.id },
          {
            $inc: {
              magnuStarsoins: rewardStars,
              stars: rewardStars,
              'miningStats.seasonRewardsStars': rewardStars,
              'miningStats.seasonRewardsStars': rewardStars
            }
          }
        );
        
        totalRewardsStars += rewardStars;
        totalRewardsStars += rewardStars;
        issuedCount++;
      }
    }
    
    const message = 
      `✅ *Награды сезона ${currentSeason.season} выданы!*\n\n` +
      `📊 *Результат:*\n` +
      `├ Игроков получили награды: \`${issuedCount}\`\n` +
      `├ Выдано Stars: \`${formatNumber(totalRewardsStars)}\`\n` +
      `└ Выдано Stars: \`${totalRewardsStars}\`\n\n` +
      `🎉 *Сезон завершен успешно!*`;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к управлению', 'admin_mining_seasons')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    
    await ctx.answerCbQuery('✅ Награды выданы успешно!');
  } catch (error) {
    logError(error, 'Подтверждение выдачи наград сезона');
    await ctx.answerCbQuery('❌ Ошибка выдачи наград');
  }
});

bot.action('admin_season_reset', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'season_reset', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_mining_seasons')]
    ]);
    
    await ctx.editMessageText(
      `🔄 *Сброс сезонной статистики*\n\n` +
      `⚠️ *Внимание:* Это действие:\n` +
      `├ Сбросит сезонную статистику ВСЕХ игроков\n` +
      `├ Обнулит сезонные награды\n` +
      `├ Сохранит общую статистику\n` +
      `└ НЕ изменит номер сезона\n\n` +
      `💡 *Введите "СБРОСИТЬ" для подтверждения:*`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Сброс сезонной статистики');
    await ctx.answerCbQuery('❌ Ошибка сброса статистики');
  }
});

bot.action('admin_season_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    const currentSeason = getCurrentMiningSeason();
    
    // Статистика сезона
    const seasonStats = await db.collection('users').aggregate([
      { $match: { 'miningStats.seasonMinedStars': { $exists: true } } },
      { 
        $group: { 
          _id: null, 
          totalStars: { $sum: '$miningStats.seasonMinedStars' },
          totalStars: { $sum: '$miningStats.seasonMinedStars' },
          avgStars: { $avg: '$miningStats.seasonMinedStars' },
          avgStars: { $avg: '$miningStats.seasonMinedStars' },
          players: { $sum: 1 }
        } 
      }
    ]).toArray();
    
    const stats = seasonStats[0] || { totalStars: 0, totalStars: 0, avgStars: 0, avgStars: 0, players: 0 };
    
    const message = 
      `📊 *Статистика сезона ${currentSeason.season}*\n\n` +
      `👥 *Участники:*\n` +
      `├ Всего игроков: \`${stats.players}\`\n` +
      `├ Активных майнеров: \`${stats.players}\`\n` +
      `└ Средняя активность: \`${((stats.players / 100) * 100).toFixed(1)}%\`\n\n` +
      `💰 *Добыча:*\n` +
      `├ Всего Stars: \`${formatNumber(stats.totalStars)}\`\n` +
      `├ Всего Stars: \`${formatNumber(stats.totalStars)}\`\n` +
      `├ Среднее Stars/игрок: \`${formatNumber(stats.avgStars)}\`\n` +
      `└ Среднее Stars/игрок: \`${formatNumber(stats.avgStars)}\`\n\n` +
      `📅 *Время сезона:*\n` +
      `├ День сезона: \`${currentSeason.dayInSeason}/${config.MINING_SEASON_DURATION}\`\n` +
      `├ Дней до конца: \`${currentSeason.daysUntilNextSeason}\`\n` +
      `└ Множитель: \`${currentSeason.multiplier}x\``;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'admin_mining_seasons')]
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    logError(error, 'Статистика сезона');
    await ctx.answerCbQuery('❌ Ошибка загрузки статистики');
  }
});

bot.action('admin_miner_levels', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); if (!user) return;
    const dist = await db.collection('users').aggregate([
      { $match: { 'miner.level': { $exists: true } } },
      { $group: { _id: '$miner.level', cnt: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'admin_miner_settings')]]);
    let message = `⚙️ *Уровни майнера*`+"\n\n";
    if (dist.length === 0) message += `Нет данных.`; else dist.forEach(d => { message += `Уровень ${d._id}: \`${d.cnt}\``+"\n"; });
    await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
  } catch (error) { logError(error, 'Уровни майнера (обработчик)'); }
});

bot.action('admin_referral_bonuses', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); if (!user) return;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'admin_referral_settings')]]);
    const message = `🏆 *Бонусы за рефералов*`+"\n\n"+`Базовая награда: \`${config.REFERRAL_BONUS}\` Stars.`;
    await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
  } catch (error) { logError(error, 'Бонусы за рефералов (обработчик)'); }
});

bot.action('admin_referral_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); if (!user) return;
    const agg = await db.collection('users').aggregate([
      { $group: { _id: null, totalRef: { $sum: { $ifNull: ['$referralsCount', 0] } }, totalEarn: { $sum: { $ifNull: ['$totalReferralEarnings', 0] } }, users: { $sum: 1 } } }
    ]).toArray();
    const g = agg[0] || { totalRef: 0, totalEarn: 0, users: 0 };
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'admin_referral_settings')]]);
    const message = `👥 *Статистика рефералов*`+"\n\n"+
      `├ Всего рефералов: \`${g.totalRef}\``+"\n"+
      `├ Суммарные выплаты: \`${formatNumber(g.totalEarn)}\` Stars`+"\n"+
      `└ Пользователей: \`${g.users}\``;
    await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
  } catch (error) { logError(error, 'Статистика рефералов (обработчик)'); }
});

bot.action('admin_bonus_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); if (!user) return;
    const agg = await db.collection('users').aggregate([
      { $group: { _id: null, avgStreak: { $avg: { $ifNull: ['$dailyBonus.streak', 0] } }, maxStreak: { $max: { $ifNull: ['$dailyBonus.streak', 0] } }, gotToday: { $sum: { $cond: [{ $gte: ['$dailyBonus.lastBonus', new Date(Date.now() - 24*60*60*1000)] }, 1, 0] } } } }
    ]).toArray();
    const g = agg[0] || { avgStreak: 0, maxStreak: 0, gotToday: 0 };
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'admin_settings')]]);
    const message = `🎁 *Статистика бонусов*`+"\n\n"+
      `├ Средняя серия: \`${(g.avgStreak || 0).toFixed(1)}\``+"\n"+
      `├ Максимальная серия: \`${g.maxStreak || 0}\``+"\n"+
      `└ Получили бонус за 24ч: \`${g.gotToday}\``;
    await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
  } catch (error) { logError(error, 'Статистика бонусов (обработчик)'); }
});

bot.action('admin_bonus_series', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); if (!user) return;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'admin_settings')]]);
    const message = `🔥 *Серия бонусов*`+"\n\n"+`Ежедневный бонус раз в 24 часа. Серия растет при ежедневных получениях.`;
    await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
  } catch (error) { logError(error, 'Серия бонусов (обработчик)'); }
});

bot.action('admin_cooldowns', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await showAdminCooldowns(ctx, user);
  } catch (error) {
    logError(error, 'Кулдауны (обработчик)');
    await ctx.answerCbQuery('❌ Ошибка показа кулдаунов');
  }
});



bot.action('admin_daily_bonus', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Устанавливаем состояние для ввода нового бонуса
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'setting_bonus_base', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_settings')]
    ]);
    
    await ctx.editMessageText(
      `🎁 *Изменение ежедневного бонуса*\n\n` +
      `📝 Введите новое значение базового бонуса:\n\n` +
      `💡 *Примеры:*\n` +
      `├ 1 (1 монета)\n` +
      `├ 5 (5 монет)\n` +
      `├ 10 (10 монет)\n` +
      `└ 50 (50 монет)\n\n` +
      `⚠️ *Текущий бонус:* \`${config.DAILY_BONUS_BASE}\` Stars\n\n` +
      `🎯 Введите новое значение:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Изменение ежедневного бонуса');
    await ctx.answerCbQuery('❌ Ошибка изменения бонуса');
  }
});

bot.action('admin_miner_settings', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Устанавливаем состояние для ввода новой награды майнера
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'setting_miner_reward', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_settings')]
    ]);
    
    await ctx.editMessageText(
      `⛏️ *Изменение награды майнера*\n\n` +
      `📝 Введите новое значение награды за минуту:\n\n` +
      `💡 *Примеры:*\n` +
      `├ 0.01 (1 цент в минуту)\n` +
      `├ 0.1 (10 центов в минуту)\n` +
      `├ 1.0 (1 монета в минуту)\n` +
      `└ 10.0 (10 монет в минуту)\n\n` +
      `⚠️ *Текущая награда:* \`${config.MINER_REWARD_PER_MINUTE}\` Stars/мин\n\n` +
      `🎯 Введите новое значение:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Изменение награды майнера');
    await ctx.answerCbQuery('❌ Ошибка изменения награды');
  }
});

bot.action('admin_referral_settings', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Устанавливаем состояние для ввода новой реферальной награды
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'setting_referral_reward', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_settings')]
    ]);
    
    await ctx.editMessageText(
      `👥 *Изменение реферальной награды*\n\n` +
      `📝 Введите новое значение награды за реферала:\n\n` +
      `💡 *Примеры:*\n` +
      `├ 10 (10 монет)\n` +
      `├ 50 (50 монет)\n` +
      `├ 100 (100 монет)\n` +
      `└ 500 (500 монет)\n\n` +
      `⚠️ *Текущая награда:* \`${config.REFERRAL_REWARD}\` Stars\n\n` +
      `🎯 Введите новое значение:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Изменение реферальной награды');
    await ctx.answerCbQuery('❌ Ошибка изменения награды');
  }
});



bot.action('admin_cooldown_bonus', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); if (!user) return;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'admin_cooldowns')]]);
    const message = `🎁 *Кулдаун бонуса*`+"\n\n"+`Ежедневный бонус доступен раз в 24 часа.`;
    await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
  } catch (error) { logError(error, 'Кулдаун бонуса (обработчик)'); }
});

bot.action('admin_cooldown_miner', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); if (!user) return;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'admin_cooldowns')]]);
    const message = `⛏️ *Кулдаун майнера*`+"\n\n"+`Начисление награды выполняется каждые 30 минут задачей бота.`;
    await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
  } catch (error) { logError(error, 'Кулдаун майнера (обработчик)'); }
});

bot.action('admin_cooldown_stats', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); if (!user) return;
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'admin_cooldowns')]]);
    const message = `⏱️ *Статистика кулдаунов*`+"\n\n"+

      `├ Кулдаун бонуса: \`24ч\``+"\n"+
      `└ Период награды майнера: \`30м\``;
    await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
  } catch (error) { logError(error, 'Статистика кулдаунов (обработчик)'); }
});

// Промокод
bot.action('promocode', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    await showPromocodeMenu(ctx, user);
  } catch (error) {
    logError(error, 'Меню промокодов');
  }
});

bot.action('enter_promocode', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Устанавливаем состояние для ввода промокода
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'entering_promocode', updatedAt: new Date() } }
    );
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'promocode')]
    ]);
    
    await ctx.editMessageText(
      `🎫 *Ввод промокода*\n\n` +
      `📝 Введите код промокода:\n\n` +
      `💡 *Пример:* WELCOME2024\n\n` +
      `⚠️ *Важно:*\n` +
      `├ Каждый промокод можно использовать только один раз\n` +
      `├ Промокод должен быть активным\n` +
      `└ Не должно быть истекшим\n\n` +
      `🎯 Введите промокод:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Ввод промокода');
    await ctx.answerCbQuery('❌ Ошибка ввода промокода');
  }
});

bot.action('promocode_history', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id); if (!user) return;
    const used = user.usedPromocodes || [];
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'promocode')]]);
    let message = `📜 *История промокодов*`+"\n\n";
    message += used.length === 0 ? 'Вы еще не активировали промокоды.' : used.map((c, i) => `${i + 1}. ${c}`).join('\n');
    await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
  } catch (error) { logError(error, 'История промокодов (обработчик)'); }
});
bot.action('admin_reset_db', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Проверяем, что пользователь является админом
    if (!config.ADMIN_IDS.includes(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Подтвердить сброс', 'admin_reset_db_confirm'),
        Markup.button.callback('❌ Отмена', 'admin')
      ]
    ]);
    
    await ctx.editMessageText(
      `🗑️ *Сброс базы данных*\n\n` +
      `⚠️ **ВНИМАНИЕ!** Это действие необратимо!\n\n` +
      `🔴 *Что будет удалено:*\n` +
      `├ 👥 Все пользователи\n` +
      `├ 💰 Все балансы\n` +
      `├ 🏦 Резерв биржи\n` +
      `├ 📊 Вся статистика\n` +
      `├ 🎫 Все промокоды\n` +
      `├ 📝 Вся история обменов\n` +
      `├ 🗳️ Все голосования\n` +
      `└ 📋 Все настройки\n\n` +
      `🔄 *Что будет восстановлено:*\n` +
      `├ 🏦 Начальный резерв биржи\n` +
      `├ ⚙️ Базовые настройки\n` +
      `└ 📊 Пустая статистика\n\n` +
      `💡 *Рекомендация:* Сделайте резервную копию перед сбросом!\n\n` +
      `🎯 Вы уверены, что хотите сбросить базу данных?`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Показ меню сброса БД');
    await ctx.answerCbQuery('❌ Ошибка показа меню сброса');
  }
});

bot.action('admin_reset_db_confirm', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Проверяем, что пользователь является админом
    if (!config.ADMIN_IDS.includes(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    await ctx.editMessageText('🔄 Выполняется сброс базы данных...\n\n⏳ Это может занять несколько секунд...');
    
    // Выполняем сброс базы данных
    await resetDatabase();
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Вернуться в админ панель', 'admin')]
    ]);
    
    await ctx.editMessageText(
      `✅ *База данных успешно сброшена!*\n\n` +
      `🗑️ *Удалено:*\n` +
      `├ 👥 Все пользователи\n` +
      `├ 💰 Все балансы\n` +
      `├ 🏦 Резерв биржи\n` +
      `├ 📊 Вся статистика\n` +
      `├ 🎫 Все промокоды\n` +
      `├ 📝 Вся история обменов\n` +
      `├ 🗳️ Все голосования\n` +
      `└ 📋 Все настройки\n\n` +
      `🔄 *Восстановлено:*\n` +
      `├ 🏦 Начальный резерв биржи\n` +
      `├ ⚙️ Базовые настройки\n` +
      `└ 📊 Пустая статистика\n\n` +
      `🚀 Бот готов к работе с чистой базой данных!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Сброс базы данных');
    await ctx.editMessageText('❌ Ошибка при сбросе базы данных');
  }
});

// Обработчик изменения награды за рефералов
bot.action('admin_referral_reward', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !config.ADMIN_IDS.includes(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    // Устанавливаем состояние для ввода новой награды
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'setting_referral_reward', updatedAt: new Date() } }
    );
    
    userCache.delete(user.id);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_referral_settings')]
    ]);
    
    await ctx.editMessageText(
      `💰 *Настройка награды за рефералов*\n\n` +
      `📊 *Текущая награда:* \`${config.REFERRAL_REWARD}\` Stars\n\n` +
      `💡 *Введите новую награду:*\n` +
      `├ Минимум: \`1\` Stars\n` +
      `├ Максимум: \`1000\` Stars\n` +
      `└ Рекомендуется: \`5-50\` Stars\n\n` +
      `⚠️ *Внимание:* Введите только цифры!`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Настройка награды за рефералов');
    await ctx.answerCbQuery('❌ Ошибка настройки награды');
  }
});

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error('❌ Ошибка в боте:', err);
  console.log('Ошибка в боте:', {
    updateType: ctx.updateType,
    userId: ctx.from?.id,
    chatId: ctx.chat?.id,
    messageId: ctx.message?.message_id,
    callbackData: ctx.callbackQuery?.data,
    error: err.message,
    stack: err.stack
  });
});
// ==================== ЗАПУСК БОТА ====================
async function startBot() {
  try {
    console.log('🚀 Начинаем запуск Magnum Stars Bot...');
    
    console.log('Проверка переменных окружения:', {
      BOT_TOKEN: process.env.BOT_TOKEN ? 'установлен' : 'отсутствует',
      MONGODB_URI: process.env.MONGODB_URI ? 'установлен' : 'отсутствует',
      PORT: process.env.PORT || 3000,
      NODE_ENV: process.env.NODE_ENV || 'development'
    });
    
    console.log('🔗 Подключение к базе данных...');
    await connectDB();
    console.log('✅ База данных подключена успешно');
    
    // [Восстановление] Читаем сохранённое состояние биржи (24ч курс)
    try {
      const items = await db.collection('config').find({ key: { $in: ['EXCHANGE_RATE_24H','LAST_RATE_UPDATE'] } }).toArray();
      const map = {};
      for (const it of items) map[it.key] = it.value;
      if (typeof map.EXCHANGE_RATE_24H === 'number') exchangeRate24h = map.EXCHANGE_RATE_24H;
      if (map.LAST_RATE_UPDATE) lastRateUpdate = new Date(map.LAST_RATE_UPDATE);
      console.log('🔁 Восстановлено состояние биржи', { exchangeRate24h, lastRateUpdate });
    } catch (e) {
      console.log('⚠️ Не удалось восстановить состояние биржи:', e.message);
    }
    
    console.log('⏰ Настройка интервалов...');
    console.log('Настройка интервалов:', {
      minerRewardsInterval: '30 минут',
      cacheCleanupInterval: '5 минут',
      userCacheTTL: config.USER_CACHE_TTL,
      statsCacheTTL: config.STATS_CACHE_TTL
    });
    
    // Запускаем обработку майнера каждые 2 минуты для снижения нагрузки
    setInterval(() => {
      console.log('🔄 Запуск обработки майнинга...');
      processMinerRewards();
    }, 2 * 60 * 1000); // 2 минуты
    
    // Запускаем обработку майнинга сразу при старте
    console.log('🚀 Первоначальный запуск обработки майнинга...');
    processMinerRewards();
    
    // Очистка кеша каждые 10 минут для снижения нагрузки
    setInterval(() => {
      const now = Date.now();
      let userCacheCleared = 0;
      let statsCacheCleared = 0;
      
      for (const [key, value] of userCache.entries()) {
        if (now - value.timestamp > config.USER_CACHE_TTL) {
          userCache.delete(key);
          userCacheCleared++;
        }
      }
      
      for (const [key, value] of statsCache.entries()) {
        if (now - value.timestamp > config.STATS_CACHE_TTL) {
          statsCache.delete(key);
          statsCacheCleared++;
        }
      }
      
      if (userCacheCleared > 0 || statsCacheCleared > 0) {
        console.log(`🧹 Очистка кеша: пользователей ${userCacheCleared}, статистики ${statsCacheCleared}`);
      }
    }, 10 * 60 * 1000);
    
    // Проверяем существование файлов WebApp
    // [Оптимизация] Удалён дублирующий импорт fs — используем верхнеуровневый 'fs'
    const webappEnabled = process.env.WEBAPP_ENABLED === 'true'; // [Изменение] Управляем логами WebApp через переменную окружения
    const webappPath = path.join(__dirname, 'webapp');
    const indexPath = path.join(webappPath, 'index.html');
    const stylesPath = path.join(webappPath, 'styles.css');
    const scriptPath = path.join(webappPath, 'script.js');
    
    if (webappEnabled) {
        console.log('📁 Проверка файлов WebApp...');
        console.log(`📁 Путь к WebApp: ${webappPath}`);
        console.log(`📄 index.html: ${fs.existsSync(indexPath) ? '✅ найден' : '❌ не найден'}`);
        console.log(`🎨 styles.css: ${fs.existsSync(stylesPath) ? '✅ найден' : '❌ не найден'}`);
        console.log(`⚡ script.js: ${fs.existsSync(scriptPath) ? '✅ найден' : '❌ не найден'}`);
    }
    
    console.log('🌐 Запуск Express сервера...');
    app.listen(PORT, () => {
      console.log(`✅ Express сервер готов принимать запросы на порту ${PORT}`);
    });
    
    console.log('🤖 Запуск Telegram бота...');
    console.log('🤖 Проверка токена бота...');
    const botInfo = await bot.telegram.getMe();
    console.log('🤖 Информация о боте:', botInfo);
    // [Исправление] Запуск бота (Telegraf)
    await bot.launch();
    
    console.log('🚀 Magnum Stars Bot успешно запущен!');
    
    // Запускаем периодическую очистку кеша
    setInterval(() => {
      cleanupInvalidCache();
    }, 5 * 60 * 1000); // Каждые 5 минут
    
    console.log('🧹 Периодическая очистка кеша запущена (каждые 5 минут)');
  } catch (error) {
    console.error('❌ Ошибка при запуске Magnum Stars Bot:', error);
    process.exit(1);
  }
}
// ==================== ОБРАБОТЧИК ФОТОГРАФИЙ ====================
// Обработка скриншотов для спонсорских заданий
bot.on('photo', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return;
    
    // Проверяем, ожидает ли пользователь скриншот для спонсорского задания
    if (user.adminState && user.adminState.startsWith('sending_screenshot_')) {
      const taskId = user.adminState.replace('sending_screenshot_', '');
      await handleScreenshotUpload(ctx, user, parseInt(taskId));
    }
  } catch (error) {
    logError(error, 'Обработка фотографии');
  }
});

// ==================== ОБРАБОТЧИК ТЕКСТОВЫХ СООБЩЕНИЙ ====================
// Должен быть в конце, после всех остальных обработчиков
bot.on('text', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) {
      return;
    }
    
    const text = ctx.message.text;
    
    // Проверяем, есть ли у пользователя adminState
    if (user.adminState) {
      console.log(`Обработка текста пользователя ${ctx.from.id} с adminState:`, {
        adminState: user.adminState,
        text: text,
        textLength: text.length,
        isAdmin: isAdmin(user.id)
      });
      
      // Проверяем состояние пользователя
      if (user.adminState === 'creating_support_ticket') {
        console.log(`🆘 Пользователь ${ctx.from.id} создает тикет поддержки: "${text}"`);
        await handleCreateSupportTicket(ctx, user, text);
        return;
      } else if (user.adminState && user.adminState.startsWith('answering_ticket_')) {
        console.log(`📝 Админ ${ctx.from.id} отвечает на тикет: "${text}"`);
        await handleAdminAnswerTicket(ctx, user, text);
        return;
      } else if (user.adminState === 'entering_promocode') {
        console.log(`🎫 Пользователь ${ctx.from.id} вводит промокод: "${text}"`);
        await handleUserEnterPromocodeText(ctx, user, text);
        return;
      } else if (user.adminState === 'exchange_custom_Stars') {
        console.log(`🪙 Пользователь ${ctx.from.id} вводит сумму Stars для обмена: "${text}"`);
        await handleExchangeCustomStars(ctx, user, text);
        return;
      } else if (user.adminState === 'exchange_custom_stars') {
        console.log(`⭐ Пользователь ${ctx.from.id} вводит сумму Stars для обмена: "${text}"`);
        await handleExchangeCustomStars(ctx, user, text);
        return;
      } else if (user.adminState === 'withdrawing_Stars') {
        console.log(`💰 Пользователь ${ctx.from.id} вводит сумму Stars для вывода: "${text}"`);
        await handleWithdrawalStars(ctx, user, text);
        return;
      } else if (user.adminState === 'withdrawing_stars') {
        console.log(`⭐ Пользователь ${ctx.from.id} вводит сумму Stars для вывода: "${text}"`);
        await handleWithdrawalStars(ctx, user, text);
        return;
      }
      // Проверяем админские состояния (только для админов)
      if (isAdmin(user.id)) {
        if (user.adminState === 'searching_user') {
          console.log(`🔍 Админ ${ctx.from.id} ищет пользователя: "${text}"`);
          await handleAdminSearchUser(ctx, user, text);
        } else if (user.adminState === 'banning_user') {
          console.log(`🚫 Админ ${ctx.from.id} блокирует пользователя: "${text}"`);
          await handleAdminBanUser(ctx, user, text);
        } else if (user.adminState === 'unbanning_user') {
          console.log(`✅ Админ ${ctx.from.id} разблокирует пользователя: "${text}"`);
          await handleAdminUnbanUser(ctx, user, text);
        } else if (user.adminState === 'setting_farm_reward') {
          console.log(`🌾 Админ ${ctx.from.id} устанавливает награду фарма: "${text}"`);
          await handleAdminSetFarmReward(ctx, user, text);
        } else if (user.adminState === 'setting_farm_cooldown') {
          console.log(`⏰ Админ ${ctx.from.id} устанавливает кулдаун фарма: "${text}"`);
          await handleAdminSetFarStarsooldown(ctx, user, text);
        } else if (user.adminState === 'setting_bonus_base') {
          console.log(`🎁 Админ ${ctx.from.id} устанавливает базовый бонус: "${text}"`);
          await handleAdminSetBonusBase(ctx, user, text);
        } else if (user.adminState === 'setting_miner_reward') {
          console.log(`⛏️ Админ ${ctx.from.id} устанавливает награду майнера: "${text}"`);
          await handleAdminSetMinerReward(ctx, user, text);
        } else if (user.adminState === 'setting_referral_reward') {
          console.log(`👥 Админ ${ctx.from.id} устанавливает реферальную награду: "${text}"`);
          await handleAdminSetReferralReward(ctx, user, text);
        } else if (user.adminState === 'setting_subscription_channel') {
          console.log(`📢 Админ ${ctx.from.id} устанавливает канал подписки: "${text}"`);
          await handleAdminSetSubscriptionChannel(ctx, user, text);
        } else if (user.adminState === 'creating_post_with_button') {
          console.log(`📝 Админ ${ctx.from.id} создает пост с кнопкой: "${text}"`);
          await handleAdminCreatePostWithButton(ctx, user, text);
        } else if (user.adminState === 'creating_post_no_button') {
          console.log(`📝 Админ ${ctx.from.id} создает пост без кнопки: "${text}"`);
          await handleAdminCreatePostNoButton(ctx, user, text);
        } else if (user.adminState === 'creating_promocode') {
          console.log(`🎫 Админ ${ctx.from.id} создает промокод: "${text}"`);
          await handleAdminCreatePromocode(ctx, user, text);
        } else if (user.adminState === 'creating_promo_Stars') {
          console.log(`💰 Админ ${ctx.from.id} создает промокод Stars: "${text}"`);
          await handleAdminCreatePromoStars(ctx, user, text);
        } else if (user.adminState === 'creating_promo_stars') {
          console.log(`⭐ Админ ${ctx.from.id} создает промокод Stars: "${text}"`);
          await handleAdminCreatePromoStars(ctx, user, text);
        } else if (user.adminState === 'creating_promo_title') {
          console.log(`👑 Админ ${ctx.from.id} создает промокод с титулом: "${text}"`);
          await handleAdminCreatePromoTitle(ctx, user, text);
        } else if (user.adminState === 'creating_promo_common') {
          console.log(`🟢 Админ ${ctx.from.id} создает ключ с обычным сундуком: "${text}"`);
          await handleAdminCreatePromoChest(ctx, user, text, 'common');
        } else if (user.adminState === 'creating_promo_rare') {
          console.log(`🔵 Админ ${ctx.from.id} создает ключ с редким сундуком: "${text}"`);
          await handleAdminCreatePromoChest(ctx, user, text, 'rare');
        } else if (user.adminState === 'creating_promo_epic') {
          console.log(`🟣 Админ ${ctx.from.id} создает ключ с эпическим сундуком: "${text}"`);
          await handleAdminCreatePromoChest(ctx, user, text, 'epic');
        } else if (user.adminState === 'creating_promo_legendary') {
          console.log(`🟡 Админ ${ctx.from.id} создает ключ с легендарным сундуком: "${text}"`);
          await handleAdminCreatePromoChest(ctx, user, text, 'legendary');
        } else if (user.adminState === 'reporting_bug') {
          console.log(`🐛 Пользователь ${ctx.from.id} сообщает об ошибке: "${text}"`);
          await handleBugReport(ctx, user, text);
        } else if (user.adminState === 'giving_rank') {
          console.log(`⭐ Админ ${ctx.from.id} выдает ранг: "${text}"`);
          await handleAdminGiveRank(ctx, user, text);
        } else if (user.adminState === 'adding_reserve_Stars') {
          console.log(`➕ Админ ${ctx.from.id} добавляет Stars в резерв: "${text}"`);
          await handleAdminAddReserveStars(ctx, user, text);
        } else if (user.adminState === 'removing_reserve_Stars') {
          console.log(`➖ Админ ${ctx.from.id} убирает Stars из резерва: "${text}"`);
          await handleAdminRemoveReserveStars(ctx, user, text);
        } else if (user.adminState === 'adding_reserve_stars') {
          console.log(`➕ Админ ${ctx.from.id} добавляет Stars в резерв: "${text}"`);
          await handleAdminAddReserveStars(ctx, user, text);
        } else if (user.adminState === 'removing_reserve_stars') {
          console.log(`➖ Админ ${ctx.from.id} убирает Stars из резерва: "${text}"`);
          await handleAdminRemoveReserveStars(ctx, user, text);
        } else if (user.adminState === 'setting_commission') {
          console.log(`💸 Админ ${ctx.from.id} устанавливает комиссию: "${text}"`);
          await handleAdminSetCommission(ctx, user, text);
        } else if (user.adminState === 'setting_withdrawal_commission') {
          console.log(`💰 Админ ${ctx.from.id} устанавливает комиссию вывода: "${text}"`);
          await handleAdminSetWithdrawalCommission(ctx, user, text);
        } else if (user.adminState === 'giving_title') {
          console.log(`👑 Админ ${ctx.from.id} выдает титул: "${text}"`);
          await handleAdminGiveTitle(ctx, user, text);
        } else if (user.adminState === 'removing_title') {
          console.log(`👑 Админ ${ctx.from.id} забирает титул: "${text}"`);
          await handleAdminRemoveTitle(ctx, user, text);
        } else if (user.adminState === 'broadcasting') {
          console.log(`📢 Админ ${ctx.from.id} рассылает сообщение: "${text}"`);
          const cursor = db.collection('users').find({}, { projection: { id: 1 } });
          let sent = 0, errors = 0;
          while (await cursor.hasNext()) {
            const u = await cursor.next();
            try { await ctx.telegram.sendMessage(u.id, text); sent++; } catch (e) { errors++; }
          }
          await db.collection('users').updateOne({ id: user.id }, { $unset: { adminState: '' } });
          await ctx.reply(`📢 Рассылка завершена. Отправлено: ${sent}, ошибок: ${errors}`);
        } else if (user.adminState === 'season_start') {
          console.log(`🚀 Админ ${ctx.from.id} запускает новый сезон: "${text}"`);
          if (text.trim().toUpperCase() === 'ПОДТВЕРДИТЬ') {
            // Сбрасываем сезонную статистику всех игроков
            await db.collection('users').updateMany(
              { 'miningStats.seasonMinedStars': { $exists: true } },
              {
                $set: {
                  'miningStats.seasonMinedStars': 0,
                  'miningStats.seasonMinedStars': 0,
                  'miningStats.seasonRewardsStars': 0,
                  'miningStats.seasonRewardsStars': 0,
                  updatedAt: new Date()
                }
              }
            );
            
            await db.collection('users').updateOne({ id: user.id }, { $unset: { adminState: '' } });
            await ctx.reply(`✅ Новый сезон запущен! Сезонная статистика сброшена.`);
          } else {
            await ctx.reply('❌ Для запуска сезона введите "ПОДТВЕРДИТЬ"');
          }
        } else if (user.adminState === 'season_reset') {
          console.log(`🔄 Админ ${ctx.from.id} сбрасывает сезонную статистику: "${text}"`);
          if (text.trim().toUpperCase() === 'СБРОСИТЬ') {
            // Сбрасываем сезонную статистику всех игроков
            await db.collection('users').updateMany(
              { 'miningStats.seasonMinedStars': { $exists: true } },
              {
                $set: {
                  'miningStats.seasonMinedStars': 0,
                  'miningStats.seasonMinedStars': 0,
                  'miningStats.seasonRewardsStars': 0,
                  'miningStats.seasonRewardsStars': 0,
                  updatedAt: new Date()
                }
              }
            );
            
            await db.collection('users').updateOne({ id: user.id }, { $unset: { adminState: '' } });
            await ctx.reply(`✅ Сезонная статистика сброшена!`);
          } else {
            await ctx.reply('❌ Для сброса статистики введите "СБРОСИТЬ"');
          }
        } else if (user.adminState === 'mass_give') {
          console.log(`💰 Админ ${ctx.from.id} выполняет массовую выдачу: "${text}"`);
          const parts = text.trim().split(/\s+/);
          if (parts.length < 2) { await ctx.reply('❌ Формат: "stars 100" или "Stars 50"'); return; }
          const type = parts[0].toLowerCase();
          const amount = parseFloat(parts[1]);
          if (!['stars','Stars'].includes(type) || !isFinite(amount)) { await ctx.reply('❌ Неверные параметры'); return; }
          const inc = type === 'stars' ? { stars: amount, totalEarnedStars: Math.max(amount, 0) } : { magnuStarsoins: amount, totalEarnedMagnuStarsoins: Math.max(amount, 0) };
          await db.collection('users').updateMany({}, { $inc: inc, $set: { updatedAt: new Date() } });
          await db.collection('users').updateOne({ id: user.id }, { $unset: { adminState: '' } });
          await ctx.reply(`✅ Массовая выдача выполнена: ${type} ${amount}`);
        } else {
          console.log(`ℹ️ Админ ${ctx.from.id} отправил текст с неизвестным adminState: "${text}"`);
          await ctx.reply('❌ Неизвестная команда. Используйте админ панель для управления.');
        }
      } else {
        console.log(`ℹ️ Пользователь ${ctx.from.id} отправил текст с неизвестным adminState: "${text}"`);
        await ctx.reply('❌ Неизвестная команда. Используйте меню для навигации.');
      }
    } else {
      // Если у пользователя нет adminState
      if (isAdmin(user.id)) {
        console.log(`ℹ️ Админ ${ctx.from.id} отправил текст, но adminState не установлен: "${text}"`);
        await ctx.reply('❌ Неизвестная команда. Используйте админ панель для управления.');
      } else {
        console.log(`ℹ️ Пользователь ${ctx.from.id} отправил текст, но adminState не установлен: "${text}"`);
        await ctx.reply('❌ Неизвестная команда. Используйте меню для навигации.');
      }
    }
    
    console.log(`✅ Текстовое сообщение от ${ctx.from.id} обработано`);
    
  } catch (error) {
    console.error(`❌ Ошибка обработки текстового сообщения от ${ctx.from.id}:`, error);
    console.log(`Ошибка в обработке текста:`, {
      userId: ctx.from.id,
      text: ctx.message.text,
      error: error.message,
      stack: error.stack
    });
  }
});
// Обработчики для заявок на вывод
bot.action(/^approve_(.+)$/, async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !config.ADMIN_IDS.includes(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    const requestId = ctx.match[1];
    
    log(`🔍 Попытка одобрения заявки с ID: ${requestId}`);
    
    // Проверяем, что requestId является валидным ObjectId
    if (!isValidObjectId(requestId)) {
      log(`❌ Неверный формат requestId: ${requestId}`);
      await ctx.answerCbQuery('❌ Неверный ID заявки');
      return;
    }
    
    // Получаем заявку из базы данных
    const withdrawalRequest = await db.collection('withdrawalRequests').findOne({ _id: new ObjectId(requestId) });
    
    if (!withdrawalRequest) {
      await ctx.answerCbQuery('❌ Заявка не найдена');
      return;
    }
    
    if (withdrawalRequest.status !== 'pending') {
      await ctx.answerCbQuery('❌ Заявка уже обработана');
      return;
    }
    
    // Обновляем статус заявки
    await db.collection('withdrawalRequests').updateOne(
      { _id: new ObjectId(requestId) },
      { 
        $set: { 
          status: 'approved',
          approvedBy: user.id,
          approvedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    // Уведомляем пользователя
    try {
      await bot.telegram.sendMessage(
        withdrawalRequest.userId,
        `✅ *Заявка на вывод одобрена!*\n\n` +
        `💰 *Детали заявки:*\n` +
        `├ Сумма: ${formatNumber(withdrawalRequest.amount)} ${withdrawalRequest.currency === 'magnum_coins' ? 'Magnum Coins' : 'Stars'}\n` +
        `├ Комиссия: ${formatNumber(withdrawalRequest.amount * 0.05)} ${withdrawalRequest.currency === 'magnum_coins' ? 'Magnum Coins' : 'Stars'}\n` +
        `├ К выплате: ${formatNumber(withdrawalRequest.amount * 0.95)} ${withdrawalRequest.currency === 'magnum_coins' ? 'Magnum Coins' : 'Stars'}\n` +
        `└ Статус: ✅ Одобрено\n\n` +
        `📅 *Дата одобрения:* ${new Date().toLocaleString('ru-RU')}\n` +
        `🆔 *Номер заявки:* #${requestId}\n\n` +
        `💳 Выплата будет произведена в течение 24 часов!`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.log(`⚠️ Не удалось уведомить пользователя ${withdrawalRequest.userId}: ${error.message}`);
    }
    
    // Обновляем сообщение в канале
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Одобрено', 'withdrawal_approved')]
    ]);
    
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n✅ *Одобрено администратором*\n📅 *Дата:* ' + new Date().toLocaleString('ru-RU'),
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    await ctx.answerCbQuery('✅ Заявка одобрена');
    
    log(`✅ Заявка на вывод ${requestId} одобрена администратором ${user.id}`);
    
  } catch (error) {
    logError(error, 'Одобрение заявки на вывод');
    await ctx.answerCbQuery('❌ Ошибка одобрения заявки');
  }
});

bot.action(/^reject_(.+)$/, async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !config.ADMIN_IDS.includes(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    const requestId = ctx.match[1];
    
    log(`🔍 Попытка отклонения заявки с ID: ${requestId}`);
    
    // Проверяем, что requestId является валидным ObjectId
    if (!isValidObjectId(requestId)) {
      log(`❌ Неверный формат requestId: ${requestId}`);
      await ctx.answerCbQuery('❌ Неверный ID заявки');
      return;
    }
    
    // Получаем заявку из базы данных
    const withdrawalRequest = await db.collection('withdrawalRequests').findOne({ _id: new ObjectId(requestId) });
    
    if (!withdrawalRequest) {
      await ctx.answerCbQuery('❌ Заявка не найдена');
      return;
    }
    
    if (withdrawalRequest.status !== 'pending') {
      await ctx.answerCbQuery('❌ Заявка уже обработана');
      return;
    }
    
    // Показываем кнопки с причинами отклонения
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🚫 Недостаточно средств', `reject_${requestId}:funds`),
        Markup.button.callback('🚫 Подозрительная активность', `reject_${requestId}:suspicious`)
      ],
      [
        Markup.button.callback('🚫 Нарушение правил', `reject_${requestId}:rules`),
        Markup.button.callback('🚫 Неверные данные', `reject_${requestId}:invalid_data`)
      ],
      [
        Markup.button.callback('🚫 Слишком частые заявки', `reject_${requestId}:too_frequent`),
        Markup.button.callback('🚫 Техническая ошибка', `reject_${requestId}:technical`)
      ],
      [
        Markup.button.callback('🔙 Назад', `cancel_${requestId}`)
      ]
    ]);
    
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n❌ *Выберите причину отклонения:*',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    await ctx.answerCbQuery('Выберите причину отклонения');
    
  } catch (error) {
    logError(error, 'Отклонение заявки на вывод');
    await ctx.answerCbQuery('❌ Ошибка отклонения заявки');
  }
});

bot.action(/^reject_(.+):(.+)$/, async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !config.ADMIN_IDS.includes(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    const requestId = ctx.match[1];
    const reason = ctx.match[2];
    
    log(`🔍 Попытка отклонения заявки с ID: ${requestId}, причина: ${reason}`);
    
    log(`🔍 Извлеченный ObjectId: ${requestId}`);
    
    // Проверяем, что requestId является валидным ObjectId
    if (!isValidObjectId(requestId)) {
      log(`❌ Неверный формат requestId: ${requestId}`);
      await ctx.answerCbQuery('❌ Неверный ID заявки');
      return;
    }
    
    // Получаем заявку из базы данных
    const withdrawalRequest = await db.collection('withdrawalRequests').findOne({ _id: new ObjectId(requestId) });
    
    if (!withdrawalRequest) {
      await ctx.answerCbQuery('❌ Заявка не найдена');
      return;
    }
    
    if (withdrawalRequest.status !== 'pending') {
      await ctx.answerCbQuery('❌ Заявка уже обработана');
      return;
    }
    
    // Определяем текст причины
    const reasonTexts = {
      'funds': 'Недостаточно средств в резерве',
      'suspicious': 'Подозрительная активность',
      'rules': 'Нарушение правил использования',
      'invalid_data': 'Неверные данные пользователя',
      'too_frequent': 'Слишком частые заявки на вывод',
      'technical': 'Техническая ошибка'
    };
    
    const reasonText = reasonTexts[reason] || 'Не указана';
    
    // Обновляем статус заявки
    await db.collection('withdrawalRequests').updateOne(
      { _id: new ObjectId(requestId) },
      { 
        $set: { 
          status: 'rejected',
          rejectedBy: user.id,
          rejectedAt: new Date(),
          rejectionReason: reasonText,
          updatedAt: new Date()
        }
      }
    );
    
    // Возвращаем средства пользователю
    const currencyField = withdrawalRequest.currency === 'magnum_coins' ? 'magnuStarsoins' : 'stars';
    await db.collection('users').updateOne(
      { id: withdrawalRequest.userId },
      { 
        $inc: { [currencyField]: withdrawalRequest.amount },
        $set: { updatedAt: new Date() }
      }
    );
    
    // Очищаем кеш пользователя
    userCache.delete(withdrawalRequest.userId);
    
    // Уведомляем пользователя
    try {
      const commission = withdrawalRequest.amount * 0.05;
      const amountAfterCommission = withdrawalRequest.amount * 0.95;
      
      await bot.telegram.sendMessage(
        withdrawalRequest.userId,
        `❌ *Заявка на вывод отклонена*\n\n` +
        `${withdrawalRequest.currency === 'magnum_coins' ? '💰' : '⭐'} *Детали заявки:*\n` +
        `├ Сумма: ${formatNumber(withdrawalRequest.amount)} ${withdrawalRequest.currency === 'magnum_coins' ? 'Magnum Coins' : 'Stars'}\n` +
        `├ Комиссия: ${formatNumber(commission)} ${withdrawalRequest.currency === 'magnum_coins' ? 'Magnum Coins' : 'Stars'}\n` +
        `├ К получению: ${formatNumber(amountAfterCommission)} ${withdrawalRequest.currency === 'magnum_coins' ? 'Magnum Coins' : 'Stars'}\n` +
        `└ Статус: ❌ Отклонено\n\n` +
        `🚫 *Причина отклонения:* ${reasonText}\n` +
        `📅 *Дата отклонения:* ${new Date().toLocaleString('ru-RU')}\n` +
        `🆔 *Номер заявки:* #${requestId}\n\n` +
        `💡 Средства возвращены на ваш баланс!`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.log(`⚠️ Не удалось уведомить пользователя ${withdrawalRequest.userId}: ${error.message}`);
    }
    
    // Обновляем сообщение в канале
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отклонено', 'withdrawal_rejected')]
    ]);
    
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n❌ *Отклонено администратором*\n🚫 *Причина:* ' + reasonText,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    await ctx.answerCbQuery('❌ Заявка отклонена');
    
    log(`❌ Заявка на вывод ${requestId} отклонена администратором ${user.id}, причина: ${reasonText}`);
    
  } catch (error) {
    logError(error, 'Отклонение заявки на вывод с причиной');
    await ctx.answerCbQuery('❌ Ошибка отклонения заявки');
  }
});

bot.action(/^cancel_(.+)$/, async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !config.ADMIN_IDS.includes(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }
    
    const requestId = ctx.match[1];
    
    // Возвращаем к исходному сообщению с кнопками одобрения/отклонения
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Одобрить', `approve_${requestId}`),
        Markup.button.callback('❌ Отклонить', `reject_${requestId}`)
      ]
    ]);
    
    // Убираем текст о выборе причины отклонения
    const originalText = ctx.callbackQuery.message.text.replace('\n\n❌ *Выберите причину отклонения:*', '');
    
    await ctx.editMessageText(
      originalText + '\n\n🎯 Выберите действие:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
    
    await ctx.answerCbQuery('Отменено');
    
  } catch (error) {
    logError(error, 'Отмена отклонения заявки');
    await ctx.answerCbQuery('❌ Ошибка отмены');
  }
});

// Функция для обработки заявки на вывод Stars
async function handleWithdrawalStars(ctx, user, text) {
  try {
    log(`⭐ Пользователь ${user.id} создает заявку на вывод Stars: "${text}"`);
    log(`🔍 Конфигурация каналов: WITHDRAWAL_CHANNEL=${config.WITHDRAWAL_CHANNEL}, SUPPORT_CHANNEL=${config.SUPPORT_CHANNEL}`);
    
    const amount = parseFloat(text);
    
    // Валидация суммы
          if (isNaN(amount) || amount < 50) {
      await ctx.reply('❌ Минимальная сумма для вывода: 50 Stars');
      return;
    }
    
    if (amount > user.stars) {
      await ctx.reply(`❌ Недостаточно Stars! У вас: ${formatNumber(user.stars)} Stars`);
      return;
    }
    
    // Создаем заявку на вывод
    const withdrawalRequest = {
      userId: user.id,
      username: user.username,
      firstName: user.firstName,
      amount: amount,
      currency: 'stars',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await db.collection('withdrawalRequests').insertOne(withdrawalRequest);
    const requestId = result.insertedId;
    
    // Списываем средства с баланса пользователя
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $inc: { stars: -amount },
        $unset: { adminState: "" }, 
        $set: { updatedAt: new Date() } 
      }
    );
    userCache.delete(user.id);
    
    log(`💰 Списано ${amount} Stars с баланса пользователя ${user.id}`);
    
    // Отправляем заявку в канал выплат
    log(`🔍 Проверка канала выплат: ${config.WITHDRAWAL_CHANNEL}`);
    if (config.WITHDRAWAL_CHANNEL) {
      try {
        const keyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Одобрить', `approve_${requestId}`),
            Markup.button.callback('❌ Отклонить', `reject_${requestId}`)
          ]
        ]);
        
        const message = 
          `💰 *Новая заявка на вывод Stars*\n\n` +
          `👤 *Пользователь:*\n` +
          `├ ID: \`${user.id}\`\n` +
          `├ Имя: ${user.firstName || 'Не указано'}\n` +
          `├ Username: ${user.username ? '@' + user.username : 'Не указан'}\n` +
          `└ Баланс: ${formatNumber(user.stars)} Stars\n\n` +
          `💸 *Заявка:*\n` +
          `├ Сумма: ${formatNumber(amount)} Stars\n` +
          `├ Комиссия: ${formatNumber(amount * 0.05)} Stars (5%)\n` +
          `├ К выплате: ${formatNumber(amount * 0.95)} Stars\n` +
          `└ Дата: ${new Date().toLocaleString('ru-RU')}\n\n` +
          `🎯 Выберите действие:`;
        
        await bot.telegram.sendMessage(config.WITHDRAWAL_CHANNEL, message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
        
        log(`✅ Заявка на вывод отправлена в канал ${config.WITHDRAWAL_CHANNEL}`);
      } catch (channelError) {
        logError(channelError, `Отправка заявки в канал ${config.WITHDRAWAL_CHANNEL}`);
      }
    }
    
    await ctx.reply(
      `✅ Заявка на вывод ${formatNumber(amount)} Stars создана!\n\n` +
      `📋 *Информация о заявке:*\n` +
      `├ Сумма: ${formatNumber(amount)} Stars\n` +
      `├ Комиссия: ${formatNumber(amount * 0.05)} Stars (5%)\n` +
      `├ К выплате: ${formatNumber(amount * 0.95)} Stars\n` +
      `└ Обработка: до 24 часов\n\n` +
      `🔔 Вы получите уведомление о статусе заявки.`
    );
    
    log(`✅ Заявка на вывод Stars успешно создана для пользователя ${user.id}`);
    
  } catch (error) {
    logError(error, `Создание заявки на вывод Stars пользователем ${user.id}`);
    await ctx.reply('❌ Ошибка создания заявки. Попробуйте позже.');
  }
}

// Обработчики необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('❌ Необработанная ошибка (uncaughtException):', error);
  console.log('Критическая ошибка uncaughtException:', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  });
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанное отклонение промиса:', reason);
  console.log('Критическая ошибка unhandledRejection:', {
    reason: reason,
    promise: promise,
    timestamp: new Date().toISOString(),
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  });
  process.exit(1);
});

// Обработчики создания постов
bot.action('admin_create_post_with_button', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'creating_post_with_button', updatedAt: new Date() } }
    );

    userCache.delete(user.id);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_posts')]
    ]);

    await ctx.editMessageText(
      `📝 *Создание поста с кнопкой*\n\n` +
      `Отправьте текст поста в следующем формате:\n\n` +
      `📋 *Формат:*\n` +
      `├ Текст поста\n` +
      `├ ---\n` +
      `├ Текст кнопки\n` +
      `├ ---\n` +
      `└ URL кнопки\n\n` +
      `💡 *Пример:*\n` +
      `├ Добро пожаловать в Magnum Stars!\n` +
      `├ ---\n` +
      `├ Перейти в бота\n` +
      `├ ---\n` +
      `└ https://t.me/magnumtap_bot\n\n` +
      `⚠️ Пост будет опубликован в @magnumtap`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Создание поста с кнопкой');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('admin_create_post_no_button', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { adminState: 'creating_post_no_button', updatedAt: new Date() } }
    );

    userCache.delete(user.id);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Отмена', 'admin_posts')]
    ]);

    await ctx.editMessageText(
      `📝 *Создание поста без кнопки*\n\n` +
      `Отправьте текст поста.\n\n` +
      `💡 *Пример:*\n` +
      `├ Новости Magnum Stars\n` +
      `├ Новая версия бота!\n` +
      `└ Добавлены новые функции\n\n` +
      `⚠️ Пост будет опубликован в @magnumtap`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Создание поста без кнопки');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

// Обработчик просмотра содержимого сундуков
bot.action('show_chest_contents', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) return;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🟢 Обычный', 'show_chest_common'),
        Markup.button.callback('🔵 Редкий', 'show_chest_rare')
      ],
      [
        Markup.button.callback('🟣 Эпический', 'show_chest_epic'),
        Markup.button.callback('🟡 Легендарный', 'show_chest_legendary')
      ],
      [Markup.button.callback('🔙 Назад', 'admin_create_promocode')]
    ]);

    await ctx.editMessageText(
      `📋 *Содержимое сундуков*\n\n` +
      `Выберите тип сундука для просмотра возможных наград:\n\n` +
      `🎁 *Вероятности выпадения:*\n` +
      `├ 🟢 Обычный: 60%\n` +
      `├ 🔵 Редкий: 25%\n` +
      `├ 🟣 Эпический: 11%\n` +
      `└ 🟡 Легендарный: 4%\n\n` +
      `🎯 Выберите тип сундука:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Просмотр содержимого сундуков');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

// Обработчики просмотра содержимого конкретных сундуков
bot.action('show_chest_common', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) return;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'show_chest_contents')]
    ]);

    await ctx.editMessageText(
      `🟢 *Обычный сундук*\n\n` +
      `💎 *Возможные награды:*\n` +
      `├ 💰 Stars: 1-1000\n` +
      `└ ⭐ Stars: 1-5\n\n` +
      `📊 *Характеристики:*\n` +
      `├ Вероятность выпадения: 60%\n` +
      `├ Средняя ценность: ~250 Stars\n` +
      `└ Подходит для новичков\n\n` +
      `🎯 Этот сундук дает базовые награды для начинающих игроков.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Просмотр обычного сундука');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('show_chest_rare', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) return;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'show_chest_contents')]
    ]);

    await ctx.editMessageText(
      `🔵 *Редкий сундук*\n\n` +
      `💎 *Возможные награды:*\n` +
      `├ 💰 Stars: 50-150\n` +
      `├ ⭐ Stars: 25-75\n` +
      `└ ⛏️ Майнеры: 1-3 шт.\n\n` +
      `📊 *Характеристики:*\n` +
      `├ Вероятность выпадения: 25%\n` +
      `├ Средняя ценность: ~500 Stars\n` +
      `└ Содержит майнеры для майнинга\n\n` +
      `🎯 Этот сундук дает хорошие награды и майнеров для активной игры.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Просмотр редкого сундука');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('show_chest_epic', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) return;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'show_chest_contents')]
    ]);

    await ctx.editMessageText(
      `🟣 *Эпический сундук*\n\n` +
      `💎 *Возможные награды:*\n` +
      `├ 💰 Stars: 100-300\n` +
      `├ ⭐ Stars: 50-150\n` +
      `├ 👑 Титул: Случайный эпический\n` +
      `└ 📈 Множитель: x1.5\n\n` +
      `📊 *Характеристики:*\n` +
      `├ Вероятность выпадения: 11%\n` +
      `├ Средняя ценность: ~800 Stars\n` +
      `└ Дает уникальный титул и множитель\n\n` +
      `🎯 Этот сундук дает ценные награды и уникальный титул.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Просмотр эпического сундука');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

bot.action('show_chest_legendary', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) return;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', 'show_chest_contents')]
    ]);

    await ctx.editMessageText(
      `🟡 *Легендарный сундук*\n\n` +
      `💎 *Возможные награды:*\n` +
      `├ 💰 Stars: 300-800\n` +
      `├ ⭐ Stars: 100-300\n` +
      `├ ⛏️ Майнеры: 2-5 шт.\n` +
      `├ 👑 Титул: Случайный легендарный\n` +
      `└ 📈 Множитель: x2.0\n\n` +
      `📊 *Характеристики:*\n` +
      `├ Вероятность выпадения: 4%\n` +
      `├ Средняя ценность: ~1500 Stars\n` +
      `└ Максимальные награды во всех категориях\n\n` +
      `🎯 Этот сундук дает максимальные награды и эксклюзивные бонусы.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Просмотр легендарного сундука');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

// Обработчик статистики сундуков
bot.action('chest_statistics', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user || !isAdmin(user.id)) return;

    // Получаем статистику по сундукам
    const chestPromocodes = await db.collection('promocodes').find({
      rewardType: 'chest',
      isActive: true
    }).toArray();

    let commonCount = 0, rareCount = 0, epicCount = 0, legendaryCount = 0;
    let totalActivations = 0, totalRewards = 0;

    for (const promo of chestPromocodes) {
      switch (promo.chestType) {
        case 'common': commonCount++; break;
        case 'rare': rareCount++; break;
        case 'epic': epicCount++; break;
        case 'legendary': legendaryCount++; break;
      }
      totalActivations += promo.totalActivations || 0;
      totalRewards += promo.totalRewards || 0;
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Обновить', 'chest_statistics')],
      [Markup.button.callback('🔙 Назад', 'admin_create_promocode')]
    ]);

    await ctx.editMessageText(
      `📊 *Статистика сундуков*\n\n` +
      `🎁 *Активные сундуки:*\n` +
      `├ 🟢 Обычные: \`${commonCount}\`\n` +
      `├ 🔵 Редкие: \`${rareCount}\`\n` +
      `├ 🟣 Эпические: \`${epicCount}\`\n` +
      `└ 🟡 Легендарные: \`${legendaryCount}\`\n\n` +
      `📈 *Общая статистика:*\n` +
      `├ 🔄 Всего активаций: \`${formatNumber(totalActivations)}\`\n` +
      `├ 💰 Выдано наград: \`${formatNumber(totalRewards)}\`\n` +
      `└ 📊 Средняя награда: \`${totalActivations > 0 ? Math.round(totalRewards / totalActivations) : 0}\` Stars\n\n` +
      `🎯 Статистика обновляется в реальном времени.`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    logError(error, 'Статистика сундуков');
    await ctx.answerCbQuery('❌ Ошибка');
  }
});

// Запускаем бота
startBot();
