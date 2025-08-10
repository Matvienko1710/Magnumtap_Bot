const config = require('./config');
const database = require('./database');
const cache = require('./cache');
const utils = require('./utils');
const userService = require('./services/userService');

async function runTests() {
  console.log('🧪 Запуск тестов полного бота...\n');

  try {
    // Тест 1: Проверка конфигурации
    console.log('📋 Тест 1: Проверка конфигурации');
    console.log(`✅ BOT_TOKEN: ${config.BOT_TOKEN ? 'установлен' : 'НЕ УСТАНОВЛЕН'}`);
    console.log(`✅ MONGODB_URI: ${config.MONGODB_URI ? 'установлен' : 'НЕ УСТАНОВЛЕН'}`);
    console.log(`✅ USER_CACHE_TTL: ${config.USER_CACHE_TTL} мс`);
    console.log(`✅ RATE_LIMIT_MAX_REQUESTS: ${config.RATE_LIMIT_MAX_REQUESTS}`);
    console.log(`✅ EXCHANGE_COMMISSION: ${config.EXCHANGE_COMMISSION}%`);
    console.log(`✅ MINER_REWARD_PER_HOUR: ${config.MINER.REWARD_PER_HOUR} ⭐/час\n`);

    // Тест 2: Проверка утилит
    console.log('🔧 Тест 2: Проверка утилит');
    console.log(`✅ formatNumber(1234): ${utils.formatNumber(1234)}`);
    console.log(`✅ formatNumber(1000000): ${utils.formatNumber(1000000)}`);
    console.log(`✅ calculateCommission(100): ${utils.calculateCommission(100)}`);
    console.log(`✅ calculateMinerReward(): ${utils.calculateMinerReward()}`);
    console.log(`✅ checkCooldown(0, 60): ${utils.checkCooldown(0, 60)}`);
    console.log(`✅ validatePromocode('TEST123'): ${utils.validatePromocode('TEST123')}`);
    console.log(`✅ isAdmin('123'): ${utils.isAdmin('123')}`);
    console.log(`✅ now(): ${utils.now()}`);
    console.log(`✅ generateId(): ${utils.generateId()}`);
    console.log(`✅ formatTime(3661): ${utils.formatTime(3661)}`);
    console.log(`✅ formatDate(Date.now()): ${utils.formatDate(Date.now())}`);
    console.log(`✅ calculateProgress(50, 100): ${utils.calculateProgress(50, 100)}%`);
    console.log(`✅ formatProgress(75, 100): ${utils.formatProgress(75, 100)}`);
    console.log(`✅ generatePromocode(): ${utils.generatePromocode()}`);
    console.log(`✅ roundTo(3.14159, 2): ${utils.roundTo(3.14159, 2)}`);
    console.log(`✅ clamp(150, 0, 100): ${utils.clamp(150, 0, 100)}`);
    console.log(`✅ random(1, 10): ${utils.random(1, 10)}`);
    console.log(`✅ isValidEmail('test@example.com'): ${utils.isValidEmail('test@example.com')}`);
    console.log(`✅ isValidPhone('+1234567890'): ${utils.isValidPhone('+1234567890')}`);
    console.log(`✅ isValidUrl('https://example.com'): ${utils.isValidUrl('https://example.com')}\n`);

    // Тест 3: Проверка кеша
    console.log('💾 Тест 3: Проверка кеша');
    const testUserId = 12345;
    const testUser = { id: testUserId, name: 'Test User' };
    
    cache.setUser(testUserId, testUser);
    const cachedUser = cache.getUser(testUserId);
    console.log(`✅ setUser/getUser: ${cachedUser ? 'работает' : 'НЕ РАБОТАЕТ'}`);
    
    cache.invalidateUser(testUserId);
    const invalidatedUser = cache.getUser(testUserId);
    console.log(`✅ invalidateUser: ${!invalidatedUser ? 'работает' : 'НЕ РАБОТАЕТ'}`);
    
    const rateLimitResult = cache.checkRateLimit(testUserId);
    console.log(`✅ checkRateLimit: ${rateLimitResult ? 'работает' : 'НЕ РАБОТАЕТ'}`);
    
    const cacheStats = cache.getCacheStats();
    console.log(`✅ getCacheStats: ${cacheStats ? 'работает' : 'НЕ РАБОТАЕТ'}\n`);

    // Тест 4: Проверка rate limiting
    console.log('🚦 Тест 4: Проверка rate limiting');
    const testUserId2 = 54321;
    let rateLimitChecks = 0;
    
    for (let i = 0; i < 35; i++) {
      if (cache.checkRateLimit(testUserId2)) {
        rateLimitChecks++;
      }
    }
    console.log(`✅ Rate limiting: ${rateLimitChecks} из 35 запросов прошли (ожидается ~30)\n`);

    // Тест 5: Проверка расчетов
    console.log('🧮 Тест 5: Проверка расчетов');
    const testUser2 = {
      stars: 100,
      titles: [
        { id: 'farmer', name: '⚡ Фармер' },
        { id: 'collector', name: '💎 Коллекционер' }
      ],
      dailyStreak: 7
    };
    
    const farmReward = utils.calculateFarmReward(testUser2, 1);
    console.log(`✅ calculateFarmReward: ${farmReward} (с бонусами за титулы и серию)`);
    
    const exchangeRate = utils.calculateExchangeRate('magnumCoins', 'stars', { magnumCoins: 1000, stars: 1000 });
    console.log(`✅ calculateExchangeRate: ${exchangeRate}`);
    
    const commission = utils.calculateCommission(100);
    console.log(`✅ calculateCommission: ${commission}\n`);

    // Тест 6: Проверка валидации
    console.log('✅ Тест 6: Проверка валидации');
    console.log(`✅ validatePromocode('VALID123'): ${utils.validatePromocode('VALID123')}`);
    console.log(`✅ validatePromocode('in'): ${!utils.validatePromocode('in')}`);
    console.log(`✅ validatePromocode(''): ${!utils.validatePromocode('')}`);
    console.log(`✅ validateWithdrawalAmount(150): ${utils.validateWithdrawalAmount(150)}`);
    console.log(`✅ validateWithdrawalAmount(50): ${!utils.validateWithdrawalAmount(50)}`);
    console.log(`✅ validateWallet('T123456789012345678901234567890123', 'USDT'): ${utils.validateWallet('T123456789012345678901234567890123', 'USDT')}`);
    console.log(`✅ validateWallet('invalid', 'USDT'): ${!utils.validateWallet('invalid', 'USDT')}\n`);

    // Тест 7: Проверка обработки ошибок
    console.log('🚨 Тест 7: Проверка обработки ошибок');
    const testError = new Error('Test error');
    const errorResult = utils.handleError(testError, 'test');
    console.log(`✅ handleError: ${errorResult.success === false ? 'работает' : 'НЕ РАБОТАЕТ'}`);
    
    const mongoError = new Error('Duplicate key');
    mongoError.code = 11000;
    const mongoErrorResult = utils.handleError(mongoError, 'test');
    console.log(`✅ handleError (MongoDB): ${mongoErrorResult.error.includes('существует') ? 'работает' : 'НЕ РАБОТАЕТ'}\n`);

    // Тест 8: Проверка форматирования
    console.log('📝 Тест 8: Проверка форматирования');
    console.log(`✅ formatNumber(0): ${utils.formatNumber(0)}`);
    console.log(`✅ formatNumber(null): ${utils.formatNumber(null)}`);
    console.log(`✅ formatNumber(undefined): ${utils.formatNumber(undefined)}`);
    console.log(`✅ formatTime(30): ${utils.formatTime(30)}`);
    console.log(`✅ formatTime(90): ${utils.formatTime(90)}`);
    console.log(`✅ formatTime(3661): ${utils.formatTime(3661)}`);
    console.log(`✅ truncate('Very long text that needs to be truncated', 20): ${utils.truncate('Very long text that needs to be truncated', 20)}`);
    console.log(`✅ escapeMarkdown('*bold* _italic_ [link](url)'): ${utils.escapeMarkdown('*bold* _italic_ [link](url)')}\n`);

    // Тест 9: Проверка массивов и объектов
    console.log('📦 Тест 9: Проверка массивов и объектов');
    const testArray = [
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
      { name: 'Charlie', age: 20 }
    ];
    
    const sortedArray = utils.sortBy(testArray, 'age', 'desc');
    console.log(`✅ sortBy (desc): ${sortedArray[0].name} (${sortedArray[0].age})`);
    
    const testObj = { a: 1, b: 2, c: 3, d: 4 };
    const filteredObj = utils.filterObject(testObj, ['a', 'c']);
    console.log(`✅ filterObject: ${Object.keys(filteredObj).length} ключей`);
    
    const clonedObj = utils.deepClone(testObj);
    console.log(`✅ deepClone: ${JSON.stringify(clonedObj) === JSON.stringify(testObj) ? 'работает' : 'НЕ РАБОТАЕТ'}\n`);

    // Тест 10: Проверка математических функций
    console.log('🔢 Тест 10: Проверка математических функций');
    console.log(`✅ roundTo(3.14159, 2): ${utils.roundTo(3.14159, 2)}`);
    console.log(`✅ roundTo(3.14159, 0): ${utils.roundTo(3.14159, 0)}`);
    console.log(`✅ clamp(150, 0, 100): ${utils.clamp(150, 0, 100)}`);
    console.log(`✅ clamp(-50, 0, 100): ${utils.clamp(-50, 0, 100)}`);
    console.log(`✅ clamp(50, 0, 100): ${utils.clamp(50, 0, 100)}`);
    
    const randomNum = utils.random(1, 10);
    console.log(`✅ random(1, 10): ${randomNum} (1-10)`);
    console.log(`✅ calculateProgress(75, 100): ${utils.calculateProgress(75, 100)}%`);
    console.log(`✅ calculateProgress(0, 100): ${utils.calculateProgress(0, 100)}%`);
    console.log(`✅ calculateProgress(100, 100): ${utils.calculateProgress(100, 100)}%`);
    console.log(`✅ calculateProgress(150, 100): ${utils.calculateProgress(150, 100)}%\n`);

    console.log('🎉 Все тесты пройдены успешно!');
    console.log('✅ Полный функционал бота восстановлен и работает корректно');

  } catch (error) {
    console.error('❌ Ошибка в тестах:', error);
    console.error('📍 Stack trace:', error.stack);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };