const config = require('../config/constants');
const logger = require('../utils/logger');

// Middleware для проверки прав администратора
function adminCheck(ctx, next) {
  const userId = ctx.from?.id || ctx.message?.from?.id;
  
  if (!userId) {
    logger.warn('Не удалось получить ID пользователя в adminCheck');
    return ctx.reply('❌ Ошибка авторизации');
  }

  if (!config.ADMIN_IDS.includes(userId)) {
    logger.warn('Попытка доступа к админской функции', { userId });
    
    // Для callback query отвечаем через answerCbQuery
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('🚧 Функция в разработке');
    }
    
    // Для обычных сообщений отвечаем через reply
    return ctx.reply('🚧 Функция в разработке');
  }

  logger.debug('Админский доступ разрешен', { userId });
  return next();
}

// Middleware для логирования действий пользователей
function userActionLogger(ctx, next) {
  const userId = ctx.from?.id || ctx.message?.from?.id;
  const action = ctx.callbackQuery?.data || ctx.message?.text || 'unknown';
  
  if (userId) {
    logger.userAction(userId, action, {
      isAdmin: config.ADMIN_IDS.includes(userId),
      chatType: ctx.chat?.type,
      messageType: ctx.message ? 'message' : 'callback'
    });
  }

  return next();
}

// Middleware для обработки ошибок
function errorHandler(error, ctx) {
  const userId = ctx.from?.id || ctx.message?.from?.id;
  
  logger.error('Ошибка в обработчике', {
    userId,
    error: error.message,
    stack: error.stack,
    action: ctx.callbackQuery?.data || ctx.message?.text
  });

  // Отправляем пользователю сообщение об ошибке
  const errorMessage = '❌ Произошла ошибка. Попробуйте позже.';
  
  if (ctx.callbackQuery) {
    return ctx.answerCbQuery(errorMessage);
  }
  
  return ctx.reply(errorMessage);
}

module.exports = {
  adminCheck,
  userActionLogger,
  errorHandler
};

