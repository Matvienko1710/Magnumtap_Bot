const fs = require('fs');
const path = require('path');
const config = require('../config/constants');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '..', 'logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  formatMessage(level, message, context = {}) {
    const timestamp = this.getTimestamp();
    const contextStr = Object.keys(context).length > 0 
      ? ` | ${JSON.stringify(context)}` 
      : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  writeToFile(level, message, context = {}) {
    if (!config.LOG_TO_FILE) return;

    const logFile = path.join(this.logDir, `${level}.log`);
    const formattedMessage = this.formatMessage(level, message, context);
    
    try {
      fs.appendFileSync(logFile, formattedMessage + '\n');
    } catch (error) {
      console.error('Ошибка записи в лог файл:', error);
    }
  }

  log(level, message, context = {}) {
    const formattedMessage = this.formatMessage(level, message, context);
    
    // Вывод в консоль
    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'info':
        console.log(formattedMessage);
        break;
      case 'debug':
        if (config.LOG_LEVEL === 'debug') {
          console.log(formattedMessage);
        }
        break;
    }

    // Запись в файл
    this.writeToFile(level, message, context);
  }

  error(message, context = {}) {
    this.log('error', message, context);
  }

  warn(message, context = {}) {
    this.log('warn', message, context);
  }

  info(message, context = {}) {
    this.log('info', message, context);
  }

  debug(message, context = {}) {
    this.log('debug', message, context);
  }

  // Специальные методы для логирования действий пользователей
  userAction(userId, action, details = {}) {
    this.info(`Пользователь ${userId} выполнил действие: ${action}`, {
      userId,
      action,
      ...details
    });
  }

  // Специальные методы для логирования ошибок API
  apiError(service, error, context = {}) {
    this.error(`Ошибка API ${service}`, {
      service,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
      ...context
    });
  }

  // Специальные методы для логирования майнинга
  miningReward(userId, rewardMC, rewardStars, totalSpeed) {
    this.info(`Награда майнинга для пользователя ${userId}`, {
      userId,
      rewardMC,
      rewardStars,
      totalSpeed
    });
  }
}

module.exports = new Logger();

