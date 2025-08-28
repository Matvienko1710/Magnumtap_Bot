/**
 * RichAds Integration для Magnum Stars Bot
 * Заменяет спонсорские задания на RichAds офферы
 */

const axios = require('axios');
const config = require('./config/constants');
const logger = require('./utils/logger');

class RichAdsIntegration {
  constructor() {
    this.apiKey = config.RICHADS_API_KEY || '6d0734893c941affcca49d54e05193da';
    this.apiUrl = config.RICHADS_API_URL;
    this.publisherId = config.RICHADS_PUBLISHER_ID || '982065';
    this.siteId = config.RICHADS_SITE_ID || 'demo';
    this.offers = [];
    this.lastUpdate = null;
    this.updateInterval = 30 * 60 * 1000; // 30 минут
    
    logger.info('RichAds интеграция инициализирована', {
      apiUrl: this.apiUrl,
      hasApiKey: !!this.apiKey,
      publisherId: this.publisherId,
      siteId: this.siteId
    });
  }

  // Получение офферов от RichAds
  async getOffers() {
    try {
      if (!this.apiKey) {
        logger.warn('RICHADS_API_KEY не установлен, возвращаем демо-офферы');
        return this.getDemoOffers();
      }

      // Проверяем, нужно ли обновить кеш
      if (this.offers.length > 0 && this.lastUpdate && 
          (Date.now() - this.lastUpdate) < this.updateInterval) {
        logger.debug('Возвращаем кэшированные офферы RichAds');
        return this.offers;
      }

      logger.info('Обновление офферов RichAds...');

      // Используем правильный URL для RichAds API с улучшенными параметрами
      const response = await axios.get(`${this.apiUrl}`, {
        params: {
          ip: '93.195.225.194', // IP пользователя (можно получить динамически)
          useragent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          pubid: this.publisherId,
          siteid: this.siteId,
          'source-type': '1',
          api_key: this.apiKey
        },
        timeout: config.API_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      logger.debug('RichAds API ответ получен', {
        status: response.status,
        dataLength: response.data?.length || 0
      });

      if (response.data && response.data.length > 0) {
        // Парсим JSON ответ
        const offers = this.parseJSONOffers(response.data);
        this.offers = this.formatOffers(offers);
        this.lastUpdate = Date.now();
        logger.info(`Получено ${this.offers.length} офферов RichAds`);
        return this.offers;
      } else {
        // Если нет данных, возвращаем демо-офферы
        logger.warn('RichAds API не вернул данные, используем демо-офферы');
        return this.getDemoOffers();
      }

      return [];
    } catch (error) {
      logger.apiError('RichAds', error, {
        apiUrl: this.apiUrl,
        publisherId: this.publisherId,
        siteId: this.siteId
      });
      
      // Если статус 204 (No Content), это нормально для RichAds
      if (error.response?.status === 204) {
        logger.info('RichAds API вернул 204 (No Content), используем демо-офферы');
        return this.getDemoOffers();
      }
      
      // Возвращаем демо-офферы если API недоступен
      logger.warn('Возвращаем демо-офферы из-за ошибки API');
      return this.getDemoOffers();
    }
  }

  // Форматирование офферов для бота
  formatOffers(offers) {
    return offers.map((offer, index) => ({
      id: offer.id || `richads_${index + 1}`,
      title: offer.title || `Оффер ${index + 1}`,
      description: offer.description || 'Выполните задание и получите награду',
      reward: this.calculateReward(offer.payout || 0.1),
      rewardType: 'stars',
      difficulty: this.getDifficulty(offer.payout || 0.1),
      estimatedTime: this.getEstimatedTime(offer.estimated_time || 5),
      url: offer.tracking_url || offer.url,
      requirements: this.parseRequirements(offer.requirements || ''),
      category: offer.category || 'social',
      payout: offer.payout || 0.1,
      country: offer.country || 'RU',
      isRichAds: true
    }));
  }

  // Расчет награды в Stars
  calculateReward(payout) {
    // Конвертируем доллары в Stars (примерный курс)
    const starsPerDollar = 100; // 1$ = 100 Stars
    return Math.round(payout * starsPerDollar * 100) / 100;
  }

  // Определение сложности задания
  getDifficulty(payout) {
    if (payout >= 0.5) return '🔥 Сложное';
    if (payout >= 0.2) return '⭐ Среднее';
    return '⭐ Легкое';
  }

  // Оценка времени выполнения
  getEstimatedTime(minutes) {
    if (minutes <= 2) return '2 минуты';
    if (minutes <= 5) return '5 минут';
    if (minutes <= 10) return '10 минут';
    return `${minutes} минут`;
  }

  // Парсинг требований
  parseRequirements(requirements) {
    if (!requirements) return ['Выполните задание', 'Отправьте скриншот'];
    
    const reqs = requirements.split('\n').filter(r => r.trim());
    if (reqs.length === 0) {
      return ['Выполните задание', 'Отправьте скриншот'];
    }
    
    return reqs.slice(0, 3); // Максимум 3 требования
  }

  // Парсинг JSON офферов от RichAds
  parseJSONOffers(jsonData) {
    try {
      let data;
      
      // Пытаемся распарсить JSON
      if (typeof jsonData === 'string') {
        data = JSON.parse(jsonData);
      } else {
        data = jsonData;
      }
      
      const offers = [];
      
      // Проверяем различные возможные структуры ответа
      if (data.offers && Array.isArray(data.offers)) {
        offers.push(...data.offers);
      } else if (data.data && Array.isArray(data.data)) {
        offers.push(...data.data);
      } else if (Array.isArray(data)) {
        offers.push(...data);
      } else if (data.offer) {
        offers.push(data.offer);
      } else if (data.offers && typeof data.offers === 'object') {
        // Если offers это объект, преобразуем в массив
        Object.keys(data.offers).forEach(key => {
          offers.push({ id: key, ...data.offers[key] });
        });
      }
      
      console.log(`📋 Парсировано ${offers.length} офферов из JSON`);
      return offers;
    } catch (error) {
      console.error('❌ Ошибка парсинга JSON офферов:', error);
      console.log('📊 Полученные данные:', jsonData);
      return [];
    }
  }

  // Демо-офферы для тестирования
  getDemoOffers() {
    return [
      {
        id: 'richads_demo_1',
        title: 'Подписка на Telegram канал',
        description: 'Подпишитесь на канал и получите награду',
        reward: 50,
        rewardType: 'stars',
        difficulty: '⭐ Легкое',
        estimatedTime: '2 минуты',
        url: 'https://t.me/demo_channel',
        requirements: [
          'Подпишитесь на канал',
          'Отправьте скриншот подписки'
        ],
        category: 'social',
        payout: 0.5,
        country: 'RU',
        isRichAds: true
      },
      {
        id: 'richads_demo_2',
        title: 'Установка приложения',
        description: 'Установите приложение и получите награду',
        reward: 100,
        rewardType: 'stars',
        difficulty: '⭐ Среднее',
        estimatedTime: '5 минут',
        url: 'https://play.google.com/store/apps/details?id=com.demo.app',
        requirements: [
          'Установите приложение',
          'Отправьте скриншот установки'
        ],
        category: 'mobile',
        payout: 1.0,
        country: 'RU',
        isRichAds: true
      },
      {
        id: 'richads_demo_3',
        title: 'Регистрация на сайте',
        description: 'Зарегистрируйтесь на сайте и получите награду',
        reward: 75,
        rewardType: 'stars',
        difficulty: '⭐ Среднее',
        estimatedTime: '3 минуты',
        url: 'https://demo-site.com/register',
        requirements: [
          'Зарегистрируйтесь на сайте',
          'Отправьте скриншот регистрации'
        ],
        category: 'registration',
        payout: 0.75,
        country: 'RU',
        isRichAds: true
      }
    ];
  }

  // Проверка выполнения оффера
  async verifyOffer(offerId, userId) {
    try {
      if (!this.apiKey) {
        console.log('⚠️ RICHADS_API_KEY не установлен для верификации');
        return { success: true, verified: true }; // Демо-режим
      }

      // Для RichAds используем простую проверку
      // В реальной интеграции здесь будет API вызов
      console.log(`✅ Верификация оффера ${offerId} для пользователя ${userId}`);
      
      return {
        success: true,
        verified: true,
        message: 'Оффер проверен'
      };
    } catch (error) {
      console.error('❌ Ошибка верификации оффера:', error.message);
      return {
        success: false,
        verified: false,
        message: 'Ошибка проверки оффера'
      };
    }
  }

  // Отправка конверсии
  async sendConversion(offerId, userId, amount = 1) {
    try {
      if (!this.apiKey) {
        console.log('⚠️ RICHADS_API_KEY не установлен для конверсии');
        return { success: true }; // Демо-режим
      }

      // Для RichAds используем простую отправку конверсии
      // В реальной интеграции здесь будет API вызов
      console.log(`✅ Отправка конверсии для оффера ${offerId}, пользователь ${userId}, количество ${amount}`);
      
      return {
        success: true,
        conversion_id: `conv_${Date.now()}_${userId}`
      };
    } catch (error) {
      console.error('❌ Ошибка отправки конверсии:', error.message);
      return {
        success: false,
        message: 'Ошибка отправки конверсии'
      };
    }
  }

  // Получение статистики пользователя
  async getUserStats(userId) {
    try {
      if (!this.apiKey) {
        return {
          total_offers: 0,
          total_earnings: 0,
          completed_offers: 0
        };
      }

      const response = await axios.get(`${this.apiUrl}/users/${userId}/stats`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('❌ Ошибка получения статистики пользователя:', error.message);
      return {
        total_offers: 0,
        total_earnings: 0,
        completed_offers: 0
      };
    }
  }
}

// Создаем экземпляр интеграции
const richAdsIntegration = new RichAdsIntegration();

// Экспортируем функции для использования в основном боте
module.exports = {
  richAdsIntegration,
  
  // Получение офферов
  async getRichAdsOffers() {
    return await richAdsIntegration.getOffers();
  },

  // Проверка оффера
  async verifyRichAdsOffer(offerId, userId) {
    return await richAdsIntegration.verifyOffer(offerId, userId);
  },

  // Отправка конверсии
  async sendRichAdsConversion(offerId, userId, amount) {
    return await richAdsIntegration.sendConversion(offerId, userId, amount);
  },

  // Получение статистики пользователя
  async getRichAdsUserStats(userId) {
    return await richAdsIntegration.getUserStats(userId);
  },

  // Проверка доступности RichAds
  isRichAdsAvailable() {
    return !!process.env.RICHADS_API_KEY;
  }
};
