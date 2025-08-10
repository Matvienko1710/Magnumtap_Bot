const { MongoClient, ObjectId } = require('mongodb');
const config = require('./config');

class Database {
  constructor() {
    this.client = null;
    this.db = null;
    this.collections = {};
  }

  async connect() {
    try {
      console.log('🗄️ Подключение к MongoDB...');
      this.client = new MongoClient(config.MONGODB_URI);
      await this.client.connect();
      
      this.db = this.client.db();
      console.log('✅ Подключение к MongoDB установлено');
      
      // Инициализируем коллекции
      this.collections = {
        users: this.db.collection('users'),
        promocodes: this.db.collection('promocodes'),
        withdrawalRequests: this.db.collection('withdrawalRequests'),
        supportTickets: this.db.collection('supportTickets'),
        taskChecks: this.db.collection('taskChecks'),
        reserve: this.db.collection('reserve')
      };
      
      // Создаем индексы
      await this.createIndexes();
      
      // Инициализируем резерв если его нет
      await this.initializeReserve();
      
    } catch (error) {
      console.error('❌ Ошибка подключения к MongoDB:', error);
      throw error;
    }
  }

  async createIndexes() {
    try {
      console.log('📊 Создание индексов...');
      
      // Индексы для пользователей
      await this.collections.users.createIndex({ id: 1 }, { unique: true });
      await this.collections.users.createIndex({ username: 1 });
      await this.collections.users.createIndex({ 'miner.active': 1 });
      await this.collections.users.createIndex({ created: 1 });
      
      // Индексы для промокодов
      await this.collections.promocodes.createIndex({ code: 1 }, { unique: true });
      await this.collections.promocodes.createIndex({ created: 1 });
      
      // Индексы для заявок на вывод
      await this.collections.withdrawalRequests.createIndex({ userId: 1 });
      await this.collections.withdrawalRequests.createIndex({ status: 1 });
      await this.collections.withdrawalRequests.createIndex({ created: 1 });
      
      // Индексы для тикетов поддержки
      await this.collections.supportTickets.createIndex({ userId: 1 });
      await this.collections.supportTickets.createIndex({ status: 1 });
      await this.collections.supportTickets.createIndex({ created: 1 });
      
      // Индексы для заданий
      await this.collections.taskChecks.createIndex({ userId: 1, date: 1 }, { unique: true });
      
      console.log('✅ Индексы созданы');
    } catch (error) {
      console.error('❌ Ошибка создания индексов:', error);
    }
  }

  async initializeReserve() {
    try {
      const existingReserve = await this.collections.reserve.findOne({});
      if (!existingReserve) {
        await this.collections.reserve.insertOne({
          magnumCoins: config.INITIAL_RESERVE_MAGNUM_COINS,
          stars: config.INITIAL_RESERVE_STARS,
          updated: Date.now()
        });
        console.log('💰 Резерв биржи инициализирован');
      }
    } catch (error) {
      console.error('❌ Ошибка инициализации резерва:', error);
    }
  }

  // ==================== ПОЛЬЗОВАТЕЛИ ====================

  async getUserById(id) {
    try {
      return await this.collections.users.findOne({ id: parseInt(id) });
    } catch (error) {
      console.error('Ошибка получения пользователя:', error);
      return null;
    }
  }

  async createUser(userData) {
    try {
      const result = await this.collections.users.insertOne(userData);
      return result.insertedId;
    } catch (error) {
      console.error('Ошибка создания пользователя:', error);
      throw error;
    }
  }

  async updateUser(id, updates) {
    try {
      const result = await this.collections.users.updateOne(
        { id: parseInt(id) },
        { $set: updates }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
      throw error;
    }
  }

  async incrementUserField(id, field, amount) {
    try {
      const result = await this.collections.users.updateOne(
        { id: parseInt(id) },
        { $inc: { [field]: amount } }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Ошибка инкремента поля:', error);
      throw error;
    }
  }

  // ==================== ПРОМОКОДЫ ====================

  async getPromocode(code) {
    try {
      return await this.collections.promocodes.findOne({ code: code.toUpperCase() });
    } catch (error) {
      console.error('Ошибка получения промокода:', error);
      return null;
    }
  }

  async activatePromocode(code) {
    try {
      const result = await this.collections.promocodes.updateOne(
        { code: code.toUpperCase() },
        { $inc: { used: 1 } }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Ошибка активации промокода:', error);
      throw error;
    }
  }

  async createPromocode(promoData) {
    try {
      const result = await this.collections.promocodes.insertOne({
        ...promoData,
        code: promoData.code.toUpperCase(),
        used: 0,
        created: Date.now()
      });
      return result.insertedId;
    } catch (error) {
      console.error('Ошибка создания промокода:', error);
      throw error;
    }
  }

  // ==================== ЗАЯВКИ НА ВЫВОД ====================

  async createWithdrawal(withdrawalData) {
    try {
      const result = await this.collections.withdrawalRequests.insertOne({
        ...withdrawalData,
        id: new ObjectId().toString(),
        created: Date.now()
      });
      return result.insertedId;
    } catch (error) {
      console.error('Ошибка создания заявки на вывод:', error);
      throw error;
    }
  }

  async getUserWithdrawals(userId) {
    try {
      return await this.collections.withdrawalRequests
        .find({ userId: parseInt(userId) })
        .sort({ created: -1 })
        .toArray();
    } catch (error) {
      console.error('Ошибка получения заявок на вывод:', error);
      return [];
    }
  }

  async updateWithdrawalStatus(withdrawalId, status, adminResponse = null) {
    try {
      const updates = { status, updated: Date.now() };
      if (adminResponse) updates.adminResponse = adminResponse;
      
      const result = await this.collections.withdrawalRequests.updateOne(
        { _id: new ObjectId(withdrawalId) },
        { $set: updates }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Ошибка обновления статуса заявки:', error);
      throw error;
    }
  }

  // ==================== ТИКЕТЫ ПОДДЕРЖКИ ====================

  async createSupportTicket(ticketData) {
    try {
      const result = await this.collections.supportTickets.insertOne({
        ...ticketData,
        id: new ObjectId().toString(),
        created: Date.now(),
        updated: Date.now()
      });
      return result.insertedId;
    } catch (error) {
      console.error('Ошибка создания тикета:', error);
      throw error;
    }
  }

  async getUserTickets(userId) {
    try {
      return await this.collections.supportTickets
        .find({ userId: parseInt(userId) })
        .sort({ created: -1 })
        .toArray();
    } catch (error) {
      console.error('Ошибка получения тикетов:', error);
      return [];
    }
  }

  async updateTicketStatus(ticketId, status, adminResponse = null) {
    try {
      const updates = { status, updated: Date.now() };
      if (adminResponse) updates.adminResponse = adminResponse;
      
      const result = await this.collections.supportTickets.updateOne(
        { _id: new ObjectId(ticketId) },
        { $set: updates }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Ошибка обновления статуса тикета:', error);
      throw error;
    }
  }

  // ==================== ЗАДАНИЯ ====================

  async getUserTasks(userId, date) {
    try {
      return await this.collections.taskChecks.findOne({
        userId: parseInt(userId),
        date: date
      });
    } catch (error) {
      console.error('Ошибка получения заданий:', error);
      return null;
    }
  }

  async createUserTasks(taskData) {
    try {
      const result = await this.collections.taskChecks.insertOne(taskData);
      return result.insertedId;
    } catch (error) {
      console.error('Ошибка создания заданий:', error);
      throw error;
    }
  }

  async updateUserTasks(userId, date, updates) {
    try {
      const result = await this.collections.taskChecks.updateOne(
        { userId: parseInt(userId), date: date },
        { $set: updates }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Ошибка обновления заданий:', error);
      throw error;
    }
  }

  // ==================== РЕЗЕРВ БИРЖИ ====================

  async getReserve() {
    try {
      const reserve = await this.collections.reserve.findOne({});
      return reserve || {
        magnumCoins: config.INITIAL_RESERVE_MAGNUM_COINS,
        stars: config.INITIAL_RESERVE_STARS
      };
    } catch (error) {
      console.error('Ошибка получения резерва:', error);
      return {
        magnumCoins: config.INITIAL_RESERVE_MAGNUM_COINS,
        stars: config.INITIAL_RESERVE_STARS
      };
    }
  }

  async updateReserve(updates) {
    try {
      const result = await this.collections.reserve.updateOne(
        {},
        { 
          $set: { ...updates, updated: Date.now() }
        },
        { upsert: true }
      );
      return result.modifiedCount > 0 || result.upsertedCount > 0;
    } catch (error) {
      console.error('Ошибка обновления резерва:', error);
      throw error;
    }
  }

  // ==================== МАЙНЕРЫ ====================

  async getActiveMiners() {
    try {
      return await this.collections.users
        .find({ 'miner.active': true })
        .toArray();
    } catch (error) {
      console.error('Ошибка получения активных майнеров:', error);
      return [];
    }
  }

  async updateMinerReward(userId, reward, timestamp) {
    try {
      const result = await this.collections.users.updateOne(
        { id: parseInt(userId) },
        {
          $inc: { 'miner.totalEarned': reward },
          $set: { 'miner.lastReward': timestamp }
        }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Ошибка обновления награды майнера:', error);
      throw error;
    }
  }

  // ==================== СТАТИСТИКА ====================

  async getBotStatistics() {
    try {
      const stats = await this.collections.users.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalStars: { $sum: '$stars' },
            totalMagnumCoins: { $sum: '$magnumCoins' },
            activeMiners: {
              $sum: {
                $cond: [{ $eq: ['$miner.active', true] }, 1, 0]
              }
            }
          }
        }
      ]).toArray();

      return stats[0] || {
        totalUsers: 0,
        totalStars: 0,
        totalMagnumCoins: 0,
        activeMiners: 0
      };
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      return {
        totalUsers: 0,
        totalStars: 0,
        totalMagnumCoins: 0,
        activeMiners: 0
      };
    }
  }

  // ==================== АДМИН ФУНКЦИИ ====================

  async getAllUsers(limit = 100, skip = 0) {
    try {
      return await this.collections.users
        .find({})
        .sort({ created: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Ошибка получения пользователей:', error);
      return [];
    }
  }

  async searchUsers(query) {
    try {
      const filter = {
        $or: [
          { username: { $regex: query, $options: 'i' } },
          { id: parseInt(query) || 0 }
        ]
      };
      
      return await this.collections.users
        .find(filter)
        .limit(10)
        .toArray();
    } catch (error) {
      console.error('Ошибка поиска пользователей:', error);
      return [];
    }
  }

  async getAllWithdrawals(status = null, limit = 100) {
    try {
      const filter = status ? { status } : {};
      return await this.collections.withdrawalRequests
        .find(filter)
        .sort({ created: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Ошибка получения заявок на вывод:', error);
      return [];
    }
  }

  async getAllTickets(status = null, limit = 100) {
    try {
      const filter = status ? { status } : {};
      return await this.collections.supportTickets
        .find(filter)
        .sort({ created: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Ошибка получения тикетов:', error);
      return [];
    }
  }

  async getAllPromocodes(limit = 100) {
    try {
      return await this.collections.promocodes
        .find({})
        .sort({ created: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('Ошибка получения промокодов:', error);
      return [];
    }
  }

  // ==================== УТИЛИТЫ ====================

  async close() {
    if (this.client) {
      await this.client.close();
      console.log('🔌 Соединение с MongoDB закрыто');
    }
  }
}

module.exports = new Database();