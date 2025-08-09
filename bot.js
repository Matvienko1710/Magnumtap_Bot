require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { MongoClient, ObjectId } = require('mongodb');

// Конфигурация
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
const SUPPORT_CHANNEL = process.env.SUPPORT_CHANNEL; // Имя канала без @

// Ссылки для заданий (настраиваются через переменные окружения)
const FIRESTARS_BOT_LINK = process.env.FIRESTARS_BOT_LINK || 'https://t.me/firestars_rbot?start=6587897295';
const FARMIK_BOT_LINK = process.env.FARMIK_BOT_LINK || 'https://t.me/farmikstars_bot?start=6587897295';  
const BASKET_BOT_LINK = process.env.BASKET_BOT_LINK || 'https://t.me/basket_gift_bot?start=6587897295';

if (!BOT_TOKEN) throw new Error('Не задан BOT_TOKEN!');
if (!MONGODB_URI) throw new Error('Не задан MONGODB_URI!');

const bot = new Telegraf(BOT_TOKEN);
const mongo = new MongoClient(MONGODB_URI);
let users, promocodes, taskChecks;

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
          $inc: { stars: achievement.reward }
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
  const userTitles = user.titles || [];
  if (userTitles.length === 0) return '🆕 Новичок';
  
  // Приоритет: секретные > легенда > по порядку
  const titleOrder = ['vip_elite', 'early_bird', 'night_owl', 'legend', 'star_lord', 'task_warrior', 'promo_master', 'bonus_hunter', 'daily_visitor', 'inviter', 'collector', 'farmer', 'newcomer'];
  
  for (const titleId of titleOrder) {
    if (userTitles.includes(titleId)) {
      return TITLES[titleId].name;
    }
  }
  return '🆕 Новичок';
}

function getNextLevelInfo(user) {
  const stars = user.stars || 0;
  const levels = [
    { name: 'Bronze Star', requirement: 50 },
    { name: 'Silver Star', requirement: 150 },
    { name: 'Gold Star', requirement: 300 },
    { name: 'Platinum Star', requirement: 500 },
    { name: 'Diamond Star', requirement: 1000 },
    { name: 'Master Star', requirement: 2000 }
  ];

  for (const level of levels) {
    if (stars < level.requirement) {
      return {
        nextLevel: level.name,
        starsNeeded: level.requirement - stars
      };
    }
  }
  return { nextLevel: 'Максимальный уровень', starsNeeded: 0 };
}

async function connectDB() {
  await mongo.connect();
  const db = mongo.db();
  users = db.collection('users');
  promocodes = db.collection('promocodes');
  tasks = db.collection('tasks');
  titles = db.collection('titles');
  supportTickets = db.collection('supportTickets'); // добавляем коллекцию заявок
  taskChecks = db.collection('taskChecks'); // коллекция проверок заданий
}

function now() { return Math.floor(Date.now() / 1000); }

// Обновляем функцию getUser для автоматической проверки титулов
async function getUser(id) {
  let user = await users.findOne({ id });
  if (!user) {
    user = {
      id,
      username: '',
      stars: 0,
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
  }
  return user;
}

function isAdmin(userId) { return ADMIN_IDS.includes(String(userId)); }

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

async function getDetailedProfile(userId) {
  const user = await getUser(userId);
  const balance = Math.round((user.stars || 0) * 100) / 100; // Округляем до 2 знаков
  const friends = user.invited || 0;
  const rank = getUserMainTitle(user);
  const nextLevel = getNextLevelInfo(user);
  
  // Создаем шкалу прогресса
  const levels = [
    { name: 'Bronze Star', requirement: 50 },
    { name: 'Silver Star', requirement: 150 },
    { name: 'Gold Star', requirement: 300 },
    { name: 'Platinum Star', requirement: 500 },
    { name: 'Diamond Star', requirement: 1000 },
    { name: 'Master Star', requirement: 2000 }
  ];
  
  let prevLevelStars = 0;
  let nextLevelStars = 50; // По умолчанию до Bronze Star
  
  // Находим текущий диапазон уровня
  for (let i = 0; i < levels.length; i++) {
    if (balance < levels[i].requirement) {
      nextLevelStars = levels[i].requirement;
      prevLevelStars = i > 0 ? levels[i - 1].requirement : 0;
      break;
    }
  }
  
  // Если достиг максимального уровня
  if (nextLevel.starsNeeded === 0) {
    prevLevelStars = levels[levels.length - 1].requirement;
    nextLevelStars = prevLevelStars;
  }
  
  const currentProgress = Math.max(0, balance - prevLevelStars);
  const levelRange = nextLevelStars - prevLevelStars;
  const progressPercent = nextLevel.starsNeeded === 0 ? 100 : 
    levelRange > 0 ? Math.floor((currentProgress / levelRange) * 100) : 0;
  
  const progressBar = nextLevel.starsNeeded === 0 ? 
    '▓▓▓▓▓▓▓▓▓▓ 100%' : 
    createProgressBar(currentProgress, levelRange) + ` ${progressPercent}%`;
  
  // Округляем starsNeeded до 2 знаков
  const starsNeededRounded = Math.round(nextLevel.starsNeeded * 100) / 100;
  
  return `👑 **Профиль игрока MagnumTap** 👑

💫 **Статус:** ${getStatusDisplayName(user)}  
💎 **Баланс:** ${balance} ⭐ звёзд  
👥 **Друзей приглашено:** ${friends}  
🏆 **Ранг:** ${rank} 🌟

📊 **Прогресс уровня:**  
${progressBar}
${nextLevel.starsNeeded === 0 ? '🌟 Максимальный уровень достигнут!' : `До ${nextLevel.nextLevel}: ${starsNeededRounded} звёзд`}`;
}

function getWelcomeText(balance, invited) {
  return (
    "👋 Добро пожаловать в *MagnumTapBot*! 🌟\n\n" +
    "Ты в игре, где можно зарабатывать звёзды ✨, выполняя простые задания, приглашая друзей и собирая бонусы! 🚀\n\n" +
    "💫 Твой баланс: " + balance + " звёзд\n" +
    "👥 Приглашено друзей: " + invited + "\n\n" +
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
  { id: 'login', name: 'Зайти в бота', reward: 5, description: 'Просто запустите бота!' },
  { id: 'bonus', name: 'Получить дневной бонус', reward: 10, description: 'Нажмите кнопку "Бонус"' },
  { id: 'invite', name: 'Пригласить друга', reward: 20, description: 'Пригласите одного друга' }
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
  }
  return userTasks;
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
  const profileText = await getDetailedProfile(userId);
  
  return {
    text: profileText,
    extra: {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌟 Фармить звёзды', 'farm'), Markup.button.callback('🎁 Бонус', 'bonus')],
        [Markup.button.callback('👤 Профиль', 'profile'), Markup.button.callback('🏆 Топ', 'top')],
        [Markup.button.callback('🤝 Пригласить друзей', 'invite'), Markup.button.callback('🎫 Промокод', 'promo')],
        [Markup.button.callback('📋 Ежедневные задания', 'daily_tasks'), Markup.button.callback('🎯 Задания от спонсора', 'sponsor_tasks')],
        ...adminRow
      ])
    }
  };
}

bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id);
  const menu = await getMainMenu(ctx, ctx.from.id);
  await ctx.reply(menu.text, menu.extra);
});

bot.action('main_menu', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) {}
  const menu = await getMainMenu(ctx, ctx.from.id);
  ctx.reply(menu.text, menu.extra);
});

// Обновляем профиль с кнопкой техподдержки
bot.action('profile', async (ctx) => {
  const profileText = await getDetailedProfile(ctx.from.id);

  ctx.editMessageText(profileText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🏆 Мои титулы', 'my_titles'), Markup.button.callback('🎖️ Достижения', 'achievements')],
      [Markup.button.callback('🛠️ Тех поддержка', 'support_menu'), Markup.button.callback('❓ FAQ', 'faq')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ])
  });
});

bot.action('my_titles', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const userTitles = user.titles || [];
  
  let titlesText = '🏆 **Твои титулы** 🏆\n\n';
  
  if (userTitles.length === 0) {
    titlesText += '🆕 Пока что у тебя нет титулов.\nВыполняй задания и приглашай друзей, чтобы заработать их!';
  } else {
    userTitles.forEach(titleId => {
      if (TITLES[titleId]) {
        titlesText += `${TITLES[titleId].name}\n${TITLES[titleId].description}\n\n`;
      }
    });
  }

  ctx.editMessageText(titlesText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('👤 Назад к профилю', 'profile')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ])
  });
});

bot.action('top', async (ctx) => {
  const topUsers = await users.find({}).sort({ stars: -1 }).limit(10).toArray();
  let msg = '🏆 Топ-10 игроков по звёздам:\n\n';
  topUsers.forEach((user, i) => {
    const name = user.username || user.id;
    msg += `${i + 1}. ${name} — ${user.stars || 0} звёзд\n`;
  });
  ctx.editMessageText(msg, Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
});

bot.action('invite', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const refLink = `https://t.me/${ctx.me}?start=${ctx.from.id}`;
  ctx.editMessageText(
    `🤝 Пригласить друзей\n\n` +
    `Отправь эту ссылку друзьям и получай звёзды за каждого, кто присоединится!\n\n` +
    `🔗 Твоя ссылка: ${refLink}\n\n` +
    `👥 Приглашено друзей: ${user.invited || 0}`,
    Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]])
  );
});

// Промокоды (минималистично, если не нужны — удалить этот блок)
const promoCodes = { 'MAGNUM10': 10, 'STAR50': 50 };
const userPromoUsed = {};
bot.action('promo', async (ctx) => {
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
  const replyMsg = ctx.message.reply_to_message;
  if (!replyMsg) return;

  const text = ctx.message.text;
  const replyText = replyMsg.text;

  try {
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
      else if (replyText.includes('Введите промокод и количество звёзд')) {
        const [code, stars] = text.trim().split(/\s+/);
        if (!code || isNaN(Number(stars))) {
          return ctx.reply('❌ Формат: КОД 10');
        }
        await promocodes.insertOne({
          code: code.toUpperCase(),
          stars: Number(stars),
          max: 100,
          used: 0,
          created: now()
        });
        ctx.reply(`✅ Промокод ${code.toUpperCase()} на ${stars} звёзд добавлен.`);
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
  const adminText = '⚙️ **Админ-панель** ⚙️\n\n🎛️ Выберите действие:';

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
    '⚙️ **Админ-панель** ⚙️\n\n🎛️ Выберите действие:',
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
  let statusText = '💫 **Управление статусами** 💫\n\n';
  statusText += '📋 **Доступные статусы:**\n\n';
  
  Object.entries(USER_STATUSES).forEach(([key, status]) => {
    statusText += `${status.color} **${status.name}**\n`;
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
    '➕ **Выдача статуса**\n\nВведите ID пользователя и статус через пробел:\n\n📝 Формат: `ID СТАТУС`\n\n🔧 Доступные статусы:\n• owner\n• admin\n• moderator\n• vip_gold\n• vip\n• verified\n• member',
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
    '➖ **Сброс статуса**\n\nВведите ID пользователя для сброса статуса к обычному участнику:',
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
    '👤 **Проверка статуса**\n\nВведите ID пользователя для просмотра его статуса:',
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
  const adminFaqText = `❓ **FAQ Админ-панели** ❓

🎛️ **Основные функции:**

📢 **Рассылка** - Отправка сообщений всем пользователям
├ Введите текст для рассылки
└ Сообщение отправится всем зарегистрированным пользователям

🎫 **Промокод** - Создание промокодов
├ Формат: НАЗВАНИЕ ЗВЁЗДЫ ЛИМИТ
├ Пример: NEWCODE 25 100
└ Создаст промокод на 25 звёзд с лимитом 100 активаций

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
  return ctx.reply(text, {
    reply_markup: {
      force_reply: true,
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
  await adminForceReply(ctx, '➕ Введите промокод и количество звёзд через пробел (например: NEWCODE 25):');
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

// Обновляем обработчик текстовых сообщений для титулов
bot.on('text', async (ctx) => {
  const replyMsg = ctx.message.reply_to_message;
  if (!replyMsg || !isAdmin(ctx.from.id)) return;

  const text = ctx.message.text;
  const replyText = replyMsg.text;

  try {
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

    // ... existing admin text handlers ...
  } catch (error) {
    ctx.reply('❌ Произошла ошибка при обработке команды!');
  }
});

bot.action('daily_tasks', async (ctx) => {
  const userTasks = await getUserTasks(ctx.from.id, true);
  let msg = '📋 Ежедневные задания\n\n';
  
  dailyTasks.forEach(task => {
    const completed = userTasks.completed[task.id];
    const claimed = userTasks.claimed[task.id];
    const status = claimed ? '✅ Получено' : completed ? '🎁 Забрать' : '⏳ Выполнить';
    msg += `${status} ${task.name} (+${task.reward} звёзд)\n${task.description}\n\n`;
  });
  
  const buttons = [];
  dailyTasks.forEach(task => {
    const completed = userTasks.completed[task.id];
    const claimed = userTasks.claimed[task.id];
    if (completed && !claimed) {
      buttons.push([Markup.button.callback(`🎁 ${task.name}`, `claim_daily_${task.id}`)]);
    }
  });
  buttons.push([Markup.button.callback('🏠 Главное меню', 'main_menu')]);
  
  ctx.editMessageText(msg, Markup.inlineKeyboard(buttons));
});

bot.action('sponsor_tasks', async (ctx) => {
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
  const faqText = `❓ **MagnumTapBot - Справка и информация** ❓

🤖 **О боте:**
MagnumTapBot - это игровой бот для заработка звёзд ⭐ и достижения различных целей!

💰 **Способы заработка звёзд:**
• 🌟 **Фарм** - получайте 0.01 звезды каждую минуту
• 🎁 **Ежедневный бонус** - 3 звезды раз в день
• 🎯 **Спонсорские задания** - по 3 звезды за задание
• 👥 **Рефералы** - приглашайте друзей за награды
• 🎫 **Промокоды** - активируйте для получения звёзд
• 🎖️ **Достижения** - выполняйте для бонусов

🏆 **Система титулов:**
Зарабатывайте титулы за активность:
• 🌱 Новичок • ⚡ Фармер • 💎 Коллекционер
• 🤝 Амбассадор • 📅 Постоянный посетитель
• 🎁 Охотник за бонусами • 🎫 Мастер промокодов
• ⚔️ Воин заданий • 🌟 Звёздный лорд • 👑 Легенда

📊 **Уровни:**
Bronze → Silver → Gold → Platinum → Diamond → Master

🎖️ **Достижения:**
• 💰 Сотка (100 звёзд)
• 🤝 Социальная бабочка (10 друзей)
• ⚡ Недельный воин (7 дней подряд)
• 🌾 Мастер фарма (1000 фармов)
• 🎫 Охотник за промо (15 промокодов)

🛠️ **Дополнительные функции:**
• 🏆 Топ игроков
• 🛠️ Техническая поддержка
• 📋 Ежедневные задания
• 🎯 Задания от спонсоров

💡 **Советы:**
• Заходите каждый день за бонусом
• Фармите регулярно для титулов
• Приглашайте друзей для быстрого роста
• Выполняйте все задания
• Следите за промокодами!`;

  ctx.editMessageText(faqText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]])
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
  const user = await getUser(ctx.from.id);
  const canFarm = !user.lastFarm || (now() - user.lastFarm) >= 60;
  
  if (canFarm) {
    await users.updateOne({ id: ctx.from.id }, { 
      $inc: { stars: 0.01, farmCount: 1 }, 
      $set: { lastFarm: now() } 
    });
    
    // Проверяем новые титулы и достижения
    const newTitles = await checkAndAwardTitles(ctx.from.id);
    const newAchievements = await checkAndAwardAchievements(ctx.from.id);
    
    // Обновляем баланс в интерфейсе
    await updateMainMenuBalance(ctx);
    
    if (newTitles.length > 0 && newAchievements.length > 0) {
      ctx.answerCbQuery('⭐ +0.01 звезды! 🏆 Новый титул! 🎖️ Достижение!');
    } else if (newTitles.length > 0) {
      ctx.answerCbQuery('⭐ +0.01 звезды! 🏆 Новый титул получен!');
    } else if (newAchievements.length > 0) {
      ctx.answerCbQuery(`⭐ +0.01 звезды! 🎖️ ${newAchievements[0].name}!`);
    } else {
      ctx.answerCbQuery('⭐ +0.01 звезды!');
    }
  } else {
    const timeLeft = 60 - (now() - user.lastFarm);
    ctx.answerCbQuery(`⏳ До следующего фарма: ${timeLeft} сек.`);
  }
});

bot.action('bonus', async (ctx) => {
  const user = await getUser(ctx.from.id);
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
    
    await users.updateOne({ id: ctx.from.id }, { 
      $inc: { stars: 3, bonusCount: 1 }, 
      $set: { lastBonus: today, dailyStreak: dailyStreak } 
    });
    
    // Проверяем новые титулы и достижения
    const newTitles = await checkAndAwardTitles(ctx.from.id);
    const newAchievements = await checkAndAwardAchievements(ctx.from.id);
    
    // Обновляем баланс в интерфейсе
    await updateMainMenuBalance(ctx);
    
    if (newTitles.length > 0 && newAchievements.length > 0) {
      ctx.answerCbQuery('🎁 +3 звезды! 🏆 Новый титул! 🎖️ Достижение!');
    } else if (newTitles.length > 0) {
      ctx.answerCbQuery('🎁 +3 звезды бонус! 🏆 Новый титул!');
    } else if (newAchievements.length > 0) {
      ctx.answerCbQuery(`🎁 +3 звезды! 🎖️ ${newAchievements[0].name}!`);
    } else {
      ctx.answerCbQuery('🎁 +3 звезды! Ежедневный бонус получен!');
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
  await users.updateOne({ id: ctx.from.id }, { $inc: { stars: task.reward } });
  
  ctx.answerCbQuery(`🎁 Получено ${task.reward} звёзд!`);
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
  await users.updateOne({ id: ctx.from.id }, { $inc: { stars: task.reward } });
  
  ctx.answerCbQuery(`🎁 Получено ${task.reward} звёзд!`);
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
  bot.launch();
  console.log('Бот запущен!');
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