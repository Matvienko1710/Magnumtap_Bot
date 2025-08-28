const config = require('../config/constants');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

class MiningService {
  constructor(db) {
    this.db = db;
    this.miningInterval = null;
    this.isRunning = false;
  }

  // Запуск системы майнинга
  startMining() {
    if (this.isRunning) {
      logger.warn('Система майнинга уже запущена');
      return;
    }

    this.isRunning = true;
    this.miningInterval = setInterval(() => {
      this.processMiningRewards();
    }, config.MINING_REWARD_INTERVAL * 1000);

    logger.info('Система майнинга запущена', {
      interval: config.MINING_REWARD_INTERVAL
    });
  }

  // Остановка системы майнинга
  stopMining() {
    if (this.miningInterval) {
      clearInterval(this.miningInterval);
      this.miningInterval = null;
    }
    this.isRunning = false;
    logger.info('Система майнинга остановлена');
  }

  // Получение статистики майнинга пользователя
  async getMiningStats(userId) {
    // Проверяем кэш
    const cachedStats = cache.getMiningStats(userId);
    if (cachedStats) {
      return cachedStats;
    }

    try {
      const user = await this.db.collection('users').findOne({ userId: parseInt(userId) });
      if (!user) {
        return { magnumCoins: 0, stars: 0, totalSpeed: { magnumCoins: 0, stars: 0 } };
      }

      const stats = {
        magnumCoins: user.magnumCoins || 0,
        stars: user.stars || 0,
        totalSpeed: this.calculateTotalSpeed(user)
      };

      // Кэшируем результат
      cache.setMiningStats(userId, stats);
      return stats;
    } catch (error) {
      logger.error('Ошибка получения статистики майнинга', { userId, error: error.message });
      return { magnumCoins: 0, stars: 0, totalSpeed: { magnumCoins: 0, stars: 0 } };
    }
  }

  // Расчет общей скорости майнинга
  calculateTotalSpeed(user) {
    const totalSpeed = { magnumCoins: 0, stars: 0 };

    if (user.miners && Array.isArray(user.miners)) {
      user.miners.forEach(miner => {
        if (miner.type === 'magnumCoins') {
          totalSpeed.magnumCoins += miner.speed || 0;
        } else if (miner.type === 'stars') {
          totalSpeed.stars += miner.speed || 0;
        }
      });
    }

    return totalSpeed;
  }

  // Обработка наград майнинга
  async processMiningRewards() {
    try {
      logger.debug('Начинаем обработку наград майнинга');

      const users = await this.db.collection('users').find({}).toArray();
      let processedCount = 0;
      let totalRewardsMC = 0;
      let totalRewardsStars = 0;

      for (const user of users) {
        try {
          const totalSpeed = this.calculateTotalSpeed(user);
          const totalSpeedSum = totalSpeed.magnumCoins + totalSpeed.stars;

          if (totalSpeedSum > 0) {
            // Получаем текущий сезон
            const currentSeason = await this.getCurrentSeason();
            
            // Рассчитываем награды отдельно для каждой валюты
            const rewardMC = totalSpeed.magnumCoins * config.MINING_REWARD_INTERVAL * currentSeason.multiplier;
            const rewardStars = totalSpeed.stars * config.MINING_REWARD_INTERVAL * currentSeason.multiplier;

            // Обновляем баланс пользователя
            const updateResult = await this.db.collection('users').updateOne(
              { userId: user.userId },
              {
                $inc: {
                  magnumCoins: rewardMC,
                  stars: rewardStars,
                  'miningStats.totalMinedMC': rewardMC,
                  'miningStats.totalMinedStars': rewardStars,
                  'miningStats.seasonMinedMC': rewardMC,
                  'miningStats.seasonMinedStars': rewardStars,
                  'miningStats.passiveRewards': rewardMC + rewardStars
                }
              }
            );

            if (updateResult.modifiedCount > 0) {
              processedCount++;
              totalRewardsMC += rewardMC;
              totalRewardsStars += rewardStars;

              // Логируем награду
              logger.miningReward(user.userId, rewardMC, rewardStars, totalSpeed);

              // Очищаем кэш пользователя
              cache.delete(`mining_${user.userId}`);
              cache.delete(`user_${user.userId}`);
            }
          }
        } catch (error) {
          logger.error('Ошибка обработки наград для пользователя', {
            userId: user.userId,
            error: error.message
          });
        }
      }

      logger.info('Обработка наград майнинга завершена', {
        processedUsers: processedCount,
        totalRewardsMC,
        totalRewardsStars
      });

    } catch (error) {
      logger.error('Ошибка обработки наград майнинга', { error: error.message });
    }
  }

  // Получение текущего сезона
  async getCurrentSeason() {
    try {
      const season = await this.db.collection('seasons').findOne({ isActive: true });
      return season || { multiplier: 1.0, name: 'Default Season' };
    } catch (error) {
      logger.error('Ошибка получения текущего сезона', { error: error.message });
      return { multiplier: 1.0, name: 'Default Season' };
    }
  }

  // Активный клик майнера (только для админов)
  async processActiveMiningClick(userId) {
    try {
      if (!config.ADMIN_IDS.includes(userId)) {
        logger.warn('Попытка активного клика не админом', { userId });
        return { success: false, message: '🚧 Функция в разработке' };
      }

      const user = await this.db.collection('users').findOne({ userId: parseInt(userId) });
      if (!user) {
        return { success: false, message: 'Пользователь не найден' };
      }

      const totalSpeed = this.calculateTotalSpeed(user);
      const totalSpeedSum = totalSpeed.magnumCoins + totalSpeed.stars;

      if (totalSpeedSum === 0) {
        return { success: false, message: 'У вас нет активных майнеров' };
      }

      // Рассчитываем награду за активный клик
      const currentSeason = await this.getCurrentSeason();
      const rewardMC = totalSpeed.magnumCoins * 0.1 * currentSeason.multiplier;
      const rewardStars = totalSpeed.stars * 0.1 * currentSeason.multiplier;

      // Обновляем баланс
      await this.db.collection('users').updateOne(
        { userId: parseInt(userId) },
        {
          $inc: {
            magnumCoins: rewardMC,
            stars: rewardStars,
            'miningStats.activeClicks': 1,
            'miningStats.activeRewards': rewardMC + rewardStars
          }
        }
      );

      // Очищаем кэш
      cache.delete(`mining_${userId}`);
      cache.delete(`user_${userId}`);

      logger.userAction(userId, 'active_mining_click', {
        rewardMC,
        rewardStars,
        totalSpeed
      });

      return {
        success: true,
        message: '✅ Клик!',
        rewardMC,
        rewardStars
      };

    } catch (error) {
      logger.error('Ошибка активного клика майнера', { userId, error: error.message });
      return { success: false, message: 'Ошибка обработки клика' };
    }
  }

  // Апгрейд майнера (только для админов)
  async upgradeMiner(userId, minerType) {
    try {
      if (!config.ADMIN_IDS.includes(userId)) {
        logger.warn('Попытка апгрейда майнера не админом', { userId, minerType });
        return { success: false, message: '🚧 Функция в разработке' };
      }

      const user = await this.db.collection('users').findOne({ userId: parseInt(userId) });
      if (!user) {
        return { success: false, message: 'Пользователь не найден' };
      }

      // Логика апгрейда майнера
      const upgradeResult = await this.performMinerUpgrade(user, minerType);
      
      if (upgradeResult.success) {
        // Очищаем кэш
        cache.delete(`mining_${userId}`);
        cache.delete(`user_${userId}`);
        
        logger.userAction(userId, 'miner_upgrade', {
          minerType,
          newLevel: upgradeResult.newLevel
        });
      }

      return upgradeResult;

    } catch (error) {
      logger.error('Ошибка апгрейда майнера', { userId, minerType, error: error.message });
      return { success: false, message: 'Ошибка апгрейда майнера' };
    }
  }

  // Выполнение апгрейда майнера
  async performMinerUpgrade(user, minerType) {
    // Здесь должна быть логика апгрейда майнера
    // Пока возвращаем заглушку
    return {
      success: true,
      message: 'Майнер успешно апгрейден',
      newLevel: 1
    };
  }
}

module.exports = MiningService;

