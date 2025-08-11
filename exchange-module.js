// ==================== МОДУЛЬ ОБМЕНА ВАЛЮТ ====================

class ExchangeModule {
  constructor(db, userCache, config) {
    this.db = db;
    this.userCache = userCache;
    this.config = config;
  }

  // Получение курса обмена
  async getExchangeRate(fromCurrency, toCurrency) {
    try {
      // Получаем резерв валют
      const reserve = await this.getReserve();
      
      // Базовые курсы (можно настроить)
      const rates = {
        'stars_to_coins': 0.1, // 1 Star = 0.1 Magnum Coins
        'coins_to_stars': 10   // 1 Magnum Coin = 10 Stars
      };
      
      if (fromCurrency === 'stars' && toCurrency === 'magnum_coins') {
        return rates.stars_to_coins;
      } else if (fromCurrency === 'magnum_coins' && toCurrency === 'stars') {
        return rates.coins_to_stars;
      }
      
      return 1; // По умолчанию 1:1
    } catch (error) {
      console.error('Ошибка получения курса обмена:', error);
      return 1;
    }
  }

  // Получение резерва валют
  async getReserve() {
    try {
      let reserve = await this.db.collection('reserve').findOne({ currency: 'main' });
      
      if (!reserve) {
        // Создаем резерв если его нет
        reserve = {
          currency: 'main',
          stars: this.config.INITIAL_RESERVE_STARS || 1000000,
          magnumCoins: this.config.INITIAL_RESERVE_MAGNUM_COINS || 1000000,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await this.db.collection('reserve').insertOne(reserve);
      }
      
      return reserve;
    } catch (error) {
      console.error('Ошибка получения резерва:', error);
      return {
        stars: 1000000,
        magnumCoins: 1000000
      };
    }
  }

  // Обновление резерва
  async updateReserve(starsChange = 0, magnumCoinsChange = 0) {
    try {
      await this.db.collection('reserve').updateOne(
        { currency: 'main' },
        {
          $inc: {
            stars: starsChange,
            magnumCoins: magnumCoinsChange
          },
          $set: { updatedAt: new Date() }
        }
      );
    } catch (error) {
      console.error('Ошибка обновления резерва:', error);
    }
  }

  // Выполнение обмена
  async performExchange(userId, fromCurrency, toCurrency, amount) {
    try {
      const user = await this.getUser(userId);
      if (!user) {
        return { success: false, message: 'Пользователь не найден' };
      }

      // Проверяем баланс
      const userBalance = fromCurrency === 'stars' ? user.stars : user.magnumCoins;
      if (userBalance < amount) {
        return { success: false, message: 'Недостаточно средств' };
      }

      // Получаем курс обмена
      const rate = await this.getExchangeRate(fromCurrency, toCurrency);
      
      // Рассчитываем комиссию
      const commission = (amount * this.config.EXCHANGE_COMMISSION) / 100;
      const amountAfterCommission = amount - commission;
      
      // Рассчитываем получаемую сумму
      const receivedAmount = amountAfterCommission * rate;

      // Проверяем резерв
      const reserve = await this.getReserve();
      const reserveCurrency = toCurrency === 'stars' ? reserve.stars : reserve.magnumCoins;
      
      if (reserveCurrency < receivedAmount) {
        return { success: false, message: 'Недостаточно средств в резерве' };
      }

      // Выполняем обмен
      const updateData = {};
      updateData[fromCurrency === 'stars' ? 'stars' : 'magnumCoins'] = -amount;
      updateData[toCurrency === 'stars' ? 'stars' : 'magnumCoins'] = receivedAmount;
      updateData['totalEarnedStars'] = toCurrency === 'stars' ? receivedAmount : 0;
      updateData['totalEarnedMagnumCoins'] = toCurrency === 'magnum_coins' ? receivedAmount : 0;
      updateData['exchange.totalExchanged'] = amount;
      updateData['exchange.exchangeCount'] = 1;
      updateData['experience'] = Math.floor(amount * 2);
      updateData['statistics.totalActions'] = 1;

      await this.db.collection('users').updateOne(
        { id: userId },
        { $inc: updateData, $set: { updatedAt: new Date() } }
      );

      // Обновляем резерв
      await this.updateReserve(
        toCurrency === 'stars' ? -receivedAmount : amount,
        toCurrency === 'magnum_coins' ? -receivedAmount : amount
      );

      // Сохраняем историю обмена
      await this.saveExchangeHistory(userId, fromCurrency, toCurrency, amount, receivedAmount, rate, commission);

      // Очищаем кеш пользователя
      this.userCache.delete(userId);

      return {
        success: true,
        message: `Обмен выполнен успешно!`,
        details: {
          from: `${amount} ${fromCurrency === 'stars' ? 'Stars' : 'Magnum Coins'}`,
          to: `${receivedAmount.toFixed(2)} ${toCurrency === 'stars' ? 'Stars' : 'Magnum Coins'}`,
          rate: rate,
          commission: commission,
          commissionPercent: this.config.EXCHANGE_COMMISSION
        }
      };
    } catch (error) {
      console.error('Ошибка выполнения обмена:', error);
      return { success: false, message: 'Ошибка выполнения обмена' };
    }
  }

  // Сохранение истории обмена
  async saveExchangeHistory(userId, fromCurrency, toCurrency, amount, receivedAmount, rate, commission) {
    try {
      const history = {
        userId: userId,
        fromCurrency: fromCurrency,
        toCurrency: toCurrency,
        amount: amount,
        receivedAmount: receivedAmount,
        rate: rate,
        commission: commission,
        commissionPercent: this.config.EXCHANGE_COMMISSION,
        timestamp: new Date()
      };

      await this.db.collection('exchangeHistory').insertOne(history);
    } catch (error) {
      console.error('Ошибка сохранения истории обмена:', error);
    }
  }

  // Получение истории обмена пользователя
  async getExchangeHistory(userId, limit = 10) {
    try {
      const history = await this.db.collection('exchangeHistory')
        .find({ userId: userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      return history;
    } catch (error) {
      console.error('Ошибка получения истории обмена:', error);
      return [];
    }
  }

  // Получение статистики обмена
  async getExchangeStats(userId) {
    try {
      const user = await this.getUser(userId);
      if (!user) return null;

      const stats = await this.db.collection('exchangeHistory')
        .aggregate([
          { $match: { userId: userId } },
          {
            $group: {
              _id: null,
              totalExchanges: { $sum: 1 },
              totalStarsExchanged: {
                $sum: {
                  $cond: [
                    { $eq: ['$fromCurrency', 'stars'] },
                    '$amount',
                    0
                  ]
                }
              },
              totalCoinsExchanged: {
                $sum: {
                  $cond: [
                    { $eq: ['$fromCurrency', 'magnum_coins'] },
                    '$amount',
                    0
                  ]
                }
              },
              totalCommission: { $sum: '$commission' }
            }
          }
        ])
        .toArray();

      return stats[0] || {
        totalExchanges: 0,
        totalStarsExchanged: 0,
        totalCoinsExchanged: 0,
        totalCommission: 0
      };
    } catch (error) {
      console.error('Ошибка получения статистики обмена:', error);
      return null;
    }
  }

  // Получение пользователя
  async getUser(userId) {
    try {
      return await this.db.collection('users').findOne({ id: userId });
    } catch (error) {
      console.error('Ошибка получения пользователя:', error);
      return null;
    }
  }

  // Форматирование числа
  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toFixed(2);
  }

  // Получение информации о курсах
  async getExchangeInfo() {
    try {
      const reserve = await this.getReserve();
      const starsToCoinsRate = await this.getExchangeRate('stars', 'magnum_coins');
      const coinsToStarsRate = await this.getExchangeRate('magnum_coins', 'stars');

      return {
        reserve: {
          stars: this.formatNumber(reserve.stars),
          magnumCoins: this.formatNumber(reserve.magnumCoins)
        },
        rates: {
          starsToCoins: starsToCoinsRate,
          coinsToStars: coinsToStarsRate
        },
        commission: this.config.EXCHANGE_COMMISSION
      };
    } catch (error) {
      console.error('Ошибка получения информации об обмене:', error);
      return null;
    }
  }

  // Проверка минимальной суммы обмена
  checkMinAmount(amount) {
    return amount >= 1; // Минимум 1
  }

  // Проверка максимальной суммы обмена
  async checkMaxAmount(userId, amount, currency) {
    try {
      const user = await this.getUser(userId);
      if (!user) return false;

      const userBalance = currency === 'stars' ? user.stars : user.magnumCoins;
      return amount <= userBalance;
    } catch (error) {
      console.error('Ошибка проверки максимальной суммы:', error);
      return false;
    }
  }

  // Валидация обмена
  async validateExchange(userId, fromCurrency, toCurrency, amount) {
    try {
      // Проверяем минимальную сумму
      if (!this.checkMinAmount(amount)) {
        return { valid: false, message: 'Минимальная сумма обмена: 1' };
      }

      // Проверяем максимальную сумму
      if (!(await this.checkMaxAmount(userId, amount, fromCurrency))) {
        return { valid: false, message: 'Недостаточно средств' };
      }

      // Проверяем резерв
      const reserve = await this.getReserve();
      const rate = await this.getExchangeRate(fromCurrency, toCurrency);
      const commission = (amount * this.config.EXCHANGE_COMMISSION) / 100;
      const amountAfterCommission = amount - commission;
      const receivedAmount = amountAfterCommission * rate;
      
      const reserveCurrency = toCurrency === 'stars' ? reserve.stars : reserve.magnumCoins;
      if (reserveCurrency < receivedAmount) {
        return { valid: false, message: 'Недостаточно средств в резерве' };
      }

      return { valid: true };
    } catch (error) {
      console.error('Ошибка валидации обмена:', error);
      return { valid: false, message: 'Ошибка валидации' };
    }
  }
}

module.exports = ExchangeModule;