const config = require('./config');

class Cache {
  constructor() {
    this.userCache = new Map();
    this.statsCache = null;
    this.statsCacheTime = 0;
    this.rateLimitCache = new Map();
    
    // Очистка устаревших записей каждые 5 минут
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  // Кеширование пользователей
  getUser(userId) {
    const cacheKey = userId.toString();
    const cached = this.userCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < config.USER_CACHE_TTL) {
      return cached.user;
    }
    
    return null;
  }

  setUser(userId, user) {
    const cacheKey = userId.toString();
    this.userCache.set(cacheKey, {
      user,
      timestamp: Date.now()
    });
  }

  invalidateUser(userId) {
    this.userCache.delete(userId.toString());
  }

  // Кеширование статистики
  getStats() {
    const now = Date.now();
    if (this.statsCache && (now - this.statsCacheTime) < config.BOT_STATS_CACHE_TTL) {
      return this.statsCache;
    }
    return null;
  }

  setStats(stats) {
    this.statsCache = stats;
    this.statsCacheTime = Date.now();
  }

  invalidateStats() {
    this.statsCache = null;
    this.statsCacheTime = 0;
  }

  // Rate limiting
  checkRateLimit(userId) {
    const now = Date.now();
    const cacheKey = userId.toString();
    const userRequests = this.rateLimitCache.get(cacheKey) || [];
    
    // Удаляем старые запросы
    const validRequests = userRequests.filter(time => 
      (now - time) < config.RATE_LIMIT_WINDOW
    );
    
    // Проверяем лимит
    if (validRequests.length >= config.RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }
    
    // Добавляем новый запрос
    validRequests.push(now);
    this.rateLimitCache.set(cacheKey, validRequests);
    
    return true;
  }

  // Очистка устаревших записей
  cleanup() {
    const now = Date.now();
    
    // Очистка кеша пользователей
    for (const [key, value] of this.userCache.entries()) {
      if ((now - value.timestamp) > config.USER_CACHE_TTL) {
        this.userCache.delete(key);
      }
    }
    
    // Очистка rate limit кеша
    for (const [key, requests] of this.rateLimitCache.entries()) {
      const validRequests = requests.filter(time => 
        (now - time) < config.RATE_LIMIT_WINDOW
      );
      
      if (validRequests.length === 0) {
        this.rateLimitCache.delete(key);
      } else {
        this.rateLimitCache.set(key, validRequests);
      }
    }
    
    // Очистка статистики
    if (this.statsCache && (now - this.statsCacheTime) > config.BOT_STATS_CACHE_TTL) {
      this.invalidateStats();
    }
  }

  // Получение статистики кеша
  getCacheStats() {
    return {
      userCacheSize: this.userCache.size,
      rateLimitCacheSize: this.rateLimitCache.size,
      statsCacheValid: this.statsCache !== null,
      memoryUsage: process.memoryUsage()
    };
  }

  // Полная очистка кеша
  clear() {
    this.userCache.clear();
    this.rateLimitCache.clear();
    this.invalidateStats();
  }
}

module.exports = new Cache();