class TasksModule {
  constructor(database, cache) {
    this.db = database;
    this.cache = cache;
  }

  async getDailyTasks(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      const today = new Date().toISOString().split('T')[0];
      
      let dailyTasks = await this.db.collections.dailyTasks.findOne({
        userId: parseInt(userId),
        date: today
      });

      if (!dailyTasks) {
        // Создаем новые ежедневные задания
        dailyTasks = await this.createDailyTasks(userId, today);
      }

      return {
        success: true,
        tasks: dailyTasks.tasks,
        completed: dailyTasks.completed,
        rewards: dailyTasks.rewards
      };
    } catch (error) {
      console.error('Ошибка получения ежедневных заданий:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async createDailyTasks(userId, date) {
    const tasks = [
      {
        id: 'farm_10',
        name: 'Фарм 10 раз',
        description: 'Выполните фарм 10 раз',
        type: 'farm',
        target: 10,
        reward: 5,
        completed: false,
        progress: 0
      },
      {
        id: 'bonus_1',
        name: 'Получить бонус',
        description: 'Получите ежедневный бонус',
        type: 'bonus',
        target: 1,
        reward: 3,
        completed: false,
        progress: 0
      },
      {
        id: 'promo_1',
        name: 'Активировать промокод',
        description: 'Активируйте любой промокод',
        type: 'promo',
        target: 1,
        reward: 10,
        completed: false,
        progress: 0
      },
      {
        id: 'exchange_1',
        name: 'Обменять валюту',
        description: 'Выполните обмен валюты',
        type: 'exchange',
        target: 1,
        reward: 8,
        completed: false,
        progress: 0
      },
      {
        id: 'miner_1h',
        name: 'Майнер 1 час',
        description: 'Запустите майнер на 1 час',
        type: 'miner',
        target: 3600, // 1 час в секундах
        reward: 15,
        completed: false,
        progress: 0
      }
    ];

    const dailyTasks = {
      userId: parseInt(userId),
      date: date,
      tasks: tasks,
      completed: 0,
      rewards: 0,
      createdAt: new Date()
    };

    await this.db.collections.dailyTasks.insertOne(dailyTasks);
    return dailyTasks;
  }

  async updateTaskProgress(userId, taskType, amount = 1) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const dailyTasks = await this.db.collections.dailyTasks.findOne({
        userId: parseInt(userId),
        date: today
      });

      if (!dailyTasks) return;

      let updated = false;
      const updatedTasks = dailyTasks.tasks.map(task => {
        if (task.type === taskType && !task.completed) {
          const newProgress = task.progress + amount;
          if (newProgress >= task.target) {
            task.completed = true;
            task.progress = task.target;
            updated = true;
          } else {
            task.progress = newProgress;
          }
        }
        return task;
      });

      if (updated) {
        const completedCount = updatedTasks.filter(t => t.completed).length;
        const totalReward = updatedTasks
          .filter(t => t.completed)
          .reduce((sum, t) => sum + t.reward, 0);

        await this.db.collections.dailyTasks.updateOne(
          { _id: dailyTasks._id },
          {
            $set: {
              tasks: updatedTasks,
              completed: completedCount,
              rewards: totalReward
            }
          }
        );

        // Проверяем, все ли задания выполнены
        if (completedCount === updatedTasks.length) {
          await this.giveDailyTasksReward(userId, totalReward);
        }
      } else {
        await this.db.collections.dailyTasks.updateOne(
          { _id: dailyTasks._id },
          { $set: { tasks: updatedTasks } }
        );
      }
    } catch (error) {
      console.error('Ошибка обновления прогресса задания:', error);
    }
  }

  async giveDailyTasksReward(userId, reward) {
    try {
      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $inc: { 
            stars: reward,
            totalEarnedStars: reward
          }
        }
      );

      this.cache.userCache.delete(userId.toString());

      // Уведомляем пользователя
      const message = `🎉 **Все ежедневные задания выполнены!**\n\n` +
                     `🎁 Награда: ${reward}⭐\n` +
                     `📊 Задания: 5/5 выполнено\n\n` +
                     `Завтра появятся новые задания!`;

      // Здесь должна быть отправка сообщения пользователю
      console.log(`📱 Уведомление пользователю ${userId}: ${message}`);
    } catch (error) {
      console.error('Ошибка выдачи награды за задания:', error);
    }
  }

  async getSponsorTasks(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      
      const sponsorTasks = [
        {
          id: 'join_channel',
          name: 'Подписаться на канал',
          description: 'Подпишитесь на наш канал',
          type: 'subscription',
          reward: 50,
          link: 'https://t.me/example_channel',
          completed: false
        },
        {
          id: 'join_bot',
          name: 'Подписаться на бота',
          description: 'Подпишитесь на нашего бота',
          type: 'subscription',
          reward: 30,
          link: 'https://t.me/example_bot',
          completed: false
        },
        {
          id: 'invite_5',
          name: 'Пригласить 5 друзей',
          description: 'Пригласите 5 друзей по реферальной ссылке',
          type: 'referral',
          target: 5,
          reward: 100,
          completed: false,
          progress: user.invited || 0
        }
      ];

      // Проверяем выполненные задания
      const completedTasks = await this.db.collections.sponsorTasks
        .find({ userId: parseInt(userId) })
        .toArray();

      const completedTaskIds = completedTasks.map(t => t.taskId);

      const updatedTasks = sponsorTasks.map(task => ({
        ...task,
        completed: completedTaskIds.includes(task.id)
      }));

      return {
        success: true,
        tasks: updatedTasks
      };
    } catch (error) {
      console.error('Ошибка получения спонсорских заданий:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async completeSponsorTask(userId, taskId, ctx) {
    try {
      const user = await this.getUser(userId);
      
      // Проверяем, не выполнено ли уже задание
      const existing = await this.db.collections.sponsorTasks.findOne({
        userId: parseInt(userId),
        taskId: taskId
      });

      if (existing) {
        return {
          success: false,
          message: '❌ Это задание уже выполнено'
        };
      }

      let taskReward = 0;
      let taskName = '';

      // Определяем награду за задание
      switch (taskId) {
        case 'join_channel':
          taskReward = 50;
          taskName = 'Подписка на канал';
          break;
        case 'join_bot':
          taskReward = 30;
          taskName = 'Подписка на бота';
          break;
        case 'invite_5':
          if ((user.invited || 0) < 5) {
            return {
              success: false,
              message: '❌ Недостаточно приглашенных друзей (нужно 5)'
            };
          }
          taskReward = 100;
          taskName = 'Приглашение 5 друзей';
          break;
        default:
          return {
            success: false,
            message: '❌ Неизвестное задание'
          };
      }

      // Отмечаем задание как выполненное
      await this.db.collections.sponsorTasks.insertOne({
        userId: parseInt(userId),
        taskId: taskId,
        completedAt: new Date()
      });

      // Выдаем награду
      await this.db.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $inc: { 
            stars: taskReward,
            totalEarnedStars: taskReward
          }
        }
      );

      this.cache.userCache.delete(userId.toString());

      return {
        success: true,
        reward: taskReward,
        message: `✅ Задание "${taskName}" выполнено!\n\n` +
                `🎁 Награда: ${taskReward}⭐`
      };
    } catch (error) {
      console.error('Ошибка выполнения спонсорского задания:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async getAchievements(userId, ctx) {
    try {
      const user = await this.getUser(userId);
      const achievements = await this.getAvailableAchievements();
      
      // Отмечаем выполненные достижения
      const userAchievements = user.achievements || [];
      const userAchievementIds = userAchievements.map(a => a.id);

      const updatedAchievements = achievements.map(achievement => ({
        ...achievement,
        completed: userAchievementIds.includes(achievement.id),
        userProgress: this.getUserProgressForAchievement(user, achievement)
      }));

      return {
        success: true,
        achievements: updatedAchievements,
        userAchievements: userAchievements
      };
    } catch (error) {
      console.error('Ошибка получения достижений:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
      };
    }
  }

  async getAvailableAchievements() {
    return [
      {
        id: 'first_farm',
        name: 'Первый фарм',
        description: 'Выполните первый фарм',
        type: 'farm',
        target: 1,
        reward: 10,
        icon: '🌱'
      },
      {
        id: 'farm_10',
        name: 'Начинающий фермер',
        description: 'Выполните фарм 10 раз',
        type: 'farm',
        target: 10,
        reward: 25,
        icon: '🌾'
      },
      {
        id: 'farm_100',
        name: 'Опытный фермер',
        description: 'Выполните фарм 100 раз',
        type: 'farm',
        target: 100,
        reward: 100,
        icon: '🚜'
      },
      {
        id: 'farm_1000',
        name: 'Мастер фермер',
        description: 'Выполните фарм 1000 раз',
        type: 'farm',
        target: 1000,
        reward: 500,
        icon: '👨‍🌾'
      },
      {
        id: 'first_bonus',
        name: 'Первый бонус',
        description: 'Получите первый ежедневный бонус',
        type: 'bonus',
        target: 1,
        reward: 15,
        icon: '🎁'
      },
      {
        id: 'bonus_7',
        name: 'Недельный бонус',
        description: 'Получите бонус 7 дней подряд',
        type: 'bonus_streak',
        target: 7,
        reward: 50,
        icon: '📅'
      },
      {
        id: 'bonus_30',
        name: 'Месячный бонус',
        description: 'Получите бонус 30 дней подряд',
        type: 'bonus_streak',
        target: 30,
        reward: 200,
        icon: '📆'
      },
      {
        id: 'first_promo',
        name: 'Первый промокод',
        description: 'Активируйте первый промокод',
        type: 'promo',
        target: 1,
        reward: 20,
        icon: '🎫'
      },
      {
        id: 'promo_10',
        name: 'Коллекционер промокодов',
        description: 'Активируйте 10 промокодов',
        type: 'promo',
        target: 10,
        reward: 100,
        icon: '📚'
      },
      {
        id: 'promo_50',
        name: 'Мастер промокодов',
        description: 'Активируйте 50 промокодов',
        type: 'promo',
        target: 50,
        reward: 500,
        icon: '🏆'
      },
      {
        id: 'first_exchange',
        name: 'Первый обмен',
        description: 'Выполните первый обмен валюты',
        type: 'exchange',
        target: 1,
        reward: 30,
        icon: '💱'
      },
      {
        id: 'exchange_10',
        name: 'Трейдер',
        description: 'Выполните 10 обменов',
        type: 'exchange',
        target: 10,
        reward: 150,
        icon: '📈'
      },
      {
        id: 'first_invite',
        name: 'Первый приглашенный',
        description: 'Пригласите первого друга',
        type: 'referral',
        target: 1,
        reward: 50,
        icon: '👥'
      },
      {
        id: 'invite_10',
        name: 'Команда',
        description: 'Пригласите 10 друзей',
        type: 'referral',
        target: 10,
        reward: 300,
        icon: '👨‍👩‍👧‍👦'
      },
      {
        id: 'invite_50',
        name: 'Лидер',
        description: 'Пригласите 50 друзей',
        type: 'referral',
        target: 50,
        reward: 1000,
        icon: '👑'
      },
      {
        id: 'miner_1h',
        name: 'Первый час майнинга',
        description: 'Запустите майнер на 1 час',
        type: 'miner_time',
        target: 3600,
        reward: 25,
        icon: '⛏️'
      },
      {
        id: 'miner_24h',
        name: 'День майнинга',
        description: 'Запустите майнер на 24 часа',
        type: 'miner_time',
        target: 86400,
        reward: 200,
        icon: '⛏️⏰'
      },
      {
        id: 'stars_1000',
        name: 'Тысяча звезд',
        description: 'Накопите 1000 звезд',
        type: 'stars_balance',
        target: 1000,
        reward: 100,
        icon: '⭐'
      },
      {
        id: 'stars_10000',
        name: 'Десять тысяч звезд',
        description: 'Накопите 10000 звезд',
        type: 'stars_balance',
        target: 10000,
        reward: 500,
        icon: '⭐⭐'
      },
      {
        id: 'magnum_100',
        name: 'Сотня монет',
        description: 'Накопите 100 Magnum Coins',
        type: 'magnum_balance',
        target: 100,
        reward: 50,
        icon: '🪙'
      },
      {
        id: 'magnum_1000',
        name: 'Тысяча монет',
        description: 'Накопите 1000 Magnum Coins',
        type: 'magnum_balance',
        target: 1000,
        reward: 200,
        icon: '🪙🪙'
      }
    ];
  }

  getUserProgressForAchievement(user, achievement) {
    switch (achievement.type) {
      case 'farm':
        return user.farmCount || 0;
      case 'bonus':
        return user.bonusCount || 0;
      case 'bonus_streak':
        return user.dailyStreak || 0;
      case 'promo':
        return user.promoCount || 0;
      case 'exchange':
        return user.statistics?.totalExchanges || 0;
      case 'referral':
        return user.invited || 0;
      case 'miner_time':
        return user.miner?.totalEarned || 0;
      case 'stars_balance':
        return user.stars || 0;
      case 'magnum_balance':
        return user.magnumCoins || 0;
      default:
        return 0;
    }
  }

  async checkAndAwardAchievements(userId) {
    try {
      const user = await this.getUser(userId);
      const achievements = await this.getAvailableAchievements();
      const userAchievements = user.achievements || [];
      const userAchievementIds = userAchievements.map(a => a.id);

      const newAchievements = [];

      for (const achievement of achievements) {
        if (!userAchievementIds.includes(achievement.id)) {
          const progress = this.getUserProgressForAchievement(user, achievement);
          
          if (progress >= achievement.target) {
            newAchievements.push(achievement);
          }
        }
      }

      if (newAchievements.length > 0) {
        const updatedAchievements = [...userAchievements, ...newAchievements];
        let totalReward = 0;

        for (const achievement of newAchievements) {
          totalReward += achievement.reward;
        }

        await this.db.collections.users.updateOne(
          { id: parseInt(userId) },
          {
            $set: { achievements: updatedAchievements },
            $inc: { 
              stars: totalReward,
              totalEarnedStars: totalReward
            }
          }
        );

        this.cache.userCache.delete(userId.toString());

        return {
          success: true,
          newAchievements: newAchievements,
          totalReward: totalReward
        };
      }

      return {
        success: true,
        newAchievements: [],
        totalReward: 0
      };
    } catch (error) {
      console.error('Ошибка проверки достижений:', error);
      return {
        success: false,
        message: '❌ Произошла ошибка'
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

module.exports = TasksModule;