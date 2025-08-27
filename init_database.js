const { MongoClient } = require('mongodb');

// Конфигурация подключения к MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';

async function initDatabase() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔗 Подключение к MongoDB...');
    await client.connect();
    
    const db = client.db();
    console.log('✅ Подключение к базе данных установлено');
    
    console.log('📋 Инициализация базовых данных...');
    
    // 1. Инициализация конфигурации
    console.log('⚙️ Инициализация конфигурации...');
    await db.collection('config').insertMany([
      { key: 'BOT_TOKEN', value: process.env.BOT_TOKEN || '', description: 'Токен Telegram бота' },
      { key: 'ADMIN_IDS', value: process.env.ADMIN_IDS || '', description: 'ID администраторов' },
      { key: 'REQUIRED_CHANNEL', value: process.env.REQUIRED_CHANNEL || '', description: 'Обязательный канал для подписки' },
      { key: 'SUPPORT_CHANNEL', value: process.env.SUPPORT_CHANNEL || '', description: 'Канал поддержки' },
      { key: 'WITHDRAWAL_CHANNEL', value: process.env.WITHDRAWAL_CHANNEL || '', description: 'Канал для заявок на вывод' },
      { key: 'SPONSOR_TASK_BOT', value: process.env.SPONSOR_TASK_BOT || '', description: 'Бот для спонсорских заданий' },
      { key: 'FARMIK_BOT_LINK', value: process.env.FARMIK_BOT_LINK || '', description: 'Ссылка на Farmik бота' },
      { key: 'INITIAL_STARS', value: 0, description: 'Начальное количество Stars' },
      { key: 'INITIAL_MAGNUM_COINS', value: 1000, description: 'Начальное количество Magnum Coins' },
      { key: 'DAILY_BONUS_BASE', value: 3, description: 'Базовая награда ежедневного бонуса' },
      { key: 'REFERRAL_BONUS', value: 50, description: 'Бонус за реферала' },
      { key: 'REFERRAL_REWARD', value: 5, description: 'Награда за каждого реферала в Stars' },
      { key: 'MINER_REWARD_PER_MINUTE', value: 0.01, description: 'Базовая награда майнера за минуту' },
      { key: 'MINER_REWARD_PER_HOUR', value: 0.1, description: 'Базовая награда майнера за час' },
      { key: 'MINING_SEASON_DURATION', value: 30, description: 'Длительность сезона майнинга в днях' },
      { key: 'MINING_REWARD_INTERVAL', value: 1, description: 'Интервал начисления наград майнинга в минутах' },
      { key: 'MINING_ACTIVE_CLICK_BONUS', value: 0.5, description: 'Бонус за активный клик майнинга' },
      { key: 'EXCHANGE_COMMISSION', value: 2.5, description: 'Комиссия за обмен в процентах' },
      { key: 'MIN_WITHDRAWAL', value: 100, description: 'Минимальная сумма для вывода' },
      { key: 'MAX_WITHDRAWAL', value: 10000, description: 'Максимальная сумма для вывода' },
      { key: 'MINING_SEASON_START_DATE', value: '2025-08-28T10:00:00Z', description: 'Дата начала первого сезона майнинга' },
      { key: 'MINING_TOTAL_MAGNUM_COINS', value: 1000000, description: 'Общее количество MC для всех пользователей' },
      { key: 'MINING_TOTAL_STARS', value: 100, description: 'Общее количество Stars для всех пользователей' },
      { key: 'MINING_SEASON_MULTIPLIER', value: 1.2, description: 'Множитель увеличения наград каждый сезон' },
      { key: 'USER_CACHE_TTL', value: 30000, description: 'Время жизни кеша пользователей в мс' },
      { key: 'STATS_CACHE_TTL', value: 120000, description: 'Время жизни кеша статистики в мс' },
      { key: 'RATE_LIMIT_WINDOW', value: 60000, description: 'Окно ограничения запросов в мс' },
      { key: 'RATE_LIMIT_MAX_REQUESTS', value: 30, description: 'Максимальное количество запросов' },
      { key: 'INITIAL_RESERVE_STARS', value: 1000000, description: 'Начальный резерв Stars' },
      { key: 'INITIAL_RESERVE_MAGNUM_COINS', value: 1000000, description: 'Начальный резерв Magnum Coins' },
      { key: 'BASE_EXCHANGE_RATE', value: 0.001, description: 'Базовый курс обмена' },
      { key: 'EXCHANGE_RATE_MULTIPLIER', value: 1.0, description: 'Множитель курса обмена' }
    ]);
    console.log('✅ Конфигурация инициализирована');
    
    // 2. Инициализация базовых промокодов
    console.log('🎫 Инициализация промокодов...');
    await db.collection('promocodes').insertMany([
      {
        code: 'WELCOME2024',
        reward: { magnumCoins: 100, stars: 10 },
        isActive: true,
        maxUses: 1000,
        usedCount: 0,
        expiresAt: new Date('2025-12-31'),
        createdAt: new Date(),
        description: 'Приветственный промокод 2024'
      },
      {
        code: 'START100',
        reward: { magnumCoins: 50, stars: 5 },
        isActive: true,
        maxUses: 5000,
        usedCount: 0,
        expiresAt: new Date('2025-12-31'),
        createdAt: new Date(),
        description: 'Стартовый бонус'
      }
    ]);
    console.log('✅ Промокоды инициализированы');
    
    // 3. Инициализация титулов
    console.log('👑 Инициализация титулов...');
    await db.collection('titles').insertMany([
      { id: 'newbie', name: '🌱 Новичок', rarity: 'Обычный', conditionText: 'Начальный титул', minerBonus: 1.0 },
      { id: 'skilled', name: '🎯 Опытный', rarity: 'Обычный', conditionText: 'Уровень 10 или 50 майнеров', minerBonus: 1.2 },
      { id: 'expert', name: '⭐ Эксперт', rarity: 'Редкий', conditionText: 'Уровень 25 или 100 майнеров', minerBonus: 1.5 },
      { id: 'master', name: '👑 Мастер', rarity: 'Эпический', conditionText: 'Уровень 50 или 500 майнеров', minerBonus: 2.0 },
      { id: 'legend', name: '🔥 Легенда', rarity: 'Легендарный', conditionText: 'Уровень 100 или 1000 майнеров', minerBonus: 3.0 },
      { id: 'tactician', name: '🧠 Тактик', rarity: 'Секретный', conditionText: '100 майнеров и 5 рефералов', minerBonus: 1.9 }
    ]);
    console.log('✅ Титулы инициализированы');
    
    // 4. Инициализация достижений
    console.log('🏆 Инициализация достижений...');
    await db.collection('achievements').insertMany([
      { id: 'first_miner', title: '⛏️ Первый майнер', description: 'Запустите первый майнер', reward: { magnumCoins: 50, stars: 5 } },
      { id: 'miner_master', title: '👑 Мастер майнинга', description: 'Достигните 100 майнеров', reward: { magnumCoins: 500, stars: 50 } },
      { id: 'magnum_collector', title: '🪙 Коллекционер Magnum', description: 'Накопите 1000 Magnum Coins', reward: { magnumCoins: 200, stars: 20 } },
      { id: 'exchange_trader', title: '💱 Трейдер', description: 'Выполните 50 обменов', reward: { magnumCoins: 300, stars: 30 } },
      { id: 'level_10', title: '⭐ Уровень 10', description: 'Достигните 10 уровня', reward: { magnumCoins: 100, stars: 10 } },
      { id: 'level_25', title: '⭐ Уровень 25', description: 'Достигните 25 уровня', reward: { magnumCoins: 250, stars: 25 } },
      { id: 'level_50', title: '⭐ Уровень 50', description: 'Достигните 50 уровня', reward: { magnumCoins: 500, stars: 50 } },
      { id: 'referral_king', title: '👥 Король рефералов', description: 'Пригласите 10 рефералов', reward: { magnumCoins: 200, stars: 20 } },
      { id: 'daily_streak', title: '🔥 Серия дней', description: 'Получайте бонус 7 дней подряд', reward: { magnumCoins: 100, stars: 10 } },
      { id: 'season_champion', title: '🏆 Чемпион сезона', description: 'Займите 1 место в сезоне', reward: { magnumCoins: 1000, stars: 100 } }
    ]);
    console.log('✅ Достижения инициализированы');
    
    // 5. Инициализация магазина майнеров
    console.log('🛒 Инициализация магазина майнеров...');
    await db.collection('minerShop').insertMany([
      {
        id: 'basic',
        name: 'Базовый майнер',
        rarity: 'common',
        baseSpeed: 0.01,
        price: 100,
        currency: 'magnumCoins',
        description: 'Простой майнер для начинающих',
        miningCurrency: 'magnumCoins'
      },
      {
        id: 'advanced',
        name: 'Продвинутый майнер',
        rarity: 'rare',
        baseSpeed: 0.05,
        price: 500,
        currency: 'magnumCoins',
        description: 'Более мощный майнер',
        miningCurrency: 'magnumCoins'
      },
      {
        id: 'premium',
        name: 'Премиум майнер',
        rarity: 'epic',
        baseSpeed: 0.15,
        price: 50,
        currency: 'stars',
        description: 'Мощный майнер за Stars, добывает Stars',
        miningCurrency: 'stars'
      },
      {
        id: 'legendary',
        name: 'Легендарный майнер',
        rarity: 'legendary',
        baseSpeed: 0.5,
        price: 200,
        currency: 'stars',
        description: 'Самый мощный майнер, добывает Stars',
        miningCurrency: 'stars'
      }
    ]);
    console.log('✅ Магазин майнеров инициализирован');
    
    // 6. Инициализация наград сезонов
    console.log('🏆 Инициализация наград сезонов...');
    await db.collection('seasonRewards').insertMany([
      { rank: 'top1', magnumCoins: 10000, stars: 100, title: '🏆 Чемпион сезона' },
      { rank: 'top3', magnumCoins: 5000, stars: 50, title: '🥇 Топ-3 сезона' },
      { rank: 'top10', magnumCoins: 2000, stars: 20, title: '🥈 Топ-10 сезона' },
      { rank: 'top50', magnumCoins: 500, stars: 5, title: '🥉 Топ-50 сезона' }
    ]);
    console.log('✅ Награды сезонов инициализированы');
    
    // 7. Инициализация статистики бота
    console.log('📊 Инициализация статистики бота...');
    await db.collection('botStats').insertOne({
      totalUsers: 0,
      activeUsers: 0,
      totalTransactions: 0,
      totalVolume: 0,
      lastUpdate: new Date(),
      createdAt: new Date()
    });
    console.log('✅ Статистика бота инициализирована');
    
    console.log('🎉 База данных успешно инициализирована!');
    console.log('📋 Инициализированы коллекции:');
    console.log('  - config (конфигурация)');
    console.log('  - promocodes (промокоды)');
    console.log('  - titles (титулы)');
    console.log('  - achievements (достижения)');
    console.log('  - minerShop (магазин майнеров)');
    console.log('  - seasonRewards (награды сезонов)');
    console.log('  - botStats (статистика бота)');
    
  } catch (error) {
    console.error('❌ Ошибка при инициализации базы данных:', error);
  } finally {
    await client.close();
    console.log('🔌 Соединение с базой данных закрыто');
  }
}

// Запускаем инициализацию базы данных
initDatabase();
