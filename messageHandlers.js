// Обработчики текстовых сообщений для Magnum Stars Bot

class MessageHandlers {
  constructor(bot, modules) {
    this.bot = bot;
    this.modules = modules;
    this.setupMessageHandlers();
  }

  setupMessageHandlers() {
    // Обработка текстовых сообщений
    this.bot.on('text', async (ctx) => {
      try {
        await this.handleTextMessage(ctx);
      } catch (error) {
        console.error('Ошибка обработки текстового сообщения:', error);
        await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
      }
    });
  }

  async handleTextMessage(ctx) {
    const text = ctx.message.text;
    const userId = ctx.from.id;
    
    // Проверяем, ожидаем ли мы ввод от пользователя
    if (ctx.session && ctx.session.waitingFor) {
      await this.handleUserInput(ctx, text);
      return;
    }

    // Обработка команд
    if (text.startsWith('/')) {
      await this.handleCommands(ctx, text);
      return;
    }

    // Обработка промокодов (если сообщение похоже на промокод)
    if (this.isPromocodeFormat(text)) {
      await this.handlePromocode(ctx, text);
      return;
    }

    // Обработка обычных сообщений
    await this.handleRegularMessage(ctx, text);
  }

  async handleUserInput(ctx, text) {
    const waitingFor = ctx.session.waitingFor;
    const userId = ctx.from.id;

    try {
      switch (waitingFor) {
        case 'magnum_to_stars_amount':
          await this.handleMagnumToStarsAmount(ctx, text);
          break;
        
        case 'stars_to_magnum_amount':
          await this.handleStarsToMagnumAmount(ctx, text);
          break;
        
        case 'withdrawal_amount':
          await this.handleWithdrawalAmount(ctx, text);
          break;
        
        case 'withdrawal_wallet':
          await this.handleWithdrawalWallet(ctx, text);
          break;
        
        case 'promocode':
          await this.handlePromocodeInput(ctx, text);
          break;
        
        case 'ticket_subject':
          await this.handleTicketSubject(ctx, text);
          break;
        
        case 'ticket_message':
          await this.handleTicketMessage(ctx, text);
          break;
        
        case 'broadcast_message':
          await this.handleBroadcastMessage(ctx, text);
          break;
        
        default:
          await ctx.reply('❌ Неизвестный тип ожидаемого ввода');
          break;
      }
    } catch (error) {
      console.error('Ошибка обработки пользовательского ввода:', error);
      await ctx.reply('❌ Произошла ошибка. Попробуйте еще раз.');
    }
  }

  async handleMagnumToStarsAmount(ctx, text) {
    const amount = parseFloat(text);
    const userId = ctx.from.id;

    if (isNaN(amount) || amount < 1) {
      await ctx.reply('❌ Неверная сумма. Введите число больше 0.');
      return;
    }

    const user = await this.modules.userModule.getUser(userId);
    
    if (user.magnumCoins < amount) {
      await ctx.reply('❌ Недостаточно Magnum Coins для обмена.');
      return;
    }

    const result = await this.modules.exchangeModule.exchangeMagnumToStars(userId, amount, ctx);
    
    if (result.success) {
      const message = `✅ **Обмен выполнен!**\n\n` +
                     `🪙 Отправлено: ${amount} Magnum Coins\n` +
                     `⭐ Получено: ${result.received} звезд\n` +
                     `💸 Комиссия: ${result.commission} Magnum Coins\n\n` +
                     `💰 Новый баланс:\n` +
                     `🪙 Magnum Coins: ${result.newMagnumBalance}\n` +
                     `⭐ Звезды: ${result.newStarsBalance}`;
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: this.modules.interfaceModule.getMainMenu(user).reply_markup
      });
    } else {
      await ctx.reply(result.message);
    }

    // Очищаем сессию
    ctx.session = {};
  }

  async handleStarsToMagnumAmount(ctx, text) {
    const amount = parseFloat(text);
    const userId = ctx.from.id;

    if (isNaN(amount) || amount < 1) {
      await ctx.reply('❌ Неверная сумма. Введите число больше 0.');
      return;
    }

    const user = await this.modules.userModule.getUser(userId);
    
    if (user.stars < amount) {
      await ctx.reply('❌ Недостаточно звезд для обмена.');
      return;
    }

    const result = await this.modules.exchangeModule.exchangeStarsToMagnum(userId, amount, ctx);
    
    if (result.success) {
      const message = `✅ **Обмен выполнен!**\n\n` +
                     `⭐ Отправлено: ${amount} звезд\n` +
                     `🪙 Получено: ${result.received} Magnum Coins\n` +
                     `💸 Комиссия: ${result.commission} звезд\n\n` +
                     `💰 Новый баланс:\n` +
                     `⭐ Звезды: ${result.newStarsBalance}\n` +
                     `🪙 Magnum Coins: ${result.newMagnumBalance}`;
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: this.modules.interfaceModule.getMainMenu(user).reply_markup
      });
    } else {
      await ctx.reply(result.message);
    }

    // Очищаем сессию
    ctx.session = {};
  }

  async handleWithdrawalAmount(ctx, text) {
    const amount = parseFloat(text);
    const userId = ctx.from.id;
    const method = ctx.session.withdrawalMethod;

    if (isNaN(amount) || amount < 100 || amount > 10000) {
      await ctx.reply('❌ Неверная сумма. Минимум: 100🪙, максимум: 10,000🪙');
      return;
    }

    const user = await this.modules.userModule.getUser(userId);
    
    if (user.magnumCoins < amount) {
      await ctx.reply('❌ Недостаточно Magnum Coins для вывода.');
      return;
    }

    // Сохраняем сумму и запрашиваем кошелек
    ctx.session.withdrawalAmount = amount;
    ctx.session.waitingFor = 'withdrawal_wallet';

    const methodNames = {
      'usdt_trc20': 'USDT (TRC20)',
      'btc': 'Bitcoin',
      'eth': 'Ethereum',
      'card': 'Банковская карта'
    };

    const message = `💳 **Ввод кошелька**\n\n` +
                   `💰 Сумма: ${amount}🪙\n` +
                   `💳 Метод: ${methodNames[method]}\n\n` +
                   `💡 Введите адрес кошелька:`;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: this.modules.interfaceModule.getWithdrawalMenu().reply_markup
    });
  }

  async handleWithdrawalWallet(ctx, text) {
    const wallet = text.trim();
    const userId = ctx.from.id;
    const method = ctx.session.withdrawalMethod;
    const amount = ctx.session.withdrawalAmount;

    // Валидация кошелька
    if (!this.modules.withdrawalModule.validateWallet(wallet, method)) {
      await ctx.reply('❌ Неверный формат кошелька. Проверьте правильность ввода.');
      return;
    }

    const result = await this.modules.withdrawalModule.createWithdrawal(
      userId, 
      amount, 
      method, 
      wallet, 
      ctx
    );

    if (result.success) {
      const message = `✅ **Заявка на вывод создана!**\n\n` +
                     `💰 Сумма: ${amount}🪙\n` +
                     `💳 Метод: ${this.modules.withdrawalModule.getMethodName(method)}\n` +
                     `📋 Кошелек: \`${wallet}\`\n\n` +
                     `📊 Статус: Ожидает рассмотрения\n` +
                     `⏱️ Время обработки: 1-24 часа`;
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: this.modules.interfaceModule.getWithdrawalMenu().reply_markup
      });
    } else {
      await ctx.reply(result.message);
    }

    // Очищаем сессию
    ctx.session = {};
  }

  async handlePromocodeInput(ctx, text) {
    const code = text.trim().toUpperCase();
    const userId = ctx.from.id;

    if (!this.modules.interfaceModule.validatePromocode(code)) {
      await ctx.reply('❌ Неверный формат промокода. Используйте только буквы и цифры.');
      return;
    }

    const result = await this.modules.userModule.activatePromocode(userId, code, ctx);
    
    if (result.success) {
      const message = `✅ **Промокод активирован!**\n\n` +
                     `🎫 Код: ${code}\n` +
                     `🎁 Награда: ${result.reward}\n` +
                     `💰 Новый баланс: ${result.newBalance}`;
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: this.modules.interfaceModule.getPromocodesMenu().reply_markup
      });
    } else {
      await ctx.reply(result.message);
    }

    // Очищаем сессию
    ctx.session = {};
  }

  async handleTicketSubject(ctx, text) {
    const subject = text.trim();
    const userId = ctx.from.id;

    if (subject.length < 5) {
      await ctx.reply('❌ Тема тикета слишком короткая. Минимум 5 символов.');
      return;
    }

    if (subject.length > 100) {
      await ctx.reply('❌ Тема тикета слишком длинная. Максимум 100 символов.');
      return;
    }

    // Сохраняем тему и запрашиваем сообщение
    ctx.session.ticketSubject = subject;
    ctx.session.waitingFor = 'ticket_message';

    const message = `📝 **Ввод сообщения**\n\n` +
                   `📋 Тема: ${subject}\n\n` +
                   `💡 Опишите вашу проблему подробно:`;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: this.modules.interfaceModule.getSupportMenu().reply_markup
    });
  }

  async handleTicketMessage(ctx, text) {
    const message = text.trim();
    const userId = ctx.from.id;
    const subject = ctx.session.ticketSubject;

    if (message.length < 10) {
      await ctx.reply('❌ Сообщение слишком короткое. Минимум 10 символов.');
      return;
    }

    if (message.length > 1000) {
      await ctx.reply('❌ Сообщение слишком длинное. Максимум 1000 символов.');
      return;
    }

    const result = await this.modules.supportModule.createTicket(userId, subject, message, ctx);
    
    if (result.success) {
      await ctx.reply(result.message, {
        parse_mode: 'Markdown',
        reply_markup: this.modules.interfaceModule.getSupportMenu().reply_markup
      });
    } else {
      await ctx.reply(result.message);
    }

    // Очищаем сессию
    ctx.session = {};
  }

  async handleBroadcastMessage(ctx, text) {
    const message = text.trim();
    const adminId = ctx.from.id;

    if (!this.modules.interfaceModule.isAdmin(adminId)) {
      await ctx.reply('❌ Доступ запрещен');
      return;
    }

    if (message.length < 5) {
      await ctx.reply('❌ Сообщение слишком короткое. Минимум 5 символов.');
      return;
    }

    const result = await this.modules.adminModule.broadcastMessage(message, adminId);
    
    if (result.success) {
      await ctx.reply(`✅ **Рассылка выполнена!**\n\n` +
                     `📢 Сообщение отправлено ${result.sentCount} пользователям\n` +
                     `❌ Ошибок: ${result.errorCount}`);
    } else {
      await ctx.reply(result.message);
    }

    // Очищаем сессию
    ctx.session = {};
  }

  async handleCommands(ctx, text) {
    const command = text.toLowerCase();
    const userId = ctx.from.id;

    switch (command) {
      case '/start':
        // Обрабатывается в основном файле
        break;
      
      case '/help':
        await this.showHelp(ctx);
        break;
      
      case '/balance':
        await this.showBalance(ctx);
        break;
      
      case '/profile':
        await this.showProfile(ctx);
        break;
      
      case '/stats':
        await this.showStats(ctx);
        break;
      
      case '/support':
        await this.showSupport(ctx);
        break;
      
      default:
        await ctx.reply('❌ Неизвестная команда. Используйте /help для списка команд.');
        break;
    }
  }

  async handlePromocode(ctx, text) {
    const code = text.trim().toUpperCase();
    const userId = ctx.from.id;

    if (!this.modules.interfaceModule.validatePromocode(code)) {
      return; // Не похоже на промокод, обрабатываем как обычное сообщение
    }

    const result = await this.modules.userModule.activatePromocode(userId, code, ctx);
    
    if (result.success) {
      const message = `✅ **Промокод активирован!**\n\n` +
                     `🎫 Код: ${code}\n` +
                     `🎁 Награда: ${result.reward}\n` +
                     `💰 Новый баланс: ${result.newBalance}`;
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: this.modules.interfaceModule.getMainMenu(
          await this.modules.userModule.getUser(userId)
        ).reply_markup
      });
    } else {
      await ctx.reply(result.message);
    }
  }

  async handleRegularMessage(ctx, text) {
    const userId = ctx.from.id;
    const user = await this.modules.userModule.getUser(userId);

    // Если сообщение похоже на число, предлагаем обмен
    if (!isNaN(parseFloat(text)) && parseFloat(text) > 0) {
      const amount = parseFloat(text);
      
      if (amount <= user.magnumCoins) {
        const message = `💡 **Обнаружена сумма: ${amount}**\n\n` +
                       `Хотите обменять ${amount}🪙 на звезды?\n\n` +
                       `💱 Курс: 1🪙 = ~1⭐ (с учетом комиссии)`;
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '✅ Обменять', callback_data: `quick_exchange_magnum_${amount}` },
              { text: '❌ Отмена', callback_data: 'cancel' }
            ]
          ]
        };
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        return;
      }
    }

    // Обычное сообщение - показываем главное меню
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

  async showHelp(ctx) {
    const helpMessage = `📖 **Справка по командам**\n\n` +
                       `🔹 /start - Запуск бота\n` +
                       `🔹 /help - Показать эту справку\n` +
                       `🔹 /balance - Показать баланс\n` +
                       `🔹 /profile - Показать профиль\n` +
                       `🔹 /stats - Показать статистику\n` +
                       `🔹 /support - Связаться с поддержкой\n\n` +
                       `💡 **Быстрые действия**\n` +
                       `• Введите число для быстрого обмена\n` +
                       `• Введите промокод для активации\n` +
                       `• Используйте кнопки меню для навигации`;
    
    await ctx.reply(helpMessage, {
      parse_mode: 'Markdown',
      reply_markup: this.modules.interfaceModule.getMainMenu(
        await this.modules.userModule.getUser(ctx.from.id)
      ).reply_markup
    });
  }

  async showBalance(ctx) {
    const userId = ctx.from.id;
    const user = await this.modules.userModule.getUser(userId);
    
    const balanceMessage = `💰 **Ваш баланс**\n\n` +
                          `⭐ Звезды: ${user.stars}\n` +
                          `🪙 Magnum Coins: ${user.magnumCoins}\n\n` +
                          `📊 **Статистика**\n` +
                          `🌾 Фармов: ${user.farmCount || 0}\n` +
                          `🎁 Бонусов: ${user.bonusCount || 0}\n` +
                          `👥 Рефералов: ${user.invited || 0}`;
    
    await ctx.reply(balanceMessage, {
      parse_mode: 'Markdown',
      reply_markup: this.modules.interfaceModule.getMainMenu(user).reply_markup
    });
  }

  async showProfile(ctx) {
    const userId = ctx.from.id;
    const result = await this.modules.userModule.getProfile(userId, ctx);
    
    if (result) {
      const message = this.modules.interfaceModule.formatProfile(
        result.user,
        result.rank,
        result.mainTitle,
        result.botStats
      );
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: this.modules.interfaceModule.getMainMenu(result.user).reply_markup
      });
    } else {
      await ctx.reply('❌ Ошибка получения профиля');
    }
  }

  async showStats(ctx) {
    const userId = ctx.from.id;
    const user = await this.modules.userModule.getUser(userId);
    
    const statsMessage = `📊 **Ваша статистика**\n\n` +
                        `🌾 **Фарм**\n` +
                        `📈 Всего фармов: ${user.farmCount || 0}\n` +
                        `💰 Заработано фармом: ${user.totalEarnedStars || 0}⭐\n\n` +
                        `🎁 **Бонусы**\n` +
                        `📅 Получено бонусов: ${user.bonusCount || 0}\n` +
                        `🔥 Серия дней: ${user.dailyStreak || 0}\n\n` +
                        `👥 **Рефералы**\n` +
                        `👤 Приглашено: ${user.invited || 0}\n` +
                        `💰 Заработано: ${(user.invited || 0) * 50}⭐\n\n` +
                        `🎫 **Промокоды**\n` +
                        `📝 Активировано: ${user.promoCount || 0}`;
    
    await ctx.reply(statsMessage, {
      parse_mode: 'Markdown',
      reply_markup: this.modules.interfaceModule.getMainMenu(user).reply_markup
    });
  }

  async showSupport(ctx) {
    const supportMessage = `❓ **Поддержка**\n\n` +
                          `📞 Нужна помощь? Мы готовы помочь!\n\n` +
                          `📝 **Создать тикет** - для решения проблем\n` +
                          `❓ **FAQ** - часто задаваемые вопросы\n` +
                          `📞 **Связаться** - прямая связь с поддержкой\n\n` +
                          `⏱️ Время ответа: 1-24 часа`;
    
    await ctx.reply(supportMessage, {
      parse_mode: 'Markdown',
      reply_markup: this.modules.interfaceModule.getSupportMenu().reply_markup
    });
  }

  isPromocodeFormat(text) {
    // Проверяем, похоже ли сообщение на промокод
    const code = text.trim().toUpperCase();
    return /^[A-Z0-9]{4,12}$/.test(code);
  }
}

module.exports = MessageHandlers;