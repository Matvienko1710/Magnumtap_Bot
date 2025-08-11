class SupportModule {
  constructor(database, cache) {
    this.db = database;
    this.cache = cache;
  }

  async createTicket(userId, subject, message, ctx) {
    try {
      const user = await this.getUser(userId);
      
      // Проверяем, нет ли уже открытого тикета
      const openTicket = await this.db.collections.support.findOne({
        userId: parseInt(userId),
        status: 'open'
      });

      if (openTicket) {
        return {
          success: false,
          message: '❌ У вас уже есть открытый тикет. Дождитесь ответа поддержки.'
        };
      }

      const ticket = {
        userId: parseInt(userId),
        subject: subject,
        message: message,
        status: 'open',
        priority: 'normal',
        createdAt: new Date(),
        updatedAt: new Date(),
        adminNotes: '',
        assignedTo: null,
        messages: [
          {
            from: 'user',
            message: message,
            timestamp: new Date()
          }
        ]
      };

      const result = await this.db.collections.support.insertOne(ticket);

      // Уведомляем админов о новом тикете
      await this.notifyAdminsNewTicket(ticket, user);

      return {
        success: true,
        ticketId: result.insertedId,
        message: `✅ Тикет создан!\n\n` +
                `📋 Тема: ${subject}\n` +
                `📝 Сообщение: ${message}\n` +
                `📊 Статус: Открыт\n\n` +
                `⏱️ Время ответа: 1-24 часа`
      };
    } catch (error) {
      console.error('Ошибка создания тикета:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async addMessage(ticketId, userId, message, isAdmin = false) {
    try {
      const ticket = await this.db.collections.support.findOne({ _id: ticketId });
      if (!ticket) {
        return {
          success: false,
          message: '❌ Тикет не найден'
        };
      }

      if (ticket.status === 'closed') {
        return {
          success: false,
          message: '❌ Тикет закрыт'
        };
      }

      const newMessage = {
        from: isAdmin ? 'admin' : 'user',
        message: message,
        timestamp: new Date()
      };

      await this.db.collections.support.updateOne(
        { _id: ticketId },
        {
          $push: { messages: newMessage },
          $set: { 
            updatedAt: new Date(),
            status: isAdmin ? 'answered' : 'waiting'
          }
        }
      );

      // Уведомляем о новом сообщении
      if (isAdmin) {
        await this.notifyUserNewMessage(ticket.userId, ticket.subject);
      } else {
        await this.notifyAdminsNewMessage(ticket, message);
      }

      return {
        success: true,
        message: '✅ Сообщение добавлено'
      };
    } catch (error) {
      console.error('Ошибка добавления сообщения:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async closeTicket(ticketId, adminId, notes = '') {
    try {
      const ticket = await this.db.collections.support.findOne({ _id: ticketId });
      if (!ticket) {
        return {
          success: false,
          message: '❌ Тикет не найден'
        };
      }

      await this.db.collections.support.updateOne(
        { _id: ticketId },
        {
          $set: {
            status: 'closed',
            adminNotes: notes,
            closedBy: adminId,
            closedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      // Уведомляем пользователя о закрытии тикета
      await this.notifyUserTicketClosed(ticket.userId, ticket.subject, notes);

      return {
        success: true,
        message: '✅ Тикет закрыт'
      };
    } catch (error) {
      console.error('Ошибка закрытия тикета:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async getUserTickets(userId, limit = 10) {
    try {
      const tickets = await this.db.collections.support
        .find({ userId: parseInt(userId) })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      
      return tickets;
    } catch (error) {
      console.error('Ошибка получения тикетов пользователя:', error);
      return [];
    }
  }

  async getOpenTickets(limit = 50) {
    try {
      const tickets = await this.db.collections.support
        .find({ status: { $in: ['open', 'waiting'] } })
        .sort({ createdAt: 1 })
        .limit(limit)
        .toArray();
      
      // Получаем информацию о пользователях
      const userIds = tickets.map(t => t.userId);
      const users = await this.db.collections.users.find({ id: { $in: userIds } }).toArray();
      const userMap = {};
      users.forEach(user => userMap[user.id] = user);
      
      return tickets.map(ticket => ({
        ...ticket,
        user: userMap[ticket.userId]
      }));
    } catch (error) {
      console.error('Ошибка получения открытых тикетов:', error);
      return [];
    }
  }

  async getTicketDetails(ticketId) {
    try {
      const ticket = await this.db.collections.support.findOne({ _id: ticketId });
      if (!ticket) {
        return {
          success: false,
          message: '❌ Тикет не найден'
        };
      }

      const user = await this.getUser(ticket.userId);

      return {
        success: true,
        ticket: ticket,
        user: user
      };
    } catch (error) {
      console.error('Ошибка получения деталей тикета:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async getSupportStats() {
    try {
      const stats = await this.db.collections.support.aggregate([
        {
          $group: {
            _id: null,
            totalTickets: { $sum: 1 },
            openTickets: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
            waitingTickets: { $sum: { $cond: [{ $eq: ['$status', 'waiting'] }, 1, 0] } },
            answeredTickets: { $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] } },
            closedTickets: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } }
          }
        }
      ]).toArray();
      
      return stats[0] || {
        totalTickets: 0,
        openTickets: 0,
        waitingTickets: 0,
        answeredTickets: 0,
        closedTickets: 0
      };
    } catch (error) {
      console.error('Ошибка получения статистики поддержки:', error);
      return {
        totalTickets: 0,
        openTickets: 0,
        waitingTickets: 0,
        answeredTickets: 0,
        closedTickets: 0
      };
    }
  }

  async assignTicket(ticketId, adminId) {
    try {
      const result = await this.db.collections.support.updateOne(
        { _id: ticketId },
        {
          $set: {
            assignedTo: adminId,
            updatedAt: new Date()
          }
        }
      );

      if (result.matchedCount === 0) {
        return {
          success: false,
          message: '❌ Тикет не найден'
        };
      }

      return {
        success: true,
        message: '✅ Тикет назначен'
      };
    } catch (error) {
      console.error('Ошибка назначения тикета:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async changePriority(ticketId, priority, adminId) {
    try {
      const validPriorities = ['low', 'normal', 'high', 'urgent'];
      if (!validPriorities.includes(priority)) {
        return {
          success: false,
          message: '❌ Неверный приоритет'
        };
      }

      const result = await this.db.collections.support.updateOne(
        { _id: ticketId },
        {
          $set: {
            priority: priority,
            updatedAt: new Date()
          }
        }
      );

      if (result.matchedCount === 0) {
        return {
          success: false,
          message: '❌ Тикет не найден'
        };
      }

      return {
        success: true,
        message: `✅ Приоритет изменен на ${priority}`
      };
    } catch (error) {
      console.error('Ошибка изменения приоритета:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async notifyAdminsNewTicket(ticket, user) {
    try {
      const message = `🆕 **Новый тикет поддержки**\n\n` +
                     `👤 Пользователь: @${user.username || 'Unknown'} (${user.id})\n` +
                     `📋 Тема: ${ticket.subject}\n` +
                     `📝 Сообщение: ${ticket.message.substring(0, 100)}${ticket.message.length > 100 ? '...' : ''}\n` +
                     `⏰ Время: ${ticket.createdAt.toLocaleString('ru-RU')}\n\n` +
                     `🆔 ID: \`${ticket._id}\``;
      
      // Здесь должна быть отправка сообщения админам
      console.log(`📢 Уведомление админов о новом тикете: ${message}`);
    } catch (error) {
      console.error('Ошибка уведомления админов о новом тикете:', error);
    }
  }

  async notifyAdminsNewMessage(ticket, message) {
    try {
      const user = await this.getUser(ticket.userId);
      const adminMessage = `💬 **Новое сообщение в тикете**\n\n` +
                          `👤 Пользователь: @${user.username || 'Unknown'} (${user.id})\n` +
                          `📋 Тема: ${ticket.subject}\n` +
                          `📝 Сообщение: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}\n` +
                          `⏰ Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
                          `🆔 ID: \`${ticket._id}\``;
      
      // Здесь должна быть отправка сообщения админам
      console.log(`📢 Уведомление админов о новом сообщении: ${adminMessage}`);
    } catch (error) {
      console.error('Ошибка уведомления админов о новом сообщении:', error);
    }
  }

  async notifyUserNewMessage(userId, subject) {
    try {
      const message = `💬 **Новое сообщение в тикете**\n\n` +
                     `📋 Тема: ${subject}\n` +
                     `📝 Поддержка ответила на ваш тикет\n\n` +
                     `Проверьте статус тикета в разделе "Поддержка"`;
      
      // Здесь должна быть отправка сообщения пользователю
      console.log(`📱 Уведомление пользователю ${userId}: ${message}`);
    } catch (error) {
      console.error('Ошибка уведомления пользователя о новом сообщении:', error);
    }
  }

  async notifyUserTicketClosed(userId, subject, notes) {
    try {
      const message = `🔒 **Тикет закрыт**\n\n` +
                     `📋 Тема: ${subject}\n` +
                     `📝 Примечание: ${notes || 'Нет'}\n\n` +
                     `Спасибо за обращение!`;
      
      // Здесь должна быть отправка сообщения пользователю
      console.log(`📱 Уведомление пользователю ${userId}: ${message}`);
    } catch (error) {
      console.error('Ошибка уведомления пользователя о закрытии тикета:', error);
    }
  }

  async getFaq() {
    return [
      {
        question: 'Как работает фарм?',
        answer: 'Фарм позволяет получать звезды каждые 10 секунд. Нажмите кнопку "🌾 Фарм" в главном меню.'
      },
      {
        question: 'Что такое ежедневный бонус?',
        answer: 'Ежедневный бонус можно получать раз в день. Чем дольше серия, тем больше награда.'
      },
      {
        question: 'Как работает майнер?',
        answer: 'Майнер работает автоматически и приносит доход каждые 30 минут. Запустите его в разделе "⛏️ Майнер".'
      },
      {
        question: 'Как обменять валюту?',
        answer: 'Используйте раздел "💱 Обмен" для конвертации звезд в Magnum Coins и наоборот.'
      },
      {
        question: 'Как вывести средства?',
        answer: 'Для вывода Magnum Coins используйте раздел "💳 Вывод". Минимальная сумма: 100🪙.'
      },
      {
        question: 'Как пригласить друзей?',
        answer: 'Поделитесь своей реферальной ссылкой из раздела "👥 Рефералы" и получайте бонусы за каждого приглашенного.'
      },
      {
        question: 'Что такое промокоды?',
        answer: 'Промокоды дают дополнительные награды. Активируйте их в разделе "🎫 Промокоды".'
      },
      {
        question: 'Как получить достижения?',
        answer: 'Выполняйте различные действия в боте и получайте достижения с наградами в разделе "🏆 Достижения".'
      }
    ];
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

module.exports = SupportModule;