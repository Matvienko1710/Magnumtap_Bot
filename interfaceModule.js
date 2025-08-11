const { Markup } = require('telegraf');

class InterfaceModule {
  constructor(database, cache) {
    this.db = database;
    this.cache = cache;
  }

  // Главное меню
  getMainMenu(user) {
    const keyboard = [
      [
        Markup.button.callback('🌾 Фарм', 'farm'),
        Markup.button.callback('🎁 Бонус', 'bonus')
      ],
      [
        Markup.button.callback('⛏️ Майнер', 'miner'),
        Markup.button.callback('💱 Обмен', 'exchange')
      ],
      [
        Markup.button.callback('💳 Вывод', 'withdrawal'),
        Markup.button.callback('🎫 Промокоды', 'promocodes')
      ],
      [
        Markup.button.callback('👥 Рефералы', 'referrals'),
        Markup.button.callback('🏆 Достижения', 'achievements')
      ],
      [
        Markup.button.callback('📋 Задания', 'tasks'),
        Markup.button.callback('📊 Профиль', 'profile')
      ],
      [
        Markup.button.callback('❓ Поддержка', 'support'),
        Markup.button.callback('⚙️ Настройки', 'settings')
      ]
    ];

    if (this.isAdmin(user.id)) {
      keyboard.push([Markup.button.callback('🔧 Админ панель', 'admin')]);
    }

    return Markup.inlineKeyboard(keyboard);
  }

  // Меню майнера
  getMinerMenu(user, minerStats) {
    const keyboard = [
      [
        minerStats.isActive 
          ? Markup.button.callback('⏹️ Остановить майнер', 'stop_miner')
          : Markup.button.callback('▶️ Запустить майнер', 'start_miner')
      ],
      [
        Markup.button.callback('📈 Статистика', 'miner_stats'),
        Markup.button.callback('⚡ Улучшить', 'upgrade_miner')
      ],
      [
        Markup.button.callback('📊 Лидерборд', 'miner_leaderboard'),
        Markup.button.callback('📜 История', 'miner_history')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ];

    return Markup.inlineKeyboard(keyboard);
  }

  // Меню обмена
  getExchangeMenu() {
    const keyboard = [
      [
        Markup.button.callback('🪙 → ⭐ Обменять Magnum на звезды', 'exchange_magnum_to_stars'),
        Markup.button.callback('⭐ → 🪙 Обменять звезды на Magnum', 'exchange_stars_to_magnum')
      ],
      [
        Markup.button.callback('📊 Курсы валют', 'exchange_rates'),
        Markup.button.callback('📈 Статистика', 'exchange_stats')
      ],
      [
        Markup.button.callback('📜 История обменов', 'exchange_history'),
        Markup.button.callback('🏆 Топ обменников', 'exchange_leaderboard')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ];

    return Markup.inlineKeyboard(keyboard);
  }

  // Меню вывода
  getWithdrawalMenu() {
    const keyboard = [
      [
        Markup.button.callback('💳 Создать заявку', 'create_withdrawal'),
        Markup.button.callback('📜 История выводов', 'withdrawal_history')
      ],
      [
        Markup.button.callback('📊 Статистика', 'withdrawal_stats'),
        Markup.button.callback('❓ FAQ', 'withdrawal_faq')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ];

    return Markup.inlineKeyboard(keyboard);
  }

  // Меню промокодов
  getPromocodesMenu() {
    const keyboard = [
      [
        Markup.button.callback('🎫 Активировать промокод', 'activate_promo'),
        Markup.button.callback('📜 История промокодов', 'promo_history')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ];

    return Markup.inlineKeyboard(keyboard);
  }

  // Меню рефералов
  getReferralsMenu(user) {
    const keyboard = [
      [
        Markup.button.callback('🔗 Моя ссылка', 'my_referral_link'),
        Markup.button.callback('👥 Мои рефералы', 'my_referrals')
      ],
      [
        Markup.button.callback('📊 Статистика', 'referral_stats'),
        Markup.button.callback('🏆 Топ рефералов', 'referral_leaderboard')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ];

    return Markup.inlineKeyboard(keyboard);
  }

  // Меню достижений
  getAchievementsMenu() {
    const keyboard = [
      [
        Markup.button.callback('🏆 Все достижения', 'all_achievements'),
        Markup.button.callback('🎯 Мои достижения', 'my_achievements')
      ],
      [
        Markup.button.callback('📊 Прогресс', 'achievements_progress'),
        Markup.button.callback('🏅 Ранги', 'achievements_ranks')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ];

    return Markup.inlineKeyboard(keyboard);
  }

  // Меню заданий
  getTasksMenu() {
    const keyboard = [
      [
        Markup.button.callback('📅 Ежедневные задания', 'daily_tasks'),
        Markup.button.callback('🎁 Спонсорские задания', 'sponsor_tasks')
      ],
      [
        Markup.button.callback('📊 Прогресс', 'tasks_progress'),
        Markup.button.callback('🏆 Награды', 'tasks_rewards')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ];

    return Markup.inlineKeyboard(keyboard);
  }

  // Меню поддержки
  getSupportMenu() {
    const keyboard = [
      [
        Markup.button.callback('📝 Создать тикет', 'create_ticket'),
        Markup.button.callback('📋 Мои тикеты', 'my_tickets')
      ],
      [
        Markup.button.callback('❓ FAQ', 'support_faq'),
        Markup.button.callback('📞 Связаться', 'contact_support')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ];

    return Markup.inlineKeyboard(keyboard);
  }

  // Меню настроек
  getSettingsMenu() {
    const keyboard = [
      [
        Markup.button.callback('🔔 Уведомления', 'notifications_settings'),
        Markup.button.callback('🌍 Язык', 'language_settings')
      ],
      [
        Markup.button.callback('🔒 Приватность', 'privacy_settings'),
        Markup.button.callback('📱 Интерфейс', 'interface_settings')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ];

    return Markup.inlineKeyboard(keyboard);
  }

  // Админ меню
  getAdminMenu() {
    const keyboard = [
      [
        Markup.button.callback('📊 Статистика', 'admin_stats'),
        Markup.button.callback('📢 Рассылка', 'admin_broadcast')
      ],
      [
        Markup.button.callback('👥 Пользователи', 'admin_users'),
        Markup.button.callback('💰 Выводы', 'admin_withdrawals')
      ],
      [
        Markup.button.callback('🎫 Промокоды', 'admin_promocodes'),
        Markup.button.callback('📋 Поддержка', 'admin_support')
      ],
      [
        Markup.button.callback('📈 Аналитика', 'admin_analytics'),
        Markup.button.callback('⚙️ Настройки', 'admin_settings')
      ],
      [Markup.button.callback('🔙 Назад', 'main_menu')]
    ];

    return Markup.inlineKeyboard(keyboard);
  }

  // Меню методов вывода
  getWithdrawalMethodsMenu() {
    const keyboard = [
      [
        Markup.button.callback('💎 USDT (TRC20)', 'withdraw_usdt_trc20'),
        Markup.button.callback('₿ Bitcoin', 'withdraw_btc')
      ],
      [
        Markup.button.callback('Ξ Ethereum', 'withdraw_eth'),
        Markup.button.callback('💳 Банковская карта', 'withdraw_card')
      ],
      [Markup.button.callback('🔙 Назад', 'withdrawal')]
    ];

    return Markup.inlineKeyboard(keyboard);
  }

  // Меню подтверждения
  getConfirmationMenu(action, data = '') {
    const keyboard = [
      [
        Markup.button.callback('✅ Подтвердить', `confirm_${action}_${data}`),
        Markup.button.callback('❌ Отмена', 'cancel')
      ]
    ];

    return Markup.inlineKeyboard(keyboard);
  }

  // Меню пагинации
  getPaginationMenu(currentPage, totalPages, action, data = '') {
    const keyboard = [];
    
    if (totalPages > 1) {
      const row = [];
      
      if (currentPage > 1) {
        row.push(Markup.button.callback('⬅️', `${action}_page_${currentPage - 1}_${data}`));
      }
      
      row.push(Markup.button.callback(`${currentPage}/${totalPages}`, 'current_page'));
      
      if (currentPage < totalPages) {
        row.push(Markup.button.callback('➡️', `${action}_page_${currentPage + 1}_${data}`));
      }
      
      keyboard.push(row);
    }
    
    keyboard.push([Markup.button.callback('🔙 Назад', 'main_menu')]);
    
    return Markup.inlineKeyboard(keyboard);
  }

  // Форматирование профиля
  formatProfile(user, rank, mainTitle, botStats) {
    const profile = `👤 **Профиль пользователя**\n\n`;
    
    // Основная информация
    profile += `🆔 ID: \`${user.id}\`\n`;
    profile += `👤 Имя: ${user.first_name || 'Не указано'}\n`;
    if (user.username) {
      profile += `🔗 Username: @${user.username}\n`;
    }
    
    // Ранг и титул
    profile += `🏆 Ранг: ${rank.color} ${rank.name} (Уровень ${rank.level})\n`;
    if (mainTitle) {
      profile += `👑 Титул: ${mainTitle.name}\n`;
    }
    
    // Балансы
    profile += `\n💰 **Балансы**\n`;
    profile += `⭐ Звезды: ${this.formatNumber(user.stars)}\n`;
    profile += `🪙 Magnum Coins: ${this.formatNumber(user.magnumCoins)}\n`;
    
    // Статистика
    profile += `\n📊 **Статистика**\n`;
    profile += `🌾 Фармов: ${this.formatNumber(user.farmCount)}\n`;
    profile += `🎁 Бонусов: ${this.formatNumber(user.bonusCount)}\n`;
    profile += `🎫 Промокодов: ${this.formatNumber(user.promoCount)}\n`;
    profile += `👥 Приглашено: ${this.formatNumber(user.invited)}\n`;
    profile += `📅 Серия бонусов: ${user.dailyStreak || 0} дней\n`;
    
    // Майнер
    if (user.miner) {
      profile += `⛏️ Майнер: ${user.miner.active ? '🟢 Активен' : '🔴 Неактивен'}\n`;
      if (user.miner.level) {
        profile += `📈 Уровень майнера: ${user.miner.level}\n`;
      }
      profile += `💎 Заработано майнером: ${this.formatNumber(user.miner.totalEarned || 0)}⭐\n`;
    }
    
    // Достижения
    if (user.achievements && user.achievements.length > 0) {
      profile += `🏆 Достижений: ${user.achievements.length}\n`;
    }
    
    // Дата регистрации
    const registrationDate = new Date(user.created * 1000);
    profile += `📅 Дата регистрации: ${registrationDate.toLocaleDateString('ru-RU')}\n`;
    
    // Статистика бота
    if (botStats) {
      profile += `\n🌐 **Статистика бота**\n`;
      profile += `👥 Всего пользователей: ${this.formatNumber(botStats.totalUsers)}\n`;
      profile += `⛏️ Активных майнеров: ${this.formatNumber(botStats.activeMiners)}\n`;
      profile += `🌾 Всего фармов: ${this.formatNumber(botStats.totalFarms)}\n`;
      profile += `🎁 Всего бонусов: ${this.formatNumber(botStats.totalBonuses)}\n`;
    }
    
    return profile;
  }

  // Форматирование статистики майнера
  formatMinerStats(minerStats) {
    let stats = `⛏️ **Статистика майнера**\n\n`;
    
    stats += `📊 Статус: ${minerStats.status}\n`;
    stats += `💎 Всего заработано: ${this.formatNumber(minerStats.totalEarned)}⭐\n`;
    stats += `📈 Доход в час: ${minerStats.rewardPerHour.toFixed(4)}⭐\n`;
    
    if (minerStats.isActive) {
      stats += `⏰ Часов с последней награды: ${minerStats.hoursSinceLastReward}\n`;
      stats += `💰 Ожидающая награда: ${minerStats.pendingReward.toFixed(4)}⭐\n`;
    }
    
    return stats;
  }

  // Форматирование курсов обмена
  formatExchangeRates(rates) {
    let ratesText = `💱 **Курсы обмена**\n\n`;
    
    ratesText += `🪙 → ⭐ 1 Magnum Coin = ${rates.magnumToStars.toFixed(4)} звезд\n`;
    ratesText += `⭐ → 🪙 1 звезда = ${rates.starsToMagnum.toFixed(4)} Magnum Coins\n\n`;
    
    ratesText += `📊 **Резерв биржи**\n`;
    ratesText += `🪙 Magnum Coins: ${this.formatNumber(rates.reserve.magnumCoins)}\n`;
    ratesText += `⭐ Звезды: ${this.formatNumber(rates.reserve.stars)}\n`;
    ratesText += `📈 Всего обменов: ${this.formatNumber(rates.reserve.totalExchanges)}\n`;
    ratesText += `💰 Общий объем: ${this.formatNumber(rates.reserve.totalVolume)}\n\n`;
    
    ratesText += `💡 Комиссия за обмен: 2.5%`;
    
    return ratesText;
  }

  // Форматирование истории выводов
  formatWithdrawalHistory(history) {
    if (history.length === 0) {
      return `📜 **История выводов**\n\n❌ История пуста`;
    }
    
    let historyText = `📜 **История выводов**\n\n`;
    
    history.forEach((withdrawal, index) => {
      const date = new Date(withdrawal.createdAt).toLocaleDateString('ru-RU');
      const status = this.getWithdrawalStatusEmoji(withdrawal.status);
      
      historyText += `${index + 1}. ${status} ${withdrawal.amount}🪙\n`;
      historyText += `   💳 ${this.getMethodName(withdrawal.method)}\n`;
      historyText += `   📅 ${date}\n`;
      historyText += `   📊 ${withdrawal.status}\n\n`;
    });
    
    return historyText;
  }

  // Форматирование достижений
  formatAchievements(achievements) {
    if (achievements.length === 0) {
      return `🏆 **Достижения**\n\n❌ Достижения не найдены`;
    }
    
    let achievementsText = `🏆 **Достижения**\n\n`;
    
    achievements.forEach((achievement, index) => {
      const status = achievement.completed ? '✅' : '⏳';
      const progress = achievement.completed ? 
        `${achievement.target}/${achievement.target}` : 
        `${achievement.userProgress}/${achievement.target}`;
      
      achievementsText += `${index + 1}. ${status} ${achievement.icon} ${achievement.name}\n`;
      achievementsText += `   📝 ${achievement.description}\n`;
      achievementsText += `   📊 Прогресс: ${progress}\n`;
      achievementsText += `   🎁 Награда: ${achievement.reward}⭐\n\n`;
    });
    
    return achievementsText;
  }

  // Форматирование ежедневных заданий
  formatDailyTasks(tasks, completed, rewards) {
    let tasksText = `📅 **Ежедневные задания**\n\n`;
    
    tasks.forEach((task, index) => {
      const status = task.completed ? '✅' : '⏳';
      const progress = task.completed ? 
        `${task.target}/${task.target}` : 
        `${task.progress}/${task.target}`;
      
      tasksText += `${index + 1}. ${status} ${task.name}\n`;
      tasksText += `   📝 ${task.description}\n`;
      tasksText += `   📊 Прогресс: ${progress}\n`;
      tasksText += `   🎁 Награда: ${task.reward}⭐\n\n`;
    });
    
    tasksText += `📊 **Общий прогресс**\n`;
    tasksText += `✅ Выполнено: ${completed}/${tasks.length}\n`;
    tasksText += `🎁 Общая награда: ${rewards}⭐`;
    
    return tasksText;
  }

  // Вспомогательные методы
  formatNumber(num) {
    if (num === null || num === undefined) return '0';
    
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(2) + 'B';
    } else if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(2) + 'K';
    } else {
      return num.toFixed(2);
    }
  }

  isAdmin(userId) {
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [];
    return adminIds.includes(parseInt(userId));
  }

  getWithdrawalStatusEmoji(status) {
    switch (status) {
      case 'pending': return '⏳';
      case 'approved': return '✅';
      case 'rejected': return '❌';
      default: return '❓';
    }
  }

  getMethodName(method) {
    const methods = {
      'USDT_TRC20': 'USDT (TRC20)',
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
      'CARD': 'Банковская карта'
    };
    return methods[method] || method;
  }
}

module.exports = InterfaceModule;