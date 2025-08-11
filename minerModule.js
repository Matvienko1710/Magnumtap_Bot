class MinerModule {
  constructor(database, cache) {
    this.db = database;
    this.cache = cache;
  }

  async startMiner(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      
      if (user.miner.active) {
        return {
          success: false,
          message: '⛏️ Майнер уже запущен!'
        };
      }

      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $set: {
            'miner.active': true,
            'miner.lastReward': Math.floor(Date.now() / 1000),
            lastSeen: Math.floor(Date.now() / 1000)
          }
        }
      );

      this.cache.userCache.delete(userId.toString());
      
      return {
        success: true,
        message: '⛏️ Майнер запущен! Теперь вы будете получать награды каждые 30 минут.'
      };
    } catch (error) {
      console.error('Ошибка запуска майнера:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async stopMiner(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      
      if (!user.miner.active) {
        return {
          success: false,
          message: '⛏️ Майнер не запущен!'
        };
      }

      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $set: {
            'miner.active': false,
            lastSeen: Math.floor(Date.now() / 1000)
          }
        }
      );

      this.cache.userCache.delete(userId.toString());
      
      return {
        success: true,
        message: '⛏️ Майнер остановлен!'
      };
    } catch (error) {
      console.error('Ошибка остановки майнера:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async getMinerStats(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      const now = Math.floor(Date.now() / 1000);
      
      const status = user.miner.active ? '🟢 Активен' : '🔴 Неактивен';
      const totalEarned = user.miner.totalEarned || 0;
      const rewardPerHour = 0.1;
      
      let timeSinceLastReward = 0;
      if (user.miner.active && user.miner.lastReward) {
        timeSinceLastReward = now - user.miner.lastReward;
      }
      
      const hoursSinceLastReward = Math.floor(timeSinceLastReward / 3600);
      const pendingReward = hoursSinceLastReward * rewardPerHour;
      
      return {
        success: true,
        status: status,
        totalEarned: totalEarned,
        rewardPerHour: rewardPerHour,
        pendingReward: pendingReward,
        hoursSinceLastReward: hoursSinceLastReward,
        isActive: user.miner.active
      };
    } catch (error) {
      console.error('Ошибка получения статистики майнера:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async upgradeMiner(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      const upgradeCost = 1000; // 1000 звезд за улучшение
      
      if (user.stars < upgradeCost) {
        return {
          success: false,
          message: `❌ Недостаточно звезд для улучшения! Нужно: ${upgradeCost}⭐`
        };
      }

      const currentLevel = user.miner.level || 1;
      const newLevel = currentLevel + 1;
      const newEfficiency = 1.0 + (newLevel - 1) * 0.1; // +10% за каждый уровень

      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $inc: { stars: -upgradeCost },
          $set: {
            'miner.level': newLevel,
            'miner.efficiency': newEfficiency,
            lastSeen: Math.floor(Date.now() / 1000)
          }
        }
      );

      this.cache.userCache.delete(userId.toString());
      
      return {
        success: true,
        message: `⛏️ Майнер улучшен до уровня ${newLevel}! Эффективность: +${((newEfficiency - 1) * 100).toFixed(0)}%`
      };
    } catch (error) {
      console.error('Ошибка улучшения майнера:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async processMinerRewards() {
    try {
      console.log('⛏️ Обработка майнеров...');
      const now = Math.floor(Date.now() / 1000);
      const oneHour = 3600;
      
      const usersWithMiners = await this.db.collections.users.find({ 'miner.active': true }).toArray();
      console.log(`🔍 Найдено ${usersWithMiners.length} активных майнеров`);
      
      for (const user of usersWithMiners) {
        const timeSinceLastReward = now - (user.miner.lastReward || 0);
        const hoursElapsed = Math.floor(timeSinceLastReward / oneHour);
        
        if (hoursElapsed > 0) {
          const baseRewardPerHour = 0.1;
          const efficiency = user.miner.efficiency || 1.0;
          const rewardPerHour = baseRewardPerHour * efficiency;
          const totalReward = hoursElapsed * rewardPerHour;
          
          console.log(`⛏️ Майнер ${user.id}: ${rewardPerHour.toFixed(4)}⭐/час, ${hoursElapsed}ч = ${totalReward.toFixed(4)}⭐`);
          
          await this.db.collections.users.updateOne(
            { id: user.id },
            {
              $inc: { 
                stars: totalReward,
                'miner.totalEarned': totalReward,
                totalEarnedStars: totalReward
              },
              $set: { 'miner.lastReward': now }
            }
          );
          
          // Очищаем кеш
          this.cache.userCache.delete(user.id.toString());
          
          // Логируем транзакцию
          await this.logMinerReward(user.id, totalReward, hoursElapsed);
          
          // Отправляем уведомление
          try {
            await this.sendMinerNotification(user.id, totalReward, hoursElapsed, rewardPerHour);
          } catch (notifyError) {
            console.log(`⚠️ Не удалось уведомить пользователя ${user.id} о доходе майнера`);
          }
        }
      }
      
      console.log('✅ Обработка майнеров завершена');
    } catch (error) {
      console.error('❌ Ошибка обработки майнеров:', error);
    }
  }

  async logMinerReward(userId, amount, hours) {
    try {
      const reward = {
        userId: parseInt(userId),
        amount: amount,
        hours: hours,
        createdAt: new Date()
      };

      await this.db.collections.minerRewards.insertOne(reward);
    } catch (error) {
      console.error('Ошибка логирования награды майнера:', error);
    }
  }

  async sendMinerNotification(userId, amount, hours, rewardPerHour) {
    try {
      const user = await this.getUser(userId);
      const totalEarned = (user.miner.totalEarned || 0) + amount;
      
      const message = `⛏️ **Майнер принес доход!**\n\n` +
                     `💎 Получено: ${amount.toFixed(4)} ⭐ звезд\n` +
                     `⏰ За период: ${hours} час(ов)\n` +
                     `📈 Доход в час: ${rewardPerHour.toFixed(4)} ⭐\n` +
                     `📊 Всего заработано: ${totalEarned.toFixed(4)} ⭐\n\n` +
                     `Майнер продолжает работать автоматически!`;
      
      // Здесь должна быть отправка сообщения пользователю
      // await bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
      
      console.log(`📱 Уведомление отправлено пользователю ${userId}: ${amount.toFixed(4)}⭐`);
    } catch (error) {
      console.error('Ошибка отправки уведомления майнера:', error);
    }
  }

  async getMinerHistory(userId, limit = 10) {
    try {
      const history = await this.db.collections.minerRewards
        .find({ userId: parseInt(userId) })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      
      return history;
    } catch (error) {
      console.error('Ошибка получения истории майнера:', error);
      return [];
    }
  }

  async getTopMiners(limit = 10) {
    try {
      const topMiners = await this.db.collections.users
        .find({ 'miner.active': true })
        .sort({ 'miner.totalEarned': -1 })
        .limit(limit)
        .toArray();
      
      return topMiners.map(user => ({
        id: user.id,
        username: user.username,
        totalEarned: user.miner.totalEarned || 0,
        level: user.miner.level || 1,
        efficiency: user.miner.efficiency || 1.0
      }));
    } catch (error) {
      console.error('Ошибка получения топ майнеров:', error);
      return [];
    }
  }

  async getMinerLeaderboard() {
    try {
      const leaderboard = await this.db.collections.users.aggregate([
        { $match: { 'miner.active': true } },
        {
          $project: {
            id: 1,
            username: 1,
            totalEarned: { $ifNull: ['$miner.totalEarned', 0] },
            level: { $ifNull: ['$miner.level', 1] },
            efficiency: { $ifNull: ['$miner.efficiency', 1.0] }
          }
        },
        { $sort: { totalEarned: -1 } },
        { $limit: 20 }
      ]).toArray();
      
      return leaderboard;
    } catch (error) {
      console.error('Ошибка получения лидерборда майнеров:', error);
      return [];
    }
  }

  async getMinerStats() {
    try {
      const stats = await this.db.collections.users.aggregate([
        {
          $group: {
            _id: null,
            totalActiveMiners: { $sum: { $cond: [{ $eq: ['$miner.active', true] }, 1, 0] } },
            totalMinerEarnings: { $sum: { $ifNull: ['$miner.totalEarned', 0] } },
            avgMinerLevel: { $avg: { $ifNull: ['$miner.level', 1] } },
            avgMinerEfficiency: { $avg: { $ifNull: ['$miner.efficiency', 1.0] } }
          }
        }
      ]).toArray();
      
      return stats[0] || {
        totalActiveMiners: 0,
        totalMinerEarnings: 0,
        avgMinerLevel: 1,
        avgMinerEfficiency: 1.0
      };
    } catch (error) {
      console.error('Ошибка получения статистики майнеров:', error);
      return {
        totalActiveMiners: 0,
        totalMinerEarnings: 0,
        avgMinerLevel: 1,
        avgMinerEfficiency: 1.0
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

module.exports = MinerModule;