require('dotenv').config();

module.exports = {
  // Основные настройки бота
  BOT_TOKEN: process.env.BOT_TOKEN,
  MONGODB_URI: process.env.MONGODB_URI,
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [],
  
  // Каналы и ссылки
  REQUIRED_CHANNEL: process.env.REQUIRED_CHANNEL || null,
  REQUIRED_BOT_LINK: process.env.REQUIRED_BOT_LINK || null,
  SUPPORT_CHANNEL: process.env.SUPPORT_CHANNEL || null,
  WITHDRAWAL_CHANNEL: process.env.WITHDRAWAL_CHANNEL || null,
  PRIVATE_CHANNEL_LINK: process.env.PRIVATE_CHANNEL_LINK || null,
  PROMO_NOTIFICATIONS_CHAT: process.env.PROMO_NOTIFICATIONS_CHAT || null,
  
  // Настройки кеширования
  USER_CACHE_TTL: 5 * 60 * 1000, // 5 минут
  BOT_STATS_CACHE_TTL: 2 * 60 * 1000, // 2 минуты
  
  // Rate limiting
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 минута
  RATE_LIMIT_MAX_REQUESTS: 30, // максимум 30 запросов в минуту
  
  // Игровые настройки
  FARM_COOLDOWN_DEFAULT: 60, // 60 секунд между фармами
  EXCHANGE_COMMISSION: 2.5, // 2.5% комиссия за обмен
  MINER_PROCESS_INTERVAL: 30 * 60 * 1000, // 30 минут
  
  // Начальные значения
  INITIAL_STARS: 100,
  INITIAL_MAGNUM_COINS: 0,
  INITIAL_RESERVE_MAGNUM_COINS: 1000000,
  INITIAL_RESERVE_STARS: 1000000,
  
  // Награды
  FARM_BASE_REWARD: 0.01,
  DAILY_BONUS_BASE: 3,
  REFERRAL_BONUS: 50,
  MINER_REWARD_PER_HOUR: 0.1,
  
  // Лимиты
  MIN_WITHDRAWAL_AMOUNT: 100,
  MAX_WITHDRAWAL_AMOUNT: 10000,
  
  // Статусы
  WITHDRAWAL_STATUSES: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    COMPLETED: 'completed'
  },
  
  TICKET_STATUSES: {
    NEW: 'new',
    IN_PROGRESS: 'in_progress',
    RESOLVED: 'resolved',
    REJECTED: 'rejected',
    CLOSED: 'closed'
  },
  
  // Титулы и достижения
  TITLES: {
    NEWBIE: {
      id: 'newbie',
      name: '🌱 Новичок',
      description: 'Начал путь в MagnumTap',
      requirement: { type: 'registration' }
    },
    FARMER: {
      id: 'farmer',
      name: '⚡ Фармер',
      description: 'Выполнил 50 действий фарминга',
      requirement: { type: 'farm_count', value: 50 }
    },
    COLLECTOR: {
      id: 'collector',
      name: '💎 Коллекционер',
      description: 'Собрал 100 звезд',
      requirement: { type: 'stars', value: 100 }
    },
    AMBASSADOR: {
      id: 'ambassador',
      name: '🤝 Амбассадор',
      description: 'Пригласил 5 друзей',
      requirement: { type: 'invited', value: 5 }
    },
    REGULAR: {
      id: 'regular',
      name: '📅 Постоянный посетитель',
      description: '7 дней подряд заходил в бота',
      requirement: { type: 'daily_streak', value: 7 }
    },
    BONUS_HUNTER: {
      id: 'bonushunter',
      name: '🎁 Охотник за бонусами',
      description: 'Собрал 30 ежедневных бонусов',
      requirement: { type: 'bonus_count', value: 30 }
    },
    PROMO_MASTER: {
      id: 'promomaster',
      name: '🎫 Мастер промокодов',
      description: 'Активировал 10 промокодов',
      requirement: { type: 'promo_count', value: 10 }
    },
    TASK_WARRIOR: {
      id: 'taskwarrior',
      name: '⚔️ Воин заданий',
      description: 'Выполнил 100 заданий',
      requirement: { type: 'task_count', value: 100 }
    },
    STAR_LORD: {
      id: 'starlord',
      name: '🌟 Звёздный лорд',
      description: 'Собрал 500 звезд',
      requirement: { type: 'stars', value: 500 }
    },
    LEGEND: {
      id: 'legend',
      name: '👑 Легенда',
      description: 'Собрал 1000 звезд и пригласил 20 друзей',
      requirement: { type: 'legend', values: { stars: 1000, invited: 20 } }
    }
  },
  
  // Секретные титулы
  SECRET_TITLES: {
    EARLY_BIRD: {
      id: 'earlybird',
      name: '🌅 Ранняя пташка',
      description: 'Секретный титул за особую активность',
      requirement: { type: 'secret', condition: 'early_activity' }
    },
    NIGHT_OWL: {
      id: 'nightowl',
      name: '🦉 Ночная сова',
      description: 'Секретный титул для ночных игроков',
      requirement: { type: 'secret', condition: 'night_activity' }
    },
    VIP_ELITE: {
      id: 'vipelite',
      name: '💫 VIP Элита',
      description: 'Эксклюзивный титул от администрации',
      requirement: { type: 'admin_grant' }
    }
  },
  
  // Ранги пользователей
  RANKS: [
    { id: 'newbie', name: '🆕 Новичок', minStars: 0, color: '#9E9E9E' },
    { id: 'beginner', name: '🌱 Новичок', minStars: 10, color: '#2196F3' },
    { id: 'advanced', name: '⭐ Продвинутый', minStars: 50, color: '#4CAF50' },
    { id: 'expert', name: '💎 Эксперт', minStars: 100, color: '#CD7F32' },
    { id: 'master', name: '🌟 Мастер', minStars: 500, color: '#C0C0C0' },
    { id: 'legend', name: '👑 Легенда', minStars: 1000, color: '#FFD700' }
  ],
  
  // Ежедневные задания
  DAILY_TASKS: [
    {
      id: 'farm',
      title: 'Фарм 10 раз',
      description: 'Выполните фарм звезд 10 раз',
      reward: 5,
      requirement: { type: 'farm_count', value: 10 }
    },
    {
      id: 'bonus',
      title: 'Получить ежедневный бонус',
      description: 'Получите ежедневный бонус',
      reward: 3,
      requirement: { type: 'daily_bonus', value: 1 }
    },
    {
      id: 'referral',
      title: 'Пригласить друга',
      description: 'Пригласите одного друга по реферальной ссылке',
      reward: 10,
      requirement: { type: 'new_referral', value: 1 }
    },
    {
      id: 'promo',
      title: 'Активировать промокод',
      description: 'Активируйте любой промокод',
      reward: 2,
      requirement: { type: 'promo_activation', value: 1 }
    }
  ],
  
  // Настройки майнера
  MINER: {
    REWARD_PER_HOUR: 0.1,
    PROCESS_INTERVAL: 30 * 60 * 1000, // 30 минут
    MAX_ACTIVE_MINERS: 1000
  },
  
  // Настройки обмена
  EXCHANGE: {
    COMMISSION: 2.5, // 2.5%
    MIN_AMOUNT: 1,
    MAX_AMOUNT: 10000,
    RATE_UPDATE_INTERVAL: 5 * 60 * 1000 // 5 минут
  },
  
  // Настройки вывода
  WITHDRAWAL: {
    MIN_AMOUNT: 100,
    MAX_AMOUNT: 10000,
    PROCESSING_TIME: '1-24 часа',
    SUPPORTED_METHODS: ['USDT', 'BTC', 'ETH']
  },
  
  // Настройки поддержки
  SUPPORT: {
    MAX_TICKETS_PER_USER: 5,
    AUTO_CLOSE_DAYS: 7,
    RESPONSE_TIME: '24 часа'
  },
  
  // Настройки уведомлений
  NOTIFICATIONS: {
    MINER_REWARDS: true,
    ACHIEVEMENTS: true,
    DAILY_BONUS: true,
    SYSTEM_UPDATES: true
  },
  
  // Настройки безопасности
  SECURITY: {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 минут
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000 // 24 часа
  },
  
  // Настройки логирования
  LOGGING: {
    LEVEL: process.env.LOG_LEVEL || 'info',
    FILE: process.env.LOG_FILE || 'bot.log',
    MAX_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_FILES: 5
  },
  
  // Настройки производительности
  PERFORMANCE: {
    DB_POOL_SIZE: 10,
    CACHE_CLEANUP_INTERVAL: 10 * 60 * 1000, // 10 минут
    STATS_UPDATE_INTERVAL: 5 * 60 * 1000 // 5 минут
  }
};