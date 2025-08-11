class UserModule {
  constructor(database, cache) {
    this.db = database;
    this.cache = cache;
  }

  async getUser(userId, ctx = null) {
    try {
      const cached = this.cache.getUser(userId);
      if (cached) return cached;

      let user = await this.db.collections.users.findOne({ id: parseInt(userId) });
      
      if (!user) {
        user = await this.createNewUser(userId, ctx);
      } else if (ctx) {
        await this.updateUserInfo(userId, ctx);
        user = await this.db.collections.users.findOne({ id: parseInt(userId) });
      }

      this.cache.setUser(userId, user);
      return user;
    } catch (error) {
      console.error('Ошибка получения пользователя:', error);
      return null;
    }
  }

  async createNewUser(userId, ctx = null) {
    const now = Math.floor(Date.now() / 1000);
    const userData = {
      id: parseInt(userId),
      username: ctx?.from?.username || '',
      first_name: ctx?.from?.first_name || '',
      stars: 100,
      magnumCoins: 0,
      totalEarnedMagnumCoins: 0,
      totalEarnedStars: 0,
      lastFarm: 0,
      lastBonus: 0,
      lastExchange: 0,
      created: now,
      lastSeen: now,
      invited: 0,
      invitedBy: null,
      titles: [],
      achievements: [],
      farmCount: 0,
      bonusCount: 0,
      promoCount: 0,
      taskCount: 0,
      dailyStreak: 0,
      status: 'member',
      dailyTasks: {},
      dailyFarms: 0,
      miner: { active: false, totalEarned: 0, lastReward: 0 },
      settings: { notifications: true, language: 'ru' },
      statistics: { totalFarms: 0, totalBonuses: 0, totalPromos: 0 },
      usedPromos: []
    };

    const result = await this.db.collections.users.insertOne(userData);
    userData._id = result.insertedId;
    return userData;
  }

  async updateUserInfo(userId, ctx) {
    const user = await this.getUser(userId);
    const updates = {};
    
    if (ctx.from.username && ctx.from.username !== user.username) {
      updates.username = ctx.from.username;
    }
    if (ctx.from.first_name && ctx.from.first_name !== user.first_name) {
      updates.first_name = ctx.from.first_name;
    }
    
    if (Object.keys(updates).length > 0) {
      updates.lastSeen = Math.floor(Date.now() / 1000);
      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        { $set: updates }
      );
    }
  }

  async updateUser(userId, updates) {
    try {
      updates.lastSeen = Math.floor(Date.now() / 1000);
      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        { $set: updates }
      );
      this.cache.userCache.delete(userId.toString());
      return true;
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
      return false;
    }
  }

  async incrementUserField(userId, field, amount) {
    try {
      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        { 
          $inc: { [field]: amount },
          $set: { lastSeen: Math.floor(Date.now() / 1000) }
        }
      );
      this.cache.userCache.delete(userId.toString());
      return true;
    } catch (error) {
      console.error('Ошибка инкремента поля пользователя:', error);
      return false;
    }
  }

  async farmStars(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      const now = Math.floor(Date.now() / 1000);
      
      if (now - user.lastFarm < 10) {
        const timeLeft = 10 - (now - user.lastFarm);
        return {
          success: false,
          message: `⏰ Подождите ${timeLeft} секунд до следующего фарма`,
          timeLeft: timeLeft
        };
      }

      const baseReward = 0.01;
      let reward = baseReward;
      
      if (user.achievements) {
        const farmBoost = user.achievements.find(a => a.type === 'farm_boost');
        if (farmBoost) {
          reward *= (1 + farmBoost.level * 0.1);
        }
      }
      
      if (user.titles && user.titles.length > 0) {
        const farmTitle = user.titles.find(t => t.type === 'farm_boost');
        if (farmTitle) {
          reward *= (1 + farmTitle.boost);
        }
      }
      
      reward = Math.max(reward, 0.1);
      
      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $inc: { 
            stars: reward,
            farmCount: 1,
            dailyFarms: 1,
            totalEarnedStars: reward,
            'statistics.totalFarms': 1
          },
          $set: { 
            lastFarm: now,
            lastSeen: now
          }
        }
      );
      
      this.cache.userCache.delete(userId.toString());
      await this.checkAchievements(userId);
      
      return {
        success: true,
        reward: reward,
        newBalance: user.stars + reward
      };
    } catch (error) {
      console.error('Ошибка фарма:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async claimDailyBonus(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      const now = Math.floor(Date.now() / 1000);
      const today = Math.floor(now / (24 * 60 * 60));
      
      if (user.lastBonus === today) {
        const nextBonus = (today + 1) * 24 * 60 * 60;
        const timeLeft = nextBonus - now;
        const hoursLeft = Math.ceil(timeLeft / (60 * 60));
        
        return {
          success: false,
          message: `⏰ Ежедневный бонус уже получен. Следующий через ${hoursLeft} часов`,
          hoursLeft: hoursLeft
        };
      }

      const streak = user.lastBonus === today - 1 ? (user.dailyStreak || 0) + 1 : 1;
      const baseReward = 3;
      const streakBonus = Math.floor(streak / 7) * 2;
      const reward = baseReward + streakBonus;
      
      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $inc: { 
            stars: reward,
            bonusCount: 1,
            totalEarnedStars: reward,
            'statistics.totalBonuses': 1
          },
          $set: { 
            lastBonus: today,
            dailyStreak: streak,
            lastSeen: now
          }
        }
      );
      
      this.cache.userCache.delete(userId.toString());
      await this.checkAchievements(userId);
      
      return {
        success: true,
        reward: reward,
        streak: streak,
        newBalance: user.stars + reward
      };
    } catch (error) {
      console.error('Ошибка ежедневного бонуса:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async activatePromocode(userId, code, ctx) {
    try {
      const user = await this.getUser(userId);
      
      if (user.usedPromos && user.usedPromos.includes(code)) {
        return {
          success: false,
          message: '❌ Вы уже использовали этот промокод'
        };
      }

      const promocode = await this.db.collections.promocodes.findOne({
        code: code.toUpperCase(),
        isActive: true,
        $or: [
          { expiresAt: { $gt: new Date() } },
          { expiresAt: null }
        ]
      });

      if (!promocode) {
        return {
          success: false,
          message: '❌ Промокод не найден или недействителен'
        };
      }

      if (promocode.usageLimit && promocode.usedCount >= promocode.usageLimit) {
        return {
          success: false,
          message: '❌ Промокод больше не действителен'
        };
      }

      const updates = {
        lastSeen: Math.floor(Date.now() / 1000)
      };

      if (promocode.rewardType === 'stars') {
        updates.stars = user.stars + promocode.rewardAmount;
        updates.totalEarnedStars = user.totalEarnedStars + promocode.rewardAmount;
      } else if (promocode.rewardType === 'magnumCoins') {
        updates.magnumCoins = user.magnumCoins + promocode.rewardAmount;
        updates.totalEarnedMagnumCoins = user.totalEarnedMagnumCoins + promocode.rewardAmount;
      }

      updates.promoCount = user.promoCount + 1;
      updates['statistics.totalPromos'] = user.statistics.totalPromos + 1;
      
      if (!user.usedPromos) user.usedPromos = [];
      user.usedPromos.push(code);
      updates.usedPromos = user.usedPromos;

      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        { $set: updates }
      );

      await this.db.collections.promocodes.updateOne(
        { _id: promocode._id },
        { $inc: { usedCount: 1 } }
      );
      
      this.cache.userCache.delete(userId.toString());
      await this.checkAchievements(userId);
      
      return {
        success: true,
        reward: promocode.rewardAmount,
        rewardType: promocode.rewardType,
        message: `✅ Промокод активирован! Получено: ${promocode.rewardAmount} ${promocode.rewardType === 'stars' ? '⭐' : '🪙'}`
      };
    } catch (error) {
      console.error('Ошибка активации промокода:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async getProfile(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      const stats = await this.getBotStatistics();
      
      const rank = this.calculateRank(user.stars);
      const mainTitle = this.getMainTitle(user);
      
      return {
        user: user,
        rank: rank,
        mainTitle: mainTitle,
        botStats: stats
      };
    } catch (error) {
      console.error('Ошибка получения профиля:', error);
      return null;
    }
  }

  async checkAchievements(userId) {
    try {
      const user = await this.getUser(userId);
      const newAchievements = [];
      
      if (user.farmCount >= 1000 && !this.hasAchievement(user, 'farm_master')) {
        newAchievements.push({
          id: 'farm_master',
          name: 'Мастер фарма',
          description: 'Фармил 1000 раз',
          type: 'farm_boost',
          level: 1,
          reward: 100
        });
      }
      
      if (user.farmCount >= 100 && !this.hasAchievement(user, 'farm_expert')) {
        newAchievements.push({
          id: 'farm_expert',
          name: 'Эксперт фарма',
          description: 'Фармил 100 раз',
          type: 'farm_boost',
          level: 1,
          reward: 50
        });
      }
      
      if (user.promoCount >= 50 && !this.hasAchievement(user, 'promo_collector')) {
        newAchievements.push({
          id: 'promo_collector',
          name: 'Коллекционер промокодов',
          description: 'Активировал 50 промокодов',
          type: 'bonus_boost',
          level: 1,
          reward: 200
        });
      }
      
      if (newAchievements.length > 0) {
        const currentAchievements = user.achievements || [];
        const updatedAchievements = [...currentAchievements, ...newAchievements];
        
        await this.db.collections.users.updateOne(
          { id: parseInt(userId) },
          { $set: { achievements: updatedAchievements } }
        );
        
        for (const achievement of newAchievements) {
          await this.incrementUserField(userId, 'stars', achievement.reward);
        }
        
        this.cache.userCache.delete(userId.toString());
        return newAchievements;
      }
      
      return [];
    } catch (error) {
      console.error('Ошибка проверки достижений:', error);
      return [];
    }
  }

  calculateRank(stars) {
    if (stars >= 1000000) return { name: 'Легенда', level: 10, color: '🟣' };
    if (stars >= 500000) return { name: 'Мастер', level: 9, color: '🔴' };
    if (stars >= 100000) return { name: 'Эксперт', level: 8, color: '🟠' };
    if (stars >= 50000) return { name: 'Профессионал', level: 7, color: '🟡' };
    if (stars >= 10000) return { name: 'Опытный', level: 6, color: '🟢' };
    if (stars >= 5000) return { name: 'Продвинутый', level: 5, color: '🔵' };
    if (stars >= 1000) return { name: 'Активный', level: 4, color: '🟦' };
    if (stars >= 500) return { name: 'Начинающий', level: 3, color: '🟨' };
    if (stars >= 100) return { name: 'Новичок', level: 2, color: '🟩' };
    return { name: 'Новичок', level: 1, color: '⚪' };
  }

  getMainTitle(user) {
    if (!user.titles || user.titles.length === 0) return null;
    
    const mainTitle = user.titles.find(t => t.isMain);
    if (mainTitle) return mainTitle;
    
    return user.titles[0];
  }

  hasAchievement(user, achievementId) {
    return user.achievements && user.achievements.some(a => a.id === achievementId);
  }

  async getBotStatistics() {
    try {
      const cached = this.cache.getStats('bot_stats');
      if (cached) return cached;

      const stats = await this.db.collections.users.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalMagnumCoins: { $sum: { $ifNull: ['$totalEarnedMagnumCoins', '$magnumCoins'] } },
            totalStars: { $sum: { $ifNull: ['$stars', 0] } },
            activeMiners: { $sum: { $cond: [{ $eq: ['$miner.active', true] }, 1, 0] } },
            totalFarms: { $sum: { $ifNull: ['$farmCount', 0] } },
            totalBonuses: { $sum: { $ifNull: ['$bonusCount', 0] } },
            totalPromos: { $sum: { $ifNull: ['$promoCount', 0] } },
            totalInvites: { $sum: { $ifNull: ['$invited', 0] } }
          }
        }
      ]).toArray();
      
      const result = stats[0] || {
        totalUsers: 0,
        totalMagnumCoins: 0,
        totalStars: 0,
        activeMiners: 0,
        totalFarms: 0,
        totalBonuses: 0,
        totalPromos: 0,
        totalInvites: 0
      };

      this.cache.setStats('bot_stats', result);
      return result;
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      return {
        totalUsers: 0,
        totalMagnumCoins: 0,
        totalStars: 0,
        activeMiners: 0,
        totalFarms: 0,
        totalBonuses: 0,
        totalPromos: 0,
        totalInvites: 0
      };
    }
  }
}

module.exports = UserModule;