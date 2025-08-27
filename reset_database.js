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
    
    // Создаем базовые коллекции
    console.log('📋 Создание базовых коллекций...');
    
    // Коллекция пользователей
    await db.createCollection('users');
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    console.log('✅ Коллекция users создана');
    
    // Коллекция резерва
    await db.createCollection('reserve');
    await db.collection('reserve').insertOne({
      magnumCoins: 1000000000,
      stars: 1000000,
      lastUpdate: new Date()
    });
    console.log('✅ Коллекция reserve создана и инициализирована');
    
    // Коллекция промокодов
    await db.createCollection('promocodes');
    console.log('✅ Коллекция promocodes создана');
    
    // Коллекция заявок на вывод
    await db.createCollection('withdrawalRequests');
    console.log('✅ Коллекция withdrawalRequests создана');
    
    // Коллекция тикетов поддержки
    await db.createCollection('supportTickets');
    console.log('✅ Коллекция supportTickets создана');
    
    // Коллекция статистики
    await db.createCollection('botStats');
    console.log('✅ Коллекция botStats создана');
    
    // Коллекция транзакций
    await db.createCollection('transactions');
    console.log('✅ Коллекция transactions создана');
    
    // Коллекция достижений
    await db.createCollection('achievements');
    console.log('✅ Коллекция achievements создана');
    
    // Коллекция рангов
    await db.createCollection('ranks');
    console.log('✅ Коллекция ranks создана');
    
    // Коллекция титулов
    await db.createCollection('titles');
    console.log('✅ Коллекция titles создана');
    
    // Коллекция уведомлений
    await db.createCollection('notifications');
    console.log('✅ Коллекция notifications создана');
    
    // Коллекция истории обменов
    await db.createCollection('exchangeHistory');
    console.log('✅ Коллекция exchangeHistory создана');
    
    // Коллекция ежедневных заданий
    await db.createCollection('dailyTasks');
    console.log('✅ Коллекция dailyTasks создана');
    
    // Коллекция пользователей WebApp
    await db.createCollection('webappUsers');
    await db.collection('webappUsers').createIndex({ userId: 1 }, { unique: true });
    console.log('✅ Коллекция webappUsers создана');
    
    // Коллекция статистики майнинга
    await db.createCollection('miningSeasonStats');
    console.log('✅ Коллекция miningSeasonStats создана');
    
    // Коллекция наград майнера
    await db.createCollection('minerRewards');
    console.log('✅ Коллекция minerRewards создана');
    
    // Коллекция проверок заданий
    await db.createCollection('taskChecks');
    console.log('✅ Коллекция taskChecks создана');
    
    // Коллекция спонсорских заданий
    await db.createCollection('sponsorTasks');
    console.log('✅ Коллекция sponsorTasks создана');
    
    // Коллекция статистики пользователей
    await db.createCollection('userStats');
    console.log('✅ Коллекция userStats создана');
    
    // Коллекция логов администратора
    await db.createCollection('adminLogs');
    console.log('✅ Коллекция adminLogs создана');
    
    // Коллекция логов ошибок
    await db.createCollection('errorLogs');
    console.log('✅ Коллекция errorLogs создана');
    
    // Коллекция конфигурации
    await db.createCollection('config');
    console.log('✅ Коллекция config создана');
    
    console.log('🎉 База данных успешно сброшена и инициализирована!');
    
  } catch (error) {
    console.error('❌ Ошибка при сбросе базы данных:', error);
  } finally {
    await client.close();
    console.log('🔌 Соединение с базой данных закрыто');
  }
}

// Запускаем сброс базы данных
resetDatabase();
