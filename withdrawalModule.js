class WithdrawalModule {
  constructor(database, cache) {
    this.db = database;
    this.cache = cache;
  }

  async createWithdrawal(userId, amount, method, wallet, ctx) {
    try {
      const user = await this.getUser(userId);
      
      if (user.magnumCoins < amount) {
        return {
          success: false,
          message: '❌ Недостаточно Magnum Coins для вывода'
        };
      }

      if (amount < 100) {
        return {
          success: false,
          message: '❌ Минимальная сумма вывода: 100🪙'
        };
      }

      if (amount > 10000) {
        return {
          success: false,
          message: '❌ Максимальная сумма вывода: 10,000🪙'
        };
      }

      // Проверяем валидность кошелька
      if (!this.validateWallet(wallet, method)) {
        return {
          success: false,
          message: '❌ Неверный формат кошелька'
        };
      }

      // Создаем заявку на вывод
      const withdrawal = {
        userId: parseInt(userId),
        amount: amount,
        method: method,
        wallet: wallet,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        adminNotes: '',
        processedBy: null,
        processedAt: null
      };

      const result = await this.db.collections.withdrawals.insertOne(withdrawal);

      // Резервируем средства пользователя
      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $inc: { 
            magnumCoins: -amount,
            'statistics.totalWithdrawals': 1
          },
          $set: { lastSeen: Math.floor(Date.now() / 1000) }
        }
      );

      this.cache.userCache.delete(userId.toString());

      // Отправляем уведомление в канал выводов
      await this.notifyWithdrawalChannel(withdrawal, user);

      return {
        success: true,
        withdrawalId: result.insertedId,
        message: `✅ Заявка на вывод создана!\n\n` +
                `💰 Сумма: ${amount}🪙\n` +
                `💳 Метод: ${this.getMethodName(method)}\n` +
                `📋 Статус: Ожидает обработки\n\n` +
                `⏱️ Время обработки: 1-24 часа`
      };
    } catch (error) {
      console.error('Ошибка создания заявки на вывод:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async getWithdrawalHistory(userId, limit = 10) {
    try {
      const history = await this.db.collections.withdrawals
        .find({ userId: parseInt(userId) })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      
      return history;
    } catch (error) {
      console.error('Ошибка получения истории выводов:', error);
      return [];
    }
  }

  async getWithdrawalStats(userId) {
    try {
      const stats = await this.db.collections.withdrawals.aggregate([
        { $match: { userId: parseInt(userId) } },
        {
          $group: {
            _id: null,
            totalWithdrawals: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            pendingAmount: { 
              $sum: { 
                $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] 
              } 
            },
            approvedAmount: { 
              $sum: { 
                $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] 
              } 
            },
            rejectedAmount: { 
              $sum: { 
                $cond: [{ $eq: ['$status', 'rejected'] }, '$amount', 0] 
              } 
            }
          }
        }
      ]).toArray();
      
      return stats[0] || {
        totalWithdrawals: 0,
        totalAmount: 0,
        pendingAmount: 0,
        approvedAmount: 0,
        rejectedAmount: 0
      };
    } catch (error) {
      console.error('Ошибка получения статистики выводов:', error);
      return {
        totalWithdrawals: 0,
        totalAmount: 0,
        pendingAmount: 0,
        approvedAmount: 0,
        rejectedAmount: 0
      };
    }
  }

  async getPendingWithdrawals(limit = 50) {
    try {
      const pending = await this.db.collections.withdrawals
        .find({ status: 'pending' })
        .sort({ createdAt: 1 })
        .limit(limit)
        .toArray();
      
      // Получаем информацию о пользователях
      const userIds = pending.map(w => w.userId);
      const users = await this.db.collections.users.find({ id: { $in: userIds } }).toArray();
      const userMap = {};
      users.forEach(user => userMap[user.id] = user);
      
      return pending.map(withdrawal => ({
        ...withdrawal,
        user: userMap[withdrawal.userId]
      }));
    } catch (error) {
      console.error('Ошибка получения ожидающих выводов:', error);
      return [];
    }
  }

  async approveWithdrawal(withdrawalId, adminId, notes = '') {
    try {
      const withdrawal = await this.db.collections.withdrawals.findOne({ _id: withdrawalId });
      if (!withdrawal) {
        return {
          success: false,
          message: '❌ Заявка на вывод не найдена'
        };
      }

      if (withdrawal.status !== 'pending') {
        return {
          success: false,
          message: '❌ Заявка уже обработана'
        };
      }

      await this.db.collections.withdrawals.updateOne(
        { _id: withdrawalId },
        {
          $set: {
            status: 'approved',
            adminNotes: notes,
            processedBy: adminId,
            processedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      // Логируем действие админа
      await this.logAdminAction(adminId, 'approve_withdrawal', {
        withdrawalId: withdrawalId,
        userId: withdrawal.userId,
        amount: withdrawal.amount
      });

      // Уведомляем пользователя
      await this.notifyUserWithdrawalStatus(withdrawal.userId, 'approved', withdrawal.amount, notes);

      return {
        success: true,
        message: '✅ Вывод одобрен'
      };
    } catch (error) {
      console.error('Ошибка одобрения вывода:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async rejectWithdrawal(withdrawalId, adminId, notes = '') {
    try {
      const withdrawal = await this.db.collections.withdrawals.findOne({ _id: withdrawalId });
      if (!withdrawal) {
        return {
          success: false,
          message: '❌ Заявка на вывод не найдена'
        };
      }

      if (withdrawal.status !== 'pending') {
        return {
          success: false,
          message: '❌ Заявка уже обработана'
        };
      }

      await this.db.collections.withdrawals.updateOne(
        { _id: withdrawalId },
        {
          $set: {
            status: 'rejected',
            adminNotes: notes,
            processedBy: adminId,
            processedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      // Возвращаем средства пользователю
      await this.db.collections.users.updateOne(
        { id: withdrawal.userId },
        {
          $inc: { magnumCoins: withdrawal.amount }
        }
      );

      this.cache.userCache.delete(withdrawal.userId.toString());

      // Логируем действие админа
      await this.logAdminAction(adminId, 'reject_withdrawal', {
        withdrawalId: withdrawalId,
        userId: withdrawal.userId,
        amount: withdrawal.amount
      });

      // Уведомляем пользователя
      await this.notifyUserWithdrawalStatus(withdrawal.userId, 'rejected', withdrawal.amount, notes);

      return {
        success: true,
        message: '❌ Вывод отклонен'
      };
    } catch (error) {
      console.error('Ошибка отклонения вывода:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async getWithdrawalStats() {
    try {
      const stats = await this.db.collections.withdrawals.aggregate([
        {
          $group: {
            _id: null,
            totalWithdrawals: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            pendingCount: { 
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } 
            },
            pendingAmount: { 
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } 
            },
            approvedCount: { 
              $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } 
            },
            approvedAmount: { 
              $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] } 
            },
            rejectedCount: { 
              $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } 
            },
            rejectedAmount: { 
              $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, '$amount', 0] } 
            }
          }
        }
      ]).toArray();
      
      return stats[0] || {
        totalWithdrawals: 0,
        totalAmount: 0,
        pendingCount: 0,
        pendingAmount: 0,
        approvedCount: 0,
        approvedAmount: 0,
        rejectedCount: 0,
        rejectedAmount: 0
      };
    } catch (error) {
      console.error('Ошибка получения статистики выводов:', error);
      return {
        totalWithdrawals: 0,
        totalAmount: 0,
        pendingCount: 0,
        pendingAmount: 0,
        approvedCount: 0,
        approvedAmount: 0,
        rejectedCount: 0,
        rejectedAmount: 0
      };
    }
  }

  validateWallet(wallet, method) {
    if (method === 'USDT_TRC20') {
      return /^T[A-Za-z1-9]{33}$/.test(wallet);
    } else if (method === 'BTC') {
      return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(wallet);
    } else if (method === 'ETH') {
      return /^0x[a-fA-F0-9]{40}$/.test(wallet);
    }
    return false;
  }

  getMethodName(method) {
    const methods = {
      'USDT_TRC20': 'USDT (TRC20)',
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum'
    };
    return methods[method] || method;
  }

  async notifyWithdrawalChannel(withdrawal, user) {
    try {
      const message = `💰 **Новая заявка на вывод**\n\n` +
                     `👤 Пользователь: @${user.username || 'Unknown'} (${user.id})\n` +
                     `💰 Сумма: ${withdrawal.amount}🪙\n` +
                     `💳 Метод: ${this.getMethodName(withdrawal.method)}\n` +
                     `📋 Кошелек: \`${withdrawal.wallet}\`\n` +
                     `⏰ Время: ${withdrawal.createdAt.toLocaleString('ru-RU')}\n\n` +
                     `🆔 ID: \`${withdrawal._id}\``;
      
      // Здесь должна быть отправка сообщения в канал
      console.log(`📢 Уведомление в канал выводов: ${message}`);
    } catch (error) {
      console.error('Ошибка отправки уведомления в канал:', error);
    }
  }

  async notifyUserWithdrawalStatus(userId, status, amount, notes) {
    try {
      const statusText = status === 'approved' ? '✅ одобрен' : '❌ отклонен';
      const message = `💳 **Заявка на вывод ${statusText}**\n\n` +
                     `💰 Сумма: ${amount}🪙\n` +
                     `📝 Примечание: ${notes || 'Нет'}\n\n` +
                     `⏰ Время обработки: ${new Date().toLocaleString('ru-RU')}`;
      
      // Здесь должна быть отправка сообщения пользователю
      console.log(`📱 Уведомление пользователю ${userId}: ${message}`);
    } catch (error) {
      console.error('Ошибка отправки уведомления пользователю:', error);
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

module.exports = WithdrawalModule;