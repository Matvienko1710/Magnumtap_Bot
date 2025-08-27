const { MongoClient } = require('mongodb');

// Конфигурация подключения к MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';

async function resetDatabase() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔗 Подключение к MongoDB...');
    await client.connect();
    
    const db = client.db();
    console.log('✅ Подключение к базе данных установлено');
    
    // Получаем список всех коллекций
    const collections = await db.listCollections().toArray();
    console.log(`📋 Найдено коллекций: ${collections.length}`);
    
    // Удаляем все коллекции
    for (const collection of collections) {
      console.log(`🗑️ Удаление коллекции: ${collection.name}`);
      await db.collection(collection.name).drop();
    }
    
    console.log('✅ Все коллекции удалены');
    
    // Создаем все необходимые коллекции
    console.log('📋 Создание всех коллекций...');
    
    // 1. Коллекция пользователей (основная)
    await db.createCollection('users');
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('users').createIndex({ username: 1 });
    await db.collection('users').createIndex({ 'miner.active': 1 });
    await db.collection('users').createIndex({ lastSeen: -1 });
    await db.collection('users').createIndex({ referrerId: 1 });
    console.log('✅ Коллекция users создана с индексами');
    
    // 2. Коллекция резерва биржи
    await db.createCollection('reserve');
    await db.collection('reserve').createIndex({ currency: 1 }, { unique: true });
    await db.collection('reserve').insertOne({
      currency: 'main',
      magnumCoins: 1000000000,
      stars: 1000000,
      lastUpdate: new Date()
    });
    console.log('✅ Коллекция reserve создана и инициализирована');
    
    // 3. Коллекция промокодов
    await db.createCollection('promocodes');
    await db.collection('promocodes').createIndex({ code: 1 }, { unique: true });
    await db.collection('promocodes').createIndex({ isActive: 1 });
    await db.collection('promocodes').createIndex({ expiresAt: 1 });
    console.log('✅ Коллекция promocodes создана с индексами');
    
    // 4. Коллекция заявок на вывод
    await db.createCollection('withdrawalRequests');
    await db.collection('withdrawalRequests').createIndex({ userId: 1 });
    await db.collection('withdrawalRequests').createIndex({ status: 1 });
    await db.collection('withdrawalRequests').createIndex({ createdAt: -1 });
    console.log('✅ Коллекция withdrawalRequests создана с индексами');
    
    // 5. Коллекция тикетов поддержки
    await db.createCollection('supportTickets');
    await db.collection('supportTickets').createIndex({ userId: 1 });
    await db.collection('supportTickets').createIndex({ status: 1 });
    await db.collection('supportTickets').createIndex({ createdAt: -1 });
    await db.collection('supportTickets').createIndex({ id: 1 }, { unique: true });
    await db.collection('supportTickets').createIndex({ adminId: 1 });
    await db.collection('supportTickets').createIndex({ updatedAt: -1 });
    console.log('✅ Коллекция supportTickets создана с индексами');
    
    // 6. Коллекция проверок заданий
    await db.createCollection('taskChecks');
    await db.collection('taskChecks').createIndex({ userId: 1 });
    await db.collection('taskChecks').createIndex({ status: 1 });
    await db.collection('taskChecks').createIndex({ createdAt: -1 });
    console.log('✅ Коллекция taskChecks создана с индексами');
    
    // 7. Коллекция ежедневных заданий
    await db.createCollection('dailyTasks');
    await db.collection('dailyTasks').createIndex({ userId: 1 });
    await db.collection('dailyTasks').createIndex({ date: 1 });
    await db.collection('dailyTasks').createIndex({ completed: 1 });
    console.log('✅ Коллекция dailyTasks создана с индексами');
    
    // 8. Коллекция истории обменов
    await db.createCollection('exchangeHistory');
    await db.collection('exchangeHistory').createIndex({ userId: 1 });
    await db.collection('exchangeHistory').createIndex({ timestamp: -1 });
    console.log('✅ Коллекция exchangeHistory создана с индексами');
    
    // 9. Коллекция пользователей WebApp
    await db.createCollection('webappUsers');
    await db.collection('webappUsers').createIndex({ userId: 1 }, { unique: true });
    await db.collection('webappUsers').createIndex({ updatedAt: -1 });
    console.log('✅ Коллекция webappUsers создана с индексами');
    
    // 10. Коллекция статистики майнинга
    await db.createCollection('miningSeasonStats');
    console.log('✅ Коллекция miningSeasonStats создана');
    
    // 11. Коллекция наград майнера
    await db.createCollection('minerRewards');
    console.log('✅ Коллекция minerRewards создана');
    
    // 12. Коллекция спонсорских заданий
    await db.createCollection('sponsorTasks');
    console.log('✅ Коллекция sponsorTasks создана');
    
    // 13. Коллекция статистики пользователей
    await db.createCollection('userStats');
    console.log('✅ Коллекция userStats создана');
    
    // 14. Коллекция логов администратора
    await db.createCollection('adminLogs');
    console.log('✅ Коллекция adminLogs создана');
    
    // 15. Коллекция логов ошибок
    await db.createCollection('errorLogs');
    console.log('✅ Коллекция errorLogs создана');
    
    // 16. Коллекция конфигурации
    await db.createCollection('config');
    console.log('✅ Коллекция config создана');
    
    // 17. Коллекция статистики бота
    await db.createCollection('botStats');
    console.log('✅ Коллекция botStats создана');
    
    // 18. Коллекция транзакций
    await db.createCollection('transactions');
    console.log('✅ Коллекция transactions создана');
    
    // 19. Коллекция достижений
    await db.createCollection('achievements');
    console.log('✅ Коллекция achievements создана');
    
    // 20. Коллекция рангов
    await db.createCollection('ranks');
    console.log('✅ Коллекция ranks создана');
    
    // 21. Коллекция титулов
    await db.createCollection('titles');
    console.log('✅ Коллекция titles создана');
    
    // 22. Коллекция уведомлений
    await db.createCollection('notifications');
    console.log('✅ Коллекция notifications создана');
    
    // 23. Коллекция сезонов майнинга
    await db.createCollection('miningSeasons');
    console.log('✅ Коллекция miningSeasons создана');
    
    // 24. Коллекция рейтингов майнинга
    await db.createCollection('miningLeaderboards');
    console.log('✅ Коллекция miningLeaderboards создана');
    
    // 25. Коллекция магазина майнеров
    await db.createCollection('minerShop');
    console.log('✅ Коллекция minerShop создана');
    
    // 26. Коллекция покупок майнеров
    await db.createCollection('minerPurchases');
    console.log('✅ Коллекция minerPurchases создана');
    
    // 27. Коллекция улучшений майнеров
    await db.createCollection('minerUpgrades');
    console.log('✅ Коллекция minerUpgrades создана');
    
    // 28. Коллекция наград сезонов
    await db.createCollection('seasonRewards');
    console.log('✅ Коллекция seasonRewards создана');
    
    // 29. Коллекция истории майнинга
    await db.createCollection('miningHistory');
    console.log('✅ Коллекция miningHistory создана');
    
    // 30. Коллекция настроек пользователей
    await db.createCollection('userSettings');
    console.log('✅ Коллекция userSettings создана');
    
    // 31. Коллекция кеша
    await db.createCollection('cache');
    console.log('✅ Коллекция cache создана');
    
    // 32. Коллекция сессий
    await db.createCollection('sessions');
    console.log('✅ Коллекция sessions создана');
    
    // 33. Коллекция API ключей
    await db.createCollection('apiKeys');
    console.log('✅ Коллекция apiKeys создана');
    
    // 34. Коллекция вебхуков
    await db.createCollection('webhooks');
    console.log('✅ Коллекция webhooks создана');
    
    // 35. Коллекция аналитики
    await db.createCollection('analytics');
    console.log('✅ Коллекция analytics создана');
    
    console.log('🎉 Все коллекции успешно созданы!');
    console.log('📊 Всего создано коллекций: 35');
    
  } catch (error) {
    console.error('❌ Ошибка при сбросе базы данных:', error);
  } finally {
    await client.close();
    console.log('🔌 Соединение с базой данных закрыто');
  }
}

// Запускаем сброс базы данных
resetDatabase();
