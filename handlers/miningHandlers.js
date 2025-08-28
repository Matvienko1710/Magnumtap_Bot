const { Markup } = require('telegraf');
const config = require('../config/constants');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const MiningService = require('../services/miningService');

class MiningHandlers {
  constructor(db) {
    this.db = db;
    this.miningService = new MiningService(db);
  }

  // Показать меню майнинга
  async showMinerMenu(ctx) {
    try {
      const userId = ctx.from.id;
      
      let user = cache.getUser(userId);
      if (!user) {
        user = await this.db.collection('users').findOne({ userId: userId });
        if (user) {
          cache.setUser(userId, user);
        }
      }

      if (!user) {
        await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
        return;
      }

      // Рассчитываем общую скорость майнинга
      const totalSpeed = this.miningService.calculateTotalSpeed(user);
      const totalSpeedSum = totalSpeed.magnumCoins + totalSpeed.stars;

      const miningMessage = `⛏️ *Майнинг*

💰 *Ваш баланс:*
• Magnum Coins: ${user.magnumCoins}
• Stars: ${user.stars}

⚡ *Скорость майнинга:*
• Magnum Coins: ${totalSpeed.magnumCoins}/мин
• Stars: ${totalSpeed.stars}/мин
• Общая: ${totalSpeedSum}/мин

🔄 *Награды за минуту:*
• Magnum Coins: ${(totalSpeed.magnumCoins * config.MINING_REWARD_INTERVAL).toFixed(2)}
• Stars: ${(totalSpeed.stars * config.MINING_REWARD_INTERVAL).toFixed(2)}

📊 *Статистика:*
• Всего добыто MC: ${user.miningStats?.totalMinedMC || 0}
• Всего добыто Stars: ${user.miningStats?.totalMinedStars || 0}
• Активные клики: ${user.miningStats?.activeClicks || 0}`;

      const keyboardButtons = [
        [Markup.button.callback('⚡ Клик', 'miner_active_click')],
        [Markup.button.callback('⬆️ Апгрейд майнеров', 'miner_upgrades')],
        [Markup.button.callback('📊 Детальная статистика', 'miner_stats')],
        [Markup.button.callback('🔙 Назад', 'main_menu')]
      ];

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      await ctx.reply(miningMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

    } catch (error) {
      logger.error('Ошибка в showMinerMenu', { userId: ctx.from.id, error: error.message });
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }

  // Активный клик майнера
  async handleActiveClick(ctx) {
    try {
      const userId = ctx.from.id;
      
      const result = await this.miningService.processActiveMiningClick(userId);
      
      if (result.success) {
        await ctx.answerCbQuery(result.message);
        
        // Обновляем сообщение с новым балансом
        let user = await this.db.collection('users').findOne({ userId: userId });
        if (user) {
          cache.setUser(userId, user);
          
          const totalSpeed = this.miningService.calculateTotalSpeed(user);
          const totalSpeedSum = totalSpeed.magnumCoins + totalSpeed.stars;

          const updatedMessage = `⛏️ *Майнинг*

💰 *Ваш баланс:*
• Magnum Coins: ${user.magnumCoins}
• Stars: ${user.stars}

⚡ *Скорость майнинга:*
• Magnum Coins: ${totalSpeed.magnumCoins}/мин
• Stars: ${totalSpeed.stars}/мин
• Общая: ${totalSpeedSum}/мин

🔄 *Награды за минуту:*
• Magnum Coins: ${(totalSpeed.magnumCoins * config.MINING_REWARD_INTERVAL).toFixed(2)}
• Stars: ${(totalSpeed.stars * config.MINING_REWARD_INTERVAL).toFixed(2)}

📊 *Статистика:*
• Всего добыто MC: ${user.miningStats?.totalMinedMC || 0}
• Всего добыто Stars: ${user.miningStats?.totalMinedStars || 0}
• Активные клики: ${user.miningStats?.activeClicks || 0}

✅ *Последний клик:*
• Получено MC: ${result.rewardMC}
• Получено Stars: ${result.rewardStars}`;

          const keyboardButtons = [
            [Markup.button.callback('⚡ Клик', 'miner_active_click')],
            [Markup.button.callback('⬆️ Апгрейд майнеров', 'miner_upgrades')],
            [Markup.button.callback('📊 Детальная статистика', 'miner_stats')],
            [Markup.button.callback('🔙 Назад', 'main_menu')]
          ];

          const keyboard = Markup.inlineKeyboard(keyboardButtons);

          await ctx.editMessageText(updatedMessage, {
            parse_mode: 'Markdown',
            reply_markup: keyboard.reply_markup
          });
        }
      } else {
        await ctx.answerCbQuery(result.message);
      }

    } catch (error) {
      logger.error('Ошибка в handleActiveClick', { userId: ctx.from.id, error: error.message });
      await ctx.answerCbQuery('❌ Ошибка обработки клика');
    }
  }

  // Показать апгрейды майнеров
  async showMinerUpgrades(ctx) {
    try {
      const userId = ctx.from.id;
      
      let user = cache.getUser(userId);
      if (!user) {
        user = await this.db.collection('users').findOne({ userId: userId });
        if (user) {
          cache.setUser(userId, user);
        }
      }

      if (!user) {
        await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
        return;
      }

      const minerConfigs = {
        magnumCoins: {
          name: 'Magnum Coins Майнер',
          baseSpeed: 1,
          baseCost: 100,
          costMultiplier: 1.5
        },
        stars: {
          name: 'Stars Майнер',
          baseSpeed: 1,
          baseCost: 200,
          costMultiplier: 2.0
        }
      };

      let upgradeMessage = `⬆️ *Апгрейд майнеров*

💰 *Ваш баланс:*
• Magnum Coins: ${user.magnumCoins}
• Stars: ${user.stars}

⛏️ *Текущие майнеры:*\n`;

      const keyboardButtons = [
        [Markup.button.callback('🔙 Назад', 'miner')]
      ];

      user.miners.forEach(miner => {
        const config = minerConfigs[miner.type];
        const currentLevel = miner.level || 1;
        const currentSpeed = miner.speed || config.baseSpeed;
        const nextLevel = currentLevel + 1;
        const upgradeCost = Math.round(config.baseCost * Math.pow(config.costMultiplier, currentLevel - 1));
        
        upgradeMessage += `\n*${config.name} (Уровень ${currentLevel})*
• Скорость: ${currentSpeed}/мин
• Следующий уровень: ${nextLevel}
• Стоимость апгрейда: ${upgradeCost} MC\n`;

        if (user.magnumCoins >= upgradeCost) {
          keyboardButtons.unshift([
            Markup.button.callback(`⬆️ ${config.name} (${upgradeCost} MC)`, `upgrade_miner_${miner.type}`)
          ]);
        }
      });

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      await ctx.reply(upgradeMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

    } catch (error) {
      logger.error('Ошибка в showMinerUpgrades', { userId: ctx.from.id, error: error.message });
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }

  // Обработка апгрейда майнера
  async handleMinerUpgrade(ctx, minerType) {
    try {
      const userId = ctx.from.id;
      
      const result = await this.miningService.upgradeMiner(userId, minerType);
      
      if (result.success) {
        await ctx.answerCbQuery(result.message);
        
        // Обновляем кэш и показываем обновленное меню
        cache.delete(`user_${userId}`);
        await this.showMinerUpgrades(ctx);
      } else {
        await ctx.answerCbQuery(result.message);
      }

    } catch (error) {
      logger.error('Ошибка в handleMinerUpgrade', { userId: ctx.from.id, minerType, error: error.message });
      await ctx.answerCbQuery('❌ Ошибка апгрейда майнера');
    }
  }

  // Показать детальную статистику майнинга
  async showMiningStats(ctx) {
    try {
      const userId = ctx.from.id;
      
      let user = cache.getUser(userId);
      if (!user) {
        user = await this.db.collection('users').findOne({ userId: userId });
        if (user) {
          cache.setUser(userId, user);
        }
      }

      if (!user) {
        await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
        return;
      }

      const totalSpeed = this.miningService.calculateTotalSpeed(user);
      const totalSpeedSum = totalSpeed.magnumCoins + totalSpeed.stars;

      const statsMessage = `📊 *Детальная статистика майнинга*

⛏️ *Текущие майнеры:*
${user.miners.map(miner => {
  const typeName = miner.type === 'magnumCoins' ? 'Magnum Coins' : 'Stars';
  return `• ${typeName}: Уровень ${miner.level}, Скорость ${miner.speed}/мин`;
}).join('\n')}

⚡ *Общая производительность:*
• Magnum Coins: ${totalSpeed.magnumCoins}/мин
• Stars: ${totalSpeed.stars}/мин
• Общая: ${totalSpeedSum}/мин

💰 *Награды за период:*
• За минуту: MC ${(totalSpeed.magnumCoins * config.MINING_REWARD_INTERVAL).toFixed(2)}, Stars ${(totalSpeed.stars * config.MINING_REWARD_INTERVAL).toFixed(2)}
• За час: MC ${(totalSpeed.magnumCoins * config.MINING_REWARD_INTERVAL * 60).toFixed(2)}, Stars ${(totalSpeed.stars * config.MINING_REWARD_INTERVAL * 60).toFixed(2)}
• За день: MC ${(totalSpeed.magnumCoins * config.MINING_REWARD_INTERVAL * 60 * 24).toFixed(2)}, Stars ${(totalSpeed.stars * config.MINING_REWARD_INTERVAL * 60 * 24).toFixed(2)}

📈 *История майнинга:*
• Всего добыто MC: ${user.miningStats?.totalMinedMC || 0}
• Всего добыто Stars: ${user.miningStats?.totalMinedStars || 0}
• Пассивные награды: ${user.miningStats?.passiveRewards || 0}
• Активные клики: ${user.miningStats?.activeClicks || 0}
• Активные награды: ${user.miningStats?.activeRewards || 0}
• Сезонные MC: ${user.miningStats?.seasonMinedMC || 0}
• Сезонные Stars: ${user.miningStats?.seasonMinedStars || 0}`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📊 Экспорт статистики', 'export_mining_stats')],
        [Markup.button.callback('🔙 Назад', 'miner')]
      ]);

      await ctx.reply(statsMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

    } catch (error) {
      logger.error('Ошибка в showMiningStats', { userId: ctx.from.id, error: error.message });
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }
}

module.exports = MiningHandlers;

