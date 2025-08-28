const { Markup } = require('telegraf');
const config = require('../config/constants');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const { getRichAdsOffers, verifyRichAdsOffer, sendRichAdsConversion } = require('../richads-integration');

class TaskHandlers {
  constructor(db) {
    this.db = db;
  }

  // Показать меню заданий
  async showTasksMenu(ctx) {
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

      const tasksMessage = `🎯 *Задания*

💰 *Ваш баланс:*
• Magnum Coins: ${user.magnumCoins}
• Stars: ${user.stars}

📊 *Статистика заданий:*
• Выполнено заданий: ${user.completedTasks || 0}
• Заработано за задания: ${user.taskEarnings || 0} Stars

Выберите тип заданий:`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🎯 RichAds офферы', 'tasks_richads')],
        [Markup.button.callback('🎁 Ежедневные бонусы', 'tasks_daily')],
        [Markup.button.callback('🏷️ Промокоды', 'tasks_promocodes')],
        [Markup.button.callback('📊 История заданий', 'tasks_history')],
        [Markup.button.callback('🔙 Назад', 'main_menu')]
      ]);

      await ctx.reply(tasksMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

    } catch (error) {
      logger.error('Ошибка в showTasksMenu', { userId: ctx.from.id, error: error.message });
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }

  // Показать RichAds офферы
  async showRichAdsOffers(ctx) {
    try {
      const userId = ctx.from.id;
      
      // Проверяем кэш офферов
      let offers = cache.getRichAdsOffers();
      if (!offers) {
        logger.info('Получение RichAds офферов...');
        offers = await getRichAdsOffers();
        if (offers && offers.length > 0) {
          cache.setRichAdsOffers(offers);
        }
      }

      if (!offers || offers.length === 0) {
        await ctx.reply('❌ В данный момент нет доступных офферов. Попробуйте позже.');
        return;
      }

      const offersMessage = `🎯 *RichAds офферы*

Доступно офферов: ${offers.length}

Выберите оффер для выполнения:`;

      const keyboardButtons = [];
      
      // Показываем первые 5 офферов
      const displayOffers = offers.slice(0, 5);
      
      displayOffers.forEach((offer, index) => {
        const rewardText = offer.rewardType === 'stars' ? `${offer.reward} Stars` : `${offer.reward} MC`;
        keyboardButtons.push([
          Markup.button.callback(
            `${offer.title} (${rewardText})`,
            `richads_offer_${offer.id}`
          )
        ]);
      });

      if (offers.length > 5) {
        keyboardButtons.push([
          Markup.button.callback('⏭️ Следующие офферы', 'richads_next_page')
        ]);
      }

      keyboardButtons.push([
        Markup.button.callback('🔄 Обновить', 'tasks_richads'),
        Markup.button.callback('🔙 Назад', 'tasks')
      ]);

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      await ctx.reply(offersMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

    } catch (error) {
      logger.error('Ошибка в showRichAdsOffers', { userId: ctx.from.id, error: error.message });
      await ctx.reply('❌ Ошибка загрузки офферов. Попробуйте позже.');
    }
  }

  // Показать детали RichAds оффера
  async showRichAdsOfferDetails(ctx, offerId) {
    try {
      const userId = ctx.from.id;
      
      // Получаем офферы из кэша или загружаем заново
      let offers = cache.getRichAdsOffers();
      if (!offers) {
        offers = await getRichAdsOffers();
        if (offers && offers.length > 0) {
          cache.setRichAdsOffers(offers);
        }
      }

      const offer = offers?.find(o => o.id === offerId);
      if (!offer) {
        await ctx.reply('❌ Оффер не найден.');
        return;
      }

      const rewardText = offer.rewardType === 'stars' ? `${offer.reward} Stars` : `${offer.reward} MC`;
      
      let message = `🎯 *${offer.title}*

📝 *Описание:*
${offer.description}

💰 *Награда:* ${rewardText}
⭐ *Сложность:* ${offer.difficulty}
⏱️ *Время:* ${offer.estimatedTime}
🌍 *Страна:* ${offer.country}

📋 *Требования:*`;

      if (offer.requirements && Array.isArray(offer.requirements)) {
        offer.requirements.forEach(req => {
          message += `\n• ${req}`;
        });
      } else if (offer.requirements && typeof offer.requirements === 'string') {
        message += `\n• ${offer.requirements}`;
      } else {
        message += `\n• Выполните задание`;
        message += `\n• Отправьте скриншот`;
      }

      const keyboardButtons = [
        [
          Markup.button.url('📱 Подписаться', offer.url),
          Markup.button.callback('📸 Отправить скриншот', `send_screenshot_${offerId}`)
        ]
      ];

      // Проверяем, есть ли следующие офферы
      const currentIndex = offers.findIndex(o => o.id === offerId);
      const hasNextTask = currentIndex < offers.length - 1;
      
      if (hasNextTask) {
        keyboardButtons.push([
          Markup.button.callback('⏭️ Следующее задание', 'next_richads_offer')
        ]);
      }

      keyboardButtons.push([
        Markup.button.callback('🔙 Назад', 'tasks_richads')
      ]);

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

    } catch (error) {
      logger.error('Ошибка в showRichAdsOfferDetails', { userId: ctx.from.id, offerId, error: error.message });
      await ctx.reply('❌ Ошибка загрузки деталей оффера.');
    }
  }

  // Обработка отправки скриншота
  async handleScreenshotSubmission(ctx, offerId) {
    try {
      const userId = ctx.from.id;
      
      // Проверяем, есть ли фото в сообщении
      if (!ctx.message?.photo) {
        await ctx.reply('❌ Пожалуйста, отправьте скриншот выполнения задания.');
        return;
      }

      // Получаем информацию об оффере
      let offers = cache.getRichAdsOffers();
      if (!offers) {
        offers = await getRichAdsOffers();
      }

      const offer = offers?.find(o => o.id === offerId);
      if (!offer) {
        await ctx.reply('❌ Оффер не найден.');
        return;
      }

      // Верифицируем оффер
      const verificationResult = await verifyRichAdsOffer(offerId, userId);
      
      if (verificationResult.success && verificationResult.verified) {
        // Отправляем конверсию
        const conversionResult = await sendRichAdsConversion(offerId, userId, 1);
        
        if (conversionResult.success) {
          // Начисляем награду пользователю
          const reward = offer.reward;
          const rewardType = offer.rewardType;
          
          const updateData = {};
          if (rewardType === 'stars') {
            updateData.stars = reward;
            updateData.taskEarnings = (user.taskEarnings || 0) + reward;
          } else {
            updateData.magnumCoins = reward;
          }
          
          updateData.completedTasks = (user.completedTasks || 0) + 1;
          updateData.lastTaskCompletion = new Date();

          await this.db.collection('users').updateOne(
            { userId: userId },
            { $inc: updateData }
          );

          // Очищаем кэш пользователя
          cache.delete(`user_${userId}`);

          const rewardText = rewardType === 'stars' ? `${reward} Stars` : `${reward} MC`;
          
          await ctx.reply(`✅ *Задание выполнено!*

🎉 Награда начислена: ${rewardText}

Спасибо за выполнение задания!`);

          logger.userAction(userId, 'task_completed', {
            offerId,
            reward,
            rewardType,
            conversionId: conversionResult.conversion_id
          });

        } else {
          await ctx.reply('❌ Ошибка отправки конверсии. Попробуйте позже.');
        }
      } else {
        await ctx.reply('❌ Скриншот не прошел проверку. Убедитесь, что задание выполнено корректно.');
      }

    } catch (error) {
      logger.error('Ошибка в handleScreenshotSubmission', { userId: ctx.from.id, offerId, error: error.message });
      await ctx.reply('❌ Ошибка обработки скриншота. Попробуйте позже.');
    }
  }

  // Показать ежедневные бонусы
  async showDailyBonuses(ctx) {
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

      // Проверяем, можно ли получить ежедневный бонус
      const lastDailyBonus = user.lastDailyBonus ? new Date(user.lastDailyBonus) : null;
      const now = new Date();
      const canClaimDaily = !lastDailyBonus || 
        (now.getTime() - lastDailyBonus.getTime()) >= 24 * 60 * 60 * 1000;

      const dailyMessage = `🎁 *Ежедневные бонусы*

💰 *Ваш баланс:*
• Magnum Coins: ${user.magnumCoins}
• Stars: ${user.stars}

🎯 *Ежедневный бонус:*
• Magnum Coins: 50
• Stars: 25

${canClaimDaily ? '✅ Бонус доступен!' : '⏰ Бонус будет доступен завтра'}

📅 *Последний бонус:* ${lastDailyBonus ? lastDailyBonus.toLocaleDateString('ru-RU') : 'Не получен'}`;

      const keyboardButtons = [];
      
      if (canClaimDaily) {
        keyboardButtons.push([
          Markup.button.callback('🎁 Получить бонус', 'claim_daily_bonus')
        ]);
      }

      keyboardButtons.push([
        Markup.button.callback('🔙 Назад', 'tasks')
      ]);

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      await ctx.reply(dailyMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

    } catch (error) {
      logger.error('Ошибка в showDailyBonuses', { userId: ctx.from.id, error: error.message });
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }

  // Получить ежедневный бонус
  async claimDailyBonus(ctx) {
    try {
      const userId = ctx.from.id;
      
      let user = await this.db.collection('users').findOne({ userId: userId });
      if (!user) {
        await ctx.reply('❌ Пользователь не найден.');
        return;
      }

      // Проверяем, можно ли получить бонус
      const lastDailyBonus = user.lastDailyBonus ? new Date(user.lastDailyBonus) : null;
      const now = new Date();
      const canClaimDaily = !lastDailyBonus || 
        (now.getTime() - lastDailyBonus.getTime()) >= 24 * 60 * 60 * 1000;

      if (!canClaimDaily) {
        await ctx.answerCbQuery('⏰ Бонус еще не доступен');
        return;
      }

      // Начисляем бонус
      const bonusMC = 50;
      const bonusStars = 25;

      await this.db.collection('users').updateOne(
        { userId: userId },
        {
          $inc: {
            magnumCoins: bonusMC,
            stars: bonusStars
          },
          $set: {
            lastDailyBonus: now
          }
        }
      );

      // Очищаем кэш пользователя
      cache.delete(`user_${userId}`);

      await ctx.answerCbQuery(`✅ Бонус получен! +${bonusMC} MC, +${bonusStars} Stars`);

      logger.userAction(userId, 'daily_bonus_claimed', {
        bonusMC,
        bonusStars
      });

      // Обновляем сообщение
      await this.showDailyBonuses(ctx);

    } catch (error) {
      logger.error('Ошибка в claimDailyBonus', { userId: ctx.from.id, error: error.message });
      await ctx.answerCbQuery('❌ Ошибка получения бонуса');
    }
  }
}

module.exports = TaskHandlers;

