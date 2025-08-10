const { MongoClient, ObjectId } = require('mongodb');
const config = require('./config');

class Database {
  constructor() {
    this.client = new MongoClient(config.MONGODB_URI);
    this.db = null;
    this.collections = {};
    this.isConnected = false;
  }

  async connect() {
    try {
      console.log('🔌 Подключаемся к MongoDB...');
      await this.client.connect();
      this.db = this.client.db();
      this.isConnected = true;
      
      // Инициализируем коллекции
      this.collections = {
        users: this.db.collection('users'),
        promocodes: this.db.collection('promocodes'),
        tasks: this.db.collection('tasks'),
        titles: this.db.collection('titles'),
        supportTickets: this.db.collection('supportTickets'),
        taskChecks: this.db.collection('taskChecks'),
        withdrawalRequests: this.db.collection('withdrawalRequests'),
        reserve: this.db.collection('reserve')
      };
      
      // Создаем индексы для оптимизации
      await this.createIndexes();
      
      console.log('✅ MongoDB подключен и индексы созданы');
      return true;
    } catch (error) {
      console.error('❌ Ошибка подключения к MongoDB:', error);
      throw error;
    }
  }

  async createIndexes() {
    try {
      // Индексы для пользователей
      await this.collections.users.createIndex({ id: 1 }, { unique: true });
      await this.collections.users.createIndex({ username: 1 });
      await this.collections.users.createIndex({ 'miner.active': 1 });
      await this.collections.users.createIndex({ lastSeen: -1 });
      
      // Индексы для промокодов
      await this.collections.promocodes.createIndex({ code: 1 }, { unique: true });
      await this.collections.promocodes.createIndex({ isActive: 1 });
      await this.collections.promocodes.createIndex({ expiresAt: 1 });
      
      // Индексы для заявок
      await this.collections.withdrawalRequests.createIndex({ userId: 1 });
      await this.collections.withdrawalRequests.createIndex({ status: 1 });
      await this.collections.withdrawalRequests.createIndex({ createdAt: -1 });
      
      // Индексы для тикетов поддержки
      await this.collections.supportTickets.createIndex({ userId: 1 });
      await this.collections.supportTickets.createIndex({ status: 1 });
      await this.collections.supportTickets.createIndex({ createdAt: -1 });
      
      // Индексы для проверок заданий
      await this.collections.taskChecks.createIndex({ userId: 1 });
      await this.collections.taskChecks.createIndex({ status: 1 });
      await this.collections.taskChecks.createIndex({ createdAt: -1 });
      
      console.log('📊 Индексы созданы успешно');
    } catch (error) {
      console.error('❌ Ошибка создания индексов:', error);
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
      console.log('🔌 Соединение с MongoDB закрыто');
    }
  }

  // Оптимизированные методы для работы с пользователями
  async getUserById(id) {
    return await this.collections.users.findOne({ id });
  }

  async createUser(userData) {
    const newUser = {
      id: userData.id,
      username: userData.username || '',
      first_name: userData.first_name || '',
      stars: 100,
      magnumCoins: 0,
      totalEarnedMagnumCoins: 0,
      lastFarm: 0,
      lastBonus: 0,
      lastExchange: 0,
      created: Math.floor(Date.now() / 1000),
      invited: 0,
      invitedBy: null,
      titles: [],
      achievements: [],
      farmCount: 0,
      bonusCount: 0,
      promoCount: 0,
      taskCount: 0,
      dailyStreak: 0,
      lastSeen: Math.floor(Date.now() / 1000),
      status: 'member',
      dailyTasks: {},
      dailyFarms: 0,
      miner: { active: false, totalEarned: 0, lastReward: 0 }
    };
    
    await this.collections.users.insertOne(newUser);
    return newUser;
  }

  async updateUser(id, updates) {
    const result = await this.collections.users.updateOne(
      { id },
      { $set: { ...updates, lastSeen: Math.floor(Date.now() / 1000) } }
    );
    return result.modifiedCount > 0;
  }

  async incrementUserField(id, field, amount) {
    const result = await this.collections.users.updateOne(
      { id },
      { 
        $inc: { [field]: amount },
        $set: { lastSeen: Math.floor(Date.now() / 1000) }
      }
    );
    return result.modifiedCount > 0;
  }

  // Методы для работы с промокодами
  async getPromocode(code) {
    return await this.collections.promocodes.findOne({ 
      code: code.toUpperCase(),
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    });
  }

  async createPromocode(promoData) {
    const promocode = {
      code: promoData.code.toUpperCase(),
      reward: promoData.reward,
      rewardType: promoData.rewardType || 'stars',
      maxUses: promoData.maxUses || -1,
      usedCount: 0,
      isActive: true,
      createdBy: promoData.createdBy,
      createdAt: new Date(),
      expiresAt: promoData.expiresAt || null,
      usedBy: []
    };
    
    await this.collections.promocodes.insertOne(promocode);
    return promocode;
  }

  // Методы для работы с заявками на вывод
  async createWithdrawalRequest(requestData) {
    const request = {
      userId: requestData.userId,
      username: requestData.username,
      method: requestData.method,
      amount: requestData.amount,
      address: requestData.address,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await this.collections.withdrawalRequests.insertOne(request);
    request._id = result.insertedId;
    return request;
  }

  async updateWithdrawalStatus(requestId, status, adminId, reason = null) {
    const updates = {
      status,
      updatedAt: new Date()
    };
    
    if (adminId) updates.adminId = adminId;
    if (reason) updates.reason = reason;
    
    const result = await this.collections.withdrawalRequests.updateOne(
      { _id: new ObjectId(requestId) },
      { $set: updates }
    );
    return result.modifiedCount > 0;
  }

  // Методы для работы с резервом
  async getReserve() {
    const reserve = await this.collections.reserve.findOne({ _id: 'main' });
    if (!reserve) {
      // Создаем начальный резерв
      const initialReserve = {
        _id: 'main',
        magnumCoins: config.INITIAL_RESERVE_MAGNUM_COINS,
        stars: config.INITIAL_RESERVE_STARS,
        commission: config.EXCHANGE_COMMISSION,
        updatedAt: new Date()
      };
      await this.collections.reserve.insertOne(initialReserve);
      return initialReserve;
    }
    return reserve;
  }

  async updateReserve(updates) {
    const result = await this.collections.reserve.updateOne(
      { _id: 'main' },
      { 
        $set: { 
          ...updates, 
          updatedAt: new Date() 
        } 
      }
    );
    return result.modifiedCount > 0;
  }

  // Методы для статистики
  async getBotStatistics() {
    const stats = await this.collections.users.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          totalMagnumCoins: { $sum: { $ifNull: ['$totalEarnedMagnumCoins', '$magnumCoins'] } },
          totalStars: { $sum: { $ifNull: ['$stars', 0] } },
          activeMiners: { $sum: { $cond: [{ $eq: ['$miner.active', true] }, 1, 0] } }
        }
      }
    ]).toArray();
    
    return stats[0] || {
      totalUsers: 0,
      totalMagnumCoins: 0,
      totalStars: 0,
      activeMiners: 0
    };
  }

  // Методы для майнеров
  async getActiveMiners() {
    return await this.collections.users.find({ 'miner.active': true }).toArray();
  }

  async updateMinerReward(userId, reward, lastReward) {
    const result = await this.collections.users.updateOne(
      { id: userId },
      {
        $inc: { 
          stars: reward,
          'miner.totalEarned': reward
        },
        $set: { 'miner.lastReward': lastReward }
      }
    );
    return result.modifiedCount > 0;
  }
}

module.exports = new Database();