require('dotenv').config();

module.exports = {
  // Основные настройки бота
  BOT_TOKEN: process.env.BOT_TOKEN,
  MONGODB_URI: process.env.MONGODB_URI,
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [],
  
  // Каналы
  SUPPORT_CHANNEL: process.env.SUPPORT_CHANNEL,
  WITHDRAWAL_CHANNEL: process.env.WITHDRAWAL_CHANNEL,
  REQUIRED_CHANNEL: process.env.REQUIRED_CHANNEL,
  PROMO_NOTIFICATIONS_CHAT: process.env.PROMO_NOTIFICATIONS_CHAT,
  
  // Ссылки
  REQUIRED_BOT_LINK: process.env.REQUIRED_BOT_LINK || 'https://t.me/ReferalStarsRobot?start=6587897295',
  FIRESTARS_BOT_LINK: process.env.FIRESTARS_BOT_LINK || 'https://t.me/firestars_rbot?start=6587897295',
  FARMIK_BOT_LINK: process.env.FARMIK_BOT_LINK || 'https://t.me/farmikstars_bot?start=6587897295',
  BASKET_BOT_LINK: process.env.BASKET_BOT_LINK || 'https://t.me/basket_gift_bot?start=6587897295',
  
  // Настройки кеширования
  USER_CACHE_TTL: 5 * 60 * 1000, // 5 минут вместо 30 секунд
  BOT_STATS_CACHE_TTL: 2 * 60 * 1000, // 2 минуты вместо 30 секунд
  
  // Настройки rate limiting
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 минута
  RATE_LIMIT_MAX_REQUESTS: 30, // максимум 30 запросов в минуту
  
  // Настройки фарма
  FARM_COOLDOWN_DEFAULT: 10, // секунд
  FARM_COOLDOWN_ENABLED: true,
  
  // Настройки обмена
  EXCHANGE_COMMISSION: 2.5, // 2.5%
  EXCHANGE_COOLDOWN: 5, // секунд между обменами
  
  // Настройки майнера
  MINER_REWARD_PER_HOUR: 0.1, // звезд в час
  MINER_PROCESS_INTERVAL: 30 * 60 * 1000, // 30 минут
  
  // Настройки резерва
  INITIAL_RESERVE_MAGNUM_COINS: 1000000,
  INITIAL_RESERVE_STARS: 1000000,
  
  // Статусы заявок
  WITHDRAWAL_STATUSES: {
    'pending': { name: '⏳ На рассмотрении', color: '🟡' },
    'approved': { name: '✅ Одобрено', color: '🟢' },
    'rejected': { name: '❌ Отклонено', color: '🔴' },
    'processing': { name: '🔄 В обработке', color: '🔵' },
    'completed': { name: '✅ Выполнено', color: '🟢' }
  },
  
  REJECTION_REASONS: {
    'fraud': { name: '🚫 Накрутка активности', description: 'Обнаружены признаки накрутки активности или использования ботов' },
    'bug_abuse': { name: '🐛 Злоупотребление багами', description: 'Использование багов или уязвимостей для получения звёзд' },
    'multi_account': { name: '👥 Мультиаккаунтинг', description: 'Использование нескольких аккаунтов одним пользователем' },
    'insufficient_activity': { name: '📊 Недостаточная активность', description: 'Слишком низкая активность для такого количества звёзд' },
    'suspicious_pattern': { name: '🔍 Подозрительная активность', description: 'Обнаружены подозрительные паттерны в активности' },
    'other': { name: '❓ Другая причина', description: 'Причина будет указана дополнительно' }
  }
};