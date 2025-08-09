// Тестовый файл для проверки функций вывода

// Заглушка для MongoDB
const mockUsers = new Map();
const mockWithdrawalRequests = new Map();

// Заглушка для коллекций
const mockCollection = {
  findOne: async (query) => {
    if (query.id) return mockUsers.get(query.id) || null;
    return mockWithdrawalRequests.get(query.id) || null;
  },
  insertOne: async (doc) => {
    if (doc.userId) mockWithdrawalRequests.set(doc.id, doc);
    return { insertedId: doc.id };
  },
  updateOne: async (query, update) => {
    if (query.id && mockUsers.has(query.id)) {
      const user = mockUsers.get(query.id);
      if (update.$inc && update.$inc.stars) {
        user.stars = (user.stars || 0) + update.$inc.stars;
      }
      mockUsers.set(query.id, user);
    }
    return { modifiedCount: 1 };
  }
};

// Переопределяем переменные окружения для теста
process.env.WITHDRAWAL_CHANNEL = 'test_channel';

// Заглушки для основных функций
async function getUser(userId, ctx) {
  if (!mockUsers.has(userId)) {
    mockUsers.set(userId, {
      id: userId,
      stars: 1000, // Тестовый баланс
      username: 'testuser',
      first_name: 'Test User'
    });
  }
  return mockUsers.get(userId);
}

// Функции из bot.js (копируем без изменений)
async function createWithdrawalRequest(userId, method, amount, address) {
  const user = await getUser(userId);
  const requestId = new Date().getTime().toString();
  
  const request = {
    id: requestId,
    userId: userId,
    username: user.username || '',
    firstName: user.first_name || '',
    method: method,
    amount: amount,
    address: address,
    status: 'pending',
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
    fee: Math.round(amount * 0.05 * 100) / 100,
    netAmount: Math.round((amount - amount * 0.05) * 100) / 100
  };
  
  await mockCollection.insertOne(request);
  return request;
}

async function sendWithdrawalToChannel(request) {
  console.log('sendWithdrawalToChannel вызвана для заявки:', request.id);
  console.log('WITHDRAWAL_CHANNEL:', process.env.WITHDRAWAL_CHANNEL);
  
  if (!process.env.WITHDRAWAL_CHANNEL) {
    console.log('WITHDRAWAL_CHANNEL не настроен, пропускаем отправку в канал');
    return;
  }
  
  const methodNames = {
    'tg_stars': '⭐ Telegram Stars',
    'ton': '💎 TON Coin', 
    'usdt': '💵 USDT TRC-20'
  };
  
  const message = `💸 **Новая заявка на вывод** 💸\n\n` +
                  `👤 **Пользователь:** ${request.firstName || request.username || `ID: ${request.userId}`}\n` +
                  `🆔 **ID пользователя:** ${request.userId}\n` +
                  `💰 **Сумма:** ${request.amount}⭐\n` +
                  `💸 **К выводу:** ${request.netAmount}⭐ (комиссия: ${request.fee}⭐)\n` +
                  `🔄 **Метод:** ${methodNames[request.method]}\n` +
                  `📍 **Адрес/Данные:** \`${request.address}\`\n` +
                  `⏰ **Время:** ${new Date(request.createdAt * 1000).toLocaleString('ru-RU')}\n` +
                  `📊 **Статус:** 🟡 На рассмотрении\n\n` +
                  `🏷️ **ID заявки:** \`${request.id}\``;
  
  console.log('Сообщение для канала:');
  console.log(message);
  console.log('Сообщение успешно "отправлено" в канал (тестовый режим)');
}

// Тестируем создание заявки
async function testWithdrawal() {
  console.log('=== ТЕСТ СИСТЕМЫ ВЫВОДА ===\n');
  
  const userId = 123456789;
  const amount = 500;
  const telegramId = '987654321';
  
  console.log('1. Получаем пользователя...');
  const user = await getUser(userId);
  console.log('Пользователь:', user);
  
  console.log('\n2. Проверяем баланс...');
  if (user.stars < amount) {
    console.log(`❌ Недостаточно звёзд! У пользователя: ${user.stars}⭐, запрашивает: ${amount}⭐`);
    return;
  }
  console.log(`✅ Баланс достаточен: ${user.stars}⭐ >= ${amount}⭐`);
  
  console.log('\n3. Создаем заявку...');
  const request = await createWithdrawalRequest(userId, 'tg_stars', amount, telegramId);
  console.log('Заявка создана:', request);
  
  console.log('\n4. Списываем звёзды...');
  await mockCollection.updateOne({ id: userId }, { $inc: { stars: -amount } });
  const updatedUser = await getUser(userId);
  console.log('Обновленный баланс:', updatedUser.stars);
  
  console.log('\n5. Отправляем в канал...');
  await sendWithdrawalToChannel(request);
  
  console.log('\n=== ТЕСТ ЗАВЕРШЕН ===');
}

// Запускаем тест
testWithdrawal().catch(console.error);