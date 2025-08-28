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
        message: 'Magnum Stars Bot is running',
        timestamp: new Date().toISOString(),
        webappUrl: '/webapp',
        apiUrl: '/api/webapp/check-access'
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
        message: `+${reward.toFixed(2)} Stars за активный клик!`
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
        message: `+${reward.toFixed(2)} Stars за фарм!`
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

  app.post('/api/webapp/exchange', async (req, res) => {
    try {
      const { userId, froStarsurrency, toCurrency, amount } = req.body;
      if (!userId || !froStarsurrency || !toCurrency || !amount) {
        return res.status(400).json({ success: false, message: 'Missing required parameters' });
      }

      const user = await db.collection('users').findOne({ id: parseInt(userId) });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Проверяем баланс
      const userBalance = froStarsurrency === 'magnuStarsoins' ? user.magnuStarsoins : user.stars;
      if (userBalance < amount) {
        return res.json({ success: false, message: 'Недостаточно средств' });
      }

      // Рассчитываем курс обмена
      const baseRate = 0.001; // 1 Stars = 0.001 Stars
      const exchangeRate = froStarsurrency === 'magnuStarsoins' ? baseRate : 1 / baseRate;
      const convertedAmount = amount * exchangeRate;

      // Обновляем баланс
      const updateData = {};
      updateData[froStarsurrency] = -amount;
      updateData[toCurrency] = convertedAmount;

      await db.collection('users').updateOne(
        { id: parseInt(userId) },
        { 
          $inc: updateData,
          $set: { lastActivity: new Date() }
        }
      );

      res.json({ 
        success: true, 
        convertedAmount: convertedAmount.toFixed(4),
        message: `Обмен выполнен: ${amount} ${froStarsurrency} → ${convertedAmount.toFixed(4)} ${toCurrency}`
      });

    } catch (error) {
      console.error('Exchange error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
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
  PROMO_NOTIFICATIONS_CHAT: process.env.PROMO_NOTIFICATIONS_CHAT,
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
      miningCurrency: 'stars', // Добывает Stars
      description: 'Мощный майнер за Stars, добывает Stars (окупаемость ~21 день)'
    },
    legendary: {
      id: 'legendary',
      name: 'Легендарный майнер',
      rarity: 'legendary',
      baseSpeed: 0.0045, // ~31 день окупаемости
      price: 200,
      currency: 'stars',
      miningCurrency: 'stars', // Добывает Stars
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
  INITIAL_RESERVE_STARS: 0,
  INITIAL_RESERVE_MAGNUM_COINS: 0,
  
  // Курс обмена (базовый)
  BASE_EXCHANGE_RATE: 0.000001, // 1 Magnum Coin = 0.000001 Star
  EXCHANGE_RATE_MULTIPLIER: 1.0 // Множитель курса в зависимости от резерва
};

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

// API для обмена валют (Stars <-> Stars)
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
            if (user.magnuStarsoins < amount) return res.status(400).json({ error: 'Insufficient Stars' });
            const starsOut = amount * rate * (1 - commission);
            inc.magnuStarsoins -= amount;
            inc.stars += starsOut;
            reserveInc.magnuStarsoins += amount * commission;
            received = starsOut;
        } else if (from === 'stars') {
            if ((user.stars || 0) < amount) return res.status(400).json({ error: 'Insufficient Stars' });
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
      // Если Stars меньше или равно Stars, используем линейную шкалу
      multiplier = Math.max(0.001, ratio);
    } else {
      // Если Stars больше Stars, используем логарифмическую шкалу без ограничений
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
function formatProfileMessage(user, rankProgress) {
  let rankInfo = `├ Ранг: ${rankProgress.current.name}\n`;
  if (!rankProgress.isMax) {
    rankInfo += `├ Прогресс: ${rankProgress.progress}% (${rankProgress.remaining} ур. до ${rankProgress.next.name})\n`;
  } else {
    rankInfo += `├ Прогресс: Максимальный ранг! 🎉\n`;
  }
  
  return `🌟 *Добро пожаловать в Magnum Stars!*\n\n` +
    `👤 *Профиль:*\n` +
    `├ ID: \`${user.id}\`\n` +
    `├ Имя: ${getDisplayName(user)}\n` +
    `├ Уровень: ${user.level}\n` +
    `${rankInfo}` +
    `└ Титул: ${user.mainTitle}\n\n` +
    `💎 *Баланс:*\n` +
    `├ ⭐ Stars: \`${formatNumber(user.stars)}\`\n` +
    `└ 🪙 Stars: \`${formatNumber(user.magnuStarsoins)}\`\n\n` +
    `📊 *Статистика:*\n` +
    `├ Опыт: \`${user.experience}/${user.experienceToNextLevel}\`\n` +
    `└ Рефералы: \`${user.referralsCount}\`\n\n` +
    `📱 *Полезные ссылки:*\n` +
    `├ [📰 Новости](https://t.me/magnumtap)\n` +
    `├ [💰 Выводы](https://t.me/magnumwithdraw)\n` +
    `└ [💬 Чат](https://t.me/magnumtapchat)\n\n` +
    `⚠️ *Нашли ошибку?*\n` +
    `├ Сообщите в поддержку за вознаграждение!\n` +
    `├ FAQ и ответы на вопросы\n` +
    `└ Перейдите в ⚙️ Настройки → 🆘 Поддержка\n\n` +
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
  
  const message = formatProfileMessage(user, rankProgress);
  
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
  
  const message = formatProfileMessage(user, rankProgress);
  
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
    `⚡ *Скорость добычи Stars:* ${formatNumber(totalSpeed.stars)} Stars/мин\n` +
    `⭐ *Скорость добычи Stars:* ${formatNumber(totalSpeed.stars)} ⭐/мин\n\n` +
    `💰 *Награды:*\n` +
    `└ Stars: ${formatNumber(rewardPerMinuteStars)} Stars/мин • ${formatNumber(rewardPerHourStars)} Stars/час\n` +
    `└ Stars: ${formatNumber(rewardPerMinuteStars)} ⭐/мин • ${formatNumber(rewardPerHourStars)} ⭐/час\n\n` +
    `👑 *Титул:* ${mainTitle}${titleBonusText}\n\n` +
    `📊 *Всего добыто:*\n` +
    `└ Stars: ${formatNumber(userWithMining.miningStats?.totalMinedStars || 0)} Stars\n` +
    `└ Stars: ${formatNumber(userWithMining.miningStats?.totalMinedStars || 0)} ⭐\n\n` +
    `📊 *Сезонная добыча:*\n` +
    `└ Stars: ${formatNumber(userWithMining.miningStats?.seasonMinedStars || 0)} Stars\n` +
    `└ Stars: ${formatNumber(userWithMining.miningStats?.seasonMinedStars || 0)} ⭐\n\n` +
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
      `💰 *Текущая награда/час:* ${formatNumber((await calculateMinerReward(currentEfficiency, user)) * 60)} Stars\n\n` +
      `📈 *После улучшения:*\n` +
      `⚡ *Новая эффективность:* ${newEfficiency.toFixed(1)}x\n` +
      `💰 *Новая награда/час:* ${formatNumber(newRewardPerHour)} Stars\n\n` +
      `💎 *Стоимость улучшения:* ${formatNumber(upgradeCost)} Stars\n` +
      `💎 *Ваш баланс:* ${formatNumber(user.magnuStarsoins)} Stars\n\n` +
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
      `💰 *Награда/минуту:* ${formatNumber(rewardPerMinute)} Stars\n` +
      `💰 *Награда/час:* ${formatNumber(rewardPerHour)} Stars\n` +
      `💎 *Всего добыто:* ${formatNumber(miner.totalMined || 0)} Stars\n` +
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
  const baseMagnumLimit = config.MINING_TOTAL_MAGNUM_COINS;
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
async function updateSeasonStats(season, minedStars, minedStars) {
  await db.collection('miningSeasonStats').updateOne(
    { season: season },
    { 
      $inc: { 
        totalMinedStars: minedStars,
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
async function checkSeasonLimits(season, minedStars, minedStars) {
  const limits = getSeasonLimits(season);
  const stats = await getSeasonStats(season);
  
  const canMineMagnum = stats.totalMinedStars + minedStars <= limits.magnuStarsoins;
  const canMineStars = stats.totalMinedStars + minedStars <= limits.stars;
  
  return {
    canMineStars,
    canMineStars,
    remainingStars: Math.max(0, limits.magnuStarsoins - stats.totalMinedStars),
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
      `├ Stars: ${formatNumber(limits.magnuStarsoins)}\n` +
      `└ Stars: ${formatNumber(limits.stars)}\n\n` +
      `📊 *Статистика сезона:*\n` +
      `├ Добыто Stars: ${formatNumber(stats.totalMinedStars)} / ${formatNumber(limits.magnuStarsoins)}\n` +
      `├ Добыто Stars: ${formatNumber(stats.totalMinedStars)} / ${formatNumber(limits.stars)}\n` +
      `├ Осталось Stars: ${formatNumber(limitsCheck.remainingStars)}\n` +
      `└ Осталось Stars: ${formatNumber(limitsCheck.remainingStars)}\n\n` +
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
      totalMinedStars: 0,
      totalMinedStars: 0,
      seasonMinedStars: 0,
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
  let totalSpeedMagnum = 0;
  
  if (user.miners && user.miners.length > 0) {
    for (const miner of user.miners) {
      const minerConfig = config.MINERS[miner.type];
      if (minerConfig) {
        const levelMultiplier = 1 + (miner.level - 1) * 0.2; // +20% за каждый уровень
        const minerSpeed = minerConfig.baseSpeed * levelMultiplier * miner.count;
        
        // Определяем валюту майнинга
        const miningCurrency = minerConfig.miningCurrency || 'magnuStarsoins';
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
        
        const totalSpeedSum = totalSpeed.stars + totalSpeed.stars;
        if (totalSpeedSum > 0) {
          const now = new Date();
          const lastReward = userWithMining.miningStats.lastReward || now;
          const timeDiff = (now - lastReward) / (1000 * 60); // в минутах
          
          if (timeDiff >= config.MINING_REWARD_INTERVAL) {
            
            
            
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
        message: `❌ Недостаточно ${minerConfig.currency === 'magnuStarsoins' ? 'Stars' : 'Stars'}` 
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
    const currencySymbol = miningCurrency === 'stars' ? '⭐' : 'Stars';
    const priceSymbol = minerConfig.currency === 'magnuStarsoins' ? 'Stars' : '⭐';
    
    let message = `🛒 *Магазин майнеров*\n\n`;
    message += `💰 *Ваш баланс:*\n`;
    message += `├ Stars: ${formatNumber(userWithMining.magnuStarsoins)}\n`;
    message += `└ Stars: ${formatNumber(userWithMining.stars)}\n\n`;
    
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
    message += `💰 Ваш баланс: ${formatNumber(userWithMining.magnuStarsoins)} Stars\n\n`;
    
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
          const currencySymbol = miningCurrency === 'stars' ? '⭐' : 'Stars';
          
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
      const totalStarsPlayer = player.miningStats?.totalMinedStars || 0;
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
    `├ Stars: ${formatNumber(user.magnuStarsoins)}\n` +
    `└ Stars: ${formatNumber(user.stars)}\n\n` +
    `📊 *Статистика выводов:*\n` +
    `├ Всего выводов: ${withdrawal.withdrawalCount}\n` +
    `└ Всего выведено: ${formatNumber(withdrawal.totalWithdrawn)} Stars\n\n` +
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
    `💰 *Награда/минуту:* ${formatNumber(rewardPerMinute)} Stars\n` +
    `💰 *Награда/час:* ${formatNumber(rewardPerHour)} Stars\n` +
    `💎 *Всего добыто:* ${formatNumber(miner.totalMined || 0)} Stars${lastRewardText}\n\n` +
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
          `💰 *Базовая награда:* ${formatNumber(baseReward)} Stars\n` +
          `🔥 *Бонус серии:* +${formatNumber(streakBonus)} Stars\n` +
          `💎 *Итого награда:* ${formatNumber(totalReward)} Stars\n` +
          `🔥 *Текущая серия:* ${bonus.streak} дней\n` +
          `📊 *Всего получено:* ${bonus.totalClaimed || 0} бонусов\n` +
          `💎 *Всего заработано:* ${formatNumber(bonus.totalEarned || 0)} Stars\n\n` +
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
    
    const user = await getUser(userId);
    if (!user) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }
    
    // Добавляем титул пользователю
    user.titles.push({ name: titleName, earnedAt: new Date() });
    
    // Обновляем данные пользователя в базе данных
    await db.collection('users').updateOne(
      { id: userId },
      { $set: { titles: user.titles } }
    );
    
    await ctx.reply(`✅ Титул "${titleName}" выдан пользователю ${userId}`);
  } catch (error) {
    logError(error, 'Выдача титула пользователю');
    await ctx.reply('❌ Ошибка при выдаче титула');
  }
}
