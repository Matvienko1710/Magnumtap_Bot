const config = require('./config');

// ==================== ФОРМАТИРОВАНИЕ ====================

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

// Форматирование времени
function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds} сек`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} мин ${remainingSeconds} сек`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours} ч ${minutes} мин`;
  }
}

// Форматирование даты
function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ==================== РАСЧЕТЫ ====================

// Расчет комиссии
function calculateCommission(amount) {
  return (amount * config.EXCHANGE_COMMISSION) / 100;
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

// Расчет награды майнера
function calculateMinerReward() {
  return config.MINER.REWARD_PER_HOUR;
}

// Расчет награды фарма
function calculateFarmReward(user, baseReward = 1) {
  let reward = baseReward;
  
  // Бонусы за достижения
  if (user.titles) {
    if (user.titles.some(t => t.id === 'farmer')) {
      reward *= 1.1; // +10% за титул Фармер
    }
    if (user.titles.some(t => t.id === 'collector')) {
      reward *= 1.05; // +5% за титул Коллекционер
    }
  }
  
  // Бонус за серию дней
  if (user.dailyStreak >= 7) {
    reward *= 1.2; // +20% за недельную серию
  } else if (user.dailyStreak >= 3) {
    reward *= 1.1; // +10% за 3-дневную серию
  }
  
  return Math.max(reward, 0.01); // Минимум 0.01
}

// ==================== ПРОВЕРКИ ====================

// Проверка кулдауна
function checkCooldown(lastAction, cooldownSeconds) {
  const now = Date.now();
  const timeSinceLastAction = now - lastAction;
  return timeSinceLastAction >= cooldownSeconds * 1000;
}

// Валидация промокода
function validatePromocode(code) {
  if (!code || typeof code !== 'string') return false;
  
  // Проверяем длину (3-20 символов)
  if (code.length < 3 || code.length > 20) return false;
  
  // Проверяем формат (буквы, цифры, дефисы, подчеркивания)
  const validFormat = /^[A-Za-z0-9_-]+$/.test(code);
  if (!validFormat) return false;
  
  return true;
}

// Валидация суммы вывода
function validateWithdrawalAmount(amount) {
  if (typeof amount !== 'number' || amount <= 0) return false;
  if (amount < config.WITHDRAWAL.MIN_AMOUNT) return false;
  if (amount > config.WITHDRAWAL.MAX_AMOUNT) return false;
  return true;
}

// Валидация кошелька
function validateWallet(wallet, method) {
  if (!wallet || typeof wallet !== 'string') return false;
  
  switch (method) {
    case 'USDT':
      // Проверяем TRC20 адрес
      return /^T[A-Za-z1-9]{33}$/.test(wallet);
    case 'BTC':
      // Проверяем BTC адрес
      return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(wallet);
    case 'ETH':
      // Проверяем ETH адрес
      return /^0x[a-fA-F0-9]{40}$/.test(wallet);
    default:
      return wallet.length >= 10 && wallet.length <= 100;
  }
}

// ==================== ОБРАБОТКА ОШИБОК ====================

// Обработка ошибок
function handleError(error, context = '') {
  console.error(`❌ Ошибка ${context}:`, error);
  
  // Определяем тип ошибки
  if (error.code === 11000) {
    return {
      success: false,
      error: '❌ Запись уже существует'
    };
  }
  
  if (error.name === 'ValidationError') {
    return {
      success: false,
      error: '❌ Неверные данные'
    };
  }
  
  if (error.name === 'MongoError') {
    return {
      success: false,
      error: '❌ Ошибка базы данных'
    };
  }
  
  return {
    success: false,
    error: '❌ Произошла ошибка'
  };
}

// Проверка админа
function isAdmin(userId) {
  return config.ADMIN_IDS.includes(String(userId));
}

// ==================== ВРЕМЕННЫЕ ФУНКЦИИ ====================

// Получение текущего времени
function now() {
  return Date.now();
}

// Получение дня (для ежедневных бонусов)
function getCurrentDay() {
  return Math.floor(Date.now() / (24 * 60 * 60 * 1000));
}

// Проверка, новый ли день
function isNewDay(lastBonusDay) {
  const currentDay = getCurrentDay();
  return lastBonusDay !== currentDay;
}

// ==================== СТАТИСТИКА ====================

// Расчет процента выполнения
function calculateProgress(current, target) {
  if (target === 0) return 0;
  return Math.min((current / target) * 100, 100);
}

// Форматирование прогресса
function formatProgress(current, target) {
  const percentage = calculateProgress(current, target);
  const filled = Math.floor(percentage / 10);
  const empty = 10 - filled;
  
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${percentage.toFixed(1)}%`;
}

// ==================== ГЕНЕРАЦИЯ ====================

// Генерация случайного ID
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// Генерация промокода
function generatePromocode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ==================== МАССИВЫ И ОБЪЕКТЫ ====================

// Глубокое клонирование объекта
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}

// Фильтрация объекта
function filterObject(obj, allowedKeys) {
  const filtered = {};
  for (const key of allowedKeys) {
    if (obj.hasOwnProperty(key)) {
      filtered[key] = obj[key];
    }
  }
  return filtered;
}

// Сортировка массива объектов
function sortBy(array, key, order = 'asc') {
  return array.sort((a, b) => {
    let aVal = a[key];
    let bVal = b[key];
    
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    
    if (order === 'desc') {
      return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
    } else {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    }
  });
}

// ==================== СТРОКИ ====================

// Обрезка строки
function truncate(str, length = 100) {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

// Экранирование для Markdown
function escapeMarkdown(text) {
  return text
    .replace(/\_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\~/g, '\\~')
    .replace(/\`/g, '\\`')
    .replace(/\>/g, '\\>')
    .replace(/\#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/\-/g, '\\-')
    .replace(/\=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/\!/g, '\\!');
}

// ==================== МАТЕМАТИКА ====================

// Округление до определенного количества знаков
function roundTo(num, decimals = 2) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// Ограничение числа в диапазоне
function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

// Случайное число в диапазоне
function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ==================== ВАЛИДАЦИЯ ====================

// Проверка email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Проверка телефона
function isValidPhone(phone) {
  const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
  return phoneRegex.test(phone);
}

// Проверка URL
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ==================== ЭКСПОРТ ====================

module.exports = {
  // Форматирование
  formatNumber,
  formatTime,
  formatDate,
  
  // Расчеты
  calculateCommission,
  calculateExchangeRate,
  calculateMinerReward,
  calculateFarmReward,
  
  // Проверки
  checkCooldown,
  validatePromocode,
  validateWithdrawalAmount,
  validateWallet,
  
  // Обработка ошибок
  handleError,
  isAdmin,
  
  // Временные функции
  now,
  getCurrentDay,
  isNewDay,
  
  // Статистика
  calculateProgress,
  formatProgress,
  
  // Генерация
  generateId,
  generatePromocode,
  
  // Массивы и объекты
  deepClone,
  filterObject,
  sortBy,
  
  // Строки
  truncate,
  escapeMarkdown,
  
  // Математика
  roundTo,
  clamp,
  random,
  
  // Валидация
  isValidEmail,
  isValidPhone,
  isValidUrl
};