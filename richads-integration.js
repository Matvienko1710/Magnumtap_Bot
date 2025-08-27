/**
 * RichAds Integration для Magnum Stars Bot
 * Заменяет спонсорские задания на RichAds офферы
 */

const axios = require('axios');

class RichAdsIntegration {
  constructor() {
    this.apiKey = process.env.RICHADS_API_KEY;
    this.apiUrl = 'https://api.richads.com/api/v1'; // Исправленный URL
    this.offers = [];
    this.lastUpdate = null;
    this.updateInterval = 30 * 60 * 1000; // 30 минут
  }

  // Получение офферов от RichAds
  async getOffers() {
    try {
      if (!this.apiKey) {
        console.log('⚠️ RICHADS_API_KEY не установлен, возвращаем демо-офферы');
        return this.getDemoOffers();
      }

      // Проверяем, нужно ли обновить кеш
      if (this.offers.length > 0 && this.lastUpdate && 
          (Date.now() - this.lastUpdate) < this.updateInterval) {
        return this.offers;
      }

      console.log('🔄 Обновление офферов RichAds...');

      const response = await axios.get(`${this.apiUrl}/offers`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          country: 'RU', // Россия
          category: 'social', // Социальные сети
          limit: 20, // Максимум 20 офферов
          status: 'active'
        },
        timeout: 10000
      });

      if (response.data && response.data.offers) {
        this.offers = this.formatOffers(response.data.offers);
        this.lastUpdate = Date.now();
        console.log(`✅ Получено ${this.offers.length} офферов RichAds`);
        return this.offers;
      }

      return [];
    } catch (error) {
      console.error('❌ Ошибка получения офферов RichAds:', error.message);
      if (error.response) {
        console.error('📊 Статус ответа:', error.response.status);
        console.error('📊 Данные ответа:', error.response.data);
      }
      
      // Возвращаем демо-офферы если API недоступен
      console.log('🔄 Возвращаем демо-офферы из-за ошибки API');
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

      const response = await axios.post(`${this.apiUrl}/conversions/verify`, {
        offer_id: offerId,
        user_id: userId,
        timestamp: Date.now()
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        verified: response.data.verified || false,
        message: response.data.message || 'Оффер проверен'
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

      const response = await axios.post(`${this.apiUrl}/conversions`, {
        offer_id: offerId,
        user_id: userId,
        amount: amount,
        timestamp: Date.now()
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        conversion_id: response.data.conversion_id
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
