const config = require('../config/constants');
const logger = require('./logger');

class MetricsService {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        byCommand: new Map(),
        byUser: new Map()
      },
      performance: {
        averageResponseTime: 0,
        totalResponseTime: 0,
        slowestRequests: [],
        memoryUsage: []
      },
      mining: {
        totalRewards: { magnumCoins: 0, stars: 0 },
        activeUsers: 0,
        totalClicks: 0,
        upgrades: 0
      },
      richads: {
        offersRequested: 0,
        offersCompleted: 0,
        totalRewards: 0,
        errors: 0
      },
      errors: {
        total: 0,
        byType: new Map(),
        recent: []
      },
      users: {
        total: 0,
        active: 0,
        new: 0,
        byDay: new Map()
      },
      system: {
        uptime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        databaseConnections: 0
      }
    };

    this.startMonitoring();
  }

  // Отслеживание запросов
  trackRequest(command, userId, duration, success = true) {
    this.metrics.requests.total++;
    
    if (success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }

    // Обновление времени ответа
    this.metrics.performance.totalResponseTime += duration;
    this.metrics.performance.averageResponseTime = 
      this.metrics.performance.totalResponseTime / this.metrics.requests.total;

    // Отслеживание по командам
    if (!this.metrics.requests.byCommand.has(command)) {
      this.metrics.requests.byCommand.set(command, { total: 0, successful: 0, failed: 0 });
    }
    const cmdStats = this.metrics.requests.byCommand.get(command);
    cmdStats.total++;
    if (success) cmdStats.successful++;
    else cmdStats.failed++;

    // Отслеживание по пользователям
    if (userId) {
      if (!this.metrics.requests.byUser.has(userId)) {
        this.metrics.requests.byUser.set(userId, { total: 0, lastActivity: Date.now() });
      }
      const userStats = this.metrics.requests.byUser.get(userId);
      userStats.total++;
      userStats.lastActivity = Date.now();
    }

    // Отслеживание медленных запросов
    if (duration > 1000) { // Больше 1 секунды
      this.metrics.performance.slowestRequests.push({
        command,
        userId,
        duration,
        timestamp: Date.now()
      });
      
      // Оставляем только последние 10 медленных запросов
      if (this.metrics.performance.slowestRequests.length > 10) {
        this.metrics.performance.slowestRequests.shift();
      }
    }
  }

  // Отслеживание майнинга
  trackMining(userId, rewards, type = 'passive') {
    if (rewards.magnumCoins) {
      this.metrics.mining.totalRewards.magnumCoins += rewards.magnumCoins;
    }
    if (rewards.stars) {
      this.metrics.mining.totalRewards.stars += rewards.stars;
    }

    if (type === 'active') {
      this.metrics.mining.totalClicks++;
    }

    logger.info(`Майнинг отслежен: пользователь ${userId}, награды:`, rewards);
  }

  // Отслеживание апгрейдов
  trackUpgrade(userId, minerType, cost) {
    this.metrics.mining.upgrades++;
    logger.info(`Апгрейд отслежен: пользователь ${userId}, тип: ${minerType}, стоимость: ${cost}`);
  }

  // Отслеживание RichAds
  trackRichAds(action, data = {}) {
    switch (action) {
      case 'offer_requested':
        this.metrics.richads.offersRequested++;
        break;
      case 'offer_completed':
        this.metrics.richads.offersCompleted++;
        if (data.reward) {
          this.metrics.richads.totalRewards += data.reward;
        }
        break;
      case 'error':
        this.metrics.richads.errors++;
        break;
    }
  }

  // Отслеживание ошибок
  trackError(error, context = {}) {
    this.metrics.errors.total++;
    
    const errorType = error.name || 'Unknown';
    if (!this.metrics.errors.byType.has(errorType)) {
      this.metrics.errors.byType.set(errorType, 0);
    }
    this.metrics.errors.byType.set(errorType, this.metrics.errors.byType.get(errorType) + 1);

    // Добавляем в недавние ошибки
    this.metrics.errors.recent.push({
      type: errorType,
      message: error.message,
      stack: error.stack,
      context,
      timestamp: Date.now()
    });

    // Оставляем только последние 50 ошибок
    if (this.metrics.errors.recent.length > 50) {
      this.metrics.errors.recent.shift();
    }
  }

  // Отслеживание пользователей
  trackUser(userId, action) {
    switch (action) {
      case 'new':
        this.metrics.users.new++;
        this.metrics.users.total++;
        break;
      case 'active':
        this.metrics.users.active++;
        break;
    }

    // Отслеживание по дням
    const today = new Date().toDateString();
    if (!this.metrics.users.byDay.has(today)) {
      this.metrics.users.byDay.set(today, { new: 0, active: 0 });
    }
    const dayStats = this.metrics.users.byDay.get(today);
    if (action === 'new') dayStats.new++;
    if (action === 'active') dayStats.active++;
  }

  // Обновление системных метрик
  updateSystemMetrics() {
    this.metrics.system.uptime = Date.now() - this.metrics.startTime;
    this.metrics.system.memoryUsage = process.memoryUsage();
    
    // Очистка старых данных пользователей (неактивных более 24 часов)
    const now = Date.now();
    for (const [userId, stats] of this.metrics.requests.byUser.entries()) {
      if (now - stats.lastActivity > 24 * 60 * 60 * 1000) {
        this.metrics.requests.byUser.delete(userId);
      }
    }

    // Очистка старых дней (более 30 дней)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (const [day] of this.metrics.users.byDay.entries()) {
      if (new Date(day) < thirtyDaysAgo) {
        this.metrics.users.byDay.delete(day);
      }
    }
  }

  // Получение метрик
  getMetrics() {
    this.updateSystemMetrics();
    return {
      ...this.metrics,
      requests: {
        ...this.metrics.requests,
        byCommand: Object.fromEntries(this.metrics.requests.byCommand),
        byUser: Object.fromEntries(this.metrics.requests.byUser)
      },
      errors: {
        ...this.metrics.errors,
        byType: Object.fromEntries(this.metrics.errors.byType)
      },
      users: {
        ...this.metrics.users,
        byDay: Object.fromEntries(this.metrics.users.byDay)
      }
    };
  }

  // Получение кратких метрик
  getSummary() {
    this.updateSystemMetrics();
    return {
      uptime: Math.floor(this.metrics.system.uptime / 1000 / 60), // минуты
      totalRequests: this.metrics.requests.total,
      successRate: this.metrics.requests.total > 0 ? 
        (this.metrics.requests.successful / this.metrics.requests.total * 100).toFixed(2) : 0,
      averageResponseTime: this.metrics.performance.averageResponseTime.toFixed(2),
      totalErrors: this.metrics.errors.total,
      activeUsers: this.metrics.requests.byUser.size,
      totalMiningRewards: this.metrics.mining.totalRewards,
      richadsStats: {
        requested: this.metrics.richads.offersRequested,
        completed: this.metrics.richads.offersCompleted,
        totalRewards: this.metrics.richads.totalRewards
      },
      memoryUsage: {
        heapUsed: Math.round(this.metrics.system.memoryUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(this.metrics.system.memoryUsage.heapTotal / 1024 / 1024) // MB
      }
    };
  }

  // Получение топ команд
  getTopCommands(limit = 10) {
    const commands = Array.from(this.metrics.requests.byCommand.entries())
      .map(([command, stats]) => ({
        command,
        total: stats.total,
        successRate: (stats.successful / stats.total * 100).toFixed(2)
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);

    return commands;
  }

  // Получение топ пользователей
  getTopUsers(limit = 10) {
    const users = Array.from(this.metrics.requests.byUser.entries())
      .map(([userId, stats]) => ({
        userId,
        total: stats.total,
        lastActivity: stats.lastActivity
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);

    return users;
  }

  // Получение последних ошибок
  getRecentErrors(limit = 10) {
    return this.metrics.errors.recent
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Сброс метрик
  reset() {
    this.metrics = {
      startTime: Date.now(),
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        byCommand: new Map(),
        byUser: new Map()
      },
      performance: {
        averageResponseTime: 0,
        totalResponseTime: 0,
        slowestRequests: [],
        memoryUsage: []
      },
      mining: {
        totalRewards: { magnumCoins: 0, stars: 0 },
        activeUsers: 0,
        totalClicks: 0,
        upgrades: 0
      },
      richads: {
        offersRequested: 0,
        offersCompleted: 0,
        totalRewards: 0,
        errors: 0
      },
      errors: {
        total: 0,
        byType: new Map(),
        recent: []
      },
      users: {
        total: 0,
        active: 0,
        new: 0,
        byDay: new Map()
      },
      system: {
        uptime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        databaseConnections: 0
      }
    };

    logger.info('Метрики сброшены');
  }

  // Запуск мониторинга
  startMonitoring() {
    // Обновление системных метрик каждую минуту
    setInterval(() => {
      this.updateSystemMetrics();
    }, 60000);

    // Логирование метрик каждые 5 минут
    setInterval(() => {
      const summary = this.getSummary();
      logger.info('Метрики системы:', summary);
    }, 300000);

    // Проверка на аномалии каждые 2 минуты
    setInterval(() => {
      this.checkAnomalies();
    }, 120000);

    logger.info('Мониторинг метрик запущен');
  }

  // Проверка аномалий
  checkAnomalies() {
    const summary = this.getSummary();
    
    // Проверка высокого потребления памяти
    if (summary.memoryUsage.heapUsed > 500) { // Больше 500MB
      logger.warn('Высокое потребление памяти:', summary.memoryUsage);
    }

    // Проверка низкого процента успешных запросов
    if (summary.successRate < 90) {
      logger.warn('Низкий процент успешных запросов:', summary.successRate + '%');
    }

    // Проверка большого количества ошибок
    if (summary.totalErrors > 100) {
      logger.warn('Большое количество ошибок:', summary.totalErrors);
    }

    // Проверка медленных ответов
    if (summary.averageResponseTime > 1000) {
      logger.warn('Медленные ответы:', summary.averageResponseTime + 'ms');
    }
  }
}

// Создаем глобальный экземпляр
const metricsService = new MetricsService();

module.exports = metricsService;

