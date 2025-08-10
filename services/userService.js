const database = require('../database');
const cache = require('../cache');
const utils = require('../utils');
const config = require('../config');

class UserService {
  // Получить пользователя с кешированием
  async getUser(userId, ctx = null) {
    try {
      // Проверяем кеш
      const cached = cache.getUser(userId);
      if (cached) {
        return cached;
      }

      // Получаем из БД
      let user = await database.getUserById(userId);
      
      if (!user) {
        // Создаем нового пользователя
        user = {
          id: userId,
          username: ctx?.from?.username || null,
          stars: config.INITIAL_STARS,
          magnumCoins: config.INITIAL_MAGNUM_COINS,
          lastFarm: 0,
          lastBonus: 0,
          created: utils.now(),
          invited: 0,
          invitedBy: null,
          titles: [],
          farmCount: 0,
          bonusCount: 0,
          promoCount: 0,
          taskCount: 0,
          dailyStreak: 0,
          usedPromos: [],
          miner: {
            active: false,
            totalEarned: 0,
            lastReward: 0
          }
        };
        
        await database.createUser(user);
        console.log(`👤 Создан новый пользователь: ${userId}`);
      }

      // Сохраняем в кеш
      cache.setUser(userId, user);
      return user;
    } catch (error) {
      console.error('Ошибка получения пользователя:', error);
      throw error;
    }
  }

  // Получить пользователя без кеширования
  async getUserFresh(userId) {
    try {
      return await database.getUserById(userId);
    } catch (error) {
      console.error('Ошибка получения пользователя (fresh):', error);
      throw error;
    }
  }

  // Обновить пользователя
  async updateUser(userId, updates) {
    try {
      await database.updateUser(userId, updates);
      cache.invalidateUser(userId);
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
      throw error;
    }
  }

  // Инкремент поля пользователя
  async incrementUserField(userId, field, amount) {
    try {
      await database.incrementUserField(userId, field, amount);
      cache.invalidateUser(userId);
    } catch (error) {
      console.error('Ошибка инкремента поля:', error);
      throw error;
    }
  }

  // Фарм звезд
  async farmStars(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      const now = utils.now();
      
      // Проверяем кулдаун
      const cooldown = config.FARM_COOLDOWN_DEFAULT;
      if (!utils.checkCooldown(user.lastFarm, cooldown)) {
        const timeLeft = cooldown - (now - user.lastFarm);
        return {
          success: false,
          error: `⏰ Подождите ${Math.ceil(timeLeft / 1000)} секунд до следующего фарма`
        };
      }

      // Рассчитываем награду
      const baseReward = 0.01;
      const reward = utils.calculateFarmReward(user, baseReward);
      
      // Обновляем пользователя
      await this.updateUser(userId, {
        stars: user.stars + reward,
        lastFarm: now,
        farmCount: (user.farmCount || 0) + 1
      });

      // Проверяем достижения
      await this.checkAndAwardAchievements(userId);

      return {
        success: true,
        reward: reward,
        newBalance: user.stars + reward
      };
    } catch (error) {
      console.error('Ошибка фарма:', error);
      return {
        success: false,
        error: '❌ Произошла ошибка при фарме'
      };
    }
  }

  // Ежедневный бонус
  async claimDailyBonus(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      const now = utils.now();
      const today = Math.floor(now / (24 * 60 * 60 * 1000));
      
      // Проверяем, получал ли уже бонус сегодня
      if (user.lastBonus === today) {
        const nextBonus = (today + 1) * 24 * 60 * 60 * 1000;
        const timeLeft = nextBonus - now;
        const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
        
        return {
          success: false,
          error: `⏰ Ежедневный бонус уже получен. Следующий через ${hoursLeft} часов`
        };
      }

      // Рассчитываем награду и серию
      const baseReward = 3;
      const streak = user.lastBonus === today - 1 ? (user.dailyStreak || 0) + 1 : 1;
      const reward = baseReward + Math.floor(streak / 7) * 2; // Бонус за недельную серию
      
      // Обновляем пользователя
      await this.updateUser(userId, {
        stars: user.stars + reward,
        lastBonus: today,
        dailyStreak: streak,
        bonusCount: (user.bonusCount || 0) + 1
      });

      // Проверяем достижения
      await this.checkAndAwardAchievements(userId);

      return {
        success: true,
        reward: reward,
        newBalance: user.stars + reward,
        streak: streak
      };
    } catch (error) {
      console.error('Ошибка ежедневного бонуса:', error);
      return {
        success: false,
        error: '❌ Произошла ошибка при получении бонуса'
      };
    }
  }

  // Активировать промокод
  async activatePromocode(userId, code, ctx) {
    try {
      const user = await this.getUser(userId);
      
      // Проверяем, использовал ли уже этот промокод
      if (user.usedPromos && user.usedPromos.includes(code)) {
        return {
          success: false,
          error: '❌ Этот промокод уже использован'
        };
      }

      // Получаем промокод из БД
      const promocode = await database.getPromocode(code);
      if (!promocode) {
        return {
          success: false,
          error: '❌ Промокод не найден'
        };
      }

      // Проверяем лимит использования
      if (promocode.used >= promocode.max) {
        return {
          success: false,
          error: '❌ Промокод больше не действителен'
        };
      }

      // Активируем промокод
      await database.activatePromocode(code);
      
      // Начисляем награду пользователю
      await this.updateUser(userId, {
        stars: user.stars + promocode.stars,
        promoCount: (user.promoCount || 0) + 1,
        usedPromos: [...(user.usedPromos || []), code]
      });

      // Проверяем достижения
      await this.checkAndAwardAchievements(userId);

      return {
        success: true,
        reward: promocode.stars,
        newBalance: user.stars + promocode.stars
      };
    } catch (error) {
      console.error('Ошибка активации промокода:', error);
      return {
        success: false,
        error: '❌ Произошла ошибка при активации промокода'
      };
    }
  }

  // Получить профиль пользователя
  async getProfile(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      const stats = await database.getBotStatistics();
      
      // Определяем ранг пользователя
      const rank = this.calculateRank(user.stars);
      
      // Определяем главный титул
      const mainTitle = user.titles && user.titles.length > 0 ? 
        user.titles[user.titles.length - 1] : null;

      return {
        user,
        stats,
        rank,
        mainTitle
      };
    } catch (error) {
      console.error('Ошибка получения профиля:', error);
      throw error;
    }
  }

  // Получить ежедневные задания
  async getDailyTasks(userId) {
    try {
      const user = await this.getUser(userId);
      const today = new Date().toISOString().split('T')[0];
      
      // Получаем задания пользователя
      let userTasks = await database.getUserTasks(userId, today);
      
      if (!userTasks) {
        // Создаем новые задания
        userTasks = {
          userId: userId,
          date: today,
          type: 'daily',
          completed: {
            farm: false,
            bonus: false,
            referral: false,
            promo: false
          },
          claimed: {
            farm: false,
            bonus: false,
            referral: false,
            promo: false
          }
        };
        await database.createUserTasks(userTasks);
      }

      // Формируем список заданий
      const tasks = [
        {
          id: 'farm',
          title: 'Фарм 10 раз',
          description: 'Выполните фарм звезд 10 раз',
          reward: '5⭐',
          completed: userTasks.completed.farm,
          claimed: userTasks.claimed.farm
        },
        {
          id: 'bonus',
          title: 'Получить ежедневный бонус',
          description: 'Получите ежедневный бонус',
          reward: '3⭐',
          completed: userTasks.completed.bonus,
          claimed: userTasks.claimed.bonus
        },
        {
          id: 'referral',
          title: 'Пригласить друга',
          description: 'Пригласите одного друга по реферальной ссылке',
          reward: '10⭐',
          completed: userTasks.completed.referral,
          claimed: userTasks.claimed.referral
        },
        {
          id: 'promo',
          title: 'Активировать промокод',
          description: 'Активируйте любой промокод',
          reward: '2⭐',
          completed: userTasks.completed.promo,
          claimed: userTasks.claimed.promo
        }
      ];

      return tasks;
    } catch (error) {
      console.error('Ошибка получения заданий:', error);
      return [];
    }
  }

  // Проверить и выдать достижения
  async checkAndAwardAchievements(userId) {
    try {
      const user = await this.getUser(userId);
      const newTitles = [];

      // Проверяем достижения по звездам
      if (user.stars >= 100 && !user.titles.includes('collector')) {
        newTitles.push({
          id: 'collector',
          name: '💎 Коллекционер',
          description: 'Собрал 100 звезд',
          earned: utils.now()
        });
      }

      if (user.stars >= 500 && !user.titles.includes('starlord')) {
        newTitles.push({
          id: 'starlord',
          name: '🌟 Звёздный лорд',
          description: 'Собрал 500 звезд',
          earned: utils.now()
        });
      }

      if (user.stars >= 1000 && !user.titles.includes('legend')) {
        newTitles.push({
          id: 'legend',
          name: '👑 Легенда',
          description: 'Собрал 1000 звезд',
          earned: utils.now()
        });
      }

      // Проверяем достижения по фарму
      if (user.farmCount >= 50 && !user.titles.includes('farmer')) {
        newTitles.push({
          id: 'farmer',
          name: '⚡ Фармер',
          description: 'Выполнил 50 действий фарминга',
          earned: utils.now()
        });
      }

      // Проверяем достижения по рефералам
      if (user.invited >= 5 && !user.titles.includes('ambassador')) {
        newTitles.push({
          id: 'ambassador',
          name: '🤝 Амбассадор',
          description: 'Пригласил 5 друзей',
          earned: utils.now()
        });
      }

      if (user.invited >= 20 && !user.titles.includes('legend')) {
        // Обновляем титул Легенды
        const legendTitle = newTitles.find(t => t.id === 'legend');
        if (legendTitle) {
          legendTitle.description = 'Собрал 1000 звезд и пригласил 20 друзей';
        }
      }

      // Проверяем достижения по промокодам
      if (user.promoCount >= 10 && !user.titles.includes('promomaster')) {
        newTitles.push({
          id: 'promomaster',
          name: '🎫 Мастер промокодов',
          description: 'Активировал 10 промокодов',
          earned: utils.now()
        });
      }

      // Проверяем достижения по ежедневным бонусам
      if (user.bonusCount >= 30 && !user.titles.includes('bonushunter')) {
        newTitles.push({
          id: 'bonushunter',
          name: '🎁 Охотник за бонусами',
          description: 'Собрал 30 ежедневных бонусов',
          earned: utils.now()
        });
      }

      // Проверяем достижения по серии дней
      if (user.dailyStreak >= 7 && !user.titles.includes('regular')) {
        newTitles.push({
          id: 'regular',
          name: '📅 Постоянный посетитель',
          description: '7 дней подряд заходил в бота',
          earned: utils.now()
        });
      }

      // Выдаем новые титулы
      if (newTitles.length > 0) {
        const updatedTitles = [...(user.titles || []), ...newTitles];
        await this.updateUser(userId, { titles: updatedTitles });
        
        // Уведомляем пользователя
        try {
          const titlesText = newTitles.map(t => t.name).join(', ');
          await bot.telegram.sendMessage(userId,
            `🏆 **Новые достижения!**\n\n` +
            `Поздравляем! Вы получили новые титулы:\n` +
            `${titlesText}\n\n` +
            `Продолжайте играть и получайте больше наград!`,
            { parse_mode: 'Markdown' }
          );
        } catch (notifyError) {
          console.log(`⚠️ Не удалось уведомить пользователя ${userId} о новых титулах`);
        }
      }
    } catch (error) {
      console.error('Ошибка проверки достижений:', error);
    }
  }

  // Рассчитать ранг пользователя
  calculateRank(stars) {
    if (stars >= 1000) return { id: 'legend', name: '👑 Легенда', color: '#FFD700' };
    if (stars >= 500) return { id: 'master', name: '🌟 Мастер', color: '#C0C0C0' };
    if (stars >= 100) return { id: 'expert', name: '💎 Эксперт', color: '#CD7F32' };
    if (stars >= 50) return { id: 'advanced', name: '⭐ Продвинутый', color: '#4CAF50' };
    if (stars >= 10) return { id: 'beginner', name: '🌱 Новичок', color: '#2196F3' };
    return { id: 'newbie', name: '🆕 Новичок', color: '#9E9E9E' };
  }

  // Создать заявку на вывод
  async createWithdrawal(userId, amount, wallet) {
    try {
      const user = await this.getUser(userId);
      
      if (user.magnumCoins < amount) {
        return {
          success: false,
          error: '❌ Недостаточно средств для вывода'
        };
      }

      if (amount < 100) {
        return {
          success: false,
          error: '❌ Минимальная сумма вывода: 100🪙'
        };
      }

      // Создаем заявку
      const withdrawal = {
        userId: userId,
        username: user.username,
        amount: amount,
        wallet: wallet,
        status: 'pending',
        created: utils.now()
      };

      await database.createWithdrawal(withdrawal);
      
      // Списываем средства
      await this.updateUser(userId, {
        magnumCoins: user.magnumCoins - amount
      });

      return {
        success: true,
        withdrawalId: withdrawal.id
      };
    } catch (error) {
      console.error('Ошибка создания заявки на вывод:', error);
      return {
        success: false,
        error: '❌ Произошла ошибка при создании заявки'
      };
    }
  }

  // Получить заявки пользователя
  async getUserWithdrawals(userId) {
    try {
      return await database.getUserWithdrawals(userId);
    } catch (error) {
      console.error('Ошибка получения заявок на вывод:', error);
      return [];
    }
  }

  // Создать тикет поддержки
  async createSupportTicket(userId, message) {
    try {
      const user = await this.getUser(userId);
      
      const ticket = {
        userId: userId,
        username: user.username,
        message: message,
        status: 'new',
        created: utils.now(),
        updated: utils.now()
      };

      await database.createSupportTicket(ticket);
      
      return {
        success: true,
        ticketId: ticket.id
      };
    } catch (error) {
      console.error('Ошибка создания тикета:', error);
      return {
        success: false,
        error: '❌ Произошла ошибка при создании тикета'
      };
    }
  }

  // Получить тикеты пользователя
  async getUserTickets(userId) {
    try {
      return await database.getUserTickets(userId);
    } catch (error) {
      console.error('Ошибка получения тикетов:', error);
      return [];
    }
  }

  // Запустить майнер
  async startMiner(userId) {
    try {
      const user = await this.getUser(userId);
      
      if (user.miner && user.miner.active) {
        return {
          success: false,
          error: '⛏️ Майнер уже запущен'
        };
      }

      await this.updateUser(userId, {
        'miner.active': true,
        'miner.lastReward': utils.now()
      });

      return {
        success: true,
        message: '⛏️ Майнер запущен! Он будет автоматически добывать звезды каждые 30 минут.'
      };
    } catch (error) {
      console.error('Ошибка запуска майнера:', error);
      return {
        success: false,
        error: '❌ Произошла ошибка при запуске майнера'
      };
    }
  }

  // Остановить майнер
  async stopMiner(userId) {
    try {
      const user = await this.getUser(userId);
      
      if (!user.miner || !user.miner.active) {
        return {
          success: false,
          error: '⛏️ Майнер не запущен'
        };
      }

      await this.updateUser(userId, {
        'miner.active': false
      });

      return {
        success: true,
        message: '⛏️ Майнер остановлен'
      };
    } catch (error) {
      console.error('Ошибка остановки майнера:', error);
      return {
        success: false,
        error: '❌ Произошла ошибка при остановке майнера'
      };
    }
  }

  // Обмен валют
  async exchangeCurrency(userId, fromCurrency, toCurrency, amount) {
    try {
      const user = await this.getUser(userId);
      const reserve = await database.getReserve();
      
      if (fromCurrency === 'magnumCoins' && toCurrency === 'stars') {
        // Покупаем звезды за Magnum Coins
        if (user.magnumCoins < amount) {
          return {
            success: false,
            error: '❌ Недостаточно Magnum Coins'
          };
        }

        const rate = reserve.stars / reserve.magnumCoins;
        const commission = utils.calculateCommission(amount);
        const starsToReceive = (amount - commission) * rate;

        await this.updateUser(userId, {
          magnumCoins: user.magnumCoins - amount,
          stars: user.stars + starsToReceive
        });

        // Обновляем резерв
        await database.updateReserve({
          magnumCoins: reserve.magnumCoins + amount,
          stars: reserve.stars - starsToReceive
        });

        return {
          success: true,
          received: starsToReceive,
          commission: commission
        };
      } else if (fromCurrency === 'stars' && toCurrency === 'magnumCoins') {
        // Продаем звезды за Magnum Coins
        if (user.stars < amount) {
          return {
            success: false,
            error: '❌ Недостаточно звезд'
          };
        }

        const rate = reserve.magnumCoins / reserve.stars;
        const commission = utils.calculateCommission(amount);
        const coinsToReceive = (amount - commission) * rate;

        await this.updateUser(userId, {
          stars: user.stars - amount,
          magnumCoins: user.magnumCoins + coinsToReceive
        });

        // Обновляем резерв
        await database.updateReserve({
          magnumCoins: reserve.magnumCoins - coinsToReceive,
          stars: reserve.stars + amount
        });

        return {
          success: true,
          received: coinsToReceive,
          commission: commission
        };
      } else {
        return {
          success: false,
          error: '❌ Неподдерживаемая операция обмена'
        };
      }
    } catch (error) {
      console.error('Ошибка обмена валют:', error);
      return {
        success: false,
        error: '❌ Произошла ошибка при обмене'
      };
    }
  }
}

module.exports = new UserService();