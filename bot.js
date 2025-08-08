require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

// Конфигурация
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
const SUPPORT_CHANNEL = process.env.SUPPORT_CHANNEL; // Имя канала без @

if (!BOT_TOKEN) throw new Error('Не задан BOT_TOKEN!');
if (!MONGODB_URI) throw new Error('Не задан MONGODB_URI!');

const bot = new Telegraf(BOT_TOKEN);
const mongo = new MongoClient(MONGODB_URI);
let users, promocodes;

// Система титулов
const TITLES = {
  // Обычные титулы (10)
  'newcomer': { name: '🌱 Новичок', description: 'Начал путь в MagnumTap', condition: 'registration', requirement: 1 },
  'farmer': { name: '⚡ Фармер', description: 'Выполнил 50 действий фарминга', condition: 'farm_count', requirement: 50 },
  'collector': { name: '💎 Коллекционер', description: 'Собрал 100 звёзд', condition: 'stars', requirement: 100 },
  'inviter': { name: '🤝 Амбассадор', description: 'Пригласил 5 друзей', condition: 'invited', requirement: 5 },
  'daily_visitor': { name: '📅 Постоянный посетитель', description: '7 дней подряд заходил в бота', condition: 'daily_streak', requirement: 7 },
  'bonus_hunter': { name: '🎁 Охотник за бонусами', description: 'Собрал 30 ежедневных бонусов', condition: 'bonus_count', requirement: 30 },
  'promo_master': { name: '🎫 Мастер промокодов', description: 'Активировал 10 промокодов', condition: 'promo_count', requirement: 10 },
  'task_warrior': { name: '⚔️ Воин заданий', description: 'Выполнил 100 заданий', condition: 'task_count', requirement: 100 },
  'star_lord': { name: '🌟 Звёздный лорд', description: 'Собрал 500 звёзд', condition: 'stars', requirement: 500 },
  'legend': { name: '👑 Легенда', description: 'Собрал 1000 звёзд и пригласил 20 друзей', condition: 'combined', requirement: { stars: 1000, invited: 20 } },

  // Секретные титулы (3)
  'early_bird': { name: '🌅 Ранняя пташка', description: 'Секретный титул за особую активность', condition: 'secret', requirement: 'special' },
  'night_owl': { name: '🦉 Ночная сова', description: 'Секретный титул для ночных игроков', condition: 'secret', requirement: 'special' },
  'vip_elite': { name: '💫 VIP Элита', description: 'Эксклюзивный титул от администрации', condition: 'secret', requirement: 'admin_only' }
};

// Система техподдержки
const TICKET_STATUSES = {
  'new': { name: '🆕 Новая', color: '🔵', emoji: '🔵' },
  'in_progress': { name: '⚙️ В работе', color: '🟡', emoji: '⚙️' },
  'resolved': { name: '✅ Решена', color: '🟢', emoji: '✅' },
  'rejected': { name: '❌ Отклонена', color: '🔴', emoji: '❌' },
  'closed': { name: '🔒 Закрыта', color: '⚫', emoji: '🔒' }
};

async function createSupportTicket(userId, username, message) {
  const ticketId = Math.random().toString(36).substr(2, 9).toUpperCase();
  const ticket = {
    id: ticketId,
    userId: userId,
    username: username || 'Неизвестно',
    message: message,
    status: 'new',
    created: now(),
    updated: now(),
    adminResponse: null
  };
  
  await supportTickets.insertOne(ticket);
  return ticket;
}

async function updateTicketStatus(ticketId, status, adminResponse = null, messageId = null) {
  const updateData = { 
    status: status, 
    updated: now() 
  };
  
  if (adminResponse) {
    updateData.adminResponse = adminResponse;
  }
  
  await supportTickets.updateOne(
    { id: ticketId },
    { $set: updateData }
  );

  if (messageId) {
    await bot.telegram.editMessageReplyMarkup(
      `@${SUPPORT_CHANNEL}`,
      messageId,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: TICKET_STATUSES[status].emoji + ' ' + TICKET_STATUSES[status].name, callback_data: `ticket_status_${ticketId}` }
            ],
            [
              { text: '💬 Ответить', callback_data: `ticket_reply_${ticketId}` }
            ]
          ]
        }
      }
    );
  }
}

async function sendTicketToChannel(ticket) {
  const supportChannelId = SUPPORT_CHANNEL;
  if (!supportChannelId) return;

  const statusInfo = TICKET_STATUSES[ticket.status];
  
  try {
    const message = await bot.telegram.sendMessage(`@${supportChannelId}`, 
      `🎫 *Новая заявка техподдержки #${ticket._id.toString().slice(-6)}*\n\n` +
      `👤 Пользователь: ${ticket.username || 'Неизвестно'} (ID: ${ticket.userId})\n` +
      `📝 Сообщение: ${ticket.message}\n` +
      `📅 Создана: ${ticket.createdAt.toLocaleString('ru-RU')}\n` +
      `📊 Статус: ${statusInfo.emoji} ${statusInfo.name}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Одобрить', callback_data: `ticket_accept_${ticket._id}` },
              { text: '❌ Отклонить', callback_data: `ticket_reject_${ticket._id}` }
            ],
            [
              { text: '🔧 В работе', callback_data: `ticket_progress_${ticket._id}` },
              { text: '✅ Решено', callback_data: `ticket_resolve_${ticket._id}` }
            ],
            [
              { text: '🗑️ Закрыть', callback_data: `ticket_close_${ticket._id}` },
              { text: '💬 Ответить', callback_data: `ticket_reply_${ticket._id}` }
            ]
          ]
        }
      }
    );
    
    await updateTicketStatus(ticket._id, ticket.status, null, message.message_id);
  } catch (error) {
    console.error('Ошибка отправки в канал поддержки:', error);
  }
}

// Функции для работы с титулами
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
      farmCount: 0,
      bonusCount: 0,
      promoCount: 0,
      taskCount: 0,
      dailyStreak: 0
    };
    await users.insertOne(user);
    // Даём титул новичка
    await checkAndAwardTitles(id);
  }
  return user;
}

function isAdmin(userId) { return ADMIN_IDS.includes(String(userId)); }

function getWelcomeText(balance, invited) {
  return (
    "👋 Добро пожаловать в *MagnumTapBot*! 🌟\n\n" +
    "Ты в игре, где можно зарабатывать звёзды ✨, выполняя простые задания, приглашая друзей и собирая бонусы! 🚀\n\n" +
    "💫 Твой баланс: " + balance + " звёзд\n" +
    "👥 Приглашено друзей: " + invited + "\n\n" +
    "Выбери действие и стань звездой MagnumTapBot! 🌟"
  );
}

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

function getMainMenu(ctx, balance, invited) {
  const adminRow = isAdmin(ctx.from.id) ? [[Markup.button.callback('⚙️ Админ-панель', 'admin_panel')]] : [];
  return {
    text: getWelcomeText(balance, invited),
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
  const balance = user.stars || 0;
  const invited = user.invited || 0;
  const menu = getMainMenu(ctx, balance, invited);
  await ctx.reply(menu.text, menu.extra);
});

bot.action('main_menu', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) {}
  const user = await getUser(ctx.from.id);
  const balance = user.stars || 0;
  const invited = user.invited || 0;
  const adminRow = isAdmin(ctx.from.id) ? [[Markup.button.callback('⚙️ Админ-панель', 'admin_panel')]] : [];
  ctx.reply(
    getWelcomeText(balance, invited),
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌟 Фармить звёзды', 'farm'), Markup.button.callback('🎁 Бонус', 'bonus')],
        [Markup.button.callback('👤 Профиль', 'profile'), Markup.button.callback('🏆 Топ', 'top')],
        [Markup.button.callback('🤝 Пригласить друзей', 'invite'), Markup.button.callback('🎫 Промокод', 'promo')],
        [Markup.button.callback('📋 Ежедневные задания', 'daily_tasks'), Markup.button.callback('🎯 Задания от спонсора', 'sponsor_tasks')],
        ...adminRow
      ])
    }
  );
});

// Обновляем профиль с кнопкой техподдержки
bot.action('profile', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const balance = user.stars || 0;
  const friends = user.invited || 0;
  const rank = getUserMainTitle(user);
  const nextLevel = getNextLevelInfo(user);
  
  const profileText = `👑 **Профиль игрока MagnumTap** 👑

💫 **Статус:** VIP-участник  
💎 **Баланс:** ${balance} ⭐ звёзд  
👥 **Друзей приглашено:** ${friends}  
🏆 **Ранг:** ${rank} 🌟

✨ **Твои достижения:**  
1. 🌠 Первые шаги — зарегистрирован в MagnumTap  
2. 🎯 Путь к успеху — первые заработанные звёзды  
3. 🤝 Амбассадор — приглашай друзей и расти в рейтинге  

⚡ **Следующая цель:**  
— Заработать ещё ${nextLevel.starsNeeded} звёзд до уровня **${nextLevel.nextLevel}** 🏅  

💼 **Функции профиля:**  
- 📊 Статистика в реальном времени  
- 🎁 Ежедневные бонусы  
- 🔐 Поддержка 24/7`;

  ctx.editMessageText(profileText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🏆 Мои титулы', 'my_titles'), Markup.button.callback('🎫 Мои заявки', 'my_tickets')],
      [Markup.button.callback('🛠️ Тех поддержка', 'support_create'), Markup.button.callback('❓ FAQ', 'faq')],
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
        `🎫 **ID заявки:** \`${ticket.id}\`\n` +
        `📅 **Дата:** ${new Date().toLocaleString('ru-RU')}\n\n` +
        `💬 **Ваше сообщение:**\n${text}\n\n` +
        `⚡ Мы рассмотрим вашу заявку в течение 24 часов и уведомим о статусе.`,
        { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 Мои заявки', 'my_tickets')],
            [Markup.button.callback('🏠 Главное меню', 'main_menu')]
          ])
        }
      );
      return;
    }

    // Админские команды
    if (isAdmin(ctx.from.id)) {
      if (replyText.includes('Ответ пользователю по заявке')) {
        const ticketId = replyText.match(/#([A-Z0-9]+)/)[1];
        const ticket = await supportTickets.findOne({ id: ticketId });
        
        if (!ticket) {
          return ctx.reply('❌ Заявка не найдена!');
        }

        // Обновляем заявку с ответом админа
        await updateTicketStatus(ticketId, 'in_progress', text);

        // Отправляем ответ пользователю
        try {
          await bot.telegram.sendMessage(ticket.userId,
            `💼 **Ответ от техподдержки по заявке #${ticketId}:**\n\n${text}\n\n` +
            `🎫 Ваша заявка находится в работе. При необходимости мы свяжемся с вами дополнительно.`,
            { parse_mode: 'Markdown' }
          );
          ctx.reply(`✅ Ответ отправлен пользователю @${ticket.username}`);
        } catch (error) {
          ctx.reply('❌ Ошибка отправки ответа пользователю');
        }
        return;
      }

      if (replyText.includes('Поиск заявки')) {
        const searchQuery = text.trim();
        let ticket;

        // Поиск по ID заявки
        if (searchQuery.length <= 10) {
          ticket = await supportTickets.findOne({ id: searchQuery.toUpperCase() });
        } else {
          // Поиск по Telegram ID
          const tickets = await supportTickets.find({ userId: parseInt(searchQuery) }).sort({ created: -1 }).limit(1).toArray();
          ticket = tickets[0];
        }

        if (!ticket) {
          return ctx.reply('❌ Заявка не найдена!');
        }

        // Показываем найденную заявку
        ctx.action(`admin_ticket_view_${ticket.id}`)(ctx);
        return;
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

      // Проверяем новые титулы
      const newTitles = await checkAndAwardTitles(ctx.from.id);
      if (newTitles.length > 0) {
        ctx.reply(`🎉 Промокод активирован! Получено ${promo.stars} звёзд! 🏆 Новый титул получен!`);
      } else {
        ctx.reply(`🎉 Промокод активирован! Получено ${promo.stars} звёзд!`);
      }
    }

  } catch (error) {
    ctx.reply('❌ Произошла ошибка при обработке команды!');
  }
});

bot.action('admin_panel', async (ctx) => {
  const adminText = '⚙️ Админ-панель\n\nВыберите действие:';

  ctx.editMessageText(adminText, Markup.inlineKeyboard([
    [Markup.button.callback('📢 Рассылка', 'admin_broadcast')],
    [Markup.button.callback('🎫 Промокод', 'admin_addpromo')],
    [Markup.button.callback('📊 Статистика', 'admin_stats')],
    [Markup.button.callback('⭐ Звёзды', 'admin_stars')],
    [Markup.button.callback('👥 Рефералы', 'admin_refs')],
    [Markup.button.callback('🏆 Управление титулами', 'admin_titles')],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]));
});

bot.action('admin_cancel', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) {}
  ctx.answerCbQuery();
  ctx.reply(
    '⚙️ Админ-панель\n\nВыберите действие:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📢 Рассылка', 'admin_broadcast')],
      [Markup.button.callback('🎫 Промокод', 'admin_addpromo')],
      [Markup.button.callback('📊 Статистика', 'admin_stats')],
      [Markup.button.callback('⭐ Звёзды', 'admin_stars')],
      [Markup.button.callback('👥 Рефералы', 'admin_refs')],
      [Markup.button.callback('🏆 Управление титулами', 'admin_titles')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ])
  );
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
  const userTasks = await getUserTasks(ctx.from.id, false);
  let msg = '🎯 Задания от спонсора\n\n';
  
  const buttons = [];
  sponsorTasks.forEach(task => {
    const completed = userTasks.completed[task.id];
    const claimed = userTasks.claimed[task.id];
    const status = claimed ? '✅ Получено' : completed ? '🎁 Забрать' : '⏳ Выполнить';
    msg += `${status} ${task.name} (+${task.reward} звёзд)\n${task.description}\n\n`;
    
    if (!completed) {
      buttons.push([
        Markup.button.url('🔗 Перейти', task.url),
        Markup.button.callback('✅ Проверить', `check_sponsor_${task.id}`)
      ]);
    } else if (!claimed) {
      buttons.push([Markup.button.callback(`🎁 ${task.name}`, `claim_sponsor_${task.id}`)]);
    }
  });
  buttons.push([Markup.button.callback('🏠 Главное меню', 'main_menu')]);
  
  ctx.editMessageText(msg, Markup.inlineKeyboard(buttons));
});

bot.action('faq', async (ctx) => {
  const faqText = `❓ FAQ и помощь\n\n` +
    `🌟 Как зарабатывать звёзды?\n` +
    `⭐ Фармите каждую минуту\n` +
    `🎁 Получайте ежедневный бонус\n` +
    `📋 Выполняйте задания\n` +
    `👥 Приглашайте друзей\n\n` +
    `🎯 Как выполнять задания?\n` +
    `Нажимайте на задания и следуйте инструкциям\n\n` +
    `🎫 Где взять промокоды?\n` +
    `Следите за нашими анонсами и партнёрами`;

  ctx.editMessageText(faqText, Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
});

// Создание заявки в техподдержку
bot.action('support_create', async (ctx) => {
  const supportText = `
🛠️ **ТЕХНИЧЕСКАЯ ПОДДЕРЖКА** 🛠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💬 **Опишите вашу проблему или вопрос:**

Напишите одним сообщением:
• Что случилось?
• Когда это произошло?
• Какие действия вы выполняли?

⚡ Наша команда поддержки ответит в течение 24 часов!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  ctx.editMessageText(supportText, {
    parse_mode: 'Markdown',
    reply_markup: {
      force_reply: true,
      input_field_placeholder: 'Опишите вашу проблему...'
    }
  });
});

// Мои заявки в поддержку
bot.action('my_tickets', async (ctx) => {
  const userTickets = await supportTickets.find({ userId: ctx.from.id }).sort({ created: -1 }).limit(10).toArray();
  
  let ticketsText = `
🎫 **МОИ ЗАЯВКИ В ПОДДЕРЖКУ** 🎫
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

  if (userTickets.length === 0) {
    ticketsText += '📭 У вас пока нет заявок в техподдержку.';
  } else {
    userTickets.forEach(ticket => {
      const statusInfo = TICKET_STATUSES[ticket.status];
      const date = new Date(ticket.created * 1000).toLocaleDateString('ru-RU');
      ticketsText += `${statusInfo.color} **#${ticket.id}** — ${statusInfo.name}\n`;
      ticketsText += `📅 ${date} | ${ticket.message.substring(0, 50)}...\n\n`;
    });
  }

  ticketsText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  ctx.editMessageText(ticketsText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🛠️ Создать заявку', 'support_create')],
      [Markup.button.callback('👤 Назад к профилю', 'profile')]
    ])
  });
});

// Уведомления фарма и бонуса
bot.action('farm', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const canFarm = !user.lastFarm || (now() - user.lastFarm) >= 60;
  
  if (canFarm) {
    await users.updateOne({ id: ctx.from.id }, { 
      $inc: { stars: 1, farmCount: 1 }, 
      $set: { lastFarm: now() } 
    });
    
    // Проверяем новые титулы
    const newTitles = await checkAndAwardTitles(ctx.from.id);
    if (newTitles.length > 0) {
      ctx.answerCbQuery('🌟 +1 звезда! 🏆 Новый титул получен!');
    } else {
      ctx.answerCbQuery('🌟 +1 звезда!');
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
  
  if (canBonus) {
    // Проверяем серию ежедневных заходов
    const yesterday = today - 1;
    let dailyStreak = 1;
    if (user.lastBonus === yesterday) {
      dailyStreak = (user.dailyStreak || 0) + 1;
    }
    
    await users.updateOne({ id: ctx.from.id }, { 
      $inc: { stars: 10, bonusCount: 1 }, 
      $set: { lastBonus: today, dailyStreak: dailyStreak } 
    });
    
    // Проверяем новые титулы
    const newTitles = await checkAndAwardTitles(ctx.from.id);
    if (newTitles.length > 0) {
      ctx.answerCbQuery('🎁 +10 звёзд бонус! 🏆 Новый титул!');
    } else {
      ctx.answerCbQuery('🎁 +10 звёзд бонус!');
    }
  } else {
    const hoursLeft = 24 - Math.floor((Date.now() % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    ctx.answerCbQuery(`🕐 Следующий бонус через ${hoursLeft}ч`);
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
  await updateTicketStatus(ticketId, 'in_progress');
  await notifyUserStatusChange(ticketId, 'принята в работу ⚙️');
  
  ctx.answerCbQuery('✅ Заявка принята в работу');
  
  // Обновляем сообщение в канале
  const ticket = await supportTickets.findOne({ id: ticketId });
  if (ticket) {
    const statusInfo = TICKET_STATUSES[ticket.status];
    const newText = ctx.callbackQuery.message.text.replace(
      /🔵 \*\*Статус:\*\* 🆕 Новая/g,
      `${statusInfo.color} **Статус:** ${statusInfo.name}`
    );
    
    ctx.editMessageText(newText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Решена', callback_data: `ticket_resolve_${ticketId}` }],
          [{ text: '🔒 Закрыть', callback_data: `ticket_close_${ticketId}` }],
          [{ text: '📝 Ответить', callback_data: `ticket_reply_${ticketId}` }]
        ]
      }
    });
  }
});

bot.action(/^ticket_reject_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  await updateTicketStatus(ticketId, 'rejected');
  await notifyUserStatusChange(ticketId, 'отклонена ❌');
  
  ctx.answerCbQuery('❌ Заявка отклонена');
  
  // Удаляем кнопки из сообщения в канале
  const newText = ctx.callbackQuery.message.text.replace(
    /🔵 \*\*Статус:\*\* 🆕 Новая/g,
    '🔴 **Статус:** ❌ Отклонена'
  );
  
  ctx.editMessageText(newText, { parse_mode: 'Markdown' });
});

bot.action(/^ticket_resolve_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  await updateTicketStatus(ticketId, 'resolved');
  await notifyUserStatusChange(ticketId, 'решена ✅');
  
  ctx.answerCbQuery('✅ Заявка решена');
  
  const newText = ctx.callbackQuery.message.text.replace(
    /🟡 \*\*Статус:\*\* ⚙️ В работе/g,
    '🟢 **Статус:** ✅ Решена'
  );
  
  ctx.editMessageText(newText, { parse_mode: 'Markdown' });
});

bot.action(/^ticket_close_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  await updateTicketStatus(ticketId, 'closed');
  await notifyUserStatusChange(ticketId, 'закрыта 🔒');
  
  ctx.answerCbQuery('🔒 Заявка закрыта');
  
  const newText = ctx.callbackQuery.message.text.replace(
    /(🟡|🟢) \*\*Статус:\*\* (⚙️ В работе|✅ Решена)/g,
    '⚫ **Статус:** 🔒 Закрыта'
  );
  
  ctx.editMessageText(newText, { parse_mode: 'Markdown' });
});

bot.action(/^ticket_reply_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');
  
  const ticketId = ctx.match[1];
  ctx.reply(
    `💬 **Ответ пользователю по заявке #${ticketId}**\n\nВведите ваш ответ:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true
      }
    }
  );
});