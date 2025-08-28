const config = require('../config/constants');
const logger = require('./logger');

class ValidationService {
  constructor() {
    this.rateLimits = new Map();
    this.spamProtection = new Map();
  }

  // Валидация пользователя
  validateUser(user) {
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    if (!user.userId || typeof user.userId !== 'number') {
      throw new Error('Некорректный ID пользователя');
    }

    if (!user.username && !user.firstName) {
      throw new Error('Отсутствует имя пользователя');
    }

    return true;
  }

  // Валидация баланса
  validateBalance(user) {
    if (!user.magnumCoins || user.magnumCoins < 0) {
      logger.warn(`Некорректный баланс MC для пользователя ${user.userId}: ${user.magnumCoins}`);
      return false;
    }

    if (!user.stars || user.stars < 0) {
      logger.warn(`Некорректный баланс Stars для пользователя ${user.userId}: ${user.stars}`);
      return false;
    }

    return true;
  }

  // Валидация майнеров
  validateMiners(user) {
    const miners = user.miners || {};
    
    // Проверка Magnum Coin майнеров
    if (miners.magnumCoinMiner) {
      if (miners.magnumCoinMiner < 0 || miners.magnumCoinMiner > 1000) {
        logger.warn(`Некорректное количество MC майнеров для пользователя ${user.userId}: ${miners.magnumCoinMiner}`);
        return false;
      }
    }

    // Проверка Star майнеров
    if (miners.starMiner) {
      if (miners.starMiner < 0 || miners.starMiner > 1000) {
        logger.warn(`Некорректное количество Star майнеров для пользователя ${user.userId}: ${miners.starMiner}`);
        return false;
      }
    }

    return true;
  }

  // Валидация начислений
  validateRewards(userId, rewards) {
    if (!rewards) {
      throw new Error('Отсутствуют данные о наградах');
    }

    // Проверка Magnum Coins
    if (rewards.magnumCoins !== undefined) {
      if (typeof rewards.magnumCoins !== 'number' || rewards.magnumCoins < 0) {
        logger.error(`Некорректная награда MC для пользователя ${userId}: ${rewards.magnumCoins}`);
        return false;
      }

      // Максимальная награда за раз
      if (rewards.magnumCoins > 1000000) {
        logger.warn(`Подозрительно большая награда MC для пользователя ${userId}: ${rewards.magnumCoins}`);
      }
    }

    // Проверка Stars
    if (rewards.stars !== undefined) {
      if (typeof rewards.stars !== 'number' || rewards.stars < 0) {
        logger.error(`Некорректная награда Stars для пользователя ${userId}: ${rewards.stars}`);
        return false;
      }

      // Максимальная награда за раз
      if (rewards.stars > 10000) {
        logger.warn(`Подозрительно большая награда Stars для пользователя ${userId}: ${rewards.stars}`);
      }
    }

    return true;
  }

  // Валидация скорости майнинга
  validateMiningSpeed(speed) {
    if (!speed || typeof speed !== 'object') {
      return false;
    }

    // Проверка скорости MC
    if (speed.magnumCoins !== undefined) {
      if (typeof speed.magnumCoins !== 'number' || speed.magnumCoins < 0) {
        return false;
      }
    }

    // Проверка скорости Stars
    if (speed.stars !== undefined) {
      if (typeof speed.stars !== 'number' || speed.stars < 0) {
        return false;
      }
    }

    return true;
  }

  // Валидация RichAds оффера
  validateRichAdsOffer(offer) {
    if (!offer) {
      throw new Error('Оффер не найден');
    }

    if (!offer.id || !offer.title || !offer.reward) {
      logger.warn('Некорректный оффер RichAds:', offer);
      return false;
    }

    if (typeof offer.reward !== 'number' || offer.reward <= 0) {
      logger.warn(`Некорректная награда оффера ${offer.id}: ${offer.reward}`);
      return false;
    }

    return true;
  }

  // Валидация скриншота
  validateScreenshot(ctx) {
    if (!ctx.message || !ctx.message.photo) {
      throw new Error('Скриншот не найден');
    }

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    
    if (!photo || !photo.file_id) {
      throw new Error('Некорректный файл скриншота');
    }

    // Проверка размера файла (максимум 10MB)
    if (photo.file_size && photo.file_size > 10 * 1024 * 1024) {
      throw new Error('Файл слишком большой (максимум 10MB)');
    }

    return photo;
  }

  // Rate limiting для команд
  checkRateLimit(userId, command, limit = 10, windowMs = 60000) {
    const key = `${userId}_${command}`;
    const now = Date.now();
    const userCommands = this.rateLimits.get(key) || [];

    // Удаляем старые команды
    const recentCommands = userCommands.filter(time => now - time < windowMs);

    if (recentCommands.length >= limit) {
      logger.warn(`Rate limit превышен для пользователя ${userId}, команда ${command}`);
      return false;
    }

    recentCommands.push(now);
    this.rateLimits.set(key, recentCommands);
    return true;
  }

  // Защита от спама
  checkSpamProtection(userId, action, limit = 5, windowMs = 300000) {
    const key = `${userId}_${action}`;
    const now = Date.now();
    const userActions = this.spamProtection.get(key) || [];

    // Удаляем старые действия
    const recentActions = userActions.filter(time => now - time < windowMs);

    if (recentActions.length >= limit) {
      logger.warn(`Spam protection сработал для пользователя ${userId}, действие ${action}`);
      return false;
    }

    recentActions.push(now);
    this.spamProtection.set(key, recentActions);
    return true;
  }

  // Валидация промокода
  validatePromocode(code) {
    if (!code || typeof code !== 'string') {
      return false;
    }

    // Минимальная и максимальная длина
    if (code.length < 3 || code.length > 20) {
      return false;
    }

    // Только буквы, цифры и дефисы
    if (!/^[a-zA-Z0-9-]+$/.test(code)) {
      return false;
    }

    return true;
  }

  // Валидация суммы обмена
  validateExchangeAmount(amount, currency) {
    if (typeof amount !== 'number' || amount <= 0) {
      return false;
    }

    // Максимальные суммы обмена
    const maxAmounts = {
      magnumCoins: 1000000,
      stars: 10000
    };

    if (amount > maxAmounts[currency]) {
      return false;
    }

    return true;
  }

  // Валидация времени последнего майнинга
  validateMiningTime(lastMiningTime) {
    if (!lastMiningTime) {
      return true; // Первый майнинг
    }

    const now = Date.now();
    const timeDiff = now - lastMiningTime;

    // Минимальный интервал между майнингами (1 секунда)
    if (timeDiff < 1000) {
      return false;
    }

    return true;
  }

  // Очистка старых данных
  cleanup() {
    const now = Date.now();
    
    // Очистка rate limits
    for (const [key, times] of this.rateLimits.entries()) {
      const recentTimes = times.filter(time => now - time < 60000);
      if (recentTimes.length === 0) {
        this.rateLimits.delete(key);
      } else {
        this.rateLimits.set(key, recentTimes);
      }
    }

    // Очистка spam protection
    for (const [key, times] of this.spamProtection.entries()) {
      const recentTimes = times.filter(time => now - time < 300000);
      if (recentTimes.length === 0) {
        this.spamProtection.delete(key);
      } else {
        this.spamProtection.set(key, recentTimes);
      }
    }
  }

  // Получение статистики валидации
  getStats() {
    return {
      rateLimits: this.rateLimits.size,
      spamProtection: this.spamProtection.size,
      totalRateLimited: Array.from(this.rateLimits.values()).reduce((sum, times) => sum + times.length, 0),
      totalSpamBlocked: Array.from(this.spamProtection.values()).reduce((sum, times) => sum + times.length, 0)
    };
  }
}

// Создаем экземпляр и запускаем периодическую очистку
const validationService = new ValidationService();

// Очистка каждые 5 минут
setInterval(() => {
  validationService.cleanup();
}, 5 * 60 * 1000);

module.exports = validationService;

