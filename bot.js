require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');

// Конфигурация
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
const SUPPORT_CHANNEL = process.env.SUPPORT_CHANNEL; // Имя канала без @
const WITHDRAWAL_CHANNEL = process.env.WITHDRAWAL_CHANNEL; // Канал для заявок на вывод

// Обязательная подписка
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL;
const REQUIRED_BOT_LINK = process.env.REQUIRED_BOT_LINK || 'https://t.me/ReferalStarsRobot?start=6587897295';

// Ссылки для заданий (настраиваются через переменные окружения)
const FIRESTARS_BOT_LINK = process.env.FIRESTARS_BOT_LINK || 'https://t.me/firestars_rbot?start=6587897295';
const FARMIK_BOT_LINK = process.env.FARMIK_BOT_LINK || 'https://t.me/farmikstars_bot?start=6587897295';
const BASKET_BOT_LINK = process.env.BASKET_BOT_LINK || 'https://t.me/basket_gift_bot?start=6587897295';

// Система заявок на вывод
const WITHDRAWAL_STATUSES = {
  'pending': { name: '⏳ На рассмотрении', color: '🟡' },
  'approved': { name: '✅ Одобрено', color: '🟢' },
  'rejected': { name: '❌ Отклонено', color: '🔴' },
  'processing': { name: '🔄 В обработке', color: '🔵' },
  'completed': { name: '✅ Выполнено', color: '🟢' }
};

const REJECTION_REASONS = {
  'fraud': { name: '🚫 Накрутка активности', description: 'Обнаружены признаки накрутки активности или использования ботов' },
  'bug_abuse': { name: '🐛 Злоупотребление багами', description: 'Использование багов или уязвимостей для получения звёзд' },
  'multi_account': { name: '👥 Мультиаккаунтинг', description: 'Использование нескольких аккаунтов одним пользователем' },
  'insufficient_activity': { name: '📊 Недостаточная активность', description: 'Слишком низкая активность для такого количества звёзд' },
  'suspicious_pattern': { name: '🔍 Подозрительная активность', description: 'Обнаружены подозрительные паттерны в активности' },
  'other': { name: '❓ Другая причина', description: 'Причина будет указана дополнительно' }
};

console.log('🔧 Проверяем переменные окружения...');
console.log('🤖 BOT_TOKEN:', BOT_TOKEN ? 'установлен' : 'НЕ УСТАНОВЛЕН');
console.log('🗄️ MONGODB_URI:', MONGODB_URI ? 'установлен' : 'НЕ УСТАНОВЛЕН');
console.log('👑 ADMIN_IDS:', ADMIN_IDS.length ? ADMIN_IDS.join(', ') : 'НЕ УСТАНОВЛЕНЫ');
console.log('📞 SUPPORT_CHANNEL:', SUPPORT_CHANNEL || 'НЕ УСТАНОВЛЕН');
console.log('💳 WITHDRAWAL_CHANNEL:', WITHDRAWAL_CHANNEL || 'НЕ УСТАНОВЛЕН');
console.log('🔐 REQUIRED_CHANNEL:', REQUIRED_CHANNEL || 'НЕ УСТАНОВЛЕН');

if (!BOT_TOKEN) throw new Error('Не задан BOT_TOKEN!');
if (!MONGODB_URI) throw new Error('Не задан MONGODB_URI!');

const bot = new Telegraf(BOT_TOKEN);
const mongo = new MongoClient(MONGODB_URI);
let users, promocodes, taskChecks, withdrawalRequests;

// Состояния пользователей для обработки ввода
const userStates = new Map();

// Система титулов
const TITLES = {
  // Обычные титулы (10)
  'newcomer': { name: '🌱 Новичок', description: 'Начал путь в MagnumTap', condition: 'registration', requirement: 1 },
  'farmer': { name: '⚡ Фармер', description: 'Выполнил 30 действий фарминга', condition: 'farm_count', requirement: 30 },
  'collector': { name: '💎 Коллекционер', description: 'Собрал 50 звёзд', condition: 'stars', requirement: 50 },
  'inviter': { name: '🤝 Амбассадор', description: 'Пригласил 3 друзей', condition: 'invited', requirement: 3 },
  'daily_visitor': { name: '📅 Постоянный посетитель', description: '5 дней подряд заходил в бота', condition: 'daily_streak', requirement: 5 },
  'bonus_hunter': { name: '🎁 Охотник за бонусами', description: 'Собрал 15 ежедневных бонусов', condition: 'bonus_count', requirement: 15 },
  'promo_master': { name: '🎫 Мастер промокодов', description: 'Активировал 5 промокодов', condition: 'promo_count', requirement: 5 },
  'task_warrior': { name: '⚔️ Воин заданий', description: 'Выполнил 20 заданий', condition: 'task_count', requirement: 20 },
  'star_lord': { name: '🌟 Звёздный лорд', description: 'Собрал 200 звёзд', condition: 'stars', requirement: 200 },
  'legend': { name: '👑 Легенда', description: 'Собрал 500 звёзд и пригласил 10 друзей', condition: 'combined', requirement: { stars: 500, invited: 10 } },

  // Секретные титулы (3)
  'early_bird': { name: '🌅 Ранняя пташка', description: 'Секретный титул за особую активность', condition: 'secret', requirement: 'special' },
  'night_owl': { name: '🦉 Ночная сова', description: 'Секретный титул для ночных игроков', condition: 'secret', requirement: 'special' },
  'vip_elite': { name: '💫 VIP Элита', description: 'Эксклюзивный титул от администрации', condition: 'secret', requirement: 'admin_only' }
};

// Система рангов (по звёздам)
const RANKS = [
  { name: '🥉 Bronze Star', requirement: 0, color: '🥉' },
  { name: '🥈 Silver Star', requirement: 50, color: '🥈' },
  { name: '🥇 Gold Star', requirement: 150, color: '🥇' },
  { name: '💎 Platinum Star', requirement: 300, color: '💎' },
  { name: '💍 Diamond Star', requirement: 500, color: '💍' },
  { name: '👑 Master Star', requirement: 1000, color: '👑' },
  { name: '🏆 Grandmaster', requirement: 2000, color: '🏆' },
  { name: '⭐ Legend', requirement: 5000, color: '⭐' }
];

// Система магазина
const SHOP_ITEMS = {
  'boost_farm': {
    name: '⚡ Бустер фарма x2',
    description: 'Удваивает награду за фарм на 1 час',
    price: 50,
    icon: '⚡',
    duration: 3600, // 1 час в секундах
    category: 'boosts'
  },
  'boost_bonus': {
    name: '🎁 Бустер бонуса x2', 
    description: 'Удваивает ежедневный бонус на 3 дня',
    price: 100,
    icon: '🎁',
    duration: 259200, // 3 дня в секундах
    category: 'boosts'
  },
  'multiplier_stars': {
    name: '✨ Множитель звёзд x3',
    description: 'Утраивает все награды за звёзды на 30 минут',
    price: 200,
    icon: '✨',
    duration: 1800, // 30 минут
    category: 'multipliers'
  },
  'premium_week': {
    name: '👑 Премиум статус',
    description: 'VIP статус на неделю + все бонусы',
    price: 500,
    icon: '👑',
    duration: 604800, // 7 дней
    category: 'premium'
  },
  'lucky_box': {
    name: '🎲 Коробка удачи',
    description: 'Средний выигрыш ~10⭐ (диапазон 1-100⭐)',
    price: 25,
    icon: '🎲',
    category: 'boxes'
  },
  'mega_box': {
    name: '💎 Мега коробка',
    description: 'Средний выигрыш ~75⭐ (диапазон 20-284⭐)',
    price: 150,
    icon: '💎',
    category: 'boxes'
  },
  'custom_title': {
    name: '🏷️ Кастомный титул',
    description: 'Создайте свой уникальный титул',
    price: 1000,
    icon: '🏷️',
    category: 'cosmetic'
  },

};

// Система статусов пользователей
const USER_STATUSES = {
  'owner': { 
    name: '👑 Владелец', 
    description: 'Создатель и владелец бота', 
    color: '👑',
    priority: 1
  },
  'admin': { 
    name: '⚡ Администратор', 
    description: 'Полный доступ к управлению ботом', 
    color: '⚡',
    priority: 2
  },
  'moderator': { 
    name: '🛡️ Модератор', 
    description: 'Модерация пользователей и контента', 
    color: '🛡️',
    priority: 3
  },
  'vip_gold': { 
    name: '💎 VIP Gold', 
    description: 'Премиум статус высшего уровня', 
    color: '💎',
    priority: 4
  },
  'vip': { 
    name: '💫 VIP', 
    description: 'Премиум пользователь', 
    color: '💫',
    priority: 5
  },
  'verified': { 
    name: '✅ Верифицированный', 
    description: 'Проверенный активный пользователь', 
    color: '✅',
    priority: 6
  },
  'member': { 
    name: '🎮 Участник', 
    description: 'Обычный участник сообщества', 
    color: '🎮',
    priority: 7
  }
};

// Система достижений
const ACHIEVEMENTS = {
  'first_hundred': { 
    name: '💰 Сотка', 
    description: 'Накопить 100 звёзд', 
    condition: 'stars', 
    requirement: 100,
    reward: 5,
    icon: '💰'
  },
  'social_butterfly': { 
    name: '🤝 Социальная бабочка', 
    description: 'Пригласить 10 друзей', 
    condition: 'invited', 
    requirement: 10,
    reward: 10,
    icon: '🤝'
  },
  'week_warrior': { 
    name: '⚡ Недельный воин', 
    description: 'Получить бонус 7 дней подряд', 
    condition: 'daily_streak', 
    requirement: 7,
    reward: 12,
    icon: '⚡'
  },
  'farm_master': { 
    name: '🌾 Мастер фарма', 
    description: 'Сфармить 1000 раз', 
    condition: 'farm_count', 
    requirement: 1000,
    reward: 10,
    icon: '🌾'
  },
  'promo_hunter': { 
    name: '🎫 Охотник за промо', 
    description: 'Активировать 15 промокодов', 
    condition: 'promo_count', 
    requirement: 15,
    reward: 15,
    icon: '🎫'
  }
};

// Система техподдержки
const TICKET_STATUSES = {
  'new': { name: '🆕 Новая', color: '🔵', emoji: '🔵' },
  'in_progress': { name: '⚙️ В работе', color: '🟡', emoji: '⚙️' },
  'resolved': { name: '✅ Решена', color: '🟢', emoji: '✅' },
  'rejected': { name: '❌ Отклонена', color: '🔴', emoji: '❌' },
  'closed': { name: '🔒 Закрыта', color: '⚫', emoji: '🔒' }
};

async function createTaskCheck(userId, username, taskId, taskTitle, photo = null) {
  const taskCheck = {
    userId: userId,
    username: username || 'Неизвестно',
    taskId: taskId,
    taskTitle: taskTitle,
    photo: photo,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    adminResponse: null
  };
  
  const result = await taskChecks.insertOne(taskCheck);
  taskCheck._id = result.insertedId;
  return taskCheck;
}

async function updateTaskCheckStatus(checkId, status, adminResponse = null) {
  const updateData = { 
    status: status, 
    updatedAt: new Date() 
  };
  
  if (adminResponse) {
    updateData.adminResponse = adminResponse;
  }
  
  await taskChecks.updateOne(
    { _id: checkId },
    { $set: updateData }
  );
}

async function sendTaskCheckToChannel(taskCheck) {
  const supportChannelId = SUPPORT_CHANNEL;
  if (!supportChannelId) return;

  const statusInfo = TASK_CHECK_STATUSES[taskCheck.status];
  
  try {
    const messageText = formatTaskCheckMessage(taskCheck);
    
    let message;
    if (taskCheck.photo) {
      message = await bot.telegram.sendPhoto(`@${supportChannelId}`, taskCheck.photo, {
        caption: messageText,
        parse_mode: 'Markdown',
        reply_markup: getTaskCheckKeyboard(taskCheck._id, taskCheck.status, taskCheck.taskId)
      });
    } else {
      message = await bot.telegram.sendMessage(`@${supportChannelId}`, messageText, {
        parse_mode: 'Markdown',
        reply_markup: getTaskCheckKeyboard(taskCheck._id, taskCheck.status, taskCheck.taskId)
      });
    }
    
    await taskChecks.updateOne(
      { _id: taskCheck._id },
      { $set: { channelMessageId: message.message_id } }
    );
  } catch (error) {
    console.error('Ошибка отправки проверки задания в канал:', error);
  }
}

function formatTaskCheckMessage(taskCheck) {
  const statusInfo = TASK_CHECK_STATUSES[taskCheck.status];
  let message = `📋 *Проверка задания #${taskCheck._id.toString().slice(-6)}*\n\n` +
    `👤 *Пользователь:* ${taskCheck.username || 'Неизвестно'} (ID: \`${taskCheck.userId}\`)\n` +
    `📝 *Задание:* ${taskCheck.taskTitle}\n` +
    `📅 *Отправлено:* ${taskCheck.createdAt.toLocaleString('ru-RU')}\n` +
    `📊 *Статус:* ${statusInfo.emoji} ${statusInfo.name}`;
  
  if (taskCheck.adminResponse) {
    message += `\n\n💬 *Ответ администратора:*\n${taskCheck.adminResponse}`;
  }
  
  if (taskCheck.updatedAt && taskCheck.updatedAt.getTime() !== taskCheck.createdAt.getTime()) {
    message += `\n🔄 *Обновлено:* ${taskCheck.updatedAt.toLocaleString('ru-RU')}`;
  }
  
  return message;
}

function getTaskCheckKeyboard(checkId, status, taskId) {
  const keyboards = {
    'pending': [
      [
        { text: '✅ Одобрить', callback_data: `task_approve_${checkId}` },
        { text: '❌ Отклонить', callback_data: `task_reject_${checkId}` }
      ],
      [
        { text: '💬 Ответить', callback_data: `task_reply_${checkId}` }
      ]
    ],
    'approved': [
      [
        { text: '❌ Отменить одобрение', callback_data: `task_reject_${checkId}` }
      ]
    ],
    'rejected': [
      [
        { text: '✅ Одобрить', callback_data: `task_approve_${checkId}` }
      ]
    ]
  };
  
  return { inline_keyboard: keyboards[status] || keyboards['pending'] };
}

async function updateTaskCheckInChannel(checkId) {
  try {
    const taskCheck = await taskChecks.findOne({ _id: checkId });
    if (!taskCheck || !taskCheck.channelMessageId) return;
    
    const messageText = formatTaskCheckMessage(taskCheck);
    const keyboard = getTaskCheckKeyboard(taskCheck._id, taskCheck.status, taskCheck.taskId);
    
    if (taskCheck.photo) {
      await bot.telegram.editMessageCaption(
        `@${SUPPORT_CHANNEL}`,
        taskCheck.channelMessageId,
        null,
        messageText,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    } else {
      await bot.telegram.editMessageText(
        `@${SUPPORT_CHANNEL}`,
        taskCheck.channelMessageId,
        null,
        messageText,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    }
  } catch (error) {
    console.error('Ошибка обновления проверки задания в канале:', error);
  }
}

async function createSupportTicket(userId, username, message) {
  const ticket = {
    userId: userId,
    username: username || 'Неизвестно',
    message: message,
    status: 'new',
    createdAt: new Date(),
    updatedAt: new Date(),
    adminResponse: null
  };
  
  const result = await supportTickets.insertOne(ticket);
  ticket._id = result.insertedId;
  return ticket;
}

async function updateTicketStatus(ticketId, status, adminResponse = null, messageId = null) {
  const updateData = { 
    status: status, 
    updatedAt: new Date() 
  };
  
  if (adminResponse) {
    updateData.adminResponse = adminResponse;
  }
  
  if (messageId) {
    updateData.channelMessageId = messageId;
  }
  
  await supportTickets.updateOne(
    { _id: ticketId },
    { $set: updateData }
  );
}

async function notifyUserStatusChange(ticketId, statusText) {
  try {
    const ticket = await supportTickets.findOne({ _id: ticketId });
    if (!ticket) return;
    
    await bot.telegram.sendMessage(ticket.userId, 
      `🎫 **Обновление заявки #${ticketId.toString().slice(-6)}**\n\n` +
      `📊 **Статус:** Ваша заявка ${statusText}\n\n` +
      `💬 **Исходное сообщение:** ${ticket.message}\n\n` +
      `📅 **Дата обновления:** ${new Date().toLocaleString('ru-RU')}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Ошибка уведомления пользователя:', error);
  }
}

async function sendTicketToChannel(ticket) {
  const supportChannelId = SUPPORT_CHANNEL;
  if (!supportChannelId) return;

  const statusInfo = TICKET_STATUSES[ticket.status];
  
  try {
    const messageText = formatTicketMessage(ticket);
    const message = await bot.telegram.sendMessage(`@${supportChannelId}`, messageText, {
      parse_mode: 'Markdown',
      reply_markup: getTicketKeyboard(ticket._id, ticket.status)
    });
    
    await updateTicketStatus(ticket._id, ticket.status, null, message.message_id);
  } catch (error) {
    console.error('Ошибка отправки в канал поддержки:', error);
  }
}

function formatTicketMessage(ticket) {
  const statusInfo = TICKET_STATUSES[ticket.status];
  let message = `🎫 *Заявка техподдержки #${ticket._id.toString().slice(-6)}*\n\n` +
    `👤 *Пользователь:* ${ticket.username || 'Неизвестно'} (ID: \`${ticket.userId}\`)\n` +
    `📝 *Сообщение:* ${ticket.message}\n` +
    `📅 *Создана:* ${ticket.createdAt.toLocaleString('ru-RU')}\n` +
    `📊 *Статус:* ${statusInfo.emoji} ${statusInfo.name}`;
  
  if (ticket.adminResponse) {
    message += `\n\n💬 *Ответ администратора:*\n${ticket.adminResponse}`;
  }
  
  if (ticket.updatedAt && ticket.updatedAt.getTime() !== ticket.createdAt.getTime()) {
    message += `\n🔄 *Обновлено:* ${ticket.updatedAt.toLocaleString('ru-RU')}`;
  }
  
  return message;
}

function getTicketKeyboard(ticketId, status) {
  const keyboards = {
    'new': [
      [
        { text: '✅ Принять', callback_data: `ticket_accept_${ticketId}` },
        { text: '❌ Отклонить', callback_data: `ticket_reject_${ticketId}` }
      ],
      [
        { text: '💬 Ответить', callback_data: `ticket_reply_${ticketId}` }
      ]
    ],
    'in_progress': [
      [
        { text: '✅ Решено', callback_data: `ticket_resolve_${ticketId}` },
        { text: '❌ Отклонить', callback_data: `ticket_reject_${ticketId}` }
      ],
      [
        { text: '💬 Ответить', callback_data: `ticket_reply_${ticketId}` },
        { text: '🔒 Закрыть', callback_data: `ticket_close_${ticketId}` }
      ]
    ],
    'resolved': [
      [
        { text: '🔒 Закрыть', callback_data: `ticket_close_${ticketId}` },
        { text: '💬 Ответить', callback_data: `ticket_reply_${ticketId}` }
      ]
    ],
    'rejected': [
      [
        { text: '🔄 Переоткрыть', callback_data: `ticket_accept_${ticketId}` }
      ]
    ],
    'closed': [
      [
        { text: '🔄 Переоткрыть', callback_data: `ticket_accept_${ticketId}` }
      ]
    ]
  };
  
  return { inline_keyboard: keyboards[status] || keyboards['new'] };
}

async function updateTicketInChannel(ticketId) {
  try {
    const ticket = await supportTickets.findOne({ _id: ticketId });
    if (!ticket || !ticket.channelMessageId) return;
    
    const messageText = formatTicketMessage(ticket);
    const keyboard = getTicketKeyboard(ticket._id, ticket.status);
    
    await bot.telegram.editMessageText(
      `@${SUPPORT_CHANNEL}`,
      ticket.channelMessageId,
      null,
      messageText,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  } catch (error) {
    console.error('Ошибка обновления сообщения в канале:', error);
  }
}

// Функции для работы с титулами
async function checkAndAwardAchievements(userId) {
  const user = await getUser(userId);
  const newAchievements = [];
  
  for (const [achievementId, achievement] of Object.entries(ACHIEVEMENTS)) {
    // Проверяем, есть ли уже это достижение
    if (user.achievements && user.achievements.includes(achievementId)) continue;
    
    let earned = false;
    
    switch (achievement.condition) {
      case 'stars':
        earned = user.stars >= achievement.requirement;
        break;
      case 'invited':
        earned = user.invited >= achievement.requirement;
        break;
      case 'daily_streak':
        earned = (user.dailyStreak || 0) >= achievement.requirement;
        break;
      case 'farm_count':
        earned = (user.farmCount || 0) >= achievement.requirement;
        break;
      case 'promo_count':
        earned = (user.promoCount || 0) >= achievement.requirement;
        break;
    }
    
    if (earned) {
      // Добавляем достижение и награду
      await users.updateOne(
        { id: userId },
        { 
          $addToSet: { achievements: achievementId },
          $inc: { magnumCoins: achievement.reward }
        }
      );
      newAchievements.push(achievement);
    }
  }
  
  return newAchievements;
}

async function checkAndAwardTitles(userId) {
  const user = await getUser(userId);
  const userTitles = user.titles || [];
  let newTitles = [];

  for (const [titleId, title] of Object.entries(TITLES)) {
    if (userTitles.includes(titleId) || title.condition === 'secret') continue;

    let earned = false;
    switch (title.condition) {
      case 'registration':
        earned = true;
        break;
      case 'farm_count':
        earned = (user.farmCount || 0) >= title.requirement;
        break;
      case 'stars':
        earned = (user.stars || 0) >= title.requirement;
        break;
      case 'invited':
        earned = (user.invited || 0) >= title.requirement;
        break;
      case 'daily_streak':
        earned = (user.dailyStreak || 0) >= title.requirement;
        break;
      case 'bonus_count':
        earned = (user.bonusCount || 0) >= title.requirement;
        break;
      case 'promo_count':
        earned = (user.promoCount || 0) >= title.requirement;
        break;
      case 'task_count':
        earned = (user.taskCount || 0) >= title.requirement;
        break;
      case 'combined':
        earned = (user.stars || 0) >= title.requirement.stars && (user.invited || 0) >= title.requirement.invited;
        break;
    }

    if (earned) {
      newTitles.push(titleId);
    }
  }

  if (newTitles.length > 0) {
    await users.updateOne(
      { id: userId },
      { $addToSet: { titles: { $each: newTitles } } }
    );
    return newTitles;
  }
  return [];
}

function getUserMainTitle(user) {
  // Если пользователь выбрал главный титул, используем его
  if (user.selectedTitle) {
    // Проверяем кастомный титул
    if (user.selectedTitle === 'custom' && user.customTitle) {
      return `✨ ${user.customTitle}`;
    }
    // Проверяем обычные титулы
    if (TITLES[user.selectedTitle] && (user.titles || []).includes(user.selectedTitle)) {
      return TITLES[user.selectedTitle].name;
    }
  }
  
  // Если кастомный титул есть, показываем его по умолчанию
  if (user.customTitle) {
    return `✨ ${user.customTitle}`;
  }
  
  const userTitles = user.titles || [];
  if (userTitles.length === 0) return '🆕 Нет титула';
  
  // Приоритет: секретные > легенда > по порядку
  const titleOrder = ['vip_elite', 'early_bird', 'night_owl', 'legend', 'star_lord', 'task_warrior', 'promo_master', 'bonus_hunter', 'daily_visitor', 'inviter', 'collector', 'farmer', 'newcomer'];
  
  for (const titleId of titleOrder) {
    if (userTitles.includes(titleId)) {
      return TITLES[titleId].name;
    }
  }
  return '🆕 Нет титула';
}

function getUserRank(user) {
  const stars = user.stars || 0;
  let currentRank = RANKS[0]; // По умолчанию Bronze Star
  
  for (const rank of RANKS) {
    if (stars >= rank.requirement) {
      currentRank = rank;
    } else {
      break;
    }
  }
  
  return currentRank;
}

function getNextRankInfo(user) {
  const stars = user.stars || 0;
  const currentRank = getUserRank(user);
  
  // Найти следующий ранг
  const currentIndex = RANKS.findIndex(rank => rank.name === currentRank.name);
  if (currentIndex < RANKS.length - 1) {
    const nextRank = RANKS[currentIndex + 1];
    const starsToNext = nextRank.requirement - stars;
    const progress = Math.max(0, Math.min(100, (stars - currentRank.requirement) / (nextRank.requirement - currentRank.requirement) * 100));
    
    return {
      current: currentRank,
      next: nextRank,
      starsToNext: starsToNext,
      progress: Math.round(progress)
    };
  }
  
  return {
    current: currentRank,
    next: null,
    starsToNext: 0,
    progress: 100
  };
}



async function connectDB() {
  console.log('🔌 Подключаемся к MongoDB...');
  console.log('📍 MONGODB_URI:', MONGODB_URI ? 'установлен' : 'НЕ УСТАНОВЛЕН');
  console.log('💳 WITHDRAWAL_CHANNEL:', WITHDRAWAL_CHANNEL || 'НЕ УСТАНОВЛЕН');
  
  await mongo.connect();
  console.log('✅ MongoDB подключен');
  
  const db = mongo.db();
  users = db.collection('users');
  promocodes = db.collection('promocodes');
  tasks = db.collection('tasks');
  titles = db.collection('titles');
  supportTickets = db.collection('supportTickets'); // добавляем коллекцию заявок
  taskChecks = db.collection('taskChecks'); // коллекция проверок заданий
  withdrawalRequests = db.collection('withdrawalRequests'); // коллекция заявок на вывод
  
  console.log('📋 Коллекции инициализированы');
  console.log('🎯 Система вывода готова к работе');
}

function now() { return Math.floor(Date.now() / 1000); }

// Обновляем функцию getUser для автоматической проверки титулов
async function getUser(id, ctx = null) {
  let user = await users.findOne({ id });
  if (!user) {
    user = {
      id,
      username: ctx ? (ctx.from.username || '') : '',
      first_name: ctx ? (ctx.from.first_name || '') : '',
      stars: 0,
      magnumCoins: 0, // Новая валюта
      lastFarm: 0,
      lastBonus: 0,
      created: now(),
      invited: 0,
      invitedBy: null,
      titles: [],
      achievements: [],
      farmCount: 0,
      bonusCount: 0,
      promoCount: 0,
      taskCount: 0,
      dailyStreak: 0,
      status: 'member' // Устанавливаем базовый статус
    };
    await users.insertOne(user);
    // Даём титул новичка
    await checkAndAwardTitles(id);
  } else {
    // Для существующих пользователей добавляем поле magnumCoins если его нет
    if (user.magnumCoins === undefined) {
      await users.updateOne({ id }, { $set: { magnumCoins: 0 } });
      user.magnumCoins = 0;
    }
    
    if (ctx) {
    // Обновляем информацию о пользователе если она изменилась
    const updates = {};
    if (ctx.from.username && ctx.from.username !== user.username) {
      updates.username = ctx.from.username;
    }
    if (ctx.from.first_name && ctx.from.first_name !== user.first_name) {
      updates.first_name = ctx.from.first_name;
    }
    if (Object.keys(updates).length > 0) {
      await users.updateOne({ id }, { $set: updates });
      Object.assign(user, updates);
    }
    }
  }
  return user;
}

function isAdmin(userId) { return ADMIN_IDS.includes(String(userId)); }

// Функция проверки подписки
async function checkSubscription(ctx) {
  // Если переменные не настроены, пропускаем проверку
  if (!REQUIRED_CHANNEL || !REQUIRED_BOT_LINK) return true;
  
  try {
    // Если канал начинается с @, убираем его для API
    const channelId = REQUIRED_CHANNEL.startsWith('@') ? REQUIRED_CHANNEL : `@${REQUIRED_CHANNEL}`;
    const member = await ctx.telegram.getChatMember(channelId, ctx.from.id);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error('Ошибка проверки подписки:', error);
    return false;
  }
}

// Функция показа сообщения о подписке
async function showSubscriptionMessage(ctx) {
  if (!REQUIRED_CHANNEL || !REQUIRED_BOT_LINK) return; // Если не настроено, не показываем
  
  const message = `🔔 **Обязательная подписка**\n\n` +
                  `Для использования бота необходимо:\n\n` +
                  `1️⃣ Подписаться на канал\n` +
                  `2️⃣ Запустить бота по ссылке\n\n` +
                  `После выполнения нажмите "✅ Проверить"`;
  
  // Формируем ссылку на канал
  const channelName = REQUIRED_CHANNEL.replace('@', ''); // Убираем @ если есть
  const channelLink = `https://t.me/${channelName}`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('📢 Подписаться на канал', channelLink)],
    [Markup.button.url('🤖 Запустить бота', REQUIRED_BOT_LINK)],
    [Markup.button.callback('✅ Проверить', 'check_subscription')]
  ]);
  
  try {
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
    } else {
      await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
    }
  } catch (error) {
    console.error('Ошибка отправки сообщения о подписке:', error);
  }
}



// Функции для работы с магазином
function getShopCategories() {
  const categories = {};
  Object.entries(SHOP_ITEMS).forEach(([id, item]) => {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push({ id, ...item });
  });
  return categories;
}

function getActiveBoosts(user) {
  const now = Math.floor(Date.now() / 1000);
  const boosts = user.boosts || {};
  const active = {};
  
  Object.entries(boosts).forEach(([type, data]) => {
    if (data.expiresAt && data.expiresAt > now) {
      active[type] = data;
    }
  });
  
  return active;
}

function applyBoostMultiplier(baseReward, user, boostType) {
  const activeBoosts = getActiveBoosts(user);
  let multiplier = 1;
  
  if (activeBoosts.boost_farm && boostType === 'farm') multiplier *= 2;
  if (activeBoosts.boost_bonus && boostType === 'bonus') multiplier *= 2;
  if (activeBoosts.multiplier_stars) multiplier *= 3;
  
  return baseReward * multiplier;
}

async function purchaseItem(userId, itemId) {
  const user = await getUser(userId);
  const item = SHOP_ITEMS[itemId];
  
  if (!item) return { success: false, message: 'Товар не найден' };
  if (user.stars < item.price) return { success: false, message: 'Недостаточно звёзд' };
  
  const now = Math.floor(Date.now() / 1000);
  let result = { success: true, message: '' };
  
  // Обрабатываем разные типы товаров
  switch (item.category) {
    case 'boosts':
    case 'multipliers':
    case 'premium':
      // Временные бусты
      const expiresAt = now + item.duration;
      await users.updateOne(
        { id: userId },
        { 
          $inc: { stars: -item.price },
          $set: { [`boosts.${itemId}`]: { expiresAt, active: true } }
        }
      );
      result.message = `${item.icon} ${item.name} активирован!`;
      break;
      
    case 'boxes':
      // Коробки с наградами
      let reward = 0;
      if (itemId === 'lucky_box') {
        reward = calculateLuckyBoxReward('lucky');
      } else if (itemId === 'mega_box') {
        reward = calculateLuckyBoxReward('mega');
      }
      
      const netGain = reward - item.price;
      const profitText = netGain > 0 ? ` (прибыль: +${netGain}⭐)` : netGain < 0 ? ` (убыток: ${netGain}⭐)` : ` (в ноль)`;
      
      await users.updateOne(
        { id: userId },
        { $inc: { stars: netGain } }
      );
      result.message = `${item.icon} Получено ${reward} звёзд!${profitText}`;
      break;
      
    case 'cosmetic':
      // Косметические предметы
      if (itemId === 'custom_title') {
        // Устанавливаем состояние для кастомного титула
        userStates.set(userId, { 
          type: 'custom_title_request',
          itemId: itemId,
          price: item.price
        });
        result.message = `${item.icon} Кастомный титул готов! Заявка будет отправлена на модерацию.`;
        result.needInput = true;
      }
      break;
  }
  
  // Добавляем покупку в историю
  await users.updateOne(
    { id: userId },
    { $push: { purchases: { itemId, price: item.price, timestamp: now } } }
  );
  
  return result;
}

// Функция для расчета награды из коробки удачи с вероятностями
function calculateLuckyBoxReward(boxType = 'lucky') {
  if (boxType === 'lucky') {
    // Обычная коробка удачи: средний выигрыш 8-12 звёзд
    const rand = Math.random() * 100;
    
    // Система вероятностей со средним выигрышем ~10 звёзд
    if (rand <= 25) return Math.floor(Math.random() * 5) + 1;   // 1-5 звёзд (25%)
    if (rand <= 45) return Math.floor(Math.random() * 5) + 6;   // 6-10 звёзд (20%)
    if (rand <= 65) return Math.floor(Math.random() * 5) + 11;  // 11-15 звёзд (20%)
    if (rand <= 80) return Math.floor(Math.random() * 5) + 16;  // 16-20 звёзд (15%)
    if (rand <= 90) return Math.floor(Math.random() * 10) + 21; // 21-30 звёзд (10%)
    if (rand <= 96) return Math.floor(Math.random() * 15) + 31; // 31-45 звёзд (6%)
    if (rand <= 99) return Math.floor(Math.random() * 25) + 46; // 46-70 звёзд (3%)
    return Math.floor(Math.random() * 30) + 71; // 71-100 звёзд (1%)
    
  } else if (boxType === 'mega') {
    // Мега коробка: средний выигрыш 60-90 звёзд
    const rand = Math.random() * 100;
    
    // Система вероятностей со средним выигрышем ~75 звёзд
    if (rand <= 20) return Math.floor(Math.random() * 15) + 20; // 20-34 звёзд (20%)
    if (rand <= 35) return Math.floor(Math.random() * 15) + 35; // 35-49 звёзд (15%)
    if (rand <= 50) return Math.floor(Math.random() * 15) + 50; // 50-64 звезды (15%)
    if (rand <= 70) return Math.floor(Math.random() * 20) + 65; // 65-84 звезды (20%)
    if (rand <= 85) return Math.floor(Math.random() * 20) + 85; // 85-104 звезды (15%)
    if (rand <= 95) return Math.floor(Math.random() * 30) + 105; // 105-134 звезды (10%)
    if (rand <= 99) return Math.floor(Math.random() * 50) + 135; // 135-184 звезды (4%)
    return Math.floor(Math.random() * 100) + 185; // 185-284 звезды (1%)
  }
  
  return 1;
}

// Функция для получения отображаемого имени пользователя
function getUserDisplayName(user, userData = null) {
  return user.username || user.first_name || `User${user.id}`;
}

// Обработка заявки на кастомный титул
async function handleCustomTitleRequest(ctx, text, userState) {
  const userId = ctx.from.id;
  
  try {
    console.log('🏷️ Обрабатываем заявку на кастомный титул:', text);
    
    const customTitle = text.trim();
    
    if (!customTitle || customTitle.length > 20) {
      await ctx.reply('❌ Титул должен содержать от 1 до 20 символов!');
      return;
    }
    
    // Проверяем на недопустимые символы или слова
    const forbiddenWords = ['админ', 'модер', 'бот', 'официал', 'staff', 'admin', 'mod'];
    const lowerTitle = customTitle.toLowerCase();
    
    if (forbiddenWords.some(word => lowerTitle.includes(word))) {
      await ctx.reply('❌ Титул содержит недопустимые слова!');
      userStates.delete(userId);
      return;
    }
    
    // Создаем заявку на кастомный титул (отправляем в канал поддержки)
    const user = await getUser(userId, ctx);
    const ticketId = new Date().getTime().toString();
    
    const ticketData = {
      id: ticketId,
      userId: userId,
      username: user.username || '',
      firstName: user.first_name || '',
      type: 'custom_title',
      content: customTitle,
      status: 'pending',
      createdAt: Math.floor(Date.now() / 1000)
    };
    
    // Сохраняем заявку в базу
    await supportTickets.insertOne(ticketData);
    
    // Отправляем в канал поддержки
    if (SUPPORT_CHANNEL) {
      const message = `🏷️ **Заявка на кастомный титул** 🏷️\n\n` +
                     `👤 **Пользователь:** ${user.first_name || user.username || `ID: ${userId}`}\n` +
                     `🆔 **ID пользователя:** ${userId}\n` +
                     `📝 **Желаемый титул:** "${customTitle}"\n` +
                     `⏰ **Время:** ${new Date().toLocaleString('ru-RU')}\n\n` +
                     `🏷️ **ID заявки:** \`${ticketId}\``;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Одобрить', `approve_title_${ticketId}`)],
        [Markup.button.callback('❌ Отклонить', `reject_title_${ticketId}`)]
      ]);
      
      try {
        await bot.telegram.sendMessage(`@${SUPPORT_CHANNEL}`, message, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      } catch (error) {
        console.error('Ошибка отправки заявки на титул в канал:', error);
      }
    }
    
    // Очищаем состояние
    userStates.delete(userId);
    
    await ctx.reply(`✅ **Заявка на кастомный титул отправлена!**\n\n` +
                    `🏷️ **Желаемый титул:** "${customTitle}"\n` +
                    `🏷️ **ID заявки:** \`${ticketId}\`\n` +
                    `⏰ **Статус:** ⏳ На рассмотрении\n\n` +
                    `Администраторы рассмотрят вашу заявку в течение 24 часов.`, 
                    { parse_mode: 'Markdown' });
    
    console.log('✅ Заявка на кастомный титул создана:', ticketId);
    
  } catch (error) {
    console.error('❌ Ошибка создания заявки на титул:', error);
    userStates.delete(userId);
    await ctx.reply('❌ Произошла ошибка при создании заявки');
  }
}

// Обработка активации промокода
async function handlePromoActivation(ctx, text, userState) {
  const userId = ctx.from.id;
  
  try {
    console.log('🎫 Активация промокода:', text);
    
    const code = text.trim().toUpperCase();
    const promo = await promocodes.findOne({ code });
    
    if (!promo) {
      await ctx.reply('❌ Промокод не найден!');
      userStates.delete(userId);
      return;
    }
    
    if (promo.used >= promo.max) {
      await ctx.reply('❌ Промокод исчерпан!');
      userStates.delete(userId);
      return;
    }
    
    const user = await getUser(userId, ctx);
    if (user.promoCodes && user.promoCodes.includes(code)) {
      await ctx.reply('❌ Вы уже использовали этот промокод!');
      userStates.delete(userId);
      return;
    }
    
    console.log('✅ Промокод валиден, выдаем награду:', promo.stars, 'Magnum Coin');
    
    // Обновляем пользователя
    await users.updateOne(
      { id: userId },
      { 
        $inc: { magnumCoins: promo.stars, promoCount: 1 },
        $addToSet: { promoCodes: code }
      }
    );
    
    // Обновляем промокод
    await promocodes.updateOne(
      { code },
      { $inc: { used: 1 } }
    );
    
    // Проверяем достижения
    await checkAndAwardAchievements(userId);
    await checkAndAwardTitles(userId);
    
    // Очищаем состояние
    userStates.delete(userId);
    
    const newBalance = Math.round((user.magnumCoins + promo.stars) * 100) / 100;
    
    await ctx.reply(`✅ **Промокод активирован!**\n\n` +
                    `[🎫 ${code}]\n` +
                    `[🪙 +${promo.stars}] Magnum Coin получено\n` +
                    `[💰 ${newBalance}] новый баланс\n\n` +
                    `🎉 Поздравляем с успешной активацией!`, 
                    { parse_mode: 'Markdown' });
    
    console.log('✅ Промокод успешно активирован пользователем:', userId);
    
  } catch (error) {
    console.error('❌ Ошибка активации промокода:', error);
    userStates.delete(userId);
    await ctx.reply('❌ Произошла ошибка при активации промокода');
  }
}

// Обработка создания промокода
async function handlePromoCreation(ctx, text, userState) {
  const userId = ctx.from.id;
  
  try {
    console.log('🎫 Обрабатываем создание промокода:', text);
    
    const parts = text.trim().split(/\s+/);
    
    if (parts.length !== 3) {
      await ctx.reply('❌ Неверный формат! Используйте: НАЗВАНИЕ МАГНУМ_КОИНЫ ЛИМИТ\n\nПример: NEWCODE 25 100');
      return;
    }
    
    const [code, stars, maxActivations] = parts;
    const starsNum = Number(stars);
    const maxNum = Number(maxActivations);
    
    if (!code || isNaN(starsNum) || isNaN(maxNum) || starsNum <= 0 || maxNum <= 0) {
      await ctx.reply('❌ Неверные данные!\n\n✅ Правильный формат:\n• НАЗВАНИЕ - любой текст\n• MAGNUM_КОИНЫ - положительное число\n• ЛИМИТ - положительное число\n\nПример: NEWCODE 25 100');
      return;
    }
    
    // Проверяем, не существует ли уже такой промокод
    const existingPromo = await promocodes.findOne({ code: code.toUpperCase() });
    if (existingPromo) {
      await ctx.reply(`❌ Промокод ${code.toUpperCase()} уже существует!`);
      userStates.delete(userId);
      return;
    }
    
    console.log('💾 Сохраняем промокод в базу:', { code: code.toUpperCase(), stars: starsNum, max: maxNum });
    
    await promocodes.insertOne({
      code: code.toUpperCase(),
      stars: starsNum,
      max: maxNum,
      used: 0,
      created: now()
    });
    
    // Очищаем состояние
    userStates.delete(userId);
    
    await ctx.reply(`✅ Промокод создан успешно!\n\n` +
                    `🏷️ **Код:** \`${code.toUpperCase()}\`\n` +
                    `🪙 **Награда:** ${starsNum} Magnum Coin\n` +
                    `🔢 **Лимит активаций:** ${maxNum}\n` +
                    `📅 **Создан:** ${new Date().toLocaleString('ru-RU')}\n\n` +
                    `📋 Пользователи могут ввести код: \`${code.toUpperCase()}\``, 
                    { parse_mode: 'Markdown' });
    
    console.log('✅ Промокод успешно создан:', code.toUpperCase());
    
  } catch (error) {
    console.error('❌ Ошибка создания промокода:', error);
    userStates.delete(userId);
    await ctx.reply('❌ Произошла ошибка при создании промокода');
  }
}

// Обработка состояний для вывода
async function handleWithdrawalState(ctx, text, userState) {
  const userId = ctx.from.id;
  
  try {
    if (userState.method === 'tg_stars' && userState.step === 'amount') {
      console.log('📊 Обрабатываем ввод суммы для Telegram Stars:', text);
      
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 100) {
        await ctx.reply('❌ Неверная сумма! Минимум для вывода: 100⭐');
        return;
      }
      
      const user = await getUser(userId, ctx);
      console.log('💰 Баланс пользователя:', user.stars, 'Запрашивает:', amount);
      
      if (user.stars < amount) {
        await ctx.reply(`❌ Недостаточно звёзд! У вас: ${Math.round(user.stars * 100) / 100}⭐`);
        userStates.delete(userId);
        return;
      }
      
      // Переходим к следующему шагу
      userStates.set(userId, { 
        type: 'withdrawal', 
        method: 'tg_stars', 
        step: 'address',
        amount: amount
      });
      
      await adminForceReply(ctx, `Введите ваш Telegram ID для получения ${amount} Telegram Stars:`);
      console.log('🔄 Переход к вводу Telegram ID');
      
    } else if (userState.method === 'tg_stars' && userState.step === 'address') {
      console.log('📋 Обрабатываем ввод Telegram ID:', text);
      
      const telegramId = text.trim();
      const amount = userState.amount;
      
      console.log('💳 Создаем заявку на сумму:', amount, 'для ID:', telegramId);
      const request = await createWithdrawalRequest(userId, 'tg_stars', amount, telegramId);
      console.log('✅ Заявка создана:', request.id);
      
      // Списываем звёзды
      await users.updateOne({ id: userId }, { $inc: { stars: -amount } });
      console.log('💸 Звёзды списаны с баланса');
      
      console.log('📤 Отправляем заявку в канал...');
      await sendWithdrawalToChannel(request);
      console.log('✅ Заявка отправлена в канал');
      
      // Очищаем состояние
      userStates.delete(userId);
      
      const confirmationMsg = await ctx.reply(`✅ **Заявка создана!**\n\n` +
                    `🏷️ **ID заявки:** \`${request.id}\`\n` +
                    `💰 **Сумма:** ${amount}⭐\n` +
                    `💸 **К получению:** ${request.netAmount}⭐\n` +
                    `⏰ **Статус:** ⏳ На рассмотрении\n\n` +
                    `Заявка отправлена администраторам. Ожидайте обработки в течение 24-48 часов.`, 
                    { parse_mode: 'Markdown' });
      
      // Сохраняем ID сообщения для удаления после одобрения
      await withdrawalRequests.updateOne(
        { id: request.id },
        { $set: { confirmationMessageId: confirmationMsg.message_id } }
      );
    }
    
  } catch (error) {
    console.error('❌ Ошибка обработки состояния вывода:', error);
    userStates.delete(userId);
    await ctx.reply('❌ Произошла ошибка при обработке заявки');
  }
}

// Функции для работы с заявками на вывод
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
    fee: Math.round(amount * 0.05 * 100) / 100, // 5% комиссия
    netAmount: Math.round((amount - amount * 0.05) * 100) / 100
  };
  
  await withdrawalRequests.insertOne(request);
  return request;
}

async function updateWithdrawalStatus(requestId, status, adminId, reason = null) {
  const update = {
    status: status,
    updatedAt: Math.floor(Date.now() / 1000),
    processedBy: adminId
  };
  
  if (reason) {
    update.rejectionReason = reason;
  }
  
  await withdrawalRequests.updateOne(
    { id: requestId },
    { $set: update }
  );
}

async function sendWithdrawalToChannel(request) {
  console.log('sendWithdrawalToChannel вызвана для заявки:', request.id);
  console.log('WITHDRAWAL_CHANNEL:', WITHDRAWAL_CHANNEL);
  
  if (!WITHDRAWAL_CHANNEL) {
    console.log('WITHDRAWAL_CHANNEL не настроен, пропускаем отправку в канал');
    return;
  }
  
  const user = await getUser(request.userId);
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
                  `📊 **Статус:** ${WITHDRAWAL_STATUSES[request.status].color} ${WITHDRAWAL_STATUSES[request.status].name}\n\n` +
                  `🏷️ **ID заявки:** \`${request.id}\``;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Одобрить', `approve_withdrawal_${request.id}`)],
    [Markup.button.callback('❌ Отклонить', `reject_withdrawal_${request.id}`)],
    [Markup.button.callback('🔄 В обработку', `process_withdrawal_${request.id}`)]
  ]);
  
  console.log('Пытаемся отправить сообщение в канал @' + WITHDRAWAL_CHANNEL);
  try {
    await bot.telegram.sendMessage(`@${WITHDRAWAL_CHANNEL}`, message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    console.log('Сообщение успешно отправлено в канал');
  } catch (error) {
    console.error('Ошибка отправки заявки в канал:', error);
  }
}

async function notifyUserWithdrawalUpdate(request, isApproved, reason = null) {
  const statusText = isApproved ? 
    `✅ **Заявка одобрена!**\n\nВаш вывод ${request.netAmount}⭐ обрабатывается. Средства поступят в течение 24-48 часов.` :
    `❌ **Заявка отклонена**\n\nПричина: ${REJECTION_REASONS[reason]?.name || 'Не указана'}\n${REJECTION_REASONS[reason]?.description || ''}`;
  
  const message = `💸 **Обновление заявки на вывод** 💸\n\n` +
                  `🏷️ **ID заявки:** \`${request.id}\`\n` +
                  `💰 **Сумма:** ${request.amount}⭐\n` +
                  `🔄 **Метод:** ${request.method}\n\n` +
                  statusText;
  
  try {
    // Удаляем сообщение о создании заявки при одобрении
    if (isApproved && request.confirmationMessageId) {
      try {
        await bot.telegram.deleteMessage(request.userId, request.confirmationMessageId);
        console.log('🗑️ Удалено сообщение о создании заявки:', request.confirmationMessageId);
      } catch (deleteError) {
        console.log('⚠️ Не удалось удалить сообщение о создании заявки:', deleteError.message);
      }
    }
    
    await bot.telegram.sendMessage(request.userId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Ошибка уведомления пользователя:', error);
  }
}

// Функции для работы со статусами
function getUserStatus(user) {
  const userStatus = user.status || 'member';
  return USER_STATUSES[userStatus] ? USER_STATUSES[userStatus] : USER_STATUSES['member'];
}

function getStatusDisplayName(user) {
  const status = getUserStatus(user);
  return status.name;
}

function createProgressBar(current, total, length = 10) {
  if (total <= 0) return '░'.repeat(length); // Избегаем деления на ноль
  const filled = Math.floor((current / total) * length);
  const empty = Math.max(0, length - filled);
  return '▓'.repeat(Math.max(0, filled)) + '░'.repeat(empty);
}

async function getDetailedProfile(userId, ctx) {
  const user = await getUser(userId);
  const starsBalance = Math.round((user.stars || 0) * 100) / 100; // Округляем до 2 знаков
  const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;
  const friends = user.invited || 0;
  const title = getUserMainTitle(user);
  const rank = getUserRank(user);
  const nextRankInfo = getNextRankInfo(user);
  const status = getUserStatus(user);
  
  // Получаем имя пользователя
  const userName = ctx ? (ctx.from.first_name || ctx.from.username || 'Игрок') : 'Игрок';
  const userInfo = ctx ? `${userName} (ID: ${ctx.from.id})` : `ID: ${userId}`;
  
  let progressText = '';
  if (nextRankInfo.next && nextRankInfo.starsToNext > 0) {
    const progressBar = createProgressBar(nextRankInfo.progress, 100) + ` ${nextRankInfo.progress}%`;
    progressText = `📊 **Прогресс ранга:**  
${progressBar}
До ${nextRankInfo.next.name}: ${nextRankInfo.starsToNext} звёзд`;
  } else {
    progressText = '🏆 **Максимальный ранг достигнут!**';
  }
  
  return `👑 **Профиль игрока MagnumTap** 👑

👋 **Приветствую, ${userInfo}!**

[💫 ${getStatusDisplayName(user)}]  
[🪙 ${magnumCoinsBalance}] Magnum Coin  
[💎 ${starsBalance}] звёзд  
[👥 ${friends}] друзей приглашено  
[🏅 ${rank.name}]  
[🏆 ${title}]

${progressText}`;
}

function getWelcomeText(magnumCoins, stars, invited) {
  return (
    "👋 Добро пожаловать в *MagnumTapBot*! 🌟\n\n" +
    "Ты в игре, где можно зарабатывать Magnum Coin 🪙, выполняя простые задания, приглашая друзей и собирая бонусы! 🚀\n\n" +
    "[🪙 " + magnumCoins + "] Magnum Coin\n" +
    "[💎 " + stars + "] звёзд\n" +
    "[👥 " + invited + "] друзей приглашено\n\n" +
    "Выбери действие и стань звездой MagnumTapBot! 🌟"
  );
}

// Задания от спонсоров (динамически заполняются из переменных)
const SPONSOR_TASKS = [
  {
    id: 'music_channel',
    title: '📱 Подписаться на канал @musice46',
    description: 'Подпишитесь на канал @musice46',
    reward: 3,
    instruction: 'Сделайте скриншот подписки на канал',
    link: 'https://t.me/musice46'
  },
  {
    id: 'firestars_bot',
    title: '🔥 Запустить бота FireStars',
    description: 'Запустите бота и получите бонус',
    reward: 3,
    instruction: 'Сделайте скриншот запуска бота',
    link: FIRESTARS_BOT_LINK
  },
  {
    id: 'farmik_bot',
    title: '⭐ Запустить бота FarmikStars',
    description: 'Запустите бота для заработка подарков',
    reward: 3,
    instruction: 'Сделайте скриншот запуска бота',
    link: FARMIK_BOT_LINK
  },
  {
    id: 'basket_game_bot',
    title: '🏀 Играть в BasketGift бота',
    description: 'Запустите бота и сыграйте в игру 3 раза',
    reward: 3,
    instruction: 'Сделайте скриншот результатов 3 игр',
    link: BASKET_BOT_LINK
  }
];

// Статусы проверки заданий
const TASK_CHECK_STATUSES = {
  'pending': { name: '⏳ На проверке', emoji: '⏳' },
  'approved': { name: '✅ Одобрено', emoji: '✅' },
  'rejected': { name: '❌ Отклонено', emoji: '❌' }
};

// Ежедневные задания
const dailyTasks = [
  { 
    id: 'login', 
    name: '👋 Ежедневный вход', 
    reward: 5, 
    description: 'Заходите в бота каждый день для получения награды',
    type: 'auto',
    icon: '👋'
  },
  { 
    id: 'farm_10', 
    name: '⚡ Активный фармер', 
    reward: 8, 
    description: 'Соберите звёзды 10 раз за день',
    type: 'farm',
    target: 10,
    icon: '⚡'
  },
  { 
    id: 'bonus', 
    name: '🎁 Ежедневный бонус', 
    reward: 12, 
    description: 'Получите ежедневный бонус звёзд',
    type: 'bonus',
    icon: '🎁'
  },
  { 
    id: 'shop_visit', 
    name: '🛒 Посетить магазин', 
    reward: 3, 
    description: 'Откройте магазин и изучите товары',
    type: 'shop',
    icon: '🛒'
  },
  { 
    id: 'top_check', 
    name: '🏆 Изучить топ', 
    reward: 3, 
    description: 'Посмотрите на лучших игроков',
    type: 'top',
    icon: '🏆'
  },
  { 
    id: 'invite_friend', 
    name: '🤝 Пригласить друга', 
    reward: 25, 
    description: 'Поделитесь рефссылкой с другом',
    type: 'invite',
    icon: '🤝'
  }
];

// Задания от спонсора
const sponsorTasks = [
  { id: 'channel1', name: 'Подписаться на @example', reward: 15, description: 'Подпишитесь на канал партнёра', url: 'https://t.me/example' },
  { id: 'website', name: 'Посетить сайт', reward: 25, description: 'Перейдите на сайт партнёра', url: 'https://example.com' }
];

async function getUserTasks(userId, isDaily = true) {
  const today = new Date().toDateString();
  let userTasks = await tasks.findOne({ 
    userId, 
    date: isDaily ? today : 'sponsor',
    type: isDaily ? 'daily' : 'sponsor'
  });
  
  if (!userTasks) {
    const taskList = isDaily ? dailyTasks : sponsorTasks;
    userTasks = {
      userId,
      date: isDaily ? today : 'sponsor',
      type: isDaily ? 'daily' : 'sponsor',
      completed: {},
      claimed: {}
    };
    taskList.forEach(task => {
      userTasks.completed[task.id] = false;
      userTasks.claimed[task.id] = false;
    });
    await tasks.insertOne(userTasks);
    
    // Сбрасываем ежедневный счетчик фармов
    if (isDaily) {
      await users.updateOne({ id: userId }, { $set: { dailyFarms: 0 } });
    }
  }
  return userTasks;
}

async function markDailyTaskCompleted(userId, taskId) {
  const today = new Date().toDateString();
  await tasks.updateOne(
    { userId, date: today, type: 'daily' },
    { $set: { [`completed.${taskId}`]: true } },
    { upsert: true }
  );
}

async function updateMainMenuBalance(ctx) {
  try {
    const menu = await getMainMenu(ctx, ctx.from.id);
    await ctx.editMessageText(menu.text, menu.extra);
  } catch (error) {
    console.error('Ошибка обновления баланса в меню:', error);
  }
}

async function getMainMenu(ctx, userId) {
  const adminRow = isAdmin(ctx.from.id) ? [[Markup.button.callback('⚙️ Админ-панель', 'admin_panel')]] : [];
  const profileText = await getDetailedProfile(userId, ctx);
  
  return {
    text: profileText,
    extra: {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🪙 Фармить Magnum Coin', 'farm'), Markup.button.callback('🎁 Бонус', 'bonus')],
        [Markup.button.callback('👤 Профиль', 'profile'), Markup.button.callback('🏆 Топ', 'top'), Markup.button.callback('🛒 Магазин', 'shop')],
        [Markup.button.callback('🎫 Промокод', 'promo')],
        [Markup.button.callback('📈 Биржа', 'exchange'), Markup.button.callback('🎯 Задания от спонсора', 'sponsor_tasks')],
        ...adminRow
      ])
    }
  };
}

bot.start(async (ctx) => {
  // Проверяем подписку
  const isSubscribed = await checkSubscription(ctx);
  if (!isSubscribed) {
    await showSubscriptionMessage(ctx);
    return;
  }
  
  const user = await getUser(ctx.from.id, ctx);
  
  // Автоматически отмечаем задание "ежедневный вход"
  await markDailyTaskCompleted(ctx.from.id, 'login');
  
  const menu = await getMainMenu(ctx, ctx.from.id);
  await ctx.reply(menu.text, menu.extra);
});

bot.action('check_subscription', async (ctx) => {
  const isSubscribed = await checkSubscription(ctx);
  if (!isSubscribed) {
    await ctx.answerCbQuery('❌ Подписка не найдена! Убедитесь, что вы подписались на канал и запустили бота.', { show_alert: true });
    return;
  }
  
  await ctx.answerCbQuery('✅ Подписка подтверждена!');
  const user = await getUser(ctx.from.id, ctx);
  const menu = await getMainMenu(ctx, ctx.from.id);
  await ctx.editMessageText(menu.text, menu.extra);
});

bot.action('main_menu', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) {}
  const menu = await getMainMenu(ctx, ctx.from.id);
  ctx.reply(menu.text, menu.extra);
});

// Обновляем профиль с кнопкой техподдержки
bot.action('profile', async (ctx) => {
  const profileText = await getDetailedProfile(ctx.from.id, ctx);

  ctx.editMessageText(profileText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🏆 Мои титулы', 'my_titles'), Markup.button.callback('🎖️ Достижения', 'achievements')],
      [Markup.button.callback('🤝 Пригласить друзей', 'invite'), Markup.button.callback('💸 Вывод звёзд', 'withdraw')],
      [Markup.button.callback('🛠️ Тех поддержка', 'support_menu'), Markup.button.callback('❓ FAQ', 'faq')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ])
  });
});

bot.action('my_titles', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const userTitles = user.titles || [];
  
  let titlesText = '🏆 **Твои титулы** 🏆\n\n';
  
  if (userTitles.length === 0 && !user.customTitle) {
    titlesText += '🆕 Пока что у тебя нет титулов.\nВыполняй задания и приглашай друзей, чтобы заработать их!';
  } else {
    // Показываем кастомный титул если есть
    if (user.customTitle) {
      const isSelected = user.selectedTitle === 'custom';
      const indicator = isSelected ? '✅' : '✨';
      titlesText += `${indicator} **${user.customTitle}** ${isSelected ? '(активен)' : ''}\n`;
      titlesText += `📝 Ваш персональный титул\n\n`;
    }
    
    // Показываем обычные титулы
    userTitles.forEach(titleId => {
      if (TITLES[titleId]) {
        const isSelected = user.selectedTitle === titleId;
        const indicator = isSelected ? '✅' : '🏆';
        titlesText += `${indicator} **${TITLES[titleId].name}** ${isSelected ? '(активен)' : ''}\n`;
        titlesText += `📝 ${TITLES[titleId].description}\n\n`;
      }
    });
  }

  const buttons = [];
  
  // Добавляем кнопку выбора титула если есть титулы
  if (userTitles.length > 0 || user.customTitle) {
    buttons.push([Markup.button.callback('✨ Выбрать главный титул', 'select_title')]);
  }
  
  buttons.push(
    [Markup.button.callback('👤 Назад к профилю', 'profile')],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  );

  ctx.editMessageText(titlesText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

// Выбор титула
bot.action('select_title', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const userTitles = user.titles || [];
  
  let msg = '✨ **Выбор главного титула** ✨\n\n';
  msg += 'Выберите титул, который будет отображаться в вашем профиле и топе:\n\n';
  
  const buttons = [];
  
  // Кастомный титул
  if (user.customTitle) {
    const isSelected = user.selectedTitle === 'custom';
    const text = `${isSelected ? '✅' : '✨'} ${user.customTitle} ${isSelected ? '(активен)' : ''}`;
    buttons.push([Markup.button.callback(text, `set_title_custom`)]);
  }
  
  // Обычные титулы
  userTitles.forEach(titleId => {
    if (TITLES[titleId]) {
      const isSelected = user.selectedTitle === titleId;
      const text = `${isSelected ? '✅' : '🏆'} ${TITLES[titleId].name} ${isSelected ? '(активен)' : ''}`;
      buttons.push([Markup.button.callback(text, `set_title_${titleId}`)]);
    }
  });
  
  // Опция "Нет титула"
  const noTitleSelected = !user.selectedTitle;
  buttons.push([Markup.button.callback(
    `${noTitleSelected ? '✅' : '🚫'} Нет титула ${noTitleSelected ? '(активен)' : ''}`, 
    'set_title_none'
  )]);
  
  buttons.push([Markup.button.callback('👤 Назад в профиль', 'profile')]);
  
  if (userTitles.length === 0 && !user.customTitle) {
    msg += '📝 У вас пока нет доступных титулов.\n\nВыполняйте задания и достижения, чтобы заработать титулы!';
  }
  
  ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

// Установка титула
bot.action(/^set_title_(.+)$/, async (ctx) => {
  const titleAction = ctx.match[1];
  const userId = ctx.from.id;
  
  let newSelectedTitle = null;
  let successMessage = '';
  
  if (titleAction === 'custom') {
    const user = await getUser(userId);
    if (user.customTitle) {
      newSelectedTitle = 'custom';
      successMessage = `✨ Установлен кастомный титул: "${user.customTitle}"`;
    } else {
      return ctx.answerCbQuery('❌ У вас нет кастомного титула!');
    }
  } else if (titleAction === 'none') {
    newSelectedTitle = null;
    successMessage = '🚫 Титул скрыт';
  } else {
    // Проверяем что у пользователя есть этот титул
    const user = await getUser(userId);
    const userTitles = user.titles || [];
    
    if (TITLES[titleAction] && userTitles.includes(titleAction)) {
      newSelectedTitle = titleAction;
      successMessage = `🏆 Установлен титул: ${TITLES[titleAction].name}`;
    } else {
      return ctx.answerCbQuery('❌ У вас нет этого титула!');
    }
  }
  
  // Обновляем выбранный титул в базе
  await users.updateOne(
    { id: userId },
    { $set: { selectedTitle: newSelectedTitle } }
  );
  
  await ctx.answerCbQuery(successMessage);
  
  // Обновляем меню выбора титула
  setTimeout(async () => {
    const updatedUser = await getUser(userId);
    const userTitles = updatedUser.titles || [];
    
    let msg = '✨ **Выбор главного титула** ✨\n\n';
    msg += 'Выберите титул, который будет отображаться в вашем профиле и топе:\n\n';
    
    const buttons = [];
    
    // Кастомный титул
    if (updatedUser.customTitle) {
      const isSelected = updatedUser.selectedTitle === 'custom';
      const text = `${isSelected ? '✅' : '✨'} ${updatedUser.customTitle} ${isSelected ? '(активен)' : ''}`;
      buttons.push([Markup.button.callback(text, `set_title_custom`)]);
    }
    
    // Обычные титулы
    userTitles.forEach(titleId => {
      if (TITLES[titleId]) {
        const isSelected = updatedUser.selectedTitle === titleId;
        const text = `${isSelected ? '✅' : '🏆'} ${TITLES[titleId].name} ${isSelected ? '(активен)' : ''}`;
        buttons.push([Markup.button.callback(text, `set_title_${titleId}`)]);
      }
    });
    
    // Опция "Нет титула"
    const noTitleSelected = !updatedUser.selectedTitle;
    buttons.push([Markup.button.callback(
      `${noTitleSelected ? '✅' : '🚫'} Нет титула ${noTitleSelected ? '(активен)' : ''}`, 
      'set_title_none'
    )]);
    
    buttons.push([Markup.button.callback('👤 Назад в профиль', 'profile')]);
    
    if (userTitles.length === 0 && !updatedUser.customTitle) {
      msg += '📝 У вас пока нет доступных титулов.\n\nВыполняйте задания и достижения, чтобы заработать титулы!';
    }
    
    ctx.editMessageText(msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  }, 500);
});

bot.action('top', async (ctx) => {
  // Отмечаем задание "изучить топ"
  await markDailyTaskCompleted(ctx.from.id, 'top_check');
  
  const topUsers = await users.find({}).sort({ stars: -1 }).limit(10).toArray();
  let msg = '🏆 **ТОП-10 ИГРОКОВ MAGNUMTAP** 🏆\n\n';
  msg += '┌─────────────────────────────────┐\n';
  msg += '│  **🏅 РЕЙТИНГ ПО ЗВЁЗДАМ** ⭐    │\n';
  msg += '└─────────────────────────────────┘\n\n';
  
  for (let i = 0; i < topUsers.length; i++) {
    const user = topUsers[i];
    
    // Получаем имя с учетом радужного эффекта
    const displayName = getUserDisplayName({ 
      username: user.username, 
      first_name: user.first_name, 
      id: user.id 
    }, user);
    
    const stars = Math.round((user.stars || 0) * 100) / 100;
    const magnumCoins = Math.round((user.magnumCoins || 0) * 100) / 100;
    const status = getUserStatus(user);
    const title = getUserMainTitle(user);
    const rank = getUserRank(user);
    
    // Медали и позиции с красивым оформлением
    let positionIcon = '';
    let divider = '';
    if (i === 0) {
      positionIcon = '👑';
      divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    } else if (i === 1) {
      positionIcon = '🥈';
      divider = '▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓';
    } else if (i === 2) {
      positionIcon = '🥉';
      divider = '░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░';
    } else {
      positionIcon = `**${i + 1}**`;
      divider = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';
    }
    
    msg += `${positionIcon} **${displayName}**\n`;
    msg += `├ [⭐ ${stars}] звёзд\n`;
    msg += `├ [🪙 ${magnumCoins}] Magnum Coin\n`;
    msg += `├ [${status.color} ${status.name}]\n`;
    msg += `├ [🏅 ${rank.name}]\n`;
    msg += `└ [🏆 ${title}]\n`;
    msg += `${divider}\n\n`;
  }
  
  if (topUsers.length === 0) {
    msg += '📭 **Пока что нет игроков в рейтинге.**\n\n';
    msg += '🎯 *Стань первым!*';
  } else {
    msg += '💡 **Подсказка:** Зарабатывайте звёзды через обмен Magnum Coin на бирже!';
  }
  
  const buttons = [
    [Markup.button.callback('🔄 Обновить', 'top')],
    [Markup.button.callback('📈 Биржа', 'exchange'), Markup.button.callback('🪙 Фармить', 'farm')],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ];
  
  ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action('invite', async (ctx) => {
  // Отмечаем задание "пригласить друга"
  await markDailyTaskCompleted(ctx.from.id, 'invite_friend');
  
  const user = await getUser(ctx.from.id);
  const refLink = `https://t.me/${ctx.me}?start=${ctx.from.id}`;
  ctx.editMessageText(
    `🤝 Пригласить друзей\n\n` +
    `Отправь эту ссылку друзьям и получай звёзды за каждого, кто присоединится!\n\n` +
    `🔗 Твоя ссылка: ${refLink}\n\n` +
    `👥 Приглашено друзей: ${user.invited || 0}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('👤 Назад в профиль', 'profile')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ])
  );
});

// Вывод звёзд
bot.action('withdraw', async (ctx) => {
  const user = await getUser(ctx.from.id, ctx);
  const balance = Math.round((user.stars || 0) * 100) / 100;
  
  const message = `💸 **Вывод звёзд** 💸\n\n` +
                  `💰 **Ваш баланс:** ${balance} ⭐ звёзд\n\n` +
                  `📋 **Доступные способы вывода:**\n` +
                  `• Telegram Stars (минимум: 100⭐)\n` +
                  `• TON Coin (минимум: 500⭐)\n` +
                  `• USDT TRC-20 (минимум: 1000⭐)\n\n` +
                  `⚠️ **Комиссия:** 5% с суммы вывода\n` +
                  `⏰ **Обработка:** 24-48 часов\n\n` +
                  `💡 Для вывода выберите способ ниже:`;
  
  const keyboard = [];
  if (balance >= 100) {
    keyboard.push([Markup.button.callback('⭐ Telegram Stars (100⭐)', 'withdraw_tg_stars')]);
  }
  if (balance >= 500) {
    keyboard.push([Markup.button.callback('💎 TON Coin (500⭐)', 'withdraw_ton')]);
  }
  if (balance >= 1000) {
    keyboard.push([Markup.button.callback('💵 USDT TRC-20 (1000⭐)', 'withdraw_usdt')]);
  }
  
  if (keyboard.length === 0) {
    keyboard.push([Markup.button.callback('❌ Недостаточно звёзд', 'withdraw_info')]);
  }
  
  keyboard.push([Markup.button.callback('👤 Назад в профиль', 'profile')]);
  
  ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(keyboard)
  });
});

// Обработчики методов вывода
bot.action('withdraw_tg_stars', async (ctx) => {
  console.log('🎯 Пользователь нажал кнопку withdraw_tg_stars, ID:', ctx.from.id);
  
  // Устанавливаем состояние пользователя
  userStates.set(ctx.from.id, { 
    type: 'withdrawal', 
    method: 'tg_stars', 
    step: 'amount' 
  });
  console.log('🔄 Установлено состояние:', userStates.get(ctx.from.id));
  
  await adminForceReply(ctx, 'Введите количество звёзд для вывода в Telegram Stars (минимум 100):');
  console.log('💬 Force reply отправлен для Telegram Stars');
});

bot.action('withdraw_ton', async (ctx) => {
  await adminForceReply(ctx, 'Введите ваш TON адрес для вывода:');
});

bot.action('withdraw_usdt', async (ctx) => {
  await adminForceReply(ctx, 'Введите ваш USDT TRC-20 адрес для вывода:');
});

bot.action('withdraw_info', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const balance = Math.round((user.stars || 0) * 100) / 100;
  
  ctx.answerCbQuery(
    `У вас ${balance}⭐. Нужно: 100⭐ для Telegram Stars, 500⭐ для TON, 1000⭐ для USDT`,
    { show_alert: true }
  );
});

// Обработчики для канала выводов (только для админов)
bot.action(/^approve_withdrawal_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа!');
  }
  
  const requestId = ctx.match[1];
  console.log('✅ Админ одобряет заявку:', requestId);
  const request = await withdrawalRequests.findOne({ id: requestId });
  console.log('📋 Статус заявки:', request?.status);
  
  if (!request) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  if (request.status !== 'pending' && request.status !== 'processing') {
    return ctx.answerCbQuery('❌ Заявка уже обработана!');
  }
  
  await updateWithdrawalStatus(requestId, 'approved', ctx.from.id);
  await notifyUserWithdrawalUpdate(request, true);
  
  // Получаем исходное сообщение без добавленных статусов
  const originalMessageLines = ctx.callbackQuery.message.text.split('\n');
  const cutOffIndex = originalMessageLines.findIndex(line => 
    line.includes('**ОДОБРЕНО**') || 
    line.includes('**ОТКЛОНЕНО**') || 
    line.includes('**В ОБРАБОТКЕ**')
  );
  
  const originalMessage = cutOffIndex > -1 ? 
    originalMessageLines.slice(0, cutOffIndex).join('\n') : 
    ctx.callbackQuery.message.text;
  
  const updatedMessage = originalMessage + 
                        `\n\n✅ **ОДОБРЕНО** администратором ${ctx.from.first_name || ctx.from.username || ctx.from.id}` +
                        `\n⏰ ${new Date().toLocaleString('ru-RU')}`;
  
  // Оставляем только кнопку главного меню для одобренных заявок
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
  
  await ctx.editMessageText(updatedMessage, { parse_mode: 'Markdown', ...keyboard });
  await ctx.answerCbQuery('✅ Заявка одобрена!');
});

bot.action(/^reject_withdrawal_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа!');
  }
  
  const requestId = ctx.match[1];
  console.log('❌ Админ отклоняет заявку:', requestId);
  const request = await withdrawalRequests.findOne({ id: requestId });
  console.log('📋 Статус заявки:', request?.status);
  
  if (!request) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  if (request.status !== 'pending' && request.status !== 'processing') {
    return ctx.answerCbQuery('❌ Заявка уже обработана!');
  }
  
  // Показываем выбор причины отклонения
  const reasons = Object.entries(REJECTION_REASONS).map(([key, reason]) => 
    [Markup.button.callback(reason.name, `reject_reason_${requestId}_${key}`)]
  );
  
  const keyboard = Markup.inlineKeyboard([
    ...reasons,
    [Markup.button.callback('🔙 Назад', `back_to_withdrawal_${requestId}`)]
  ]);
  
  await ctx.editMessageText(
    `❌ **Выберите причину отклонения заявки:**\n\n` + 
    `🏷️ **ID:** \`${requestId}\`\n` +
    `👤 **Пользователь:** ${request.firstName || request.username || request.userId}\n` +
    `💰 **Сумма:** ${request.amount}⭐`,
    { parse_mode: 'Markdown', ...keyboard }
  );
});

bot.action(/^reject_reason_(.+)_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа!');
  }
  
  const requestId = ctx.match[1];
  const reason = ctx.match[2];
  
  const request = await withdrawalRequests.findOne({ id: requestId });
  if (!request) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  // Возвращаем звёзды пользователю
  await users.updateOne({ id: request.userId }, { $inc: { stars: request.amount } });
  
  await updateWithdrawalStatus(requestId, 'rejected', ctx.from.id, reason);
  await notifyUserWithdrawalUpdate(request, false, reason);
  
  const reasonInfo = REJECTION_REASONS[reason];
  
  // Получаем исходное сообщение без добавленных статусов
  const originalMessageLines = ctx.callbackQuery.message.text.split('\n');
  const cutOffIndex = originalMessageLines.findIndex(line => 
    line.includes('**ОДОБРЕНО**') || 
    line.includes('**ОТКЛОНЕНО**') || 
    line.includes('**В ОБРАБОТКЕ**') ||
    line.includes('**Выберите причину отклонения**')
  );
  
  const originalMessage = cutOffIndex > -1 ? 
    originalMessageLines.slice(0, cutOffIndex).join('\n') : 
    ctx.callbackQuery.message.text.split('\n\n❌')[0];
  
  const updatedMessage = originalMessage + 
                        `\n\n❌ **ОТКЛОНЕНО** администратором ${ctx.from.first_name || ctx.from.username || ctx.from.id}` +
                        `\n📋 **Причина:** ${reasonInfo.name}` +
                        `\n💰 **Звёзды возвращены пользователю**` +
                        `\n⏰ ${new Date().toLocaleString('ru-RU')}`;
  
  // Оставляем только кнопку главного меню для отклоненных заявок
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
  
  await ctx.editMessageText(updatedMessage, { parse_mode: 'Markdown', ...keyboard });
  await ctx.answerCbQuery(`✅ Заявка отклонена: ${reasonInfo.name}`);
});

bot.action(/^process_withdrawal_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа!');
  }
  
  const requestId = ctx.match[1];
  console.log('🔄 Админ берет заявку в обработку:', requestId);
  const request = await withdrawalRequests.findOne({ id: requestId });
  console.log('📋 Статус заявки до обработки:', request?.status);
  
  if (!request) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  await updateWithdrawalStatus(requestId, 'processing', ctx.from.id);
  
  // Получаем исходное сообщение без добавленных статусов
  const originalMessageLines = ctx.callbackQuery.message.text.split('\n');
  const cutOffIndex = originalMessageLines.findIndex(line => 
    line.includes('**ОДОБРЕНО**') || 
    line.includes('**ОТКЛОНЕНО**') || 
    line.includes('**В ОБРАБОТКЕ**')
  );
  
  const originalMessage = cutOffIndex > -1 ? 
    originalMessageLines.slice(0, cutOffIndex).join('\n') : 
    ctx.callbackQuery.message.text;
  
  const updatedMessage = originalMessage + 
                        `\n\n🔄 **В ОБРАБОТКЕ** администратором ${ctx.from.first_name || ctx.from.username || ctx.from.id}` +
                        `\n⏰ ${new Date().toLocaleString('ru-RU')}`;
  
  // Оставляем все кнопки
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Одобрить', `approve_withdrawal_${request.id}`)],
    [Markup.button.callback('❌ Отклонить', `reject_withdrawal_${request.id}`)],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
  
  await ctx.editMessageText(updatedMessage, { parse_mode: 'Markdown', ...keyboard });
  await ctx.answerCbQuery('🔄 Заявка взята в обработку!');
});

bot.action(/^back_to_withdrawal_(.+)$/, async (ctx) => {
  const requestId = ctx.match[1];
  const request = await withdrawalRequests.findOne({ id: requestId });
  
  if (!request) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  // Возвращаем исходное сообщение с кнопками
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
                  `📊 **Статус:** ${WITHDRAWAL_STATUSES[request.status].color} ${WITHDRAWAL_STATUSES[request.status].name}\n\n` +
                  `🏷️ **ID заявки:** \`${request.id}\``;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Одобрить', `approve_withdrawal_${request.id}`)],
    [Markup.button.callback('❌ Отклонить', `reject_withdrawal_${request.id}`)],
    [Markup.button.callback('🔄 В обработку', `process_withdrawal_${request.id}`)]
  ]);
  
  await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
});

// Обработчики кастомных титулов
bot.action(/^approve_title_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа!');
  }
  
  const ticketId = ctx.match[1];
  const ticket = await supportTickets.findOne({ id: ticketId });
  
  if (!ticket) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  // Выдаем кастомный титул пользователю
  await users.updateOne(
    { id: ticket.userId },
    { $set: { customTitle: ticket.content } }
  );
  
  // Обновляем статус заявки
  await supportTickets.updateOne(
    { id: ticketId },
    { $set: { status: 'approved', processedBy: ctx.from.id, processedAt: Math.floor(Date.now() / 1000) } }
  );
  
  // Уведомляем пользователя
  try {
    await bot.telegram.sendMessage(ticket.userId, 
      `✅ **Кастомный титул одобрен!**\n\n` +
      `🏷️ **Ваш новый титул:** "${ticket.content}"\n` +
      `🎉 Поздравляем! Титул активирован в вашем профиле.`, 
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Ошибка уведомления о титуле:', error);
  }
  
  const updatedMessage = ctx.callbackQuery.message.text + 
    `\n\n✅ **ОДОБРЕНО** администратором ${ctx.from.first_name || ctx.from.username || ctx.from.id}` +
    `\n⏰ ${new Date().toLocaleString('ru-RU')}`;
  
  await ctx.editMessageText(updatedMessage, { parse_mode: 'Markdown' });
  await ctx.answerCbQuery('✅ Кастомный титул одобрен!');
});

bot.action(/^reject_title_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Нет доступа!');
  }
  
  const ticketId = ctx.match[1];
  const ticket = await supportTickets.findOne({ id: ticketId });
  
  if (!ticket) {
    return ctx.answerCbQuery('❌ Заявка не найдена!');
  }
  
  // Обновляем статус заявки
  await supportTickets.updateOne(
    { id: ticketId },
    { $set: { status: 'rejected', processedBy: ctx.from.id, processedAt: Math.floor(Date.now() / 1000) } }
  );
  
  // Возвращаем звёзды пользователю (стоимость кастомного титула)
  await users.updateOne(
    { id: ticket.userId },
    { $inc: { stars: 500 } } // Предполагаем что кастомный титул стоит 500 звёзд
  );
  
  // Уведомляем пользователя
  try {
    await bot.telegram.sendMessage(ticket.userId, 
      `❌ **Заявка на кастомный титул отклонена**\n\n` +
      `🏷️ **Титул:** "${ticket.content}"\n` +
      `📋 **Причина:** Не соответствует правилам сообщества\n` +
      `💰 **Возврат:** 500⭐ возвращены на ваш баланс`, 
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Ошибка уведомления об отклонении титула:', error);
  }
  
  const updatedMessage = ctx.callbackQuery.message.text + 
    `\n\n❌ **ОТКЛОНЕНО** администратором ${ctx.from.first_name || ctx.from.username || ctx.from.id}` +
    `\n💰 **Средства возвращены пользователю**` +
    `\n⏰ ${new Date().toLocaleString('ru-RU')}`;
  
  await ctx.editMessageText(updatedMessage, { parse_mode: 'Markdown' });
  await ctx.answerCbQuery('❌ Заявка на титул отклонена');
});

// Обработчик кнопки отмены
bot.action('admin_cancel', async (ctx) => {
  // Очищаем состояние пользователя
  userStates.delete(ctx.from.id);
  console.log('🗑️ Состояние пользователя очищено:', ctx.from.id);
  
  await ctx.deleteMessage();
  await ctx.answerCbQuery('❌ Операция отменена');
});

// Магазин
bot.action('shop', async (ctx) => {
  const user = await getUser(ctx.from.id);
  
  // Отмечаем задание "посетить магазин"
  await markDailyTaskCompleted(ctx.from.id, 'shop_visit');
  
  const activeBoosts = getActiveBoosts(user);
  const categories = getShopCategories();
  
  let boostInfo = '';
  if (Object.keys(activeBoosts).length > 0) {
    boostInfo = '\n🔥 **Активные бусты:**\n';
    Object.entries(activeBoosts).forEach(([type, data]) => {
      const item = SHOP_ITEMS[type];
      if (item) {
        const timeLeft = data.expiresAt - Math.floor(Date.now() / 1000);
        const hours = Math.floor(timeLeft / 3600);
        const minutes = Math.floor((timeLeft % 3600) / 60);
        boostInfo += `${item.icon} ${item.name} — `;
        if (hours > 0) boostInfo += `${hours}ч `;
        boostInfo += `${minutes}мин\n`;
      }
    });
    boostInfo += '\n';
  }
  
  const message = `🛒 **Магазин MagnumTap** 🛒\n\n` +
                  `💰 **Ваш баланс:** ${Math.round((user.stars || 0) * 100) / 100} ⭐ звёзд\n` +
                  boostInfo +
                  `🏪 **Выберите категорию товаров:**`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⚡ Бусты и множители', 'shop_boosts')],
    [Markup.button.callback('🎲 Коробки удачи', 'shop_boxes')],
    [Markup.button.callback('🌈 Косметика', 'shop_cosmetic')],
    [Markup.button.callback('👑 Премиум', 'shop_premium')],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
  
  ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
});

// Категории магазина
bot.action(/^shop_(.+)$/, async (ctx) => {
  const category = ctx.match[1];
  const user = await getUser(ctx.from.id);
  
  const categoryNames = {
    'boosts': '⚡ Бусты и множители',
    'boxes': '🎲 Коробки удачи', 
    'cosmetic': '🌈 Косметика',
    'premium': '👑 Премиум товары'
  };
  
  let items = [];
  Object.entries(SHOP_ITEMS).forEach(([id, item]) => {
    if ((category === 'boosts' && ['boosts', 'multipliers'].includes(item.category)) ||
        (category === 'boxes' && item.category === 'boxes') ||
        (category === 'cosmetic' && item.category === 'cosmetic') ||
        (category === 'premium' && item.category === 'premium')) {
      items.push({ id, ...item });
    }
  });
  
  let message = `${categoryNames[category]} 🛒\n\n`;
  message += `💰 **Баланс:** ${Math.round((user.stars || 0) * 100) / 100} ⭐ звёзд\n\n`;
  

  
  items.forEach(item => {
    const canAfford = user.stars >= item.price ? '✅' : '❌';
    message += `${canAfford} **${item.name}**\n`;
    message += `   ${item.description}\n`;
    message += `   💰 Цена: ${item.price} ⭐ звёзд\n\n`;
  });
  
  const keyboard = [];
  items.forEach(item => {
    keyboard.push([Markup.button.callback(
      `${item.icon} ${item.name} — ${item.price}⭐`, 
      `buy_${item.id}`
    )]);
  });
  keyboard.push([Markup.button.callback('🔙 Назад в магазин', 'shop')]);
  
  ctx.editMessageText(message, { 
    parse_mode: 'Markdown', 
    ...Markup.inlineKeyboard(keyboard) 
  });
});

// Покупка товара
bot.action(/^buy_(.+)$/, async (ctx) => {
  const itemId = ctx.match[1];
  const item = SHOP_ITEMS[itemId];
  
  if (!item) {
    await ctx.answerCbQuery('❌ Товар не найден!');
    return;
  }
  
  const user = await getUser(ctx.from.id);
  if (user.stars < item.price) {
    await ctx.answerCbQuery('❌ Недостаточно звёзд для покупки!', { show_alert: true });
    return;
  }
  
  const result = await purchaseItem(ctx.from.id, itemId);
  
  if (result.success) {
    await ctx.answerCbQuery(`✅ ${result.message}`, { show_alert: true });
    
    if (result.needInput) {
      // Для кастомного титула запрашиваем ввод
      await adminForceReply(ctx, `🏷️ Введите желаемый титул (максимум 20 символов):`);
      return;
    }
    
    // Обновляем отображение магазина
    setTimeout(() => {
      ctx.editMessageText('🛒 Покупка завершена! Возвращаемся в магазин...', 
        Markup.inlineKeyboard([[Markup.button.callback('🛒 Открыть магазин', 'shop')]]));
    }, 1000);
  } else {
    await ctx.answerCbQuery(`❌ ${result.message}`, { show_alert: true });
  }
});

// Промокоды (минималистично, если не нужны — удалить этот блок)
const promoCodes = { 'MAGNUM10': 10, 'STAR50': 50 };
const userPromoUsed = {};
bot.action('promo', async (ctx) => {
  // Проверяем подписку
  const isSubscribed = await checkSubscription(ctx);
  if (!isSubscribed) {
    await showSubscriptionMessage(ctx);
    return;
  }
  
  // Устанавливаем состояние для активации промокода
  userStates.set(ctx.from.id, { 
    type: 'activate_promo' 
  });
  console.log('🎫 Пользователь начинает активацию промокода:', ctx.from.id);
  
  await adminForceReply(ctx, '🎫 Введите промокод:');
});

// Обработчик фото для заданий
bot.on('photo', async (ctx) => {
  try {
    const replyToMessage = ctx.message.reply_to_message;
    if (!replyToMessage) return;
    
    const replyText = replyToMessage.text || '';
    
    // Отправка скриншота для проверки задания
    if (replyText.includes('Подтверждение выполнения задания')) {
             console.log('Обрабатываем скриншот. Текст сообщения:', replyText);
       
       // Ищем ID задания в тексте
       const taskIdMatch = replyText.match(/🆔 ID задания: (\w+)/);
       
       console.log('Найденный ID задания:', taskIdMatch);
       
       if (!taskIdMatch) {
         console.log('Не удалось найти ID задания в тексте:', replyText);
         return ctx.reply('❌ Не удалось определить задание. Попробуйте начать заново.');
       }
       
       const taskId = taskIdMatch[1];
       console.log('Ищем задание с ID:', taskId);
       
       const task = SPONSOR_TASKS.find(t => {
         console.log('Сравниваем с ID:', t.id);
         return t.id === taskId;
       });
      
      if (!task) {
        return ctx.reply('❌ Задание не найдено');
      }
      
      // Получаем фото
      const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      
      // Создаем проверку задания
      const taskCheck = await createTaskCheck(
        ctx.from.id,
        ctx.from.username,
        task.id,
        task.title,
        photo
      );
      
      // Отправляем в канал поддержки
      await sendTaskCheckToChannel(taskCheck);
      
      ctx.reply(
        `✅ *Задание отправлено на проверку!*\n\n` +
        `📋 *Задание:* ${task.title}\n` +
        `🎫 *ID проверки:* \`${taskCheck._id.toString().slice(-6)}\`\n` +
        `📅 *Дата:* ${new Date().toLocaleString('ru-RU')}\n\n` +
        `⏳ Ожидайте результата проверки администратором в течение 24 часов.`,
        { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 Задания спонсоров', 'sponsor_tasks')],
            [Markup.button.callback('🏠 Главное меню', 'main_menu')]
          ])
        }
      );
      return;
    }
  } catch (error) {
    console.error('Ошибка обработки фото:', error);
    ctx.reply('❌ Произошла ошибка при отправке скриншота. Попробуйте еще раз.');
  }
});

bot.on('text', async (ctx) => {
  console.log('📨 Получено текстовое сообщение от:', ctx.from.id, ctx.from.first_name);
  console.log('📝 Текст сообщения:', ctx.message.text);
  console.log('🔗 Есть ли reply_to_message:', !!ctx.message.reply_to_message);
  
  if (ctx.message.reply_to_message) {
    console.log('💬 Reply to text:', ctx.message.reply_to_message.text);
  }

  const text = ctx.message.text;
  const userId = ctx.from.id;
  
  console.log('✅ Text handler triggered:');
  console.log('📝 Text:', text);
  
  // Проверяем состояние пользователя
  const userState = userStates.get(userId);
  console.log('🔄 Состояние пользователя:', userState);
  
  // Если есть состояние, обрабатываем через него
  if (userState && userState.type === 'withdrawal') {
    console.log('💳 Обрабатываем вывод через состояние');
    await handleWithdrawalState(ctx, text, userState);
    return;
  }
  
  if (userState && userState.type === 'admin_create_promo') {
    console.log('🎫 Обрабатываем создание промокода через состояние');
    await handlePromoCreation(ctx, text, userState);
    return;
  }
  
  if (userState && userState.type === 'activate_promo') {
    console.log('🎫 Обрабатываем активацию промокода через состояние');
    await handlePromoActivation(ctx, text, userState);
    return;
  }
  
  if (userState && userState.type === 'custom_title_request') {
    console.log('🏷️ Обрабатываем заявку на кастомный титул через состояние');
    await handleCustomTitleRequest(ctx, text, userState);
    return;
  }
  
  // Если нет состояния, проверяем reply_to_message (старый способ)
  const replyMsg = ctx.message.reply_to_message;
  if (!replyMsg) {
    console.log('❌ Нет reply_to_message и состояния, пропускаем обработку');
    return;
  }

  const replyText = replyMsg.text;
  console.log('💬 Reply text:', replyText);

  try {
    // Обработка заявок на вывод
    if (replyText.includes('Введите количество звёзд для вывода в Telegram Stars (минимум 100)')) {
      console.log('Обрабатываем ввод суммы для Telegram Stars:', text);
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 100) {
        return ctx.reply('❌ Неверная сумма! Минимум для вывода: 100⭐');
      }
      
      const user = await getUser(ctx.from.id, ctx);
      console.log('Баланс пользователя:', user.stars, 'Запрашивает:', amount);
      if (user.stars < amount) {
        return ctx.reply(`❌ Недостаточно звёзд! У вас: ${Math.round(user.stars * 100) / 100}⭐`);
      }
      
      await adminForceReply(ctx, `Введите ваш Telegram ID для получения ${amount} Telegram Stars:`);
      return;
    }
    
    if (replyText.includes('Введите ваш Telegram ID для получения') && replyText.includes('Telegram Stars')) {
      console.log('Обрабатываем ввод Telegram ID:', text);
      console.log('Reply text:', replyText);
      const telegramId = text.trim();
      const amountMatch = replyText.match(/(\d+(?:\.\d+)?)/);
      if (!amountMatch) return ctx.reply('❌ Ошибка обработки суммы!');
      
      const amount = parseFloat(amountMatch[1]);
      console.log('Создаем заявку на сумму:', amount, 'для ID:', telegramId);
      const request = await createWithdrawalRequest(ctx.from.id, 'tg_stars', amount, telegramId);
      console.log('Заявка создана:', request.id);
      
      // Списываем звёзды
      await users.updateOne({ id: ctx.from.id }, { $inc: { stars: -amount } });
      console.log('Звёзды списаны с баланса');
      
      console.log('Отправляем заявку в канал...');
      await sendWithdrawalToChannel(request);
      console.log('Заявка отправлена в канал');
      
      ctx.reply(`✅ **Заявка создана!**\n\n` +
                `🏷️ **ID заявки:** \`${request.id}\`\n` +
                `💰 **Сумма:** ${amount}⭐\n` +
                `💸 **К получению:** ${request.netAmount}⭐\n` +
                `⏰ **Статус:** ⏳ На рассмотрении\n\n` +
                `Заявка отправлена администраторам. Ожидайте обработки в течение 24-48 часов.`, 
                { parse_mode: 'Markdown' });
      return;
    }
    
         if (replyText.includes('Введите ваш TON адрес для вывода:')) {
      const address = text.trim();
      if (address.length < 10) {
        return ctx.reply('❌ Неверный TON адрес!');
      }
      
             await adminForceReply(ctx, `Введите количество звёзд для вывода в TON (минимум 500):`);
      return;
    }
    
         if (replyText.includes('Введите количество звёзд для вывода в TON (минимум 500)')) {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 500) {
        return ctx.reply('❌ Неверная сумма! Минимум для вывода в TON: 500⭐');
      }
      
      const user = await getUser(ctx.from.id, ctx);
      if (user.stars < amount) {
        return ctx.reply(`❌ Недостаточно звёзд! У вас: ${Math.round(user.stars * 100) / 100}⭐`);
      }
      
      // Получаем адрес из предыдущего сообщения
      const messages = await ctx.telegram.getUpdates();
      // Используем временное решение - запрашиваем адрес заново
             await adminForceReply(ctx, `Подтвердите TON адрес для вывода ${amount}⭐:`);
      return;
    }
    
    if (replyText.includes('Подтвердите TON адрес для вывода')) {
      const address = text.trim();
      const amountMatch = replyText.match(/(\d+(?:\.\d+)?)/);
      if (!amountMatch) return ctx.reply('❌ Ошибка обработки суммы!');
      
      const amount = parseFloat(amountMatch[1]);
      const request = await createWithdrawalRequest(ctx.from.id, 'ton', amount, address);
      
      // Списываем звёзды
      await users.updateOne({ id: ctx.from.id }, { $inc: { stars: -amount } });
      
      await sendWithdrawalToChannel(request);
      
      ctx.reply(`✅ **Заявка создана!**\n\n` +
                `🏷️ **ID заявки:** \`${request.id}\`\n` +
                `💰 **Сумма:** ${amount}⭐\n` +
                `💸 **К получению:** ${request.netAmount}⭐\n` +
                `⏰ **Статус:** ⏳ На рассмотрении\n\n` +
                `Заявка отправлена администраторам. Ожидайте обработки в течение 24-48 часов.`, 
                { parse_mode: 'Markdown' });
      return;
    }
    
         if (replyText.includes('Введите ваш USDT TRC-20 адрес для вывода:')) {
      const address = text.trim();
      if (address.length < 10) {
        return ctx.reply('❌ Неверный USDT адрес!');
      }
      
             await adminForceReply(ctx, `Введите количество звёзд для вывода в USDT (минимум 1000):`);
      return;
    }
    
         if (replyText.includes('Введите количество звёзд для вывода в USDT (минимум 1000)')) {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 1000) {
        return ctx.reply('❌ Неверная сумма! Минимум для вывода в USDT: 1000⭐');
      }
      
      const user = await getUser(ctx.from.id, ctx);
      if (user.stars < amount) {
        return ctx.reply(`❌ Недостаточно звёзд! У вас: ${Math.round(user.stars * 100) / 100}⭐`);
      }
      
             await adminForceReply(ctx, `Подтвердите USDT TRC-20 адрес для вывода ${amount}⭐:`);
      return;
    }
    
    if (replyText.includes('Подтвердите USDT TRC-20 адрес для вывода')) {
      const address = text.trim();
      const amountMatch = replyText.match(/(\d+(?:\.\d+)?)/);
      if (!amountMatch) return ctx.reply('❌ Ошибка обработки суммы!');
      
      const amount = parseFloat(amountMatch[1]);
      const request = await createWithdrawalRequest(ctx.from.id, 'usdt', amount, address);
      
      // Списываем звёзды
      await users.updateOne({ id: ctx.from.id }, { $inc: { stars: -amount } });
      
      await sendWithdrawalToChannel(request);
      
      ctx.reply(`✅ **Заявка создана!**\n\n` +
                `🏷️ **ID заявки:** \`${request.id}\`\n` +
                `💰 **Сумма:** ${amount}⭐\n` +
                `💸 **К получению:** ${request.netAmount}⭐\n` +
                `⏰ **Статус:** ⏳ На рассмотрении\n\n` +
                `Заявка отправлена администраторам. Ожидайте обработки в течение 24-48 часов.`, 
                { parse_mode: 'Markdown' });
      return;
    }
    
    // Создание заявки в техподдержку
    if (replyText.includes('ТЕХНИЧЕСКАЯ ПОДДЕРЖКА') && replyText.includes('Опишите вашу проблему')) {
      const ticket = await createSupportTicket(
        ctx.from.id,
        ctx.from.username,
        text
      );
      
      // Отправляем в канал поддержки
      await sendTicketToChannel(ticket);
      
      ctx.reply(
        `✅ **Заявка создана успешно!**\n\n` +
        `🎫 **ID заявки:** \`${ticket._id.toString().slice(-6)}\`\n` +
        `📅 **Дата:** ${new Date().toLocaleString('ru-RU')}\n\n` +
        `💬 **Ваше сообщение:**\n${text}\n\n` +
        `⚡ Мы рассмотрим вашу заявку в течение 24 часов и уведомим о статусе.`,
        { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 Мои заявки', 'my_tickets')],
            [Markup.button.callback('🛠️ Меню поддержки', 'support_menu')]
          ])
        }
      );
      return;
    }



    // Админские команды
    if (isAdmin(ctx.from.id)) {
      if (replyText.includes('Ответ пользователю по заявке')) {
        const ticketIdMatch = replyText.match(/#([a-f0-9]{6})/);
        if (!ticketIdMatch) {
          return ctx.reply('❌ Не удалось найти ID заявки!');
        }
        
        const shortTicketId = ticketIdMatch[1];
        
        // Ищем заявку по короткому ID (последние 6 символов ObjectId)
        const tickets = await supportTickets.find({}).toArray();
        const ticket = tickets.find(t => t._id.toString().slice(-6) === shortTicketId);
        
        if (!ticket) {
          return ctx.reply('❌ Заявка не найдена!');
        }

        // Обновляем заявку с ответом админа
        await updateTicketStatus(ticket._id, 'in_progress', text);

        // Отправляем ответ пользователю
        try {
          await bot.telegram.sendMessage(ticket.userId,
            `💬 *Ответ от техподдержки*\n\n` +
            `🎫 *По заявке #${shortTicketId}:*\n` +
            `${text}\n\n` +
            `📝 *Ваша исходная заявка:* ${ticket.message}\n\n` +
            `⚡ При необходимости создайте новую заявку через профиль.`,
            { parse_mode: 'Markdown' }
          );
          
          // Обновляем сообщение в канале
          await updateTicketInChannel(ticket._id);
          
          ctx.reply(`✅ Ответ отправлен пользователю ${ticket.username || ticket.userId}`);
        } catch (error) {
          console.error('Ошибка отправки ответа:', error);
          ctx.reply('❌ Ошибка отправки ответа пользователю');
        }
        return;
      }

      if (replyText.includes('Поиск заявки')) {
        // Функция поиска заявок временно отключена
        return ctx.reply('❌ Функция поиска заявок временно недоступна.');
      }

      if (replyText.includes('Ответ по проверке задания')) {
        const checkIdMatch = replyText.match(/#([a-f0-9]{6})/);
        if (!checkIdMatch) {
          return ctx.reply('❌ Не удалось найти ID проверки!');
        }
        
        const shortCheckId = checkIdMatch[1];
        
        // Ищем проверку по короткому ID
        const taskChecks_list = await taskChecks.find({}).toArray();
        const taskCheck = taskChecks_list.find(tc => tc._id.toString().slice(-6) === shortCheckId);
        
        if (!taskCheck) {
          return ctx.reply('❌ Проверка задания не найдена!');
        }

        // Обновляем проверку с ответом админа
        await updateTaskCheckStatus(taskCheck._id, taskCheck.status, text);

        // Отправляем ответ пользователю
        try {
          await bot.telegram.sendMessage(taskCheck.userId,
            `💬 *Комментарий по проверке задания*\n\n` +
            `🎫 *По проверке #${shortCheckId}:*\n` +
            `📋 *Задание:* ${taskCheck.taskTitle}\n\n` +
            `💬 *Комментарий администратора:*\n${text}`,
            { parse_mode: 'Markdown' }
          );
          
          // Обновляем сообщение в канале
          await updateTaskCheckInChannel(taskCheck._id);
          
          ctx.reply(`✅ Комментарий отправлен пользователю ${taskCheck.username || taskCheck.userId}`);
        } catch (error) {
          console.error('Ошибка отправки комментария:', error);
          ctx.reply('❌ Ошибка отправки комментария пользователю');
        }
        return;
      }
      
      // Временная команда для тестирования бонуса
      if (text === '/reset_bonus' && isAdmin(ctx.from.id)) {
        await users.updateOne({ id: ctx.from.id }, { $set: { lastBonus: 0 } });
        return ctx.reply('✅ Бонус сброшен, можете тестировать');
      }

      // Остальные админские команды...
      if (replyText.includes('Выдача титула')) {
        const [userId, titleId] = text.split(' ');
        if (!userId || !titleId || !TITLES[titleId]) {
          return ctx.reply('❌ Неверный формат или несуществующий титул!');
        }

        await users.updateOne(
          { id: parseInt(userId) },
          { $addToSet: { titles: titleId } }
        );
        
        ctx.reply(`✅ Титул "${TITLES[titleId].name}" выдан пользователю ${userId}!`);
      }
      
      else if (replyText.includes('Забрать титул')) {
        const [userId, titleId] = text.split(' ');
        if (!userId || !titleId || !TITLES[titleId]) {
          return ctx.reply('❌ Неверный формат или несуществующий титул!');
        }

        await users.updateOne(
          { id: parseInt(userId) },
          { $pull: { titles: titleId } }
        );
        
        ctx.reply(`✅ Титул "${TITLES[titleId].name}" забран у пользователя ${userId}!`);
      }
      
      else if (replyText.includes('Титулы пользователя')) {
        const userId = parseInt(text);
        const user = await users.findOne({ id: userId });
        
        if (!user) {
          return ctx.reply('❌ Пользователь не найден!');
        }

        const userTitles = user.titles || [];
        let titlesList = `👤 **Титулы пользователя ${userId}:**\n\n`;
        
        if (userTitles.length === 0) {
          titlesList += '🚫 У пользователя нет титулов';
        } else {
          userTitles.forEach(titleId => {
            if (TITLES[titleId]) {
              titlesList += `${TITLES[titleId].name}\n`;
            }
          });
        }

        ctx.reply(titlesList, { parse_mode: 'Markdown' });
      }

      // Управление статусами
      else if (replyText.includes('Выдача статуса') && replyText.includes('ID СТАТУС')) {
        const [userId, statusKey] = text.split(' ');
        if (!userId || !statusKey || !USER_STATUSES[statusKey]) {
          return ctx.reply('❌ Неверный формат или несуществующий статус!\n\nДоступные статусы: owner, admin, moderator, vip_gold, vip, verified, member');
        }

        await users.updateOne(
          { id: parseInt(userId) },
          { $set: { status: statusKey } }
        );
        
        ctx.reply(`✅ Статус "${USER_STATUSES[statusKey].name}" выдан пользователю ${userId}!`);
      }
      
      else if (replyText.includes('Сброс статуса') && replyText.includes('обычному участнику')) {
        const userId = parseInt(text);
        if (!userId) {
          return ctx.reply('❌ Введите корректный ID пользователя!');
        }

        await users.updateOne(
          { id: userId },
          { $set: { status: 'member' } }
        );
        
        ctx.reply(`✅ Статус пользователя ${userId} сброшен к обычному участнику!`);
      }
      
      else if (replyText.includes('Проверка статуса') && replyText.includes('просмотра его статуса')) {
        const userId = parseInt(text);
        const user = await users.findOne({ id: userId });
        
        if (!user) {
          return ctx.reply('❌ Пользователь не найден!');
        }

        const currentStatus = getUserStatus(user);
        ctx.reply(
          `👤 **Статус пользователя ${userId}:**\n\n` +
          `${currentStatus.color} **${currentStatus.name}**\n` +
          `└ ${currentStatus.description}\n\n` +
          `📊 **Приоритет:** ${currentStatus.priority}`,
          { parse_mode: 'Markdown' }
        );
      }

      // Рассылка
      else if (replyText.includes('текст для рассылки')) {
        const allUsers = await users.find().toArray();
        let sent = 0;
        for (const u of allUsers) {
          try { 
            await ctx.telegram.sendMessage(u.id, `📢 Сообщение от администрации:\n\n${text}`); 
            sent++; 
          } catch {}
        }
        ctx.reply(`✅ Рассылка завершена. Доставлено: ${sent} пользователям.`);
      }

      // Промокод
      else if (replyText.includes('Введите данные промокода в формате: НАЗВАНИЕ ЗВЁЗДЫ ЛИМИТ')) {
        const parts = text.trim().split(/\s+/);
        
        if (parts.length !== 3) {
          return ctx.reply('❌ Неверный формат! Используйте: НАЗВАНИЕ ЗВЁЗДЫ ЛИМИТ\n\nПример: NEWCODE 25 100');
        }
        
        const [code, stars, maxActivations] = parts;
        const starsNum = Number(stars);
        const maxNum = Number(maxActivations);
        
        if (!code || isNaN(starsNum) || isNaN(maxNum) || starsNum <= 0 || maxNum <= 0) {
          return ctx.reply('❌ Неверные данные!\n\n✅ Правильный формат:\n• НАЗВАНИЕ - любой текст\n• ЗВЁЗДЫ - положительное число\n• ЛИМИТ - положительное число\n\nПример: NEWCODE 25 100');
        }
        
        // Проверяем, не существует ли уже такой промокод
        const existingPromo = await promocodes.findOne({ code: code.toUpperCase() });
        if (existingPromo) {
          return ctx.reply(`❌ Промокод ${code.toUpperCase()} уже существует!`);
        }
        
        await promocodes.insertOne({
          code: code.toUpperCase(),
          stars: starsNum,
          max: maxNum,
          used: 0,
          created: now()
        });
        
        ctx.reply(`✅ Промокод создан успешно!\n\n` +
                  `🏷️ **Код:** ${code.toUpperCase()}\n` +
                  `⭐ **Награда:** ${starsNum} звёзд\n` +
                  `🔢 **Лимит активаций:** ${maxNum}\n` +
                  `📅 **Создан:** ${new Date().toLocaleString('ru-RU')}`, 
                  { parse_mode: 'Markdown' });
      }

      // Выдать/забрать звёзды
      else if (replyText.includes('ID пользователя и количество звёзд')) {
        const [id, stars] = text.trim().split(/\s+/);
        if (!id || isNaN(Number(stars))) {
          return ctx.reply('❌ Формат: ID 10');
        }
        await users.updateOne({ id: Number(id) }, { $inc: { stars: Number(stars) } });
        ctx.reply(`✅ Пользователю ${id} выдано/забрано ${stars} звёзд.`);
      }

      // Рефералы пользователя
      else if (replyText.includes('для просмотра его рефералов')) {
        const id = text.trim();
        const refs = await users.find({ invitedBy: id }).toArray();
        if (!refs.length) {
          return ctx.reply('У пользователя нет рефералов.');
        }
        let msg = `👥 Рефералы пользователя ${id}:\n\n`;
        refs.forEach((u, i) => { msg += `${i + 1}. ${u.id}\n`; });
        ctx.reply(msg);
      }
    }

    // Промокод для всех пользователей
    else if (replyText.includes('Введите промокод:')) {
      const code = text.trim().toUpperCase();
      const promo = await promocodes.findOne({ code });
      
      if (!promo) {
        return ctx.reply('❌ Промокод не найден!');
      }
      
      if (promo.used >= promo.max) {
        return ctx.reply('❌ Промокод исчерпан!');
      }

      const user = await getUser(ctx.from.id);
      const userPromos = user.usedPromos || [];
      
      if (userPromos.includes(code)) {
        return ctx.reply('❌ Вы уже использовали этот промокод!');
      }

      await users.updateOne(
        { id: ctx.from.id },
        { 
          $inc: { stars: promo.stars, promoCount: 1 },
          $addToSet: { usedPromos: code }
        }
      );
      await promocodes.updateOne({ code }, { $inc: { used: 1 } });

      // Проверяем новые титулы и достижения
      const newTitles = await checkAndAwardTitles(ctx.from.id);
      const newAchievements = await checkAndAwardAchievements(ctx.from.id);
      
      if (newTitles.length > 0 && newAchievements.length > 0) {
        ctx.reply(`🎉 Промокод активирован! Получено ${promo.stars} звёзд! 🏆 Новый титул! 🎖️ Достижение!`);
      } else if (newTitles.length > 0) {
        ctx.reply(`🎉 Промокод активирован! Получено ${promo.stars} звёзд! 🏆 Новый титул получен!`);
      } else if (newAchievements.length > 0) {
        ctx.reply(`🎉 Промокод активирован! Получено ${promo.stars} звёзд! 🎖️ ${newAchievements[0].name}!`);
      } else {
        ctx.reply(`🎉 Промокод активирован! Получено ${promo.stars} звёзд!`);
      }
    }

  } catch (error) {
    ctx.reply('❌ Произошла ошибка при обработке команды!');
  }
});

bot.action('admin_panel', async (ctx) => {
  const adminText = '⚙️ *Админ-панель* ⚙️\n\n🎛️ Выберите действие:';

  ctx.editMessageText(adminText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📢 Рассылка', 'admin_broadcast'), Markup.button.callback('🎫 Промокод', 'admin_addpromo')],
      [Markup.button.callback('📊 Статистика', 'admin_stats'), Markup.button.callback('⭐ Звёзды', 'admin_stars')],
      [Markup.button.callback('👥 Рефералы', 'admin_refs'), Markup.button.callback('🏆 Титулы', 'admin_titles')],
      [Markup.button.callback('💫 Статусы', 'admin_statuses'), Markup.button.callback('❓ FAQ Админа', 'admin_faq')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ])
  });
});

bot.action('admin_cancel', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) {}
  ctx.answerCbQuery();
  ctx.reply(
    '⚙️ *Админ-панель* ⚙️\n\n🎛️ Выберите действие:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📢 Рассылка', 'admin_broadcast'), Markup.button.callback('🎫 Промокод', 'admin_addpromo')],
        [Markup.button.callback('📊 Статистика', 'admin_stats'), Markup.button.callback('⭐ Звёзды', 'admin_stars')],
        [Markup.button.callback('👥 Рефералы', 'admin_refs'), Markup.button.callback('🏆 Титулы', 'admin_titles')],
        [Markup.button.callback('💫 Статусы', 'admin_statuses'), Markup.button.callback('❓ FAQ Админа', 'admin_faq')],
        [Markup.button.callback('🏠 Главное меню', 'main_menu')]
      ])
    }
  );
});

// Управление статусами
bot.action('admin_statuses', async (ctx) => {
  let statusText = '💫 *Управление статусами* 💫\n\n';
  statusText += '📋 *Доступные статусы:*\n\n';
  
  Object.entries(USER_STATUSES).forEach(([key, status]) => {
    statusText += `${status.color} *${status.name}*\n`;
    statusText += `└ ${status.description}\n\n`;
  });

  ctx.editMessageText(statusText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('➕ Выдать статус', 'admin_give_status')],
      [Markup.button.callback('➖ Убрать статус', 'admin_remove_status')],
      [Markup.button.callback('👤 Статус пользователя', 'admin_user_status')],
      [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
    ])
  });
});

bot.action('admin_give_status', async (ctx) => {
  ctx.reply(
    '➕ *Выдача статуса*\n\nВведите ID пользователя и статус через пробел:\n\n📝 Формат: ID СТАТУС\n\n🔧 Доступные статусы:\n• owner\n• admin\n• moderator\n• vip\\_gold\n• vip\n• verified\n• member',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Например: 123456789 vip'
      }
    }
  );
});

bot.action('admin_remove_status', async (ctx) => {
  ctx.reply(
    '➖ *Сброс статуса*\n\nВведите ID пользователя для сброса статуса к обычному участнику:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Введите ID пользователя'
      }
    }
  );
});

bot.action('admin_user_status', async (ctx) => {
  ctx.reply(
    '👤 *Проверка статуса*\n\nВведите ID пользователя для просмотра его статуса:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Введите ID пользователя'
      }
    }
  );
});

// FAQ для админов
bot.action('admin_faq', async (ctx) => {
  const adminFaqText = `❓ *FAQ Админ-панели* ❓

🎛️ *Основные функции:*

📢 *Рассылка* - Отправка сообщений всем пользователям
├ Введите текст для рассылки
└ Сообщение отправится всем зарегистрированным пользователям

🎫 **Промокод** - Создание промокодов
├ Формат: НАЗВАНИЕ МАГНУМ_КОИНЫ ЛИМИТ
├ Пример: NEWCODE 25 100
└ Создаст промокод на 25 Magnum Coin с лимитом 100 активаций

📊 **Статистика** - Подробная статистика бота
├ Общее количество пользователей
├ Активность за день/неделю
└ Статистика по промокодам и заданиям

⭐ **Звёзды** - Управление балансом пользователей
├ Формат: ID_ПОЛЬЗОВАТЕЛЯ КОЛИЧЕСТВО
├ Положительное число - добавить
└ Отрицательное число - отнять

👥 **Рефералы** - Просмотр рефералов пользователя
├ Введите ID пользователя
└ Покажет список приглашённых им людей

🏆 **Титулы** - Управление титулами
├ Просмотр всех титулов
├ Выдача/удаление титулов
└ Просмотр титулов конкретного пользователя

💫 **Статусы** - Новая система статусов
├ 👑 Владелец - высший статус
├ ⚡ Администратор - полный доступ
├ 🛡️ Модератор - модерация контента
├ 💎 VIP Gold - премиум высшего уровня
├ 💫 VIP - обычный премиум
├ ✅ Верифицированный - проверенный пользователь
└ 🎮 Участник - базовый статус

🔧 **Команды статусов:**
• Выдать: ID СТАТУС (123456789 vip)
• Убрать: сбросить до обычного участника
• Проверить: посмотреть текущий статус

⚠️ **Важно:**
- Все изменения применяются немедленно
- Будьте осторожны с массовыми операциями
- Используйте "Отмена" для возврата в админку`;

  ctx.editMessageText(adminFaqText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к админке', 'admin_panel')]
    ])
  });
});

// Добавляем недостающие обработчики админских команд
function adminForceReply(ctx, text) {
  console.log('📝 Отправляем force reply:', text);
  console.log('👤 Пользователю:', ctx.from.id, ctx.from.first_name || ctx.from.username);
  
  return ctx.reply(text + '\n\n👆 Ответьте на это сообщение', {
    reply_markup: {
      force_reply: true,
      selective: true,
      input_field_placeholder: 'Введите ответ...',
      inline_keyboard: [[
        { text: '🏠 Главное меню', callback_data: 'main_menu' },
        { text: '❌ Отмена', callback_data: 'admin_cancel' }
      ]]
    }
  });
}

// Рассылка
bot.action('admin_broadcast', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  await adminForceReply(ctx, '📢 Введите текст для рассылки:');
});

// Добавить промокод
bot.action('admin_addpromo', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  // Устанавливаем состояние для создания промокода
  userStates.set(ctx.from.id, { 
    type: 'admin_create_promo' 
  });
  console.log('🎫 Админ начинает создание промокода:', ctx.from.id);
  
  await adminForceReply(ctx, '➕ Введите данные промокода в формате: НАЗВАНИЕ МАГНУМ_КОИНЫ ЛИМИТ\n\nПример: NEWCODE 25 100\n(код NEWCODE на 25 Magnum Coin с лимитом 100 активаций)');
});

// Статистика
bot.action('admin_stats', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  const totalUsers = await users.countDocuments();
  const totalStars = await users.aggregate([{ $group: { _id: null, total: { $sum: '$stars' } } }]).toArray();
  const totalInvited = await users.aggregate([{ $group: { _id: null, total: { $sum: '$invited' } } }]).toArray();
  
  ctx.editMessageText(
    `📊 Статистика бота:\n\n` +
    `👥 Всего пользователей: ${totalUsers}\n` +
    `⭐ Всего звёзд: ${totalStars[0]?.total || 0}\n` +
    `🤝 Всего приглашений: ${totalInvited[0]?.total || 0}`,
    Markup.inlineKeyboard([[Markup.button.callback('⚙️ Назад в админ-панель', 'admin_panel')]])
  );
});

// Выдать/забрать звёзды
bot.action('admin_stars', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  await adminForceReply(ctx, '⭐ Введите ID пользователя и количество звёзд через пробел (например: 123456789 50):');
});

// Рефералы пользователя
bot.action('admin_refs', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  await adminForceReply(ctx, '👥 Введите ID пользователя для просмотра его рефералов:');
});

// Добавляем управление титулами в админ-панель
bot.action('admin_titles', async (ctx) => {
  let titlesList = '🏆 **Информация о титулах** 🏆\n\n';
  titlesList += '**ОБЫЧНЫЕ ТИТУЛЫ:**\n';
  
  Object.entries(TITLES).forEach(([id, title]) => {
    if (title.condition !== 'secret') {
      titlesList += `${title.name}\n${title.description}\n\n`;
    }
  });
  
  titlesList += '**СЕКРЕТНЫЕ ТИТУЛЫ:**\n';
  Object.entries(TITLES).forEach(([id, title]) => {
    if (title.condition === 'secret') {
      titlesList += `${title.name}\n${title.description}\n\n`;
    }
  });

  ctx.editMessageText(titlesList, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('➕ Выдать титул', 'admin_give_title')],
      [Markup.button.callback('➖ Забрать титул', 'admin_remove_title')],
      [Markup.button.callback('📋 Титулы пользователя', 'admin_user_titles')],
      [Markup.button.callback('⚙️ Назад в админ-панель', 'admin_panel')]
    ])
  });
});

bot.action('admin_give_title', async (ctx) => {
  ctx.reply(
    '➕ **Выдача титула**\n\nВведите ID пользователя и ID титула через пробел:\n`123456789 vip_elite`',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true
      }
    }
  );
});

bot.action('admin_remove_title', async (ctx) => {
  ctx.reply(
    '➖ **Забрать титул**\n\nВведите ID пользователя и ID титула через пробел:\n`123456789 vip_elite`',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true
      }
    }
  );
});

bot.action('admin_user_titles', async (ctx) => {
  ctx.reply(
    '📋 **Титулы пользователя**\n\nВведите ID пользователя:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true
      }
    }
  );
});



// Биржа
bot.action('exchange', async (ctx) => {
  const user = await getUser(ctx.from.id, ctx);
  const starsBalance = Math.round((user.stars || 0) * 100) / 100;
  const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;
  
  const exchangeText = `📈 **БИРЖА MAGNUMTAP** 📈\n\n` +
                      `💰 **Ваши балансы:**\n` +
                      `[🪙 ${magnumCoinsBalance}] Magnum Coin\n` +
                      `[⭐ ${starsBalance}] звёзд\n\n` +
                      `🔄 **Доступные операции:**\n\n` +
                      `💎 **Обмен валют:**\n` +
                      `• [🪙 100] → [⭐ 10] Telegram Stars\n` +
                      `• Другие валюты (скоро)\n\n` +
                      `📊 **P2P торговля:**\n` +
                      `• Обмен с другими пользователями\n` +
                      `• Безопасные сделки через эскроу\n` +
                      `• Создание собственных предложений\n\n` +
                      `💹 **Инвестиции:**\n` +
                      `• Стейкинг Magnum Coin (5% в месяц)\n` +
                      `• Пулы ликвидности\n` +
                      `• Торговые боты\n\n` +
                      `⚠️ **P2P и Инвестиции:** В разработке!`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💎 Обмен валют', 'exchange_currency')],
    [Markup.button.callback('👥 P2P Торговля', 'exchange_p2p')],
    [Markup.button.callback('💹 Инвестиции', 'exchange_invest')],
    [Markup.button.callback('📊 Мои ордера', 'exchange_orders')],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
  
  ctx.editMessageText(exchangeText, { parse_mode: 'Markdown', ...keyboard });
});

// Обмен валют
bot.action('exchange_currency', async (ctx) => {
  const user = await getUser(ctx.from.id, ctx);
  const starsBalance = Math.round((user.stars || 0) * 100) / 100;
  const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;
  
  const currencyText = `💎 **ОБМЕН ВАЛЮТ** 💎\n\n` +
                      `💰 **Ваши балансы:**\n` +
                      `[🪙 ${magnumCoinsBalance}] Magnum Coin\n` +
                      `[⭐ ${starsBalance}] звёзд\n\n` +
                      `🔄 **Доступные курсы:**\n\n` +
                      `⭐ **Telegram Stars:**\n` +
                      `• Курс: [🪙 100] = [⭐ 10] TG Stars\n` +
                      `• Минимум: [🪙 100]\n` +
                      `• Комиссия: 0%\n\n` +
                      `💵 **USDT TRC-20:**\n` +
                      `• Курс: скоро\n` +
                      `• Статус: в разработке\n\n` +
                      `💎 **TON Coin:**\n` +
                      `• Курс: скоро\n` +
                      `• Статус: в разработке`;
  
  const buttons = [];
  
  // Добавляем кнопку обмена TG Stars только если достаточно монет
  if (magnumCoinsBalance >= 100) {
    buttons.push([Markup.button.callback('⭐ Купить TG Stars (100🪙→10⭐)', 'buy_tg_stars')]);
  } else {
    buttons.push([Markup.button.callback('❌ Недостаточно Magnum Coin', 'insufficient_funds')]);
  }
  
  buttons.push(
    [Markup.button.callback('💵 Купить USDT (скоро)', 'buy_usdt'), Markup.button.callback('💎 Купить TON (скоро)', 'buy_ton')],
    [Markup.button.callback('🔙 Назад на биржу', 'exchange')]
  );
  
  const keyboard = Markup.inlineKeyboard(buttons);
  
  ctx.editMessageText(currencyText, { parse_mode: 'Markdown', ...keyboard });
});

// P2P торговля
bot.action('exchange_p2p', async (ctx) => {
  const p2pText = `👥 **P2P ТОРГОВЛЯ** 👥\n\n` +
                  `🤝 **Что такое P2P:**\n` +
                  `Прямой обмен между пользователями с гарантией безопасности через систему эскроу.\n\n` +
                  `📋 **Как это работает:**\n` +
                  `1️⃣ Создаете предложение\n` +
                  `2️⃣ Другой пользователь откликается\n` +
                  `3️⃣ Средства блокируются в эскроу\n` +
                  `4️⃣ Подтверждаете получение\n` +
                  `5️⃣ Сделка завершается автоматически\n\n` +
                  `💰 **Популярные пары:**\n` +
                  `• ⭐/USDT TRC-20\n` +
                  `• ⭐/TON\n` +
                  `• ⭐/Telegram Stars\n\n` +
                  `⚠️ **Скоро:** P2P торговля в разработке!`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💰 Создать предложение', 'create_p2p_offer')],
    [Markup.button.callback('📋 Все предложения', 'view_p2p_offers')],
    [Markup.button.callback('📊 Мои сделки', 'my_p2p_deals')],
    [Markup.button.callback('🔙 Назад на биржу', 'exchange')]
  ]);
  
  ctx.editMessageText(p2pText, { parse_mode: 'Markdown', ...keyboard });
});

// Инвестиции
bot.action('exchange_invest', async (ctx) => {
  const investText = `💹 **ИНВЕСТИЦИИ** 💹\n\n` +
                    `📈 **Доступные продукты:**\n\n` +
                    `🏦 **Стейкинг звёзд:**\n` +
                    `• Доходность: 5% в месяц\n` +
                    `• Минимум: 1000⭐\n` +
                    `• Срок: от 30 дней\n\n` +
                    `💧 **Пулы ликвидности:**\n` +
                    `• Пара: ⭐/USDT\n` +
                    `• APY: до 12%\n` +
                    `• Риск: средний\n\n` +
                    `🤖 **Торговые боты:**\n` +
                    `• Grid-бот: 2-8% в месяц\n` +
                    `• DCA-бот: стабильный рост\n` +
                    `• Копи-трейдинг: следуйте за профи\n\n` +
                    `⚠️ **Важно:** Инвестиции связаны с рисками!`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🏦 Стейкинг', 'staking'), Markup.button.callback('💧 Пулы', 'liquidity_pools')],
    [Markup.button.callback('🤖 Торговые боты', 'trading_bots')],
    [Markup.button.callback('📊 Мои инвестиции', 'my_investments')],
    [Markup.button.callback('🔙 Назад на биржу', 'exchange')]
  ]);
  
  ctx.editMessageText(investText, { parse_mode: 'Markdown', ...keyboard });
});

// Заглушки для остальных функций
bot.action('exchange_orders', async (ctx) => {
  ctx.answerCbQuery('📊 Мои ордера - функция в разработке!', { show_alert: true });
});

bot.action('buy_usdt', async (ctx) => {
  ctx.answerCbQuery('💵 Покупка USDT - скоро будет доступна!', { show_alert: true });
});

bot.action('buy_ton', async (ctx) => {
  ctx.answerCbQuery('💎 Покупка TON - скоро будет доступна!', { show_alert: true });
});

bot.action('buy_tg_stars', async (ctx) => {
  const user = await getUser(ctx.from.id, ctx);
  const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;
  
  if (magnumCoinsBalance < 100) {
    return ctx.answerCbQuery(`❌ Недостаточно Magnum Coin! У вас: ${magnumCoinsBalance}🪙, нужно: 100🪙`, { show_alert: true });
  }
  
  // Обмениваем 100 Magnum Coin на 10 звёзд
  await users.updateOne(
    { id: ctx.from.id },
    { 
      $inc: { magnumCoins: -100, stars: 10 },
      $set: { lastExchange: Math.floor(Date.now() / 1000) }
    }
  );
  
  await ctx.answerCbQuery('✅ Успешно! 100🪙 → 10⭐ TG Stars', { show_alert: true });
  
  // Обновляем интерфейс обмена валют
  setTimeout(async () => {
    const updatedUser = await getUser(ctx.from.id, ctx);
    const starsBalance = Math.round((updatedUser.stars || 0) * 100) / 100;
    const updatedMagnumCoinsBalance = Math.round((updatedUser.magnumCoins || 0) * 100) / 100;
    
    const currencyText = `💎 **ОБМЕН ВАЛЮТ** 💎\n\n` +
                        `💰 **Ваши балансы:**\n` +
                        `🪙 Magnum Coin: ${updatedMagnumCoinsBalance}\n` +
                        `⭐ Звёзды: ${starsBalance}\n\n` +
                        `🔄 **Доступные курсы:**\n\n` +
                        `⭐ **Telegram Stars:**\n` +
                        `• Курс: 100 🪙 = 10 ⭐ TG Stars\n` +
                        `• Минимум: 100 🪙\n` +
                        `• Комиссия: 0%\n\n` +
                        `💵 **USDT TRC-20:**\n` +
                        `• Курс: скоро\n` +
                        `• Статус: в разработке\n\n` +
                        `💎 **TON Coin:**\n` +
                        `• Курс: скоро\n` +
                        `• Статус: в разработке`;
    
    const buttons = [];
    
    // Добавляем кнопку обмена TG Stars только если достаточно монет
    if (updatedMagnumCoinsBalance >= 100) {
      buttons.push([Markup.button.callback('⭐ Купить TG Stars (100🪙→10⭐)', 'buy_tg_stars')]);
    } else {
      buttons.push([Markup.button.callback('❌ Недостаточно Magnum Coin', 'insufficient_funds')]);
    }
    
    buttons.push(
      [Markup.button.callback('💵 Купить USDT (скоро)', 'buy_usdt'), Markup.button.callback('💎 Купить TON (скоро)', 'buy_ton')],
      [Markup.button.callback('🔙 Назад на биржу', 'exchange')]
    );
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    ctx.editMessageText(currencyText, { parse_mode: 'Markdown', ...keyboard });
  }, 1000);
});

bot.action('insufficient_funds', async (ctx) => {
  const user = await getUser(ctx.from.id, ctx);
  const magnumCoinsBalance = Math.round((user.magnumCoins || 0) * 100) / 100;
  
  ctx.answerCbQuery(`❌ Недостаточно средств! У вас: ${magnumCoinsBalance}🪙, нужно: 100🪙\n\nЗарабатывайте Magnum Coin через фарм и бонусы!`, { show_alert: true });
});

bot.action('create_p2p_offer', async (ctx) => {
  ctx.answerCbQuery('💰 Создание P2P предложения - в разработке!', { show_alert: true });
});

bot.action('view_p2p_offers', async (ctx) => {
  ctx.answerCbQuery('📋 Просмотр предложений - в разработке!', { show_alert: true });
});

bot.action('my_p2p_deals', async (ctx) => {
  ctx.answerCbQuery('📊 Мои P2P сделки - в разработке!', { show_alert: true });
});

bot.action('staking', async (ctx) => {
  ctx.answerCbQuery('🏦 Стейкинг - скоро будет доступен!', { show_alert: true });
});

bot.action('liquidity_pools', async (ctx) => {
  ctx.answerCbQuery('💧 Пулы ликвидности - в разработке!', { show_alert: true });
});

bot.action('trading_bots', async (ctx) => {
  ctx.answerCbQuery('🤖 Торговые боты - скоро!', { show_alert: true });
});

bot.action('my_investments', async (ctx) => {
  ctx.answerCbQuery('📊 Мои инвестиции - в разработке!', { show_alert: true });
});

bot.action('sponsor_tasks', async (ctx) => {
  // Проверяем подписку
  const isSubscribed = await checkSubscription(ctx);
  if (!isSubscribed) {
    await showSubscriptionMessage(ctx);
    return;
  }
  
  // Показываем первое задание
  showSponsorTask(ctx, 0);
});

async function showSponsorTask(ctx, taskIndex) {
  if (taskIndex >= SPONSOR_TASKS.length) {
    return ctx.editMessageText(
      '🎉 *Все задания от спонсоров выполнены!*\n\nВы прошли все доступные задания. Следите за обновлениями!',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Главное меню', 'main_menu')]
        ])
      }
    );
  }

  const task = SPONSOR_TASKS[taskIndex];
  const user = await getUser(ctx.from.id);
  
  // Проверяем, есть ли активная проверка этого задания
  const pendingCheck = await taskChecks.findOne({
    userId: ctx.from.id,
    taskId: task.id,
    status: 'pending'
  });
  
  // Проверяем, выполнено ли задание
  const completedTask = await taskChecks.findOne({
    userId: ctx.from.id,
    taskId: task.id,
    status: 'approved'
  });

  let taskText = `📋 *Задание ${taskIndex + 1}/${SPONSOR_TASKS.length}*\n\n`;
  taskText += `*${task.title}*\n\n`;
  taskText += `📝 *Описание:* ${task.description}\n`;
  taskText += `🎁 *Награда:* ${task.reward} звёзд\n\n`;
  
  if (completedTask) {
    taskText += `✅ *Задание выполнено!*\n\n`;
  } else if (pendingCheck) {
    taskText += `⏳ *Задание на проверке*\nОжидайте результата проверки администратором\\.\n\n`;
  } else {
    taskText += `📋 *Инструкция:* ${task.instruction}\n\n`;
  }

  const buttons = [];
  
  if (completedTask) {
    // Задание выполнено
    if (taskIndex < SPONSOR_TASKS.length - 1) {
      buttons.push([Markup.button.callback('➡️ Следующее задание', `sponsor_task_${taskIndex + 1}`)]);
    }
  } else if (pendingCheck) {
    // На проверке - только навигация
    if (taskIndex > 0) {
      buttons.push([Markup.button.callback('⬅️ Предыдущее', `sponsor_task_${taskIndex - 1}`)]);
    }
    if (taskIndex < SPONSOR_TASKS.length - 1) {
      buttons.push([Markup.button.callback('➡️ Следующее', `sponsor_task_${taskIndex + 1}`)]);
    }
  } else {
    // Можно выполнять
    buttons.push([
      Markup.button.url('🔗 Перейти', task.link),
      Markup.button.callback('✅ Я выполнил', `task_complete_${task.id}`)
    ]);
    
    // Навигация
    if (taskIndex > 0) {
      buttons.push([Markup.button.callback('⬅️ Предыдущее', `sponsor_task_${taskIndex - 1}`)]);
    }
    if (taskIndex < SPONSOR_TASKS.length - 1) {
      buttons.push([Markup.button.callback('➡️ Следующее', `sponsor_task_${taskIndex + 1}`)]);
    }
  }
  
  buttons.push([Markup.button.callback('🏠 Главное меню', 'main_menu')]);

  ctx.editMessageText(taskText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
}

bot.action('faq', async (ctx) => {
  const faqText = `❓ **Справка и помощь** ❓

🎯 **Выберите раздел для подробной информации:**`;

  ctx.editMessageText(faqText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🌟 Как фармить звёзды', 'faq_farming'), Markup.button.callback('🎁 Ежедневный бонус', 'faq_bonus')],
      [Markup.button.callback('🎯 Задания', 'faq_tasks'), Markup.button.callback('👥 Приглашение друзей', 'faq_referrals')],
      [Markup.button.callback('🏆 Титулы и ранги', 'faq_titles'), Markup.button.callback('🎖️ Достижения', 'faq_achievements')],
      [Markup.button.callback('📊 Уровни игрока', 'faq_levels'), Markup.button.callback('🎫 Промокоды', 'faq_promocodes')],
      [Markup.button.callback('💫 Статусы', 'faq_statuses'), Markup.button.callback('🛠️ Техподдержка', 'faq_support')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ])
  });
});

// Детальные FAQ разделы
bot.action('faq_farming', async (ctx) => {
  const farmingText = `🌟 **Как фармить звёзды** 🌟

💡 **Что это такое:**
Фарм - это основной способ заработка звёзд в боте. Вы получаете 0.01 звезды каждую минуту!

🔥 **Как фармить:**
1️⃣ Нажмите кнопку "🌟 Фармить звёзды" в главном меню
2️⃣ Дождитесь окончания таймера (60 секунд)
3️⃣ Нажмите снова, чтобы получить следующую награду

⏰ **Важные детали:**
• ⏱️ Интервал: каждую минуту (60 секунд)
• 💰 Награда: 0.01 звезды за клик
• 🔄 Бесконечно: можете фармить сколько угодно
• 📱 Уведомления: получайте pop-up с результатом

🎯 **Стратегия фарма:**
• 🕐 Фармите регулярно в течение дня
• 📱 Используйте напоминания на телефоне
• 🎖️ 100 фармов = прогресс к титулу "Фармер"
• 🏆 1000 фармов = достижение "Мастер фарма" (+10 звёзд)

💎 **Советы для эффективного фарма:**
• Фармите во время перерывов
• Совмещайте с другими делами
• Не забывайте про ежедневный бонус!
• Приглашайте друзей для дополнительных звёзд`;

  ctx.editMessageText(farmingText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
    ])
  });
});

bot.action('faq_bonus', async (ctx) => {
  const bonusText = `🎁 **Ежедневный бонус** 🎁

🌅 **Что это такое:**
Большая награда, которую можно получать каждый день! Намного выгоднее обычного фарма.

💰 **Награда и условия:**
• 💎 **3 звезды** за каждый заход
• ⏰ **Раз в день** (обновляется в 00:00)
• 🔄 **Ежедневно** - заходите каждый день!

📋 **Пошаговая инструкция:**
1️⃣ Откройте бота (нажмите /start)
2️⃣ Нажмите кнопку "🎁 Бонус" в главном меню
3️⃣ Получите 3 звезды!
4️⃣ Повторите завтра для новой награды

📊 **Система серий:**
• 🔥 Ежедневные заходы увеличивают вашу серию
• 📅 7 дней подряд = титул "Постоянный посетитель"
• ⚡ 7 дней подряд = достижение "Недельный воин" (+12 звёзд)
• 🎯 15 бонусов = титул "Охотник за бонусами"

⏰ **Когда обновляется:**
• 🌙 В полночь (00:00 по московскому времени)
• 📱 Проверьте, сколько времени до следующего бонуса
• ⏳ Если таймер показывает время - значит нужно подождать

🎖️ **Максимальная выгода:**
• Заходите КАЖДЫЙ день без пропусков
• Совмещайте с фармом для быстрого роста
• 3 звезды в день = 90 звёзд в месяц!`;

  ctx.editMessageText(bonusText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
    ])
  });
});

bot.action('faq_tasks', async (ctx) => {
  const tasksText = `🎯 **Система заданий** 🎯

📋 **Типы заданий:**

🔹 **Ежедневные задания:**
• 📅 Обновляются каждый день
• 🎁 Простые награды за активность
• ⚡ Быстро выполняются

🔸 **Задания от спонсоров:**
• 🎯 Более сложные задания
• 💎 Лучшие награды (по 3 звезды)
• 📸 Требуют подтверждения скриншотом

🎯 **Как выполнять спонсорские задания:**

**Шаг 1:** Откройте задания
└ Нажмите "🎯 Задания от спонсора" в меню

**Шаг 2:** Выберите задание  
└ Листайте кнопками "⬅️ Предыдущее" / "➡️ Следующее"

**Шаг 3:** Изучите требования
└ Внимательно прочитайте описание

**Шаг 4:** Выполните действие
└ Нажмите "🔗 Перейти" для выполнения

**Шаг 5:** Подтвердите выполнение
└ Нажмите "✅ Я выполнил"

**Шаг 6:** Отправьте скриншот
└ Сфотографируйте результат и отправьте

**Шаг 7:** Дождитесь проверки
└ Администратор проверит в течение 24 часов

📸 **Требования к скриншотам:**
• 📱 Четкое изображение экрана
• ✅ Видно выполнение задания
• 🎯 Соответствует инструкции
• 📝 Содержит нужную информацию

🎁 **Награды:**
• 🎯 Спонсорские: 3 звезды за задание
• 📋 Ежедневные: различные награды
• 🏆 Прогресс к титулу "Воин заданий"

❌ **Почему могут отклонить:**
• Неправильный скриншот
• Задание не выполнено полностью
• Нарушение правил платформы`;

  ctx.editMessageText(tasksText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
    ])
  });
});

bot.action('faq_referrals', async (ctx) => {
  const referralsText = `👥 **Приглашение друзей** 👥

🎯 **Зачем приглашать друзей:**
• 💰 Дополнительные звёзды за каждого друга
• 🏆 Прогресс к титулам и достижениям
• 📈 Быстрый рост в рейтинге
• 🎖️ Социальные достижения

🔗 **Как пригласить друга:**

**Шаг 1:** Получите свою ссылку
└ Нажмите "🤝 Пригласить друзей" в меню

**Шаг 2:** Скопируйте ссылку
└ Нажмите на ссылку для копирования

**Шаг 3:** Поделитесь с друзьями
└ Отправьте в любом мессенджере/соцсети

**Шаг 4:** Друг переходит по ссылке
└ Друг нажимает /start в боте

**Шаг 5:** Получите награду!
└ Автоматически зачисляется в ваш баланс

💎 **Что получаете:**
• ⭐ Звёзды за каждого приглашенного
• 📊 Увеличение счетчика "Друзей приглашено"
• 🏆 Прогресс к титулам:
  └ 3 друга = "Амбассадор"  
  └ 10 друзей = "Социальная бабочка" (+10 звёзд)

🔥 **Стратегии приглашения:**
• 💬 Поделитесь в группах/чатах
• 📱 Отправьте близким друзьям
• 🌐 Разместите в соцсетях
• 🎮 Пригласите любителей игр

📋 **Важные правила:**
• 🚫 Запрещены фейковые аккаунты
• ✅ Только реальные пользователи
• 🔄 Друг должен активно пользоваться ботом
• 🎯 Качество важнее количества

📊 **Отслеживание прогресса:**
• 👤 В профиле видно количество друзей
• 📈 Прогресс к следующему достижению
• 🏆 Уведомления о новых титулах`;

  ctx.editMessageText(referralsText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
    ])
  });
});

bot.action('faq_titles', async (ctx) => {
  const titlesText = `🏆 **Ранги и титулы** 🏆

🏅 **Что такое ранги:**
Автоматические уровни, основанные на количестве звёзд. Показывают ваше мастерство!

**📊 Система рангов (по звёздам):**
• 🥉 **Bronze Star** - 0+ звёзд
• 🥈 **Silver Star** - 50+ звёзд  
• 🥇 **Gold Star** - 150+ звёзд
• 💎 **Platinum Star** - 300+ звёзд
• 💍 **Diamond Star** - 500+ звёзд
• 👑 **Master Star** - 1000+ звёзд
• 🏆 **Grandmaster** - 2000+ звёзд
• ⭐ **Legend** - 5000+ звёзд

🎖️ **Что такое титулы:**
Специальные награды за достижения в боте. Показывают ваш прогресс и активность!

👑 **Список всех титулов:**

**🟢 Обычные титулы (10 штук):**
• 🌱 **Новичок** - Начал путь в MagnumTap
• ⚡ **Фармер** - 30 действий фарминга  
• 💎 **Коллекционер** - Собрал 50 звёзд
• 🤝 **Амбассадор** - Пригласил 3 друзей
• 📅 **Постоянный посетитель** - 5 дней подряд
• 🎁 **Охотник за бонусами** - 15 ежедневных бонусов
• 🎫 **Мастер промокодов** - 5 промокодов
• ⚔️ **Воин заданий** - 20 заданий
• 🌟 **Звёздный лорд** - 200 звёзд
• 👑 **Легенда** - 500 звёзд + 10 друзей

**🔴 Секретные титулы (3 штуки):**
• 🌅 **Ранняя пташка** - Секретное условие
• 🦉 **Ночная сова** - Секретное условие  
• 💫 **VIP Элита** - Выдается администрацией

🎯 **Как получить титулы:**

**Для фарма:** 
└ Нажимайте "🌟 Фармить звёзды" 30 раз

**Для коллекционера:**
└ Накопите 50 звёзд любым способом

**Для амбассадора:**
└ Пригласите 3 реальных друзей

**Для постоянного посетителя:**
└ Заходите в бота 5 дней подряд за бонусом

**Для охотника за бонусами:**
└ Получите ежедневный бонус 15 раз

**Для мастера промокодов:**
└ Активируйте 5 разных промокодов

**Для воина заданий:**
└ Выполните 20 заданий (ежедневных + спонсорских)

**Для звёздного лорда:**
└ Накопите 200 звёзд

**Для легенды:**
└ Накопите 500 звёзд И пригласите 10 друзей

📊 **Как посмотреть свои титулы:**
1️⃣ Зайдите в "👤 Профиль"
2️⃣ Нажмите "🏆 Мои титулы"  
3️⃣ Увидите все заработанные титулы

🎖️ **Главный титул:**
В профиле отображается ваш лучший титул по приоритету!`;

  ctx.editMessageText(titlesText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
    ])
  });
});

bot.action('faq_achievements', async (ctx) => {
  const achievementsText = `🎖️ **Система достижений** 🎖️

🏅 **Что это такое:**
Особые награды за выполнение сложных целей. Дают дополнительные звёзды!

🎯 **Список всех достижений:**

💰 **"Сотка"** (5 звёзд)
└ Накопите 100 звёзд любым способом

🤝 **"Социальная бабочка"** (10 звёзд)
└ Пригласите 10 реальных друзей

⚡ **"Недельный воин"** (12 звёзд)  
└ Получите ежедневный бонус 7 дней подряд

🌾 **"Мастер фарма"** (10 звёзд)
└ Сделайте 1000 действий фарминга

🎫 **"Охотник за промо"** (15 звёзд)
└ Активируйте 15 различных промокодов

📊 **Как посмотреть прогресс:**
1️⃣ Зайдите в "👤 Профиль"
2️⃣ Нажмите "🎖️ Достижения"
3️⃣ Увидите все достижения и прогресс

🎯 **Стратегии получения:**

**Для "Сотки":**
• Фармите регулярно (0.01 за клик = 10,000 кликов)
• Получайте ежедневные бонусы (3 звезды в день)
• Выполняйте спонсорские задания (3 звезды за задание)
• Активируйте промокоды

**Для "Социальной бабочки":**
• Поделитесь ссылкой в соцсетях
• Пригласите друзей/коллег
• Расскажите о боте знакомым

**Для "Недельного воина":**
• Заходите КАЖДЫЙ день за бонусом
• Не пропускайте ни одного дня
• Используйте напоминания

**Для "Мастера фарма":**
• Фармите несколько раз в день
• Используйте регулярные перерывы
• 1000 кликов = примерно 1 месяц активности

**Для "Охотника за промо":**
• Следите за объявлениями промокодов
• Подписывайтесь на каналы администрации
• Участвуйте в конкурсах

🏆 **Награды автоматические:**
После выполнения условий звёзды начисляются сразу!`;

  ctx.editMessageText(achievementsText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
    ])
  });
});

bot.action('faq_levels', async (ctx) => {
  const levelsText = `📊 **Система уровней** 📊

🎯 **Что это такое:**
Показатель вашего общего прогресса в боте. Зависит от количества накопленных звёзд.

⭐ **Все уровни по порядку:**

🥉 **Bronze Star** - 50 звёзд
└ Первый серьезный уровень

🥈 **Silver Star** - 150 звёзд  
└ Для активных игроков

🥇 **Gold Star** - 300 звёзд
└ Для настоящих фанатов

💎 **Platinum Star** - 500 звёзд
└ Элитный уровень

💠 **Diamond Star** - 1000 звёзд
└ Для самых преданных

👑 **Master Star** - 2000 звёзд
└ Максимальный уровень!

📊 **Как отслеживать прогресс:**
• В профиле есть шкала прогресса
• Показывает проценты до следующего уровня
• Видно сколько звёзд осталось

🎯 **Стратегии роста уровня:**

**До Bronze (50 звёзд):**
• 17 дней ежедневных бонусов
• 5000 кликов фарма
• 17 спонсорских заданий

**До Silver (150 звёзд):**
• 50 дней бонусов
• 15000 кликов фарма  
• 50 спонсорских заданий

**До Gold (300 звёзд):**
• 100 дней бонусов
• 30000 кликов фарма
• 100 спонсорских заданий

💡 **Оптимальная стратегия:**
• 🎁 Ежедневный бонус (основа)
• 🎯 Спонсорские задания (быстрый рост)
• 👥 Приглашение друзей (бонусы)
• 🌟 Фарм (для постоянного роста)
• 🎫 Промокоды (дополнительные звёзды)

🏆 **Преимущества высоких уровней:**
• Престиж и статус
• Показатель опыта
• Мотивация для роста`;

  ctx.editMessageText(levelsText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
    ])
  });
});

bot.action('faq_promocodes', async (ctx) => {
  const promocodesText = `🎫 **Промокоды** 🎫

💎 **Что это такое:**
Специальные коды, которые дают дополнительные звёзды! Публикуются администрацией.

🔑 **Как активировать промокод:**

**Шаг 1:** Получите промокод
└ Следите за объявлениями админов

**Шаг 2:** Откройте раздел промокодов  
└ Нажмите "🎫 Промокод" в главном меню

**Шаг 3:** Введите код
└ Наберите код ТОЧНО как написано

**Шаг 4:** Получите награду!
└ Звёзды зачисляются автоматически

🎯 **Где найти промокоды:**
• 📢 Официальные объявления
• 🎉 Праздничные акции  
• 🏆 Конкурсы и розыгрыши
• 🎮 Специальные события
• 👥 Партнерские каналы

💰 **Типы промокодов:**
• 🎁 **Праздничные** - по особым датам
• 🎯 **Ивентовые** - за участие в событиях
• 👥 **Партнерские** - от спонсоров
• 🔥 **Эксклюзивные** - ограниченные

⚠️ **Важные правила:**
• 🚫 Каждый промокод можно использовать ОДИН раз
• ⏰ Промокоды могут истекать
• 👥 Ограниченное количество активаций
• ✅ Коды чувствительны к регистру

🏆 **Прогресс к титулам:**
• 5 промокодов = титул "Мастер промокодов"
• 15 промокодов = достижение "Охотник за промо" (+15 звёзд)

🔍 **Советы по поиску:**
• Подпишитесь на официальные каналы
• Участвуйте в обсуждениях
• Следите за новостями бота
• Приглашайте друзей (иногда дают промокоды)

❌ **Частые ошибки:**
• Неправильный ввод кода
• Попытка повторной активации
• Использование истекшего кода
• Превышение лимита активаций`;

  ctx.editMessageText(promocodesText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
    ])
  });
});

bot.action('faq_statuses', async (ctx) => {
  const statusesText = `💫 **Система статусов** 💫

👑 **Что это такое:**
Ваш особый статус в сообществе бота. Показывает ваше положение и привилегии!

🎖️ **Все статусы по иерархии:**

👑 **Владелец** (Приоритет 1)
└ Создатель и владелец бота

⚡ **Администратор** (Приоритет 2)  
└ Полный доступ к управлению ботом

🛡️ **Модератор** (Приоритет 3)
└ Модерация пользователей и контента

💎 **VIP Gold** (Приоритет 4)
└ Премиум статус высшего уровня

💫 **VIP** (Приоритет 5)
└ Премиум пользователь

✅ **Верифицированный** (Приоритет 6)
└ Проверенный активный пользователь

🎮 **Участник** (Приоритет 7)
└ Обычный участник сообщества (базовый статус)

🎯 **Как получить статус:**
• 🎮 **Участник** - автоматически при регистрации
• ✅ **Верифицированный** - за активность в боте
• 💫 **VIP** - за особые заслуги
• 💎 **VIP Gold** - за выдающиеся достижения
• 🛡️ **Модератор** - назначается администрацией
• ⚡ **Администратор** - назначается владельцем
• 👑 **Владелец** - создатель бота

📊 **Где видно статус:**
• В вашем профиле
• Рядом с именем в рейтингах
• При взаимодействии с другими

🎁 **Преимущества статусов:**
• 🌟 Престиж в сообществе
• 🎯 Особое отображение
• 💎 Эксклюзивность
• 🏆 Статусный символ

📋 **Правила получения:**
• Статусы выдаются за заслуги
• Нельзя купить или обменять
• Могут быть отозваны за нарушения
• Высокие статусы требуют доверия администрации`;

  ctx.editMessageText(statusesText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
    ])
  });
});

bot.action('faq_support', async (ctx) => {
  const supportText = `🛠️ **Техническая поддержка** 🛠️

💬 **Что это такое:**
Система помощи пользователям. Можете обратиться с любой проблемой или вопросом!

🎯 **Как создать заявку:**

**Шаг 1:** Откройте поддержку
└ Зайдите в "👤 Профиль" → "🛠️ Тех поддержка"

**Шаг 2:** Создайте заявку
└ Нажмите "📝 Создать заявку"

**Шаг 3:** Опишите проблему
└ Подробно расскажите что произошло

**Шаг 4:** Отправьте заявку
└ Нажмите отправить

**Шаг 5:** Ожидайте ответа
└ Ответ придет в течение 24 часов

📋 **С чем можно обращаться:**
• 🐛 Баги и ошибки в боте
• ❓ Вопросы по функционалу
• 💰 Проблемы с балансом
• 🎯 Проблемы с заданиями
• 🎫 Вопросы по промокодам
• 👥 Проблемы с рефералами
• 🏆 Вопросы по титулам
• 💡 Предложения по улучшению

✍️ **Как правильно описать проблему:**
• 📝 Подробно опишите что случилось
• ⏰ Укажите когда это произошло
• 🔄 Опишите что вы делали
• 📱 Приложите скриншоты если нужно

🎫 **Статусы заявок:**
• 🆕 **Новая** - только что создана
• ⚙️ **В работе** - администратор работает
• ✅ **Решена** - проблема устранена
• ❌ **Отклонена** - заявка не принята
• 🔒 **Закрыта** - заявка завершена

📊 **Как отследить заявки:**
1️⃣ Зайдите в "🛠️ Тех поддержка"
2️⃣ Нажмите "🎫 Мои заявки"
3️⃣ Увидите все ваши обращения

⚡ **Время ответа:**
• 📱 Обычно в течение 24 часов
• 🔥 Срочные вопросы быстрее
• 📅 В выходные может занять больше времени

💡 **Советы для быстрого решения:**
• Пишите четко и понятно
• Прикладывайте скриншоты
• Указывайте свой ID
• Не создавайте дубли заявок`;

  ctx.editMessageText(supportText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад к FAQ', 'faq')]
    ])
  });
});

// Достижения
bot.action('achievements', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const userAchievements = user.achievements || [];
  
  let achievementsText = `🎖️ *ДОСТИЖЕНИЯ* 🎖️\n\n`;
  
  for (const [achievementId, achievement] of Object.entries(ACHIEVEMENTS)) {
    const isEarned = userAchievements.includes(achievementId);
    const progress = getUserProgress(user, achievement);
    const progressPercent = Math.min(100, Math.floor((progress / achievement.requirement) * 100));
    
    if (isEarned) {
      achievementsText += `✅ ${achievement.icon} *${achievement.name}*\n`;
      achievementsText += `📝 ${achievement.description}\n`;
      achievementsText += `🎁 Награда: +${achievement.reward} звёзд *(получено)*\n\n`;
    } else {
      achievementsText += `⬜ ${achievement.icon} *${achievement.name}*\n`;
      achievementsText += `📝 ${achievement.description}\n`;
      achievementsText += `📊 Прогресс: ${progress}/${achievement.requirement} (${progressPercent}%)\n`;
      achievementsText += `🎁 Награда: +${achievement.reward} звёзд\n\n`;
    }
  }
  
  const earnedCount = userAchievements.length;
  const totalCount = Object.keys(ACHIEVEMENTS).length;
  achievementsText += `📈 *Получено: ${earnedCount}/${totalCount} достижений*`;
  
  ctx.editMessageText(achievementsText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('👤 Назад к профилю', 'profile')]
    ])
  });
});

function getUserProgress(user, achievement) {
  switch (achievement.condition) {
    case 'stars':
      return user.stars || 0;
    case 'invited':
      return user.invited || 0;
    case 'daily_streak':
      return user.dailyStreak || 0;
    case 'farm_count':
      return user.farmCount || 0;
    case 'promo_count':
      return user.promoCount || 0;
    default:
      return 0;
  }
}

// Меню техподдержки
bot.action('support_menu', async (ctx) => {
  const supportText = `🛠️ *ТЕХНИЧЕСКАЯ ПОДДЕРЖКА* 🛠️

💬 *Выберите действие:*

🆕 *Создать заявку* — описать новую проблему
📋 *Мои заявки* — посмотреть статус заявок

⚡ Наша команда ответит в течение 24 часов!`;

  ctx.editMessageText(supportText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🆕 Создать заявку', 'support_create')],
      [Markup.button.callback('📋 Мои заявки', 'my_tickets')],
      [Markup.button.callback('👤 Назад к профилю', 'profile')]
    ])
  });
});

// Создание заявки в техподдержку
bot.action('support_create', async (ctx) => {
  const supportText = `🛠️ **ТЕХНИЧЕСКАЯ ПОДДЕРЖКА** 🛠️

💬 **Опишите вашу проблему или вопрос:**

Напишите одним сообщением:
• Что случилось?
• Когда это произошло?
• Какие действия вы выполняли?

⚡ Наша команда поддержки ответит в течение 24 часов!`;

  // Удаляем текущее сообщение и отправляем новое с force_reply
  await ctx.deleteMessage();
  
  ctx.reply(supportText, {
    parse_mode: 'Markdown',
    reply_markup: {
      force_reply: true,
      input_field_placeholder: 'Опишите вашу проблему...'
    }
  });
});

// Мои заявки в поддержку
bot.action('my_tickets', async (ctx) => {
  const userTickets = await supportTickets.find({ userId: ctx.from.id }).sort({ createdAt: -1 }).limit(10).toArray();
  
  let ticketsText = `🎫 *МОИ ЗАЯВКИ В ПОДДЕРЖКУ* 🎫\n\n`;

  if (userTickets.length === 0) {
    ticketsText += '📭 У вас пока нет заявок в техподдержку.';
  } else {
      userTickets.forEach(ticket => {
    const statusInfo = TICKET_STATUSES[ticket.status];
    const date = ticket.createdAt ? ticket.createdAt.toLocaleDateString('ru-RU') : 'Неизвестно';
    const shortId = ticket._id.toString().slice(-6);
    
    ticketsText += `${statusInfo.emoji} *#${shortId}* — ${statusInfo.name}\n`;
    ticketsText += `📅 ${date} | 💬 ${ticket.message.substring(0, 50)}${ticket.message.length > 50 ? '...' : ''}\n`;
    
    if (ticket.adminResponse) {
      ticketsText += `💬 *Ответ:* ${ticket.adminResponse.substring(0, 50)}${ticket.adminResponse.length > 50 ? '...' : ''}\n`;
    }
    
    ticketsText += `\n`;
  });
  }

  ctx.editMessageText(ticketsText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🆕 Создать заявку', 'support_create')],
      [Markup.button.callback('🛠️ Назад в поддержку', 'support_menu')]
    ])
  });
});

// Уведомления фарма и бонуса
bot.action('farm', async (ctx) => {
  // Проверяем подписку
  const isSubscribed = await checkSubscription(ctx);
  if (!isSubscribed) {
    await showSubscriptionMessage(ctx);
    return;
  }
  
  const user = await getUser(ctx.from.id, ctx);
  const canFarm = !user.lastFarm || (now() - user.lastFarm) >= 60;
  
  if (canFarm) {
    const baseReward = 1;
    const boostedReward = applyBoostMultiplier(baseReward, user, 'farm');
    
    await users.updateOne({ id: ctx.from.id }, { 
      $inc: { magnumCoins: boostedReward, farmCount: 1, dailyFarms: 1 }, 
      $set: { lastFarm: now() } 
    });
    
    // Проверяем задание активного фармера
    const updatedUser = await getUser(ctx.from.id);
    if ((updatedUser.dailyFarms || 0) >= 10) {
      await markDailyTaskCompleted(ctx.from.id, 'farm_10');
    }
    
    // Проверяем новые титулы и достижения
    const newTitles = await checkAndAwardTitles(ctx.from.id);
    const newAchievements = await checkAndAwardAchievements(ctx.from.id);
    
    // Обновляем баланс в интерфейсе
    await updateMainMenuBalance(ctx);
    
    const rewardText = boostedReward > baseReward ? `+${boostedReward} Magnum Coin (🔥 БУСТ!)` : `+${boostedReward} Magnum Coin`;
    
    if (newTitles.length > 0 && newAchievements.length > 0) {
      ctx.answerCbQuery(`[🪙 ${rewardText}] [🏆 Новый титул!] [🎖️ Достижение!]`);
    } else if (newTitles.length > 0) {
      ctx.answerCbQuery(`[🪙 ${rewardText}] [🏆 Новый титул получен!]`);
    } else if (newAchievements.length > 0) {
      ctx.answerCbQuery(`[🪙 ${rewardText}] [🎖️ ${newAchievements[0].name}!]`);
    } else {
      ctx.answerCbQuery(`[🪙 ${rewardText}]`);
    }
  } else {
    const timeLeft = 60 - (now() - user.lastFarm);
    ctx.answerCbQuery(`⏳ До следующего фарма: ${timeLeft} сек.`);
  }
});

bot.action('bonus', async (ctx) => {
  // Проверяем подписку
  const isSubscribed = await checkSubscription(ctx);
  if (!isSubscribed) {
    await showSubscriptionMessage(ctx);
    return;
  }
  
  const user = await getUser(ctx.from.id, ctx);
  const today = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const canBonus = !user.lastBonus || user.lastBonus < today;
  
  console.log(`Бонус - Пользователь: ${ctx.from.id}, lastBonus: ${user.lastBonus}, today: ${today}, canBonus: ${canBonus}`);
  
  if (canBonus) {
    // Проверяем серию ежедневных заходов
    const yesterday = today - 1;
    let dailyStreak = 1;
    if (user.lastBonus === yesterday) {
      dailyStreak = (user.dailyStreak || 0) + 1;
    }
    
    const baseReward = 3;
    const boostedReward = applyBoostMultiplier(baseReward, user, 'bonus');
    
    await users.updateOne({ id: ctx.from.id }, { 
      $inc: { magnumCoins: boostedReward, bonusCount: 1 }, 
      $set: { lastBonus: today, dailyStreak: dailyStreak } 
    });
    
    // Отмечаем задание "ежедневный бонус"
    await markDailyTaskCompleted(ctx.from.id, 'bonus');
    
    // Проверяем новые титулы и достижения
    const newTitles = await checkAndAwardTitles(ctx.from.id);
    const newAchievements = await checkAndAwardAchievements(ctx.from.id);
    
    // Обновляем баланс в интерфейсе
    await updateMainMenuBalance(ctx);
    
    const rewardText = boostedReward > baseReward ? `+${boostedReward} Magnum Coin (🔥 БУСТ!)` : `+${boostedReward} Magnum Coin`;
    
    if (newTitles.length > 0 && newAchievements.length > 0) {
      ctx.answerCbQuery(`[🎁 ${rewardText}] [🏆 Новый титул!] [🎖️ Достижение!]`);
    } else if (newTitles.length > 0) {
      ctx.answerCbQuery(`[🎁 ${rewardText}] [🏆 Новый титул!]`);
    } else if (newAchievements.length > 0) {
      ctx.answerCbQuery(`[🎁 ${rewardText}] [🎖️ ${newAchievements[0].name}!]`);
    } else {
      ctx.answerCbQuery(`[🎁 ${rewardText}] Ежедневный бонус получен!`);
    }
  } else {
    // Расчет времени до следующего дня (00:00)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const timeLeft = tomorrow.getTime() - now.getTime();
    const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    console.log(`Бонус - timeLeft: ${timeLeft}, hoursLeft: ${hoursLeft}, minutesLeft: ${minutesLeft}`);
    
    if (hoursLeft > 0) {
      ctx.answerCbQuery(`🕐 Следующий бонус через ${hoursLeft}ч ${minutesLeft}мин`);
    } else {
      ctx.answerCbQuery(`🕐 Следующий бонус через ${minutesLeft} минут`);
    }
  }
});

// Уведомления заданий
bot.action(/^claim_daily_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const task = dailyTasks.find(t => t.id === taskId);
  if (!task) return;
  
  await tasks.updateOne(
    { userId: ctx.from.id, type: 'daily' },
    { $set: { [`claimed.${taskId}`]: true } }
  );
  await users.updateOne({ id: ctx.from.id }, { $inc: { magnumCoins: task.reward } });
  
  ctx.answerCbQuery(`[🎁 +${task.reward}] Magnum Coin получено!`);
  ctx.action('daily_tasks')(ctx);
});

bot.action(/^claim_sponsor_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const task = sponsorTasks.find(t => t.id === taskId);
  if (!task) return;
  
  await tasks.updateOne(
    { userId: ctx.from.id, type: 'sponsor' },
    { $set: { [`claimed.${taskId}`]: true } }
  );
  await users.updateOne({ id: ctx.from.id }, { $inc: { magnumCoins: task.reward } });
  
  ctx.answerCbQuery(`[🎁 +${task.reward}] Magnum Coin получено!`);
  ctx.action('sponsor_tasks')(ctx);
});

bot.action(/^check_sponsor_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  await tasks.updateOne(
    { userId: ctx.from.id, type: 'sponsor' },
    { $set: { [`completed.${taskId}`]: true } }
  );
  
  ctx.answerCbQuery('✅ Задание выполнено!');
  ctx.action('sponsor_tasks')(ctx);
});

connectDB().then(() => {
  console.log('🚀 Запускаем бота...');
  
  // Добавляем глобальное логирование всех событий
  bot.use(async (ctx, next) => {
    console.log('🔄 Событие:', ctx.updateType, 'от пользователя:', ctx.from?.id, ctx.from?.first_name);
    if (ctx.message) {
      console.log('📨 Тип сообщения:', ctx.message.text ? 'text' : 'other');
    }
    if (ctx.callbackQuery) {
      console.log('🔘 Callback data:', ctx.callbackQuery.data);
    }
    return next();
  });
  
  bot.launch();
  console.log('✅ Бот запущен успешно!');
  console.log('📱 Готов к обработке сообщений');
}).catch(error => {
  console.error('❌ Ошибка запуска бота:', error);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Обработчики кнопок из канала поддержки
bot.action(/^ticket_accept_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  const objectId = new ObjectId(ticketId);
  await updateTicketStatus(objectId, 'in_progress');
  await notifyUserStatusChange(objectId, 'принята в работу ⚙️');
  await updateTicketInChannel(objectId);
  
  ctx.answerCbQuery('✅ Заявка принята в работу');
});

bot.action(/^ticket_reject_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  const objectId = new ObjectId(ticketId);
  await updateTicketStatus(objectId, 'rejected');
  await notifyUserStatusChange(objectId, 'отклонена ❌');
  await updateTicketInChannel(objectId);
  
  ctx.answerCbQuery('❌ Заявка отклонена');
});

bot.action(/^ticket_resolve_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  const objectId = new ObjectId(ticketId);
  await updateTicketStatus(objectId, 'resolved');
  await notifyUserStatusChange(objectId, 'решена ✅');
  await updateTicketInChannel(objectId);
  
  ctx.answerCbQuery('✅ Заявка решена');
});

bot.action(/^ticket_close_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  const objectId = new ObjectId(ticketId);
  await updateTicketStatus(objectId, 'closed');
  await notifyUserStatusChange(objectId, 'закрыта 🔒');
  await updateTicketInChannel(objectId);
  
  ctx.answerCbQuery('🔒 Заявка закрыта');
});

// Навигация по заданиям спонсоров
bot.action(/^sponsor_task_(\d+)$/, async (ctx) => {
  const taskIndex = parseInt(ctx.match[1]);
  showSponsorTask(ctx, taskIndex);
});

// Выполнение задания
bot.action(/^task_complete_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const task = SPONSOR_TASKS.find(t => t.id === taskId);
  
  if (!task) {
    return ctx.answerCbQuery('❌ Задание не найдено');
  }

  await ctx.deleteMessage();
  
  ctx.reply(
    `📷 Подтверждение выполнения задания\n\n` +
    `📋 Задание: ${task.title}\n` +
    `📝 Инструкция: ${task.instruction}\n\n` +
    `Отправьте скриншот выполнения:\n\n` +
    `🆔 ID задания: ${task.id}`,
    {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Отправьте скриншот...'
      }
    }
  );
});

// Обработчики проверки заданий в канале
bot.action(/^task_approve_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const checkId = ctx.match[1];
  const objectId = new ObjectId(checkId);
  
  const taskCheck = await taskChecks.findOne({ _id: objectId });
  if (!taskCheck) {
    return ctx.answerCbQuery('❌ Проверка не найдена');
  }
  
  const task = SPONSOR_TASKS.find(t => t.id === taskCheck.taskId);
  if (!task) {
    return ctx.answerCbQuery('❌ Задание не найдено');
  }
  
  // Обновляем статус
  await updateTaskCheckStatus(objectId, 'approved');
  
  // Начисляем награду
  await users.updateOne(
    { id: taskCheck.userId },
    { $inc: { stars: task.reward } }
  );
  
  // Уведомляем пользователя
  try {
    await bot.telegram.sendMessage(
      taskCheck.userId,
      `✅ *Задание одобрено!*\n\n` +
      `📋 *Задание:* ${task.title}\n` +
      `🎁 *Получено:* +${task.reward} звёзд\n\n` +
      `Поздравляем с успешным выполнением!`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Ошибка уведомления пользователя:', error);
  }
  
  await updateTaskCheckInChannel(objectId);
  ctx.answerCbQuery('✅ Задание одобрено');
});

bot.action(/^task_reject_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const checkId = ctx.match[1];
  const objectId = new ObjectId(checkId);
  
  const taskCheck = await taskChecks.findOne({ _id: objectId });
  if (!taskCheck) {
    return ctx.answerCbQuery('❌ Проверка не найдена');
  }
  
  const task = SPONSOR_TASKS.find(t => t.id === taskCheck.taskId);
  
  // Обновляем статус
  await updateTaskCheckStatus(objectId, 'rejected');
  
  // Уведомляем пользователя
  try {
    await bot.telegram.sendMessage(
      taskCheck.userId,
      `❌ *Задание отклонено*\n\n` +
      `📋 *Задание:* ${task ? task.title : 'Неизвестно'}\n\n` +
      `Попробуйте выполнить задание снова согласно инструкции.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Ошибка уведомления пользователя:', error);
  }
  
  await updateTaskCheckInChannel(objectId);
  ctx.answerCbQuery('❌ Задание отклонено');
});

bot.action(/^task_reply_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const checkId = ctx.match[1];
  
  try {
    await bot.telegram.sendMessage(
      ctx.from.id,
      `💬 *Ответ по проверке задания #${checkId.slice(-6)}*\n\nВведите ваш комментарий:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true,
          input_field_placeholder: 'Введите комментарий для пользователя...'
        }
      }
    );
    
    ctx.answerCbQuery('💬 Проверьте личные сообщения для ответа');
  } catch (error) {
    console.error('Ошибка отправки приглашения к ответу:', error);
    ctx.answerCbQuery('❌ Ошибка! Убедитесь, что бот может писать в личные сообщения');
  }
});

bot.action(/^ticket_reply_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  
  try {
    // Отправляем приглашение к ответу в личные сообщения админу
    await bot.telegram.sendMessage(
      ctx.from.id,
      `💬 *Ответ пользователю по заявке #${ticketId.slice(-6)}*\n\nВведите ваш ответ:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true,
          input_field_placeholder: 'Введите ваш ответ пользователю...'
        }
      }
    );
    
    ctx.answerCbQuery('💬 Проверьте личные сообщения для ответа');
  } catch (error) {
    console.error('Ошибка отправки приглашения к ответу:', error);
    ctx.answerCbQuery('❌ Ошибка! Убедитесь, что бот может писать в личные сообщения');
  }
});