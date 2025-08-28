// Конфигурационные константы для Magnum Bot
module.exports = {
  // Основные настройки бота
  BOT_TOKEN: process.env.BOT_TOKEN,
  MONGODB_URI: process.env.MONGODB_URI,
  
  // RichAds настройки
  RICHADS_API_KEY: process.env.RICHADS_API_KEY,
  RICHADS_PUBLISHER_ID: process.env.RICHADS_PUBLISHER_ID,
  RICHADS_SITE_ID: process.env.RICHADS_SITE_ID,
  RICHADS_API_URL: process.env.RICHADS_API_URL || 'https://11745.direct.4armn.com',
  
  // WebApp настройки
  WEBAPP_ENABLED: process.env.WEBAPP_ENABLED === 'true',
  WEBAPP_ADMIN_ONLY: process.env.WEBAPP_ADMIN_ONLY === 'true',
  WEBAPP_FARM_COOLDOWN_SEC: parseInt(process.env.WEBAPP_FARM_COOLDOWN_SEC || '5'),
  WEBAPP_URL: process.env.WEBAPP_URL || 'https://your-domain.com',
  
  // Администраторы
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [],
  
  // Настройки майнинга
  MINING_REWARD_INTERVAL: 60, // секунды
  MINING_MULTIPLIER: 1.0,
  
  // Настройки кэширования
  CACHE_TTL: 30000, // 30 секунд
  MINING_CACHE_TTL: 30000, // 30 секунд для майнинга
  
  // Настройки логирования
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_TO_FILE: process.env.LOG_TO_FILE === 'true',
  
  // Настройки API
  API_TIMEOUT: 10000, // 10 секунд
  API_RETRY_ATTEMPTS: 3,
  
  // Настройки базы данных
  DB_CONNECTION_TIMEOUT: 30000,
  DB_POOL_SIZE: 10,
  
  // Настройки UptimeRobot
  UPTIMEROBOT_ENABLED: process.env.UPTIMEROBOT_ENABLED === 'true',
  
  // Настройки развертывания
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development'
};

