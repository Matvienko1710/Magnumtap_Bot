// Дополнительные обработчики для Magnum Stars Bot

class Handlers {
  constructor(bot, modules) {
    this.bot = bot;
    this.modules = modules;
    this.setupHandlers();
  }

  setupHandlers() {
    // Обработчики обмена валют
    this.setupExchangeHandlers();
    
    // Обработчики выводов
    this.setupWithdrawalHandlers();
    
    // Обработчики промокодов
    this.setupPromocodeHandlers();
    
    // Обработчики заданий
    this.setupTaskHandlers();
    
    // Обработчики поддержки
    this.setupSupportHandlers();
    
    // Обработчики админ-панели
    this.setupAdminHandlers();
    
    // Обработчики навигации
    this.setupNavigationHandlers();
  }

  setupExchangeHandlers() {
    // Обмен Magnum на звезды
    this.bot.action(/^exchange_magnum_to_stars$/, async (ctx) => {
      try {
        const user = await this.modules.userModule.getUser(ctx.from.id);
        
        const message = `🪙 → ⭐ **Обмен Magnum Coins на звезды**\n\n` +
                       `💰 Ваш баланс: ${user.magnumCoins}🪙\n` +
                       `💡 Введите сумму для обмена (минимум 1🪙):\n\n` +
                       `📝 Формат: число (например: 100)`;
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: this.modules.interfaceModule.getMainMenu(user).reply_markup
        });
        
        // Устанавливаем состояние ожидания ввода
        ctx.session = ctx.session || {};
        ctx.session.waitingFor = 'magnum_to_stars_amount';
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка обмена Magnum на звезды:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Обмен звезд на Magnum
    this.bot.action(/^exchange_stars_to_magnum$/, async (ctx) => {
      try {
        const user = await this.modules.userModule.getUser(ctx.from.id);
        
        const message = `⭐ → 🪙 **Обмен звезд на Magnum Coins**\n\n` +
                       `💰 Ваш баланс: ${user.stars}⭐\n` +
                       `💡 Введите сумму для обмена (минимум 1⭐):\n\n` +
                       `📝 Формат: число (например: 100)`;
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: this.modules.interfaceModule.getMainMenu(user).reply_markup
        });
        
        ctx.session = ctx.session || {};
        ctx.session.waitingFor = 'stars_to_magnum_amount';
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка обмена звезд на Magnum:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Курсы валют
    this.bot.action(/^exchange_rates$/, async (ctx) => {
      try {
        const rates = await this.modules.exchangeModule.getExchangeRates();
        
        if (rates.success) {
          const message = this.modules.interfaceModule.formatExchangeRates(rates);
          
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: this.modules.interfaceModule.getExchangeMenu().reply_markup
          });
        } else {
          await ctx.reply(rates.message);
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка курсов валют:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Статистика обменов
    this.bot.action(/^exchange_stats$/, async (ctx) => {
      try {
        const stats = await this.modules.exchangeModule.getExchangeStats();
        
        const message = `📊 **Статистика обменов**\n\n` +
                       `📈 Всего обменов: ${stats.totalExchanges}\n` +
                       `💰 Общий объем: ${stats.totalVolume}\n` +
                       `💸 Общая комиссия: ${stats.totalCommission}\n` +
                       `👥 Участников: ${stats.uniqueUsers}\n\n` +
                       `📅 За последние 24 часа:\n` +
                       `🔄 Обменов: ${stats.last24h.exchanges}\n` +
                       `💎 Объем: ${stats.last24h.volume}`;
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: this.modules.interfaceModule.getExchangeMenu().reply_markup
        });
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка статистики обменов:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // История обменов
    this.bot.action(/^exchange_history$/, async (ctx) => {
      try {
        const history = await this.modules.exchangeModule.getExchangeHistory(ctx.from.id, 10);
        
        if (history.length === 0) {
          await ctx.reply('📜 **История обменов**\n\n❌ История пуста');
        } else {
          let message = `📜 **История обменов**\n\n`;
          
          history.forEach((exchange, index) => {
            const date = new Date(exchange.createdAt).toLocaleDateString('ru-RU');
            const type = exchange.type === 'magnum_to_stars' ? '🪙→⭐' : '⭐→🪙';
            
            message += `${index + 1}. ${type} ${exchange.amount} → ${exchange.received}\n`;
            message += `   📅 ${date} | 💸 Комиссия: ${exchange.commission}\n\n`;
          });
          
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: this.modules.interfaceModule.getExchangeMenu().reply_markup
          });
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка истории обменов:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Топ обменников
    this.bot.action(/^exchange_leaderboard$/, async (ctx) => {
      try {
        const topExchangers = await this.modules.exchangeModule.getTopExchangers(10);
        
        if (topExchangers.length === 0) {
          await ctx.reply('🏆 **Топ обменников**\n\n❌ Данные отсутствуют');
        } else {
          let message = `🏆 **Топ обменников**\n\n`;
          
          topExchangers.forEach((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
            message += `${medal} ${index + 1}. @${user.username || 'Unknown'}\n`;
            message += `   💰 Объем: ${user.totalVolume} | 🔄 Обменов: ${user.exchangeCount}\n\n`;
          });
          
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: this.modules.interfaceModule.getExchangeMenu().reply_markup
          });
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка топа обменников:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });
  }

  setupWithdrawalHandlers() {
    // Создание заявки на вывод
    this.bot.action(/^create_withdrawal$/, async (ctx) => {
      try {
        const user = await this.modules.userModule.getUser(ctx.from.id);
        
        if (user.magnumCoins < 100) {
          await ctx.reply('❌ Недостаточно средств для вывода. Минимум: 100🪙');
          await ctx.answerCbQuery();
          return;
        }
        
        const message = `💳 **Создание заявки на вывод**\n\n` +
                       `💰 Доступно: ${user.magnumCoins}🪙\n` +
                       `📊 Минимум: 100🪙 | Максимум: 10,000🪙\n\n` +
                       `💡 Выберите метод вывода:`;
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: this.modules.interfaceModule.getWithdrawalMethodsMenu().reply_markup
        });
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка создания вывода:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Методы вывода
    this.bot.action(/^withdraw_(.+)$/, async (ctx) => {
      try {
        const method = ctx.match[1];
        const user = await this.modules.userModule.getUser(ctx.from.id);
        
        ctx.session = ctx.session || {};
        ctx.session.withdrawalMethod = method;
        ctx.session.waitingFor = 'withdrawal_amount';
        
        const methodNames = {
          'usdt_trc20': 'USDT (TRC20)',
          'btc': 'Bitcoin',
          'eth': 'Ethereum',
          'card': 'Банковская карта'
        };
        
        const message = `💳 **Вывод через ${methodNames[method]}**\n\n` +
                       `💰 Ваш баланс: ${user.magnumCoins}🪙\n` +
                       `💡 Введите сумму для вывода:\n\n` +
                       `📝 Формат: число (например: 500)`;
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: this.modules.interfaceModule.getWithdrawalMenu().reply_markup
        });
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка выбора метода вывода:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // История выводов
    this.bot.action(/^withdrawal_history$/, async (ctx) => {
      try {
        const history = await this.modules.withdrawalModule.getWithdrawalHistory(ctx.from.id, 10);
        const message = this.modules.interfaceModule.formatWithdrawalHistory(history);
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: this.modules.interfaceModule.getWithdrawalMenu().reply_markup
        });
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка истории выводов:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Статистика выводов
    this.bot.action(/^withdrawal_stats$/, async (ctx) => {
      try {
        const stats = await this.modules.withdrawalModule.getWithdrawalStats(ctx.from.id);
        
        const message = `📊 **Статистика выводов**\n\n` +
                       `💰 Всего выведено: ${stats.totalWithdrawn}🪙\n` +
                       `📈 Количество заявок: ${stats.totalRequests}\n` +
                       `✅ Одобрено: ${stats.approvedRequests}\n` +
                       `❌ Отклонено: ${stats.rejectedRequests}\n` +
                       `⏳ В ожидании: ${stats.pendingRequests}\n\n` +
                       `📅 Последний вывод: ${stats.lastWithdrawal || 'Нет'}`;
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: this.modules.interfaceModule.getWithdrawalMenu().reply_markup
        });
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка статистики выводов:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });
  }

  setupPromocodeHandlers() {
    // Активация промокода
    this.bot.action(/^activate_promo$/, async (ctx) => {
      try {
        const message = `🎫 **Активация промокода**\n\n` +
                       `💡 Введите промокод для активации:\n\n` +
                       `📝 Формат: код (например: WELCOME)`;
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: this.modules.interfaceModule.getPromocodesMenu().reply_markup
        });
        
        ctx.session = ctx.session || {};
        ctx.session.waitingFor = 'promocode';
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка активации промокода:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // История промокодов
    this.bot.action(/^promo_history$/, async (ctx) => {
      try {
        const user = await this.modules.userModule.getUser(ctx.from.id);
        const activatedPromos = user.activatedPromocodes || [];
        
        if (activatedPromos.length === 0) {
          await ctx.reply('📜 **История промокодов**\n\n❌ История пуста');
        } else {
          let message = `📜 **История промокодов**\n\n`;
          
          activatedPromos.slice(-10).forEach((promo, index) => {
            const date = new Date(promo.activatedAt).toLocaleDateString('ru-RU');
            message += `${index + 1}. 🎫 ${promo.code}\n`;
            message += `   🎁 Награда: ${promo.reward}\n`;
            message += `   📅 ${date}\n\n`;
          });
          
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: this.modules.interfaceModule.getPromocodesMenu().reply_markup
          });
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка истории промокодов:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });
  }

  setupTaskHandlers() {
    // Ежедневные задания
    this.bot.action(/^daily_tasks$/, async (ctx) => {
      try {
        const result = await this.modules.tasksModule.getDailyTasks(ctx.from.id, ctx);
        
        if (result.success) {
          const message = this.modules.interfaceModule.formatDailyTasks(
            result.tasks,
            result.completed,
            result.rewards
          );
          
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: this.modules.interfaceModule.getTasksMenu().reply_markup
          });
        } else {
          await ctx.reply(result.message);
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка ежедневных заданий:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Спонсорские задания
    this.bot.action(/^sponsor_tasks$/, async (ctx) => {
      try {
        const result = await this.modules.tasksModule.getSponsorTasks(ctx.from.id, ctx);
        
        if (result.success) {
          let message = `🎁 **Спонсорские задания**\n\n`;
          
          result.tasks.forEach((task, index) => {
            const status = task.completed ? '✅' : '⏳';
            message += `${index + 1}. ${status} ${task.name}\n`;
            message += `   📝 ${task.description}\n`;
            message += `   🎁 Награда: ${task.reward}⭐\n`;
            if (task.progress !== undefined) {
              message += `   📊 Прогресс: ${task.progress}/${task.target}\n`;
            }
            message += '\n';
          });
          
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: this.modules.interfaceModule.getTasksMenu().reply_markup
          });
        } else {
          await ctx.reply(result.message);
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка спонсорских заданий:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Все достижения
    this.bot.action(/^all_achievements$/, async (ctx) => {
      try {
        const result = await this.modules.tasksModule.getAchievements(ctx.from.id, ctx);
        
        if (result.success) {
          const message = this.modules.interfaceModule.formatAchievements(result.achievements);
          
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: this.modules.interfaceModule.getAchievementsMenu().reply_markup
          });
        } else {
          await ctx.reply(result.message);
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка достижений:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });
  }

  setupSupportHandlers() {
    // Создание тикета
    this.bot.action(/^create_ticket$/, async (ctx) => {
      try {
        const message = `📝 **Создание тикета поддержки**\n\n` +
                       `💡 Введите тему тикета:\n\n` +
                       `📝 Пример: Проблема с выводом средств`;
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: this.modules.interfaceModule.getSupportMenu().reply_markup
        });
        
        ctx.session = ctx.session || {};
        ctx.session.waitingFor = 'ticket_subject';
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка создания тикета:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Мои тикеты
    this.bot.action(/^my_tickets$/, async (ctx) => {
      try {
        const tickets = await this.modules.supportModule.getUserTickets(ctx.from.id, 5);
        
        if (tickets.length === 0) {
          await ctx.reply('📋 **Мои тикеты**\n\n❌ У вас нет тикетов');
        } else {
          let message = `📋 **Мои тикеты**\n\n`;
          
          tickets.forEach((ticket, index) => {
            const date = new Date(ticket.createdAt).toLocaleDateString('ru-RU');
            const status = ticket.status === 'open' ? '🟢' : 
                          ticket.status === 'answered' ? '🟡' : 
                          ticket.status === 'closed' ? '🔴' : '⚪';
            
            message += `${index + 1}. ${status} ${ticket.subject}\n`;
            message += `   📅 ${date} | 📊 ${ticket.status}\n\n`;
          });
          
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: this.modules.interfaceModule.getSupportMenu().reply_markup
          });
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка моих тикетов:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // FAQ
    this.bot.action(/^support_faq$/, async (ctx) => {
      try {
        const faq = await this.modules.supportModule.getFaq();
        
        let message = `❓ **Часто задаваемые вопросы**\n\n`;
        
        faq.forEach((item, index) => {
          message += `**${index + 1}. ${item.question}**\n`;
          message += `${item.answer}\n\n`;
        });
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: this.modules.interfaceModule.getSupportMenu().reply_markup
        });
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка FAQ:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });
  }

  setupAdminHandlers() {
    // Статистика админа
    this.bot.action(/^admin_stats$/, async (ctx) => {
      try {
        if (!this.modules.interfaceModule.isAdmin(ctx.from.id)) {
          await ctx.reply('❌ Доступ запрещен');
          await ctx.answerCbQuery();
          return;
        }
        
        const stats = await this.modules.adminModule.getAdminStats();
        
        if (stats) {
          const message = `📊 **Админ статистика**\n\n` +
                         `👥 **Пользователи**\n` +
                         `📈 Всего: ${stats.users.totalUsers}\n` +
                         `🆕 Сегодня: ${stats.today.newUsers}\n` +
                         `⛏️ Активных майнеров: ${stats.users.activeMiners}\n\n` +
                         `💰 **Выводы**\n` +
                         `⏳ В ожидании: ${stats.withdrawals.pendingCount}\n` +
                         `✅ Сегодня одобрено: ${stats.today.approvedWithdrawals}\n` +
                         `❌ Сегодня отклонено: ${stats.today.rejectedWithdrawals}\n\n` +
                         `📋 **Поддержка**\n` +
                         `🆕 Открытых тикетов: ${stats.support?.openTickets || 0}\n` +
                         `⏳ В ожидании: ${stats.support?.waitingTickets || 0}`;
          
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: this.modules.interfaceModule.getAdminMenu().reply_markup
          });
        } else {
          await ctx.reply('❌ Ошибка получения статистики');
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка админ статистики:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Рассылка
    this.bot.action(/^admin_broadcast$/, async (ctx) => {
      try {
        if (!this.modules.interfaceModule.isAdmin(ctx.from.id)) {
          await ctx.reply('❌ Доступ запрещен');
          await ctx.answerCbQuery();
          return;
        }
        
        const message = `📢 **Рассылка сообщений**\n\n` +
                       `💡 Введите сообщение для рассылки всем пользователям:\n\n` +
                       `📝 Поддерживается Markdown форматирование`;
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: this.modules.interfaceModule.getAdminMenu().reply_markup
        });
        
        ctx.session = ctx.session || {};
        ctx.session.waitingFor = 'broadcast_message';
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка рассылки:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Управление пользователями
    this.bot.action(/^admin_users$/, async (ctx) => {
      try {
        if (!this.modules.interfaceModule.isAdmin(ctx.from.id)) {
          await ctx.reply('❌ Доступ запрещен');
          await ctx.answerCbQuery();
          return;
        }
        
        const topUsers = await this.modules.adminModule.getTopUsers(10);
        
        let message = `👥 **Топ пользователей**\n\n`;
        
        topUsers.forEach((user, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
          message += `${medal} ${index + 1}. @${user.username || 'Unknown'}\n`;
          message += `   💰 Звезды: ${user.stars} | 🪙 Magnum: ${user.magnumCoins}\n`;
          message += `   👥 Рефералов: ${user.invited || 0}\n\n`;
        });
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: this.modules.interfaceModule.getAdminMenu().reply_markup
        });
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка управления пользователями:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Управление выводами
    this.bot.action(/^admin_withdrawals$/, async (ctx) => {
      try {
        if (!this.modules.interfaceModule.isAdmin(ctx.from.id)) {
          await ctx.reply('❌ Доступ запрещен');
          await ctx.answerCbQuery();
          return;
        }
        
        const pendingWithdrawals = await this.modules.withdrawalModule.getPendingWithdrawals(10);
        
        if (pendingWithdrawals.length === 0) {
          await ctx.reply('💰 **Заявки на вывод**\n\n✅ Нет заявок в ожидании');
        } else {
          let message = `💰 **Заявки на вывод**\n\n`;
          
          pendingWithdrawals.forEach((withdrawal, index) => {
            const date = new Date(withdrawal.createdAt).toLocaleDateString('ru-RU');
            message += `${index + 1}. 💳 ${withdrawal.amount}🪙\n`;
            message += `   👤 Пользователь: ${withdrawal.userId}\n`;
            message += `   📅 ${date} | 💳 ${withdrawal.method}\n\n`;
          });
          
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: this.modules.interfaceModule.getAdminMenu().reply_markup
          });
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка управления выводами:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });
  }

  setupNavigationHandlers() {
    // Обработка кнопки "Назад"
    this.bot.action(/^back_to_(.+)$/, async (ctx) => {
      try {
        const section = ctx.match[1];
        const user = await this.modules.userModule.getUser(ctx.from.id);
        
        let keyboard;
        let message = '';
        
        switch (section) {
          case 'main':
            await this.showMainMenu(ctx, user);
            break;
          case 'miner':
            const minerStats = await this.modules.minerModule.getMinerStats(ctx.from.id, ctx);
            message = this.modules.interfaceModule.formatMinerStats(minerStats);
            keyboard = this.modules.interfaceModule.getMinerMenu(user, minerStats);
            break;
          case 'exchange':
            const rates = await this.modules.exchangeModule.getExchangeRates();
            message = this.modules.interfaceModule.formatExchangeRates(rates);
            keyboard = this.modules.interfaceModule.getExchangeMenu();
            break;
          case 'withdrawal':
            message = `💳 **Вывод средств**\n\n` +
                     `💰 Доступно для вывода: ${user.magnumCoins}🪙\n` +
                     `📊 Минимальная сумма: 100🪙\n` +
                     `📈 Максимальная сумма: 10,000🪙\n\n` +
                     `💡 Выберите действие:`;
            keyboard = this.modules.interfaceModule.getWithdrawalMenu();
            break;
          default:
            await this.showMainMenu(ctx, user);
            break;
        }
        
        if (message && keyboard) {
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
          });
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка навигации:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Обработка кнопки "Отмена"
    this.bot.action(/^cancel$/, async (ctx) => {
      try {
        const user = await this.modules.userModule.getUser(ctx.from.id);
        
        // Очищаем сессию
        ctx.session = {};
        
        await this.showMainMenu(ctx, user);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка отмены:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });
  }

  async showMainMenu(ctx, user) {
    const welcomeMessage = `🎉 **Добро пожаловать в Magnum Stars!**\n\n` +
                          `💰 Ваш баланс:\n` +
                          `⭐ Звезды: ${user.stars}\n` +
                          `🪙 Magnum Coins: ${user.magnumCoins}\n\n` +
                          `Выберите действие:`;
    
    await ctx.reply(welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: this.modules.interfaceModule.getMainMenu(user).reply_markup
    });
  }
}

module.exports = Handlers;