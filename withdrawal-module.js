// ==================== МОДУЛЬ ВЫВОДА СРЕДСТВ ====================

class WithdrawalModule {
  constructor(db, userCache, config) {
    this.db = db;
    this.userCache = userCache;
    this.config = config;
  }

  // Создание заявки на вывод
  async createWithdrawalRequest(userId, currency, amount, wallet, method) {
    try {
      const user = await this.getUser(userId);
      if (!user) {
        return { success: false, message: 'Пользователь не найден' };
      }

      // Проверяем баланс
      const userBalance = currency === 'stars' ? user.stars : user.magnumCoins;
      if (userBalance < amount) {
        return { success: false, message: 'Недостаточно средств' };
      }

      // Проверяем минимальную сумму
      if (amount < this.config.MIN_WITHDRAWAL) {
        return { success: false, message: `Минимальная сумма вывода: ${this.config.MIN_WITHDRAWAL}` };
      }

      // Проверяем максимальную сумму
      if (amount > this.config.MAX_WITHDRAWAL) {
        return { success: false, message: `Максимальная сумма вывода: ${this.config.MAX_WITHDRAWAL}` };
      }

      // Проверяем валидность кошелька
      if (!this.validateWallet(wallet, method)) {
        return { success: false, message: 'Неверный формат кошелька' };
      }

      // Создаем заявку
      const withdrawal = {
        userId: userId,
        username: user.username,
        firstName: user.firstName,
        currency: currency,
        amount: amount,
        wallet: wallet,
        method: method,
        status: 'pending', // pending, approved, rejected, completed
        adminId: null,
        adminNotes: '',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await this.db.collection('withdrawalRequests').insertOne(withdrawal);

      if (result.insertedId) {
        // Резервируем средства
        await this.db.collection('users').updateOne(
          { id: userId },
          {
            $inc: {
              [currency === 'stars' ? 'stars' : 'magnumCoins']: -amount,
              'withdrawal.pendingAmount': amount,
              'withdrawal.withdrawalCount': 1
            },
            $set: { updatedAt: new Date() }
          }
        );

        // Очищаем кеш пользователя
        this.userCache.delete(userId);

        // Уведомляем админов
        await this.notifyAdmins(withdrawal);

        return {
          success: true,
          message: 'Заявка на вывод создана успешно!',
          withdrawalId: result.insertedId
        };
      }

      return { success: false, message: 'Ошибка создания заявки' };
    } catch (error) {
      console.error('Ошибка создания заявки на вывод:', error);
      return { success: false, message: 'Ошибка создания заявки' };
    }
  }

  // Получение заявок пользователя
  async getUserWithdrawals(userId, limit = 10) {
    try {
      const withdrawals = await this.db.collection('withdrawalRequests')
        .find({ userId: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();

      return withdrawals;
    } catch (error) {
      console.error('Ошибка получения заявок пользователя:', error);
      return [];
    }
  }

  // Получение всех заявок (для админов)
  async getAllWithdrawals(status = null, limit = 50) {
    try {
      const filter = {};
      if (status) {
        filter.status = status;
      }

      const withdrawals = await this.db.collection('withdrawalRequests')
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();

      return withdrawals;
    } catch (error) {
      console.error('Ошибка получения всех заявок:', error);
      return [];
    }
  }

  // Обработка заявки админом
  async processWithdrawal(withdrawalId, adminId, action, notes = '') {
    try {
      const withdrawal = await this.db.collection('withdrawalRequests').findOne({
        _id: withdrawalId
      });

      if (!withdrawal) {
        return { success: false, message: 'Заявка не найдена' };
      }

      if (withdrawal.status !== 'pending') {
        return { success: false, message: 'Заявка уже обработана' };
      }

      let newStatus = 'pending';
      let updateData = {};

      switch (action) {
        case 'approve':
          newStatus = 'approved';
          updateData = {
            status: newStatus,
            adminId: adminId,
            adminNotes: notes,
            approvedAt: new Date(),
            updatedAt: new Date()
          };
          break;

        case 'reject':
          newStatus = 'rejected';
          updateData = {
            status: newStatus,
            adminId: adminId,
            adminNotes: notes,
            rejectedAt: new Date(),
            updatedAt: new Date()
          };

          // Возвращаем средства пользователю
          await this.db.collection('users').updateOne(
            { id: withdrawal.userId },
            {
              $inc: {
                [withdrawal.currency === 'stars' ? 'stars' : 'magnumCoins']: withdrawal.amount,
                'withdrawal.pendingAmount': -withdrawal.amount
              },
              $set: { updatedAt: new Date() }
            }
          );

          this.userCache.delete(withdrawal.userId);
          break;

        case 'complete':
          newStatus = 'completed';
          updateData = {
            status: newStatus,
            adminId: adminId,
            adminNotes: notes,
            completedAt: new Date(),
            updatedAt: new Date()
          };

          // Снимаем с резерва
          await this.db.collection('users').updateOne(
            { id: withdrawal.userId },
            {
              $inc: {
                'withdrawal.pendingAmount': -withdrawal.amount,
                'withdrawal.totalWithdrawn': withdrawal.amount
              },
              $set: { updatedAt: new Date() }
            }
          );

          this.userCache.delete(withdrawal.userId);
          break;

        default:
          return { success: false, message: 'Неверное действие' };
      }

      await this.db.collection('withdrawalRequests').updateOne(
        { _id: withdrawalId },
        { $set: updateData }
      );

      // Уведомляем пользователя
      await this.notifyUser(withdrawal, newStatus, notes);

      return {
        success: true,
        message: `Заявка ${action === 'approve' ? 'одобрена' : action === 'reject' ? 'отклонена' : 'завершена'}`,
        status: newStatus
      };
    } catch (error) {
      console.error('Ошибка обработки заявки:', error);
      return { success: false, message: 'Ошибка обработки заявки' };
    }
  }

  // Валидация кошелька
  validateWallet(wallet, method) {
    if (!wallet || wallet.trim().length === 0) {
      return false;
    }

    switch (method) {
      case 'ton':
        // Простая проверка TON кошелька
        return /^[0-9a-zA-Z]{48}$/.test(wallet);
      
      case 'btc':
        // Простая проверка BTC кошелька
        return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(wallet);
      
      case 'eth':
        // Простая проверка ETH кошелька
        return /^0x[a-fA-F0-9]{40}$/.test(wallet);
      
      case 'usdt':
        // USDT может быть на разных сетях
        return wallet.length >= 26 && wallet.length <= 35;
      
      default:
        return wallet.length >= 10; // Минимальная длина для других методов
    }
  }

  // Уведомление админов
  async notifyAdmins(withdrawal) {
    try {
      if (!this.config.WITHDRAWAL_CHANNEL) return;

      const message = 
        `💰 *Новая заявка на вывод*\n\n` +
        `👤 Пользователь: ${withdrawal.firstName || 'Не указано'} (@${withdrawal.username || 'без username'})\n` +
        `🆔 ID: \`${withdrawal.userId}\`\n` +
        `💎 Сумма: ${withdrawal.amount} ${withdrawal.currency === 'stars' ? 'Stars' : 'Magnum Coins'}\n` +
        `💳 Метод: ${this.getMethodName(withdrawal.method)}\n` +
        `🔗 Кошелек: \`${withdrawal.wallet}\`\n` +
        `📅 Дата: ${withdrawal.createdAt.toLocaleString('ru-RU')}\n\n` +
        `🆔 ID заявки: \`${withdrawal._id}\``;

      // Здесь можно добавить отправку уведомления в канал
      console.log('Уведомление админам:', message);
    } catch (error) {
      console.error('Ошибка уведомления админов:', error);
    }
  }

  // Уведомление пользователя
  async notifyUser(withdrawal, status, notes) {
    try {
      let statusText = '';
      let emoji = '';

      switch (status) {
        case 'approved':
          statusText = 'одобрена';
          emoji = '✅';
          break;
        case 'rejected':
          statusText = 'отклонена';
          emoji = '❌';
          break;
        case 'completed':
          statusText = 'завершена';
          emoji = '🎉';
          break;
      }

      const message = 
        `${emoji} *Заявка на вывод ${statusText}*\n\n` +
        `💎 Сумма: ${withdrawal.amount} ${withdrawal.currency === 'stars' ? 'Stars' : 'Magnum Coins'}\n` +
        `💳 Метод: ${this.getMethodName(withdrawal.method)}\n` +
        `🔗 Кошелек: \`${withdrawal.wallet}\`\n` +
        `📅 Дата: ${withdrawal.createdAt.toLocaleString('ru-RU')}`;

      if (notes) {
        message += `\n\n📝 Комментарий: ${notes}`;
      }

      // Здесь можно добавить отправку уведомления пользователю
      console.log('Уведомление пользователю:', message);
    } catch (error) {
      console.error('Ошибка уведомления пользователя:', error);
    }
  }

  // Получение названия метода
  getMethodName(method) {
    const methods = {
      'ton': 'TON',
      'btc': 'Bitcoin',
      'eth': 'Ethereum',
      'usdt': 'USDT',
      'card': 'Банковская карта',
      'qiwi': 'QIWI',
      'yoomoney': 'ЮMoney'
    };

    return methods[method] || method;
  }

  // Получение статистики выводов
  async getWithdrawalStats(userId = null) {
    try {
      const filter = {};
      if (userId) {
        filter.userId = userId;
      }

      const stats = await this.db.collection('withdrawalRequests')
        .aggregate([
          { $match: filter },
          {
            $group: {
              _id: null,
              totalRequests: { $sum: 1 },
              totalAmount: { $sum: '$amount' },
              pendingRequests: {
                $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
              },
              pendingAmount: {
                $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] }
              },
              approvedRequests: {
                $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
              },
              approvedAmount: {
                $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] }
              },
              completedRequests: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
              },
              completedAmount: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] }
              },
              rejectedRequests: {
                $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
              },
              rejectedAmount: {
                $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, '$amount', 0] }
              }
            }
          }
        ])
        .toArray();

      return stats[0] || {
        totalRequests: 0,
        totalAmount: 0,
        pendingRequests: 0,
        pendingAmount: 0,
        approvedRequests: 0,
        approvedAmount: 0,
        completedRequests: 0,
        completedAmount: 0,
        rejectedRequests: 0,
        rejectedAmount: 0
      };
    } catch (error) {
      console.error('Ошибка получения статистики выводов:', error);
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

  // Получение статуса с эмодзи
  getStatusWithEmoji(status) {
    const statuses = {
      'pending': '⏳ Ожидает',
      'approved': '✅ Одобрена',
      'rejected': '❌ Отклонена',
      'completed': '🎉 Завершена'
    };

    return statuses[status] || status;
  }
}

module.exports = WithdrawalModule;