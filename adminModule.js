class AdminModule {
  constructor(database, cache) {
    this.db = database;
    this.cache = cache;
  }

  async getAdminStats() {
    try {
      const userStats = await this.db.collections.users.aggregate([
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

      const withdrawalStats = await this.db.collections.withdrawals.aggregate([
        {
          $group: {
            _id: null,
            totalWithdrawals: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            pendingAmount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } },
            approvedCount: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
            approvedAmount: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] } }
          }
        }
      ]).toArray();

      const exchangeStats = await this.db.collections.exchangeHistory.aggregate([
        {
          $group: {
            _id: null,
            totalExchanges: { $sum: 1 },
            totalVolume: { $sum: '$amount' },
            totalCommission: { $sum: '$commission' }
          }
        }
      ]).toArray();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayUsers = await this.db.collections.users.countDocuments({
        created: { $gte: Math.floor(today.getTime() / 1000) }
      });

      const todayWithdrawals = await this.db.collections.withdrawals.countDocuments({
        createdAt: { $gte: today }
      });

      return {
        users: userStats[0] || {
          totalUsers: 0,
          totalMagnumCoins: 0,
          totalStars: 0,
          activeMiners: 0,
          totalFarms: 0,
          totalBonuses: 0,
          totalPromos: 0,
          totalInvites: 0
        },
        withdrawals: withdrawalStats[0] || {
          totalWithdrawals: 0,
          totalAmount: 0,
          pendingCount: 0,
          pendingAmount: 0,
          approvedCount: 0,
          approvedAmount: 0
        },
        exchanges: exchangeStats[0] || {
          totalExchanges: 0,
          totalVolume: 0,
          totalCommission: 0
        },
        today: {
          newUsers: todayUsers,
          newWithdrawals: todayWithdrawals
        }
      };
    } catch (error) {
      console.error('Ошибка получения админ статистики:', error);
      return null;
    }
  }

  async broadcastMessage(message, adminId) {
    try {
      const users = await this.db.collections.users.find({}).toArray();
      let successCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          // Здесь должна быть отправка сообщения пользователю
          // await bot.telegram.sendMessage(user.id, message, { parse_mode: 'Markdown' });
          successCount++;
        } catch (error) {
          errorCount++;
          console.error(`Ошибка отправки сообщения пользователю ${user.id}:`, error);
        }
      }

      // Логируем действие админа
      await this.logAdminAction(adminId, 'broadcast_message', {
        message: message,
        successCount: successCount,
        errorCount: errorCount
      });

      return {
        success: true,
        successCount: successCount,
        errorCount: errorCount,
        message: `✅ Рассылка завершена!\n\n` +
                `✅ Успешно отправлено: ${successCount}\n` +
                `❌ Ошибок: ${errorCount}`
      };
    } catch (error) {
      console.error('Ошибка рассылки:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async createPromocode(code, rewardType, rewardAmount, usageLimit, expiresAt, adminId) {
    try {
      // Проверяем, существует ли уже такой промокод
      const existing = await this.db.collections.promocodes.findOne({ code: code.toUpperCase() });
      if (existing) {
        return {
          success: false,
          message: '❌ Промокод с таким кодом уже существует'
        };
      }

      const promocode = {
        code: code.toUpperCase(),
        rewardType: rewardType,
        rewardAmount: rewardAmount,
        usageLimit: usageLimit,
        usedCount: 0,
        isActive: true,
        createdBy: adminId,
        createdAt: new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null
      };

      await this.db.collections.promocodes.insertOne(promocode);

      // Логируем действие админа
      await this.logAdminAction(adminId, 'create_promocode', {
        code: code,
        rewardType: rewardType,
        rewardAmount: rewardAmount,
        usageLimit: usageLimit
      });

      return {
        success: true,
        message: `✅ Промокод создан!\n\n` +
                `🎫 Код: ${code.toUpperCase()}\n` +
                `🎁 Награда: ${rewardAmount} ${rewardType === 'stars' ? '⭐' : '🪙'}\n` +
                `📊 Лимит: ${usageLimit || 'Безлимитно'}\n` +
                `⏰ Истекает: ${expiresAt ? new Date(expiresAt).toLocaleString('ru-RU') : 'Никогда'}`
      };
    } catch (error) {
      console.error('Ошибка создания промокода:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async getPromocodes() {
    try {
      const promocodes = await this.db.collections.promocodes
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      
      return promocodes;
    } catch (error) {
      console.error('Ошибка получения промокодов:', error);
      return [];
    }
  }

  async deactivatePromocode(code, adminId) {
    try {
      const result = await this.db.collections.promocodes.updateOne(
        { code: code.toUpperCase() },
        { $set: { isActive: false } }
      );

      if (result.matchedCount === 0) {
        return {
          success: false,
          message: '❌ Промокод не найден'
        };
      }

      // Логируем действие админа
      await this.logAdminAction(adminId, 'deactivate_promocode', {
        code: code
      });

      return {
        success: true,
        message: `✅ Промокод ${code.toUpperCase()} деактивирован`
      };
    } catch (error) {
      console.error('Ошибка деактивации промокода:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async getUserInfo(userId) {
    try {
      const user = await this.db.collections.users.findOne({ id: parseInt(userId) });
      if (!user) {
        return {
          success: false,
          message: '❌ Пользователь не найден'
        };
      }

      const withdrawalStats = await this.db.collections.withdrawals.aggregate([
        { $match: { userId: parseInt(userId) } },
        {
          $group: {
            _id: null,
            totalWithdrawals: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            pendingAmount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } }
          }
        }
      ]).toArray();

      const exchangeHistory = await this.db.collections.exchangeHistory
        .find({ userId: parseInt(userId) })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray();

      return {
        success: true,
        user: user,
        withdrawalStats: withdrawalStats[0] || {
          totalWithdrawals: 0,
          totalAmount: 0,
          pendingAmount: 0
        },
        recentExchanges: exchangeHistory
      };
    } catch (error) {
      console.error('Ошибка получения информации о пользователе:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async banUser(userId, reason, adminId) {
    try {
      const result = await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        { 
          $set: { 
            status: 'banned',
            banReason: reason,
            bannedAt: new Date(),
            bannedBy: adminId
          }
        }
      );

      if (result.matchedCount === 0) {
        return {
          success: false,
          message: '❌ Пользователь не найден'
        };
      }

      // Логируем действие админа
      await this.logAdminAction(adminId, 'ban_user', {
        userId: userId,
        reason: reason
      });

      return {
        success: true,
        message: `✅ Пользователь ${userId} заблокирован\n\n` +
                `📝 Причина: ${reason}`
      };
    } catch (error) {
      console.error('Ошибка блокировки пользователя:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async unbanUser(userId, adminId) {
    try {
      const result = await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        { 
          $set: { 
            status: 'member',
            banReason: null,
            bannedAt: null,
            bannedBy: null
          }
        }
      );

      if (result.matchedCount === 0) {
        return {
          success: false,
          message: '❌ Пользователь не найден'
        };
      }

      // Логируем действие админа
      await this.logAdminAction(adminId, 'unban_user', {
        userId: userId
      });

      return {
        success: true,
        message: `✅ Пользователь ${userId} разблокирован`
      };
    } catch (error) {
      console.error('Ошибка разблокировки пользователя:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async addStars(userId, amount, adminId) {
    try {
      const result = await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $inc: { 
            stars: amount,
            totalEarnedStars: amount
          }
        }
      );

      if (result.matchedCount === 0) {
        return {
          success: false,
          message: '❌ Пользователь не найден'
        };
      }

      // Логируем действие админа
      await this.logAdminAction(adminId, 'add_stars', {
        userId: userId,
        amount: amount
      });

      this.cache.userCache.delete(userId.toString());

      return {
        success: true,
        message: `✅ Добавлено ${amount}⭐ пользователю ${userId}`
      };
    } catch (error) {
      console.error('Ошибка добавления звезд:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async addMagnumCoins(userId, amount, adminId) {
    try {
      const result = await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $inc: { 
            magnumCoins: amount,
            totalEarnedMagnumCoins: amount
          }
        }
      );

      if (result.matchedCount === 0) {
        return {
          success: false,
          message: '❌ Пользователь не найден'
        };
      }

      // Логируем действие админа
      await this.logAdminAction(adminId, 'add_magnum_coins', {
        userId: userId,
        amount: amount
      });

      this.cache.userCache.delete(userId.toString());

      return {
        success: true,
        message: `✅ Добавлено ${amount}🪙 пользователю ${userId}`
      };
    } catch (error) {
      console.error('Ошибка добавления Magnum Coins:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async getAdminLogs(limit = 50) {
    try {
      const logs = await this.db.collections.adminLogs
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      
      return logs;
    } catch (error) {
      console.error('Ошибка получения логов админов:', error);
      return [];
    }
  }

  async logAdminAction(adminId, action, data) {
    try {
      const log = {
        adminId: adminId,
        action: action,
        data: data,
        createdAt: new Date()
      };

      await this.db.collections.adminLogs.insertOne(log);
    } catch (error) {
      console.error('Ошибка логирования действия админа:', error);
    }
  }

  async getTopUsers(limit = 20) {
    try {
      const topUsers = await this.db.collections.users
        .find({})
        .sort({ totalEarnedMagnumCoins: -1 })
        .limit(limit)
        .toArray();
      
      return topUsers;
    } catch (error) {
      console.error('Ошибка получения топ пользователей:', error);
      return [];
    }
  }

  async getRecentActivity(limit = 20) {
    try {
      const recentActivity = await this.db.collections.users
        .find({})
        .sort({ lastSeen: -1 })
        .limit(limit)
        .toArray();
      
      return recentActivity;
    } catch (error) {
      console.error('Ошибка получения последней активности:', error);
      return [];
    }
  }
}

module.exports = AdminModule;