# 🚀 Развертывание Magnum Stars Bot на Railway

## 📋 Предварительные требования

1. **Аккаунт Railway** - зарегистрируйтесь на [railway.app](https://railway.app)
2. **GitHub репозиторий** - загрузите код в GitHub
3. **Telegram Bot Token** - получите у @BotFather
4. **MongoDB** - база данных (можно использовать Railway MongoDB или внешнюю)

## 🛠️ Пошаговое развертывание

### Шаг 1: Подготовка репозитория

1. **Клонируйте репозиторий:**
```bash
git clone https://github.com/your-username/magnum-stars-bot.git
cd magnum-stars-bot
```

2. **Убедитесь, что все файлы на месте:**
```bash
ls -la
# Должны быть: bot.js, package.json, package-lock.json, Dockerfile, .env.example
```

3. **Создайте .env файл:**
```bash
cp .env.example .env
# Отредактируйте .env с вашими настройками
```

### Шаг 2: Настройка Railway

1. **Войдите в Railway:**
```bash
npm install -g @railway/cli
railway login
```

2. **Инициализируйте проект:**
```bash
railway init
```

3. **Создайте новый проект в Railway Dashboard:**
   - Перейдите на [railway.app](https://railway.app)
   - Нажмите "New Project"
   - Выберите "Deploy from GitHub repo"
   - Выберите ваш репозиторий

### Шаг 3: Настройка переменных окружения

В Railway Dashboard перейдите в раздел "Variables" и добавьте:

```env
# Основные настройки
BOT_TOKEN=your_telegram_bot_token_here
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/magnum_stars

# Администраторы (ID через запятую)
ADMIN_IDS=123456789,987654321

# Каналы и ссылки
SUPPORT_CHANNEL=@your_support_channel
WITHDRAWAL_CHANNEL=@your_withdrawal_channel
REQUIRED_CHANNEL=@your_required_channel

# Ссылки на ботов и каналы
REQUIRED_BOT_LINK=https://t.me/your_bot?start=123456789
FIRESTARS_BOT_LINK=https://t.me/firestars_bot?start=123456789
FARMIK_BOT_LINK=https://t.me/farmik_bot?start=123456789
BASKET_BOT_LINK=https://t.me/basket_bot?start=123456789
PRIVATE_CHANNEL_LINK=https://t.me/+your_private_channel
PROMO_NOTIFICATIONS_CHAT=@your_promo_channel

# Медиа
BOT_PHOTO_URL=https://example.com/bot_photo.jpg

# Дополнительные настройки
NODE_ENV=production
PORT=3000
```

### Шаг 4: Настройка базы данных

#### Вариант 1: Railway MongoDB (рекомендуется)

1. В Railway Dashboard нажмите "New Service"
2. Выберите "Database" → "MongoDB"
3. Скопируйте строку подключения
4. Добавьте в переменные окружения как `MONGODB_URI`

#### Вариант 2: Внешняя MongoDB

1. Используйте MongoDB Atlas или другой провайдер
2. Добавьте строку подключения в переменные окружения

### Шаг 5: Развертывание

1. **Загрузите код в GitHub:**
```bash
git add .
git commit -m "Initial deployment"
git push origin main
```

2. **Railway автоматически развернет проект**

3. **Проверьте логи:**
```bash
railway logs
```

### Шаг 6: Настройка домена

1. В Railway Dashboard перейдите в "Settings"
2. В разделе "Domains" нажмите "Generate Domain"
3. Скопируйте полученный URL

## 🔧 Устранение проблем

### Проблема с npm ci

Если возникает ошибка с `npm ci`, используйте альтернативный Dockerfile:

1. Переименуйте `Dockerfile.simple` в `Dockerfile`
2. Или добавьте в Railway переменную окружения:
```env
RAILWAY_DOCKERFILE_PATH=Dockerfile.simple
```

### Проблемы с зависимостями

1. **Проверьте package.json:**
```json
{
  "dependencies": {
    "telegraf": "^4.15.6",
    "mongodb": "^6.3.0",
    "dotenv": "^16.3.1"
  }
}
```

2. **Удалите devDependencies из продакшена:**
```bash
npm prune --production
```

### Проблемы с подключением к БД

1. **Проверьте строку подключения:**
```bash
railway variables
```

2. **Проверьте логи:**
```bash
railway logs
```

3. **Убедитесь, что IP адрес Railway разрешен в MongoDB**

## 📊 Мониторинг

### Просмотр логов
```bash
# Все логи
railway logs

# Логи в реальном времени
railway logs --follow

# Логи конкретного сервиса
railway logs --service bot
```

### Статистика
```bash
# Информация о проекте
railway status

# Использование ресурсов
railway usage
```

### Перезапуск
```bash
# Перезапуск сервиса
railway service restart

# Перезапуск всего проекта
railway project restart
```

## 🔄 Обновления

### Автоматические обновления
Railway автоматически развертывает изменения при push в GitHub.

### Ручные обновления
```bash
# Принудительное развертывание
railway up

# Развертывание с пересборкой
railway up --build
```

## 💰 Стоимость

Railway предлагает:
- **Бесплатный план:** $5 кредитов в месяц
- **Платные планы:** от $20/месяц

Для бота с умеренной нагрузкой достаточно бесплатного плана.

## 🔒 Безопасность

### Переменные окружения
- Все чувствительные данные хранятся в Railway Variables
- Не добавляйте .env файл в репозиторий
- Используйте разные переменные для разных окружений

### Доступ к проекту
- Ограничьте доступ к проекту только необходимыми людьми
- Используйте двухфакторную аутентификацию
- Регулярно обновляйте токены

## 📞 Поддержка

При возникновении проблем:

1. **Проверьте логи:** `railway logs`
2. **Проверьте переменные:** `railway variables`
3. **Документация Railway:** [docs.railway.app](https://docs.railway.app)
4. **GitHub Issues:** создайте issue в репозитории

## 🎯 Готово!

После выполнения всех шагов ваш бот будет доступен по адресу:
```
https://your-project-name.railway.app
```

Бот автоматически запустится и будет готов к работе! 🚀

---

**Удачного развертывания!** 🎉