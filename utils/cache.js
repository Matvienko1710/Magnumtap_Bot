const config = require('../config/constants');
const logger = require('./logger');

class Cache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  // Установка значения в кэш
  set(key, value, ttl = config.CACHE_TTL) {
    // Удаляем существующий таймер если есть
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Устанавливаем значение
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });

    // Устанавливаем таймер для автоматического удаления
    const timer = setTimeout(() => {
      this.delete(key);
    }, ttl);

    this.timers.set(key, timer);
    
    logger.debug(`Кэш установлен: ${key}`, { ttl });
  }

  // Получение значения из кэша
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      logger.debug(`Кэш не найден: ${key}`);
      return null;
    }

    // Проверяем, не истек ли срок действия
    if (Date.now() - item.timestamp > item.ttl) {
      this.delete(key);
      logger.debug(`Кэш истек: ${key}`);
      return null;
    }

    logger.debug(`Кэш найден: ${key}`);
    return item.value;
  }

  // Проверка существования ключа
  has(key) {
    return this.get(key) !== null;
  }

  // Удаление значения из кэша
  delete(key) {
    const item = this.cache.get(key);
    if (item) {
      this.cache.delete(key);
      
      // Очищаем таймер
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      }
      
      logger.debug(`Кэш удален: ${key}`);
    }
  }

  // Очистка всего кэша
  clear() {
    // Очищаем все таймеры
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    
    this.cache.clear();
    this.timers.clear();
    
    logger.info('Весь кэш очищен');
  }

  // Получение статистики кэша
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  // Специальные методы для кэширования майнинга
  setMiningStats(userId, stats) {
    this.set(`mining_${userId}`, stats, config.MINING_CACHE_TTL);
  }

  getMiningStats(userId) {
    return this.get(`mining_${userId}`);
  }

  // Специальные методы для кэширования пользователей
  setUser(userId, userData) {
    this.set(`user_${userId}`, userData, config.CACHE_TTL);
  }

  getUser(userId) {
    return this.get(`user_${userId}`);
  }

  // Специальные методы для кэширования RichAds офферов
  setRichAdsOffers(offers) {
    this.set('richads_offers', offers, 300000); // 5 минут
  }

  getRichAdsOffers() {
    return this.get('richads_offers');
  }
}

module.exports = new Cache();

