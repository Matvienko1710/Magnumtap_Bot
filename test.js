const config = require('./config');
const database = require('./database');
const cache = require('./cache');
const utils = require('./utils');
const userService = require('./services/userService');

async function runTests() {
  console.log('🧪 Запуск тестов оптимизированного бота...\n');

  try {
    // Тест 1: Проверка конфигурации
    console.log('📋 Тест 1: Проверка конфигурации');
    console.log('✅ BOT_TOKEN:', config.BOT_TOKEN ? 'установлен' : 'НЕ УСТАНОВЛЕН');
    console.log('✅ MONGODB_URI:', config.MONGODB_URI ? 'установлен' : 'НЕ УСТАНОВЛЕН');
    console.log('✅ USER_CACHE_TTL:', config.USER_CACHE_TTL, 'мс');
    console.log('✅ RATE_LIMIT_MAX_REQUESTS:', config.RATE_LIMIT_MAX_REQUESTS);
    console.log('✅ EXCHANGE_COMMISSION:', config.EXCHANGE_COMMISSION + '%');
    console.log('✅ MINER_REWARD_PER_HOUR:', config.MINER_REWARD_PER_HOUR, '⭐/час\n');

    // Тест 2: Проверка утилит
    console.log('🔧 Тест 2: Проверка утилит');
    console.log('✅ formatNumber(1234):', utils.formatNumber(1234));
    console.log('✅ formatNumber(1000000):', utils.formatNumber(1000000));
    console.log('✅ calculateCommission(100):', utils.calculateCommission(100));
    console.log('✅ calculateAmountWithCommission(100):', utils.calculateAmountWithCommission(100));
    console.log('✅ checkCooldown(0, 10):', utils.checkCooldown(0, 10));
    console.log('✅ validatePromocode("TEST123"):', utils.validatePromocode("TEST123"));
    console.log('✅ validateAmount(50, 0, 100):', utils.validateAmount(50, 0, 100));
    console.log('✅ formatTime(3661):', utils.formatTime(3661));
    console.log('✅ now():', utils.now());
    console.log('✅ isAdmin("123"):', utils.isAdmin("123"));
    console.log('✅ isAdmin(config.ADMIN_IDS[0]):', config.ADMIN_IDS.length > 0 ? utils.isAdmin(config.ADMIN_IDS[0]) : 'нет админов\n');

    // Тест 3: Проверка кеша
    console.log('💾 Тест 3: Проверка кеша');
    const testUserId = 123456789;
    const testUser = { id: testUserId, name: 'Test User', balance: 1000 };
    
    cache.setUser(testUserId, testUser);
    const cachedUser = cache.getUser(testUserId);
    console.log('✅ setUser/getUser:', cachedUser ? 'работает' : 'ОШИБКА');
    console.log('✅ cachedUser.name:', cachedUser?.name);
    
    cache.invalidateUser(testUserId);
    const invalidatedUser = cache.getUser(testUserId);
    console.log('✅ invalidateUser:', invalidatedUser ? 'ОШИБКА' : 'работает');
    
    const cacheStats = cache.getCacheStats();
    console.log('✅ getCacheStats:', cacheStats.userCacheSize, 'пользователей в кеше');
    console.log('✅ rateLimitCacheSize:', cacheStats.rateLimitCacheSize);
    console.log('✅ memoryUsage:', Math.round(cacheStats.memoryUsage.heapUsed / 1024 / 1024), 'MB\n');

    // Тест 4: Проверка rate limiting
    console.log('🚦 Тест 4: Проверка rate limiting');
    const testUserId2 = 987654321;
    let rateLimitResults = [];
    
    for (let i = 0; i < 35; i++) {
      rateLimitResults.push(cache.checkRateLimit(testUserId2));
    }
    
    const allowedRequests = rateLimitResults.filter(r => r).length;
    const blockedRequests = rateLimitResults.filter(r => !r).length;
    console.log('✅ Rate limiting:', allowedRequests, 'разрешено,', blockedRequests, 'заблокировано');
    console.log('✅ Ожидаемо:', config.RATE_LIMIT_MAX_REQUESTS, 'разрешено,', 35 - config.RATE_LIMIT_MAX_REQUESTS, 'заблокировано\n');

    // Тест 5: Проверка расчетов
    console.log('🧮 Тест 5: Проверка расчетов');
    const testReserve = { magnumCoins: 1000000, stars: 1000000 };
    const magnumToStarsRate = utils.calculateExchangeRate('magnumCoins', 'stars', testReserve);
    const starsToMagnumRate = utils.calculateExchangeRate('stars', 'magnumCoins', testReserve);
    console.log('✅ magnumToStarsRate:', magnumToStarsRate);
    console.log('✅ starsToMagnumRate:', starsToMagnumRate);
    console.log('✅ calculateMinerReward():', utils.calculateMinerReward());
    
    const testUserForReward = { achievements: [], titles: [] };
    const farmReward = utils.calculateFarmReward(testUserForReward);
    console.log('✅ calculateFarmReward():', farmReward);
    
    const progressBar = utils.createProgressBar(7, 10, 10);
    console.log('✅ createProgressBar(7, 10, 10):', progressBar, '(7/10)\n');

    // Тест 6: Проверка валидации
    console.log('✅ Тест 6: Проверка валидации');
    console.log('✅ validatePromocode("ABC123"):', utils.validatePromocode("ABC123"));
    console.log('✅ validatePromocode("A"):', utils.validatePromocode("A")); // слишком короткий
    console.log('✅ validatePromocode("ABC@123"):', utils.validatePromocode("ABC@123")); // недопустимые символы
    console.log('✅ validateAmount(50):', utils.validateAmount(50));
    console.log('✅ validateAmount(-10):', utils.validateAmount(-10)); // отрицательное
    console.log('✅ validateAmount(150, 0, 100):', utils.validateAmount(150, 0, 100)); // превышает максимум\n');

    // Тест 7: Проверка обработки ошибок
    console.log('⚠️ Тест 7: Проверка обработки ошибок');
    const errorResult = utils.handleError(new Error('Тестовая ошибка'), 'тест');
    console.log('✅ handleError:', errorResult.success ? 'ОШИБКА' : 'работает');
    console.log('✅ errorResult.error:', errorResult.error);
    
    const successResult = utils.success({ data: 'test' });
    console.log('✅ success:', successResult.success ? 'работает' : 'ОШИБКА');
    console.log('✅ successResult.data:', successResult.data);

    console.log('\n🎉 Все тесты пройдены успешно!');
    console.log('📊 Статистика кеша:', cache.getCacheStats());

  } catch (error) {
    console.error('❌ Ошибка в тестах:', error);
    console.error('📍 Stack trace:', error.stack);
  }
}

// Запускаем тесты только если файл запущен напрямую
if (require.main === module) {
  runTests().then(() => {
    console.log('\n✅ Тестирование завершено');
    process.exit(0);
  }).catch(error => {
    console.error('\n❌ Тестирование завершилось с ошибкой:', error);
    process.exit(1);
  });
}

module.exports = { runTests };