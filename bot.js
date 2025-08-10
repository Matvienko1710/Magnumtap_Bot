require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');

// Конфигурация
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
const SUPPORT_CHANNEL = process.env.SUPPORT_CHANNEL; // Имя канала без @
const WITHDRAWAL_CHANNEL = process.env.WITHDRAWAL_CHANNEL; // Канал для заявок на вывод

// Обязательная подписка
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL;
const REQUIRED_BOT_LINK = process.env.REQUIRED_BOT_LINK || 'https://t.me/ReferalStarsRobot?start=6587897295';

// Ссылки для заданий (настраиваются через переменные окружения)
const FIRESTARS_BOT_LINK = process.env.FIRESTARS_BOT_LINK || 'https://t.me/firestars_rbot?start=6587897295';
const FARMIK_BOT_LINK = process.env.FARMIK_BOT_LINK || 'https://t.me/farmikstars_bot?start=6587897295';
const BASKET_BOT_LINK = process.env.BASKET_BOT_LINK || 'https://t.me/basket_gift_bot?start=6587897295';

// Система заявок на вывод
const WITHDRAWAL_STATUSES = {
  'pending': { name: '⏳ На рассмотрении', color: '🟡' },
  'approved': { name: '✅ Одобрено', color: '🟢' },
  'rejected': { name: '❌ Отклонено', color: '🔴' },
  'processing': { name: '🔄 В обработке', color: '🔵' },
  'completed': { name: '✅ Выполнено', color: '🟢' }
};

const REJECTION_REASONS = {
  'fraud': { name: '🚫 Накрутка активности', description: 'Обнаружены признаки накрутки активности или использования ботов' },
  'bug_abuse': { name: '🐛 Злоупотребление багами', description: 'Использование багов или уязвимостей для получения звёзд' },
  'multi_account': { name: '👥 Мультиаккаунтинг', description: 'Использование нескольких аккаунтов одним пользователем' },
  'insufficient_activity': { name: '📊 Недостаточная активность', description: 'Слишком низкая активность для такого количества звёзд' },
  'suspicious_pattern': { name: '🔍 Подозрительная активность', description: 'Обнаружены подозрительные паттерны в активности' },
  'other': { name: '❓ Другая причина', description: 'Причина будет указана дополнительно' }
};

console.log('🔧 Проверяем переменные окружения...');
console.log('🤖 BOT_TOKEN:', BOT_TOKEN ? 'установлен' : 'НЕ УСТАНОВЛЕН');
console.log('🗄️ MONGODB_URI:', MONGODB_URI ? 'установлен' : 'НЕ УСТАНОВЛЕН');
console.log('👑 ADMIN_IDS:', ADMIN_IDS.length ? ADMIN_IDS.join(', ') : 'НЕ УСТАНОВЛЕНЫ');
console.log('📞 SUPPORT_CHANNEL:', SUPPORT_CHANNEL || 'НЕ УСТАНОВЛЕН');
console.log('💳 WITHDRAWAL_CHANNEL:', WITHDRAWAL_CHANNEL || 'НЕ УСТАНОВЛЕН');
console.log('🔐 REQUIRED_CHANNEL:', REQUIRED_CHANNEL || 'НЕ УСТАНОВЛЕН');
console.log('📢 PROMO_NOTIFICATIONS_CHAT:', process.env.PROMO_NOTIFICATIONS_CHAT || 'НЕ УСТАНОВЛЕН');
console.log('📢 Канал для постов:', REQUIRED_CHANNEL ? `@${REQUIRED_CHANNEL}` : 'НЕ УСТАНОВЛЕН');

if (!BOT_TOKEN) throw new Error('Не задан BOT_TOKEN!');
if (!MONGODB_URI) throw new Error('Не задан MONGODB_URI!');

const bot = new Telegraf(BOT_TOKEN);
const mongo = new MongoClient(MONGODB_URI);
let users, promocodes, taskChecks, withdrawalRequests, reserve;

// Состояния пользователей для обработки ввода
const userStates = new Map();

// Кеш пользователей для оптимизации (время жизни 30 секунд)
const userCache = new Map();
const USER_CACHE_TTL = 30000;

// Кеш статистики бота (время жизни 30 секунд для быстрого обновления)
let botStatsCache = null;
let botStatsCacheTime = 0;
const BOT_STATS_CACHE_TTL = 30000; // 30 секунд

// Функция для инвалидации кеша статистики
function invalidateBotStatsCache() {
  botStatsCache = null;
  botStatsCacheTime = 0;
}

// Настройки кулдауна фарма
let farmCooldownEnabled = true;
let farmCooldownSeconds = 10; // по умолчанию 10 секунд

// Функция для инвалидации кеша пользователя
function invalidateUserCache(userId) {
  userCache.delete(userId.toString());
}

// Функция для получения общей статистики бота с кешированием
async function getBotStatistics() {
  // Проверяем кеш
  const now = Date.now();
  if (botStatsCache && (now - botStatsCacheTime) < BOT_STATS_CACHE_TTL) {
    return botStatsCache;
  }

  try {
    // Общее количество пользователей
    const totalUsers = await users.countDocuments();
    
    // Общее количество заработанных Magnum Coin (реальная статистика)
    const totalMagnumCoinsResult = await users.aggregate([
      { $group: { _id: null, total: { $sum: { $ifNull: ['$totalEarnedMagnumCoins', '$magnumCoins'] } } } }
    ]).toArray();
    const totalMagnumCoins = totalMagnumCoinsResult.length > 0 ? totalMagnumCoinsResult[0].total : 0;
    
    // Общее количество заработанных звёзд
    const totalStarsResult = await users.aggregate([
      { $group: { _id: null, total: { $sum: '$stars' } } }
    ]).toArray();
    const totalStars = totalStarsResult.length > 0 ? totalStarsResult[0].total : 0;
    
    // Количество выполненных выводов
    let totalWithdrawn = 0;
    try {
      const withdrawnResult = await withdrawalRequests.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).toArray();
      totalWithdrawn = withdrawnResult.length > 0 ? withdrawnResult[0].total : 0;
    } catch {
      totalWithdrawn = 0;
    }
    
    // Общее количество потраченных звёзд (покупки у всех пользователей)
    let totalStarsSpent = 0;
    try {
      const spentStarsResult = await users.aggregate([
        { $unwind: '$purchases' },
        { $group: { _id: null, total: { $sum: '$purchases.price' } } }
      ]).toArray();
      totalStarsSpent = spentStarsResult.length > 0 ? spentStarsResult[0].total : 0;
    } catch {
      totalStarsSpent = 0;
    }
    
    // Общее количество потраченных Magnum Coin (обмен на звёзды + кастомные титулы)
    let totalMagnumCoinsSpent = 0;
    try {
      // Обмен на звёзды (каждая выведенная звезда = 10 потраченных Magnum Coin)
      const exchangedMagnumCoins = totalWithdrawn * 10;
      
      // Кастомные титулы (обычно стоят 100 Magnum Coin)
      let customTitlesSpent = 0;
      const customTitlesResult = await supportTickets.aggregate([
        { $match: { type: 'custom_title', status: 'approved' } },
        { $count: 'total' }
      ]).toArray();
      const customTitlesCount = customTitlesResult.length > 0 ? customTitlesResult[0].total : 0;
      customTitlesSpent = customTitlesCount * 100; // 100 Magnum Coin за титул
      
      totalMagnumCoinsSpent = exchangedMagnumCoins + customTitlesSpent;
    } catch {
      totalMagnumCoinsSpent = 0;
    }
    
    const stats = {
      totalUsers: totalUsers,
      totalMagnumCoins: Math.round(totalMagnumCoins * 100) / 100,
      totalStars: Math.round(totalStars * 100) / 100,
      totalWithdrawn: Math.round(totalWithdrawn * 100) / 100,
      totalStarsSpent: Math.round(totalStarsSpent * 100) / 100,
      totalMagnumCoinsSpent: Math.round(totalMagnumCoinsSpent * 100) / 100
    };
    
    // Обновляем кеш
    botStatsCache = stats;
    botStatsCacheTime = now;
    
    return stats;
  } catch (error) {
    console.error('Ошибка получения статистики бота:', error);
    return {
      totalUsers: 0,
      totalMagnumCoins: 0,
      totalStars: 0,
      totalWithdrawn: 0,
      totalStarsSpent: 0,
      totalMagnumCoinsSpent: 0
    };
  }
}

// Периодическая очистка устаревшего кеша (каждые 5 минут)
setInterval(() => {
  const now = Date.now();
  for (const [key, cached] of userCache.entries()) {
    if (now - cached.timestamp > USER_CACHE_TTL) {
      userCache.delete(key);
    }
  }
}, 300000); // 5 минут

// Кеш для оптимизации
const photoUrlCache = process.env.BOT_PHOTO_URL;

// Функция для отправки сообщений главного меню с фото
async function sendMainMenuWithPhoto(ctx, text, keyboard, isEdit = true) {
  try {
    if (photoUrlCache && isEdit) {
      // Попытка 1: редактирование медиа (если сообщение уже с фото)
      try {
        return await ctx.editMessageMedia({
          type: 'photo',
          media: photoUrlCache,
          caption: text,
          parse_mode: 'Markdown'
        }, keyboard);
      } catch (mediaError) {
        console.log('Не удалось отредактировать медиа:', mediaError.message);
        
        // Попытка 2: редактирование текста
        try {
          return await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            ...keyboard
          });
        } catch (textError) {
          console.log('Не удалось отредактировать текст:', textError.message);
          
          // Попытка 3: удаляем и создаем новое с фото
          try {
            await ctx.deleteMessage();
          } catch (deleteError) {
            console.log('Не удалось удалить сообщение:', deleteError.message);
          }
          
          try {
            return await ctx.replyWithPhoto(photoUrlCache, {
              caption: text,
              parse_mode: 'Markdown',
              ...keyboard
            });
          } catch (photoError) {
            console.log('Не удалось отправить фото:', photoError.message);
            
            // Финальный fallback: обычное текстовое сообщение
            return await ctx.reply(text, {
              parse_mode: 'Markdown',
              ...keyboard
            });
          }
        }
      }
    } else if (photoUrlCache && !isEdit) {
      // Новое сообщение с фото
      try {
        return await ctx.replyWithPhoto(photoUrlCache, {
          caption: text,
          parse_mode: 'Markdown',
          ...keyboard
        });
      } catch (photoError) {
        console.log('Не удалось отправить новое фото:', photoError.message);
        return await ctx.reply(text, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      }
    } else {
      // Без фото - отправляем обычное сообщение
      if (isEdit) {
        try {
          return await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            ...keyboard
          });
        } catch (editError) {
          console.log('Не удалось отредактировать без фото:', editError.message);
          
          try {
            await ctx.deleteMessage();
          } catch (deleteError) {
            console.log('Не удалось удалить без фото:', deleteError.message);
          }
          
          return await ctx.reply(text, {
            parse_mode: 'Markdown',
            ...keyboard
          });
        }
      } else {
        return await ctx.reply(text, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      }
    }
  } catch (criticalError) {
    console.error('Критическая ошибка в sendMainMenuWithPhoto:', criticalError);
    
    // Последняя попытка отправить хотя бы базовое уведомление
    try {
      return await ctx.reply('⚠️ Временно недоступно. Повторите через пару секунд.', {
        reply_markup: {
          inline_keyboard: [[
            { text: '🔄 Попробовать снова', callback_data: 'main_menu' }
          ]]
        }
      });
    } catch (finalError) {
      console.error('Полный провал отправки сообщения:', finalError);
      return null;
    }
  }
}

// Универсальная функция для отправки сообщений БЕЗ фото (для всех остальных меню)
async function sendMessageWithPhoto(ctx, text, keyboard, isEdit = true) {
  try {
    if (isEdit) {
      // Стратегия: всегда удаляем старое сообщение и отправляем новое
      // Это решает все проблемы с типами сообщений
      try {
        await ctx.deleteMessage();
      } catch (deleteError) {
        // Игнорируем ошибки удаления - сообщение может быть уже удалено
      }
      
      // Отправляем новое сообщение
      return await ctx.reply(text, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } else {
      return await ctx.reply(text, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    }
  } catch (criticalError) {
    console.error('Критическая ошибка в sendMessageWithPhoto:', criticalError);
    
    // Последняя попытка отправить хотя бы базовое уведомление
    try {
      return await ctx.reply('⚠️ Временно недоступно. Повторите через пару секунд.', {
        reply_markup: {
          inline_keyboard: [[
            { text: '🔄 Попробовать снова', callback_data: 'main_menu' }
          ]]
        }
      });
    } catch (finalError) {
      console.error('Полный провал отправки сообщения:', finalError);
      return null;
    }
  }
}

// Система титулов
const TITLES = {
  // Обычные титулы (10)
  'newcomer': { name: 'Новичок', description: 'Начал путь в MagnumTap', condition: 'registration', requirement: 1, icon: '🌱' },
  'farmer': { name: 'Фармер', description: 'Выполнил 30 действий фарминга', condition: 'farm_count', requirement: 30, icon: '⚡' },
  'collector': { name: 'Коллекционер', description: 'Собрал 50 звёзд', condition: 'stars', requirement: 50, icon: '💎' },
  'inviter': { name: 'Амбассадор', description: 'Пригласил 3 друзей', condition: 'invited', requirement: 3, icon: '🤝' },
  'daily_visitor': { name: 'Постоянный посетитель', description: '5 дней подряд заходил в бота', condition: 'daily_streak', requirement: 5, icon: '📅' },
  'bonus_hunter': { name: 'Охотник за бонусами', description: 'Собрал 15 ежедневных бонусов', condition: 'bonus_count', requirement: 15, icon: '🎁' },
  'promo_master': { name: 'Мастер промокодов', description: 'Активировал 5 промокодов', condition: 'promo_count', requirement: 5, icon: '🎫' },
  'task_warrior': { name: 'Воин заданий', description: 'Выполнил 20 заданий', condition: 'task_count', requirement: 20, icon: '⚔️' },
  'star_lord': { name: 'Звёздный лорд', description: 'Собрал 200 звёзд', condition: 'stars', requirement: 200, icon: '🌟' },
  'legend': { name: 'Легенда', description: 'Собрал 500 звёзд и пригласил 10 друзей', condition: 'combined', requirement: { stars: 500, invited: 10 }, icon: '👑' },

  // Секретные титулы (3)
  'early_bird': { name: 'Ранняя пташка', description: 'Секретный титул за особую активность', condition: 'secret', requirement: 'special', icon: '🌅' },
  'night_owl': { name: 'Ночная сова', description: 'Секретный титул для ночных игроков', condition: 'secret', requirement: 'special', icon: '🦉' },
  'vip_elite': { name: 'VIP Элита', description: 'Эксклюзивный титул от администрации', condition: 'secret', requirement: 'admin_only', icon: '💫' }
};

// Система уровней (по звездам)
const RANKS = [
  { name: 'Новичок', requirement: 0, color: '🆕' },           // Уровень 1
  { name: 'Ученик', requirement: 10, color: '📚' },           // Уровень 2 
  { name: 'Стажёр', requirement: 25, color: '🎓' },           // Уровень 3
  { name: 'Работник', requirement: 50, color: '⚙️' },         // Уровень 4
  { name: 'Специалист', requirement: 100, color: '🔧' },      // Уровень 5
  { name: 'Эксперт', requirement: 200, color: '💼' },         // Уровень 6
  { name: 'Мастер', requirement: 350, color: '🏅' },          // Уровень 7
  { name: 'Профессионал', requirement: 500, color: '🥉' },    // Уровень 8
  { name: 'Виртуоз', requirement: 750, color: '🥈' },         // Уровень 9
  { name: 'Элита', requirement: 1000, color: '🥇' },          // Уровень 10
  { name: 'Чемпион', requirement: 1500, color: '🏆' },        // Уровень 11
  { name: 'Титан', requirement: 2500, color: '💎' },          // Уровень 12
  { name: 'Божество', requirement: 4000, color: '👑' },       // Уровень 13
  { name: 'Легенда', requirement: 6000, color: '⭐' },        // Уровень 14
  { name: 'Император', requirement: 10000, color: '🌟' }      // Уровень 15 (максимальный)
];

// Система магазина
const SHOP_ITEMS = {
  'boost_farm': {
    name: '⚡ Бустер фарма x2',
    description: 'Удваивает награду за фарм на 1 час',
    price: 50,
    icon: '⚡',
    duration: 3600, // 1 час в секундах
    category: 'boosts'
  },
  'boost_bonus': {
    name: '🎁 Бустер бонуса x2', 
    description: 'Удваивает ежедневный бонус на 3 дня',
    price: 100,
    icon: '🎁',
    duration: 259200, // 3 дня в секундах
    category: 'boosts'
  },
  'multiplier_stars': {
    name: '✨ Множитель звёзд x3',
    description: 'Утраивает все награды за звёзды на 30 минут',
    price: 200,
    icon: '✨',
    duration: 1800, // 30 минут
    category: 'multipliers'
  },
  'premium_week': {
    name: '👑 Премиум статус',
    description: 'VIP статус на неделю + все бонусы',
    price: 500,
    icon: '👑',
    duration: 604800, // 7 дней
    category: 'premium'
  },
  'lucky_box': {
    name: '🎲 Коробка удачи',
    description: 'Средний выигрыш ~10⭐ (диапазон 1-100⭐)',
    price: 25,
    icon: '🎲',
    category: 'boxes'
  },
  'mega_box': {
    name: '💎 Мега коробка',
    description: 'Средний выигрыш ~75⭐ (диапазон 20-284⭐)',
    price: 150,
    icon: '💎',
    category: 'boxes'
  },
  'custom_title': {
    name: '🏷️ Кастомный титул',
    description: 'Создайте свой уникальный титул',
    price: 1000,
    icon: '🏷️',
    category: 'cosmetic'
  },
  'miner': {
    name: '⛏️ Майнер',
    description: 'Автоматический майнер звезд. Доход 24/7. Окупается за 30-60 дней',
    price: 1000,
    icon: '⛏️',
    category: 'miner',
    currency: 'magnumCoins'  // Покупается за Magnum Coin
  }
};

// Система комиссий обмена
let EXCHANGE_COMMISSION = 0; // Комиссия в процентах (0 = без комиссии)

// Функция для инициализации комиссии в БД
async function initializeCommission() {
  try {
    const existingCommission = await reserve.findOne({ type: 'commission' });
    if (!existingCommission) {
      await reserve.insertOne({
        type: 'commission',
        value: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log('✅ Комиссия инициализирована в БД: 0%');
    } else {
      EXCHANGE_COMMISSION = existingCommission.value;
      console.log(`✅ Комиссия загружена из БД: ${EXCHANGE_COMMISSION}%`);
    }
  } catch (error) {
    console.error('❌ Ошибка инициализации комиссии:', error);
  }
}

// Функция для сохранения комиссии в БД
async function saveCommissionToDB() {
  try {
    await reserve.updateOne(
      { type: 'commission' },
      {
        $set: {
          value: EXCHANGE_COMMISSION,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    console.log(`💾 Комиссия сохранена в БД: ${EXCHANGE_COMMISSION}%`);
  } catch (error) {
    console.error('❌ Ошибка сохранения комиссии в БД:', error);
  }
}

// Лимиты обмена
const EXCHANGE_LIMITS = {
  MIN_MAGNUM_COINS: 100, // Минимум Magnum Coin для обмена
  MAX_MAGNUM_COINS: 10000, // Максимум Magnum Coin за одну операцию
  MIN_STARS: 0.01, // Минимум звёзд для обмена
  MAX_STARS: 1000 // Максимум звёзд за одну операцию
};

// Баланс резерва проекта (временные переменные для кеширования)
let RESERVE_MAGNUM_COINS = 1000000000; // Начальный резерв Magnum Coin (1,000,000,000)
let RESERVE_STARS = 10000; // Начальный резерв звёзд (10,000) (курс: 100🪙 = 0.001⭐)

// Функция для инициализации резерва в БД
async function initializeReserve() {
  try {
    const existingReserve = await reserve.findOne({});
    if (!existingReserve) {
      await reserve.insertOne({
        magnumCoins: 1000000000, // 1,000,000,000 Magnum Coin
        stars: 10000, // 10,000 звёзд
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log('✅ Резерв инициализирован в БД (курс: 100🪙 = 0.001⭐)');
    } else {
      // Загружаем существующий резерв в память
      RESERVE_MAGNUM_COINS = existingReserve.magnumCoins;
      RESERVE_STARS = existingReserve.stars;
      console.log(`✅ Резерв загружен из БД: ${RESERVE_MAGNUM_COINS}🪙, ${RESERVE_STARS}⭐`);
    }
  } catch (error) {
    console.error('❌ Ошибка инициализации резерва:', error);
  }
}

// Функция для сохранения резерва в БД
async function saveReserveToDB() {
  try {
    await reserve.updateOne(
      {},
      {
        $set: {
          magnumCoins: RESERVE_MAGNUM_COINS,
          stars: RESERVE_STARS,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    console.log(`💾 Резерв сохранен в БД: ${RESERVE_MAGNUM_COINS}🪙, ${RESERVE_STARS}⭐`);
  } catch (error) {
    console.error('❌ Ошибка сохранения резерва в БД:', error);
  }
}

// Функция для загрузки резерва из БД
async function loadReserveFromDB() {
  try {
    const reserveData = await reserve.findOne({});
    if (reserveData) {
      RESERVE_MAGNUM_COINS = reserveData.magnumCoins;
      RESERVE_STARS = reserveData.stars;
      console.log(`📥 Резерв загружен из БД: ${RESERVE_MAGNUM_COINS}🪙, ${RESERVE_STARS}⭐`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Ошибка загрузки резерва из БД:', error);
    return false;
  }
}

// Функция для сброса базы данных (очистка всех данных, но сохранение структуры)
async function resetDatabase() {
  try {
    console.log('🗄️ Начинаем сброс базы данных...');
    
    // Очищаем все коллекции, но оставляем структуру
    const collections = [
      { collection: users, description: 'Пользователи' },
      { collection: promocodes, description: 'Промокоды' },
      { collection: withdrawalRequests, description: 'Заявки на вывод' },
      { collection: supportTickets, description: 'Тикеты поддержки' },
      { collection: taskChecks, description: 'Проверки заданий' },
      { collection: reserve, description: 'Резерв биржи' }
    ];
    
    let deletedCount = 0;
    
    for (const item of collections) {
      try {
        const result = await item.collection.deleteMany({});
        console.log(`✅ ${item.description}: удалено ${result.deletedCount} записей`);
        deletedCount += result.deletedCount;
      } catch (error) {
        console.error(`❌ Ошибка очистки ${item.description}:`, error);
      }
    }
    
    // Сбрасываем кеши
    userCache.clear();
    botStatsCache = null;
    botStatsCacheTime = 0;
    
    // Инициализируем резерв заново
    await initializeReserve();
    await initializeCommission();
    
    console.log(`🗄️ Сброс базы данных завершен! Удалено ${deletedCount} записей`);
    return { success: true, deletedCount };
    
  } catch (error) {
    console.error('❌ Ошибка сброса базы данных:', error);
    return { success: false, error: error.message };
  }
}

// Улучшенная функция для расчета курса обмена на основе резерва
function calculateExchangeRate(fromCurrency, toCurrency, amount) {
  try {
    // Защита от деления на ноль
    if (RESERVE_MAGNUM_COINS <= 0 || RESERVE_STARS <= 0) {
      console.error('❌ Резерв биржи пуст или отрицательный!');
      return 0;
    }
    
    if (fromCurrency === 'magnumCoins' && toCurrency === 'stars') {
      // Обмен Magnum Coin на звёзды
      const rate = RESERVE_STARS / RESERVE_MAGNUM_COINS;
      return amount * rate;
    } else if (fromCurrency === 'stars' && toCurrency === 'magnumCoins') {
      // Обмен звёзд на Magnum Coin
      const rate = RESERVE_MAGNUM_COINS / RESERVE_STARS;
      return amount * rate;
    }
    return 0;
  } catch (error) {
    console.error('❌ Ошибка расчета курса обмена:', error);
    return 0;
  }
}

// Функция для расчета комиссии
function calculateCommission(amount) {
  if (EXCHANGE_COMMISSION <= 0) return 0;
  return amount * (EXCHANGE_COMMISSION / 100);
}

// Функция для расчета суммы с учетом комиссии
function calculateAmountWithCommission(amount) {
  if (EXCHANGE_COMMISSION <= 0) return amount;
  return amount * (1 - EXCHANGE_COMMISSION / 100);
}

// Функция для форматирования чисел с правильным количеством знаков
function formatNumber(num) {
  if (num === 0) return '0';
  if (num < 0.01) {
    // Для очень маленьких чисел показываем до 6 знаков
    return num.toFixed(6).replace(/\.?0+$/, '');
  } else if (num < 1) {
    // Для чисел меньше 1 показываем до 4 знаков
    return num.toFixed(4).replace(/\.?0+$/, '');
  } else if (num < 100) {
    // Для чисел до 100 показываем до 2 знаков
    return num.toFixed(2).replace(/\.?0+$/, '');
  } else {
    // Для больших чисел показываем до 2 знаков
    return num.toFixed(2).replace(/\.?0+$/, '');
  }
}

// Функция для форматирования больших чисел с разделительными точками
function formatLargeNumber(num) {
  if (num === 0) return '0';
  
  // Форматируем число с разделительными точками
  return num.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

// Функция для расчета дохода майнера на основе курса звёзд
function calculateMinerReward() {
  try {
    // Базовый доход: 1000 MC стоит майнер, окупаемость 45 дней
    const minerCost = 1000; // Стоимость майнера в Magnum Coin
    const paybackDays = 45; // Дни окупаемости
    const paybackHours = paybackDays * 24; // Часы окупаемости
    
    // Рассчитываем базовый доход в Magnum Coin за час
    const baseRewardPerHourMC = minerCost / paybackHours;
    
    // Получаем текущий курс обмена
    const magnumToStarsRate = RESERVE_STARS / RESERVE_MAGNUM_COINS;
    
    // Рассчитываем доход в звёздах с учетом курса
    const rewardPerHourStars = baseRewardPerHourMC * magnumToStarsRate;
    
    // Округляем до 4 знаков после запятой для точности
    const roundedReward = Math.round(rewardPerHourStars * 10000) / 10000;
    
    // Минимальный доход: 0.0001 звезды в час
    const minReward = 0.0001;
    
    return Math.max(roundedReward, minReward);
  } catch (error) {
    console.error('❌ Ошибка расчета дохода майнера:', error);
    return 0.0001; // Возвращаем минимальный доход при ошибке
  }
}

// Функция для расчета награды за фарм на основе курса обмена
function calculateFarmReward() {
  try {
    // Базовая награда за фарм (в Magnum Coin)
    const baseReward = 1;
    
    // Рассчитываем курс обмена
    const magnumToStarsRate = RESERVE_STARS / RESERVE_MAGNUM_COINS;
    
    // Если курс высокий (много звёзд за Magnum Coin), то награда увеличивается
    // Если курс низкий (мало звёзд за Magnum Coin), то награда уменьшается
    const rateMultiplier = Math.max(0.5, Math.min(2.0, magnumToStarsRate * 100));
    
    const dynamicReward = baseReward * rateMultiplier;
    
    // Округляем до 2 знаков после запятой
    const roundedReward = Math.round(dynamicReward * 100) / 100;
    
    // Минимальная награда 0.5, максимальная 2.0
    const minReward = 0.5;
    const maxReward = 2.0;
    
    return Math.max(minReward, Math.min(maxReward, roundedReward));
  } catch (error) {
    console.error('❌ Ошибка расчета награды за фарм:', error);
    return 1; // Возвращаем базовую награду при ошибке
  }
}

// Улучшенная функция для обновления резерва после обмена
async function updateReserve(fromCurrency, toCurrency, fromAmount, toAmount, commissionAmount = 0) {
  try {
    // Проверка входных данных
    if (fromAmount <= 0 || toAmount <= 0) {
      console.error('❌ Некорректные суммы для обновления резерва');
      return false;
    }
    
    if (fromCurrency === 'magnumCoins' && toCurrency === 'stars') {
      // Проверка достаточности резерва звёзд
      if (RESERVE_STARS < toAmount) {
        console.error('❌ Недостаточно звёзд в резерве для обмена');
        return false;
      }
      // Пользователь отдает fromAmount, но получает toAmount (уже с учетом комиссии)
      // Комиссия остается в резерве
      RESERVE_MAGNUM_COINS += fromAmount;
      RESERVE_STARS -= toAmount;
      
      // Если есть комиссия, она добавляется в резерв
      if (commissionAmount > 0) {
        console.log(`💰 Комиссия ${commissionAmount.toFixed(2)}🪙 добавлена в резерв`);
      }
    } else if (fromCurrency === 'stars' && toCurrency === 'magnumCoins') {
      // Проверка достаточности резерва Magnum Coin
      if (RESERVE_MAGNUM_COINS < toAmount) {
        console.error('❌ Недостаточно Magnum Coin в резерве для обмена');
        return false;
      }
      // Пользователь отдает fromAmount, но получает toAmount (уже с учетом комиссии)
      // Комиссия остается в резерве
      RESERVE_STARS += fromAmount;
      RESERVE_MAGNUM_COINS -= toAmount;
      
      // Если есть комиссия, она добавляется в резерв
      if (commissionAmount > 0) {
        console.log(`💰 Комиссия ${commissionAmount.toFixed(2)}⭐ добавлена в резерв`);
      }
    }
    
    // Проверка на отрицательный резерв
    if (RESERVE_MAGNUM_COINS < 0 || RESERVE_STARS < 0) {
      console.error('❌ Резерв стал отрицательным! Откат изменений');
      // Откат изменений
      if (fromCurrency === 'magnumCoins' && toCurrency === 'stars') {
        RESERVE_MAGNUM_COINS -= fromAmount;
        RESERVE_STARS += toAmount;
      } else if (fromCurrency === 'stars' && toCurrency === 'magnumCoins') {
        RESERVE_STARS -= fromAmount;
        RESERVE_MAGNUM_COINS += toAmount;
      }
      return false;
    }
    
    // Сохраняем резерв в БД
    await saveReserveToDB();
    
    console.log(`✅ Резерв обновлен: ${RESERVE_MAGNUM_COINS.toFixed(2)}🪙, ${RESERVE_STARS.toFixed(2)}⭐`);
    return true;
  } catch (error) {
    console.error('❌ Ошибка обновления резерва:', error);
    return false;
  }
}

// Функция для генерации текста управления резервом
function getReserveManagementText() {
  const minerReward = calculateMinerReward();
  const dailyMinerReward = minerReward * 24;
  const farmReward = calculateFarmReward();
  const bonusReward = farmReward * 3;
  
  return `🏦 **УПРАВЛЕНИЕ РЕЗЕРВОМ БИРЖИ** 🏦\n\n` +
         `📊 **Текущий резерв биржи:**\n` +
         `🪙 ${formatLargeNumber(RESERVE_MAGNUM_COINS)} Magnum Coin\n` +
         `⭐ ${formatLargeNumber(RESERVE_STARS)} звёзд\n\n` +
         `📈 **Текущие курсы обмена:**\n` +
         `• 100🪙 = ${formatNumber(100 * (RESERVE_STARS / RESERVE_MAGNUM_COINS))}⭐\n` +
         `• 10⭐ = ${formatNumber(10 * (RESERVE_MAGNUM_COINS / RESERVE_STARS))}🪙\n\n` +
         `🌾 **Награды за активность:**\n` +
         `• Фарм: ${formatNumber(farmReward)}🪙 за клик\n` +
         `• Бонус: ${formatNumber(bonusReward)}🪙 в день\n` +
         `• Зависят от курса обмена\n\n` +
         `⛏️ **Доходность майнера:**\n` +
         `• ${formatNumber(minerReward)}⭐ в час (${formatNumber(dailyMinerReward)}⭐ в день)\n` +
         `• Окупаемость: ~45 дней\n\n` +
         `📊 **Лимиты обмена:**\n` +
         `• Минимум: ${EXCHANGE_LIMITS.MIN_MAGNUM_COINS}🪙 / ${EXCHANGE_LIMITS.MIN_STARS}⭐\n` +
         `• Максимум за операцию: ${EXCHANGE_LIMITS.MAX_MAGNUM_COINS}🪙 / ${EXCHANGE_LIMITS.MAX_STARS}⭐\n` +
         `• Комиссия: ${EXCHANGE_COMMISSION}%\n\n` +
         `💡 **Как работает резерв:**\n` +
         `• Курсы обмена зависят от баланса резерва\n` +
         `• При обмене резерв автоматически обновляется\n` +
         `• Комиссия с пользователей пополняет резерв\n` +
         `• Награды за фарм зависят от курса\n` +
         `• Доходность майнера зависит от курса\n` +
         `• Больше резерва = лучше курсы для пользователей`;
}

// Функция для генерации текста курсов обмена
function getExchangeRatesText() {
  try {
    // Защита от деления на ноль
    if (RESERVE_MAGNUM_COINS <= 0 || RESERVE_STARS <= 0) {
      return `🔄 **Доступные курсы:**\n\n` +
             `⚠️ **Внимание:** Резерв биржи временно недоступен\n` +
             `Попробуйте позже или обратитесь к администратору`;
    }
    
    // Рассчитываем динамические курсы на основе резерва
    const magnumToStarsRate = RESERVE_STARS / RESERVE_MAGNUM_COINS;
    const starsToMagnumRate = RESERVE_MAGNUM_COINS / RESERVE_STARS;
    
    // Рассчитываем курсы с учетом комиссии
    const baseMagnumToStars = 100 * magnumToStarsRate;
    const baseStarsToMagnum = 10 * starsToMagnumRate;
    const magnumToStarsWithCommission = calculateAmountWithCommission(baseMagnumToStars);
    const starsToMagnumWithCommission = calculateAmountWithCommission(baseStarsToMagnum);
    
    // Рассчитываем доходность майнера и награды за фарм
    const minerReward = calculateMinerReward();
    const dailyMinerReward = minerReward * 24;
    const farmReward = calculateFarmReward();
    const bonusReward = farmReward * 3;
    
                    return `🔄 **Доступные курсы:**\n\n` +
                       `⭐ **Telegram Stars:**\n` +
                       `• Курс: 100🪙 = ${formatNumber(magnumToStarsWithCommission)}⭐ TG Stars\n` +
                       `• Обратный курс: 10⭐ = ${formatNumber(starsToMagnumWithCommission)}🪙\n` +
                       `• Минимум: ${EXCHANGE_LIMITS.MIN_MAGNUM_COINS}🪙 или ${EXCHANGE_LIMITS.MIN_STARS}⭐\n` +
                       `• Максимум за операцию: ${EXCHANGE_LIMITS.MAX_MAGNUM_COINS}🪙 или ${EXCHANGE_LIMITS.MAX_STARS}⭐\n` +
                       `• Комиссия: ${EXCHANGE_COMMISSION}%\n\n` +
                       `🌾 **Награды за активность:**\n` +
                       `• Фарм: ${formatNumber(farmReward)}🪙 за клик\n` +
                       `• Бонус: ${formatNumber(bonusReward)}🪙 в день\n` +
                       `• Зависят от курса обмена\n\n` +
                       `⛏️ **Доходность майнера:**\n` +
                       `• ${formatNumber(minerReward)}⭐ в час (${formatNumber(dailyMinerReward)}⭐ в день)\n` +
                       `• Окупаемость: ~45 дней\n\n` +
                       `💡 **От чего зависит курс:**\n` +
                       `• Баланс резерва биржи\n` +
                       `• Количество обменов\n` +
                       `• Комиссии с обменов\n` +
                       `• Управление администраторами\n\n` +
                       `💵 **USDT TRC-20:**\n` +
                       `• Курс: скоро\n` +
                       `• Статус: в разработке\n\n` +
                       `💎 **TON Coin:**\n` +
                       `• Курс: скоро\n` +
                       `• Статус: в разработке`;
  } catch (error) {
    console.error('❌ Ошибка генерации текста курсов:', error);
    return `🔄 **Доступные курсы:**\n\n` +
           `⚠️ **Ошибка:** Не удалось загрузить курсы обмена\n` +
           `Попробуйте позже`;
  }
}

// Функция для генерации кнопок обмена
function getExchangeButtons(magnumCoinsBalance, starsBalance) {
  console.log(`🔘 getExchangeButtons: Генерируем кнопки для баланса ${magnumCoinsBalance}🪙 и ${starsBalance}⭐`);

  const buttons = [];

  // Рассчитываем динамические курсы на основе резерва
  const magnumToStarsRate = RESERVE_STARS / RESERVE_MAGNUM_COINS;
  const starsToMagnumRate = RESERVE_MAGNUM_COINS / RESERVE_STARS;
  
  // Рассчитываем курсы с учетом комиссии
  const baseMagnumToStars = EXCHANGE_LIMITS.MIN_MAGNUM_COINS * magnumToStarsRate;
  const baseStarsToMagnum = EXCHANGE_LIMITS.MIN_STARS * starsToMagnumRate;
  const magnumToStarsWithCommission = calculateAmountWithCommission(baseMagnumToStars);
  const starsToMagnumWithCommission = calculateAmountWithCommission(baseStarsToMagnum);

    // Кнопки быстрого обмена (с уведомлениями) - 3 фиксированные суммы
  const quickBuyAmounts = [100, 1000, 10000]; // Magnum Coin для покупки звёзд
  const quickSellAmounts = [1, 10, 100]; // Звёзды для продажи
  
  // Быстрые покупки звёзд (тратим Magnum Coin, получаем звёзды)
  const buyButtons = [];
  for (const amount of quickBuyAmounts) {
    if (magnumCoinsBalance >= amount) {
      const baseStarsToReceive = amount * magnumToStarsRate;
      const starsToReceive = calculateAmountWithCommission(baseStarsToReceive);
      const buttonText = `${amount}🪙→${formatNumber(starsToReceive)}⭐`;
      console.log(`🔘 getExchangeButtons: Создаем кнопку быстрого обмена "${buttonText}" с callback_data: buy_tg_stars_${amount}`);
      buyButtons.push(Markup.button.callback(buttonText, `buy_tg_stars_${amount}`));
    }
  }
  if (buyButtons.length > 0) {
    buttons.push(buyButtons);
  } else {
    buttons.push([Markup.button.callback('❌ Недостаточно Magnum Coin', 'insufficient_funds')]);
  }

  // Быстрые продажи звёзд (тратим звёзды, получаем Magnum Coin)
  const sellButtons = [];
  for (const amount of quickSellAmounts) {
    if (starsBalance >= amount) {
      const baseCoinsToReceive = amount * starsToMagnumRate;
      const coinsToReceive = calculateAmountWithCommission(baseCoinsToReceive);
      const buttonText = `${amount}⭐→${formatNumber(coinsToReceive)}🪙`;
      console.log(`🔘 getExchangeButtons: Создаем кнопку быстрого обмена "${buttonText}" с callback_data: sell_tg_stars_${amount}`);
      sellButtons.push(Markup.button.callback(buttonText, `sell_tg_stars_${amount}`));
    }
  }
  if (sellButtons.length > 0) {
    buttons.push(sellButtons);
  } else {
    buttons.push([Markup.button.callback('❌ Недостаточно звёзд', 'insufficient_stars')]);
  }

  buttons.push(
    [Markup.button.callback('💵 Купить USDT (скоро)', 'buy_usdt'), Markup.button.callback('💎 Купить TON (скоро)', 'buy_ton')],
    [Markup.button.callback('🔙 Назад на биржу', 'exchange')]
  );

  console.log(`🔘 getExchangeButtons: Создано ${buttons.length} строк кнопок`);
  return buttons;
}

// Функция для обновления интерфейса обмена валют
async function updateExchangeInterface(ctx, userId) {
  console.log(`🔘 updateExchangeInterface: Обновляем интерфейс для пользователя ${userId}`);

  const user = await getUser(userId, ctx);
  const starsBalance = Math.round((user.stars || 0) * 100) / 100;
  const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;

  console.log(`🔘 updateExchangeInterface: Баланс ${magnumCoinsBalance}🪙 и ${starsBalance}⭐`);

  const currencyText = `💎 **ОБМЕН ВАЛЮТ** 💎\n\n` +
                      `💰 **Ваши балансы:**\n` +
                      `🪙 ${formatLargeNumber(magnumCoinsBalance)} Magnum Coin\n` +
                      `⭐ ${formatLargeNumber(starsBalance)} звёзд\n\n` +
                      `🏦 **Резерв биржи:**\n` +
                      `🪙 ${formatLargeNumber(RESERVE_MAGNUM_COINS)} Magnum Coin\n` +
                      `⭐ ${formatLargeNumber(RESERVE_STARS)} звёзд\n\n` +
                      getExchangeRatesText();

  const buttons = getExchangeButtons(magnumCoinsBalance, starsBalance);
  const keyboard = Markup.inlineKeyboard(buttons);

  console.log(`🔘 updateExchangeInterface: Отправляем обновленный интерфейс`);
  await sendMessageWithPhoto(ctx, currencyText, keyboard);
}

// Функция для замены старых блоков обновления интерфейса
function replaceOldExchangeInterface() {
  // Эта функция будет использоваться для замены старых блоков кода
  // на использование updateExchangeInterface
}

// Система статусов пользователей
const USER_STATUSES = {
  'owner': { 
    name: 'Владелец', 
    description: 'Создатель и владелец бота', 
    color: '👑',
    priority: 1
  },
  'admin': { 
    name: 'Администратор', 
    description: 'Полный доступ к управлению ботом', 
    color: '⚡',
    priority: 2
  },
  'moderator': { 
    name: 'Модератор', 
    description: 'Модерация пользователей и контента', 
    color: '🛡️',
    priority: 3
  },
  'veteran': { 
    name: 'Ветеран', 
    description: 'Долгосрочный активный участник сообщества', 
    color: '🎖️',
    priority: 4
  },
  'volunteer': { 
    name: 'Волонтер', 
    description: 'Помощник в поддержании проекта', 
    color: '🤝',
    priority: 5
  },
  'elite': { 
    name: 'Элита', 
    description: 'Эксклюзивный статус для избранных', 
    color: '⭐',
    priority: 6
  },
  'guardian': { 
    name: 'Хранитель', 
    description: 'Защитник и покровитель сообщества', 
    color: '🛡️',
    priority: 7
  },
  'vip_gold': { 
    name: 'VIP Gold', 
    description: 'Премиум статус высшего уровня', 
    color: '💎',
    priority: 8
  },
  'vip': { 
    name: 'VIP', 
    description: 'Премиум пользователь', 
    color: '💫',
    priority: 9
  },
  'verified': { 
    name: 'Верифицированный', 
    description: 'Проверенный активный пользователь', 
    color: '✅',
    priority: 10
  },
  'member': { 
    name: 'Участник', 
    description: 'Обычный участник сообщества', 
    color: '🎮',
    priority: 11
  }
};

// Система достижений
const ACHIEVEMENTS = {
  'first_hundred': { 
    name: '💰 Сотка', 
    description: 'Накопить 100 звёзд', 
    condition: 'stars', 
    requirement: 100,
    reward: 5,
    icon: '💰'
  },
  'social_butterfly': { 
    name: '🤝 Социальная бабочка', 
    description: 'Пригласить 10 друзей', 
    condition: 'invited', 
    requirement: 10,
    reward: 10,
    icon: '🤝'
  },
  'week_warrior': { 
    name: '⚡ Недельный воин', 
    description: 'Получить бонус 7 дней подряд', 
    condition: 'daily_streak', 
    requirement: 7,
    reward: 12,
    icon: '⚡'
  },
  'farm_master': { 
    name: '🌾 Мастер фарма', 
    description: 'Сфармить 1000 раз', 
    condition: 'farm_count', 
    requirement: 1000,
    reward: 10,
    icon: '🌾'
  },
  'promo_hunter': { 
    name: '🎫 Охотник за промо', 
    description: 'Активировать 15 промокодов', 
    condition: 'promo_count', 
    requirement: 15,
    reward: 15,
    icon: '🎫'
  }
};

// Система техподдержки
const TICKET_STATUSES = {
  'new': { name: '🆕 Новая', color: '🔵', emoji: '🔵' },
  'in_progress': { name: '⚙️ В работе', color: '🟡', emoji: '⚙️' },
  'resolved': { name: '✅ Решена', color: '🟢', emoji: '✅' },
  'rejected': { name: '❌ Отклонена', color: '🔴', emoji: '❌' },
  'closed': { name: '🔒 Закрыта', color: '⚫', emoji: '🔒' }
};

async function createTaskCheck(userId, username, taskId, taskTitle, photo = null) {
  const taskCheck = {
    userId: userId,
    username: username || 'Неизвестно',
    taskId: taskId,
    taskTitle: taskTitle,
    photo: photo,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    adminResponse: null
  };
  
  const result = await taskChecks.insertOne(taskCheck);
  taskCheck._id = result.insertedId;
  return taskCheck;
}

async function updateTaskCheckStatus(checkId, status, adminResponse = null) {
  const updateData = { 
    status: status, 
    updatedAt: new Date() 
  };
  
  if (adminResponse) {
    updateData.adminResponse = adminResponse;
  }
  
  await taskChecks.updateOne(
    { _id: checkId },
    { $set: updateData }
  );
}

async function sendTaskCheckToChannel(taskCheck) {
  const supportChannelId = SUPPORT_CHANNEL;
  if (!supportChannelId) return;

  const statusInfo = TASK_CHECK_STATUSES[taskCheck.status];
  
  try {
    const messageText = formatTaskCheckMessage(taskCheck);
    
    let message;
    if (taskCheck.photo) {
      message = await bot.telegram.sendPhoto(`@${supportChannelId}`, taskCheck.photo, {
        caption: messageText,
        parse_mode: 'Markdown',
        reply_markup: getTaskCheckKeyboard(taskCheck._id, taskCheck.status, taskCheck.taskId)
      });
    } else {
      message = await bot.telegram.sendMessage(`@${supportChannelId}`, messageText, {
        parse_mode: 'Markdown',
        reply_markup: getTaskCheckKeyboard(taskCheck._id, taskCheck.status, taskCheck.taskId)
      });
    }
    
    await taskChecks.updateOne(
      { _id: taskCheck._id },
      { $set: { channelMessageId: message.message_id } }
    );
  } catch (error) {
    console.error('Ошибка отправки проверки задания в канал:', error);
  }
}

function formatTaskCheckMessage(taskCheck) {
  const statusInfo = TASK_CHECK_STATUSES[taskCheck.status];
  let message = `📋 *Проверка задания #${taskCheck._id.toString().slice(-6)}*\n\n` +
    `👤 *Пользователь:* ${taskCheck.username || 'Неизвестно'} (ID: \`${taskCheck.userId}\`)\n` +
    `📝 *Задание:* ${taskCheck.taskTitle}\n` +
    `📅 *Отправлено:* ${taskCheck.createdAt.toLocaleString('ru-RU')}\n` +
    `📊 *Статус:* ${statusInfo.emoji} ${statusInfo.name}`;
  
  if (taskCheck.adminResponse) {
    message += `\n\n💬 *Ответ администратора:*\n${taskCheck.adminResponse}`;
  }
  
  if (taskCheck.updatedAt && taskCheck.updatedAt.getTime() !== taskCheck.createdAt.getTime()) {
    message += `\n🔄 *Обновлено:* ${taskCheck.updatedAt.toLocaleString('ru-RU')}`;
  }
  
  return message;
}

function getTaskCheckKeyboard(checkId, status, taskId) {
  const keyboards = {
    'pending': [
      [
        { text: '✅ Одобрить', callback_data: `task_approve_${checkId}` },
        { text: '❌ Отклонить', callback_data: `task_reject_${checkId}` }
      ],
      [
        { text: '💬 Ответить', callback_data: `task_reply_${checkId}` }
      ]
    ],
    'approved': [
      [
        { text: '❌ Отменить одобрение', callback_data: `task_reject_${checkId}` }
      ]
    ],
    'rejected': [
      [
        { text: '✅ Одобрить', callback_data: `task_approve_${checkId}` }
      ]
    ]
  };
  
  return { inline_keyboard: keyboards[status] || keyboards['pending'] };
}

async function updateTaskCheckInChannel(checkId) {
  try {
    const taskCheck = await taskChecks.findOne({ _id: checkId });
    if (!taskCheck || !taskCheck.channelMessageId) return;
    
    const messageText = formatTaskCheckMessage(taskCheck);
    const keyboard = getTaskCheckKeyboard(taskCheck._id, taskCheck.status, taskCheck.taskId);
    
    if (taskCheck.photo) {
      await bot.telegram.editMessageCaption(
        `@${SUPPORT_CHANNEL}`,
        taskCheck.channelMessageId,
        null,
        messageText,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    } else {
      await bot.telegram.editMessageText(
        `@${SUPPORT_CHANNEL}`,
        taskCheck.channelMessageId,
        null,
        messageText,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    }
  } catch (error) {
    console.error('Ошибка обновления проверки задания в канале:', error);
  }
}

async function createSupportTicket(userId, username, message) {
  const ticket = {
    userId: userId,
    username: username || 'Неизвестно',
    message: message,
    status: 'new',
    createdAt: new Date(),
    updatedAt: new Date(),
    adminResponse: null
  };
  
  const result = await supportTickets.insertOne(ticket);
  ticket._id = result.insertedId;
  return ticket;
}

async function updateTicketStatus(ticketId, status, adminResponse = null, messageId = null) {
  const updateData = { 
    status: status, 
    updatedAt: new Date() 
  };
  
  if (adminResponse) {
    updateData.adminResponse = adminResponse;
  }
  
  if (messageId) {
    updateData.channelMessageId = messageId;
  }
  
  await supportTickets.updateOne(
    { _id: ticketId },
    { $set: updateData }
  );
}

async function notifyUserStatusChange(ticketId, statusText) {
  try {
    const ticket = await supportTickets.findOne({ _id: ticketId });
    if (!ticket) return;
    
    await bot.telegram.sendMessage(ticket.userId, 
      `🎫 **Обновление заявки #${ticketId.toString().slice(-6)}**\n\n` +
      `📊 **Статус:** Ваша заявка ${statusText}\n\n` +
      `💬 **Исходное сообщение:** ${ticket.message}\n\n` +
      `📅 **Дата обновления:** ${new Date().toLocaleString('ru-RU')}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Ошибка уведомления пользователя:', error);
  }
}

async function sendTicketToChannel(ticket) {
  const supportChannelId = SUPPORT_CHANNEL;
  if (!supportChannelId) return;

  const statusInfo = TICKET_STATUSES[ticket.status];
  
  try {
    const messageText = formatTicketMessage(ticket);
    const message = await bot.telegram.sendMessage(`@${supportChannelId}`, messageText, {
      parse_mode: 'Markdown',
      reply_markup: getTicketKeyboard(ticket._id, ticket.status)
    });
    
    await updateTicketStatus(ticket._id, ticket.status, null, message.message_id);
  } catch (error) {
    console.error('Ошибка отправки в канал поддержки:', error);
  }
}

function formatTicketMessage(ticket) {
  const statusInfo = TICKET_STATUSES[ticket.status];
  let message = `🎫 *Заявка техподдержки #${ticket._id.toString().slice(-6)}*\n\n` +
    `👤 *Пользователь:* ${ticket.username || 'Неизвестно'} (ID: \`${ticket.userId}\`)\n` +
    `📝 *Сообщение:* ${ticket.message}\n` +
    `📅 *Создана:* ${ticket.createdAt.toLocaleString('ru-RU')}\n` +
    `📊 *Статус:* ${statusInfo.emoji} ${statusInfo.name}`;
  
  if (ticket.adminResponse) {
    message += `\n\n💬 *Ответ администратора:*\n${ticket.adminResponse}`;
  }
  
  if (ticket.updatedAt && ticket.updatedAt.getTime() !== ticket.createdAt.getTime()) {
    message += `\n🔄 *Обновлено:* ${ticket.updatedAt.toLocaleString('ru-RU')}`;
  }
  
  return message;
}

function getTicketKeyboard(ticketId, status) {
  const keyboards = {
    'new': [
      [
        { text: '✅ Принять', callback_data: `ticket_accept_${ticketId}` },
        { text: '❌ Отклонить', callback_data: `ticket_reject_${ticketId}` }
      ],
      [
        { text: '💬 Ответить', callback_data: `ticket_reply_${ticketId}` }
      ]
    ],
    'in_progress': [
      [
        { text: '✅ Решено', callback_data: `ticket_resolve_${ticketId}` },
        { text: '❌ Отклонить', callback_data: `ticket_reject_${ticketId}` }
      ],
      [
        { text: '💬 Ответить', callback_data: `ticket_reply_${ticketId}` },
        { text: '🔒 Закрыть', callback_data: `ticket_close_${ticketId}` }
      ]
    ],
    'resolved': [
      [
        { text: '🔒 Закрыть', callback_data: `ticket_close_${ticketId}` },
        { text: '💬 Ответить', callback_data: `ticket_reply_${ticketId}` }
      ]
    ],
    'rejected': [
      [
        { text: '🔄 Переоткрыть', callback_data: `ticket_accept_${ticketId}` }
      ]
    ],
    'closed': [
      [
        { text: '🔄 Переоткрыть', callback_data: `ticket_accept_${ticketId}` }
      ]
    ]
  };
  
  return { inline_keyboard: keyboards[status] || keyboards['new'] };
}

async function updateTicketInChannel(ticketId) {
  try {
    const ticket = await supportTickets.findOne({ _id: ticketId });
    if (!ticket || !ticket.channelMessageId) return;
    
    const messageText = formatTicketMessage(ticket);
    const keyboard = getTicketKeyboard(ticket._id, ticket.status);
    
    await bot.telegram.editMessageText(
      `@${SUPPORT_CHANNEL}`,
      ticket.channelMessageId,
      null,
      messageText,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  } catch (error) {
    console.error('Ошибка обновления сообщения в канале:', error);
  }
}

// Функции для работы с титулами
async function checkAndAwardAchievements(userId) {
  const user = await getUser(userId);
  const newAchievements = [];
  
  for (const [achievementId, achievement] of Object.entries(ACHIEVEMENTS)) {
    // Проверяем, есть ли уже это достижение
    if (user.achievements && user.achievements.includes(achievementId)) continue;
    
    let earned = false;
    
    switch (achievement.condition) {
      case 'stars':
        earned = user.stars >= achievement.requirement;
        break;
      case 'invited':
        earned = user.invited >= achievement.requirement;
        break;
      case 'daily_streak':
        earned = (user.dailyStreak || 0) >= achievement.requirement;
        break;
      case 'farm_count':
        earned = (user.farmCount || 0) >= achievement.requirement;
        break;
      case 'promo_count':
        earned = (user.promoCount || 0) >= achievement.requirement;
        break;
    }
    
    if (earned) {
      // Добавляем достижение и награду
      await users.updateOne(
        { id: userId },
        { 
          $addToSet: { achievements: achievementId },
          $inc: { magnumCoins: achievement.reward, totalEarnedMagnumCoins: achievement.reward }
        }
      );
      invalidateUserCache(userId);
      invalidateBotStatsCache();
      newAchievements.push(achievement);
    }
  }
  
  return newAchievements;
}

async function checkAndAwardTitles(userId) {
  const user = await getUser(userId);
  const userTitles = user.titles || [];
  let newTitles = [];

  for (const [titleId, title] of Object.entries(TITLES)) {
    if (userTitles.includes(titleId) || title.condition === 'secret') continue;

    let earned = false;
    switch (title.condition) {
      case 'registration':
        earned = true;
        break;
      case 'farm_count':
        earned = (user.farmCount || 0) >= title.requirement;
        break;
      case 'stars':
        earned = (user.stars || 0) >= title.requirement;
        break;
      case 'invited':
        earned = (user.invited || 0) >= title.requirement;
        break;
      case 'daily_streak':
        earned = (user.dailyStreak || 0) >= title.requirement;
        break;
      case 'bonus_count':
        earned = (user.bonusCount || 0) >= title.requirement;
        break;
      case 'promo_count':
        earned = (user.promoCount || 0) >= title.requirement;
        break;
      case 'task_count':
        earned = (user.taskCount || 0) >= title.requirement;
        break;
      case 'combined':
        earned = (user.stars || 0) >= title.requirement.stars && (user.invited || 0) >= title.requirement.invited;
        break;
    }

    if (earned) {
      newTitles.push(titleId);
    }
  }

  if (newTitles.length > 0) {
    await users.updateOne(
      { id: userId },
      { $addToSet: { titles: { $each: newTitles } } }
    );
    return newTitles;
  }
  return [];
}

function getUserMainTitle(user) {
  // Если пользователь выбрал главный титул, используем его
  if (user.selectedTitle) {
    // Проверяем кастомный титул
    if (user.selectedTitle === 'custom' && user.customTitle) {
      return `✨ ${user.customTitle}`;
    }
    // Проверяем обычные титулы
    if (TITLES[user.selectedTitle] && (user.titles || []).includes(user.selectedTitle)) {
      const title = TITLES[user.selectedTitle];
      return `${title.icon} ${title.name}`;
    }
  }
  
  // Если кастомный титул есть, показываем его по умолчанию
  if (user.customTitle) {
    return `✨ ${user.customTitle}`;
  }
  
  const userTitles = user.titles || [];
  if (userTitles.length === 0) return '🆕 Нет титула';
  
  // Приоритет: секретные > легенда > по порядку
  const titleOrder = ['vip_elite', 'early_bird', 'night_owl', 'legend', 'star_lord', 'task_warrior', 'promo_master', 'bonus_hunter', 'daily_visitor', 'inviter', 'collector', 'farmer', 'newcomer'];
  
  for (const titleId of titleOrder) {
    if (userTitles.includes(titleId)) {
      const title = TITLES[titleId];
      return `${title.icon} ${title.name}`;
    }
  }
  return '🆕 Нет титула';
}

function getUserRank(user) {
  // ИСПРАВЛЕНО: Уровни теперь считаются по звездам
  const stars = user.stars || 0;
  let currentRank = RANKS[0]; // По умолчанию Новичок
  
  for (const rank of RANKS) {
    if (stars >= rank.requirement) {
      currentRank = rank;
    } else {
      break;
    }
  }
  
  return currentRank;
}

function getNextRankInfo(user) {
  // ИСПРАВЛЕНО: Уровни теперь считаются по звездам
  const stars = user.stars || 0;
  const currentRank = getUserRank(user);
  
  // Найти следующий уровень
  const currentIndex = RANKS.findIndex(rank => rank.name === currentRank.name);
  if (currentIndex < RANKS.length - 1) {
    const nextRank = RANKS[currentIndex + 1];
    const starsToNext = nextRank.requirement - stars;
    const progress = Math.max(0, Math.min(100, (stars - currentRank.requirement) / (nextRank.requirement - currentRank.requirement) * 100));
    
    // КРИТИЧЕСКАЯ отладочная информация
    console.log(`🔥🔥🔥 РАСЧЕТ ПРОГРЕССА УРОВНЯ:`);
    console.log(`🔥 Пользователь: ${user.id}`);
    console.log(`🔥 Звезды: ${stars}`);
    console.log(`🔥 Текущий ранг: ${currentRank.name} (от ${currentRank.requirement}⭐)`);
    console.log(`🔥 Следующий ранг: ${nextRank.name} (нужно ${nextRank.requirement}⭐)`);
    console.log(`🔥 До следующего: ${starsToNext}⭐`);
    console.log(`🔥 Формула прогресса: (${stars} - ${currentRank.requirement}) / (${nextRank.requirement} - ${currentRank.requirement}) * 100`);
    console.log(`🔥 Числитель: ${stars - currentRank.requirement}`);
    console.log(`🔥 Знаменатель: ${nextRank.requirement - currentRank.requirement}`);
    console.log(`🔥 Прогресс: ${progress}% (округлено: ${Math.round(progress)}%)`);
    console.log(`🔥🔥🔥 КОНЕЦ РАСЧЕТА`);
    
    return {
      current: currentRank,
      next: nextRank,
      starsToNext: starsToNext, // Теперь это действительно звезды
      progress: Math.round(progress)
    };
  }
  
  return {
    current: currentRank,
    next: null,
    starsToNext: 0,
    progress: 100
  };
}



async function connectDB() {
  console.log('🔌 Подключаемся к MongoDB...');
  console.log('📍 MONGODB_URI:', MONGODB_URI ? 'установлен' : 'НЕ УСТАНОВЛЕН');
  console.log('💳 WITHDRAWAL_CHANNEL:', WITHDRAWAL_CHANNEL || 'НЕ УСТАНОВЛЕН');
  
  await mongo.connect();
  console.log('✅ MongoDB подключен');
  
  const db = mongo.db();
  users = db.collection('users');
  promocodes = db.collection('promocodes');
  tasks = db.collection('tasks');
  titles = db.collection('titles');
  supportTickets = db.collection('supportTickets'); // добавляем коллекцию заявок
  taskChecks = db.collection('taskChecks'); // коллекция проверок заданий
  withdrawalRequests = db.collection('withdrawalRequests'); // коллекция заявок на вывод
  reserve = db.collection('reserve'); // коллекция резерва биржи
  
  console.log('📋 Коллекции инициализированы');
  
  // Инициализируем резерв и комиссию
  await initializeReserve();
  await initializeCommission();
  
  console.log('🎯 Система вывода готова к работе');
  console.log('🏦 Резерв биржи инициализирован');
  console.log('💰 Комиссия обмена инициализирована');
}

function now() { return Math.floor(Date.now() / 1000); }

// Обновляем функцию getUser для автоматической проверки титулов
// КРИТИЧЕСКАЯ функция - ВСЕГДА из базы, НИКОГДА кеш для прогресса
async function getUserDirectFromDB(id, ctx = null) {
  console.log(`🔥 ПРЯМОЕ ЧТЕНИЕ ИЗ БД для пользователя ${id}`);
  const user = await users.findOne({ id });
  if (!user) {
    const newUser = {
      id,
      username: ctx?.from?.username || '',
      magnumCoins: 0,
      totalEarnedMagnumCoins: 0,
      stars: 100,
      lastFarm: 0,
      lastBonus: 0,
      farmCount: 0,
      bonusCount: 0,
      promoCodesUsed: 0,
      invited: 0,
      invitedBy: null,
      titles: [],
      mainTitle: null,
      purchases: [],
      customTitleRequested: false,
      achievements: [],
      dailyStreak: 0,
      lastDaily: 0,
      lastSeen: Math.floor(Date.now() / 1000),
      userStatus: 'user',
      dailyTasks: {},
      dailyFarms: 0,
      miner: { active: false }
    };
    await users.insertOne(newUser);
    return newUser;
  }
  
  // Backward compatibility
  if (user.totalEarnedMagnumCoins === undefined) {
    await users.updateOne({ id }, { $set: { totalEarnedMagnumCoins: user.magnumCoins || 0 } });
    user.totalEarnedMagnumCoins = user.magnumCoins || 0;
  }
  
  console.log(`🔥 ПОЛУЧЕНЫ СВЕЖИЕ ДАННЫЕ: ${user.stars} звёзд для пользователя ${id}`);
  return user;
}

// Функция для получения СВЕЖИХ данных пользователя БЕЗ кеша
async function getUserFresh(id, ctx = null) {
  const user = await users.findOne({ id });
  if (!user) {
    // Создаем нового пользователя если не существует
    const newUser = {
      id,
      username: ctx?.from?.username || '',
      magnumCoins: 0,
      totalEarnedMagnumCoins: 0,
      stars: 100,
      lastFarm: 0,
      lastBonus: 0,
      farmCount: 0,
      bonusCount: 0,
      promoCodesUsed: 0,
      invited: 0,
      invitedBy: null,
      titles: [],
      mainTitle: null,
      purchases: [],
      customTitleRequested: false,
      achievements: [],
      dailyStreak: 0,
      lastDaily: 0,
      lastSeen: Math.floor(Date.now() / 1000),
      userStatus: 'user',
      dailyTasks: {},
      dailyFarms: 0,
      miner: { active: false }
    };
    
    await users.insertOne(newUser);
    return newUser;
  }
  
  // Обновляем время последнего посещения
  await users.updateOne({ id }, { $set: { lastSeen: Math.floor(Date.now() / 1000) } });
  
  // Backward compatibility
  if (user.totalEarnedMagnumCoins === undefined) {
    await users.updateOne({ id }, { $set: { totalEarnedMagnumCoins: user.magnumCoins || 0 } });
    user.totalEarnedMagnumCoins = user.magnumCoins || 0;
  }
  
  return user;
}

async function getUser(id, ctx = null) {
  // Проверяем кеш
  const cacheKey = id.toString();
  const cached = userCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < USER_CACHE_TTL) {
    return cached.user;
  }

  let user = await users.findOne({ id });
  if (!user) {
    user = {
      id,
      username: ctx ? (ctx.from.username || '') : '',
      first_name: ctx ? (ctx.from.first_name || '') : '',
      stars: 0,
      magnumCoins: 0,
      totalEarnedMagnumCoins: 0, // Отслеживаем общую сумму заработанных монет
      lastFarm: 0,
      lastBonus: 0,
      created: now(),
      invited: 0,
      invitedBy: null,
      titles: [],
      achievements: [],
      farmCount: 0,
      bonusCount: 0,
      promoCount: 0,
      taskCount: 0,
      dailyStreak: 0,
      status: 'member'
    };
    await users.insertOne(user);
    await checkAndAwardTitles(id);
  } else {
    // Обратная совместимость
    if (user.magnumCoins === undefined) {
      await users.updateOne({ id }, { $set: { magnumCoins: 0 } });
      user.magnumCoins = 0;
    }
    
    if (user.totalEarnedMagnumCoins === undefined) {
      // Инициализируем как текущий баланс для существующих пользователей
      await users.updateOne({ id }, { $set: { totalEarnedMagnumCoins: user.magnumCoins || 0 } });
      user.totalEarnedMagnumCoins = user.magnumCoins || 0;
    }
    
    if (ctx) {
      const updates = {};
      if (ctx.from.username && ctx.from.username !== user.username) {
        updates.username = ctx.from.username;
      }
      if (ctx.from.first_name && ctx.from.first_name !== user.first_name) {
        updates.first_name = ctx.from.first_name;
      }
      if (Object.keys(updates).length > 0) {
        await users.updateOne({ id }, { $set: updates });
        Object.assign(user, updates);
      }
    }
  }
  
  // Обновляем кеш
  userCache.set(cacheKey, { user, timestamp: Date.now() });
  return user;
}

function isAdmin(userId) { return ADMIN_IDS.includes(String(userId)); }

// Функция проверки подписки
async function checkSubscription(ctx) {
  // Если переменные не настроены, пропускаем проверку
  if (!REQUIRED_CHANNEL || !REQUIRED_BOT_LINK) return true;
  
  try {
    // Если канал начинается с @, убираем его для API
    const channelId = REQUIRED_CHANNEL.startsWith('@') ? REQUIRED_CHANNEL : `@${REQUIRED_CHANNEL}`;
    const member = await ctx.telegram.getChatMember(channelId, ctx.from.id);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error('Ошибка проверки подписки:', error);
    return false;
  }
}

// Функция показа сообщения о подписке
async function showSubscriptionMessage(ctx) {
  if (!REQUIRED_CHANNEL || !REQUIRED_BOT_LINK) return; // Если не настроено, не показываем
  
  const message = `🔔 **Обязательная подписка**\n\n` +
                  `Для использования бота необходимо:\n\n` +
                  `1️⃣ Подписаться на канал\n` +
                  `2️⃣ Запустить бота по ссылке\n\n` +
                  `После выполнения нажмите "✅ Проверить"`;
  
  // Формируем ссылку на канал
  const channelName = REQUIRED_CHANNEL.replace('@', ''); // Убираем @ если есть
  const channelLink = `https://t.me/${channelName}`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('📢 Подписаться на канал', channelLink)],
    [Markup.button.url('🤖 Запустить бота', REQUIRED_BOT_LINK)],
    [Markup.button.callback('✅ Проверить', 'check_subscription')]
  ]);
  
  try {
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
    } else {
      await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
    }
  } catch (error) {
    console.error('Ошибка отправки сообщения о подписке:', error);
  }
}



// Функции для работы с магазином
function getShopCategories() {
  const categories = {};
  Object.entries(SHOP_ITEMS).forEach(([id, item]) => {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push({ id, ...item });
  });
  return categories;
}

function getActiveBoosts(user) {
  const now = Math.floor(Date.now() / 1000);
  const boosts = user.boosts || {};
  const active = {};
  
  Object.entries(boosts).forEach(([type, data]) => {
    if (data.expiresAt && data.expiresAt > now) {
      active[type] = data;
    }
  });
  
  return active;
}

function applyBoostMultiplier(baseReward, user, boostType) {
  const activeBoosts = getActiveBoosts(user);
  let multiplier = 1;
  
  if (activeBoosts.boost_farm && boostType === 'farm') multiplier *= 2;
  if (activeBoosts.boost_bonus && boostType === 'bonus') multiplier *= 2;
  if (activeBoosts.multiplier_stars) multiplier *= 3;
  
  return baseReward * multiplier;
}

async function purchaseItem(userId, itemId) {
  const user = await getUser(userId);
  const item = SHOP_ITEMS[itemId];
  
  if (!item) return { success: false, message: 'Товар не найден' };
  
  // Проверяем валюту покупки
  if (item.currency === 'magnumCoins') {
    if ((user.magnumCoins || 0) < item.price) return { success: false, message: 'Недостаточно Magnum Coin' };
  } else {
    if (user.stars < item.price) return { success: false, message: 'Недостаточно звёзд' };
  }
  
  const now = Math.floor(Date.now() / 1000);
  let result = { success: true, message: '' };
  
  // Записываем трату для всех покупок (кроме кастомных титулов и майнера)
  if ((item.category !== 'cosmetic' || itemId !== 'custom_title') && item.category !== 'miner') {
    const updateQuery = { 
      $push: { purchases: { itemId, price: item.price, timestamp: now, currency: item.currency || 'stars' } }
    };
    
    if (item.currency === 'magnumCoins') {
      updateQuery.$inc = { magnumCoins: -item.price };
    } else {
      updateQuery.$inc = { stars: -item.price };
    }
    
    await users.updateOne({ id: userId }, updateQuery);
    invalidateUserCache(userId);
  }

  // Обрабатываем разные типы товаров
  switch (item.category) {
    case 'boosts':
    case 'multipliers':
    case 'premium':
      // Временные бусты
      const expiresAt = now + item.duration;
      await users.updateOne(
        { id: userId },
        { $set: { [`boosts.${itemId}`]: { expiresAt, active: true } } }
      );
      result.message = `${item.icon} ${item.name} активирован!`;
      break;
      
    case 'boxes':
      // Коробки с наградами
      let reward = 0;
      if (itemId === 'lucky_box') {
        reward = calculateLuckyBoxReward('lucky');
      } else if (itemId === 'mega_box') {
        reward = calculateLuckyBoxReward('mega');
      }
      
      const profitText = reward > 0 ? ` (выигрыш: +${reward}⭐)` : ` (пустая коробка)`;
      
      await users.updateOne(
        { id: userId },
        { $inc: { stars: reward } }
      );
      result.message = `${item.icon} Получено ${reward} звёзд!${profitText}`;
      break;
      
    case 'cosmetic':
      // Косметические предметы
      if (itemId === 'custom_title') {
        // Устанавливаем состояние для кастомного титула
        userStates.set(userId, { 
          type: 'custom_title_request',
          itemId: itemId,
          price: item.price
        });
        result.message = `${item.icon} Кастомный титул готов! Заявка будет отправлена на модерацию.`;
        result.needInput = true;
      }
      break;
      
    case 'miner':
      // Проверяем, не куплен ли уже майнер
      if (user.miner && user.miner.active) {
        return { success: false, message: 'У вас уже есть активный майнер!' };
      }
      
      // Майнер - активируется и работает постоянно
      await users.updateOne(
        { id: userId },
        { 
          $inc: { magnumCoins: -item.price },
          $set: { 
            'miner.active': true,
            'miner.purchasedAt': now,
            'miner.lastReward': now,
            'miner.totalEarned': 0
          },
          $push: { purchases: { itemId, price: item.price, timestamp: now, currency: 'magnumCoins' } }
        }
      );
      result.message = `${item.icon} Майнер активирован! Начинает работать автоматически и приносить звезды каждый час.`;
      break;
  }
  
  return result;
}

// Функция для расчета награды из коробки удачи с вероятностями
function calculateLuckyBoxReward(boxType = 'lucky') {
  if (boxType === 'lucky') {
    // Обычная коробка удачи: средний выигрыш 8-12 звёзд
    const rand = Math.random() * 100;
    
    // Система вероятностей со средним выигрышем ~10 звёзд
    if (rand <= 25) return Math.floor(Math.random() * 5) + 1;   // 1-5 звёзд (25%)
    if (rand <= 45) return Math.floor(Math.random() * 5) + 6;   // 6-10 звёзд (20%)
    if (rand <= 65) return Math.floor(Math.random() * 5) + 11;  // 11-15 звёзд (20%)
    if (rand <= 80) return Math.floor(Math.random() * 5) + 16;  // 16-20 звёзд (15%)
    if (rand <= 90) return Math.floor(Math.random() * 10) + 21; // 21-30 звёзд (10%)
    if (rand <= 96) return Math.floor(Math.random() * 15) + 31; // 31-45 звёзд (6%)
    if (rand <= 99) return Math.floor(Math.random() * 25) + 46; // 46-70 звёзд (3%)
    return Math.floor(Math.random() * 30) + 71; // 71-100 звёзд (1%)
    
  } else if (boxType === 'mega') {
    // Мега коробка: средний выигрыш 60-90 звёзд
    const rand = Math.random() * 100;
    
    // Система вероятностей со средним выигрышем ~75 звёзд
    if (rand <= 20) return Math.floor(Math.random() * 15) + 20; // 20-34 звёзд (20%)
    if (rand <= 35) return Math.floor(Math.random() * 15) + 35; // 35-49 звёзд (15%)
    if (rand <= 50) return Math.floor(Math.random() * 15) + 50; // 50-64 звезды (15%)
    if (rand <= 70) return Math.floor(Math.random() * 20) + 65; // 65-84 звезды (20%)
    if (rand <= 85) return Math.floor(Math.random() * 20) + 85; // 85-104 звезды (15%)
    if (rand <= 95) return Math.floor(Math.random() * 30) + 105; // 105-134 звезды (10%)
    if (rand <= 99) return Math.floor(Math.random() * 50) + 135; // 135-184 звезды (4%)
    return Math.floor(Math.random() * 100) + 185; // 185-284 звезды (1%)
  }
  
  return 1;
}

// Функция для получения отображаемого имени пользователя
function getUserDisplayName(user, userData = null) {
  return user.username || user.first_name || `User${user.id}`;
}

// Обработка заявки на кастомный титул
async function handleFarmCooldownChange(ctx, text, userState) {
  const userId = ctx.from.id;
  
  try {
    const newCooldown = parseInt(text.trim());
    
    if (isNaN(newCooldown) || newCooldown < 0 || newCooldown > 3600) {
      await ctx.reply('❌ Неверное значение! Введите число от 0 до 3600 секунд.');
      return;
    }
    
    farmCooldownSeconds = newCooldown;
    userStates.delete(userId);
    
    await ctx.reply(`✅ Кулдаун фарма изменен на ${newCooldown} секунд!`);
    
    // Возвращаемся к настройкам фарма
    const statusText = farmCooldownEnabled ? '🟢 Включен' : '🔴 Выключен';
    const farmText = `🌾 **Настройки фарма** 🌾

⏱️ **Кулдаун фарма:** ${statusText}
🕐 **Время кулдауна:** ${farmCooldownSeconds} секунд

🎛️ **Управление:**`;

    try {
      await sendMessageWithPhoto(ctx, farmText, Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Переключить кулдаун', 'admin_farm_toggle')],
        [Markup.button.callback('⏱️ Изменить время', 'admin_farm_time')],
        [Markup.button.callback('🔙 Назад в админ-панель', 'admin_panel')]
      ]), false);
    } catch (sendError) {
      console.log('Ошибка отправки настроек фарма:', sendError.message);
      // Fallback: просто отправляем текстовое сообщение
      await ctx.reply(farmText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Переключить кулдаун', callback_data: 'admin_farm_toggle' }],
            [{ text: '⏱️ Изменить время', callback_data: 'admin_farm_time' }],
            [{ text: '🔙 Назад в админ-панель', callback_data: 'admin_panel' }]
          ]
        }
      });
    }
    
  } catch (error) {
    console.error('Ошибка изменения кулдауна фарма:', error);
    await ctx.reply('❌ Произошла ошибка при изменении кулдауна!');
    userStates.delete(userId);
  }
}

async function handleCustomTitleRequest(ctx, text, userState) {
  const userId = ctx.from.id;
  
  try {
    console.log('🏷️ Обрабатываем заявку на кастомный титул:', text);
    
    const customTitle = text.trim();
    
    if (!customTitle || customTitle.length > 20) {
      await ctx.reply('❌ Титул должен содержать от 1 до 20 символов!');
      return;
    }
    
    // Проверяем на недопустимые символы или слова
    const forbiddenWords = ['админ', 'модер', 'бот', 'официал', 'staff', 'admin', 'mod'];
    const lowerTitle = customTitle.toLowerCase();
    
    if (forbiddenWords.some(word => lowerTitle.includes(word))) {
      await ctx.reply('❌ Титул содержит недопустимые слова!');
      userStates.delete(userId);
      return;
    }
    
    // Проверяем баланс и списываем звёзды
    const user = await getUser(userId, ctx);
    const itemPrice = userState.price || 100; // Цена кастомного титула
    
    if (user.stars < itemPrice) {
      await ctx.reply(`❌ Недостаточно звёзд для покупки кастомного титула! Нужно: ${itemPrice}⭐`);
      userStates.delete(userId);
      return;
    }
    
    // Списываем звёзды и записываем покупку
    const now = Math.floor(Date.now() / 1000);
    await users.updateOne(
      { id: userId },
      { 
        $inc: { stars: -itemPrice },
        $push: { purchases: { itemId: 'custom_title', price: itemPrice, timestamp: now } }
      }
    );
    invalidateUserCache(userId);
    
    // Создаем заявку на кастомный титул (отправляем в канал поддержки)
    const ticketId = new Date().getTime().toString();
    
    const ticketData = {
      id: ticketId,
      userId: userId,
      username: user.username || '',
      firstName: user.first_name || '',
      type: 'custom_title',
      content: customTitle,
      status: 'pending',
      createdAt: now,
      price: itemPrice
    };
    
    // Сохраняем заявку в базу
    await supportTickets.insertOne(ticketData);
    
    // Отправляем в канал поддержки
    if (SUPPORT_CHANNEL) {
      const message = `🏷️ **Заявка на кастомный титул** 🏷️\n\n` +
                     `👤 **Пользователь:** ${user.first_name || user.username || `ID: ${userId}`}\n` +
                     `🆔 **ID пользователя:** ${userId}\n` +
                     `📝 **Желаемый титул:** "${customTitle}"\n` +
                     `⏰ **Время:** ${new Date().toLocaleString('ru-RU')}\n\n` +
                     `🏷️ **ID заявки:** \`${ticketId}\``;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Одобрить', `approve_title_${ticketId}`)],
        [Markup.button.callback('❌ Отклонить', `reject_title_${ticketId}`)]
      ]);
      
      try {
        await bot.telegram.sendMessage(`@${SUPPORT_CHANNEL}`, message, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      } catch (error) {
        console.error('Ошибка отправки заявки на титул в канал:', error);
      }
    }
    
    // Очищаем состояние
    userStates.delete(userId);
    
    await ctx.reply(`✅ **Заявка на кастомный титул отправлена!**\n\n` +
                    `🏷️ **Желаемый титул:** "${customTitle}"\n` +
                    `🏷️ **ID заявки:** \`${ticketId}\`\n` +
                    `⏰ **Статус:** ⏳ На рассмотрении\n\n` +
                    `Администраторы рассмотрят вашу заявку в течение 24 часов.`, 
                    { parse_mode: 'Markdown' });
    
    console.log('✅ Заявка на кастомный титул создана:', ticketId);
    
  } catch (error) {
    console.error('❌ Ошибка создания заявки на титул:', error);
    userStates.delete(userId);
    await ctx.reply('❌ Произошла ошибка при создании заявки');
  }
}

// Обработка активации промокода
async function handlePromoActivation(ctx, text, userState) {
  const userId = ctx.from.id;
  
  try {
    console.log('🎫 Активация промокода:', text);
    
    const code = text.trim().toUpperCase();
    const promo = await promocodes.findOne({ code });
    
    if (!promo) {
      await ctx.reply('❌ Промокод не найден!');
      userStates.delete(userId);
      return;
    }
    
    if (promo.used >= promo.max) {
      await ctx.reply('❌ Промокод исчерпан!');
      userStates.delete(userId);
      return;
    }
    
    const user = await getUser(userId, ctx);
    if (user.promoCodes && user.promoCodes.includes(code)) {
      await ctx.reply('❌ Вы уже использовали этот промокод!');
      userStates.delete(userId);
      return;
    }
    
    console.log('✅ Промокод валиден, тип награды:', promo.rewardType || 'legacy');
    
    // Определяем тип награды (для обратной совместимости)
    const rewardType = promo.rewardType || (promo.stars ? 'legacy' : 'unknown');
    
    let updateQuery = {
      $inc: { promoCount: 1 },
      $addToSet: { promoCodes: code }
    };
    
    let rewardText = '';
    let newBalanceText = '';
    
    if (rewardType === 'stars') {
      updateQuery.$inc.stars = promo.stars;
      rewardText = `[⭐ +${promo.stars}] звёзд получено`;
      newBalanceText = `[💎 ${Math.round((user.stars + promo.stars) * 100) / 100}] новый баланс звёзд`;
      
    } else if (rewardType === 'magnum') {
      updateQuery.$inc.magnumCoins = promo.magnumCoins;
      updateQuery.$inc.totalEarnedMagnumCoins = promo.magnumCoins;
      rewardText = `[🪙 +${promo.magnumCoins}] Magnum Coin получено`;
      newBalanceText = `[💰 ${Math.round((user.magnumCoins + promo.magnumCoins) * 100) / 100}] новый баланс MC`;
      
    } else if (rewardType === 'title') {
      updateQuery.$addToSet.titles = promo.title;
      rewardText = `[🏆 ${promo.title}] титул получен`;
      newBalanceText = `🎭 Титул добавлен в вашу коллекцию`;
      
    } else if (rewardType === 'status') {
      updateQuery.$set = updateQuery.$set || {};
      updateQuery.$set.userStatus = promo.status;
      rewardText = `[💫 ${promo.status.toUpperCase()}] статус получен`;
      newBalanceText = `👑 Ваш новый статус активирован`;
      
    } else if (rewardType === 'legacy') {
      // Обратная совместимость для старых промокодов
      updateQuery.$inc.magnumCoins = promo.stars;
      updateQuery.$inc.totalEarnedMagnumCoins = promo.stars;
      rewardText = `[🪙 +${promo.stars}] Magnum Coin получено`;
      newBalanceText = `[💰 ${Math.round((user.magnumCoins + promo.stars) * 100) / 100}] новый баланс MC`;
    }
    
    // Обновляем пользователя
    await users.updateOne({ id: userId }, updateQuery);
    invalidateUserCache(userId);
    invalidateBotStatsCache();
    
    // Обновляем промокод
    await promocodes.updateOne({ code }, { $inc: { used: 1 } });
    
    // Проверяем достижения
    await checkAndAwardAchievements(userId);
    await checkAndAwardTitles(userId);
    
    // Очищаем состояние
    userStates.delete(userId);
    
    // Получаем имя активатора для уведомлений
    const activatorName = ctx.from.first_name || ctx.from.username || `ID${userId}`;
    
    await ctx.reply(`✅ **Промокод активирован!**\n\n` +
                    `[🎫 ${code}]\n` +
                    rewardText + `\n` +
                    newBalanceText + `\n\n` +
                    `🎉 Поздравляем с успешной активацией!`, 
                    { parse_mode: 'Markdown' });
    
    // Отправляем уведомление в чат
    await notifyPromoActivationToChat(userId, activatorName, code, rewardText);
    
    console.log('✅ Промокод успешно активирован пользователем:', userId);
    
  } catch (error) {
    console.error('❌ Ошибка активации промокода:', error);
    userStates.delete(userId);
    await ctx.reply('❌ Произошла ошибка при активации промокода');
  }
}

// Обработка создания промокода
async function handlePromoCreation(ctx, text, userState) {
  const userId = ctx.from.id;
  
  try {
    console.log('🎫 Обрабатываем создание промокода:', text);
    
    const parts = text.trim().split(/\s+/);
    
    if (parts.length !== 3) {
      await ctx.reply('❌ Неверный формат! Используйте: НАЗВАНИЕ МАГНУМ_КОИНЫ ЛИМИТ\n\nПример: NEWCODE 25 100');
      return;
    }
    
    const [code, magnumCoins, maxActivations] = parts;
    const magnumCoinsNum = Number(magnumCoins);
    const maxNum = Number(maxActivations);
    
    if (!code || isNaN(magnumCoinsNum) || isNaN(maxNum) || magnumCoinsNum <= 0 || maxNum <= 0) {
      await ctx.reply('❌ Неверные данные!\n\n✅ Правильный формат:\n• НАЗВАНИЕ - любой текст\n• MAGNUM_КОИНЫ - положительное число\n• ЛИМИТ - положительное число\n\nПример: NEWCODE 25 100');
      return;
    }
    
    // Проверяем, не существует ли уже такой промокод
    const existingPromo = await promocodes.findOne({ code: code.toUpperCase() });
    if (existingPromo) {
      await ctx.reply(`❌ Промокод ${code.toUpperCase()} уже существует!`);
      userStates.delete(userId);
      return;
    }
    
    console.log('💾 Сохраняем промокод в базу:', { code: code.toUpperCase(), magnumCoins: magnumCoinsNum, max: maxNum });
    
    await promocodes.insertOne({
      code: code.toUpperCase(),
      magnumCoins: magnumCoinsNum,
      rewardType: 'magnum',
      max: maxNum,
      used: 0,
      created: now()
    });
    
    // Очищаем состояние
    userStates.delete(userId);
    
    await ctx.reply(`✅ Промокод создан успешно!\n\n` +
                    `🏷️ **Код:** \`${code.toUpperCase()}\`\n` +
                    `🪙 **Награда:** ${magnumCoinsNum} Magnum Coin\n` +
                    `🔢 **Лимит активаций:** ${maxNum}\n` +
                    `📅 **Создан:** ${new Date().toLocaleString('ru-RU')}\n\n` +
                    `📋 Пользователи могут ввести код: \`${code.toUpperCase()}\``, 
                    { parse_mode: 'Markdown' });
    
    console.log('✅ Промокод успешно создан:', code.toUpperCase());
    
  } catch (error) {
    console.error('❌ Ошибка создания промокода:', error);
    userStates.delete(userId);
    await ctx.reply('❌ Произошла ошибка при создании промокода');
  }
}

// Обработка состояний для вывода
async function handleWithdrawalState(ctx, text, userState) {
  const userId = ctx.from.id;
  
  try {
    if (userState.method === 'tg_stars' && userState.step === 'amount') {
      console.log('📊 Обрабатываем ввод суммы для Telegram Stars:', text);
      
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 100) {
        await ctx.reply('❌ Неверная сумма! Минимум для вывода: 100⭐');
        return;
      }
      
      const user = await getUser(userId, ctx);
      console.log('💰 Баланс пользователя:', user.stars, 'Запрашивает:', amount);
      
      if (user.stars < amount) {
        await ctx.reply(`❌ Недостаточно звёзд! У вас: ${Math.round(user.stars * 100) / 100}⭐`);
        userStates.delete(userId);
        return;
      }
      
      // Переходим к следующему шагу
      userStates.set(userId, { 
        type: 'withdrawal', 
        method: 'tg_stars', 
        step: 'address',
        amount: amount
      });
      
      await adminForceReply(ctx, `Введите ваш Telegram ID для получения ${amount} Telegram Stars:`);
      console.log('🔄 Переход к вводу Telegram ID');
      
    } else if (userState.method === 'tg_stars' && userState.step === 'address') {
      console.log('📋 Обрабатываем ввод Telegram ID:', text);
      
      const telegramId = text.trim();
      const amount = userState.amount;
      
      console.log('💳 Создаем заявку на сумму:', amount, 'для ID:', telegramId);
      const request = await createWithdrawalRequest(userId, 'tg_stars', amount, telegramId);
      console.log('✅ Заявка создана:', request.id);
      
      // Списываем звёзды
      await users.updateOne({ id: userId }, { $inc: { stars: -amount } });
      console.log('💸 Звёзды списаны с баланса');
      
      console.log('📤 Отправляем заявку в канал...');
      await sendWithdrawalToChannel(request);
      console.log('✅ Заявка отправлена в канал');
      
      // Очищаем состояние
      userStates.delete(userId);
      
      const confirmationMsg = await ctx.reply(`✅ **Заявка создана!**\n\n` +
                    `🏷️ **ID заявки:** \`${request.id}\`\n` +
                    `💰 **Сумма:** ${amount}⭐\n` +
                    `💸 **К получению:** ${request.netAmount}⭐\n` +
                    `⏰ **Статус:** ⏳ На рассмотрении\n\n` +
                    `Заявка отправлена администраторам. Ожидайте обработки в течение 24-48 часов.`, 
                    { parse_mode: 'Markdown' });
      
      // Сохраняем ID сообщения для удаления после одобрения
      await withdrawalRequests.updateOne(
        { id: request.id },
        { $set: { confirmationMessageId: confirmationMsg.message_id } }
      );
    }
    
  } catch (error) {
    console.error('❌ Ошибка обработки состояния вывода:', error);
    userStates.delete(userId);
    await ctx.reply('❌ Произошла ошибка при обработке заявки');
  }
}

// Функции для работы с заявками на вывод
async function createWithdrawalRequest(userId, method, amount, address) {
  const user = await getUser(userId);
  const requestId = new Date().getTime().toString();
  
  const request = {
    id: requestId,
    userId: userId,
    username: user.username || '',
    firstName: user.first_name || '',
    method: method,
    amount: amount,
    address: address,
    status: 'pending',
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
    fee: Math.round(amount * 0.05 * 100) / 100, // 5% комиссия
    netAmount: Math.round((amount - amount * 0.05) * 100) / 100
  };
  
  await withdrawalRequests.insertOne(request);
  return request;
}

async function updateWithdrawalStatus(requestId, status, adminId, reason = null) {
  const update = {
    status: status,
    updatedAt: Math.floor(Date.now() / 1000),
    processedBy: adminId
  };
  
  if (reason) {
    update.rejectionReason = reason;
  }
  
  await withdrawalRequests.updateOne(
    { id: requestId },
    { $set: update }
  );
}

async function sendWithdrawalToChannel(request) {
  console.log('sendWithdrawalToChannel вызвана для заявки:', request.id);
  console.log('WITHDRAWAL_CHANNEL:', WITHDRAWAL_CHANNEL);
  
  if (!WITHDRAWAL_CHANNEL) {
    console.log('WITHDRAWAL_CHANNEL не настроен, пропускаем отправку в канал');
    return;
  }
  
  const user = await getUser(request.userId);
  const methodNames = {
    'tg_stars': '⭐ Telegram Stars',
    'ton': '💎 TON Coin', 
    'usdt': '💵 USDT TRC-20'
  };
  
  const message = `💸 **Новая заявка на вывод** 💸\n\n` +
                  `👤 **Пользователь:** ${request.firstName || request.username || `ID: ${request.userId}`}\n` +
                  `🆔 **ID пользователя:** ${request.userId}\n` +
                  `💰 **Сумма:** ${request.amount}⭐\n` +
                  `💸 **К выводу:** ${request.netAmount}⭐ (комиссия: ${request.fee}⭐)\n` +
                  `🔄 **Метод:** ${methodNames[request.method]}\n` +
                  `📍 **Адрес/Данные:** \`${request.address}\`\n` +
                  `⏰ **Время:** ${new Date(request.createdAt * 1000).toLocaleString('ru-RU')}\n` +
                  `📊 **Статус:** ${WITHDRAWAL_STATUSES[request.status].color} ${WITHDRAWAL_STATUSES[request.status].name}\n\n` +
                  `🏷️ **ID заявки:** \`${request.id}\``;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Одобрить', `approve_withdrawal_${request.id}`)],
    [Markup.button.callback('❌ Отклонить', `reject_withdrawal_${request.id}`)],
    [Markup.button.callback('🔄 В обработку', `process_withdrawal_${request.id}`)]
  ]);
  
  console.log('Пытаемся отправить сообщение в канал @' + WITHDRAWAL_CHANNEL);
  try {
    await bot.telegram.sendMessage(`@${WITHDRAWAL_CHANNEL}`, message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    console.log('Сообщение успешно отправлено в канал');
  } catch (error) {
    console.error('Ошибка отправки заявки в канал:', error);
  }
}

async function notifyUserWithdrawalUpdate(request, isApproved, reason = null) {
  const statusText = isApproved ? 
    `✅ **Заявка одобрена!**\n\nВаш вывод ${request.netAmount}⭐ обрабатывается. Средства поступят в течение 24-48 часов.` :
    `❌ **Заявка отклонена**\n\nПричина: ${REJECTION_REASONS[reason]?.name || 'Не указана'}\n${REJECTION_REASONS[reason]?.description || ''}`;
  
  const message = `💸 **Обновление заявки на вывод** 💸\n\n` +
                  `🏷️ **ID заявки:** \`${request.id}\`\n` +
                  `💰 **Сумма:** ${request.amount}⭐\n` +
                  `🔄 **Метод:** ${request.method}\n\n` +
                  statusText;
  
  try {
    // Удаляем сообщение о создании заявки при одобрении
    if (isApproved && request.confirmationMessageId) {
      try {
        await bot.telegram.deleteMessage(request.userId, request.confirmationMessageId);
        console.log('🗑️ Удалено сообщение о создании заявки:', request.confirmationMessageId);
      } catch (deleteError) {
        console.log('⚠️ Не удалось удалить сообщение о создании заявки:', deleteError.message);
      }
    }
    
    await bot.telegram.sendMessage(request.userId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Ошибка уведомления пользователя:', error);
  }
}

// Функции для работы со статусами
function getUserStatus(user) {
  const userStatus = user.status || 'member';
  return USER_STATUSES[userStatus] ? USER_STATUSES[userStatus] : USER_STATUSES['member'];
}

function getStatusDisplayName(user) {
  const status = getUserStatus(user);
  return status.name;
}

function createProgressBar(current, total, length = 10) {
  if (total <= 0) return '░'.repeat(length); // Избегаем деления на ноль
  const filled = Math.floor((current / total) * length);
  const empty = Math.max(0, length - filled);
  return '▓'.repeat(Math.max(0, filled)) + '░'.repeat(empty);
}

async function getDetailedProfile(userId, ctx) {
  // КРИТИЧЕСКАЯ ФУНКЦИЯ - ВСЕГДА ИЗ БАЗЫ!
  const user = await getUserDirectFromDB(userId, ctx);
  console.log(`🔥 getDetailedProfile: ПРЯМО ИЗ БД - Пользователь ${userId} имеет ${user.stars} звёзд`);
  const starsBalance = Math.round((user.stars || 0) * 100) / 100;
  const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;
  const friends = user.invited || 0;
  const title = getUserMainTitle(user);
  const rank = getUserRank(user);
  const nextRankInfo = getNextRankInfo(user);
  
  // КРИТИЧЕСКАЯ ПРОВЕРКА: Пересчитываем с самыми свежими данными
  console.log(`🔥 ПРОВЕРКА РАНГА: Пользователь ${userId} имеет ${user.stars}⭐`);
  console.log(`🔥 ТЕКУЩИЙ РАНГ: ${rank.name} (требует ${rank.requirement}⭐)`);
  if (nextRankInfo.next) {
    console.log(`🔥 СЛЕДУЮЩИЙ РАНГ: ${nextRankInfo.next.name} (требует ${nextRankInfo.next.requirement}⭐)`);
    console.log(`🔥 ПРОГРЕСС: ${nextRankInfo.progress}%, до следующего: ${nextRankInfo.starsToNext}⭐`);
  }
  const status = getUserStatus(user);
  
  // Получаем имя пользователя
  const userName = ctx ? (ctx.from.first_name || ctx.from.username || 'Игрок') : 'Игрок';
  const userInfo = ctx ? `${userName} (ID: ${ctx.from.id})` : `ID: ${userId}`;
  
  let progressText = '';
  if (nextRankInfo.next && nextRankInfo.starsToNext > 0) {
    const progressBar = createProgressBar(nextRankInfo.progress, 100) + ` ${nextRankInfo.progress}%`;
    progressText = `📊 **Прогресс уровня:**  
${progressBar}
До ${nextRankInfo.next.name}: ${nextRankInfo.starsToNext} ⭐ звезд`;
  } else {
    progressText = '🏆 **Максимальный уровень достигнут!**';
  }
  
  // Проверяем статус майнера
  let minerText = '';
      if (user.miner && user.miner.active) {
      const now = Math.floor(Date.now() / 1000);
      const hoursWorking = Math.floor((now - user.miner.purchasedAt) / 3600);
      const hoursUntilReward = Math.ceil((3600 - (now - user.miner.lastReward)) / 3600);
      const currentReward = calculateMinerReward();
      minerText = `\n⛏️ **Майнер:** Активен (работает ${hoursWorking}ч, доход ${currentReward.toFixed(4)}⭐/час)`;
    }
  
  // Получаем общую статистику бота
  const botStats = await getBotStatistics();
  
  // Получаем ссылки на чат и канал
  const channelLink = REQUIRED_CHANNEL ? `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` : 'https://t.me/magnumtap';
  const chatLink = process.env.PROMO_NOTIFICATIONS_CHAT && process.env.PROMO_NOTIFICATIONS_CHAT !== 'disabled' 
    ? `https://t.me/${process.env.PROMO_NOTIFICATIONS_CHAT.replace('@', '')}` 
    : 'https://t.me/magnumtapchat';
  
  return `👑 **Профиль игрока MagnumTap** 👑

👋 **Приветствую, ${userInfo}!**

**Статус:** [${status.color} ${status.name}]  
[🪙 ${magnumCoinsBalance}] Magnum Coin  
[💎 ${starsBalance}] звёзд  
[👥 ${friends}] друзей приглашено  
**Уровень:** [${rank.color} ${rank.name}]  
**Титул:** [${title}]${minerText}

${progressText}

📊 **Статистика MagnumTap:**
[👥 ${botStats.totalUsers}] пользователей в боте  
[🪙 ${botStats.totalMagnumCoins}] Magnum Coin заработано  
[💎 ${botStats.totalStars}] звёзд заработано  
[💸 ${botStats.totalWithdrawn}] звёзд выведено  
[🛒 ${botStats.totalStarsSpent}] звёзд потрачено  
[💰 ${botStats.totalMagnumCoinsSpent}] Magnum Coin потрачено

🔗 **Полезные ссылки:**
[💬 Наш чат](${chatLink}) | [📢 Наш канал](${channelLink})`;
}

function getWelcomeText(magnumCoins, stars, invited) {
  // Получаем ссылки на чат и канал
  const channelLink = REQUIRED_CHANNEL ? `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` : 'https://t.me/magnumtap';
  const chatLink = process.env.PROMO_NOTIFICATIONS_CHAT && process.env.PROMO_NOTIFICATIONS_CHAT !== 'disabled' 
    ? `https://t.me/${process.env.PROMO_NOTIFICATIONS_CHAT.replace('@', '')}` 
    : 'https://t.me/magnumtapchat';
  
  return (
    "👋 Добро пожаловать в *MagnumTapBot*! 🌟\n\n" +
    "Ты в игре, где можно зарабатывать Magnum Coin 🪙, выполняя простые задания, приглашая друзей и собирая бонусы! 🚀\n\n" +
    "[🪙 " + magnumCoins + "] Magnum Coin\n" +
    "[💎 " + stars + "] звёзд\n" +
    "[👥 " + invited + "] друзей приглашено\n\n" +
    "Выбери действие и стань звездой MagnumTapBot! 🌟\n\n" +
    "🔗 **Полезные ссылки:**\n" +
    "[💬 Наш чат](" + chatLink + ") | [📢 Наш канал](" + channelLink + ")"
  );
}

// Задания от спонсоров (динамически заполняются из переменных)
const SPONSOR_TASKS = [
  {
    id: 'music_channel',
    title: '📱 Подписаться на канал @musice46',
    description: 'Подпишитесь на канал @musice46',
    reward: 8,
    instruction: 'Сделайте скриншот подписки на канал',
    link: 'https://t.me/musice46'
  },
  {
    id: 'firestars_bot',
    title: '🔥 Запустить бота FireStars',
    description: 'Запустите бота и получите бонус',
    reward: 10,
    instruction: 'Сделайте скриншот запуска бота',
    link: FIRESTARS_BOT_LINK
  },
  {
    id: 'farmik_bot',
    title: '⭐ Запустить бота FarmikStars',
    description: 'Запустите бота для заработка подарков',
    reward: 10,
    instruction: 'Сделайте скриншот запуска бота',
    link: FARMIK_BOT_LINK
  },
  {
    id: 'basket_game_bot',
    title: '🏀 Играть в BasketGift бота',
    description: 'Запустите бота и сыграйте в игру 3 раза',
    reward: 12,
    instruction: 'Сделайте скриншот результатов 3 игр',
    link: BASKET_BOT_LINK
  },
  {
    id: 'private_channel',
    title: '🔒 Подписаться на приватный канал',
    description: 'Подпишитесь на закрытый канал команды MagnumTap',
    reward: 15,
    instruction: 'Сделайте скриншот что вы в канале (список участников или любое сообщение)',
    link: process.env.PRIVATE_CHANNEL_LINK || 'https://t.me/+4BUF9S_rLZw3NDQ6'
  }
];

// Статусы проверки заданий
const TASK_CHECK_STATUSES = {
  'pending': { name: '⏳ На проверке', emoji: '⏳' },
  'approved': { name: '✅ Одобрено', emoji: '✅' },
  'rejected': { name: '❌ Отклонено', emoji: '❌' }
};

// Ежедневные задания
const dailyTasks = [
  { 
    id: 'login', 
    name: '👋 Ежедневный вход', 
    reward: 5, 
    description: 'Заходите в бота каждый день для получения награды',
    type: 'auto',
    icon: '👋'
  },
  { 
    id: 'farm_10', 
    name: '⚡ Активный фармер', 
    reward: 8, 
    description: 'Соберите звёзды 10 раз за день',
    type: 'farm',
    target: 10,
    icon: '⚡'
  },
  { 
    id: 'bonus', 
    name: '🎁 Ежедневный бонус', 
    reward: 12, 
    description: 'Получите ежедневный бонус звёзд',
    type: 'bonus',
    icon: '🎁'
  },
  { 
    id: 'shop_visit', 
    name: '🛒 Посетить магазин', 
    reward: 3, 
    description: 'Откройте магазин и изучите товары',
    type: 'shop',
    icon: '🛒'
  },
  { 
    id: 'top_check', 
    name: '🏆 Изучить топ', 
    reward: 3, 
    description: 'Посмотрите на лучших игроков',
    type: 'top',
    icon: '🏆'
  },
  { 
    id: 'invite_friend', 
    name: '🤝 Пригласить друга', 
    reward: 25, 
    description: 'Поделитесь рефссылкой с другом',
    type: 'invite',
    icon: '🤝'
  }
];

// Задания от спонсора
const sponsorTasks = [
  { id: 'channel1', name: 'Подписаться на @example', reward: 15, description: 'Подпишитесь на канал партнёра', url: 'https://t.me/example' },
  { id: 'website', name: 'Посетить сайт', reward: 25, description: 'Перейдите на сайт партнёра', url: 'https://example.com' }
];

async function getUserTasks(userId, isDaily = true) {
  const today = new Date().toDateString();
  let userTasks = await tasks.findOne({ 
    userId, 
    date: isDaily ? today : 'sponsor',
    type: isDaily ? 'daily' : 'sponsor'
  });
  
  if (!userTasks) {
    const taskList = isDaily ? dailyTasks : sponsorTasks;
    userTasks = {
      userId,
      date: isDaily ? today : 'sponsor',
      type: isDaily ? 'daily' : 'sponsor',
      completed: {},
      claimed: {}
    };
    taskList.forEach(task => {
      userTasks.completed[task.id] = false;
      userTasks.claimed[task.id] = false;
    });
    await tasks.insertOne(userTasks);
    
    // Сбрасываем ежедневный счетчик фармов
    if (isDaily) {
      await users.updateOne({ id: userId }, { $set: { dailyFarms: 0 } });
    }
  }
  return userTasks;
}

async function markDailyTaskCompleted(userId, taskId) {
  const today = new Date().toDateString();
  await tasks.updateOne(
    { userId, date: today, type: 'daily' },
    { $set: { [`completed.${taskId}`]: true } },
    { upsert: true }
  );
}

async function updateMainMenuBalance(ctx) {
  try {
    console.log(`🔥 ОБНОВЛЯЕМ ГЛАВНОЕ МЕНЮ - ПРЯМО ИЗ БД для пользователя ${ctx.from.id}`);
    
    // ПОЛНОЕ УДАЛЕНИЕ из кеша
    invalidateUserCache(ctx.from.id);
    invalidateBotStatsCache();
    
    // ПРЯМОЕ чтение из базы - БЕЗ кеша вообще!
    const freshUser = await getUserDirectFromDB(ctx.from.id, ctx);
    console.log(`🔥 updateMainMenuBalance: СВЕЖИЕ ДАННЫЕ ${ctx.from.id} = ${freshUser.stars} звёзд`);
    
    // Генерируем меню с АБСОЛЮТНО свежими данными
    const menu = await getMainMenu(ctx, ctx.from.id);
    await sendMainMenuWithPhoto(ctx, menu.text, menu.keyboard);
  } catch (error) {
    console.error('🔥 КРИТИЧЕСКАЯ ОШИБКА обновления главного меню:', error);
  }
}

// Функция для обновления профиля в реальном времени
async function updateProfileRealtime(ctx) {
  try {
    console.log(`🔥 ОБНОВЛЯЕМ ПРОФИЛЬ - ПРЯМО ИЗ БД для пользователя ${ctx.from.id}`);
    
    // ПОЛНОЕ удаление из кеша
    invalidateUserCache(ctx.from.id);
    invalidateBotStatsCache();
    
    // ПРЯМОЕ чтение из базы
    const freshUser = await getUserDirectFromDB(ctx.from.id, ctx);
    console.log(`🔥 updateProfileRealtime: СВЕЖИЕ ДАННЫЕ ${ctx.from.id} = ${freshUser.stars} звёзд`);
    
    const profileText = await getDetailedProfile(ctx.from.id, ctx);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🏆 Мои титулы', 'my_titles'), Markup.button.callback('🎖️ Достижения', 'achievements')],
      [Markup.button.callback('⛏️ Мои майнеры', 'my_miners'), Markup.button.callback('💸 Вывод звёзд', 'withdraw')],
      [Markup.button.callback('🤝 Пригласить друзей', 'invite'), Markup.button.callback('🛠️ Тех поддержка', 'support_menu')],
      [Markup.button.callback('❓ FAQ', 'faq'), Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);

    await sendMessageWithPhoto(ctx, profileText, keyboard);
  } catch (error) {
    console.error('Ошибка обновления профиля:', error);
  }
}

async function getMainMenu(ctx, userId) {
  console.log(`🔥 getMainMenu: Генерируем главное меню для пользователя ${userId}`);
  const adminRow = isAdmin(ctx.from.id) ? [[Markup.button.callback('⚙️ Админ-панель', 'admin_panel')]] : [];
  const profileText = await getDetailedProfile(userId, ctx);
  console.log(`🔥 getMainMenu: Получили текст профиля для главного меню`);
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🪙 Фармить Magnum Coin', 'farm'), Markup.button.callback('🎁 Бонус', 'bonus')],
    [Markup.button.callback('👤 Профиль', 'profile'), Markup.button.callback('🏆 Топ', 'top'), Markup.button.callback('🛒 Магазин', 'shop')],
    [Markup.button.callback('🎫 Промокод', 'promo')],
    [Markup.button.callback('📈 Биржа', 'exchange'), Markup.button.callback('🎯 Задания от спонсора', 'sponsor_tasks')],
    ...adminRow
  ]);
  
  return {
    text: profileText,
    keyboard: keyboard
  };
}

// Обработчик для ввода количества Magnum Coin для покупки звёзд
bot.action('buy_tg_stars_input', async (ctx) => {
  console.log('🔘 buy_tg_stars_input: Обработчик вызван');
  
  const user = await getUser(ctx.from.id, ctx);
  const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;
  
  if (magnumCoinsBalance < EXCHANGE_LIMITS.MIN_MAGNUM_COINS) {
    return ctx.answerCbQuery(`❌ Недостаточно Magnum Coin! У вас: ${magnumCoinsBalance}🪙, минимум: ${EXCHANGE_LIMITS.MIN_MAGNUM_COINS}🪙`, { show_alert: true });
  }
  
  // Устанавливаем состояние для ввода количества
  userStates.set(ctx.from.id, { type: 'buy_tg_stars_amount' });
  
  const inputText = `⭐ **ПОКУПКА TG STARS** ⭐\n\n` +
                   `💰 **Ваш баланс:** ${magnumCoinsBalance}🪙\n\n` +
                   `📝 **Введите количество Magnum Coin для обмена:**\n\n` +
                   `📊 **Лимиты:**\n` +
                   `• Минимум: ${EXCHANGE_LIMITS.MIN_MAGNUM_COINS}🪙\n` +
                   `• Максимум: ${Math.min(EXCHANGE_LIMITS.MAX_MAGNUM_COINS, magnumCoinsBalance)}🪙\n\n` +
                   `💡 **Примеры:**\n` +
                   `• 100 - обменять 100🪙\n` +
                   `• 500 - обменять 500🪙\n` +
                   `• 1000 - обменять 1000🪙`;
  
  await adminForceReply(ctx, inputText);
});

// Обработчик для ввода количества звёзд для продажи
bot.action('sell_tg_stars_input', async (ctx) => {
  console.log('🔘 sell_tg_stars_input: Обработчик вызван');
  
  const user = await getUser(ctx.from.id, ctx);
  const starsBalance = Math.round((user.stars || 0) * 100) / 100;
  
  if (starsBalance < EXCHANGE_LIMITS.MIN_STARS) {
    return ctx.answerCbQuery(`❌ Недостаточно звёзд! У вас: ${starsBalance}⭐, минимум: ${EXCHANGE_LIMITS.MIN_STARS}⭐`, { show_alert: true });
  }
  
  // Устанавливаем состояние для ввода количества
  userStates.set(ctx.from.id, { type: 'sell_tg_stars_amount' });
  
  const inputText = `🪙 **ПРОДАЖА TG STARS** 🪙\n\n` +
                   `⭐ **Ваш баланс:** ${starsBalance}⭐\n\n` +
                   `📝 **Введите количество звёзд для обмена:**\n\n` +
                   `📊 **Лимиты:**\n` +
                   `• Минимум: ${EXCHANGE_LIMITS.MIN_STARS}⭐\n` +
                   `• Максимум: ${Math.min(EXCHANGE_LIMITS.MAX_STARS, starsBalance)}⭐\n\n` +
                   `💡 **Примеры:**\n` +
                   `• 10 - продать 10⭐\n` +
                   `• 50 - продать 50⭐\n` +
                   `• 100 - продать 100⭐`;
  
  await adminForceReply(ctx, inputText);
});

// Обработчики для быстрой покупки TG Stars (3 фиксированные суммы)
bot.action('buy_tg_stars_100', async (ctx) => await handleQuickBuy(ctx, 100));
bot.action('buy_tg_stars_500', async (ctx) => await handleQuickBuy(ctx, 500));
bot.action('buy_tg_stars_1000', async (ctx) => await handleQuickBuy(ctx, 1000));

// Обработчики для быстрой продажи TG Stars (3 фиксированные суммы)
bot.action('sell_tg_stars_1', async (ctx) => await handleQuickSell(ctx, 1));
bot.action('sell_tg_stars_10', async (ctx) => await handleQuickSell(ctx, 10));
bot.action('sell_tg_stars_100', async (ctx) => await handleQuickSell(ctx, 100));

// Функция для быстрой покупки звёзд
async function handleQuickBuy(ctx, amount) {
  console.log(`🔘 handleQuickBuy: Быстрая покупка ${amount}🪙`);
  
  // Защита от спама
  const user = await getUser(ctx.from.id, ctx);
  const now = Math.floor(Date.now() / 1000);
  const lastExchange = user.lastExchange || 0;
  const timeSinceLastExchange = now - lastExchange;
  
  if (timeSinceLastExchange < 5) {
    return ctx.answerCbQuery('⏳ Подождите 5 секунд между обменами', { show_alert: true });
  }
  
  const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;
  
  if (magnumCoinsBalance < amount) {
    return ctx.answerCbQuery(`❌ Недостаточно Magnum Coin! У вас: ${magnumCoinsBalance}🪙, нужно: ${amount}🪙`, { show_alert: true });
  }
  
  // Обмениваем Magnum Coin на звёзды
  const magnumToStarsRate = RESERVE_STARS / RESERVE_MAGNUM_COINS;
  const baseStarsToReceive = amount * magnumToStarsRate;
  const commission = calculateCommission(baseStarsToReceive);
  const starsToReceive = calculateAmountWithCommission(baseStarsToReceive);
  
  if (starsToReceive <= 0) {
    return ctx.answerCbQuery('❌ Ошибка расчета курса обмена. Попробуйте позже.', { show_alert: true });
  }
  
  // Обновляем резерв
  const reserveUpdated = await updateReserve('magnumCoins', 'stars', amount, starsToReceive, commission);
  if (!reserveUpdated) {
    return ctx.answerCbQuery('❌ Недостаточно средств в резерве биржи. Попробуйте позже.', { show_alert: true });
  }
  
  // Обновляем баланс пользователя
  await users.updateOne(
    { id: ctx.from.id },
    { 
      $inc: { magnumCoins: -amount, stars: starsToReceive },
      $set: { lastExchange: now }
    }
  );
  invalidateUserCache(ctx.from.id);
  invalidateBotStatsCache();
  
  // Показываем уведомление
  const commissionText = EXCHANGE_COMMISSION > 0 ? `\n💰 Комиссия: ${formatNumber(commission)}⭐ (${EXCHANGE_COMMISSION}%)` : '';
  const notificationText = `✅ Обмен выполнен успешно!\n\n` +
                          `💰 Потрачено: ${amount}🪙\n` +
                          `⭐ Получено: ${formatNumber(starsToReceive)}⭐` +
                          `${commissionText}\n` +
                          `📊 Курс: 1🪙 = ${formatNumber(magnumToStarsRate)}⭐`;
  await ctx.answerCbQuery(notificationText, { show_alert: true });
  
  // Обновляем интерфейс
  setTimeout(async () => {
    await updateExchangeInterface(ctx, ctx.from.id);
  }, 1000);
}

// Функция для быстрой продажи звёзд
async function handleQuickSell(ctx, amount) {
  console.log(`🔘 handleQuickSell: Быстрая продажа ${amount}⭐`);
  
  // Защита от спама
  const user = await getUser(ctx.from.id, ctx);
  const now = Math.floor(Date.now() / 1000);
  const lastExchange = user.lastExchange || 0;
  const timeSinceLastExchange = now - lastExchange;
  
  if (timeSinceLastExchange < 5) {
    return ctx.answerCbQuery('⏳ Подождите 5 секунд между обменами', { show_alert: true });
  }
  
  const starsBalance = Math.round((user.stars || 0) * 100) / 100;
  
  if (starsBalance < amount) {
    return ctx.answerCbQuery(`❌ Недостаточно звёзд! У вас: ${starsBalance}⭐, нужно: ${amount}⭐`, { show_alert: true });
  }
  
  // Обмениваем звёзды на Magnum Coin
  const starsToMagnumRate = RESERVE_MAGNUM_COINS / RESERVE_STARS;
  const baseCoinsToReceive = amount * starsToMagnumRate;
  const commission = calculateCommission(baseCoinsToReceive);
  const coinsToReceive = calculateAmountWithCommission(baseCoinsToReceive);
  
  if (coinsToReceive <= 0) {
    return ctx.answerCbQuery('❌ Ошибка расчета курса обмена. Попробуйте позже.', { show_alert: true });
  }
  
  // Обновляем резерв
  const reserveUpdated = await updateReserve('stars', 'magnumCoins', amount, coinsToReceive, commission);
  if (!reserveUpdated) {
    return ctx.answerCbQuery('❌ Недостаточно средств в резерве биржи. Попробуйте позже.', { show_alert: true });
  }
  
  // Обновляем баланс пользователя
  await users.updateOne(
    { id: ctx.from.id },
    { 
      $inc: { stars: -amount, magnumCoins: coinsToReceive },
      $set: { lastExchange: now }
    }
  );
  invalidateUserCache(ctx.from.id);
  invalidateBotStatsCache();
  
  // Показываем уведомление
  const commissionText = EXCHANGE_COMMISSION > 0 ? `\n💰 Комиссия: ${formatNumber(commission)}🪙 (${EXCHANGE_COMMISSION}%)` : '';
  const notificationText = `✅ Обмен выполнен успешно!\n\n` +
                          `⭐ Потрачено: ${amount}⭐\n` +
                          `💰 Получено: ${formatNumber(coinsToReceive)}🪙` +
                          `${commissionText}\n` +
                          `📊 Курс: 1⭐ = ${formatNumber(starsToMagnumRate)}🪙`;
  await ctx.answerCbQuery(notificationText, { show_alert: true });
  
  // Обновляем интерфейс
  setTimeout(async () => {
    await updateExchangeInterface(ctx, ctx.from.id);
  }, 1000);
}

// Обработчик для покупки TG Stars (старый, оставляем для совместимости)
bot.action('buy_tg_stars', async (ctx) => {
  console.log('🔘 buy_tg_stars: Обработчик вызван');
  
  // Защита от спама - проверяем время последнего обмена
  const user = await getUser(ctx.from.id, ctx);
  const now = Math.floor(Date.now() / 1000);
  const lastExchange = user.lastExchange || 0;
  const timeSinceLastExchange = now - lastExchange;
  
  if (timeSinceLastExchange < 5) { // 5 секунд между обменами
    return ctx.answerCbQuery('⏳ Подождите 5 секунд между обменами', { show_alert: true });
  }
  
  const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;
  
  console.log(`🔘 buy_tg_stars: Баланс пользователя ${magnumCoinsBalance}🪙`);
  
  if (magnumCoinsBalance < 100) {
    console.log(`🔘 buy_tg_stars: Недостаточно средств`);
    return ctx.answerCbQuery(`❌ Недостаточно Magnum Coin! У вас: ${magnumCoinsBalance}🪙, нужно: 100🪙`, { show_alert: true });
  }
  
  // Обмениваем 100 Magnum Coin на звёзды с учетом динамического курса и комиссии
  const magnumToStarsRate = RESERVE_STARS / RESERVE_MAGNUM_COINS;
  const starsToReceive = 100 * magnumToStarsRate * (1 - EXCHANGE_COMMISSION / 100);
  console.log(`🔘 buy_tg_stars: Обмениваем 100🪙 → ${starsToReceive.toFixed(2)}⭐ (курс: ${magnumToStarsRate.toFixed(4)})`);
  
  // Проверяем достаточность резерва
  if (starsToReceive <= 0) {
    return ctx.answerCbQuery('❌ Ошибка расчета курса обмена. Попробуйте позже.', { show_alert: true });
  }
  
  // Обновляем резерв с проверкой
  const reserveUpdated = updateReserve('magnumCoins', 'stars', 100, starsToReceive);
  if (!reserveUpdated) {
    return ctx.answerCbQuery('❌ Недостаточно средств в резерве биржи. Попробуйте позже.', { show_alert: true });
  }
  
  await users.updateOne(
    { id: ctx.from.id },
    { 
      $inc: { magnumCoins: -100, stars: starsToReceive },
      $set: { lastExchange: Math.floor(Date.now() / 1000) }
    }
  );
  invalidateUserCache(ctx.from.id);
  invalidateBotStatsCache();
  
  const commissionText = EXCHANGE_COMMISSION > 0 ? `\n💰 Комиссия: ${formatNumber(100 * magnumToStarsRate * (EXCHANGE_COMMISSION / 100))}⭐ (${EXCHANGE_COMMISSION}%)` : '';
  const notificationText = `✅ Обмен выполнен успешно!\n\n` +
                          `💰 Потрачено: 100🪙\n` +
                          `⭐ Получено: ${formatNumber(starsToReceive)}⭐` +
                          `${commissionText}\n` +
                          `📊 Курс: 1🪙 = ${formatNumber(magnumToStarsRate)}⭐`;
  await ctx.answerCbQuery(notificationText, { show_alert: true });
  
  console.log(`🔘 buy_tg_stars: Обмен завершен, обновляем интерфейс`);
  
  // Обновляем интерфейс обмена валют
  setTimeout(async () => {
    await updateExchangeInterface(ctx, ctx.from.id);
  }, 1000);
});

// Команда для обновления статуса в чате
bot.command('updatechat', async (ctx) => {
  try {
    const promoChatId = process.env.PROMO_NOTIFICATIONS_CHAT;
    if (!promoChatId) {
      return ctx.reply('❌ Чат для уведомлений не настроен');
    }
    
    let targetChatId = promoChatId;
    if (promoChatId.startsWith('@')) {
      targetChatId = promoChatId.substring(1);
    }
    
    // Проверяем, что команда выполнена в нужном чате
    if (ctx.chat.id.toString() !== targetChatId && ctx.chat.username !== targetChatId) {
      return ctx.reply('❌ Эта команда работает только в чате уведомлений');
    }
    
    const userId = ctx.from.id;
    const user = await users.findOne({ id: userId });
    
    if (!user) {
      return ctx.reply('❌ Вы не зарегистрированы в боте');
    }
    
    const { statusText, titleText } = getUserChatInfo(user);
    
    let userInfo = `🔄 **Обновление информации**\n\n`;
    userInfo += `👤 **Игрок:** ${ctx.from.first_name || 'Неизвестно'}\n`;
    
    if (statusText) {
      userInfo += `💫 **Статус:** ${statusText}\n`;
    } else {
      userInfo += `💫 **Статус:** Не установлен\n`;
    }
    
    if (titleText) {
      userInfo += `🏆 **Титул:** ${titleText}\n`;
    } else {
      userInfo += `🏆 **Титул:** Не установлен\n`;
    }
    
    userInfo += `\n💡 Теперь ваши сообщения будут отображаться с этой информацией!`;
    
    await ctx.reply(userInfo, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('❌ Ошибка при обновлении информации в чате:', error);
    await ctx.reply('❌ Произошла ошибка при обновлении информации');
  }
});



bot.start(async (ctx) => {
  // Проверяем, что команда отправлена в личном чате, а не в группе
  if (ctx.chat.type !== 'private') {
    console.log(`🚫 Команда /start заблокирована в чате ${ctx.chat.type}: ${ctx.chat.title || ctx.chat.username}`);
    return; // Просто игнорируем команду в групповых чатах
  }
  
  // Обрабатываем реферальный параметр
  const startPayload = ctx.startPayload;
  let referrerId = null;
  
  if (startPayload && !isNaN(startPayload)) {
    referrerId = parseInt(startPayload);
    console.log(`🔗 Новый пользователь ${ctx.from.id} пришел по реферальной ссылке от ${referrerId}`);
  }
  
  // Проверяем подписку
  const isSubscribed = await checkSubscription(ctx);
  if (!isSubscribed) {
    await showSubscriptionMessage(ctx);
    return;
  }
  
  const user = await getUser(ctx.from.id, ctx);
  
  // Обрабатываем реферальную систему для новых пользователей
  if (referrerId && referrerId !== ctx.from.id && !user.invitedBy) {
    try {
      console.log(`💫 Обрабатываем реферал: ${ctx.from.id} приглашен ${referrerId}`);
      
      // Проверяем, существует ли реферер
      const referrer = await users.findOne({ id: referrerId });
      if (referrer) {
        // Обновляем данные нового пользователя
        await users.updateOne(
          { id: ctx.from.id },
          { $set: { invitedBy: referrerId } }
        );
        
        // Обновляем счетчик у реферера
        await users.updateOne(
          { id: referrerId },
          { $inc: { invited: 1 } }
        );
        
        invalidateUserCache(ctx.from.id);
        invalidateUserCache(referrerId);
        
        console.log(`✅ Реферал успешно засчитан: ${referrerId} → ${ctx.from.id}`);
        
        // Уведомляем реферера
        try {
          await bot.telegram.sendMessage(referrerId, 
            `🎉 **У вас новый реферал!**\n\n` +
            `👤 Пользователь: ${ctx.from.first_name || ctx.from.username || 'Пользователь'}\n` +
            `🎁 Вы получили бонус за приглашение!\n\n` +
            `📊 Всего приглашений: ${(referrer.invited || 0) + 1}`,
            { parse_mode: 'Markdown' }
          );
          console.log(`📬 Уведомление отправлено рефереру ${referrerId}`);
        } catch (notifyError) {
          console.log(`⚠️ Не удалось уведомить реферера ${referrerId}:`, notifyError.message);
        }
        
        // Проверяем и выдаем титулы
        await checkAndAwardTitles(referrerId);
        await checkAndAwardTitles(ctx.from.id);
      } else {
        console.log(`❌ Реферер ${referrerId} не найден в базе`);
      }
    } catch (error) {
      console.error('Ошибка обработки реферала:', error);
    }
  }
  
  // Автоматически отмечаем задание "ежедневный вход"
  await markDailyTaskCompleted(ctx.from.id, 'login');
  
  // Принудительно обновляем кеш для новых пользователей
  invalidateUserCache(ctx.from.id);
  invalidateBotStatsCache();
  
  const menu = await getMainMenu(ctx, ctx.from.id);
  await sendMainMenuWithPhoto(ctx, menu.text, menu.keyboard, false);
});

bot.action('check_subscription', async (ctx) => {
  const isSubscribed = await checkSubscription(ctx);
  if (!isSubscribed) {
    await ctx.answerCbQuery('❌ Подписка не найдена! Убедитесь, что вы подписались на канал и запустили бота.', { show_alert: true });
    return;
  }
  
  await ctx.answerCbQuery('✅ Подписка подтверждена!');
  const user = await getUser(ctx.from.id, ctx);
  const menu = await getMainMenu(ctx, ctx.from.id);
  await sendMainMenuWithPhoto(ctx, menu.text, menu.keyboard);
});

bot.action('main_menu', async (ctx) => {
  console.log(`🔥 КНОПКА ГЛАВНОЕ МЕНЮ - пользователь ${ctx.from.id}`);
  try { await ctx.deleteMessage(); } catch (e) {}
  
  // ПОЛНОЕ удаление из кеша
  invalidateUserCache(ctx.from.id);
  invalidateBotStatsCache();
  
  // ПРЯМОЕ чтение из базы для главного меню
  const freshUser = await getUserDirectFromDB(ctx.from.id, ctx);
  console.log(`🔥 ГЛАВНОЕ МЕНЮ: Свежие данные ${ctx.from.id} = ${freshUser.stars} звёзд`);
  
  const menu = await getMainMenu(ctx, ctx.from.id);
  await sendMainMenuWithPhoto(ctx, menu.text, menu.keyboard, false);
});

// Обновляем профиль с кнопкой техподдержки
bot.action('profile', async (ctx) => {
  console.log(`🔥 КНОПКА ПРОФИЛЬ - принудительное обновление для ${ctx.from.id}`);
  
  // ПОЛНОЕ удаление из кеша и принудительное обновление
  for (let i = 0; i < 10; i++) {
    invalidateUserCache(ctx.from.id);
    invalidateBotStatsCache();
  }
  
  // Получаем АБСОЛЮТНО свежие данные из базы
  const freshUser = await getUserDirectFromDB(ctx.from.id, ctx);
  console.log(`🔥 ПРОФИЛЬ: Свежие данные получены - ${freshUser.stars} звёзд`);
  
  await updateProfileRealtime(ctx);
});

bot.action('my_miners', async (ctx) => {
  const user = await getUserFresh(ctx.from.id);
  
  let minerText = '⛏️ **Мои майнеры** ⛏️\n\n';
  
  if (user.miner && user.miner.active) {
    const now = Math.floor(Date.now() / 1000);
    const hoursWorking = Math.floor((now - user.miner.purchasedAt) / 3600);
    const daysWorking = Math.floor(hoursWorking / 24);
    const totalEarned = user.miner.totalEarned || 0;
    const invested = 1000; // Magnum Coin
    const remaining = Math.max(0, invested - totalEarned);
    const paybackProgress = Math.min(100, Math.round((totalEarned / invested) * 100));
    
    const currentReward = calculateMinerReward();
    const dailyReward = currentReward * 24;
    const currentRate = (RESERVE_STARS / RESERVE_MAGNUM_COINS).toFixed(4);
    
    minerText += `🟢 **Майнер #1** - Активен\n`;
    minerText += `💰 Инвестиция: 1000 🪙 Magnum Coin\n`;
    minerText += `📊 Заработано: ${totalEarned.toFixed(4)} ⭐ звезд\n`;
    minerText += `⏰ Работает: ${daysWorking} дней (${hoursWorking}ч)\n`;
    minerText += `📈 Окупаемость: ${paybackProgress}%\n`;
    
    if (remaining > 0) {
      minerText += `💎 До окупаемости: ${remaining.toFixed(4)} ⭐\n`;
    } else {
      minerText += `✅ Майнер окупился! Чистая прибыль: ${(totalEarned - invested).toFixed(4)} ⭐\n`;
    }
    
    minerText += `\n⚡ Доход: ${currentReward.toFixed(4)} ⭐ в час (${dailyReward.toFixed(4)} ⭐ в день)\n`;
    minerText += `💱 Текущий курс: 1🪙 = ${currentRate}⭐`;
  } else {
    const currentReward = calculateMinerReward();
    const dailyReward = currentReward * 24;
    const currentRate = (RESERVE_STARS / RESERVE_MAGNUM_COINS).toFixed(4);
    
    minerText += `❌ У вас нет активных майнеров\n\n`;
    minerText += `💡 Купите майнер в магазине за 1000 🪙 Magnum Coin\n`;
    minerText += `📈 Доход: ${currentReward.toFixed(4)} ⭐ в час (${dailyReward.toFixed(4)} ⭐ в день)\n`;
    minerText += `💱 Текущий курс: 1🪙 = ${currentRate}⭐\n`;
    minerText += `⏰ Окупаемость: ~45 дней`;
  }

  await sendMessageWithPhoto(ctx, minerText, Markup.inlineKeyboard([
    [Markup.button.callback('🛒 Магазин', 'shop')],
    [Markup.button.callback('👤 Профиль', 'profile')]
  ]));
});

bot.action('my_titles', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const userTitles = user.titles || [];
  
  let titlesText = '🏆 **Твои титулы** 🏆\n\n';
  
  if (userTitles.length === 0 && !user.customTitle) {
    titlesText += '🆕 Пока что у тебя нет титулов.\nВыполняй задания и приглашай друзей, чтобы заработать их!';
  } else {
    // Показываем кастомный титул если есть
    if (user.customTitle) {
      const isSelected = user.selectedTitle === 'custom';
      const indicator = isSelected ? '✅' : '✨';
      titlesText += `${indicator} **${user.customTitle}** ${isSelected ? '(активен)' : ''}\n`;
      titlesText += `📝 Ваш персональный титул\n\n`;
    }
    
    // Показываем обычные титулы
    userTitles.forEach(titleId => {
      if (TITLES[titleId]) {
        const title = TITLES[titleId];
        const isSelected = user.selectedTitle === titleId;
        const indicator = isSelected ? '✅' : title.icon;
        titlesText += `${indicator} **${title.name}** ${isSelected ? '(активен)' : ''}\n`;
        titlesText += `📝 ${title.description}\n\n`;
      }
    });
  }

  const buttons = [];
  
  // Добавляем кнопку выбора титула если есть титулы
  if (userTitles.length > 0 || user.customTitle) {
    buttons.push([Markup.button.callback('✨ Выбрать главный титул', 'select_title')]);
  }
  
  buttons.push(
    [Markup.button.callback('👤 Назад к профилю', 'profile')],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  );

  await sendMessageWithPhoto(ctx, titlesText, Markup.inlineKeyboard(buttons));
});

// Выбор титула
bot.action('select_title', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const userTitles = user.titles || [];
  
  let msg = '✨ **Выбор главного титула** ✨\n\n';
  msg += 'Выберите титул, который будет отображаться в вашем профиле и топе:\n\n';
  
  const buttons = [];
  
  // Кастомный титул
  if (user.customTitle) {
    const isSelected = user.selectedTitle === 'custom';
    const text = `${isSelected ? '✅' : '✨'} ${user.customTitle} ${isSelected ? '(активен)' : ''}`;
    buttons.push([Markup.button.callback(text, `set_title_custom`)]);
  }
  
  // Обычные титулы
  userTitles.forEach(titleId => {
    if (TITLES[titleId]) {
      const title = TITLES[titleId];
      const isSelected = user.selectedTitle === titleId;
      const text = `${isSelected ? '✅' : title.icon} ${title.name} ${isSelected ? '(активен)' : ''}`;
      buttons.push([Markup.button.callback(text, `set_title_${titleId}`)]);
    }
  });
  
  // Опция "Нет титула"
  const noTitleSelected = !user.selectedTitle;
  buttons.push([Markup.button.callback(
    `${noTitleSelected ? '✅' : '🚫'} Нет титула ${noTitleSelected ? '(активен)' : ''}`, 
    'set_title_none'
  )]);
  
  buttons.push([Markup.button.callback('👤 Назад в профиль', 'profile')]);
  
  if (userTitles.length === 0 && !user.customTitle) {
    msg += '📝 У вас пока нет доступных титулов.\n\nВыполняйте задания и достижения, чтобы заработать титулы!';
  }
  
  await sendMessageWithPhoto(ctx, msg, Markup.inlineKeyboard(buttons));
});

// Установка титула
bot.action(/^set_title_(.+)$/, async (ctx) => {
  const titleAction = ctx.match[1];
  const userId = ctx.from.id;
  
  let newSelectedTitle = null;
  let successMessage = '';
  
  if (titleAction === 'custom') {
    const user = await getUser(userId);
    if (user.customTitle) {
      newSelectedTitle = 'custom';
      successMessage = `✨ Установлен кастомный титул: "${user.customTitle}"`;
    } else {
      return ctx.answerCbQuery('❌ У вас нет кастомного титула!');
    }
  } else if (titleAction === 'none') {
    newSelectedTitle = null;
    successMessage = '🚫 Титул скрыт';
  } else {
    // Проверяем что у пользователя есть этот титул
    const user = await getUser(userId);
    const userTitles = user.titles || [];
    
    if (TITLES[titleAction] && userTitles.includes(titleAction)) {
      newSelectedTitle = titleAction;
      successMessage = `🏆 Установлен титул: ${TITLES[titleAction].name}`;
    } else {
      return ctx.answerCbQuery('❌ У вас нет этого титула!');
    }
  }
  
  // Обновляем выбранный титул в базе
  await users.updateOne(
    { id: userId },
    { $set: { selectedTitle: newSelectedTitle } }
  );
  
  await ctx.answerCbQuery(successMessage);
  
  // Обновляем меню выбора титула
  setTimeout(async () => {
    const updatedUser = await getUser(userId);
    const userTitles = updatedUser.titles || [];
    
    let msg = '✨ **Выбор главного титула** ✨\n\n';
    msg += 'Выберите титул, который будет отображаться в вашем профиле и топе:\n\n';
    
    const buttons = [];
    
    // Кастомный титул
    if (updatedUser.customTitle) {
      const isSelected = updatedUser.selectedTitle === 'custom';
      const text = `${isSelected ? '✅' : '✨'} ${updatedUser.customTitle} ${isSelected ? '(активен)' : ''}`;
      buttons.push([Markup.button.callback(text, `set_title_custom`)]);
    }
    
    // Обычные титулы
    userTitles.forEach(titleId => {
      if (TITLES[titleId]) {
        const title = TITLES[titleId];
        const isSelected = updatedUser.selectedTitle === titleId;
        const text = `${isSelected ? '✅' : title.icon} ${title.name} ${isSelected ? '(активен)' : ''}`;
        buttons.push([Markup.button.callback(text, `set_title_${titleId}`)]);
      }
    });
    
    // Опция "Нет титула"
    const noTitleSelected = !updatedUser.selectedTitle;
    buttons.push([Markup.button.callback(
      `${noTitleSelected ? '✅' : '🚫'} Нет титула ${noTitleSelected ? '(активен)' : ''}`, 
      'set_title_none'
    )]);
    
    buttons.push([Markup.button.callback('👤 Назад в профиль', 'profile')]);
    
    if (userTitles.length === 0 && !updatedUser.customTitle) {
      msg += '📝 У вас пока нет доступных титулов.\n\nВыполняйте задания и достижения, чтобы заработать титулы!';
    }
    
    await sendMessageWithPhoto(ctx, msg, Markup.inlineKeyboard(buttons));
  }, 500);
});

bot.action('top', async (ctx) => {
  // Принудительно обновляем статистику
  invalidateBotStatsCache();
  
  // Отмечаем задание "изучить топ"
  await markDailyTaskCompleted(ctx.from.id, 'top_check');
  
  const topUsers = await users.find({}).sort({ stars: -1 }).limit(10).toArray();
  let msg = '🏆✨ **ТОП-10 ИГРОКОВ MAGNUMTAP** ✨🏆\n';
  msg += '═══════════════════════════════\n\n';
  
  for (let i = 0; i < topUsers.length; i++) {
    const user = topUsers[i];
    
    // Получаем имя пользователя
    const displayName = getUserDisplayName({ 
      username: user.username, 
      first_name: user.first_name, 
      id: user.id 
    }, user);
    
    const stars = Math.round((user.stars || 0) * 100) / 100;
    const magnumCoins = Math.round((user.magnumCoins || 0) * 100) / 100;
    const status = getUserStatus(user);
    const title = getUserMainTitle(user);
    const rank = getUserRank(user);
    
    // Медали и позиции
    let positionIcon = '';
    if (i === 0) {
      positionIcon = '👑';
    } else if (i === 1) {
      positionIcon = '🥈';
    } else if (i === 2) {
      positionIcon = '🥉';
    } else {
      positionIcon = `${i + 1}️⃣`;
    }
    
    msg += `${positionIcon} **${i + 1}. ${displayName}**\n`;
    msg += `   ⭐ ${stars} звёзд\n`;
    msg += `   🪙 ${magnumCoins} Magnum Coin\n`;
    msg += `   📜 Статус: ${status.color} ${status.name}\n`;
    msg += `   🏆 Уровень: ${rank.color} ${rank.name}\n`;
    msg += `   🌟 Титул: ${title}\n`;
    msg += `───────────────────────────────\n\n`;
  }
  
  if (topUsers.length === 0) {
    msg += '📭 **Пока что нет игроков в рейтинге.**\n\n';
    msg += '🎯 *Стань первым!*';
  } else {
    msg += '═══════════════════════════════\n\n';
    msg += '💡 **Совет:** Обменивайте Magnum Coin на бирже и поднимайтесь в рейтинге!';
  }
  
  const buttons = [
    [Markup.button.callback('🔄 Обновить', 'top')],
    [Markup.button.callback('📈 Биржа', 'exchange'), Markup.button.callback('🪙 Фармить', 'farm')],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ];
  
  await sendMessageWithPhoto(ctx, msg, Markup.inlineKeyboard(buttons));
});

bot.action('invite', async (ctx) => {
  // Отмечаем задание "пригласить друга"
  await markDailyTaskCompleted(ctx.from.id, 'invite_friend');
  
  const user = await getUser(ctx.from.id);
  const refLink = `https://t.me/${ctx.me}?start=${ctx.from.id}`;
  ctx.editMessageText(
    `🤝 Пригласить друзей\n\n` +
    `Отправь эту ссылку друзьям и получай звёзды за каждого, кто присоединится!\n\n` +
    `🔗 Твоя ссылка: ${refLink}\n\n` +
    `👥 Приглашено друзей: ${user.invited || 0}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('👤 Назад в профиль', 'profile')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ])
  );
});

// Вывод звёзд
bot.action('withdraw', async (ctx) => {
  const user = await getUser(ctx.from.id, ctx);
  const balance = Math.round((user.stars || 0) * 100) / 100;
  
  const message = `💸 **Вывод звёзд** 💸\n\n` +
                  `💰 **Ваш баланс:** ${balance} ⭐ звёзд\n\n` +
                  `📋 **Доступные способы вывода:**\n` +
                  `• Telegram Stars (минимум: 100⭐)\n` +
                  `• TON Coin (минимум: 500⭐)\n` +
                  `• USDT TRC-20 (минимум: 1000⭐)\n\n` +
                  `⚠️ **Комиссия:** 5% с суммы вывода\n` +
                  `⏰ **Обработка:** 24-48 часов\n\n` +
                  `💡 Для вывода выберите способ ниже:`;
  
  const keyboard = [];
  if (balance >= 100) {
    keyboard.push([Markup.button.callback('⭐ Telegram Stars (100⭐)', 'withdraw_tg_stars')]);
  }
  if (balance >= 500) {
    keyboard.push([Markup.button.callback('💎 TON Coin (500⭐)', 'withdraw_ton')]);
  }
  if (balance >= 1000) {
    keyboard.push([Markup.button.callback('💵 USDT TRC-20 (1000⭐)', 'withdraw_usdt')]);
  }
  
  if (keyboard.length === 0) {
    keyboard.push([Markup.button.callback('❌ Недостаточно звёзд', 'withdraw_info')]);
  }
  
  keyboard.push([Markup.button.callback('👤 Назад в профиль', 'profile')]);
  
  ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(keyboard)
  });
});

// Обработчики методов вывода
bot.action('withdraw_tg_stars', async (ctx) => {
  console.log('🎯 Пользователь нажал кнопку withdraw_tg_stars, ID:', ctx.from.id);
  
  // Устанавливаем состояние пользователя
  userStates.set(ctx.from.id, { 
    type: 'withdrawal', 
    method: 'tg_stars', 
    step: 'amount' 
  });
  console.log('🔄 Установлено состояние:', userStates.get(ctx.from.id));
  
  await adminForceReply(ctx, 'Введите количество звёзд для вывода в Telegram Stars (минимум 100):');
  console.log('💬 Force reply отправлен для Telegram Stars');
});

bot.action('withdraw_ton', async (ctx) => {
  await adminForceReply(ctx, 'Введите ваш TON адрес для вывода:');
});

bot.action('withdraw_usdt', async (ctx) => {
  await adminForceReply(ctx, 'Введите ваш USDT TRC-20 адрес для вывода:');
});

bot.action('withdraw_info', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const balance = Math.round((user.stars || 0) * 100) / 100;
  
  ctx.answerCbQuery(
    `У вас ${balance}⭐. Нужно: 100⭐ для Telegram Stars, 500⭐ для TON, 1000⭐ для USDT`,
    { show_alert: true }
  );
});

// Обработчики для канала выводов (только для админов)
bot.action(/^approve_withdrawal_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа!');
  }
  
  const requestId = ctx.match[1];
  console.log('✅ Админ одобряет заявку:', requestId);
  const request = await withdrawalRequests.findOne({ id: requestId });
  console.log('📋 Статус заявки:', request?.status);
  
  if (!request) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  if (request.status !== 'pending' && request.status !== 'processing') {
    return ctx.answerCbQuery('❌ Заявка уже обработана!');
  }
  
  await updateWithdrawalStatus(requestId, 'approved', ctx.from.id);
  await notifyUserWithdrawalUpdate(request, true);
  
  // Получаем исходное сообщение без добавленных статусов
  const originalMessageLines = ctx.callbackQuery.message.text.split('\n');
  const cutOffIndex = originalMessageLines.findIndex(line => 
    line.includes('**ОДОБРЕНО**') || 
    line.includes('**ОТКЛОНЕНО**') || 
    line.includes('**В ОБРАБОТКЕ**')
  );
  
  const originalMessage = cutOffIndex > -1 ? 
    originalMessageLines.slice(0, cutOffIndex).join('\n') : 
    ctx.callbackQuery.message.text;
  
  const updatedMessage = originalMessage + 
                        `\n\n✅ **ОДОБРЕНО** администратором ${ctx.from.first_name || ctx.from.username || ctx.from.id}` +
                        `\n⏰ ${new Date().toLocaleString('ru-RU')}`;
  
  // Оставляем только кнопку главного меню для одобренных заявок
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
  
  await ctx.editMessageText(updatedMessage, { parse_mode: 'Markdown', ...keyboard });
  await ctx.answerCbQuery('✅ Заявка одобрена!');
});

bot.action(/^reject_withdrawal_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа!');
  }
  
  const requestId = ctx.match[1];
  console.log('❌ Админ отклоняет заявку:', requestId);
  const request = await withdrawalRequests.findOne({ id: requestId });
  console.log('📋 Статус заявки:', request?.status);
  
  if (!request) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  if (request.status !== 'pending' && request.status !== 'processing') {
    return ctx.answerCbQuery('❌ Заявка уже обработана!');
  }
  
  // Показываем выбор причины отклонения
  const reasons = Object.entries(REJECTION_REASONS).map(([key, reason]) => 
    [Markup.button.callback(reason.name, `reject_reason_${requestId}_${key}`)]
  );
  
  const keyboard = Markup.inlineKeyboard([
    ...reasons,
    [Markup.button.callback('🔙 Назад', `back_to_withdrawal_${requestId}`)]
  ]);
  
  await ctx.editMessageText(
    `❌ **Выберите причину отклонения заявки:**\n\n` + 
    `🏷️ **ID:** \`${requestId}\`\n` +
    `👤 **Пользователь:** ${request.firstName || request.username || request.userId}\n` +
    `💰 **Сумма:** ${request.amount}⭐`,
    { parse_mode: 'Markdown', ...keyboard }
  );
});

bot.action(/^reject_reason_(.+)_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа!');
  }
  
  const requestId = ctx.match[1];
  const reason = ctx.match[2];
  
  const request = await withdrawalRequests.findOne({ id: requestId });
  if (!request) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  // Возвращаем звёзды пользователю
  await users.updateOne({ id: request.userId }, { $inc: { stars: request.amount } });
  
  await updateWithdrawalStatus(requestId, 'rejected', ctx.from.id, reason);
  await notifyUserWithdrawalUpdate(request, false, reason);
  
  const reasonInfo = REJECTION_REASONS[reason];
  
  // Получаем исходное сообщение без добавленных статусов
  const originalMessageLines = ctx.callbackQuery.message.text.split('\n');
  const cutOffIndex = originalMessageLines.findIndex(line => 
    line.includes('**ОДОБРЕНО**') || 
    line.includes('**ОТКЛОНЕНО**') || 
    line.includes('**В ОБРАБОТКЕ**') ||
    line.includes('**Выберите причину отклонения**')
  );
  
  const originalMessage = cutOffIndex > -1 ? 
    originalMessageLines.slice(0, cutOffIndex).join('\n') : 
    ctx.callbackQuery.message.text.split('\n\n❌')[0];
  
  const updatedMessage = originalMessage + 
                        `\n\n❌ **ОТКЛОНЕНО** администратором ${ctx.from.first_name || ctx.from.username || ctx.from.id}` +
                        `\n📋 **Причина:** ${reasonInfo.name}` +
                        `\n💰 **Звёзды возвращены пользователю**` +
                        `\n⏰ ${new Date().toLocaleString('ru-RU')}`;
  
  // Оставляем только кнопку главного меню для отклоненных заявок
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
  
  await ctx.editMessageText(updatedMessage, { parse_mode: 'Markdown', ...keyboard });
  await ctx.answerCbQuery(`✅ Заявка отклонена: ${reasonInfo.name}`);
});

bot.action(/^process_withdrawal_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа!');
  }
  
  const requestId = ctx.match[1];
  console.log('🔄 Админ берет заявку в обработку:', requestId);
  const request = await withdrawalRequests.findOne({ id: requestId });
  console.log('📋 Статус заявки до обработки:', request?.status);
  
  if (!request) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  await updateWithdrawalStatus(requestId, 'processing', ctx.from.id);
  
  // Получаем исходное сообщение без добавленных статусов
  const originalMessageLines = ctx.callbackQuery.message.text.split('\n');
  const cutOffIndex = originalMessageLines.findIndex(line => 
    line.includes('**ОДОБРЕНО**') || 
    line.includes('**ОТКЛОНЕНО**') || 
    line.includes('**В ОБРАБОТКЕ**')
  );
  
  const originalMessage = cutOffIndex > -1 ? 
    originalMessageLines.slice(0, cutOffIndex).join('\n') : 
    ctx.callbackQuery.message.text;
  
  const updatedMessage = originalMessage + 
                        `\n\n🔄 **В ОБРАБОТКЕ** администратором ${ctx.from.first_name || ctx.from.username || ctx.from.id}` +
                        `\n⏰ ${new Date().toLocaleString('ru-RU')}`;
  
  // Оставляем все кнопки
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Одобрить', `approve_withdrawal_${request.id}`)],
    [Markup.button.callback('❌ Отклонить', `reject_withdrawal_${request.id}`)],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
  
  await ctx.editMessageText(updatedMessage, { parse_mode: 'Markdown', ...keyboard });
  await ctx.answerCbQuery('🔄 Заявка взята в обработку!');
});

bot.action(/^back_to_withdrawal_(.+)$/, async (ctx) => {
  const requestId = ctx.match[1];
  const request = await withdrawalRequests.findOne({ id: requestId });
  
  if (!request) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  // Возвращаем исходное сообщение с кнопками
  const methodNames = {
    'tg_stars': '⭐ Telegram Stars',
    'ton': '💎 TON Coin', 
    'usdt': '💵 USDT TRC-20'
  };
  
  const message = `💸 **Новая заявка на вывод** 💸\n\n` +
                  `👤 **Пользователь:** ${request.firstName || request.username || `ID: ${request.userId}`}\n` +
                  `🆔 **ID пользователя:** ${request.userId}\n` +
                  `💰 **Сумма:** ${request.amount}⭐\n` +
                  `💸 **К выводу:** ${request.netAmount}⭐ (комиссия: ${request.fee}⭐)\n` +
                  `🔄 **Метод:** ${methodNames[request.method]}\n` +
                  `📍 **Адрес/Данные:** \`${request.address}\`\n` +
                  `⏰ **Время:** ${new Date(request.createdAt * 1000).toLocaleString('ru-RU')}\n` +
                  `📊 **Статус:** ${WITHDRAWAL_STATUSES[request.status].color} ${WITHDRAWAL_STATUSES[request.status].name}\n\n` +
                  `🏷️ **ID заявки:** \`${request.id}\``;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Одобрить', `approve_withdrawal_${request.id}`)],
    [Markup.button.callback('❌ Отклонить', `reject_withdrawal_${request.id}`)],
    [Markup.button.callback('🔄 В обработку', `process_withdrawal_${request.id}`)]
  ]);
  
  await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
});

// Обработчики кастомных титулов
bot.action(/^approve_title_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа!');
  }
  
  const ticketId = ctx.match[1];
  const ticket = await supportTickets.findOne({ id: ticketId });
  
  if (!ticket) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  // Выдаем кастомный титул пользователю
  await users.updateOne(
    { id: ticket.userId },
    { $set: { customTitle: ticket.content } }
  );
  
  // Обновляем статус заявки
  await supportTickets.updateOne(
    { id: ticketId },
    { $set: { status: 'approved', processedBy: ctx.from.id, processedAt: Math.floor(Date.now() / 1000) } }
  );
  
  // Уведомляем пользователя
  try {
    await bot.telegram.sendMessage(ticket.userId, 
      `✅ **Кастомный титул одобрен!**\n\n` +
      `🏷️ **Ваш новый титул:** "${ticket.content}"\n` +
      `🎉 Поздравляем! Титул активирован в вашем профиле.`, 
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Ошибка уведомления о титуле:', error);
  }
  
  const updatedMessage = ctx.callbackQuery.message.text + 
    `\n\n✅ **ОДОБРЕНО** администратором ${ctx.from.first_name || ctx.from.username || ctx.from.id}` +
    `\n⏰ ${new Date().toLocaleString('ru-RU')}`;
  
  await ctx.editMessageText(updatedMessage, { parse_mode: 'Markdown' });
  await ctx.answerCbQuery('✅ Кастомный титул одобрен!');
});

bot.action(/^reject_title_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа!');
  }
  
  const ticketId = ctx.match[1];
  const ticket = await supportTickets.findOne({ id: ticketId });
  
  if (!ticket) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  // Обновляем статус заявки
  await supportTickets.updateOne(
    { id: ticketId },
    { $set: { status: 'rejected', processedBy: ctx.from.id, processedAt: Math.floor(Date.now() / 1000) } }
  );
  
  // Возвращаем звёзды пользователю (стоимость кастомного титула)
  await users.updateOne(
    { id: ticket.userId },
    { $inc: { stars: 500 } } // Предполагаем что кастомный титул стоит 500 звёзд
  );
  
  // Уведомляем пользователя
  try {
    await bot.telegram.sendMessage(ticket.userId, 
      `❌ **Заявка на кастомный титул отклонена**\n\n` +
      `🏷️ **Титул:** "${ticket.content}"\n` +
      `📋 **Причина:** Не соответствует правилам сообщества\n` +
      `💰 **Возврат:** 500⭐ возвращены на ваш баланс`, 
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Ошибка уведомления об отклонении титула:', error);
  }
  
  const updatedMessage = ctx.callbackQuery.message.text + 
    `\n\n❌ **ОТКЛОНЕНО** администратором ${ctx.from.first_name || ctx.from.username || ctx.from.id}` +
    `\n💰 **Средства возвращены пользователю**` +
    `\n⏰ ${new Date().toLocaleString('ru-RU')}`;
  
  await ctx.editMessageText(updatedMessage, { parse_mode: 'Markdown' });
  await ctx.answerCbQuery('❌ Заявка на титул отклонена');
});

// Обработчик кнопки отмены
bot.action('admin_cancel', async (ctx) => {
  // Очищаем состояние пользователя
  userStates.delete(ctx.from.id);
  console.log('🗑️ Состояние пользователя очищено:', ctx.from.id);
  
  await ctx.deleteMessage();
  await ctx.answerCbQuery('❌ Операция отменена');
});



// Функция уведомления в чат о активации промокода
async function notifyPromoActivationToChat(activatorId, activatorName, code, rewardText) {
  try {
    // Проверяем, настроен ли чат для уведомлений
    let promoChatId = process.env.PROMO_NOTIFICATIONS_CHAT;
    if (!promoChatId) {
      console.log('📢 Чат для уведомлений о промокодах не настроен (PROMO_NOTIFICATIONS_CHAT)');
      return;
    }
    
    // Проверяем, не отключены ли уведомления
    if (promoChatId === 'disabled' || promoChatId === 'off') {
      console.log('📢 Уведомления о промокодах отключены');
      return;
    }

    // Проверяем, что ID чата начинается с @ (публичный чат)
    if (!promoChatId.startsWith('@')) {
      console.log(`❌ PROMO_NOTIFICATIONS_CHAT должен начинаться с @ для публичного чата`);
      console.log(`   Текущее значение: ${promoChatId}`);
      console.log(`   Пример правильного значения: @magnumtapchat`);
      return;
    }

    console.log(`📢 Отправляем уведомление о активации промокода ${code} в чат ${promoChatId}`);
    
    const notificationText = `🎫 **ПРОМОКОД АКТИВИРОВАН!** 🎫\n\n` +
                           `👤 **Игрок:** ${activatorName} (ID: ${activatorId})\n` +
                           `🏷️ **Промокод:** \`${code}\`\n` +
                           `🎁 **Награда:** ${rewardText}\n` +
                           `⏰ **Время:** ${new Date().toLocaleString('ru-RU')}\n\n` +
                           `🎉 Поздравляем с успешной активацией!`;

    await bot.telegram.sendMessage(promoChatId, notificationText, { 
      parse_mode: 'Markdown'
    });

    console.log(`📢 Уведомление о промокоде отправлено в чат ${promoChatId}`);
    
  } catch (error) {
    console.error('❌ Ошибка при отправке уведомления о промокоде в чат:', error);
    console.error('📋 Отладочная информация:');
    console.error(`   Исходное значение PROMO_NOTIFICATIONS_CHAT: "${process.env.PROMO_NOTIFICATIONS_CHAT}"`);
    
    console.error(`   ID чата: "${process.env.PROMO_NOTIFICATIONS_CHAT}"`);
    
    // Проверяем типичные ошибки и даем конкретные советы
    if (error.message.includes('chat not found')) {
      console.error('💡 Возможные причины и решения:');
      console.error('   1. Бот не добавлен в чат - добавьте бота в чат как участника');
      console.error('   2. Неправильное имя чата - убедитесь что чат публичный с username');
      console.error('   3. Проверьте правильность PROMO_NOTIFICATIONS_CHAT (должно быть @username)');
      console.error('   4. Дайте боту права администратора в чате');
    } else if (error.message.includes('CHAT_ID_INVALID')) {
      console.error('💡 Проверьте правильность PROMO_NOTIFICATIONS_CHAT:');
      console.error('   - Должно быть: @username (например: @magnumtapchat)');
      console.error('   - Убедитесь что чат публичный и имеет username');
    } else if (error.message.includes('Forbidden')) {
      console.error('💡 Бот не имеет прав для отправки сообщений в чат');
      console.error('   - Сделайте бота администратором чата');
      console.error('   - Или дайте права на отправку сообщений');
    } else if (error.message.includes('bot was kicked')) {
      console.error('💡 Бот был удален из чата!');
      console.error('   - Добавьте бота обратно в чат @magnumtapchat');
      console.error('   - Дайте боту права на отправку сообщений');
      console.error('   - Или сделайте бота администратором чата');
    }
  }
}

// Функция создания постов для канала
async function handlePostCreation(ctx, text, userState) {
  try {
    const { postType } = userState;
    const channelChatId = REQUIRED_CHANNEL ? `@${REQUIRED_CHANNEL}` : '@magnumtap';
    
    console.log(`📝 Создаем пост типа ${postType} для канала ${channelChatId}`);
    
    // Проверяем наличие фото бота
    const botPhotoUrl = process.env.BOT_PHOTO_URL;
    if (!botPhotoUrl) {
      await ctx.reply('❌ Фото бота не настроено! Добавьте переменную BOT_PHOTO_URL');
      userStates.delete(ctx.from.id);
      return;
    }
    
    console.log(`📸 Используем фото бота: ${botPhotoUrl}`);
    
    // Для обычного поста - сохраняем текст и предлагаем добавить кнопку
    if (postType === 'normal') {
      console.log(`📝 Создаем обычный пост для пользователя ${ctx.from.id}`);
      console.log(`📝 Текст поста: ${text.substring(0, 100)}...`);
      
      userStates.set(ctx.from.id, { 
        type: 'admin_post_add_button', 
        postType: 'normal',
        postText: text 
      });
      
      console.log(`💾 Состояние сохранено: ${JSON.stringify(userStates.get(ctx.from.id))}`);
      
      const previewText = `📝 **Текст поста готов!**\n\n${text.substring(0, 200)}${text.length > 200 ? '...' : ''}\n\n💡 Хотите добавить кнопку к посту?`;
      
      console.log(`📤 Отправляем предварительный просмотр с кнопками...`);
      
      await ctx.reply(previewText, { 
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔘 Добавить кнопку', 'post_add_button')],
          [Markup.button.callback('📢 Опубликовать без кнопки', 'post_publish_now')],
          [Markup.button.callback('❌ Отменить', 'admin_panel')]
        ]).reply_markup
      });
      
      console.log(`✅ Предварительный просмотр отправлен успешно`);
      
      return;
    }
    
    // Для остальных типов постов - сразу публикуем
    let keyboard = null;
    
    if (postType === 'game') {
      keyboard = Markup.inlineKeyboard([
        [Markup.button.url('🎮 Играть', `https://t.me/${ctx.botInfo.username}?start=game`)]
      ]);
    } else if (postType === 'chat') {
      keyboard = Markup.inlineKeyboard([
        [Markup.button.url('💬 Присоединиться к чату', 'https://t.me/+Poy0ZtUoux1hMTMy')]
      ]);
    } else if (postType === 'promo') {
      keyboard = Markup.inlineKeyboard([
        [Markup.button.url('🎫 Получить промокод', `https://t.me/${ctx.botInfo.username}?start=promo`)]
      ]);
    }
    
    // Публикуем пост
    await publishPostToChannel(ctx, text, keyboard, postType, channelChatId, botPhotoUrl);
    
  } catch (error) {
    console.error('❌ Ошибка создания поста:', error);
    await ctx.reply('❌ Произошла ошибка при создании поста. Попробуйте снова.');
    userStates.delete(ctx.from.id);
  }
}

// Функция публикации поста в канал
async function publishPostToChannel(ctx, postText, keyboard, postType, channelChatId, botPhotoUrl) {
  try {
    const messageOptions = {
      caption: postText,
      parse_mode: 'Markdown'
    };
    
    if (keyboard) {
      messageOptions.reply_markup = keyboard.reply_markup;
    }
    
    await bot.telegram.sendPhoto(channelChatId, botPhotoUrl, messageOptions);
    
    console.log(`✅ Пост успешно отправлен в канал ${channelChatId}`);
    
    // Отправляем подтверждение админу
    let confirmText = `✅ **Пост создан успешно!**\n\n`;
    confirmText += `📢 **Тип:** ${postType === 'normal' ? 'Обычный' : postType === 'game' ? 'Игровой' : postType === 'chat' ? 'Чат' : 'Промокод'}\n`;
    confirmText += `📝 **Текст:** ${postText.substring(0, 100)}${postText.length > 100 ? '...' : ''}\n`;
    confirmText += `📸 **Фото:** ${botPhotoUrl.substring(0, 50)}...\n`;
    
    if (keyboard) {
      confirmText += `🔘 **Кнопка:** Добавлена\n`;
    }
    
    confirmText += `\n📢 Пост опубликован в канале!`;
    
    await ctx.reply(confirmText, { parse_mode: 'Markdown' });
    
  } catch (channelError) {
    console.error('❌ Ошибка отправки в канал:', channelError);
    
    if (channelError.message.includes('chat not found')) {
      await ctx.reply('❌ Канал не найден! Проверьте переменную REQUIRED_CHANNEL');
    } else if (channelError.message.includes('Forbidden')) {
      await ctx.reply('❌ Бот не имеет прав для отправки в канал! Добавьте бота как администратора');
    } else if (channelError.message.includes('wrong file identifier')) {
      await ctx.reply('❌ Ошибка с фото бота! Проверьте переменную BOT_PHOTO_URL - должна быть прямая ссылка на изображение');
    } else {
      await ctx.reply(`❌ Ошибка отправки в канал: ${channelError.message}`);
    }
  }
  
  userStates.delete(ctx.from.id);
}

// Функция обработки ввода кнопки для поста
async function handlePostButtonInput(ctx, text, userState) {
  try {
    const { postText } = userState;
    
    // Парсим данные кнопки
    const buttonMatch = text.match(/^(.+?):(.+)$/);
    if (!buttonMatch) {
      await ctx.reply('❌ Неверный формат! Используйте: ТЕКСТ_КНОПКИ:ССЫЛКА\n\n⚠️ **Важно:** Не добавляйте пробелы перед ссылкой!\n\nПример: 🎮 Играть:https://t.me/bot?start=game');
      return;
    }
    
    const [, buttonText, buttonUrl] = buttonMatch;
    
    // Очищаем URL от лишних пробелов
    const cleanButtonUrl = buttonUrl.trim();
    
    // Проверяем валидность URL
    if (!cleanButtonUrl.startsWith('http://') && !cleanButtonUrl.startsWith('https://') && !cleanButtonUrl.startsWith('tg://')) {
      await ctx.reply('❌ Неверный формат ссылки! Ссылка должна начинаться с http://, https:// или tg://\n\nПример: https://t.me/+Poy0ZtUoux1hMTMy');
      return;
    }
    
    console.log(`🔘 Создаем кнопку: "${buttonText}" → ${cleanButtonUrl}`);
    
    // Создаем клавиатуру
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url(buttonText, cleanButtonUrl)]
    ]);
    
    const channelChatId = REQUIRED_CHANNEL ? `@${REQUIRED_CHANNEL}` : '@magnumtap';
    const botPhotoUrl = process.env.BOT_PHOTO_URL;
    
    if (!botPhotoUrl) {
      await ctx.reply('❌ Фото бота не настроено! Добавьте переменную BOT_PHOTO_URL');
      userStates.delete(ctx.from.id);
      return;
    }
    
    // Публикуем пост с кнопкой
    await publishPostToChannel(ctx, postText, keyboard, 'normal', channelChatId, botPhotoUrl);
    
  } catch (error) {
    console.error('❌ Ошибка добавления кнопки к посту:', error);
    await ctx.reply('❌ Произошла ошибка при добавлении кнопки. Попробуйте снова.');
    userStates.delete(ctx.from.id);
  }
}

// Функция обработки создания промокодов
async function handlePromoCodeCreation(ctx, text, userState) {
  try {
    const { rewardType } = userState;
    
    if (rewardType === 'title') {
      // Для титулов парсим с учетом кавычек
      const match = text.trim().match(/^(\S+)\s+"([^"]+)"\s+(\d+)$/);
      if (!match) {
        return ctx.reply('❌ Неверный формат! Используйте: НАЗВАНИЕ "ТИТУЛ" ЛИМИТ\n\nПример: HERO "Герой дня" 20');
      }
      
      const [, code, title, maxActivations] = match;
      const maxNum = Number(maxActivations);
      
      if (!code || !title || isNaN(maxNum) || maxNum <= 0) {
        return ctx.reply('❌ Неверные данные! Проверьте формат.');
      }
      
      const existingPromo = await promocodes.findOne({ code: code.toUpperCase() });
      if (existingPromo) {
        return ctx.reply(`❌ Промокод ${code.toUpperCase()} уже существует!`);
      }
      
      await promocodes.insertOne({
        code: code.toUpperCase(),
        rewardType: 'title',
        title: title,
        max: maxNum,
        used: 0,
        created: now()
      });
      
      ctx.reply(`✅ Промокод создан успешно!\n\n` +
                `🏷️ **Код:** ${code.toUpperCase()}\n` +
                `🏆 **Награда:** Титул "${title}"\n` +
                `🔢 **Лимит активаций:** ${maxNum}\n` +
                `📅 **Создан:** ${new Date().toLocaleString('ru-RU')}`, 
                { parse_mode: 'Markdown' });
                
    } else {
      // Для остальных типов стандартный парсинг
      const parts = text.trim().split(/\s+/);
      
      if (parts.length !== 3) {
        return ctx.reply('❌ Неверный формат! Используйте: НАЗВАНИЕ КОЛИЧЕСТВО/СТАТУС ЛИМИТ');
      }
      
      const [code, reward, maxActivations] = parts;
      const maxNum = Number(maxActivations);
      
      if (!code || isNaN(maxNum) || maxNum <= 0) {
        return ctx.reply('❌ Неверные данные! Проверьте формат.');
      }
      
      const existingPromo = await promocodes.findOne({ code: code.toUpperCase() });
      if (existingPromo) {
        return ctx.reply(`❌ Промокод ${code.toUpperCase()} уже существует!`);
      }
      
      let promoData = {
        code: code.toUpperCase(),
        rewardType: rewardType,
        max: maxNum,
        used: 0,
        created: now()
      };
      
      let rewardText = '';
      
      if (rewardType === 'stars') {
        const starsNum = Number(reward);
        if (isNaN(starsNum) || starsNum <= 0) {
          return ctx.reply('❌ Количество звёзд должно быть положительным числом!');
        }
        promoData.stars = starsNum;
        rewardText = `⭐ **Награда:** ${starsNum} звёзд`;
        
      } else if (rewardType === 'magnum') {
        const magnumNum = Number(reward);
        if (isNaN(magnumNum) || magnumNum <= 0) {
          return ctx.reply('❌ Количество Magnum Coin должно быть положительным числом!');
        }
        promoData.magnumCoins = magnumNum;
        rewardText = `🪙 **Награда:** ${magnumNum} Magnum Coin`;
        
      } else if (rewardType === 'status') {
        const validStatuses = ['vip', 'moderator', 'elite'];
        if (!validStatuses.includes(reward.toLowerCase())) {
          return ctx.reply(`❌ Неверный статус! Доступные: ${validStatuses.join(', ')}`);
        }
        promoData.status = reward.toLowerCase();
        rewardText = `💫 **Награда:** Статус "${reward.toUpperCase()}"`;
      }
      
      await promocodes.insertOne(promoData);
      
      ctx.reply(`✅ Промокод создан успешно!\n\n` +
                `🏷️ **Код:** ${code.toUpperCase()}\n` +
                rewardText + `\n` +
                `🔢 **Лимит активаций:** ${maxNum}\n` +
                `📅 **Создан:** ${new Date().toLocaleString('ru-RU')}`, 
                { parse_mode: 'Markdown' });
    }
    
    userStates.delete(ctx.from.id);
    
  } catch (error) {
    console.error('Ошибка создания промокода:', error);
    ctx.reply('❌ Произошла ошибка при создании промокода. Попробуйте снова.');
    userStates.delete(ctx.from.id);
  }
}

// Магазин
bot.action('shop', async (ctx) => {
  const user = await getUserDirectFromDB(ctx.from.id);
  
  // Отмечаем задание "посетить магазин"
  await markDailyTaskCompleted(ctx.from.id, 'shop_visit');
  
  const activeBoosts = getActiveBoosts(user);
  const categories = getShopCategories();
  
  let boostInfo = '';
  if (Object.keys(activeBoosts).length > 0) {
    boostInfo = '\n🔥 **Активные бусты:**\n';
    Object.entries(activeBoosts).forEach(([type, data]) => {
      const item = SHOP_ITEMS[type];
      if (item) {
        const timeLeft = data.expiresAt - Math.floor(Date.now() / 1000);
        const hours = Math.floor(timeLeft / 3600);
        const minutes = Math.floor((timeLeft % 3600) / 60);
        boostInfo += `${item.icon} ${item.name} — `;
        if (hours > 0) boostInfo += `${hours}ч `;
        boostInfo += `${minutes}мин\n`;
      }
    });
    boostInfo += '\n';
  }
  
  const message = `🛒 **Магазин MagnumTap** 🛒\n\n` +
                  `💰 **Ваш баланс:** ${Math.round((user.stars || 0) * 100) / 100} ⭐ звёзд\n` +
                  boostInfo +
                  `🏪 **Выберите категорию товаров:**`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⚡ Бусты и множители', 'shop_boosts')],
    [Markup.button.callback('🎲 Коробки удачи', 'shop_boxes')],
    [Markup.button.callback('⛏️ Майнеры', 'shop_miner')],
    [Markup.button.callback('🌈 Косметика', 'shop_cosmetic')],
    [Markup.button.callback('👑 Премиум', 'shop_premium')],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
  
  await sendMessageWithPhoto(ctx, message, keyboard);
});

// Категории магазина
bot.action(/^shop_(.+)$/, async (ctx) => {
  const category = ctx.match[1];
  const user = await getUserDirectFromDB(ctx.from.id);
  
  const categoryNames = {
    'boosts': '⚡ Бусты и множители',
    'boxes': '🎲 Коробки удачи', 
    'miner': '⛏️ Майнеры',
    'cosmetic': '🌈 Косметика',
    'premium': '👑 Премиум товары'
  };
  
  let items = [];
  Object.entries(SHOP_ITEMS).forEach(([id, item]) => {
    if ((category === 'boosts' && ['boosts', 'multipliers'].includes(item.category)) ||
        (category === 'boxes' && item.category === 'boxes') ||
        (category === 'miner' && item.category === 'miner') ||
        (category === 'cosmetic' && item.category === 'cosmetic') ||
        (category === 'premium' && item.category === 'premium')) {
      items.push({ id, ...item });
    }
  });
  
  let message = `${categoryNames[category]} 🛒\n\n`;
  
  // Показываем соответствующий баланс для категории
  if (category === 'miner') {
    message += `💰 **Баланс:** ${Math.round((user.magnumCoins || 0) * 100) / 100} 🪙 Magnum Coin\n\n`;
  } else {
    message += `💰 **Баланс:** ${Math.round((user.stars || 0) * 100) / 100} ⭐ звёзд\n\n`;
  }
  
  items.forEach(item => {
    let canAfford, priceText;
    
    if (item.currency === 'magnumCoins') {
      canAfford = (user.magnumCoins || 0) >= item.price ? '✅' : '❌';
      priceText = `${item.price} 🪙 Magnum Coin`;
    } else {
      canAfford = user.stars >= item.price ? '✅' : '❌';
      priceText = `${item.price} ⭐ звёзд`;
    }
    
    message += `${canAfford} **${item.name}**\n`;
    message += `   ${item.description}\n`;
    message += `   💰 Цена: ${priceText}\n\n`;
  });
  
  const keyboard = [];
  items.forEach(item => {
    const priceIcon = item.currency === 'magnumCoins' ? '🪙' : '⭐';
    keyboard.push([Markup.button.callback(
      `${item.icon} ${item.name} — ${item.price}${priceIcon}`, 
      `buy_${item.id}`
    )]);
  });
  keyboard.push([Markup.button.callback('🔙 Назад в магазин', 'shop')]);
  
  await sendMessageWithPhoto(ctx, message, Markup.inlineKeyboard(keyboard));
});

// Покупка товара
bot.action(/^buy_(.+)$/, async (ctx) => {
  const itemId = ctx.match[1];
  const item = SHOP_ITEMS[itemId];
  
  if (!item) {
    await ctx.answerCbQuery('❌ Товар не найден!');
    return;
  }
  
  const user = await getUserDirectFromDB(ctx.from.id);
  
  // Проверяем валюту для покупки
  if (item.currency === 'magnumCoins') {
    if ((user.magnumCoins || 0) < item.price) {
      await ctx.answerCbQuery('❌ Недостаточно Magnum Coin для покупки!', { show_alert: true });
      return;
    }
  } else {
    if (user.stars < item.price) {
      await ctx.answerCbQuery('❌ Недостаточно звёзд для покупки!', { show_alert: true });
      return;
    }
  }
  
  const result = await purchaseItem(ctx.from.id, itemId);
  
  if (result.success) {
    await ctx.answerCbQuery(`✅ ${result.message}`, { show_alert: true });
    
    if (result.needInput) {
      // Для кастомного титула запрашиваем ввод
      await adminForceReply(ctx, `🏷️ Введите желаемый титул (максимум 20 символов):`);
      return;
    }
    
    // Обновляем отображение магазина
    setTimeout(async () => {
      await sendMessageWithPhoto(ctx, '🛒 Покупка завершена! Возвращаемся в магазин...', 
        Markup.inlineKeyboard([[Markup.button.callback('🛒 Открыть магазин', 'shop')]]));
    }, 1000);
  } else {
    await ctx.answerCbQuery(`❌ ${result.message}`, { show_alert: true });
  }
});

// Промокоды (минималистично, если не нужны — удалить этот блок)
const promoCodes = { 'MAGNUM10': 10, 'STAR50': 50 };
const userPromoUsed = {};
bot.action('promo', async (ctx) => {
  // Проверяем подписку
  const isSubscribed = await checkSubscription(ctx);
  if (!isSubscribed) {
    await showSubscriptionMessage(ctx);
    return;
  }
  
  // Устанавливаем состояние для активации промокода
  userStates.set(ctx.from.id, { 
    type: 'activate_promo' 
  });
  
  await adminForceReply(ctx, '🎫 Введите промокод:');
});

// Обработчик фото для заданий
bot.on('photo', async (ctx) => {
  try {
    const replyToMessage = ctx.message.reply_to_message;
    if (!replyToMessage) return;
    
    const replyText = replyToMessage.text || '';
    
    // Отправка скриншота для проверки задания
    if (replyText.includes('Подтверждение выполнения задания')) {
             console.log('Обрабатываем скриншот. Текст сообщения:', replyText);
       
       // Ищем ID задания в тексте
       const taskIdMatch = replyText.match(/🆔 ID задания: (\w+)/);
       
       console.log('Найденный ID задания:', taskIdMatch);
       
       if (!taskIdMatch) {
         console.log('Не удалось найти ID задания в тексте:', replyText);
         return ctx.reply('❌ Не удалось определить задание. Попробуйте начать заново.');
       }
       
       const taskId = taskIdMatch[1];
       console.log('Ищем задание с ID:', taskId);
       
       const task = SPONSOR_TASKS.find(t => {
         console.log('Сравниваем с ID:', t.id);
         return t.id === taskId;
       });
      
      if (!task) {
        return ctx.reply('❌ Задание не найдено');
      }
      
      // Получаем фото
      const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      
      // Создаем проверку задания
      const taskCheck = await createTaskCheck(
        ctx.from.id,
        ctx.from.username,
        task.id,
        task.title,
        photo
      );
      
      // Отправляем в канал поддержки
      await sendTaskCheckToChannel(taskCheck);
      
      ctx.reply(
        `✅ *Задание отправлено на проверку!*\n\n` +
        `📋 *Задание:* ${task.title}\n` +
        `🎫 *ID проверки:* \`${taskCheck._id.toString().slice(-6)}\`\n` +
        `📅 *Дата:* ${new Date().toLocaleString('ru-RU')}\n\n` +
        `⏳ Ожидайте результата проверки администратором в течение 24 часов.`,
        { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 Задания спонсоров', 'sponsor_tasks')],
            [Markup.button.callback('🏠 Главное меню', 'main_menu')]
          ])
        }
      );
      return;
    }
  } catch (error) {
    console.error('Ошибка обработки фото:', error);
    ctx.reply('❌ Произошла ошибка при отправке скриншота. Попробуйте еще раз.');
  }
});

// Обработка новых участников чата
bot.on('new_chat_members', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const promoChatId = process.env.PROMO_NOTIFICATIONS_CHAT;
    
    // Проверяем, что это нужный чат
    if (!promoChatId) return;
    
    let targetChatId = promoChatId;
    if (promoChatId.startsWith('@')) {
      targetChatId = promoChatId.substring(1);
    }
    
    if (chatId.toString() !== targetChatId && ctx.chat.username !== targetChatId) {
      return;
    }
    
    console.log(`👥 Новый участник в чате уведомлений: ${ctx.message.new_chat_members.length} человек`);
    
    for (const newMember of ctx.message.new_chat_members) {
      // Пропускаем ботов
      if (newMember.is_bot) continue;
      
      const userId = newMember.id;
      console.log(`🔍 Проверяем пользователя ${userId} (${newMember.first_name})`);
      
      // Ищем пользователя в базе данных
      const user = await users.findOne({ id: userId });
      
      if (user) {
        const { statusText, titleText } = getUserChatInfo(user);
        
        // Формируем текст с информацией о пользователе
        let userInfo = `👋 **Добро пожаловать в чат!**\n\n`;
        userInfo += `👤 **Игрок:** ${newMember.first_name || 'Неизвестно'}\n`;
        
        if (statusText) {
          userInfo += `💫 **Статус:** ${statusText}\n`;
        }
        
        if (titleText) {
          userInfo += `🏆 **Титул:** ${titleText}\n`;
        }
        
        userInfo += `\n🎮 Приятной игры в MagnumTap!`;
        
        // Отправляем приветственное сообщение
        await ctx.reply(userInfo, { parse_mode: 'Markdown' });
        
        console.log(`✅ Приветствие отправлено для пользователя ${userId}`);
        
      } else {
        console.log(`❌ Пользователь ${userId} не найден в базе данных`);
      }
    }
    
  } catch (error) {
    console.error('❌ Ошибка при обработке новых участников чата:', error);
  }
});

bot.on('text', async (ctx) => {
  console.log('📨 Получено текстовое сообщение от:', ctx.from.id, ctx.from.first_name);
  console.log('📝 Текст сообщения:', ctx.message.text);
  console.log('🔗 Есть ли reply_to_message:', !!ctx.message.reply_to_message);
  
  if (ctx.message.reply_to_message) {
    console.log('💬 Reply to text:', ctx.message.reply_to_message.text);
  }

  const text = ctx.message.text;
  const userId = ctx.from.id;
  
  console.log('✅ Text handler triggered:');
  console.log('📝 Text:', text);
  
  // Проверяем состояние пользователя
  const userState = userStates.get(userId);
  console.log('🔄 Состояние пользователя:', userState);
  
  // Если есть состояние, обрабатываем через него
  if (userState && userState.type === 'withdrawal') {
    console.log('💳 Обрабатываем вывод через состояние');
    await handleWithdrawalState(ctx, text, userState);
    return;
  }
  
  if (userState && userState.type === 'admin_create_promo') {
    console.log('🎫 Обрабатываем создание промокода через состояние');
    await handlePromoCodeCreation(ctx, text, userState);
    return;
  }
  
  if (userState && userState.type === 'activate_promo') {
    console.log('🎫 Обрабатываем активацию промокода через состояние');
    await handlePromoActivation(ctx, text, userState);
    return;
  }
  
  if (userState && userState.type === 'custom_title_request') {
    console.log('🏷️ Обрабатываем заявку на кастомный титул через состояние');
    await handleCustomTitleRequest(ctx, text, userState);
    return;
  }
  
  if (userState && userState.type === 'admin_farm_cooldown') {
    console.log('🌾 Обрабатываем изменение кулдауна фарма');
    await handleFarmCooldownChange(ctx, text, userState);
    return;
  }
  
  if (userState && userState.type === 'admin_create_post') {
    console.log('📝 Обрабатываем создание поста через состояние');
    await handlePostCreation(ctx, text, userState);
    return;
  }
  
  if (userState && userState.type === 'admin_post_button_input') {
    console.log('🔘 Обрабатываем ввод кнопки для поста через состояние');
    await handlePostButtonInput(ctx, text, userState);
    return;
  }
  
  if (userState && userState.type === 'admin_view_referrals') {
    console.log('👥 Обрабатываем просмотр рефералов пользователя');
    const userId = text.trim();
    
    if (!userId || isNaN(userId)) {
      return ctx.reply('❌ Неверный ID пользователя! Введите корректный числовой ID.');
    }
    
    try {
      const refs = await users.find({ invitedBy: userId }).toArray();
      if (!refs.length) {
        await ctx.reply(`👥 У пользователя ${userId} нет рефералов.`);
      } else {
        let msg = `👥 **Рефералы пользователя ${userId}:**\n\n`;
        refs.forEach((u, i) => { 
          msg += `${i + 1}. ID: ${u.id}\n`;
          if (u.username) msg += `   @${u.username}\n`;
          msg += `   Звёзд: ${u.stars || 0}\n`;
          msg += `   Magnum Coin: ${u.magnumCoins || 0}\n\n`;
        });
        msg += `📊 **Всего рефералов:** ${refs.length}`;
        await ctx.reply(msg);
      }
    } catch (error) {
      console.error('❌ Ошибка при поиске рефералов:', error);
      await ctx.reply('❌ Произошла ошибка при поиске рефералов.');
    }
    
    userStates.delete(ctx.from.id);
    return;
  }
  
  if (userState && userState.type === 'admin_change_commission') {
    console.log('💰 Обрабатываем изменение комиссии');
    const newCommission = parseFloat(text);
    if (isNaN(newCommission) || newCommission < 0 || newCommission > 50) {
      return ctx.reply('❌ Неверная комиссия! Введите число от 0 до 50');
    }
    
    EXCHANGE_COMMISSION = newCommission;
    await saveCommissionToDB(); // Сохраняем комиссию в БД
    await ctx.reply(`✅ Комиссия изменена на ${newCommission}%`);
    
    // Возвращаемся к панели комиссии
    setTimeout(async () => {
      const commissionText = `💰 **УПРАВЛЕНИЕ КОМИССИЕЙ** 💰\n\n` +
                            `📊 **Текущая комиссия:** ${EXCHANGE_COMMISSION}%\n\n` +
                            `🔄 **Как работает комиссия:**\n` +
                            `• При обмене 100🪙 → 10⭐ (без комиссии)\n` +
                            `• При обмене 10⭐ → 100🪙 (без комиссии)\n` +
                            `• Комиссия взимается с получаемой валюты\n\n` +
                            `💡 **Пример с комиссией 5%:**\n` +
                            `• 100🪙 → 9.5⭐ (вместо 10⭐)\n` +
                            `• 10⭐ → 95🪙 (вместо 100🪙)\n\n` +
                            `⚠️ **Внимание:** Комиссия влияет на все обмены!`;

      await sendMessageWithPhoto(ctx, commissionText, Markup.inlineKeyboard([
        [Markup.button.callback('📝 Изменить комиссию', 'admin_change_commission')],
        [Markup.button.callback('🔄 Сбросить комиссию (0%)', 'admin_reset_commission')],
        [Markup.button.callback('📊 Тестовый обмен', 'admin_test_exchange')],
        [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
      ]));
    }, 1000);
    return;
  }
  
  // Обработка управления резервом
  if (userState && userState.type === 'admin_add_magnum_reserve') {
    console.log('🏦 Обрабатываем добавление Magnum Coin в резерв');
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Неверная сумма! Введите положительное число');
    }
    
    RESERVE_MAGNUM_COINS += amount;
    await saveReserveToDB();
    await ctx.reply(`✅ Добавлено ${amount.toFixed(2)} Magnum Coin в резерв. Новый баланс: ${RESERVE_MAGNUM_COINS.toFixed(2)}🪙`);
    
    setTimeout(async () => {
      const reserveText = `🏦 **УПРАВЛЕНИЕ РЕЗЕРВОМ** 🏦\n\n` +
                         `📊 **Текущий баланс резерва:**\n` +
                         `🪙 ${RESERVE_MAGNUM_COINS.toFixed(2)} Magnum Coin\n` +
                         `⭐ ${RESERVE_STARS.toFixed(2)} звёзд\n\n` +
                         `📈 **Текущие курсы обмена:**\n` +
                         `• 100🪙 = ${(100 * (RESERVE_STARS / RESERVE_MAGNUM_COINS)).toFixed(2)}⭐\n` +
                         `• 10⭐ = ${(10 * (RESERVE_MAGNUM_COINS / RESERVE_STARS)).toFixed(2)}🪙\n\n` +
                         `💡 **Как работает резерв:**\n` +
                         `• Курсы обмена зависят от баланса резерва\n` +
                         `• При обмене резерв автоматически обновляется\n` +
                         `• Больше резерва = лучше курсы для пользователей`;

      await sendMessageWithPhoto(ctx, reserveText, Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить Magnum Coin', 'admin_add_magnum_reserve')],
        [Markup.button.callback('➖ Убрать Magnum Coin', 'admin_remove_magnum_reserve')],
        [Markup.button.callback('➕ Добавить звёзды', 'admin_add_stars_reserve')],
        [Markup.button.callback('➖ Убрать звёзды', 'admin_remove_stars_reserve')],
        [Markup.button.callback('🔄 Сбросить резерв', 'admin_reset_reserve')],
        [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
      ]));
    }, 1000);
    userStates.delete(ctx.from.id);
    return;
  }
  
  if (userState && userState.type === 'admin_remove_magnum_reserve') {
    console.log('🏦 Обрабатываем удаление Magnum Coin из резерва');
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Неверная сумма! Введите положительное число');
    }
    
    if (amount > RESERVE_MAGNUM_COINS) {
      return ctx.reply(`❌ Недостаточно Magnum Coin в резерве! Доступно: ${RESERVE_MAGNUM_COINS.toFixed(2)}🪙`);
    }
    
    RESERVE_MAGNUM_COINS -= amount;
    await saveReserveToDB();
    await ctx.reply(`✅ Убрано ${amount.toFixed(2)} Magnum Coin из резерва. Новый баланс: ${RESERVE_MAGNUM_COINS.toFixed(2)}🪙`);
    
    setTimeout(async () => {
      const reserveText = `🏦 **УПРАВЛЕНИЕ РЕЗЕРВОМ** 🏦\n\n` +
                         `📊 **Текущий баланс резерва:**\n` +
                         `🪙 ${RESERVE_MAGNUM_COINS.toFixed(2)} Magnum Coin\n` +
                         `⭐ ${RESERVE_STARS.toFixed(2)} звёзд\n\n` +
                         `📈 **Текущие курсы обмена:**\n` +
                         `• 100🪙 = ${(100 * (RESERVE_STARS / RESERVE_MAGNUM_COINS)).toFixed(2)}⭐\n` +
                         `• 10⭐ = ${(10 * (RESERVE_MAGNUM_COINS / RESERVE_STARS)).toFixed(2)}🪙\n\n` +
                         `💡 **Как работает резерв:**\n` +
                         `• Курсы обмена зависят от баланса резерва\n` +
                         `• При обмене резерв автоматически обновляется\n` +
                         `• Больше резерва = лучше курсы для пользователей`;

      await sendMessageWithPhoto(ctx, reserveText, Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить Magnum Coin', 'admin_add_magnum_reserve')],
        [Markup.button.callback('➖ Убрать Magnum Coin', 'admin_remove_magnum_reserve')],
        [Markup.button.callback('➕ Добавить звёзды', 'admin_add_stars_reserve')],
        [Markup.button.callback('➖ Убрать звёзды', 'admin_remove_stars_reserve')],
        [Markup.button.callback('🔄 Сбросить резерв', 'admin_reset_reserve')],
        [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
      ]));
    }, 1000);
    userStates.delete(ctx.from.id);
    return;
  }
  
  if (userState && userState.type === 'admin_add_stars_reserve') {
    console.log('🏦 Обрабатываем добавление звёзд в резерв');
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Неверная сумма! Введите положительное число');
    }
    
    RESERVE_STARS += amount;
    await saveReserveToDB();
    await ctx.reply(`✅ Добавлено ${amount.toFixed(2)} звёзд в резерв. Новый баланс: ${RESERVE_STARS.toFixed(2)}⭐`);
    
    setTimeout(async () => {
      const reserveText = `🏦 **УПРАВЛЕНИЕ РЕЗЕРВОМ** 🏦\n\n` +
                         `📊 **Текущий баланс резерва:**\n` +
                         `🪙 ${RESERVE_MAGNUM_COINS.toFixed(2)} Magnum Coin\n` +
                         `⭐ ${RESERVE_STARS.toFixed(2)} звёзд\n\n` +
                         `📈 **Текущие курсы обмена:**\n` +
                         `• 100🪙 = ${(100 * (RESERVE_STARS / RESERVE_MAGNUM_COINS)).toFixed(2)}⭐\n` +
                         `• 10⭐ = ${(10 * (RESERVE_MAGNUM_COINS / RESERVE_STARS)).toFixed(2)}🪙\n\n` +
                         `💡 **Как работает резерв:**\n` +
                         `• Курсы обмена зависят от баланса резерва\n` +
                         `• При обмене резерв автоматически обновляется\n` +
                         `• Больше резерва = лучше курсы для пользователей`;

      await sendMessageWithPhoto(ctx, reserveText, Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить Magnum Coin', 'admin_add_magnum_reserve')],
        [Markup.button.callback('➖ Убрать Magnum Coin', 'admin_remove_magnum_reserve')],
        [Markup.button.callback('➕ Добавить звёзды', 'admin_add_stars_reserve')],
        [Markup.button.callback('➖ Убрать звёзды', 'admin_remove_stars_reserve')],
        [Markup.button.callback('🔄 Сбросить резерв', 'admin_reset_reserve')],
        [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
      ]));
    }, 1000);
    userStates.delete(ctx.from.id);
    return;
  }
  
  if (userState && userState.type === 'admin_remove_stars_reserve') {
    console.log('🏦 Обрабатываем удаление звёзд из резерва');
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Неверная сумма! Введите положительное число');
    }
    
    if (amount > RESERVE_STARS) {
      return ctx.reply(`❌ Недостаточно звёзд в резерве! Доступно: ${RESERVE_STARS.toFixed(2)}⭐`);
    }
    
    RESERVE_STARS -= amount;
    await saveReserveToDB();
    await ctx.reply(`✅ Убрано ${amount.toFixed(2)} звёзд из резерва. Новый баланс: ${RESERVE_STARS.toFixed(2)}⭐`);
    
    setTimeout(async () => {
      const reserveText = getReserveManagementText();

      await sendMessageWithPhoto(ctx, reserveText, Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить Magnum Coin', 'admin_add_magnum_reserve')],
        [Markup.button.callback('➖ Убрать Magnum Coin', 'admin_remove_magnum_reserve')],
        [Markup.button.callback('➕ Добавить звёзды', 'admin_add_stars_reserve')],
        [Markup.button.callback('➖ Убрать звёзды', 'admin_remove_stars_reserve')],
        [Markup.button.callback('🔄 Сбросить резерв', 'admin_reset_reserve')],
        [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
      ]));
    }, 1000);
    userStates.delete(ctx.from.id);
    return;
  }
  
  // Обработка ввода количества для покупки звёзд
  if (userState && userState.type === 'buy_tg_stars_amount') {
    console.log('🔘 Обрабатываем ввод количества для покупки звёзд');
    const amount = parseFloat(text);
    
    if (isNaN(amount) || amount < EXCHANGE_LIMITS.MIN_MAGNUM_COINS) {
      return ctx.reply(`❌ Неверная сумма! Минимум: ${EXCHANGE_LIMITS.MIN_MAGNUM_COINS}🪙`);
    }
    
    if (amount > EXCHANGE_LIMITS.MAX_MAGNUM_COINS) {
      return ctx.reply(`❌ Слишком большая сумма! Максимум: ${EXCHANGE_LIMITS.MAX_MAGNUM_COINS}🪙`);
    }
    
    const user = await getUser(ctx.from.id, ctx);
    const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;
    
    if (amount > magnumCoinsBalance) {
      return ctx.reply(`❌ Недостаточно Magnum Coin! У вас: ${magnumCoinsBalance}🪙, нужно: ${amount}🪙`);
    }
    
    // Проверяем время последнего обмена
    const now = Math.floor(Date.now() / 1000);
    const lastExchange = user.lastExchange || 0;
    const timeSinceLastExchange = now - lastExchange;
    
    if (timeSinceLastExchange < 5) {
      return ctx.reply('⏳ Подождите 5 секунд между обменами');
    }
    
    // Рассчитываем курс и количество звёзд
    const magnumToStarsRate = RESERVE_STARS / RESERVE_MAGNUM_COINS;
    const baseStarsToReceive = amount * magnumToStarsRate;
    const commission = calculateCommission(baseStarsToReceive);
    const starsToReceive = calculateAmountWithCommission(baseStarsToReceive);
    
    if (starsToReceive <= 0) {
      return ctx.reply('❌ Ошибка расчета курса обмена. Попробуйте позже.');
    }
    
    // Обновляем резерв с проверкой (комиссия остается в резерве)
    const reserveUpdated = await updateReserve('magnumCoins', 'stars', amount, starsToReceive, commission);
    if (!reserveUpdated) {
      return ctx.reply('❌ Недостаточно средств в резерве биржи. Попробуйте позже.');
    }
    
    // Обновляем баланс пользователя
    await users.updateOne(
      { id: ctx.from.id },
      { 
        $inc: { magnumCoins: -amount, stars: starsToReceive },
        $set: { lastExchange: now }
      }
    );
    invalidateUserCache(ctx.from.id);
    invalidateBotStatsCache();
    
    const commissionText = EXCHANGE_COMMISSION > 0 ? `\n💰 Комиссия: ${formatNumber(commission)}⭐ (${EXCHANGE_COMMISSION}%)` : '';
    const notificationText = `✅ Обмен выполнен успешно!\n\n` +
                            `💰 Потрачено: ${amount}🪙\n` +
                            `⭐ Получено: ${formatNumber(starsToReceive)}⭐` +
                            `${commissionText}\n` +
                            `📊 Курс: 1🪙 = ${formatNumber(magnumToStarsRate)}⭐`;
    
    // Отправляем уведомление через callback query
    try {
      await ctx.telegram.answerCbQuery(ctx.from.id, notificationText, { show_alert: true });
    } catch (error) {
      // Если не удалось отправить уведомление, отправляем сообщение
      await ctx.reply(notificationText);
    }
    
    // Обновляем интерфейс обмена
    setTimeout(async () => {
      await updateExchangeInterface(ctx, ctx.from.id);
    }, 1000);
    
    userStates.delete(ctx.from.id);
    return;
  }
  
  // Обработка ввода количества для продажи звёзд
  if (userState && userState.type === 'sell_tg_stars_amount') {
    console.log('🔘 Обрабатываем ввод количества для продажи звёзд');
    const amount = parseFloat(text);
    
    if (isNaN(amount) || amount < EXCHANGE_LIMITS.MIN_STARS) {
      return ctx.reply(`❌ Неверная сумма! Минимум: ${EXCHANGE_LIMITS.MIN_STARS}⭐`);
    }
    
    if (amount > EXCHANGE_LIMITS.MAX_STARS) {
      return ctx.reply(`❌ Слишком большая сумма! Максимум: ${EXCHANGE_LIMITS.MAX_STARS}⭐`);
    }
    
    const user = await getUser(ctx.from.id, ctx);
    const starsBalance = Math.round((user.stars || 0) * 100) / 100;
    
    if (amount > starsBalance) {
      return ctx.reply(`❌ Недостаточно звёзд! У вас: ${starsBalance}⭐, нужно: ${amount}⭐`);
    }
    
    // Проверяем время последнего обмена
    const now = Math.floor(Date.now() / 1000);
    const lastExchange = user.lastExchange || 0;
    const timeSinceLastExchange = now - lastExchange;
    
    if (timeSinceLastExchange < 5) {
      return ctx.reply('⏳ Подождите 5 секунд между обменами');
    }
    
    // Рассчитываем курс и количество Magnum Coin
    const starsToMagnumRate = RESERVE_MAGNUM_COINS / RESERVE_STARS;
    const baseCoinsToReceive = amount * starsToMagnumRate;
    const commission = calculateCommission(baseCoinsToReceive);
    const coinsToReceive = calculateAmountWithCommission(baseCoinsToReceive);
    
    if (coinsToReceive <= 0) {
      return ctx.reply('❌ Ошибка расчета курса обмена. Попробуйте позже.');
    }
    
    // Обновляем резерв с проверкой (комиссия остается в резерве)
    const reserveUpdated = await updateReserve('stars', 'magnumCoins', amount, coinsToReceive, commission);
    if (!reserveUpdated) {
      return ctx.reply('❌ Недостаточно средств в резерве биржи. Попробуйте позже.');
    }
    
    // Обновляем баланс пользователя
    await users.updateOne(
      { id: ctx.from.id },
      { 
        $inc: { stars: -amount, magnumCoins: coinsToReceive },
        $set: { lastExchange: now }
      }
    );
    invalidateUserCache(ctx.from.id);
    invalidateBotStatsCache();
    
    const commissionText = EXCHANGE_COMMISSION > 0 ? `\n💰 Комиссия: ${formatNumber(commission)}🪙 (${EXCHANGE_COMMISSION}%)` : '';
    const notificationText = `✅ Обмен выполнен успешно!\n\n` +
                            `⭐ Потрачено: ${amount}⭐\n` +
                            `💰 Получено: ${formatNumber(coinsToReceive)}🪙` +
                            `${commissionText}\n` +
                            `📊 Курс: 1⭐ = ${formatNumber(starsToMagnumRate)}🪙`;
    
    // Отправляем уведомление через callback query
    try {
      await ctx.telegram.answerCbQuery(ctx.from.id, notificationText, { show_alert: true });
    } catch (error) {
      // Если не удалось отправить уведомление, отправляем сообщение
      await ctx.reply(notificationText);
    }
    
    // Обновляем интерфейс обмена
    setTimeout(async () => {
      await updateExchangeInterface(ctx, ctx.from.id);
    }, 1000);
    
    userStates.delete(ctx.from.id);
    return;
  }
  
  // Если нет состояния, проверяем reply_to_message (старый способ)
  const replyMsg = ctx.message.reply_to_message;
  if (!replyMsg) {
    console.log('❌ Нет reply_to_message и состояния, пропускаем обработку');
    return;
  }

  const replyText = replyMsg.text;
  console.log('💬 Reply text:', replyText);

  try {
    // Обработка заявок на вывод
    if (replyText.includes('Введите количество звёзд для вывода в Telegram Stars (минимум 100)')) {
      console.log('Обрабатываем ввод суммы для Telegram Stars:', text);
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 100) {
        return ctx.reply('❌ Неверная сумма! Минимум для вывода: 100⭐');
      }
      
      const user = await getUser(ctx.from.id, ctx);
      console.log('Баланс пользователя:', user.stars, 'Запрашивает:', amount);
      if (user.stars < amount) {
        return ctx.reply(`❌ Недостаточно звёзд! У вас: ${Math.round(user.stars * 100) / 100}⭐`);
      }
      
      await adminForceReply(ctx, `Введите ваш Telegram ID для получения ${amount} Telegram Stars:`);
      return;
    }
    
    if (replyText.includes('Введите ваш Telegram ID для получения') && replyText.includes('Telegram Stars')) {
      console.log('Обрабатываем ввод Telegram ID:', text);
      console.log('Reply text:', replyText);
      const telegramId = text.trim();
      const amountMatch = replyText.match(/(\d+(?:\.\d+)?)/);
      if (!amountMatch) return ctx.reply('❌ Ошибка обработки суммы!');
      
      const amount = parseFloat(amountMatch[1]);
      console.log('Создаем заявку на сумму:', amount, 'для ID:', telegramId);
      const request = await createWithdrawalRequest(ctx.from.id, 'tg_stars', amount, telegramId);
      console.log('Заявка создана:', request.id);
      
      // Списываем звёзды
      await users.updateOne({ id: ctx.from.id }, { $inc: { stars: -amount } });
      console.log('Звёзды списаны с баланса');
      
      console.log('Отправляем заявку в канал...');
      await sendWithdrawalToChannel(request);
      console.log('Заявка отправлена в канал');
      
      ctx.reply(`✅ **Заявка создана!**\n\n` +
                `🏷️ **ID заявки:** \`${request.id}\`\n` +
                `💰 **Сумма:** ${amount}⭐\n` +
                `💸 **К получению:** ${request.netAmount}⭐\n` +
                `⏰ **Статус:** ⏳ На рассмотрении\n\n` +
                `Заявка отправлена администраторам. Ожидайте обработки в течение 24-48 часов.`, 
                { parse_mode: 'Markdown' });
      return;
    }
    
         if (replyText.includes('Введите ваш TON адрес для вывода:')) {
      const address = text.trim();
      if (address.length < 10) {
        return ctx.reply('❌ Неверный TON адрес!');
      }
      
             await adminForceReply(ctx, `Введите количество звёзд для вывода в TON (минимум 500):`);
      return;
    }
    
         if (replyText.includes('Введите количество звёзд для вывода в TON (минимум 500)')) {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 500) {
        return ctx.reply('❌ Неверная сумма! Минимум для вывода в TON: 500⭐');
      }
      
      const user = await getUser(ctx.from.id, ctx);
      if (user.stars < amount) {
        return ctx.reply(`❌ Недостаточно звёзд! У вас: ${Math.round(user.stars * 100) / 100}⭐`);
      }
      
      // Получаем адрес из предыдущего сообщения
      const messages = await ctx.telegram.getUpdates();
      // Используем временное решение - запрашиваем адрес заново
             await adminForceReply(ctx, `Подтвердите TON адрес для вывода ${amount}⭐:`);
      return;
    }
    
    if (replyText.includes('Подтвердите TON адрес для вывода')) {
      const address = text.trim();
      const amountMatch = replyText.match(/(\d+(?:\.\d+)?)/);
      if (!amountMatch) return ctx.reply('❌ Ошибка обработки суммы!');
      
      const amount = parseFloat(amountMatch[1]);
      const request = await createWithdrawalRequest(ctx.from.id, 'ton', amount, address);
      
      // Списываем звёзды
      await users.updateOne({ id: ctx.from.id }, { $inc: { stars: -amount } });
      
      await sendWithdrawalToChannel(request);
      
      ctx.reply(`✅ **Заявка создана!**\n\n` +
                `🏷️ **ID заявки:** \`${request.id}\`\n` +
                `💰 **Сумма:** ${amount}⭐\n` +
                `💸 **К получению:** ${request.netAmount}⭐\n` +
                `⏰ **Статус:** ⏳ На рассмотрении\n\n` +
                `Заявка отправлена администраторам. Ожидайте обработки в течение 24-48 часов.`, 
                { parse_mode: 'Markdown' });
      return;
    }
    
         if (replyText.includes('Введите ваш USDT TRC-20 адрес для вывода:')) {
      const address = text.trim();
      if (address.length < 10) {
        return ctx.reply('❌ Неверный USDT адрес!');
      }
      
             await adminForceReply(ctx, `Введите количество звёзд для вывода в USDT (минимум 1000):`);
      return;
    }
    
         if (replyText.includes('Введите количество звёзд для вывода в USDT (минимум 1000)')) {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 1000) {
        return ctx.reply('❌ Неверная сумма! Минимум для вывода в USDT: 1000⭐');
      }
      
      const user = await getUser(ctx.from.id, ctx);
      if (user.stars < amount) {
        return ctx.reply(`❌ Недостаточно звёзд! У вас: ${Math.round(user.stars * 100) / 100}⭐`);
      }
      
             await adminForceReply(ctx, `Подтвердите USDT TRC-20 адрес для вывода ${amount}⭐:`);
      return;
    }
    
    if (replyText.includes('Подтвердите USDT TRC-20 адрес для вывода')) {
      const address = text.trim();
      const amountMatch = replyText.match(/(\d+(?:\.\d+)?)/);
      if (!amountMatch) return ctx.reply('❌ Ошибка обработки суммы!');
      
      const amount = parseFloat(amountMatch[1]);
      const request = await createWithdrawalRequest(ctx.from.id, 'usdt', amount, address);
      
      // Списываем звёзды
      await users.updateOne({ id: ctx.from.id }, { $inc: { stars: -amount } });
      
      await sendWithdrawalToChannel(request);
      
      ctx.reply(`✅ **Заявка создана!**\n\n` +
                `🏷️ **ID заявки:** \`${request.id}\`\n` +
                `💰 **Сумма:** ${amount}⭐\n` +
                `💸 **К получению:** ${request.netAmount}⭐\n` +
                `⏰ **Статус:** ⏳ На рассмотрении\n\n` +
                `Заявка отправлена администраторам. Ожидайте обработки в течение 24-48 часов.`, 
                { parse_mode: 'Markdown' });
      return;
    }
    
    // Создание заявки в техподдержку
    if (replyText.includes('ТЕХНИЧЕСКАЯ ПОДДЕРЖКА') && replyText.includes('Опишите вашу проблему')) {
      const ticket = await createSupportTicket(
        ctx.from.id,
        ctx.from.username,
        text
      );
      
      // Отправляем в канал поддержки
      await sendTicketToChannel(ticket);
      
      ctx.reply(
        `✅ **Заявка создана успешно!**\n\n` +
        `🎫 **ID заявки:** \`${ticket._id.toString().slice(-6)}\`\n` +
        `📅 **Дата:** ${new Date().toLocaleString('ru-RU')}\n\n` +
        `💬 **Ваше сообщение:**\n${text}\n\n` +
        `⚡ Мы рассмотрим вашу заявку в течение 24 часов и уведомим о статусе.`,
        { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 Мои заявки', 'my_tickets')],
            [Markup.button.callback('🛠️ Меню поддержки', 'support_menu')]
          ])
        }
      );
      return;
    }



    // Админские команды
    if (isAdmin(ctx.from.id)) {
      if (replyText.includes('Ответ пользователю по заявке')) {
        const ticketIdMatch = replyText.match(/#([a-f0-9]{6})/);
        if (!ticketIdMatch) {
          return ctx.reply('❌ Не удалось найти ID заявки!');
        }
        
        const shortTicketId = ticketIdMatch[1];
        
        // Ищем заявку по короткому ID (последние 6 символов ObjectId)
        const tickets = await supportTickets.find({}).toArray();
        const ticket = tickets.find(t => t._id.toString().slice(-6) === shortTicketId);
        
        if (!ticket) {
          return ctx.reply('❌ Заявка не найдена!');
        }

        // Обновляем заявку с ответом админа
        await updateTicketStatus(ticket._id, 'in_progress', text);

        // Отправляем ответ пользователю
        try {
          await bot.telegram.sendMessage(ticket.userId,
            `💬 *Ответ от техподдержки*\n\n` +
            `🎫 *По заявке #${shortTicketId}:*\n` +
            `${text}\n\n` +
            `📝 *Ваша исходная заявка:* ${ticket.message}\n\n` +
            `⚡ При необходимости создайте новую заявку через профиль.`,
            { parse_mode: 'Markdown' }
          );
          
          // Обновляем сообщение в канале
          await updateTicketInChannel(ticket._id);
          
          ctx.reply(`✅ Ответ отправлен пользователю ${ticket.username || ticket.userId}`);
        } catch (error) {
          console.error('Ошибка отправки ответа:', error);
          ctx.reply('❌ Ошибка отправки ответа пользователю');
        }
        return;
      }

      if (replyText.includes('Поиск заявки')) {
        // Функция поиска заявок временно отключена
        return ctx.reply('❌ Функция поиска заявок временно недоступна.');
      }

      if (replyText.includes('Ответ по проверке задания')) {
        const checkIdMatch = replyText.match(/#([a-f0-9]{6})/);
        if (!checkIdMatch) {
          return ctx.reply('❌ Не удалось найти ID проверки!');
        }
        
        const shortCheckId = checkIdMatch[1];
        
        // Ищем проверку по короткому ID
        const taskChecks_list = await taskChecks.find({}).toArray();
        const taskCheck = taskChecks_list.find(tc => tc._id.toString().slice(-6) === shortCheckId);
        
        if (!taskCheck) {
          return ctx.reply('❌ Проверка задания не найдена!');
        }

        // Обновляем проверку с ответом админа
        await updateTaskCheckStatus(taskCheck._id, taskCheck.status, text);

        // Отправляем ответ пользователю
        try {
          await bot.telegram.sendMessage(taskCheck.userId,
            `💬 *Комментарий по проверке задания*\n\n` +
            `🎫 *По проверке #${shortCheckId}:*\n` +
            `📋 *Задание:* ${taskCheck.taskTitle}\n\n` +
            `💬 *Комментарий администратора:*\n${text}`,
            { parse_mode: 'Markdown' }
          );
          
          // Обновляем сообщение в канале
          await updateTaskCheckInChannel(taskCheck._id);
          
          ctx.reply(`✅ Комментарий отправлен пользователю ${taskCheck.username || taskCheck.userId}`);
        } catch (error) {
          console.error('Ошибка отправки комментария:', error);
          ctx.reply('❌ Ошибка отправки комментария пользователю');
        }
        return;
      }
      
      // Временная команда для тестирования бонуса
      if (text === '/reset_bonus' && isAdmin(ctx.from.id)) {
        await users.updateOne({ id: ctx.from.id }, { $set: { lastBonus: 0 } });
        return ctx.reply('✅ Бонус сброшен, можете тестировать');
      }

      // Остальные админские команды...
      if (replyText.includes('Выдача титула')) {
        const parts = text.split(' ');
        if (parts.length < 2) {
          return ctx.reply('❌ Неверный формат! Введите: ID_пользователя название_титула');
        }
        
        const userId = parts[0];
        const titleName = parts.slice(1).join(' '); // Объединяем остальные части как название титула
        
        // Ищем титул по ID или названию
        let titleId = null;
        for (const [id, title] of Object.entries(TITLES)) {
          if (id === titleName || title.name.toLowerCase() === titleName.toLowerCase()) {
            titleId = id;
            break;
          }
        }
        
        if (!titleId) {
          const availableTitles = Object.entries(TITLES).map(([id, title]) => `${title.name} (${id})`).join('\n');
          return ctx.reply(`❌ Титул "${titleName}" не найден!\n\nДоступные титулы:\n${availableTitles}`);
        }

        await users.updateOne(
          { id: parseInt(userId) },
          { $addToSet: { titles: titleId } }
        );
        
        ctx.reply(`✅ Титул "${TITLES[titleId].name}" выдан пользователю ${userId}!`);
      }
      
      else if (replyText.includes('Забрать титул')) {
        const parts = text.split(' ');
        if (parts.length < 2) {
          return ctx.reply('❌ Неверный формат! Введите: ID_пользователя название_титула');
        }
        
        const userId = parts[0];
        const titleName = parts.slice(1).join(' '); // Объединяем остальные части как название титула
        
        // Ищем титул по ID или названию
        let titleId = null;
        for (const [id, title] of Object.entries(TITLES)) {
          if (id === titleName || title.name.toLowerCase() === titleName.toLowerCase()) {
            titleId = id;
            break;
          }
        }
        
        if (!titleId) {
          const availableTitles = Object.entries(TITLES).map(([id, title]) => `${title.name} (${id})`).join('\n');
          return ctx.reply(`❌ Титул "${titleName}" не найден!\n\nДоступные титулы:\n${availableTitles}`);
        }

        await users.updateOne(
          { id: parseInt(userId) },
          { $pull: { titles: titleId } }
        );
        
        ctx.reply(`✅ Титул "${TITLES[titleId].name}" забран у пользователя ${userId}!`);
      }
      
      else if (replyText.includes('Титулы пользователя')) {
        const userId = parseInt(text);
        const user = await users.findOne({ id: userId });
        
        if (!user) {
          return ctx.reply('❌ Пользователь не найден!');
        }

        const userTitles = user.titles || [];
        let titlesList = `👤 **Титулы пользователя ${userId}:**\n\n`;
        
        if (userTitles.length === 0) {
          titlesList += '🚫 У пользователя нет титулов';
        } else {
          userTitles.forEach(titleId => {
            if (TITLES[titleId]) {
              titlesList += `${TITLES[titleId].name}\n`;
            }
          });
        }

        ctx.reply(titlesList, { parse_mode: 'Markdown' });
      }

      // Управление статусами
      else if (replyText.includes('Выдача статуса') && replyText.includes('ID СТАТУС')) {
        const [userId, statusKey] = text.split(' ');
        if (!userId || !statusKey || !USER_STATUSES[statusKey]) {
          return ctx.reply('❌ Неверный формат или несуществующий статус!\n\nДоступные статусы: owner, admin, moderator, vip_gold, vip, verified, member');
        }

        await users.updateOne(
          { id: parseInt(userId) },
          { $set: { status: statusKey } }
        );
        
        ctx.reply(`✅ Статус "${USER_STATUSES[statusKey].name}" выдан пользователю ${userId}!`);
      }
      
      else if (replyText.includes('Сброс статуса') && replyText.includes('обычному участнику')) {
        const userId = parseInt(text);
        if (!userId) {
          return ctx.reply('❌ Введите корректный ID пользователя!');
        }

        await users.updateOne(
          { id: userId },
          { $set: { status: 'member' } }
        );
        
        ctx.reply(`✅ Статус пользователя ${userId} сброшен к обычному участнику!`);
      }
      
      else if (replyText.includes('Проверка статуса') && replyText.includes('просмотра его статуса')) {
        const userId = parseInt(text);
        const user = await users.findOne({ id: userId });
        
        if (!user) {
          return ctx.reply('❌ Пользователь не найден!');
        }

        const currentStatus = getUserStatus(user);
        ctx.reply(
          `👤 **Статус пользователя ${userId}:**\n\n` +
          `${currentStatus.color} **${currentStatus.name}**\n` +
          `└ ${currentStatus.description}\n\n` +
          `📊 **Приоритет:** ${currentStatus.priority}`,
          { parse_mode: 'Markdown' }
        );
      }

      // Рассылка
      else if (replyText.includes('текст для рассылки')) {
        const allUsers = await users.find().toArray();
        let sent = 0;
        for (const u of allUsers) {
          try { 
            await ctx.telegram.sendMessage(u.id, `📢 Сообщение от администрации:\n\n${text}`); 
            sent++; 
          } catch {}
        }
        ctx.reply(`✅ Рассылка завершена. Доставлено: ${sent} пользователям.`);
      }

      // Промокод
      else if (userState.type === 'admin_create_promo') {
        await handlePromoCodeCreation(ctx, text, userState);
        return;
      }
      


      // Выдать/забрать звёзды
      else if (replyText.includes('ID пользователя и количество звёзд')) {
        const [id, stars] = text.trim().split(/\s+/);
        if (!id || isNaN(Number(stars))) {
          return ctx.reply('❌ Формат: ID 10');
        }
        await users.updateOne({ id: Number(id) }, { $inc: { stars: Number(stars) } });
        ctx.reply(`✅ Пользователю ${id} выдано/забрано ${stars} звёзд.`);
      }

      // Рефералы пользователя
      else if (replyText.includes('для просмотра его рефералов')) {
        const id = text.trim();
        const refs = await users.find({ invitedBy: id }).toArray();
        if (!refs.length) {
          return ctx.reply('У пользователя нет рефералов.');
        }
        let msg = `👥 Рефералы пользователя ${id}:\n\n`;
        refs.forEach((u, i) => { msg += `${i + 1}. ${u.id}\n`; });
        ctx.reply(msg);
      }
    }

    // Промокод для всех пользователей
    else if (replyText.includes('Введите промокод:')) {
      const code = text.trim().toUpperCase();
      const promo = await promocodes.findOne({ code });
      
      if (!promo) {
        return ctx.reply('❌ Промокод не найден!');
      }
      
      if (promo.used >= promo.max) {
        return ctx.reply('❌ Промокод исчерпан!');
      }

      const user = await getUser(ctx.from.id);
      const userPromos = user.usedPromos || [];
      
      if (userPromos.includes(code)) {
        return ctx.reply('❌ Вы уже использовали этот промокод!');
      }

      await users.updateOne(
        { id: ctx.from.id },
        { 
          $inc: { stars: promo.stars, promoCount: 1 },
          $addToSet: { usedPromos: code }
        }
      );
      await promocodes.updateOne({ code }, { $inc: { used: 1 } });

      // Проверяем новые титулы и достижения
      const newTitles = await checkAndAwardTitles(ctx.from.id);
      const newAchievements = await checkAndAwardAchievements(ctx.from.id);
      
      if (newTitles.length > 0 && newAchievements.length > 0) {
        ctx.reply(`🎉 Промокод активирован! Получено ${promo.stars} звёзд! 🏆 Новый титул! 🎖️ Достижение!`);
      } else if (newTitles.length > 0) {
        ctx.reply(`🎉 Промокод активирован! Получено ${promo.stars} звёзд! 🏆 Новый титул получен!`);
      } else if (newAchievements.length > 0) {
        ctx.reply(`🎉 Промокод активирован! Получено ${promo.stars} звёзд! 🎖️ ${newAchievements[0].name}!`);
      } else {
        ctx.reply(`🎉 Промокод активирован! Получено ${promo.stars} звёзд!`);
      }
    }

  } catch (error) {
    ctx.reply('❌ Произошла ошибка при обработке команды!');
  }
});

bot.action('admin_panel', async (ctx) => {
  const adminText = '⚙️ *Админ-панель* ⚙️\n\n🎛️ Выберите действие:';

  await sendMessageWithPhoto(ctx, adminText, Markup.inlineKeyboard([
    [Markup.button.callback('📢 Рассылка', 'admin_broadcast'), Markup.button.callback('🎫 Промокод', 'admin_addpromo')],
    [Markup.button.callback('📝 Создать пост', 'admin_create_post'), Markup.button.callback('📊 Статистика', 'admin_stats')],
    [Markup.button.callback('⭐ Звёзды', 'admin_stars'), Markup.button.callback('👥 Рефералы', 'admin_refs')],
    [Markup.button.callback('🏆 Титулы', 'admin_titles'), Markup.button.callback('💫 Статусы', 'admin_statuses')],
    [Markup.button.callback('🌾 Настройки фарма', 'admin_farm'), Markup.button.callback('💰 Комиссия', 'admin_commission')],
    [Markup.button.callback('🏦 Резерв', 'admin_reserve'), Markup.button.callback('🗄️ Сброс БД', 'admin_reset_db')],
    [Markup.button.callback('❓ FAQ Админа', 'admin_faq'), Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]));
});

bot.action('admin_cancel', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) {}
  ctx.answerCbQuery();
      await sendMessageWithPhoto(ctx, 
    '⚙️ *Админ-панель* ⚙️\n\n🎛️ Выберите действие:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📢 Рассылка', 'admin_broadcast'), Markup.button.callback('🎫 Промокод', 'admin_addpromo')],
      [Markup.button.callback('📝 Создать пост', 'admin_create_post'), Markup.button.callback('📊 Статистика', 'admin_stats')],
      [Markup.button.callback('⭐ Звёзды', 'admin_stars'), Markup.button.callback('👥 Рефералы', 'admin_refs')],
      [Markup.button.callback('🏆 Титулы', 'admin_titles'), Markup.button.callback('💫 Статусы', 'admin_statuses')],
      [Markup.button.callback('🌾 Настройки фарма', 'admin_farm'), Markup.button.callback('💰 Комиссия', 'admin_commission')],
      [Markup.button.callback('🏦 Резерв', 'admin_reserve'), Markup.button.callback('🗄️ Сброс БД', 'admin_reset_db')],
      [Markup.button.callback('❓ FAQ Админа', 'admin_faq'), Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]),
    false
  );
});

// Создание постов для канала
bot.action('admin_create_post', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const postText = `📝 **Создание поста для канала** 📝\n\n` +
                   `Выберите тип поста:\n\n` +
                   `📢 **Обычный пост** - текст с фото бота (можно добавить кнопку)\n` +
                   `🎮 **Игровой пост** - с кнопкой "Играть"\n` +
                   `💬 **Чат пост** - с кнопкой "Присоединиться к чату"\n` +
                   `🎫 **Промокод пост** - с кнопкой "Получить промокод"`;

  await sendMessageWithPhoto(ctx, postText, Markup.inlineKeyboard([
    [Markup.button.callback('📢 Обычный пост', 'post_type_normal')],
    [Markup.button.callback('🎮 Игровой пост', 'post_type_game')],
    [Markup.button.callback('💬 Чат пост', 'post_type_chat')],
    [Markup.button.callback('🎫 Промокод пост', 'post_type_promo')],
    [Markup.button.callback('🔙 Назад', 'admin_panel')]
  ]));
});

// Обработчики типов постов
bot.action('post_type_normal', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  userStates.set(ctx.from.id, { type: 'admin_create_post', postType: 'normal' });
  await adminForceReply(ctx, '📢 **Обычный пост**\n\nВведите текст поста для канала magnumtap:\n\n💡 Поддерживается Markdown разметка');
});

bot.action('post_type_game', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  userStates.set(ctx.from.id, { type: 'admin_create_post', postType: 'game' });
  await adminForceReply(ctx, '🎮 **Игровой пост**\n\nВведите текст поста для канала magnumtap:\n\n💡 К посту автоматически добавится кнопка "🎮 Играть"');
});

bot.action('post_type_chat', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  userStates.set(ctx.from.id, { type: 'admin_create_post', postType: 'chat' });
  await adminForceReply(ctx, '💬 **Чат пост**\n\nВведите текст поста для канала magnumtap:\n\n💡 К посту автоматически добавится кнопка "💬 Присоединиться к чату"');
});

bot.action('post_type_promo', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  userStates.set(ctx.from.id, { type: 'admin_create_post', postType: 'promo' });
  await adminForceReply(ctx, '🎫 **Промокод пост**\n\nВведите текст поста для канала magnumtap:\n\n💡 К посту автоматически добавится кнопка "🎫 Получить промокод"');
});

// Обработчики для создания постов
bot.action('post_add_button', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  console.log(`🔘 Пользователь ${ctx.from.id} нажал "Добавить кнопку"`);
  
  const currentState = userStates.get(ctx.from.id);
  console.log(`📋 Текущее состояние: ${JSON.stringify(currentState)}`);
  
  userStates.set(ctx.from.id, { 
    type: 'admin_post_button_input',
    postType: 'normal',
    postText: currentState?.postText || ''
  });
  
  console.log(`💾 Новое состояние: ${JSON.stringify(userStates.get(ctx.from.id))}`);
  
  await adminForceReply(ctx, '🔘 **Добавление кнопки**\n\nВведите данные кнопки в формате:\n\nТЕКСТ_КНОПКИ:ССЫЛКА\n\n⚠️ **Важно:** Не добавляйте пробелы перед ссылкой!\n\nПримеры:\n🎮 Играть:https://t.me/bot?start=game\n💬 Чат:https://t.me/+Poy0ZtUoux1hMTMy\n🌐 Сайт:https://magnumtap.com');
  
  console.log(`✅ Запрос на ввод кнопки отправлен`);
});

bot.action('post_publish_now', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const userState = userStates.get(ctx.from.id);
  if (!userState || !userState.postText) {
    await ctx.reply('❌ Ошибка: текст поста не найден');
    userStates.delete(ctx.from.id);
    return;
  }
  
  const channelChatId = REQUIRED_CHANNEL ? `@${REQUIRED_CHANNEL}` : '@magnumtap';
  const botPhotoUrl = process.env.BOT_PHOTO_URL;
  
  if (!botPhotoUrl) {
    await ctx.reply('❌ Фото бота не настроено! Добавьте переменную BOT_PHOTO_URL');
    userStates.delete(ctx.from.id);
    return;
  }
  
  // Публикуем пост без кнопки
  await publishPostToChannel(ctx, userState.postText, null, 'normal', channelChatId, botPhotoUrl);
});

// Управление статусами
bot.action('admin_statuses', async (ctx) => {
  let statusText = '💫 *Управление статусами* 💫\n\n';
  statusText += '📋 *Доступные статусы:*\n\n';
  
  Object.entries(USER_STATUSES).forEach(([key, status]) => {
    statusText += `${status.color} *${status.name}*\n`;
    statusText += `└ ${status.description}\n\n`;
  });

  await sendMessageWithPhoto(ctx, statusText, Markup.inlineKeyboard([
    [Markup.button.callback('➕ Выдать статус', 'admin_give_status')],
    [Markup.button.callback('➖ Убрать статус', 'admin_remove_status')],
    [Markup.button.callback('👤 Статус пользователя', 'admin_user_status')],
    [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
  ]));
});

bot.action('admin_give_status', async (ctx) => {
  ctx.reply(
    '➕ *Выдача статуса*\n\nВведите ID пользователя и статус через пробел:\n\n📝 Формат: ID СТАТУС\n\n🔧 Доступные статусы:\n• owner\n• admin\n• moderator\n• vip\\_gold\n• vip\n• verified\n• member',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Например: 123456789 vip'
      }
    }
  );
});

bot.action('admin_remove_status', async (ctx) => {
  ctx.reply(
    '➖ *Сброс статуса*\n\nВведите ID пользователя для сброса статуса к обычному участнику:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Введите ID пользователя'
      }
    }
  );
});

bot.action('admin_user_status', async (ctx) => {
  ctx.reply(
    '👤 *Проверка статуса*\n\nВведите ID пользователя для просмотра его статуса:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Введите ID пользователя'
      }
    }
  );
});

// FAQ для админов
bot.action('admin_commission', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const commissionText = `💰 **УПРАВЛЕНИЕ КОМИССИЕЙ** 💰\n\n` +
                        `📊 **Текущая комиссия:** ${EXCHANGE_COMMISSION}%\n\n` +
                        `🔄 **Как работает комиссия:**\n` +
                        `• При обмене 100🪙 → 10⭐ (без комиссии)\n` +
                        `• При обмене 10⭐ → 100🪙 (без комиссии)\n` +
                        `• Комиссия взимается с получаемой валюты\n\n` +
                        `💡 **Пример с комиссией 5%:**\n` +
                        `• 100🪙 → 9.5⭐ (вместо 10⭐)\n` +
                        `• 10⭐ → 95🪙 (вместо 100🪙)\n\n` +
                        `⚠️ **Внимание:** Комиссия влияет на все обмены!`;

  await sendMessageWithPhoto(ctx, commissionText, Markup.inlineKeyboard([
    [Markup.button.callback('📝 Изменить комиссию', 'admin_change_commission')],
    [Markup.button.callback('🔄 Сбросить комиссию (0%)', 'admin_reset_commission')],
    [Markup.button.callback('📊 Тестовый обмен', 'admin_test_exchange')],
    [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
  ]));
});

bot.action('admin_change_commission', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  userStates.set(ctx.from.id, { type: 'admin_change_commission' });
  await adminForceReply(ctx, '📝 **Изменение комиссии**\n\nВведите новую комиссию в процентах (0-50):\n\nПримеры:\n• 0 - без комиссии\n• 5 - комиссия 5%\n• 10 - комиссия 10%\n\n⚠️ Рекомендуется не более 20%');
});

bot.action('admin_reset_commission', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  EXCHANGE_COMMISSION = 0;
  await saveCommissionToDB(); // Сохраняем комиссию в БД
  await ctx.answerCbQuery('✅ Комиссия сброшена до 0%', { show_alert: true });
  
  // Возвращаемся к панели комиссии
  setTimeout(async () => {
    const commissionText = `💰 **УПРАВЛЕНИЕ КОМИССИЕЙ** 💰\n\n` +
                          `📊 **Текущая комиссия:** ${EXCHANGE_COMMISSION}%\n\n` +
                          `🔄 **Как работает комиссия:**\n` +
                          `• При обмене 100🪙 → 10⭐ (без комиссии)\n` +
                          `• При обмене 10⭐ → 100🪙 (без комиссии)\n` +
                          `• Комиссия взимается с получаемой валюты\n\n` +
                          `💡 **Пример с комиссией 5%:**\n` +
                          `• 100🪙 → 9.5⭐ (вместо 10⭐)\n` +
                          `• 10⭐ → 95🪙 (вместо 100🪙)\n\n` +
                          `⚠️ **Внимание:** Комиссия влияет на все обмены!`;

    await sendMessageWithPhoto(ctx, commissionText, Markup.inlineKeyboard([
      [Markup.button.callback('📝 Изменить комиссию', 'admin_change_commission')],
      [Markup.button.callback('🔄 Сбросить комиссию (0%)', 'admin_reset_commission')],
      [Markup.button.callback('📊 Тестовый обмен', 'admin_test_exchange')],
      [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
    ]));
  }, 1000);
});

bot.action('admin_test_exchange', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const testText = `📊 **ТЕСТОВЫЙ ОБМЕН** 📊\n\n` +
                  `📈 **Текущая комиссия:** ${EXCHANGE_COMMISSION}%\n\n` +
                  `🔄 **Курсы обмена:**\n\n` +
                  `**Покупка звёзд:**\n` +
                  `• 100🪙 → ${(10 * (1 - EXCHANGE_COMMISSION / 100)).toFixed(2)}⭐\n` +
                  `• Комиссия: ${EXCHANGE_COMMISSION}%\n\n` +
                  `**Продажа звёзд:**\n` +
                  `• 10⭐ → ${(100 * (1 - EXCHANGE_COMMISSION / 100)).toFixed(2)}🪙\n` +
                  `• Комиссия: ${EXCHANGE_COMMISSION}%\n\n` +
                  `💡 **Формула:** Сумма × (1 - комиссия/100)`;

  await sendMessageWithPhoto(ctx, testText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к комиссии', 'admin_commission')]
  ]));
});

// Управление резервом
bot.action('admin_reserve', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');

  const reserveText = getReserveManagementText();

  await sendMessageWithPhoto(ctx, reserveText, Markup.inlineKeyboard([
    [Markup.button.callback('➕ Добавить Magnum Coin', 'admin_add_magnum_reserve')],
    [Markup.button.callback('➖ Убрать Magnum Coin', 'admin_remove_magnum_reserve')],
    [Markup.button.callback('➕ Добавить звёзды', 'admin_add_stars_reserve')],
    [Markup.button.callback('➖ Убрать звёзды', 'admin_remove_stars_reserve')],
    [Markup.button.callback('🔄 Сбросить резерв', 'admin_reset_reserve')],
    [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
  ]));
});

// Добавление Magnum Coin в резерв
bot.action('admin_add_magnum_reserve', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');

  userStates.set(ctx.from.id, { type: 'admin_add_magnum_reserve' });
  await adminForceReply(ctx, '➕ **Добавление Magnum Coin в резерв**\n\nВведите количество Magnum Coin для добавления в резерв:\n\nПримеры:\n• 1000 - добавить 1000 Magnum Coin\n• 5000 - добавить 5000 Magnum Coin\n\n⚠️ Это повлияет на курсы обмена!');
});

// Удаление Magnum Coin из резерва
bot.action('admin_remove_magnum_reserve', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');

  userStates.set(ctx.from.id, { type: 'admin_remove_magnum_reserve' });
  await adminForceReply(ctx, '➖ **Удаление Magnum Coin из резерва**\n\nВведите количество Magnum Coin для удаления из резерва:\n\nПримеры:\n• 1000 - убрать 1000 Magnum Coin\n• 5000 - убрать 5000 Magnum Coin\n\n⚠️ Это повлияет на курсы обмена!');
});

// Добавление звёзд в резерв
bot.action('admin_add_stars_reserve', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');

  userStates.set(ctx.from.id, { type: 'admin_add_stars_reserve' });
  await adminForceReply(ctx, '➕ **Добавление звёзд в резерв**\n\nВведите количество звёзд для добавления в резерв:\n\nПримеры:\n• 100 - добавить 100 звёзд\n• 500 - добавить 500 звёзд\n\n⚠️ Это повлияет на курсы обмена!');
});

// Удаление звёзд из резерва
bot.action('admin_remove_stars_reserve', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');

  userStates.set(ctx.from.id, { type: 'admin_remove_stars_reserve' });
  await adminForceReply(ctx, '➖ **Удаление звёзд из резерва**\n\nВведите количество звёзд для удаления из резерва:\n\nПримеры:\n• 100 - убрать 100 звёзд\n• 500 - убрать 500 звёзд\n\n⚠️ Это повлияет на курсы обмена!');
});

// Сброс резерва
bot.action('admin_reset_reserve', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');

  RESERVE_MAGNUM_COINS = 1000000000;
  RESERVE_STARS = 10000;
  await saveReserveToDB();
  await ctx.answerCbQuery('✅ Резерв сброшен к начальным значениям (курс: 100🪙 = 0.001⭐)', { show_alert: true });

  setTimeout(async () => {
    const reserveText = getReserveManagementText();

    await sendMessageWithPhoto(ctx, reserveText, Markup.inlineKeyboard([
      [Markup.button.callback('➕ Добавить Magnum Coin', 'admin_add_magnum_reserve')],
      [Markup.button.callback('➖ Убрать Magnum Coin', 'admin_remove_magnum_reserve')],
      [Markup.button.callback('➕ Добавить звёзды', 'admin_add_stars_reserve')],
      [Markup.button.callback('➖ Убрать звёзды', 'admin_remove_stars_reserve')],
      [Markup.button.callback('🔄 Сбросить резерв', 'admin_reset_reserve')],
      [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
    ]));
  }, 1000);
});

// Сброс базы данных
bot.action('admin_reset_db', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');

  // Показываем предупреждение
  await ctx.answerCbQuery('⚠️ ВНИМАНИЕ! Это действие удалит ВСЕ данные из базы данных!\n\nНажмите кнопку еще раз для подтверждения.', { show_alert: true });

  // Устанавливаем состояние для подтверждения
  userStates.set(ctx.from.id, { type: 'admin_confirm_reset_db' });

  setTimeout(async () => {
    await sendMessageWithPhoto(ctx, 
      '🗄️ **СБРОС БАЗЫ ДАННЫХ** 🗄️\n\n' +
      '⚠️ **ВНИМАНИЕ!** Это действие:\n' +
      '• Удалит ВСЕХ пользователей\n' +
      '• Удалит ВСЕ промокоды\n' +
      '• Удалит ВСЕ заявки на вывод\n' +
      '• Удалит ВСЕ тикеты поддержки\n' +
      '• Удалит ВСЕ проверки заданий\n' +
      '• Удалит ВСЕ достижения\n' +
      '• Сбросит резерв биржи\n\n' +
      '🔒 **Структура коллекций останется!**\n\n' +
      '❓ **Вы уверены, что хотите продолжить?**',
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ ДА, сбросить базу данных', 'admin_confirm_reset_db')],
        [Markup.button.callback('❌ НЕТ, отменить', 'admin_panel')]
      ])
    );
  }, 1000);
});

// Подтверждение сброса базы данных
bot.action('admin_confirm_reset_db', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');

  await ctx.answerCbQuery('🗄️ Начинаем сброс базы данных...', { show_alert: true });

  try {
    const result = await resetDatabase();
    
    if (result.success) {
      await ctx.answerCbQuery(`✅ База данных успешно сброшена!\n\nУдалено ${result.deletedCount} записей`, { show_alert: true });
      
      setTimeout(async () => {
        await sendMessageWithPhoto(ctx, 
          '🗄️ **СБРОС БАЗЫ ДАННЫХ ЗАВЕРШЕН** 🗄️\n\n' +
          `✅ Успешно удалено: **${result.deletedCount}** записей\n\n` +
          '📋 **Что было очищено:**\n' +
          '• 👥 Все пользователи\n' +
          '• 🎫 Все промокоды\n' +
          '• 💸 Все заявки на вывод\n' +
          '• 🎫 Все тикеты поддержки\n' +
          '• 📋 Все проверки заданий\n' +
          '• 🏆 Все достижения\n' +
          '• 🏦 Резерв биржи (восстановлен)\n\n' +
          '🔄 **Бот готов к работе с чистой базой данных!**',
          Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
          ])
        );
      }, 1000);
    } else {
      await ctx.answerCbQuery(`❌ Ошибка сброса базы данных: ${result.error}`, { show_alert: true });
      
      setTimeout(async () => {
        await sendMessageWithPhoto(ctx, 
          '❌ **ОШИБКА СБРОСА БАЗЫ ДАННЫХ** ❌\n\n' +
          `🔍 **Причина:** ${result.error}\n\n` +
          '💡 **Рекомендации:**\n' +
          '• Проверьте подключение к MongoDB\n' +
          '• Убедитесь в правах доступа\n' +
          '• Попробуйте позже',
          Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
          ])
        );
      }, 1000);
    }
  } catch (error) {
    console.error('❌ Ошибка в обработчике сброса БД:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка при сбросе базы данных', { show_alert: true });
  }

  // Очищаем состояние
  userStates.delete(ctx.from.id);
});

bot.action('admin_faq', async (ctx) => {
  const adminFaqText = `❓ *FAQ Админ-панели* ❓

🎛️ *Основные функции:*

📢 *Рассылка* - Отправка сообщений всем пользователям
├ Введите текст для рассылки
└ Сообщение отправится всем зарегистрированным пользователям

🎫 **Промокод** - Создание промокодов
├ Формат: НАЗВАНИЕ МАГНУМ_КОИНЫ ЛИМИТ
├ Пример: NEWCODE 25 100
└ Создаст промокод на 25 Magnum Coin с лимитом 100 активаций

📊 **Статистика** - Подробная статистика бота
├ Общее количество пользователей
├ Активность за день/неделю
└ Статистика по промокодам и заданиям

⭐ **Звёзды** - Управление балансом пользователей
├ Формат: ID_ПОЛЬЗОВАТЕЛЯ КОЛИЧЕСТВО
├ Положительное число - добавить
└ Отрицательное число - отнять

👥 **Рефералы** - Просмотр рефералов пользователя
├ Введите ID пользователя
└ Покажет список приглашённых им людей

🏆 **Титулы** - Управление титулами
├ Просмотр всех титулов
├ Выдача/удаление титулов
└ Просмотр титулов конкретного пользователя

💫 **Статусы** - Новая система статусов
├ 👑 Владелец - высший статус
├ ⚡ Администратор - полный доступ
├ 🛡️ Модератор - модерация контента
├ 💎 VIP Gold - премиум высшего уровня
├ 💫 VIP - обычный премиум
├ ✅ Верифицированный - проверенный пользователь
└ 🎮 Участник - базовый статус

🔧 **Команды статусов:**
• Выдать: ID СТАТУС (123456789 vip)
• Убрать: сбросить до обычного участника
• Проверить: посмотреть текущий статус

⚠️ **Важно:**
- Все изменения применяются немедленно
- Будьте осторожны с массовыми операциями
- Используйте "Отмена" для возврата в админку`;

  await sendMessageWithPhoto(ctx, adminFaqText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
  ]));
});

// Добавляем недостающие обработчики админских команд
function adminForceReply(ctx, text) {
  return ctx.reply(text + '\n\n👆 Ответьте на это сообщение', {
    reply_markup: {
      force_reply: true,
      selective: true,
      input_field_placeholder: 'Введите ответ...',
      inline_keyboard: [[
        { text: '🏠 Главное меню', callback_data: 'main_menu' },
        { text: '❌ Отмена', callback_data: 'admin_cancel' }
      ]]
    }
  });
}

// Рассылка
bot.action('admin_broadcast', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  await adminForceReply(ctx, '📢 Введите текст для рассылки:');
});

// Добавить промокод
bot.action('admin_addpromo', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const promoText = `🎫 **Создание промокода** 🎫\n\n` +
                   `Выберите тип награды для промокода:\n\n` +
                   `⭐ **Звёзды** - валюта для покупок\n` +
                   `🪙 **Magnum Coin** - валюта фарма и уровней\n` +
                   `🏆 **Титул** - особое звание игрока\n` +
                   `💫 **Статус** - роль пользователя`;

  await sendMessageWithPhoto(ctx, promoText, Markup.inlineKeyboard([
    [Markup.button.callback('⭐ Звёзды', 'promo_type_stars')],
    [Markup.button.callback('🪙 Magnum Coin', 'promo_type_magnum')],
    [Markup.button.callback('🏆 Титул', 'promo_type_title')],
    [Markup.button.callback('💫 Статус', 'promo_type_status')],
    [Markup.button.callback('🔙 Назад', 'admin_panel')]
  ]));
});

// Обработчики типов промокодов
bot.action('promo_type_stars', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  userStates.set(ctx.from.id, { type: 'admin_create_promo', rewardType: 'stars' });
  await adminForceReply(ctx, '⭐ **Промокод на звёзды**\n\nВведите данные в формате: НАЗВАНИЕ КОЛИЧЕСТВО ЛИМИТ\n\nПример: STARS100 100 50\n(код STARS100 на 100 звёзд с лимитом 50 активаций)');
});

bot.action('promo_type_magnum', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  userStates.set(ctx.from.id, { type: 'admin_create_promo', rewardType: 'magnum' });
  await adminForceReply(ctx, '🪙 **Промокод на Magnum Coin**\n\nВведите данные в формате: НАЗВАНИЕ КОЛИЧЕСТВО ЛИМИТ\n\nПример: COIN50 50 100\n(код COIN50 на 50 Magnum Coin с лимитом 100 активаций)');
});

bot.action('promo_type_title', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  userStates.set(ctx.from.id, { type: 'admin_create_promo', rewardType: 'title' });
  await adminForceReply(ctx, '🏆 **Промокод на титул**\n\nВведите данные в формате: НАЗВАНИЕ ТИТУЛ ЛИМИТ\n\nПример: HERO "Герой дня" 20\n(код HERO дающий титул "Герой дня" с лимитом 20 активаций)');
});

bot.action('promo_type_status', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  userStates.set(ctx.from.id, { type: 'admin_create_promo', rewardType: 'status' });
  await adminForceReply(ctx, '💫 **Промокод на статус**\n\nВведите данные в формате: НАЗВАНИЕ СТАТУС ЛИМИТ\n\nДоступные статусы: vip, moderator, elite\n\nПример: VIP30 vip 30\n(код VIP30 дающий статус VIP с лимитом 30 активаций)');
});

// Статистика
bot.action('admin_stats', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  const totalUsers = await users.countDocuments();
  const totalStars = await users.aggregate([{ $group: { _id: null, total: { $sum: '$stars' } } }]).toArray();
  const totalInvited = await users.aggregate([{ $group: { _id: null, total: { $sum: '$invited' } } }]).toArray();
  
  await sendMessageWithPhoto(ctx,
    `📊 Статистика бота:\n\n` +
    `👥 Всего пользователей: ${totalUsers}\n` +
    `⭐ Всего звёзд: ${totalStars[0]?.total || 0}\n` +
    `🤝 Всего приглашений: ${totalInvited[0]?.total || 0}`,
    Markup.inlineKeyboard([[Markup.button.callback('⚙️ Назад в админ-панель', 'admin_panel')]])
  );
});

// Выдать/забрать звёзды
bot.action('admin_stars', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  await adminForceReply(ctx, '⭐ Введите ID пользователя и количество звёзд через пробел (например: 123456789 50):');
});

// Рефералы пользователя
bot.action('admin_refs', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  userStates.set(ctx.from.id, { type: 'admin_view_referrals' });
  await adminForceReply(ctx, '👥 **Просмотр рефералов пользователя**\n\nВведите ID пользователя для просмотра его рефералов:\n\n💡 Примеры:\n• 123456789 - просмотр рефералов пользователя с ID 123456789\n• 987654321 - просмотр рефералов пользователя с ID 987654321\n\n⚠️ Введите только числовой ID пользователя');
});

// Добавляем управление титулами в админ-панель
bot.action('admin_titles', async (ctx) => {
  let titlesList = '🏆 **Информация о титулах** 🏆\n\n';
  titlesList += '**ОБЫЧНЫЕ ТИТУЛЫ:**\n';
  
  Object.entries(TITLES).forEach(([id, title]) => {
    if (title.condition !== 'secret') {
      titlesList += `${title.icon} ${title.name}\n${title.description}\n\n`;
    }
  });
  
  titlesList += '**СЕКРЕТНЫЕ ТИТУЛЫ:**\n';
  Object.entries(TITLES).forEach(([id, title]) => {
    if (title.condition === 'secret') {
      titlesList += `${title.icon} ${title.name}\n${title.description}\n\n`;
    }
  });

  await sendMessageWithPhoto(ctx, titlesList, Markup.inlineKeyboard([
    [Markup.button.callback('➕ Выдать титул', 'admin_give_title')],
    [Markup.button.callback('➖ Забрать титул', 'admin_remove_title')],
    [Markup.button.callback('📋 Титулы пользователя', 'admin_user_titles')],
    [Markup.button.callback('⚙️ Назад в админ-панель', 'admin_panel')]
  ]));
});

bot.action('admin_give_title', async (ctx) => {
  ctx.reply(
    '➕ **Выдача титула**\n\nВведите ID пользователя и ID титула через пробел:\n`123456789 vip_elite`',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true
      }
    }
  );
});

bot.action('admin_remove_title', async (ctx) => {
  ctx.reply(
    '➖ **Забрать титул**\n\nВведите ID пользователя и ID титула через пробел:\n`123456789 vip_elite`',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true
      }
    }
  );
});

bot.action('admin_user_titles', async (ctx) => {
  ctx.reply(
    '📋 **Титулы пользователя**\n\nВведите ID пользователя:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true
      }
    }
  );
});



// Биржа
bot.action('exchange', async (ctx) => {
  const user = await getUser(ctx.from.id, ctx);
  const starsBalance = Math.round((user.stars || 0) * 100) / 100;
  const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;
  
  const exchangeText = `📈 **БИРЖА MAGNUMTAP** 📈\n\n` +
                      `💰 **Ваши балансы:**\n` +
                      `[🪙 ${magnumCoinsBalance}] Magnum Coin\n` +
                      `[⭐ ${starsBalance}] звёзд\n\n` +
                      `🔄 **Доступные операции:**\n\n` +
                      `💎 **Обмен валют:**\n` +
                      `• [🪙 100] → [⭐ 10] Telegram Stars\n` +
                      `• Другие валюты (скоро)\n\n` +
                      `📊 **P2P торговля:**\n` +
                      `• Обмен с другими пользователями\n` +
                      `• Безопасные сделки через эскроу\n` +
                      `• Создание собственных предложений\n\n` +
                      `💹 **Инвестиции:**\n` +
                      `• Стейкинг Magnum Coin (5% в месяц)\n` +
                      `• Пулы ликвидности\n` +
                      `• Торговые боты\n\n` +
                      `⚠️ **P2P и Инвестиции:** В разработке!`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💎 Обмен валют', 'exchange_currency')],
    [Markup.button.callback('👥 P2P Торговля', 'exchange_p2p')],
    [Markup.button.callback('💹 Инвестиции', 'exchange_invest')],
    [Markup.button.callback('📊 Мои ордера', 'exchange_orders')],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
  
  await sendMessageWithPhoto(ctx, exchangeText, keyboard);
});

// Обмен валют
bot.action('exchange_currency', async (ctx) => {
  console.log(`🔘 exchange_currency: Открываем интерфейс обмена для пользователя ${ctx.from.id}`);
  await updateExchangeInterface(ctx, ctx.from.id);
});

// P2P торговля
bot.action('exchange_p2p', async (ctx) => {
  const p2pText = `👥 **P2P ТОРГОВЛЯ** 👥\n\n` +
                  `🤝 **Что такое P2P:**\n` +
                  `Прямой обмен между пользователями с гарантией безопасности через систему эскроу.\n\n` +
                  `📋 **Как это работает:**\n` +
                  `1️⃣ Создаете предложение\n` +
                  `2️⃣ Другой пользователь откликается\n` +
                  `3️⃣ Средства блокируются в эскроу\n` +
                  `4️⃣ Подтверждаете получение\n` +
                  `5️⃣ Сделка завершается автоматически\n\n` +
                  `💰 **Популярные пары:**\n` +
                  `• ⭐/USDT TRC-20\n` +
                  `• ⭐/TON\n` +
                  `• ⭐/Telegram Stars\n\n` +
                  `⚠️ **Скоро:** P2P торговля в разработке!`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💰 Создать предложение', 'create_p2p_offer')],
    [Markup.button.callback('📋 Все предложения', 'view_p2p_offers')],
    [Markup.button.callback('📊 Мои сделки', 'my_p2p_deals')],
    [Markup.button.callback('🔙 Назад на биржу', 'exchange')]
  ]);
  
  await sendMessageWithPhoto(ctx, p2pText, keyboard);
});

// Инвестиции
bot.action('exchange_invest', async (ctx) => {
  const investText = `💹 **ИНВЕСТИЦИИ** 💹\n\n` +
                    `📈 **Доступные продукты:**\n\n` +
                    `🏦 **Стейкинг звёзд:**\n` +
                    `• Доходность: 5% в месяц\n` +
                    `• Минимум: 1000⭐\n` +
                    `• Срок: от 30 дней\n\n` +
                    `💧 **Пулы ликвидности:**\n` +
                    `• Пара: ⭐/USDT\n` +
                    `• APY: до 12%\n` +
                    `• Риск: средний\n\n` +
                    `🤖 **Торговые боты:**\n` +
                    `• Grid-бот: 2-8% в месяц\n` +
                    `• DCA-бот: стабильный рост\n` +
                    `• Копи-трейдинг: следуйте за профи\n\n` +
                    `⚠️ **Важно:** Инвестиции связаны с рисками!`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🏦 Стейкинг', 'staking'), Markup.button.callback('💧 Пулы', 'liquidity_pools')],
    [Markup.button.callback('🤖 Торговые боты', 'trading_bots')],
    [Markup.button.callback('📊 Мои инвестиции', 'my_investments')],
    [Markup.button.callback('🔙 Назад на биржу', 'exchange')]
  ]);
  
  await sendMessageWithPhoto(ctx, investText, keyboard);
});

// Заглушки для остальных функций
bot.action('exchange_orders', async (ctx) => {
  ctx.answerCbQuery('📊 Мои ордера - функция в разработке!', { show_alert: true });
});

bot.action('buy_usdt', async (ctx) => {
  ctx.answerCbQuery('💵 Покупка USDT - скоро будет доступна!', { show_alert: true });
});

bot.action('buy_ton', async (ctx) => {
  ctx.answerCbQuery('💎 Покупка TON - скоро будет доступна!', { show_alert: true });
});



bot.action('insufficient_funds', async (ctx) => {
  const user = await getUser(ctx.from.id, ctx);
  const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;
  
  ctx.answerCbQuery(`❌ Недостаточно средств! У вас: ${magnumCoinsBalance}🪙, нужно: 100🪙\n\nЗарабатывайте Magnum Coin через фарм и бонусы!`, { show_alert: true });
});

bot.action('sell_tg_stars', async (ctx) => {
  console.log('🔘 sell_tg_stars: Обработчик вызван');
  
  // Защита от спама - проверяем время последнего обмена
  const user = await getUser(ctx.from.id, ctx);
  const now = Math.floor(Date.now() / 1000);
  const lastExchange = user.lastExchange || 0;
  const timeSinceLastExchange = now - lastExchange;
  
  if (timeSinceLastExchange < 5) { // 5 секунд между обменами
    return ctx.answerCbQuery('⏳ Подождите 5 секунд между обменами', { show_alert: true });
  }
  
  const starsBalance = Math.round((user.stars || 0) * 100) / 100;
  
  console.log(`🔘 sell_tg_stars: Баланс пользователя ${starsBalance}⭐`);
  
  if (starsBalance < 10) {
    console.log(`🔘 sell_tg_stars: Недостаточно звёзд`);
    return ctx.answerCbQuery(`❌ Недостаточно звёзд! У вас: ${starsBalance}⭐, нужно: 10⭐`, { show_alert: true });
  }
  
  // Обмениваем 10 звёзд на Magnum Coin с учетом динамического курса и комиссии
  const starsToMagnumRate = RESERVE_MAGNUM_COINS / RESERVE_STARS;
  const coinsToReceive = 10 * starsToMagnumRate * (1 - EXCHANGE_COMMISSION / 100);
  console.log(`🔘 sell_tg_stars: Обмениваем 10⭐ → ${coinsToReceive.toFixed(2)}🪙 (курс: ${starsToMagnumRate.toFixed(4)})`);
  
  // Проверяем достаточность резерва
  if (coinsToReceive <= 0) {
    return ctx.answerCbQuery('❌ Ошибка расчета курса обмена. Попробуйте позже.', { show_alert: true });
  }
  
  // Обновляем резерв с проверкой
  const reserveUpdated = updateReserve('stars', 'magnumCoins', 10, coinsToReceive);
  if (!reserveUpdated) {
    return ctx.answerCbQuery('❌ Недостаточно средств в резерве биржи. Попробуйте позже.', { show_alert: true });
  }
  
  await users.updateOne(
    { id: ctx.from.id },
    { 
      $inc: { stars: -10, magnumCoins: coinsToReceive },
      $set: { lastExchange: Math.floor(Date.now() / 1000) }
    }
  );
  invalidateUserCache(ctx.from.id);
  invalidateBotStatsCache();
  
  const commissionText = EXCHANGE_COMMISSION > 0 ? `\n💰 Комиссия: ${formatNumber(10 * starsToMagnumRate * (EXCHANGE_COMMISSION / 100))}🪙 (${EXCHANGE_COMMISSION}%)` : '';
  const notificationText = `✅ Обмен выполнен успешно!\n\n` +
                          `⭐ Потрачено: 10⭐\n` +
                          `💰 Получено: ${formatNumber(coinsToReceive)}🪙` +
                          `${commissionText}\n` +
                          `📊 Курс: 1⭐ = ${formatNumber(starsToMagnumRate)}🪙`;
  await ctx.answerCbQuery(notificationText, { show_alert: true });
  
  console.log(`🔘 sell_tg_stars: Обмен завершен, обновляем интерфейс`);
  
  // Обновляем интерфейс обмена валют
  setTimeout(async () => {
    await updateExchangeInterface(ctx, ctx.from.id);
  }, 1000);
});

bot.action('insufficient_stars', async (ctx) => {
  const user = await getUser(ctx.from.id, ctx);
  const starsBalance = Math.round((user.stars || 0) * 100) / 100;
  
  ctx.answerCbQuery(`❌ Недостаточно звёзд! У вас: ${starsBalance}⭐, нужно: 10⭐\n\nЗарабатывайте звёзды через задания и майнер!`, { show_alert: true });
});

bot.action('create_p2p_offer', async (ctx) => {
  ctx.answerCbQuery('💰 Создание P2P предложения - в разработке!', { show_alert: true });
});

bot.action('view_p2p_offers', async (ctx) => {
  ctx.answerCbQuery('📋 Просмотр предложений - в разработке!', { show_alert: true });
});

bot.action('my_p2p_deals', async (ctx) => {
  ctx.answerCbQuery('📊 Мои P2P сделки - в разработке!', { show_alert: true });
});

bot.action('staking', async (ctx) => {
  ctx.answerCbQuery('🏦 Стейкинг - скоро будет доступен!', { show_alert: true });
});

bot.action('liquidity_pools', async (ctx) => {
  ctx.answerCbQuery('💧 Пулы ликвидности - в разработке!', { show_alert: true });
});

bot.action('trading_bots', async (ctx) => {
  ctx.answerCbQuery('🤖 Торговые боты - скоро!', { show_alert: true });
});

bot.action('my_investments', async (ctx) => {
  ctx.answerCbQuery('📊 Мои инвестиции - в разработке!', { show_alert: true });
});

bot.action('sponsor_tasks', async (ctx) => {
  // Проверяем подписку
  const isSubscribed = await checkSubscription(ctx);
  if (!isSubscribed) {
    await showSubscriptionMessage(ctx);
    return;
  }
  
  // Показываем первое задание
  showSponsorTask(ctx, 0);
});

async function showSponsorTask(ctx, taskIndex) {
  if (taskIndex >= SPONSOR_TASKS.length) {
    return await sendMessageWithPhoto(ctx, 
      '🎉 *Все задания от спонсоров выполнены!*\n\nВы прошли все доступные задания. Следите за обновлениями!',
      Markup.inlineKeyboard([
        [Markup.button.callback('🏠 Главное меню', 'main_menu')]
      ])
    );
  }

  const task = SPONSOR_TASKS[taskIndex];
  const user = await getUser(ctx.from.id);
  
  // Проверяем, есть ли активная проверка этого задания
  const pendingCheck = await taskChecks.findOne({
    userId: ctx.from.id,
    taskId: task.id,
    status: 'pending'
  });
  
  // Проверяем, выполнено ли задание
  const completedTask = await taskChecks.findOne({
    userId: ctx.from.id,
    taskId: task.id,
    status: 'approved'
  });

  let taskText = `📋 *Задание ${taskIndex + 1}/${SPONSOR_TASKS.length}*\n\n`;
  taskText += `*${task.title}*\n\n`;
  taskText += `📝 *Описание:* ${task.description}\n`;
  taskText += `🎁 *Награда:* ${task.reward} 🪙 Magnum Coin\n\n`;
  
  if (completedTask) {
    taskText += `✅ *Задание выполнено!*\n\n`;
  } else if (pendingCheck) {
    taskText += `⏳ *Задание на проверке*\nОжидайте результата проверки администратором\\.\n\n`;
  } else {
    taskText += `📋 *Инструкция:* ${task.instruction}\n\n`;
  }

  const buttons = [];
  
  if (completedTask) {
    // Задание выполнено
    if (taskIndex < SPONSOR_TASKS.length - 1) {
      buttons.push([Markup.button.callback('➡️ Следующее задание', `sponsor_task_${taskIndex + 1}`)]);
    }
  } else if (pendingCheck) {
    // На проверке - только навигация
    if (taskIndex > 0) {
      buttons.push([Markup.button.callback('⬅️ Предыдущее', `sponsor_task_${taskIndex - 1}`)]);
    }
    if (taskIndex < SPONSOR_TASKS.length - 1) {
      buttons.push([Markup.button.callback('➡️ Следующее', `sponsor_task_${taskIndex + 1}`)]);
    }
  } else {
    // Можно выполнять
    buttons.push([
      Markup.button.url('🔗 Перейти', task.link),
      Markup.button.callback('✅ Я выполнил', `task_complete_${task.id}`)
    ]);
    
    // Навигация
    if (taskIndex > 0) {
      buttons.push([Markup.button.callback('⬅️ Предыдущее', `sponsor_task_${taskIndex - 1}`)]);
    }
    if (taskIndex < SPONSOR_TASKS.length - 1) {
      buttons.push([Markup.button.callback('➡️ Следующее', `sponsor_task_${taskIndex + 1}`)]);
    }
  }
  
  buttons.push([Markup.button.callback('🏠 Главное меню', 'main_menu')]);

  await sendMessageWithPhoto(ctx, taskText, Markup.inlineKeyboard(buttons));
}

// Управление настройками фарма
bot.action('admin_farm', async (ctx) => {
  const statusText = farmCooldownEnabled ? '🟢 Включен' : '🔴 Выключен';
  const farmText = `🌾 **Настройки фарма** 🌾

⏱️ **Кулдаун фарма:** ${statusText}
🕐 **Время кулдауна:** ${farmCooldownSeconds} секунд

🎛️ **Управление:**`;

  await sendMessageWithPhoto(ctx, farmText, Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Переключить кулдаун', 'admin_farm_toggle')],
    [Markup.button.callback('⏱️ Изменить время', 'admin_farm_time')],
    [Markup.button.callback('🔙 Назад в админ-панель', 'admin_panel')]
  ]));
});

bot.action('admin_farm_toggle', async (ctx) => {
  try {
    farmCooldownEnabled = !farmCooldownEnabled;
    const statusText = farmCooldownEnabled ? '🟢 Включен' : '🔴 Выключен';
    
    await ctx.answerCbQuery(`✅ Кулдаун фарма ${farmCooldownEnabled ? 'включен' : 'выключен'}!`);
    
    const farmText = `🌾 **Настройки фарма** 🌾

⏱️ **Кулдаун фарма:** ${statusText}
🕐 **Время кулдауна:** ${farmCooldownSeconds} секунд

🎛️ **Управление:**`;

    await sendMessageWithPhoto(ctx, farmText, Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Переключить кулдаун', 'admin_farm_toggle')],
      [Markup.button.callback('⏱️ Изменить время', 'admin_farm_time')],
      [Markup.button.callback('🔙 Назад в админ-панель', 'admin_panel')]
    ]));
  } catch (error) {
    console.error('Ошибка переключения кулдауна фарма:', error);
    await ctx.answerCbQuery('⚠️ Временно недоступно. Повторите через пару секунд.', { show_alert: true });
  }
});

bot.action('admin_farm_time', async (ctx) => {
  userStates.set(ctx.from.id, { 
    type: 'admin_farm_cooldown' 
  });
  
  await adminForceReply(ctx, `⏱️ Введите новое время кулдауна фарма в секундах (текущее: ${farmCooldownSeconds} сек):`);
});

bot.action('faq', async (ctx) => {
  const faqText = `❓ **Справка и помощь** ❓

🎯 **Выберите раздел для подробной информации:**`;

  await sendMessageWithPhoto(ctx, faqText, Markup.inlineKeyboard([
    [Markup.button.callback('🌟 Как фармить звёзды', 'faq_farming'), Markup.button.callback('🎁 Ежедневный бонус', 'faq_bonus')],
    [Markup.button.callback('🎯 Задания', 'faq_tasks'), Markup.button.callback('👥 Приглашение друзей', 'faq_referrals')],
    [Markup.button.callback('🏆 Титулы и уровни', 'faq_titles'), Markup.button.callback('🎖️ Достижения', 'faq_achievements')],
    [Markup.button.callback('📊 Уровни игрока', 'faq_levels'), Markup.button.callback('🎫 Промокоды', 'faq_promocodes')],
    [Markup.button.callback('💫 Статусы', 'faq_statuses'), Markup.button.callback('⛏️ Майнер', 'faq_miner')],
    [Markup.button.callback('🛠️ Техподдержка', 'faq_support'), Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]));
});

// Детальные FAQ разделы
bot.action('faq_farming', async (ctx) => {
  const farmingText = `🌟 **Как фармить Magnum Coin** 🌟

💡 **Что это такое:**
Фарм - это основной способ заработка Magnum Coin в боте. Вы получаете 0.01 Magnum Coin каждую минуту!

🔥 **Как фармить:**
1️⃣ Нажмите кнопку "🌟 Фармить" в главном меню
2️⃣ Дождитесь окончания таймера (60 секунд)
3️⃣ Нажмите снова, чтобы получить следующую награду

⏰ **Важные детали:**
• ⏱️ Интервал: каждую минуту (60 секунд)
• 💰 Награда: 0.01 Magnum Coin за клик
• 🔄 Бесконечно: можете фармить сколько угодно
• 📱 Уведомления: получайте pop-up с результатом

🎯 **Стратегия фарма:**
• 🕐 Фармите регулярно в течение дня
• 📱 Используйте напоминания на телефоне
• 🎖️ 100 фармов = прогресс к титулу "Фармер"
• 🏆 1000 фармов = достижение "Мастер фарма" (+10 звёзд)

💎 **Советы для эффективного фарма:**
• Фармите во время перерывов
• Совмещайте с другими делами
• Не забывайте про ежедневный бонус!
• Приглашайте друзей для дополнительных звёзд
• Используйте бустеры для увеличения наград`;

  await sendMessageWithPhoto(ctx, farmingText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
  ]));
});

bot.action('faq_bonus', async (ctx) => {
  const bonusText = `🎁 **Ежедневный бонус** 🎁

🌅 **Что это такое:**
Большая награда, которую можно получать каждый день! Намного выгоднее обычного фарма.

💰 **Награда и условия:**
• 💎 **3 звезды** за каждый заход
• ⏰ **Раз в день** (обновляется в 00:00)
• 🔄 **Ежедневно** - заходите каждый день!

📋 **Пошаговая инструкция:**
1️⃣ Откройте бота (нажмите /start)
2️⃣ Нажмите кнопку "🎁 Бонус" в главном меню
3️⃣ Получите 3 звезды!
4️⃣ Повторите завтра для новой награды

📊 **Система серий:**
• 🔥 Ежедневные заходы увеличивают вашу серию
• 📅 7 дней подряд = титул "Постоянный посетитель"
• ⚡ 7 дней подряд = достижение "Недельный воин" (+12 звёзд)
• 🎯 15 бонусов = титул "Охотник за бонусами"

⏰ **Когда обновляется:**
• 🌙 В полночь (00:00 по московскому времени)
• 📱 Проверьте, сколько времени до следующего бонуса
• ⏳ Если таймер показывает время - значит нужно подождать

🎖️ **Максимальная выгода:**
• Заходите КАЖДЫЙ день без пропусков
• Совмещайте с фармом для быстрого роста
• 3 звезды в день = 90 звёзд в месяц!`;

  await sendMessageWithPhoto(ctx, bonusText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
  ]));
});

bot.action('faq_tasks', async (ctx) => {
  const tasksText = `🎯 **Система заданий** 🎯

📋 **Типы заданий:**

🔹 **Ежедневные задания:**
• 📅 Обновляются каждый день
• 🎁 Простые награды за активность
• ⚡ Быстро выполняются

🔸 **Задания от спонсоров:**
• 🎯 Более сложные задания
• 💎 Лучшие награды (по 3 звезды)
• 📸 Требуют подтверждения скриншотом

🎯 **Как выполнять спонсорские задания:**

**Шаг 1:** Откройте задания
└ Нажмите "🎯 Задания от спонсора" в меню

**Шаг 2:** Выберите задание  
└ Листайте кнопками "⬅️ Предыдущее" / "➡️ Следующее"

**Шаг 3:** Изучите требования
└ Внимательно прочитайте описание

**Шаг 4:** Выполните действие
└ Нажмите "🔗 Перейти" для выполнения

**Шаг 5:** Подтвердите выполнение
└ Нажмите "✅ Я выполнил"

**Шаг 6:** Отправьте скриншот
└ Сфотографируйте результат и отправьте

**Шаг 7:** Дождитесь проверки
└ Администратор проверит в течение 24 часов

📸 **Требования к скриншотам:**
• 📱 Четкое изображение экрана
• ✅ Видно выполнение задания
• 🎯 Соответствует инструкции
• 📝 Содержит нужную информацию

🎁 **Награды:**
• 🎯 Спонсорские: 3 звезды за задание
• 📋 Ежедневные: различные награды
• 🏆 Прогресс к титулу "Воин заданий"

❌ **Почему могут отклонить:**
• Неправильный скриншот
• Задание не выполнено полностью
• Нарушение правил платформы`;

  await sendMessageWithPhoto(ctx, tasksText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
  ]));
});

bot.action('faq_referrals', async (ctx) => {
  const referralsText = `👥 **Приглашение друзей** 👥

🎯 **Зачем приглашать друзей:**
• 💰 Дополнительные звёзды за каждого друга
• 🏆 Прогресс к титулам и достижениям
• 📈 Быстрый рост в рейтинге
• 🎖️ Социальные достижения

🔗 **Как пригласить друга:**

**Шаг 1:** Получите свою ссылку
└ Нажмите "🤝 Пригласить друзей" в меню

**Шаг 2:** Скопируйте ссылку
└ Нажмите на ссылку для копирования

**Шаг 3:** Поделитесь с друзьями
└ Отправьте в любом мессенджере/соцсети

**Шаг 4:** Друг переходит по ссылке
└ Друг нажимает /start в боте

**Шаг 5:** Получите награду!
└ Автоматически зачисляется в ваш баланс

💎 **Что получаете:**
• ⭐ Звёзды за каждого приглашенного
• 📊 Увеличение счетчика "Друзей приглашено"
• 🏆 Прогресс к титулам:
  └ 3 друга = "Амбассадор"  
  └ 10 друзей = "Социальная бабочка" (+10 звёзд)

🔥 **Стратегии приглашения:**
• 💬 Поделитесь в группах/чатах
• 📱 Отправьте близким друзьям
• 🌐 Разместите в соцсетях
• 🎮 Пригласите любителей игр

📋 **Важные правила:**
• 🚫 Запрещены фейковые аккаунты
• ✅ Только реальные пользователи
• 🔄 Друг должен активно пользоваться ботом
• 🎯 Качество важнее количества

📊 **Отслеживание прогресса:**
• 👤 В профиле видно количество друзей
• 📈 Прогресс к следующему достижению
• 🏆 Уведомления о новых титулах`;

  await sendMessageWithPhoto(ctx, referralsText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
  ]));
});

bot.action('faq_titles', async (ctx) => {
  const titlesText = `🏆 **Уровни и титулы** 🏆

📊 **15 уровней (по звёздам):**
🆕 Новичок (0) → 📚 Ученик (25) → 🎓 Стажёр (75) → ⚙️ Работник (150) →
🔧 Специалист (300) → 💼 Эксперт (500) → 🏅 Мастер (800) →
🥉 Профессионал (1200) → 🥈 Виртуоз (1800) → 🥇 Элита (2500) →
🏆 Чемпион (3500) → 💎 Титан (5000) → 👑 Божество (7500) →
⭐ Легенда (12000) → 🌟 Император (20000)

🎖️ **Основные титулы:**
• 🌱 Новичок - автоматически
• ⚡ Фармер - 30 фармов
• 💎 Коллекционер - 50 звёзд
• 🤝 Амбассадор - 3 друга
• 📅 Постоянный посетитель - 5 дней подряд
• 🎁 Охотник за бонусами - 15 бонусов
• 🎫 Мастер промокодов - 5 промокодов
• ⚔️ Воин заданий - 20 заданий
• 🌟 Звёздный лорд - 200 звёзд
• 👑 Легенда - 500 звёзд + 10 друзей

🔴 **Секретные титулы:**
🌅 Ранняя пташка | 🦉 Ночная сова | 💫 VIP Элита

📊 **Просмотр:** Профиль → Мои титулы`;

  await sendMessageWithPhoto(ctx, titlesText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
  ]));
});

bot.action('faq_achievements', async (ctx) => {
  const achievementsText = `🎖️ **Система достижений** 🎖️

🎯 **Все достижения:**

💰 "Сотка" (5⭐) - 100 звёзд
🤝 "Социальная бабочка" (10⭐) - 10 друзей
⚡ "Недельный воин" (12⭐) - 7 дней подряд
🌾 "Мастер фарма" (10⭐) - 1000 фармов
🎫 "Охотник за промо" (15⭐) - 15 промокодов

💡 **Быстрые советы:**
• Заходите каждый день за бонусом
• Приглашайте реальных друзей
• Фармите регулярно маленькими порциями
• Следите за промокодами в объявлениях

📊 **Просмотр:** Профиль → Достижения`;

  await sendMessageWithPhoto(ctx, achievementsText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
  ]));
});

bot.action('faq_levels', async (ctx) => {
  const levelsText = `📊 **Система уровней** 📊

🪙 **15 уровней (по Magnum Coin):**
🆕 Новичок - 0 | 📚 Ученик - 25 | 🎓 Стажёр - 75
⚙️ Работник - 150 | 🔧 Специалист - 300 | 💼 Эксперт - 500
🏅 Мастер - 800 | 🥉 Профессионал - 1200 | 🥈 Виртуоз - 1800
🥇 Элита - 2500 | 🏆 Чемпион - 3500 | 💎 Титан - 5000
👑 Божество - 7500 | ⭐ Легенда - 12000 | 🌟 Император - 20000

📊 **Отслеживание:**
• Шкала прогресса в профиле
• Проценты до следующего уровня
• Обновление в реальном времени

💡 **Быстрый рост:**
• 🎁 Ежедневный бонус (3 Magnum Coin)
• 🎯 Спонсорские задания (3 Magnum Coin)
• ⛏️ Майнер (пассивный доход 1 звезда/час)
• 🛒 Магазин (бустеры и множители)
• 👥 Приглашение друзей (звёзды за рефералов)`;

  await sendMessageWithPhoto(ctx, levelsText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
  ]));
});

bot.action('faq_promocodes', async (ctx) => {
  const promocodesText = `🎫 **Промокоды** 🎫

🔑 **Как использовать:**
1. Нажмите "🎫 Промокод" в меню
2. Введите код ТОЧНО как написано
3. Получите Magnum Coin автоматически

🎯 **Где найти:**
• 📢 Официальные объявления
• 🎉 Праздничные акции  
• 🏆 Конкурсы и розыгрыши
• 👥 Партнерские каналы

⚠️ **Правила:**
• Каждый код только ОДИН раз
• Коды могут истекать
• Ограниченное количество активаций

🏆 **Награды за активность:**
• 5 промокодов = титул "Мастер промокодов"
• 15 промокодов = достижение (+15 Magnum Coin)`;

  await sendMessageWithPhoto(ctx, promocodesText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
  ]));
});

bot.action('faq_statuses', async (ctx) => {
  const statusesText = `💫 **Система статусов** 💫

🎖️ **Все статусы:**
👑 Владелец | ⚡ Администратор | 🛡️ Модератор
🎖️ Ветеран | 🤝 Волонтер | ⭐ Элита | 🛡️ Хранитель
💎 VIP Gold | 💫 VIP | ✅ Верифицированный | 🎮 Участник

🎯 **Как получить:**
• 🎮 Участник - автоматически при регистрации
• ✅ Верифицированный - за активность в боте
• 💫 VIP - за особые заслуги и достижения
• 💎 VIP Gold - за высокие достижения
• 🛡️ Модератор - за помощь в модерации
• ⚡ Администратор - за административную работу
• 🎖️ Ветеран - за долгосрочную активность
• 🤝 Волонтер - за помощь в поддержании проекта
• ⭐ Элита - эксклюзивный статус для избранных
• 🛡️ Хранитель - за защиту и покровительство сообщества

📊 **Где отображается:**
• В профиле и рейтингах
• При взаимодействии с игроками
• В статистике бота

🎁 **Преимущества:**
• 🌟 Престиж в сообществе
• 🎯 Особое отображение
• 💎 Эксклюзивность статуса
• 🏆 Признание заслуг`;

  await sendMessageWithPhoto(ctx, statusesText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
  ]));
});

bot.action('faq_support', async (ctx) => {
  const supportText = `🛠️ **Техническая поддержка** 🛠️

🎯 **Как создать заявку:**
Профиль → Тех поддержка → Создать заявку

📋 **С чем обращаться:**
• 🐛 Баги и ошибки • ❓ Вопросы по функционалу
• 💰 Проблемы с балансом • 🎯 Задания
• 🎫 Промокоды • 👥 Рефералы • 🏆 Титулы

🎫 **Статусы заявок:**
🆕 Новая → ⚙️ В работе → ✅ Решена

⚡ **Время ответа:** обычно в течение 24 часов

💡 **Для быстрого решения:**
• Описывайте подробно проблему
• Указывайте свой ID пользователя
• Прикладывайте скриншоты если нужно`;

  await sendMessageWithPhoto(ctx, supportText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
  ]));
});

bot.action('faq_miner', async (ctx) => {
  const currentReward = calculateMinerReward();
  const dailyReward = currentReward * 24;
  const currentRate = (RESERVE_STARS / RESERVE_MAGNUM_COINS).toFixed(4);
  
  const minerText = `⛏️ **Система майнера** ⛏️

💡 **Что это такое:**
Майнер - это автоматический источник пассивного дохода. Он работает 24/7 и приносит звёзды без вашего участия!

💰 **Как работает:**
• ⛏️ Покупается за 1000 Magnum Coin
• ⏰ Работает автоматически 24/7
• 💎 Приносит ${currentReward.toFixed(4)} звезды каждый час
• 🔄 Окупается за ~45 дней
• 💱 Доход зависит от курса обмена

🛒 **Как купить:**
1️⃣ Откройте "🛒 Магазин" в главном меню
2️⃣ Выберите категорию "⛏️ Майнеры"
3️⃣ Нажмите "Купить" за 1000 Magnum Coin
4️⃣ Майнер начнет работать автоматически

📊 **Статистика:**
• ⏱️ Время работы: отображается в профиле
• 💰 Доход: ${currentReward.toFixed(4)} звезды/час = ${dailyReward.toFixed(4)} звезды/день
• 💱 Текущий курс: 1🪙 = ${currentRate}⭐
• 📈 Окупаемость: ~45 дней

🎯 **Стратегия:**
• 🎁 Сначала накопите Magnum Coin фармом
• ⛏️ Купите майнер для пассивного дохода
• 🔄 Используйте доход для покупки бустеров
• 📈 Масштабируйте доходы

💎 **Преимущества:**
• 🕐 Пассивный доход без усилий
• 📈 Стабильный источник звезд
• 🎯 Долгосрочная инвестиция
• 🏆 Помогает в достижении целей
• 💱 Доход адаптируется к курсу обмена`;

  await sendMessageWithPhoto(ctx, minerText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
  ]));
});

// Достижения
bot.action('achievements', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const userAchievements = user.achievements || [];
  
  let achievementsText = `🎖️ *ДОСТИЖЕНИЯ* 🎖️\n\n`;
  
  for (const [achievementId, achievement] of Object.entries(ACHIEVEMENTS)) {
    const isEarned = userAchievements.includes(achievementId);
    const progress = getUserProgress(user, achievement);
    const progressPercent = Math.min(100, Math.floor((progress / achievement.requirement) * 100));
    
    if (isEarned) {
      achievementsText += `✅ ${achievement.icon} *${achievement.name}*\n`;
      achievementsText += `📝 ${achievement.description}\n`;
      achievementsText += `🎁 Награда: +${achievement.reward} звёзд *(получено)*\n\n`;
    } else {
      achievementsText += `⬜ ${achievement.icon} *${achievement.name}*\n`;
      achievementsText += `📝 ${achievement.description}\n`;
      achievementsText += `📊 Прогресс: ${progress}/${achievement.requirement} (${progressPercent}%)\n`;
      achievementsText += `🎁 Награда: +${achievement.reward} звёзд\n\n`;
    }
  }
  
  const earnedCount = userAchievements.length;
  const totalCount = Object.keys(ACHIEVEMENTS).length;
  achievementsText += `📈 *Получено: ${earnedCount}/${totalCount} достижений*`;
  
  await sendMessageWithPhoto(ctx, achievementsText, Markup.inlineKeyboard([
    [Markup.button.callback('👤 Назад к профилю', 'profile')]
  ]));
});

function getUserProgress(user, achievement) {
  switch (achievement.condition) {
    case 'stars':
      return user.stars || 0;
    case 'invited':
      return user.invited || 0;
    case 'daily_streak':
      return user.dailyStreak || 0;
    case 'farm_count':
      return user.farmCount || 0;
    case 'promo_count':
      return user.promoCount || 0;
    default:
      return 0;
  }
}

// Меню техподдержки
bot.action('support_menu', async (ctx) => {
  const supportText = `🛠️ *ТЕХНИЧЕСКАЯ ПОДДЕРЖКА* 🛠️

💬 *Выберите действие:*

🆕 *Создать заявку* — описать новую проблему
📋 *Мои заявки* — посмотреть статус заявок

⚡ Наша команда ответит в течение 24 часов!`;

  ctx.editMessageText(supportText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🆕 Создать заявку', 'support_create')],
      [Markup.button.callback('📋 Мои заявки', 'my_tickets')],
      [Markup.button.callback('👤 Назад к профилю', 'profile')]
    ])
  });
});

// Создание заявки в техподдержку
bot.action('support_create', async (ctx) => {
  const supportText = `🛠️ **ТЕХНИЧЕСКАЯ ПОДДЕРЖКА** 🛠️

💬 **Опишите вашу проблему или вопрос:**

Напишите одним сообщением:
• Что случилось?
• Когда это произошло?
• Какие действия вы выполняли?

⚡ Наша команда поддержки ответит в течение 24 часов!`;

  // Удаляем текущее сообщение и отправляем новое с force_reply
  await ctx.deleteMessage();
  
  ctx.reply(supportText, {
    parse_mode: 'Markdown',
    reply_markup: {
      force_reply: true,
      input_field_placeholder: 'Опишите вашу проблему...'
    }
  });
});

// Мои заявки в поддержку
bot.action('my_tickets', async (ctx) => {
  const userTickets = await supportTickets.find({ userId: ctx.from.id }).sort({ createdAt: -1 }).limit(10).toArray();
  
  let ticketsText = `🎫 *МОИ ЗАЯВКИ В ПОДДЕРЖКУ* 🎫\n\n`;

  if (userTickets.length === 0) {
    ticketsText += '📭 У вас пока нет заявок в техподдержку.';
  } else {
      userTickets.forEach(ticket => {
    const statusInfo = TICKET_STATUSES[ticket.status];
    const date = ticket.createdAt ? ticket.createdAt.toLocaleDateString('ru-RU') : 'Неизвестно';
    const shortId = ticket._id.toString().slice(-6);
    
    ticketsText += `${statusInfo.emoji} *#${shortId}* — ${statusInfo.name}\n`;
    ticketsText += `📅 ${date} | 💬 ${ticket.message.substring(0, 50)}${ticket.message.length > 50 ? '...' : ''}\n`;
    
    if (ticket.adminResponse) {
      ticketsText += `💬 *Ответ:* ${ticket.adminResponse.substring(0, 50)}${ticket.adminResponse.length > 50 ? '...' : ''}\n`;
    }
    
    ticketsText += `\n`;
  });
  }

  ctx.editMessageText(ticketsText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🆕 Создать заявку', 'support_create')],
      [Markup.button.callback('🛠️ Назад в поддержку', 'support_menu')]
    ])
  });
});

// Уведомления фарма и бонуса
bot.action('farm', async (ctx) => {
  // Проверяем подписку
  const isSubscribed = await checkSubscription(ctx);
  if (!isSubscribed) {
    await showSubscriptionMessage(ctx);
    return;
  }
  
  const user = await getUserDirectFromDB(ctx.from.id, ctx);
  console.log(`🔥 ФАРМ: Проверяем пользователя ${ctx.from.id} с ${user.stars} звёздами`);
  const canFarm = !farmCooldownEnabled || !user.lastFarm || (now() - user.lastFarm) >= farmCooldownSeconds;
  
  if (canFarm) {
    const baseReward = calculateFarmReward(); // Используем динамическую награду
    const boostedReward = applyBoostMultiplier(baseReward, user, 'farm');
    
    await users.updateOne({ id: ctx.from.id }, { 
      $inc: { magnumCoins: boostedReward, farmCount: 1, dailyFarms: 1, totalEarnedMagnumCoins: boostedReward }, 
      $set: { lastFarm: now() } 
    });
    invalidateUserCache(ctx.from.id);
    invalidateBotStatsCache();
    
    // Проверяем задание активного фармера
    const updatedUser = await getUserDirectFromDB(ctx.from.id);
    console.log(`🔥 ФАРМ: После обновления БД - у пользователя ${ctx.from.id} теперь ${updatedUser.stars} звёзд`);
    if ((updatedUser.dailyFarms || 0) >= 10) {
      await markDailyTaskCompleted(ctx.from.id, 'farm_10');
    }
    
    // Проверяем новые титулы и достижения
    const newTitles = await checkAndAwardTitles(ctx.from.id);
    const newAchievements = await checkAndAwardAchievements(ctx.from.id);
    
    // КРИТИЧЕСКОЕ обновление интерфейса после фарма
    console.log(`🔥 ФАРМ ЗАВЕРШЕН: Обновляем интерфейс для ${ctx.from.id}`);
    await updateMainMenuBalance(ctx);
    console.log(`🔥 ИНТЕРФЕЙС ОБНОВЛЕН после фарма`);
    
    const rewardText = boostedReward > baseReward ? `+${boostedReward} Magnum Coin (🔥 БУСТ!)` : `+${boostedReward} Magnum Coin`;
    
    if (newTitles.length > 0 && newAchievements.length > 0) {
      ctx.answerCbQuery(`[🪙 ${rewardText}] [🏆 Новый титул!] [🎖️ Достижение!]`);
    } else if (newTitles.length > 0) {
      ctx.answerCbQuery(`[🪙 ${rewardText}] [🏆 Новый титул получен!]`);
    } else if (newAchievements.length > 0) {
      ctx.answerCbQuery(`[🪙 ${rewardText}] [🎖️ ${newAchievements[0].name}!]`);
    } else {
      ctx.answerCbQuery(`[🪙 ${rewardText}]`);
    }
  } else {
    const timeLeft = farmCooldownSeconds - (now() - user.lastFarm);
    ctx.answerCbQuery(`⏳ До следующего фарма: ${timeLeft} сек.`);
  }
});

bot.action('bonus', async (ctx) => {
  // Проверяем подписку
  const isSubscribed = await checkSubscription(ctx);
  if (!isSubscribed) {
    await showSubscriptionMessage(ctx);
    return;
  }
  
  const user = await getUserDirectFromDB(ctx.from.id, ctx);
  console.log(`🔥 БОНУС: Проверяем пользователя ${ctx.from.id} с ${user.stars} звёздами`);
  const today = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const canBonus = !user.lastBonus || user.lastBonus < today;
  
  console.log(`Бонус - Пользователь: ${ctx.from.id}, lastBonus: ${user.lastBonus}, today: ${today}, canBonus: ${canBonus}`);
  
  if (canBonus) {
    // Проверяем серию ежедневных заходов
    const yesterday = today - 1;
    let dailyStreak = 1;
    if (user.lastBonus === yesterday) {
      dailyStreak = (user.dailyStreak || 0) + 1;
    }
    
    const baseReward = calculateFarmReward() * 3; // Бонус в 3 раза больше фарма
    const boostedReward = applyBoostMultiplier(baseReward, user, 'bonus');
    
    await users.updateOne({ id: ctx.from.id }, { 
      $inc: { magnumCoins: boostedReward, bonusCount: 1, totalEarnedMagnumCoins: boostedReward }, 
      $set: { lastBonus: today, dailyStreak: dailyStreak } 
    });
    invalidateUserCache(ctx.from.id);
    invalidateBotStatsCache();
    
    // Отмечаем задание "ежедневный бонус"
    await markDailyTaskCompleted(ctx.from.id, 'bonus');
    
    // Проверяем новые титулы и достижения
    const newTitles = await checkAndAwardTitles(ctx.from.id);
    const newAchievements = await checkAndAwardAchievements(ctx.from.id);
    
    // КРИТИЧЕСКОЕ обновление интерфейса после бонуса
    console.log(`🔥 БОНУС ЗАВЕРШЕН: Обновляем интерфейс для ${ctx.from.id}`);
    await updateMainMenuBalance(ctx);
    console.log(`🔥 ИНТЕРФЕЙС ОБНОВЛЕН после бонуса`);
    
    const rewardText = boostedReward > baseReward ? `+${boostedReward} Magnum Coin (🔥 БУСТ!)` : `+${boostedReward} Magnum Coin`;
    
    if (newTitles.length > 0 && newAchievements.length > 0) {
      ctx.answerCbQuery(`[🎁 ${rewardText}] [🏆 Новый титул!] [🎖️ Достижение!]`);
    } else if (newTitles.length > 0) {
      ctx.answerCbQuery(`[🎁 ${rewardText}] [🏆 Новый титул!]`);
    } else if (newAchievements.length > 0) {
      ctx.answerCbQuery(`[🎁 ${rewardText}] [🎖️ ${newAchievements[0].name}!]`);
    } else {
      ctx.answerCbQuery(`[🎁 ${rewardText}] Ежедневный бонус получен!`);
    }
  } else {
    // Расчет времени до следующего дня (00:00)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const timeLeft = tomorrow.getTime() - now.getTime();
    const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    console.log(`Бонус - timeLeft: ${timeLeft}, hoursLeft: ${hoursLeft}, minutesLeft: ${minutesLeft}`);
    
    if (hoursLeft > 0) {
      ctx.answerCbQuery(`🕐 Следующий бонус через ${hoursLeft}ч ${minutesLeft}мин`);
    } else {
      ctx.answerCbQuery(`🕐 Следующий бонус через ${minutesLeft} минут`);
    }
  }
});

// Уведомления заданий
bot.action(/^claim_daily_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const task = dailyTasks.find(t => t.id === taskId);
  if (!task) return;
  
  await tasks.updateOne(
    { userId: ctx.from.id, type: 'daily' },
    { $set: { [`claimed.${taskId}`]: true } }
  );
  await users.updateOne({ id: ctx.from.id }, { $inc: { magnumCoins: task.reward, totalEarnedMagnumCoins: task.reward } });
  invalidateUserCache(ctx.from.id);
  invalidateBotStatsCache();
  
  ctx.answerCbQuery(`[🎁 +${task.reward}] Magnum Coin получено!`);
  ctx.action('daily_tasks')(ctx);
});

bot.action(/^claim_sponsor_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const task = sponsorTasks.find(t => t.id === taskId);
  if (!task) return;
  
  await tasks.updateOne(
    { userId: ctx.from.id, type: 'sponsor' },
    { $set: { [`claimed.${taskId}`]: true } }
  );
  await users.updateOne({ id: ctx.from.id }, { $inc: { magnumCoins: task.reward, totalEarnedMagnumCoins: task.reward } });
  invalidateUserCache(ctx.from.id);
  invalidateBotStatsCache();
  
  ctx.answerCbQuery(`[🎁 +${task.reward}] Magnum Coin получено!`);
  ctx.action('sponsor_tasks')(ctx);
});

bot.action(/^check_sponsor_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  await tasks.updateOne(
    { userId: ctx.from.id, type: 'sponsor' },
    { $set: { [`completed.${taskId}`]: true } }
  );
  
  ctx.answerCbQuery('✅ Задание выполнено!');
  ctx.action('sponsor_tasks')(ctx);
});

connectDB().then(() => {
  console.log('🚀 Запускаем бота...');
  
  // Добавляем глобальное логирование всех событий
  bot.use(async (ctx, next) => {
    console.log('🔄 Событие:', ctx.updateType, 'от пользователя:', ctx.from?.id, ctx.from?.first_name);
    if (ctx.message) {
      console.log('📨 Тип сообщения:', ctx.message.text ? 'text' : 'other');
    }
    if (ctx.callbackQuery) {
      console.log('🔘 Callback data:', ctx.callbackQuery.data);
    }
    return next();
  });
  
  bot.launch();
  console.log('✅ Бот запущен успешно!');
  console.log('📱 Готов к обработке сообщений');
}).catch(error => {
  console.error('❌ Ошибка запуска бота:', error);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Обработчики кнопок из канала поддержки
bot.action(/^ticket_accept_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  const objectId = new ObjectId(ticketId);
  await updateTicketStatus(objectId, 'in_progress');
  await notifyUserStatusChange(objectId, 'принята в работу ⚙️');
  await updateTicketInChannel(objectId);
  
  ctx.answerCbQuery('✅ Заявка принята в работу');
});

bot.action(/^ticket_reject_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  const objectId = new ObjectId(ticketId);
  await updateTicketStatus(objectId, 'rejected');
  await notifyUserStatusChange(objectId, 'отклонена ❌');
  await updateTicketInChannel(objectId);
  
  ctx.answerCbQuery('❌ Заявка отклонена');
});

bot.action(/^ticket_resolve_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  const objectId = new ObjectId(ticketId);
  await updateTicketStatus(objectId, 'resolved');
  await notifyUserStatusChange(objectId, 'решена ✅');
  await updateTicketInChannel(objectId);
  
  ctx.answerCbQuery('✅ Заявка решена');
});

bot.action(/^ticket_close_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  const objectId = new ObjectId(ticketId);
  await updateTicketStatus(objectId, 'closed');
  await notifyUserStatusChange(objectId, 'закрыта 🔒');
  await updateTicketInChannel(objectId);
  
  ctx.answerCbQuery('🔒 Заявка закрыта');
});

// Навигация по заданиям спонсоров
bot.action(/^sponsor_task_(\d+)$/, async (ctx) => {
  const taskIndex = parseInt(ctx.match[1]);
  showSponsorTask(ctx, taskIndex);
});

// Выполнение задания
bot.action(/^task_complete_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const task = SPONSOR_TASKS.find(t => t.id === taskId);
  
  if (!task) {
    return ctx.answerCbQuery('❌ Задание не найдено');
  }

  await ctx.deleteMessage();
  
  ctx.reply(
    `📷 Подтверждение выполнения задания\n\n` +
    `📋 Задание: ${task.title}\n` +
    `📝 Инструкция: ${task.instruction}\n\n` +
    `Отправьте скриншот выполнения:\n\n` +
    `🆔 ID задания: ${task.id}`,
    {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Отправьте скриншот...'
      }
    }
  );
});

// Обработчики проверки заданий в канале
bot.action(/^task_approve_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const checkId = ctx.match[1];
  const objectId = new ObjectId(checkId);
  
  const taskCheck = await taskChecks.findOne({ _id: objectId });
  if (!taskCheck) {
    return ctx.answerCbQuery('❌ Проверка не найдена');
  }
  
  const task = SPONSOR_TASKS.find(t => t.id === taskCheck.taskId);
  if (!task) {
    return ctx.answerCbQuery('❌ Задание не найдено');
  }
  
  // Обновляем статус
  await updateTaskCheckStatus(objectId, 'approved');
  
  // Начисляем награду
  await users.updateOne(
    { id: taskCheck.userId },
    { $inc: { stars: task.reward } }
  );
  
  // Уведомляем пользователя
  try {
    await bot.telegram.sendMessage(
      taskCheck.userId,
      `✅ *Задание одобрено!*\n\n` +
      `📋 *Задание:* ${task.title}\n` +
      `🎁 *Получено:* +${task.reward} звёзд\n\n` +
      `Поздравляем с успешным выполнением!`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Ошибка уведомления пользователя:', error);
  }
  
  await updateTaskCheckInChannel(objectId);
  ctx.answerCbQuery('✅ Задание одобрено');
});

bot.action(/^task_reject_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const checkId = ctx.match[1];
  const objectId = new ObjectId(checkId);
  
  const taskCheck = await taskChecks.findOne({ _id: objectId });
  if (!taskCheck) {
    return ctx.answerCbQuery('❌ Проверка не найдена');
  }
  
  const task = SPONSOR_TASKS.find(t => t.id === taskCheck.taskId);
  
  // Обновляем статус
  await updateTaskCheckStatus(objectId, 'rejected');
  
  // Уведомляем пользователя
  try {
    await bot.telegram.sendMessage(
      taskCheck.userId,
      `❌ *Задание отклонено*\n\n` +
      `📋 *Задание:* ${task ? task.title : 'Неизвестно'}\n\n` +
      `Попробуйте выполнить задание снова согласно инструкции.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Ошибка уведомления пользователя:', error);
  }
  
  await updateTaskCheckInChannel(objectId);
  ctx.answerCbQuery('❌ Задание отклонено');
});

bot.action(/^task_reply_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const checkId = ctx.match[1];
  
  try {
    await bot.telegram.sendMessage(
      ctx.from.id,
      `💬 *Ответ по проверке задания #${checkId.slice(-6)}*\n\nВведите ваш комментарий:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true,
          input_field_placeholder: 'Введите комментарий для пользователя...'
        }
      }
    );
    
    ctx.answerCbQuery('💬 Проверьте личные сообщения для ответа');
  } catch (error) {
    console.error('Ошибка отправки приглашения к ответу:', error);
    ctx.answerCbQuery('❌ Ошибка! Убедитесь, что бот может писать в личные сообщения');
  }
});

bot.action(/^ticket_reply_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  
  try {
    // Отправляем приглашение к ответу в личные сообщения админу
    await bot.telegram.sendMessage(
      ctx.from.id,
      `💬 *Ответ пользователю по заявке #${ticketId.slice(-6)}*\n\nВведите ваш ответ:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true,
          input_field_placeholder: 'Введите ваш ответ пользователю...'
        }
      }
    );
    
    ctx.answerCbQuery('💬 Проверьте личные сообщения для ответа');
  } catch (error) {
    console.error('Ошибка отправки приглашения к ответу:', error);
    ctx.answerCbQuery('❌ Ошибка! Убедитесь, что бот может писать в личные сообщения');
  }
});
// Функция автоматической работы майнера
async function processMinerRewards() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const oneHour = 3600; // 1 час в секундах
    
    // Находим всех пользователей с активными майнерами
    const usersWithMiners = await users.find({
      'miner.active': true,
      'miner.lastReward': { $lt: now - oneHour }
    }).toArray();
    
    console.log(`🔍 Найдено ${usersWithMiners.length} пользователей с активными майнерами для выплаты`);
    
    for (const user of usersWithMiners) {
      const timeSinceLastReward = now - (user.miner.lastReward || 0);
      const hoursElapsed = Math.floor(timeSinceLastReward / oneHour);
      
      if (hoursElapsed > 0) {
        // Рассчитываем динамический доход на основе текущего курса звёзд
        const rewardPerHour = calculateMinerReward();
        const totalReward = hoursElapsed * rewardPerHour;
        
        console.log(`⛏️ Майнер ${user.id}: ${rewardPerHour}⭐/час, ${hoursElapsed}ч = ${totalReward}⭐`);
        
        // Выдаем награду
        await users.updateOne(
          { id: user.id },
          {
            $inc: { 
              stars: totalReward,
              'miner.totalEarned': totalReward
            },
            $set: { 'miner.lastReward': now }
          }
        );
        
        invalidateUserCache(user.id);
        console.log(`⛏️ Майнер пользователя ${user.id} выдал ${totalReward} звезд за ${hoursElapsed} часов`);
        
        // Отправляем уведомление пользователю (если возможно)
        try {
          const currentRate = (RESERVE_STARS / RESERVE_MAGNUM_COINS).toFixed(4);
          await bot.telegram.sendMessage(user.id, 
            `⛏️ **Майнер принес доход!**\n\n` +
            `💎 Получено: ${totalReward.toFixed(4)} ⭐ звезд\n` +
            `⏰ За период: ${hoursElapsed} час(ов)\n` +
            `📈 Доход в час: ${rewardPerHour.toFixed(4)} ⭐\n` +
            `📊 Всего заработано: ${((user.miner.totalEarned || 0) + totalReward).toFixed(4)} ⭐\n` +
            `💱 Текущий курс: 1🪙 = ${currentRate}⭐\n\n` +
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

// Запускаем обработку майнеров каждые 30 минут
setInterval(processMinerRewards, 30 * 60 * 1000); // 30 минут

// Глобальная обработка ошибок для предотвращения краха бота
bot.catch(async (err, ctx) => {
  console.error('🚨 Глобальная ошибка бота:', err);
  console.error('📍 Контекст ошибки:', {
    updateType: ctx.updateType,
    userId: ctx.from?.id,
    chatId: ctx.chat?.id,
    messageText: ctx.message?.text,
    callbackData: ctx.callbackQuery?.data
  });
  
  // Пытаемся отправить пользователю уведомление об ошибке
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⚠️ Временно недоступно. Повторите через пару секунд.', { show_alert: true });
    } else if (ctx.message) {
      await ctx.reply('⚠️ Временно недоступно. Повторите через пару секунд.', {
        reply_markup: {
          inline_keyboard: [[
            { text: '🏠 Главное меню', callback_data: 'main_menu' }
          ]]
        }
      });
    }
  } catch (notifyError) {
    console.error('❌ Не удалось уведомить пользователя об ошибке:', notifyError);
  }
});

// Глобальная обработка необработанных промисов
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Необработанный отказ промиса:', reason);
  console.error('📍 Promise:', promise);
});

// Глобальная обработка необработанных исключений
process.on('uncaughtException', (error) => {
  console.error('💥 Необработанное исключение:', error);
  console.error('📍 Stack trace:', error.stack);
  
  // Не выходим из процесса, пытаемся продолжить работу
  console.log('�� Пытаемся продолжить работу бота...');
});
