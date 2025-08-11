# 🌟 Magnum Stars Bot

Полнофункциональный Telegram бот для заработка с системой фарма, майнинга, обмена валют и вывода средств.

## 🚀 Возможности

### 💰 Основные функции
- **🌾 Фарм** - получайте звезды каждые 10 секунд
- **🎁 Ежедневный бонус** - получайте бонусы каждый день с увеличением награды за серию
- **⛏️ Майнер** - пассивный доход каждые 30 минут
- **💱 Обмен валют** - конвертация между звездами и Magnum Coins
- **💳 Вывод средств** - вывод Magnum Coins на различные кошельки
- **🎫 Промокоды** - активация промокодов для получения бонусов

### 🏆 Система достижений
- **Достижения** - выполнение различных задач для получения наград
- **Ранги** - система рангов на основе количества звезд
- **Титулы** - специальные титулы с бонусами
- **Ежедневные задания** - задания, обновляющиеся каждый день
- **Спонсорские задания** - разовые задания с наградами

### 👥 Социальные функции
- **Реферальная система** - приглашайте друзей и получайте бонусы
- **Лидерборды** - соревнование между пользователями
- **Статистика** - подробная статистика по всем действиям

### 🔧 Административные функции
- **Админ панель** - управление ботом для администраторов
- **Рассылка** - отправка сообщений всем пользователям
- **Управление пользователями** - блокировка, разблокировка, добавление средств
- **Управление промокодами** - создание и деактивация промокодов
- **Обработка выводов** - одобрение/отклонение заявок на вывод
- **Система поддержки** - тикеты пользователей

## 📋 Требования

- Node.js 16.0.0 или выше
- MongoDB 4.4 или выше
- Telegram Bot Token

## 🛠️ Установка

1. **Клонируйте репозиторий:**
```bash
git clone https://github.com/magnum-stars/bot.git
cd bot
```

2. **Установите зависимости:**
```bash
npm install
```

3. **Создайте файл .env:**
```env
# Основные настройки
BOT_TOKEN=your_telegram_bot_token
MONGODB_URI=mongodb://localhost:27017/magnum_stars

# Администраторы (через запятую)
ADMIN_IDS=123456789,987654321

# Каналы и ссылки
SUPPORT_CHANNEL=@your_support_channel
WITHDRAWAL_CHANNEL=@your_withdrawal_channel
REQUIRED_CHANNEL=@your_required_channel
REQUIRED_BOT_LINK=https://t.me/your_bot?start=123456789
FIRESTARS_BOT_LINK=https://t.me/firestars_bot?start=123456789
FARMIK_BOT_LINK=https://t.me/farmik_bot?start=123456789
BASKET_BOT_LINK=https://t.me/basket_bot?start=123456789
PRIVATE_CHANNEL_LINK=https://t.me/+your_private_channel
PROMO_NOTIFICATIONS_CHAT=@your_promo_channel
BOT_PHOTO_URL=https://example.com/bot_photo.jpg
```

4. **Запустите бота:**
```bash
npm start
```

## 🏗️ Архитектура

Бот построен на модульной архитектуре с разделением ответственности:

### 📁 Структура файлов
```
├── bot.js                 # Основной файл бота
├── userModule.js          # Модуль пользователей
├── minerModule.js         # Модуль майнера
├── exchangeModule.js      # Модуль обмена валют
├── withdrawalModule.js    # Модуль выводов
├── adminModule.js         # Модуль админ-панели
├── tasksModule.js         # Модуль заданий и достижений
├── supportModule.js       # Модуль поддержки
├── interfaceModule.js     # Модуль интерфейса
├── package.json           # Зависимости
├── .env                   # Конфигурация
└── README.md             # Документация
```

### 🔧 Основные классы

#### Database
Управляет подключением к MongoDB и созданием индексов для оптимизации.

#### Cache
Реализует кеширование пользователей и статистики для улучшения производительности.

#### Utils
Содержит вспомогательные функции для форматирования, валидации и расчетов.

## 💾 База данных

### 📊 Коллекции MongoDB

- **users** - пользователи бота
- **promocodes** - промокоды
- **withdrawalRequests** - заявки на вывод
- **supportTickets** - тикеты поддержки
- **taskChecks** - проверки заданий
- **reserve** - резерв биржи
- **transactions** - транзакции
- **achievements** - достижения
- **titles** - титулы
- **ranks** - ранги
- **dailyTasks** - ежедневные задания
- **sponsorTasks** - спонсорские задания
- **minerRewards** - награды майнера
- **exchangeHistory** - история обменов
- **userStats** - статистика пользователей
- **botStats** - статистика бота
- **adminLogs** - логи администраторов
- **errorLogs** - логи ошибок
- **notifications** - уведомления

## 🎮 Игровая механика

### 🌾 Фарм
- **Кулдаун:** 10 секунд
- **Базовая награда:** 0.01 звезды
- **Бонусы:** от достижений, титулов и серии бонусов

### 🎁 Ежедневный бонус
- **Базовая награда:** 3 звезды
- **Бонус за серию:** +2 звезды за каждые 7 дней
- **Кулдаун:** 24 часа

### ⛏️ Майнер
- **Базовая награда:** 0.1 звезды в час
- **Улучшения:** +10% эффективности за уровень
- **Автоматическая работа:** каждые 30 минут

### 💱 Обмен валют
- **Комиссия:** 2.5%
- **Минимальная сумма:** 1 единица
- **Динамический курс:** на основе резерва биржи

### 💳 Вывод средств
- **Минимальная сумма:** 100 Magnum Coins
- **Максимальная сумма:** 10,000 Magnum Coins
- **Поддерживаемые методы:** USDT (TRC20), Bitcoin, Ethereum

## 🔧 Конфигурация

### ⚙️ Основные настройки

```javascript
const config = {
  // Игровые настройки
  INITIAL_STARS: 100,
  INITIAL_MAGNUM_COINS: 0,
  FARM_COOLDOWN: 10,
  FARM_BASE_REWARD: 0.01,
  DAILY_BONUS_BASE: 3,
  REFERRAL_BONUS: 50,
  MINER_REWARD_PER_HOUR: 0.1,
  EXCHANGE_COMMISSION: 2.5,
  MIN_WITHDRAWAL: 100,
  MAX_WITHDRAWAL: 10000,
  
  // Кеширование
  USER_CACHE_TTL: 30000,
  STATS_CACHE_TTL: 120000,
  
  // Rate limiting
  RATE_LIMIT_WINDOW: 60000,
  RATE_LIMIT_MAX_REQUESTS: 30,
  
  // Майнер
  MINER_PROCESS_INTERVAL: 30 * 60 * 1000,
  
  // Резерв биржи
  INITIAL_RESERVE_MAGNUM_COINS: 1000000,
  INITIAL_RESERVE_STARS: 1000000
};
```

## 🚀 Развертывание

### 📦 Docker (рекомендуется)

1. **Создайте Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

2. **Создайте docker-compose.yml:**
```yaml
version: '3.8'

services:
  bot:
    build: .
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    depends_on:
      - mongodb
    restart: unless-stopped

  mongodb:
    image: mongo:6.0
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    volumes:
      - mongodb_data:/data/db
    ports:
      - "27017:27017"

volumes:
  mongodb_data:
```

3. **Запустите:**
```bash
docker-compose up -d
```

### ☁️ Облачное развертывание

#### Heroku
```bash
heroku create your-bot-name
heroku config:set BOT_TOKEN=your_token
heroku config:set MONGODB_URI=your_mongodb_uri
git push heroku main
```

#### Railway
```bash
railway login
railway init
railway up
```

## 🔒 Безопасность

### 🛡️ Меры безопасности
- Rate limiting для предотвращения спама
- Валидация всех входных данных
- Логирование всех действий администраторов
- Проверка подписки на обязательные каналы
- Валидация кошельков для выводов

### 🔐 Переменные окружения
Все чувствительные данные хранятся в переменных окружения:
- Токены ботов
- Строки подключения к БД
- ID администраторов
- Ссылки на каналы

## 📊 Мониторинг

### 📈 Метрики
- Количество пользователей
- Активность майнеров
- Объем обменов
- Статистика выводов
- Производительность бота

### 📝 Логирование
- Логи ошибок
- Логи действий администраторов
- Логи транзакций
- Логи производительности

## 🤝 Вклад в проект

1. Форкните репозиторий
2. Создайте ветку для новой функции
3. Внесите изменения
4. Создайте Pull Request

## 📄 Лицензия

MIT License - см. файл [LICENSE](LICENSE) для подробностей.

## 🆘 Поддержка

- **Telegram:** @magnum_support
- **Email:** support@magnumstars.com
- **Документация:** [docs.magnumstars.com](https://docs.magnumstars.com)

## 🙏 Благодарности

Спасибо всем участникам проекта за вклад в развитие бота!

---

**Magnum Stars Bot** - создан для заработка и развлечения! 🌟