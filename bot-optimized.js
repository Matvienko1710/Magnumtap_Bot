const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const database = require('./database');
const cache = require('./cache');
const utils = require('./utils');
const userService = require('./services/userService');

// Инициализация бота
const bot = new Telegraf(config.BOT_TOKEN);

// Middleware для логирования и rate limiting
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  
  // Rate limiting
  if (userId && !cache.checkRateLimit(userId)) {
    return ctx.reply('⚠️ Слишком много запросов. Подождите немного.');
  }
  
  // Логирование (только для админов или ошибок)
  if (utils.isAdmin(userId) || ctx.updateType === 'error') {
    console.log(`🔄 ${ctx.updateType} от ${userId} (${ctx.from?.first_name})`);
  }
  
  return next();
});

// Обработка команды /start
bot.start(async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  
  try {
    const userId = ctx.from.id;
    const user = await userService.getUser(userId, ctx);
    
    // Проверяем подписку
    if (config.REQUIRED_CHANNEL) {
      const isSubscribed = await checkSubscription(ctx);
      if (!isSubscribed) {
        return showSubscriptionMessage(ctx);
      }
    }
    
    // Обрабатываем реферальный параметр
    const startParam = ctx.startPayload;
    if (startParam && startParam !== userId.toString()) {
      await handleReferral(userId, startParam);
    }
    
    // Показываем главное меню
    await showMainMenu(ctx, user);
    
  } catch (error) {
    console.error('Ошибка в /start:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Главное меню
async function showMainMenu(ctx, user) {
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('⭐ Фарм', 'farm'),
      Markup.button.callback('💰 Обмен', 'exchange')
    ],
    [
      Markup.button.callback('🎁 Промокод', 'promocode'),
      Markup.button.callback('👤 Профиль', 'profile')
    ],
    [
      Markup.button.callback('🏆 Достижения', 'achievements'),
      Markup.button.callback('⛏️ Майнер', 'miner')
    ],
    [
      Markup.button.callback('💳 Вывод', 'withdrawal'),
      Markup.button.callback('📞 Поддержка', 'support')
    ]
  ]);
  
  const text = `🎮 **Добро пожаловать в Magnum Tap!**\n\n` +
               `💰 Баланс: ${utils.formatNumber(user.magnumCoins || 0)}🪙\n` +
               `⭐ Звезды: ${utils.formatNumber(user.stars || 0)}⭐\n` +
               `👥 Приглашено: ${user.invited || 0} человек\n\n` +
               `Выберите действие:`;
  
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

// Обработчик фарма
bot.action('farm', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const result = await userService.farmStars(userId, ctx);
    
    if (result.success) {
      await ctx.answerCbQuery(
        `✅ +${utils.formatNumber(result.reward)}⭐\n` +
        `💰 Баланс: ${utils.formatNumber(result.newBalance)}⭐`,
        { show_alert: true }
      );
      
      // Проверяем достижения
      await userService.checkAndAwardAchievements(userId);
      
      // Обновляем меню
      const user = await userService.getUser(userId);
      await updateMainMenu(ctx, user);
    } else {
      await ctx.answerCbQuery(result.error, { show_alert: true });
    }
  } catch (error) {
    console.error('Ошибка фарма:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик обмена
bot.action('exchange', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await userService.getUser(userId);
    const reserve = await database.getReserve();
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🪙 → ⭐ Купить звезды', 'buy_stars'),
        Markup.button.callback('⭐ → 🪙 Продать звезды', 'sell_stars')
      ],
      [
        Markup.button.callback('📊 Курсы валют', 'exchange_rates'),
        Markup.button.callback('🏦 Резерв биржи', 'reserve_info')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const text = `💱 **Обмен валют**\n\n` +
                 `💰 Ваши Magnum Coins: ${utils.formatNumber(user.magnumCoins || 0)}🪙\n` +
                 `⭐ Ваши звезды: ${utils.formatNumber(user.stars || 0)}⭐\n\n` +
                 `📊 Текущий курс: 1🪙 = ${utils.formatNumber(reserve.stars / reserve.magnumCoins)}⭐\n` +
                 `💰 Комиссия: ${config.EXCHANGE_COMMISSION}%\n\n` +
                 `Выберите операцию:`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Ошибка обмена:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Быстрая покупка звезд
bot.action(/^buy_stars_(\d+)$/, async (ctx) => {
  try {
    const amount = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    const user = await userService.getUser(userId);
    
    // Проверяем кулдаун
    const cooldown = utils.checkCooldown(user.lastExchange || 0, config.EXCHANGE_COOLDOWN);
    if (!cooldown.canAct) {
      return ctx.answerCbQuery(
        `⏳ Подождите ${utils.formatTime(cooldown.remaining)} между обменами`,
        { show_alert: true }
      );
    }
    
    // Проверяем баланс
    if ((user.magnumCoins || 0) < amount) {
      return ctx.answerCbQuery(
        `❌ Недостаточно Magnum Coins! У вас: ${utils.formatNumber(user.magnumCoins || 0)}🪙`,
        { show_alert: true }
      );
    }
    
    // Выполняем обмен
    const reserve = await database.getReserve();
    const rate = reserve.stars / reserve.magnumCoins;
    const starsToReceive = amount * rate * (1 - config.EXCHANGE_COMMISSION / 100);
    
    if (starsToReceive <= 0) {
      return ctx.answerCbQuery('❌ Ошибка расчета курса', { show_alert: true });
    }
    
    // Обновляем резерв и пользователя
    await database.updateReserve({
      magnumCoins: reserve.magnumCoins + amount,
      stars: reserve.stars - starsToReceive
    });
    
    await userService.incrementUserField(userId, 'magnumCoins', -amount);
    await userService.incrementUserField(userId, 'stars', starsToReceive);
    await userService.updateUser(userId, { lastExchange: utils.now() });
    
    await ctx.answerCbQuery(
      `✅ Обмен выполнен!\n` +
      `💰 Потрачено: ${amount}🪙\n` +
      `⭐ Получено: ${utils.formatNumber(starsToReceive)}⭐`,
      { show_alert: true }
    );
    
    // Обновляем интерфейс
    setTimeout(() => updateExchangeInterface(ctx, userId), 1000);
    
  } catch (error) {
    console.error('Ошибка покупки звезд:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик промокодов
bot.action('promocode', async (ctx) => {
  try {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🎁 Активировать промокод', 'activate_promo')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const text = `🎁 **Промокоды**\n\n` +
                 `Введите промокод для получения награды!\n\n` +
                 `💡 Промокоды можно найти в нашем канале или получить от друзей.`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Ошибка промокодов:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик профиля
bot.action('profile', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const profile = await userService.getProfile(userId, ctx);
    const { user, stats, rank, mainTitle } = profile;
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Статистика', 'statistics'),
        Markup.button.callback('🏆 Достижения', 'achievements')
      ],
      [
        Markup.button.callback('👥 Рефералы', 'referrals'),
        Markup.button.callback('⚙️ Настройки', 'settings')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const titleText = mainTitle ? `\n🏆 Титул: ${mainTitle.name}` : '';
    
    const text = `👤 **Профиль**\n\n` +
                 `👤 Имя: ${ctx.from.first_name}\n` +
                 `🆔 ID: ${userId}\n` +
                 `⭐ Ранг: ${rank.name}\n` +
                 `💰 Magnum Coins: ${utils.formatNumber(user.magnumCoins || 0)}🪙\n` +
                 `⭐ Звезды: ${utils.formatNumber(user.stars || 0)}⭐\n` +
                 `👥 Приглашено: ${user.invited || 0} человек\n` +
                 `🌾 Фармов: ${user.farmCount || 0}\n` +
                 `🎁 Промокодов: ${user.promoCount || 0}${titleText}\n\n` +
                 `📊 Всего пользователей: ${utils.formatNumber(stats.totalUsers)}`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Ошибка профиля:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик майнера
bot.action('miner', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await userService.getUser(userId);
    
    const keyboard = Markup.inlineKeyboard([
      [
        user.miner?.active ? 
          Markup.button.callback('⏹️ Остановить майнер', 'stop_miner') :
          Markup.button.callback('▶️ Запустить майнер', 'start_miner')
      ],
      [
        Markup.button.callback('📊 Статистика майнера', 'miner_stats'),
        Markup.button.callback('⚡ Улучшить майнер', 'upgrade_miner')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const status = user.miner?.active ? '🟢 Активен' : '🔴 Неактивен';
    const totalEarned = user.miner?.totalEarned || 0;
    const rewardPerHour = utils.calculateMinerReward();
    
    const text = `⛏️ **Майнер**\n\n` +
                 `📊 Статус: ${status}\n` +
                 `💰 Доход в час: ${utils.formatNumber(rewardPerHour)}⭐\n` +
                 `💎 Всего заработано: ${utils.formatNumber(totalEarned)}⭐\n\n` +
                 `💡 Майнер автоматически добывает звезды каждые 30 минут.`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Ошибка майнера:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Запуск майнера
bot.action('start_miner', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateUser(userId, {
      'miner.active': true,
      'miner.lastReward': utils.now()
    });
    
    await ctx.answerCbQuery('✅ Майнер запущен!', { show_alert: true });
    
    // Обновляем интерфейс
    const user = await userService.getUser(userId);
    await updateMinerInterface(ctx, user);
  } catch (error) {
    console.error('Ошибка запуска майнера:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Остановка майнера
bot.action('stop_miner', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateUser(userId, {
      'miner.active': false
    });
    
    await ctx.answerCbQuery('⏹️ Майнер остановлен', { show_alert: true });
    
    // Обновляем интерфейс
    const user = await userService.getUser(userId);
    await updateMinerInterface(ctx, user);
  } catch (error) {
    console.error('Ошибка остановки майнера:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик вывода
bot.action('withdrawal', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await userService.getUser(userId);
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('💳 Создать заявку', 'create_withdrawal'),
        Markup.button.callback('📋 Мои заявки', 'my_withdrawals')
      ],
      [
        Markup.button.callback('📊 Статистика выводов', 'withdrawal_stats'),
        Markup.button.callback('❓ Правила', 'withdrawal_rules')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const text = `💳 **Вывод средств**\n\n` +
                 `💰 Доступно для вывода: ${utils.formatNumber(user.magnumCoins || 0)}🪙\n` +
                 `⭐ Звезды: ${utils.formatNumber(user.stars || 0)}⭐\n\n` +
                 `💡 Минимальная сумма вывода: 100🪙\n` +
                 `⏱️ Время обработки: 1-24 часа\n\n` +
                 `Выберите действие:`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Ошибка вывода:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Обработчик поддержки
bot.action('support', async (ctx) => {
  try {
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📞 Создать тикет', 'create_ticket'),
        Markup.button.callback('📋 Мои тикеты', 'my_tickets')
      ],
      [
        Markup.button.callback('❓ FAQ', 'faq'),
        Markup.button.callback('📢 Канал поддержки', 'support_channel')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const text = `📞 **Поддержка**\n\n` +
                 `Если у вас возникли вопросы или проблемы, мы готовы помочь!\n\n` +
                 `💬 Создайте тикет для получения помощи\n` +
                 `📢 Присоединяйтесь к нашему каналу поддержки\n` +
                 `❓ Изучите часто задаваемые вопросы`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Ошибка поддержки:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Возврат в главное меню
bot.action('main_menu', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await userService.getUser(userId);
    await showMainMenu(ctx, user);
  } catch (error) {
    console.error('Ошибка главного меню:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
  }
});

// Вспомогательные функции
async function checkSubscription(ctx) {
  if (!config.REQUIRED_CHANNEL) return true;
  
  try {
    const channelId = config.REQUIRED_CHANNEL.startsWith('@') ? 
      config.REQUIRED_CHANNEL : `@${config.REQUIRED_CHANNEL}`;
    const member = await ctx.telegram.getChatMember(channelId, ctx.from.id);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error('Ошибка проверки подписки:', error);
    return false;
  }
}

async function showSubscriptionMessage(ctx) {
  const message = `🔔 **Обязательная подписка**\n\n` +
                  `Для использования бота необходимо:\n\n` +
                  `1️⃣ Подписаться на канал\n` +
                  `2️⃣ Запустить бота по ссылке\n\n` +
                  `После выполнения нажмите "✅ Проверить"`;
  
  const channelName = config.REQUIRED_CHANNEL.replace('@', '');
  const channelLink = `https://t.me/${channelName}`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('📢 Подписаться на канал', channelLink)],
    [Markup.button.url('🤖 Запустить бота', config.REQUIRED_BOT_LINK)],
    [Markup.button.callback('✅ Проверить', 'check_subscription')]
  ]);
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

async function handleReferral(userId, referrerId) {
  try {
    const referrer = await userService.getUser(referrerId);
    if (referrer) {
      await userService.incrementUserField(referrerId, 'invited', 1);
      await userService.incrementUserField(referrerId, 'stars', 50); // Бонус за приглашение
      
      // Обновляем пригласившего пользователя
      await userService.updateUser(userId, { invitedBy: referrerId });
    }
  } catch (error) {
    console.error('Ошибка обработки реферала:', error);
  }
}

async function updateMainMenu(ctx, user) {
  // Обновляем главное меню с новыми данными
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('⭐ Фарм', 'farm'),
      Markup.button.callback('💰 Обмен', 'exchange')
    ],
    [
      Markup.button.callback('🎁 Промокод', 'promocode'),
      Markup.button.callback('👤 Профиль', 'profile')
    ],
    [
      Markup.button.callback('🏆 Достижения', 'achievements'),
      Markup.button.callback('⛏️ Майнер', 'miner')
    ],
    [
      Markup.button.callback('💳 Вывод', 'withdrawal'),
      Markup.button.callback('📞 Поддержка', 'support')
    ]
  ]);
  
  const text = `🎮 **Magnum Tap**\n\n` +
               `💰 Баланс: ${utils.formatNumber(user.magnumCoins || 0)}🪙\n` +
               `⭐ Звезды: ${utils.formatNumber(user.stars || 0)}⭐\n` +
               `👥 Приглашено: ${user.invited || 0} человек\n\n` +
               `Выберите действие:`;
  
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

async function updateExchangeInterface(ctx, userId) {
  try {
    const user = await userService.getUser(userId);
    const reserve = await database.getReserve();
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🪙 → ⭐ Купить звезды', 'buy_stars'),
        Markup.button.callback('⭐ → 🪙 Продать звезды', 'sell_stars')
      ],
      [
        Markup.button.callback('📊 Курсы валют', 'exchange_rates'),
        Markup.button.callback('🏦 Резерв биржи', 'reserve_info')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const text = `💱 **Обмен валют**\n\n` +
                 `💰 Ваши Magnum Coins: ${utils.formatNumber(user.magnumCoins || 0)}🪙\n` +
                 `⭐ Ваши звезды: ${utils.formatNumber(user.stars || 0)}⭐\n\n` +
                 `📊 Текущий курс: 1🪙 = ${utils.formatNumber(reserve.stars / reserve.magnumCoins)}⭐\n` +
                 `💰 Комиссия: ${config.EXCHANGE_COMMISSION}%\n\n` +
                 `Выберите операцию:`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Ошибка обновления интерфейса обмена:', error);
  }
}

async function updateMinerInterface(ctx, user) {
  try {
    const keyboard = Markup.inlineKeyboard([
      [
        user.miner?.active ? 
          Markup.button.callback('⏹️ Остановить майнер', 'stop_miner') :
          Markup.button.callback('▶️ Запустить майнер', 'start_miner')
      ],
      [
        Markup.button.callback('📊 Статистика майнера', 'miner_stats'),
        Markup.button.callback('⚡ Улучшить майнер', 'upgrade_miner')
      ],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]);
    
    const status = user.miner?.active ? '🟢 Активен' : '🔴 Неактивен';
    const totalEarned = user.miner?.totalEarned || 0;
    const rewardPerHour = utils.calculateMinerReward();
    
    const text = `⛏️ **Майнер**\n\n` +
                 `📊 Статус: ${status}\n` +
                 `💰 Доход в час: ${utils.formatNumber(rewardPerHour)}⭐\n` +
                 `💎 Всего заработано: ${utils.formatNumber(totalEarned)}⭐\n\n` +
                 `💡 Майнер автоматически добывает звезды каждые 30 минут.`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    console.error('Ошибка обновления интерфейса майнера:', error);
  }
}

// Обработка майнеров каждые 30 минут
async function processMinerRewards() {
  try {
    console.log('⛏️ Обработка майнеров...');
    const now = utils.now();
    const oneHour = 3600;
    
    const usersWithMiners = await database.getActiveMiners();
    console.log(`🔍 Найдено ${usersWithMiners.length} активных майнеров`);
    
    for (const user of usersWithMiners) {
      const timeSinceLastReward = now - (user.miner.lastReward || 0);
      const hoursElapsed = Math.floor(timeSinceLastReward / oneHour);
      
      if (hoursElapsed > 0) {
        const rewardPerHour = utils.calculateMinerReward();
        const totalReward = hoursElapsed * rewardPerHour;
        
        console.log(`⛏️ Майнер ${user.id}: ${rewardPerHour}⭐/час, ${hoursElapsed}ч = ${totalReward}⭐`);
        
        await database.updateMinerReward(user.id, totalReward, now);
        cache.invalidateUser(user.id);
        
        // Отправляем уведомление
        try {
          const reserve = await database.getReserve();
          const currentRate = (reserve.stars / reserve.magnumCoins).toFixed(4);
          
          await bot.telegram.sendMessage(user.id, 
            `⛏️ **Майнер принес доход!**\n\n` +
            `💎 Получено: ${totalReward.toFixed(4)} ⭐ звезд\n` +
            `⏰ За период: ${hoursElapsed} час(ов)\n` +
            `📈 Доход в час: ${rewardPerHour.toFixed(4)} ⭐\n` +
            `📊 Всего заработано: ${((user.miner.totalEarned || 0) + totalReward).toFixed(4)} ⭐\n` +
            `💱 Текущий курс: 1🪙 = ${currentRate}⭐\n\n` +
            `Майнер продолжает работать автоматически!`,
            { parse_mode: 'Markdown' }
          );
        } catch (notifyError) {
          console.log(`⚠️ Не удалось уведомить пользователя ${user.id} о доходе майнера`);
        }
      }
    }
  } catch (error) {
    console.error('Ошибка обработки майнеров:', error);
  }
}

// Глобальная обработка ошибок
bot.catch(async (err, ctx) => {
  console.error('🚨 Глобальная ошибка бота:', err);
  console.error('📍 Контекст ошибки:', {
    updateType: ctx.updateType,
    userId: ctx.from?.id,
    chatId: ctx.chat?.id,
    messageText: ctx.message?.text,
    callbackData: ctx.callbackQuery?.data
  });
  
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⚠️ Временно недоступно. Повторите через пару секунд.', { show_alert: true });
    } else if (ctx.message) {
      await ctx.reply('⚠️ Временно недоступно. Повторите через пару секунд.', {
        reply_markup: {
          inline_keyboard: [[
            { text: '🏠 Главное меню', callback_data: 'main_menu' }
          ]]
        }
      });
    }
  } catch (notifyError) {
    console.error('❌ Не удалось уведомить пользователя об ошибке:', notifyError);
  }
});

// Обработка необработанных промисов
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Необработанный отказ промиса:', reason);
  console.error('📍 Promise:', promise);
});

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
  console.error('💥 Необработанное исключение:', error);
  console.error('📍 Stack trace:', error.stack);
  console.log('🔄 Пытаемся продолжить работу бота...');
});

// Запуск бота
async function startBot() {
  try {
    console.log('🔧 Проверяем переменные окружения...');
    console.log('🤖 BOT_TOKEN:', config.BOT_TOKEN ? 'установлен' : 'НЕ УСТАНОВЛЕН');
    console.log('🗄️ MONGODB_URI:', config.MONGODB_URI ? 'установлен' : 'НЕ УСТАНОВЛЕН');
    console.log('👑 ADMIN_IDS:', config.ADMIN_IDS.length ? config.ADMIN_IDS.join(', ') : 'НЕ УСТАНОВЛЕНЫ');
    
    if (!config.BOT_TOKEN) throw new Error('Не задан BOT_TOKEN!');
    if (!config.MONGODB_URI) throw new Error('Не задан MONGODB_URI!');
    
    // Подключаемся к базе данных
    await database.connect();
    
    // Запускаем обработку майнеров
    setInterval(processMinerRewards, config.MINER_PROCESS_INTERVAL);
    
    // Запускаем бота
    bot.launch();
    console.log('✅ Бот запущен успешно!');
    console.log('📱 Готов к обработке сообщений');
    
    // Обработка сигналов завершения
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
    
  } catch (error) {
    console.error('❌ Ошибка запуска бота:', error);
    process.exit(1);
  }
}

// Запускаем бота
startBot();