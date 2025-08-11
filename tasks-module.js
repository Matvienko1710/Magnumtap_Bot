// ==================== МОДУЛЬ ЗАДАНИЙ И ДОСТИЖЕНИЙ ====================

const dailyTasks = [
  {
    id: 'farm_10',
    title: '🌾 Фармер',
    description: 'Фармить 10 раз',
    type: 'farm',
    target: 10,
    reward: { stars: 5, experience: 50 }
  },
  {
    id: 'miner_24h',
    title: '⛏️ Майнер',
    description: 'Держать майнер активным 24 часа',
    type: 'miner_time',
    target: 86400, // 24 часа в секундах
    reward: { stars: 10, experience: 100 }
  },
  {
    id: 'referral_1',
    title: '👥 Реферал',
    description: 'Пригласить 1 реферала',
    type: 'referral',
    target: 1,
    reward: { stars: 15, experience: 150 }
  },
  {
    id: 'exchange_5',
    title: '💱 Трейдер',
    description: 'Сделать 5 обменов',
    type: 'exchange',
    target: 5,
    reward: { stars: 8, experience: 80 }
  },
  {
    id: 'bonus_7',
    title: '🎁 Ежедневник',
    description: 'Получить бонус 7 дней подряд',
    type: 'bonus_streak',
    target: 7,
    reward: { stars: 20, experience: 200 }
  }
];

const achievements = [
  {
    id: 'first_farm',
    title: '🌱 Первый фарм',
    description: 'Выполнить первый фарм',
    type: 'farm_count',
    target: 1,
    reward: { stars: 10, experience: 100, title: '🌱 Новичок' }
  },
  {
    id: 'farm_master',
    title: '🌾 Мастер фарма',
    description: 'Фармить 100 раз',
    type: 'farm_count',
    target: 100,
    reward: { stars: 100, experience: 1000, title: '🌾 Фармер' }
  },
  {
    id: 'miner_expert',
    title: '⛏️ Эксперт майнинга',
    description: 'Добыть 1000 Stars майнером',
    type: 'miner_total',
    target: 1000,
    reward: { stars: 200, experience: 2000, title: '⛏️ Майнер' }
  },
  {
    id: 'referral_king',
    title: '👑 Король рефералов',
    description: 'Пригласить 10 рефералов',
    type: 'referral_count',
    target: 10,
    reward: { stars: 500, experience: 5000, title: '👑 Реферал' }
  },
  {
    id: 'rich_user',
    title: '💎 Богач',
    description: 'Накопить 10000 Stars',
    type: 'stars_balance',
    target: 10000,
    reward: { stars: 1000, experience: 10000, title: '💎 Богач' }
  },
  {
    id: 'exchange_master',
    title: '💱 Мастер обмена',
    description: 'Сделать 50 обменов',
    type: 'exchange_count',
    target: 50,
    reward: { stars: 300, experience: 3000, title: '💱 Трейдер' }
  },
  {
    id: 'bonus_champion',
    title: '🏆 Чемпион бонусов',
    description: 'Получить бонус 30 дней подряд',
    type: 'bonus_streak',
    target: 30,
    reward: { stars: 1000, experience: 10000, title: '🏆 Чемпион' }
  }
];

class TasksModule {
  constructor(db, userCache) {
    this.db = db;
    this.userCache = userCache;
  }

  // Создание ежедневных заданий для пользователя
  async createDailyTasks(userId) {
    try {
      const today = new Date().toDateString();
      const user = await this.getUser(userId);
      
      if (!user) return null;
      
      // Проверяем, не созданы ли уже задания на сегодня
      const existingTasks = await this.db.collection('dailyTasks').findOne({
        userId: userId,
        date: today
      });
      
      if (existingTasks) return existingTasks;
      
      // Создаем новые задания
      const userTasks = dailyTasks.map(task => ({
        ...task,
        userId: userId,
        date: today,
        progress: 0,
        completed: false,
        claimed: false,
        createdAt: new Date()
      }));
      
      await this.db.collection('dailyTasks').insertMany(userTasks);
      
      return userTasks;
    } catch (error) {
      console.error('Ошибка создания ежедневных заданий:', error);
      return null;
    }
  }

  // Получение ежедневных заданий пользователя
  async getDailyTasks(userId) {
    try {
      const today = new Date().toDateString();
      
      let tasks = await this.db.collection('dailyTasks').find({
        userId: userId,
        date: today
      }).toArray();
      
      if (tasks.length === 0) {
        tasks = await this.createDailyTasks(userId);
      }
      
      return tasks || [];
    } catch (error) {
      console.error('Ошибка получения ежедневных заданий:', error);
      return [];
    }
  }

  // Обновление прогресса задания
  async updateTaskProgress(userId, taskType, amount = 1) {
    try {
      const today = new Date().toDateString();
      
      await this.db.collection('dailyTasks').updateMany(
        {
          userId: userId,
          date: today,
          type: taskType,
          completed: false
        },
        {
          $inc: { progress: amount },
          $set: { updatedAt: new Date() }
        }
      );
      
      // Проверяем завершение заданий
      await this.checkTaskCompletion(userId);
    } catch (error) {
      console.error('Ошибка обновления прогресса задания:', error);
    }
  }

  // Проверка завершения заданий
  async checkTaskCompletion(userId) {
    try {
      const today = new Date().toDateString();
      
      const tasks = await this.db.collection('dailyTasks').find({
        userId: userId,
        date: today,
        completed: false
      }).toArray();
      
      for (const task of tasks) {
        if (task.progress >= task.target && !task.completed) {
          await this.db.collection('dailyTasks').updateOne(
            { _id: task._id },
            { $set: { completed: true, completedAt: new Date() } }
          );
        }
      }
    } catch (error) {
      console.error('Ошибка проверки завершения заданий:', error);
    }
  }

  // Получение награды за задание
  async claimTaskReward(userId, taskId) {
    try {
      const task = await this.db.collection('dailyTasks').findOne({
        _id: taskId,
        userId: userId,
        completed: true,
        claimed: false
      });
      
      if (!task) {
        return { success: false, message: 'Задание не найдено или уже получено' };
      }
      
      // Выдаем награду
      await this.db.collection('users').updateOne(
        { id: userId },
        {
          $inc: {
            stars: task.reward.stars || 0,
            totalEarnedStars: task.reward.stars || 0,
            experience: task.reward.experience || 0,
            'tasks.completedTasksCount': 1,
            'tasks.totalTaskRewards': task.reward.stars || 0
          }
        }
      );
      
      // Отмечаем задание как полученное
      await this.db.collection('dailyTasks').updateOne(
        { _id: taskId },
        { $set: { claimed: true, claimedAt: new Date() } }
      );
      
      // Очищаем кеш пользователя
      this.userCache.delete(userId);
      
      return { 
        success: true, 
        reward: task.reward,
        message: `Награда получена: ${task.reward.stars} Stars, ${task.reward.experience} опыта`
      };
    } catch (error) {
      console.error('Ошибка получения награды за задание:', error);
      return { success: false, message: 'Ошибка получения награды' };
    }
  }

  // Проверка и выдача достижений
  async checkAchievements(userId) {
    try {
      const user = await this.getUser(userId);
      if (!user) return [];
      
      const newAchievements = [];
      
      for (const achievement of achievements) {
        // Проверяем, не получено ли уже достижение
        if (user.achievements.includes(achievement.id)) continue;
        
        let progress = 0;
        
        switch (achievement.type) {
          case 'farm_count':
            progress = user.farm.farmCount;
            break;
          case 'miner_total':
            progress = user.miner.totalMined;
            break;
          case 'referral_count':
            progress = user.referralsCount;
            break;
          case 'stars_balance':
            progress = user.stars;
            break;
          case 'exchange_count':
            progress = user.exchange.exchangeCount;
            break;
          case 'bonus_streak':
            progress = user.dailyBonus.streak;
            break;
        }
        
        if (progress >= achievement.target) {
          // Выдаем достижение
          await this.db.collection('users').updateOne(
            { id: userId },
            {
              $inc: {
                stars: achievement.reward.stars || 0,
                totalEarnedStars: achievement.reward.stars || 0,
                experience: achievement.reward.experience || 0,
                achievementsCount: 1
              },
              $push: { 
                achievements: achievement.id,
                titles: achievement.reward.title
              },
              $set: {
                mainTitle: achievement.reward.title,
                updatedAt: new Date()
              }
            }
          );
          
          newAchievements.push(achievement);
        }
      }
      
      if (newAchievements.length > 0) {
        this.userCache.delete(userId);
      }
      
      return newAchievements;
    } catch (error) {
      console.error('Ошибка проверки достижений:', error);
      return [];
    }
  }

  // Получение всех достижений
  async getAllAchievements() {
    return achievements;
  }

  // Получение достижений пользователя
  async getUserAchievements(userId) {
    try {
      const user = await this.getUser(userId);
      if (!user) return [];
      
      return achievements.filter(achievement => 
        user.achievements.includes(achievement.id)
      );
    } catch (error) {
      console.error('Ошибка получения достижений пользователя:', error);
      return [];
    }
  }

  // Получение прогресса достижений
  async getAchievementProgress(userId) {
    try {
      const user = await this.getUser(userId);
      if (!user) return [];
      
      return achievements.map(achievement => {
        let progress = 0;
        
        switch (achievement.type) {
          case 'farm_count':
            progress = user.farm.farmCount;
            break;
          case 'miner_total':
            progress = user.miner.totalMined;
            break;
          case 'referral_count':
            progress = user.referralsCount;
            break;
          case 'stars_balance':
            progress = user.stars;
            break;
          case 'exchange_count':
            progress = user.exchange.exchangeCount;
            break;
          case 'bonus_streak':
            progress = user.dailyBonus.streak;
            break;
        }
        
        return {
          ...achievement,
          progress,
          completed: user.achievements.includes(achievement.id),
          percentage: Math.min((progress / achievement.target) * 100, 100)
        };
      });
    } catch (error) {
      console.error('Ошибка получения прогресса достижений:', error);
      return [];
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

  // Сброс ежедневных заданий (для админов)
  async resetDailyTasks() {
    try {
      const today = new Date().toDateString();
      
      await this.db.collection('dailyTasks').deleteMany({
        date: today
      });
      
      console.log('Ежедневные задания сброшены');
      return true;
    } catch (error) {
      console.error('Ошибка сброса ежедневных заданий:', error);
      return false;
    }
  }
}

module.exports = TasksModule;