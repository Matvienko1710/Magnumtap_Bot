class ExchangeModule {
  constructor(database, cache) {
    this.db = database;
    this.cache = cache;
  }

  async getExchangeRates() {
    try {
      const reserve = await this.db.collections.reserve.findOne({});
      if (!reserve) {
        return {
          success: false,
          message: '❌ Резерв биржи недоступен'
        };
      }

      const magnumToStars = reserve.stars / reserve.magnumCoins;
      const starsToMagnum = reserve.magnumCoins / reserve.stars;

      return {
        success: true,
        magnumToStars: magnumToStars,
        starsToMagnum: starsToMagnum,
        reserve: {
          magnumCoins: reserve.magnumCoins,
          stars: reserve.stars,
          totalExchanges: reserve.totalExchanges,
          totalVolume: reserve.totalVolume
        }
      };
    } catch (error) {
      console.error('Ошибка получения курсов обмена:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async exchangeMagnumToStars(userId, amount, ctx) {
    try {
      const user = await this.getUser(userId);
      
      if (user.magnumCoins < amount) {
        return {
          success: false,
          message: '❌ Недостаточно Magnum Coins для обмена'
        };
      }

      if (amount < 1) {
        return {
          success: false,
          message: '❌ Минимальная сумма обмена: 1🪙'
        };
      }

      const reserve = await this.db.collections.reserve.findOne({});
      if (!reserve) {
        return {
          success: false,
          message: '❌ Резерв биржи недоступен'
        };
      }

      const commission = amount * (2.5 / 100); // 2.5% комиссия
      const exchangeAmount = amount - commission;
      const starsReceived = exchangeAmount * (reserve.stars / reserve.magnumCoins);

      // Проверяем, достаточно ли звезд в резерве
      if (reserve.stars < starsReceived) {
        return {
          success: false,
          message: '❌ Недостаточно звезд в резерве биржи'
        };
      }

      // Выполняем обмен
      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $inc: { 
            magnumCoins: -amount,
            stars: starsReceived,
            totalEarnedStars: starsReceived,
            'statistics.totalExchanges': 1
          },
          $set: { lastSeen: Math.floor(Date.now() / 1000) }
        }
      );

      // Обновляем резерв
      await this.db.collections.reserve.updateOne(
        {},
        {
          $inc: { 
            magnumCoins: amount,
            stars: -starsReceived,
            totalExchanges: 1,
            totalVolume: amount
          },
          $set: { lastUpdated: new Date() }
        }
      );

      // Логируем транзакцию
      await this.logExchange(userId, 'magnum_to_stars', amount, starsReceived, commission);

      this.cache.userCache.delete(userId.toString());
      
      return {
        success: true,
        amount: amount,
        starsReceived: starsReceived,
        commission: commission,
        rate: reserve.stars / reserve.magnumCoins,
        message: `✅ Обмен выполнен!\n\n` +
                `💱 Обменено: ${amount}🪙\n` +
                `⭐ Получено: ${starsReceived.toFixed(4)}⭐\n` +
                `💰 Комиссия: ${commission.toFixed(4)}🪙\n` +
                `📊 Курс: 1🪙 = ${(reserve.stars / reserve.magnumCoins).toFixed(4)}⭐`
      };
    } catch (error) {
      console.error('Ошибка обмена Magnum на звезды:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async exchangeStarsToMagnum(userId, amount, ctx) {
    try {
      const user = await this.getUser(userId);
      
      if (user.stars < amount) {
        return {
          success: false,
          message: '❌ Недостаточно звезд для обмена'
        };
      }

      if (amount < 1) {
        return {
          success: false,
          message: '❌ Минимальная сумма обмена: 1⭐'
        };
      }

      const reserve = await this.db.collections.reserve.findOne({});
      if (!reserve) {
        return {
          success: false,
          message: '❌ Резерв биржи недоступен'
        };
      }

      const commission = amount * (2.5 / 100); // 2.5% комиссия
      const exchangeAmount = amount - commission;
      const magnumReceived = exchangeAmount * (reserve.magnumCoins / reserve.stars);

      // Проверяем, достаточно ли Magnum Coins в резерве
      if (reserve.magnumCoins < magnumReceived) {
        return {
          success: false,
          message: '❌ Недостаточно Magnum Coins в резерве биржи'
        };
      }

      // Выполняем обмен
      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $inc: { 
            stars: -amount,
            magnumCoins: magnumReceived,
            totalEarnedMagnumCoins: magnumReceived,
            'statistics.totalExchanges': 1
          },
          $set: { lastSeen: Math.floor(Date.now() / 1000) }
        }
      );

      // Обновляем резерв
      await this.db.collections.reserve.updateOne(
        {},
        {
          $inc: { 
            stars: amount,
            magnumCoins: -magnumReceived,
            totalExchanges: 1,
            totalVolume: amount
          },
          $set: { lastUpdated: new Date() }
        }
      );

      // Логируем транзакцию
      await this.logExchange(userId, 'stars_to_magnum', amount, magnumReceived, commission);

      this.cache.userCache.delete(userId.toString());
      
      return {
        success: true,
        amount: amount,
        magnumReceived: magnumReceived,
        commission: commission,
        rate: reserve.magnumCoins / reserve.stars,
        message: `✅ Обмен выполнен!\n\n` +
                `💱 Обменено: ${amount}⭐\n` +
                `🪙 Получено: ${magnumReceived.toFixed(4)}🪙\n` +
                `💰 Комиссия: ${commission.toFixed(4)}⭐\n` +
                `📊 Курс: 1⭐ = ${(reserve.magnumCoins / reserve.stars).toFixed(4)}🪙`
      };
    } catch (error) {
      console.error('Ошибка обмена звезд на Magnum:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async logExchange(userId, type, amount, received, commission) {
    try {
      const exchange = {
        userId: parseInt(userId),
        type: type,
        amount: amount,
        received: received,
        commission: commission,
        createdAt: new Date()
      };

      await this.db.collections.exchangeHistory.insertOne(exchange);
    } catch (error) {
      console.error('Ошибка логирования обмена:', error);
    }
  }

  async getExchangeHistory(userId, limit = 10) {
    try {
      const history = await this.db.collections.exchangeHistory
        .find({ userId: parseInt(userId) })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      
      return history;
    } catch (error) {
      console.error('Ошибка получения истории обменов:', error);
      return [];
    }
  }

  async getExchangeStats() {
    try {
      const stats = await this.db.collections.exchangeHistory.aggregate([
        {
          $group: {
            _id: null,
            totalExchanges: { $sum: 1 },
            totalVolume: { $sum: '$amount' },
            totalCommission: { $sum: '$commission' },
            avgExchangeAmount: { $avg: '$amount' }
          }
        }
      ]).toArray();
      
      return stats[0] || {
        totalExchanges: 0,
        totalVolume: 0,
        totalCommission: 0,
        avgExchangeAmount: 0
      };
    } catch (error) {
      console.error('Ошибка получения статистики обменов:', error);
      return {
        totalExchanges: 0,
        totalVolume: 0,
        totalCommission: 0,
        avgExchangeAmount: 0
      };
    }
  }

  async getTopExchangers(limit = 10) {
    try {
      const topExchangers = await this.db.collections.exchangeHistory.aggregate([
        {
          $group: {
            _id: '$userId',
            totalExchanges: { $sum: 1 },
            totalVolume: { $sum: '$amount' },
            totalReceived: { $sum: '$received' }
          }
        },
        { $sort: { totalVolume: -1 } },
        { $limit: limit }
      ]).toArray();
      
      // Получаем информацию о пользователях
      const userIds = topExchangers.map(item => item._id);
      const users = await this.db.collections.users.find({ id: { $in: userIds } }).toArray();
      const userMap = {};
      users.forEach(user => userMap[user.id] = user);
      
      return topExchangers.map(item => ({
        userId: item._id,
        username: userMap[item._id]?.username || 'Unknown',
        totalExchanges: item.totalExchanges,
        totalVolume: item.totalVolume,
        totalReceived: item.totalReceived
      }));
    } catch (error) {
      console.error('Ошибка получения топ обменников:', error);
      return [];
    }
  }

  async getReserveInfo() {
    try {
      const reserve = await this.db.collections.reserve.findOne({});
      if (!reserve) {
        return {
          success: false,
          message: '❌ Резерв биржи недоступен'
        };
      }

      const magnumToStars = reserve.stars / reserve.magnumCoins;
      const starsToMagnum = reserve.magnumCoins / reserve.stars;

      return {
        success: true,
        magnumCoins: reserve.magnumCoins,
        stars: reserve.stars,
        totalExchanges: reserve.totalExchanges,
        totalVolume: reserve.totalVolume,
        lastUpdated: reserve.lastUpdated,
        rates: {
          magnumToStars: magnumToStars,
          starsToMagnum: starsToMagnum
        }
      };
    } catch (error) {
      console.error('Ошибка получения информации о резерве:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async calculateExchangeAmount(fromCurrency, toCurrency, amount) {
    try {
      const reserve = await this.db.collections.reserve.findOne({});
      if (!reserve) {
        return {
          success: false,
          message: '❌ Резерв биржи недоступен'
        };
      }

      let rate, received, commission;
      
      if (fromCurrency === 'magnumCoins' && toCurrency === 'stars') {
        rate = reserve.stars / reserve.magnumCoins;
        commission = amount * (2.5 / 100);
        received = (amount - commission) * rate;
      } else if (fromCurrency === 'stars' && toCurrency === 'magnumCoins') {
        rate = reserve.magnumCoins / reserve.stars;
        commission = amount * (2.5 / 100);
        received = (amount - commission) * rate;
      } else {
        return {
          success: false,
          message: '❌ Неподдерживаемая пара валют'
        };
      }

      return {
        success: true,
        amount: amount,
        received: received,
        commission: commission,
        rate: rate,
        netAmount: amount - commission
      };
    } catch (error) {
      console.error('Ошибка расчета обмена:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async getUser(userId) {
    try {
      const cached = this.cache.getUser(userId);
      if (cached) return cached;

      const user = await this.db.collections.users.findOne({ id: parseInt(userId) });
      if (user) {
        this.cache.setUser(userId, user);
      }
      return user;
    } catch (error) {
      console.error('Ошибка получения пользователя:', error);
      return null;
    }
  }
}

module.exports = ExchangeModule;