const database = require('../database');
const cache = require('../cache');
const utils = require('../utils');

class UserService {
  // Получение пользователя с кешированием
  async getUser(userId, ctx = null) {
    try {
      // Проверяем кеш
      const cachedUser = cache.getUser(userId);
      if (cachedUser) {
        return cachedUser;
      }

      // Получаем из базы данных
      let user = await database.getUserById(userId);
      
      if (!user) {
        // Создаем нового пользователя
        user = await database.createUser({
          id: userId,
          username: ctx?.from?.username || '',
          first_name: ctx?.from?.first_name || ''
        });
      } else {
        // Обновляем информацию пользователя если нужно
        if (ctx) {
          const updates = {};
          if (ctx.from.username && ctx.from.username !== user.username) {
            updates.username = ctx.from.username;
          }
          if (ctx.from.first_name && ctx.from.first_name !== user.first_name) {
            updates.first_name = ctx.from.first_name;
          }
          
          if (Object.keys(updates).length > 0) {
            await database.updateUser(userId, updates);
            Object.assign(user, updates);
          }
        }
      }

      // Кешируем пользователя
      cache.setUser(userId, user);
      return user;
    } catch (error) {
      console.error('Ошибка получения пользователя:', error);
      throw error;
    }
  }

  // Получение пользователя без кеша (для критических операций)
  async getUserFresh(userId) {
    try {
      return await database.getUserById(userId);
    } catch (error) {
      console.error('Ошибка получения свежих данных пользователя:', error);
      throw error;
    }
  }

  // Обновление пользователя
  async updateUser(userId, updates) {
    try {
      const success = await database.updateUser(userId, updates);
      if (success) {
        cache.invalidateUser(userId);
      }
      return success;
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
      throw error;
    }
  }

  // Увеличение поля пользователя
  async incrementUserField(userId, field, amount) {
    try {
      const success = await database.incrementUserField(userId, field, amount);
      if (success) {
        cache.invalidateUser(userId);
      }
      return success;
    } catch (error) {
      console.error('Ошибка увеличения поля пользователя:', error);
      throw error;
    }
  }

  // Фарм звезд
  async farmStars(userId, ctx) {
    try {
      const user = await this.getUser(userId, ctx);
      const cooldown = utils.checkCooldown(user.lastFarm || 0, config.FARM_COOLDOWN_DEFAULT);
      
      if (!cooldown.canAct) {
        return {
          success: false,
          error: `⏳ Подождите ${utils.formatTime(cooldown.remaining)} перед следующим фармом`,
          remaining: cooldown.remaining
        };
      }

      // Рассчитываем награду
      const baseReward = utils.calculateFarmReward(user);
      const reward = Math.max(baseReward, 0.1);

      // Обновляем пользователя
      await database.incrementUserField(userId, 'stars', reward);
      await database.updateUser(userId, {
        lastFarm: utils.now(),
        farmCount: (user.farmCount || 0) + 1
      });

      cache.invalidateUser(userId);

      return {
        success: true,
        reward,
        newBalance: (user.stars || 0) + reward
      };
    } catch (error) {
      console.error('Ошибка фарма звезд:', error);
      return utils.handleError(error, 'фарм звезд');
    }
  }

  // Активация промокода
  async activatePromocode(userId, code, ctx) {
    try {
      // Валидация промокода
      if (!utils.validatePromocode(code)) {
        return {
          success: false,
          error: '❌ Неверный формат промокода'
        };
      }

      const user = await this.getUser(userId, ctx);
      
      // Проверяем, не использовал ли пользователь этот промокод
      if (user.promoCodesUsed && user.promoCodesUsed.includes(code.toUpperCase())) {
        return {
          success: false,
          error: '❌ Вы уже использовали этот промокод'
        };
      }

      // Получаем промокод из базы
      const promocode = await database.getPromocode(code);
      if (!promocode) {
        return {
          success: false,
          error: '❌ Промокод не найден или неактивен'
        };
      }

      // Проверяем лимит использования
      if (promocode.maxUses > 0 && promocode.usedCount >= promocode.maxUses) {
        return {
          success: false,
          error: '❌ Промокод больше не действителен'
        };
      }

      // Проверяем, не использовал ли пользователь этот промокод
      if (promocode.usedBy && promocode.usedBy.includes(userId)) {
        return {
          success: false,
          error: '❌ Вы уже использовали этот промокод'
        };
      }

      // Выдаем награду
      const reward = promocode.reward;
      const rewardType = promocode.rewardType || 'stars';
      
      if (rewardType === 'stars') {
        await database.incrementUserField(userId, 'stars', reward);
      } else if (rewardType === 'magnumCoins') {
        await database.incrementUserField(userId, 'magnumCoins', reward);
        await database.incrementUserField(userId, 'totalEarnedMagnumCoins', reward);
      }

      // Обновляем статистику промокода
      await database.collections.promocodes.updateOne(
        { _id: promocode._id },
        {
          $inc: { usedCount: 1 },
          $push: { usedBy: userId }
        }
      );

      // Обновляем пользователя
      const usedCodes = user.promoCodesUsed || [];
      usedCodes.push(code.toUpperCase());
      
      await database.updateUser(userId, {
        promoCodesUsed: usedCodes,
        promoCount: (user.promoCount || 0) + 1
      });

      cache.invalidateUser(userId);

      return {
        success: true,
        reward,
        rewardType,
        newBalance: rewardType === 'stars' ? 
          (user.stars || 0) + reward : 
          (user.magnumCoins || 0) + reward
      };
    } catch (error) {
      console.error('Ошибка активации промокода:', error);
      return utils.handleError(error, 'активация промокода');
    }
  }

  // Получение профиля пользователя
  async getProfile(userId, ctx) {
    try {
      const user = await this.getUser(userId, ctx);
      
      // Получаем статистику
      const stats = await database.getBotStatistics();
      
      return {
        user,
        stats,
        rank: this.getUserRank(user),
        mainTitle: this.getUserMainTitle(user)
      };
    } catch (error) {
      console.error('Ошибка получения профиля:', error);
      throw error;
    }
  }

  // Получение ранга пользователя
  getUserRank(user) {
    const stars = user.stars || 0;
    
    if (stars >= 1000000) return { name: 'Легенда', level: 10 };
    if (stars >= 500000) return { name: 'Мастер', level: 9 };
    if (stars >= 100000) return { name: 'Эксперт', level: 8 };
    if (stars >= 50000) return { name: 'Профессионал', level: 7 };
    if (stars >= 10000) return { name: 'Опытный', level: 6 };
    if (stars >= 5000) return { name: 'Продвинутый', level: 5 };
    if (stars >= 1000) return { name: 'Активный', level: 4 };
    if (stars >= 500) return { name: 'Начинающий', level: 3 };
    if (stars >= 100) return { name: 'Новичок', level: 2 };
    return { name: 'Новичок', level: 1 };
  }

  // Получение главного титула
  getUserMainTitle(user) {
    if (!user.titles || user.titles.length === 0) return null;
    
    const mainTitle = user.titles.find(t => t.isMain);
    if (mainTitle) return mainTitle;
    
    // Возвращаем первый титул если главный не установлен
    return user.titles[0];
  }

  // Проверка и выдача достижений
  async checkAndAwardAchievements(userId) {
    try {
      const user = await this.getUserFresh(userId);
      const newAchievements = [];
      
      // Проверяем достижения по фарму
      const farmCount = user.farmCount || 0;
      if (farmCount >= 1000 && !this.hasAchievement(user, 'farm_master')) {
        newAchievements.push({
          id: 'farm_master',
          name: 'Мастер фарма',
          description: 'Фармил 1000 раз',
          type: 'farm_boost',
          level: 1,
          reward: 100
        });
      }
      
      if (farmCount >= 100 && !this.hasAchievement(user, 'farm_expert')) {
        newAchievements.push({
          id: 'farm_expert',
          name: 'Эксперт фарма',
          description: 'Фармил 100 раз',
          type: 'farm_boost',
          level: 1,
          reward: 50
        });
      }
      
      // Проверяем достижения по промокодам
      const promoCount = user.promoCount || 0;
      if (promoCount >= 50 && !this.hasAchievement(user, 'promo_collector')) {
        newAchievements.push({
          id: 'promo_collector',
          name: 'Коллекционер промокодов',
          description: 'Активировал 50 промокодов',
          type: 'bonus_boost',
          level: 1,
          reward: 200
        });
      }
      
      // Выдаем новые достижения
      if (newAchievements.length > 0) {
        const currentAchievements = user.achievements || [];
        const updatedAchievements = [...currentAchievements, ...newAchievements];
        
        await database.updateUser(userId, {
          achievements: updatedAchievements
        });
        
        // Выдаем награды
        for (const achievement of newAchievements) {
          await database.incrementUserField(userId, 'stars', achievement.reward);
        }
        
        cache.invalidateUser(userId);
        
        return {
          success: true,
          newAchievements,
          totalReward: newAchievements.reduce((sum, a) => sum + a.reward, 0)
        };
      }
      
      return { success: true, newAchievements: [] };
    } catch (error) {
      console.error('Ошибка проверки достижений:', error);
      return utils.handleError(error, 'проверка достижений');
    }
  }

  // Проверка наличия достижения
  hasAchievement(user, achievementId) {
    return user.achievements && user.achievements.some(a => a.id === achievementId);
  }
}

module.exports = new UserService();