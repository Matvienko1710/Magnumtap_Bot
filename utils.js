const config = require('./config');

// Форматирование чисел
function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  } else {
    return num.toFixed(2);
  }
}

function formatLargeNumber(num) {
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

// Расчеты комиссии
function calculateCommission(amount) {
  return amount * (config.EXCHANGE_COMMISSION / 100);
}

function calculateAmountWithCommission(amount) {
  return amount * (1 - config.EXCHANGE_COMMISSION / 100);
}

// Расчет курса обмена
function calculateExchangeRate(fromCurrency, toCurrency, reserve) {
  if (fromCurrency === 'magnumCoins' && toCurrency === 'stars') {
    return reserve.stars / reserve.magnumCoins;
  } else if (fromCurrency === 'stars' && toCurrency === 'magnumCoins') {
    return reserve.magnumCoins / reserve.stars;
  }
  return 1;
}

// Расчет наград
function calculateMinerReward() {
  return config.MINER_REWARD_PER_HOUR;
}

function calculateFarmReward(user, baseReward = 1) {
  let reward = baseReward;
  
  // Множители от достижений
  if (user.achievements) {
    const farmBoost = user.achievements.find(a => a.type === 'farm_boost');
    if (farmBoost) {
      reward *= (1 + farmBoost.level * 0.1); // +10% за каждый уровень
    }
  }
  
  // Множители от титулов
  if (user.titles && user.titles.length > 0) {
    const farmTitle = user.titles.find(t => t.type === 'farm_boost');
    if (farmTitle) {
      reward *= (1 + farmTitle.boost);
    }
  }
  
  return Math.max(reward, 0.1); // Минимум 0.1 звезды
}

// Создание прогресс-бара
function createProgressBar(current, total, length = 10) {
  const progress = Math.min(current / total, 1);
  const filled = Math.round(progress * length);
  const empty = length - filled;
  
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// Проверка кулдауна
function checkCooldown(lastAction, cooldownSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const timeSinceLastAction = now - lastAction;
  return {
    canAct: timeSinceLastAction >= cooldownSeconds,
    remaining: Math.max(0, cooldownSeconds - timeSinceLastAction)
  };
}

// Валидация промокода
function validatePromocode(code) {
  if (!code || typeof code !== 'string') return false;
  
  // Проверяем длину (3-20 символов)
  if (code.length < 3 || code.length > 20) return false;
  
  // Проверяем формат (только буквы, цифры и дефисы)
  if (!/^[A-Z0-9-]+$/i.test(code)) return false;
  
  return true;
}

// Валидация суммы
function validateAmount(amount, min = 0, max = Infinity) {
  const num = parseFloat(amount);
  return !isNaN(num) && num >= min && num <= max;
}

// Генерация случайного ID
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// Форматирование времени
function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds}с`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}м ${secs}с`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}ч ${minutes}м`;
  }
}

// Проверка админа
function isAdmin(userId) {
  return config.ADMIN_IDS.includes(String(userId));
}

// Получение текущего времени
function now() {
  return Math.floor(Date.now() / 1000);
}

// Обработка ошибок
function handleError(error, context = '') {
  console.error(`❌ Ошибка ${context}:`, error);
  
  // Логируем детали ошибки
  if (error.stack) {
    console.error('📍 Stack trace:', error.stack);
  }
  
  return {
    success: false,
    error: error.message || 'Неизвестная ошибка',
    context
  };
}

// Успешный результат
function success(data = null) {
  return {
    success: true,
    data
  };
}

module.exports = {
  formatNumber,
  formatLargeNumber,
  calculateCommission,
  calculateAmountWithCommission,
  calculateExchangeRate,
  calculateMinerReward,
  calculateFarmReward,
  createProgressBar,
  checkCooldown,
  validatePromocode,
  validateAmount,
  generateId,
  formatTime,
  isAdmin,
  now,
  handleError,
  success
};