# 🚀 Инструкция по подключению WebApp к существующему боту

## 📋 Обзор

Этот WebApp кликер интегрируется с вашим существующим ботом на Railway. WebApp доступен только админам для тестирования.

## 🛠️ Шаг 1: Настройка Railway

### 1.1 Обновите переменные окружения в Railway Dashboard

Добавьте новые переменные:

```env
# WebApp настройки
WEBAPP_URL=https://your-railway-app.railway.app/webapp
WEBAPP_ENABLED=true
WEBAPP_ADMIN_ONLY=true
```

### 1.2 Обновите package.json

Добавьте новые зависимости:

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "serve-static": "^1.15.0"
  }
}
```

## 🛠️ Шаг 2: Обновите основной файл бота

### 2.1 Добавьте Express сервер в magnum-bot-final.js

В начало файла добавьте:

```javascript
const express = require('express');
const path = require('path');

// Создаем Express приложение
const app = express();
const PORT = process.env.PORT || 8080;

// Настройка статических файлов для WebApp
app.use('/webapp', express.static(path.join(__dirname, 'webapp')));

// Маршрут для WebApp
app.get('/webapp', (req, res) => {
    res.sendFile(path.join(__dirname, 'webapp', 'index.html'));
});

// API маршрут для проверки доступа
app.get('/api/webapp/check-access', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) {
            return res.json({ access: false, reason: 'No user ID provided' });
        }

        // Проверяем, является ли пользователь админом
        const isAdmin = config.ADMIN_IDS.includes(parseInt(userId));
        const webappEnabled = process.env.WEBAPP_ENABLED === 'true';
        const adminOnly = process.env.WEBAPP_ADMIN_ONLY === 'true';

        if (!webappEnabled) {
            return res.json({ access: false, reason: 'WebApp disabled' });
        }

        if (adminOnly && !isAdmin) {
            return res.json({ access: false, reason: 'Admin only' });
        }

        res.json({ access: true, isAdmin });
    } catch (error) {
        console.error('WebApp access check error:', error);
        res.status(500).json({ access: false, reason: 'Server error' });
    }
});

// Запускаем сервер
app.listen(PORT, () => {
    console.log(`🌐 WebApp сервер запущен на порту ${PORT}`);
});
```

### 2.2 Добавьте команду для WebApp

Добавьте в секцию команд:

```javascript
bot.command('webapp', async (ctx) => {
    try {
        const user = await getUser(ctx.from.id);
        if (!user) {
            await ctx.reply('❌ Пользователь не найден');
            return;
        }

        // Проверяем доступ к WebApp
        const webappEnabled = process.env.WEBAPP_ENABLED === 'true';
        const adminOnly = process.env.WEBAPP_ADMIN_ONLY === 'true';
        const isAdmin = config.ADMIN_IDS.includes(user.id);

        if (!webappEnabled) {
            await ctx.reply('🚧 WebApp временно недоступен');
            return;
        }

        if (adminOnly && !isAdmin) {
            await ctx.reply('🔒 WebApp доступен только администраторам');
            return;
        }

        // Создаем WebApp кнопку
        const webappUrl = process.env.WEBAPP_URL || `https://${process.env.RAILWAY_STATIC_URL}/webapp`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.webApp('🎮 Открыть WebApp', webappUrl)]
        ]);

        await ctx.reply(
            '🎮 *Magnum Stars WebApp*\n\n' +
            '✨ Современный интерфейс\n' +
            '⚡ Быстрая работа\n' +
            '🎯 Улучшенный UX\n\n' +
            'Нажмите кнопку ниже, чтобы открыть WebApp:',
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            }
        );

    } catch (error) {
        logError(error, 'WebApp команда');
        await ctx.reply('❌ Ошибка открытия WebApp');
    }
});
```

## 🛠️ Шаг 3: Настройка BotFather

### 3.1 Создайте WebApp в BotFather

1. Откройте @BotFather в Telegram
2. Отправьте `/mybots`
3. Выберите вашего бота
4. Нажмите "Bot Settings" → "Menu Button"
5. Установите URL: `https://your-railway-app.railway.app/webapp`

### 3.2 Альтернативный способ через команду

Отправьте BotFather:

```
/setmenubutton
@your_bot_username
Magnum Stars WebApp
https://your-railway-app.railway.app/webapp
```

## 🛠️ Шаг 4: Развертывание

### 4.1 Закоммитьте изменения

```bash
git add .
git commit -m "Add WebApp support"
git push
```

### 4.2 Проверьте Railway

1. Откройте Railway Dashboard
2. Убедитесь, что деплой прошел успешно
3. Проверьте логи на наличие ошибок

## 🧪 Шаг 5: Тестирование

### 5.1 Тест для админов

1. Отправьте боту команду `/webapp`
2. Нажмите кнопку "🎮 Открыть WebApp"
3. Проверьте работу кликера
4. Убедитесь, что данные сохраняются

### 5.2 Тест для обычных пользователей

1. Войдите как обычный пользователь
2. Отправьте `/webapp`
3. Убедитесь, что доступ ограничен (если `WEBAPP_ADMIN_ONLY=true`)

## 🔧 Настройка переменных окружения

### Обязательные переменные:

```env
# WebApp
WEBAPP_URL=https://your-railway-app.railway.app/webapp
WEBAPP_ENABLED=true
WEBAPP_ADMIN_ONLY=true

# Существующие переменные
BOT_TOKEN=your_bot_token
MONGODB_URI=your_mongodb_uri
ADMIN_IDS=123456789,987654321
```

### Опциональные переменные:

```env
# Настройки WebApp
WEBAPP_TITLE=Magnum Stars
WEBAPP_DESCRIPTION=Современный кликер
WEBAPP_SHORT_NAME=MagnumClicker
```

## 🚨 Устранение неполадок

### Проблема: WebApp не открывается

**Решение:**
1. Проверьте URL в BotFather
2. Убедитесь, что Railway деплой прошел успешно
3. Проверьте переменную `WEBAPP_URL`

### Проблема: Доступ запрещен

**Решение:**
1. Проверьте переменную `WEBAPP_ADMIN_ONLY`
2. Убедитесь, что ваш ID в `ADMIN_IDS`
3. Проверьте логи на наличие ошибок

### Проблема: Статические файлы не загружаются

**Решение:**
1. Убедитесь, что папка `webapp` существует
2. Проверьте права доступа к файлам
3. Перезапустите приложение

## 📱 Использование WebApp

### Для админов:

1. **Открытие:** `/webapp` или кнопка меню
2. **Тестирование:** Кликер, улучшения, авто-кликер
3. **Отладка:** Откройте DevTools для просмотра логов

### Для пользователей:

1. **Доступ:** Только если `WEBAPP_ADMIN_ONLY=false`
2. **Функции:** Ограниченный доступ к функциям
3. **Данные:** Синхронизация с основным ботом

## 🔄 Следующие шаги

1. **Интеграция с ботом:** Синхронизация данных между WebApp и ботом
2. **Расширенные функции:** Майнер, ферма, биржа
3. **Анимации:** Улучшенные визуальные эффекты
4. **Мультиплеер:** Соревнования между игроками

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи Railway
2. Убедитесь в корректности переменных окружения
3. Проверьте настройки BotFather
4. Обратитесь к документации Telegram WebApp API

---

**🎯 WebApp готов к использованию!** Теперь у вас есть современный интерфейс для вашего бота, доступный админам для тестирования.