# 🚀 Деплой Magnum Stars Bot на Render.com

## 📋 Подготовка к деплою

### 1. Переменные окружения
Убедитесь, что у вас настроены все необходимые переменные окружения в Render.com:

- `BOT_TOKEN` - токен вашего Telegram бота
- `MONGODB_URI` - строка подключения к MongoDB
- `ADMIN_IDS` - ID администраторов (через запятую)
- `SUPPORT_CHANNEL` - канал поддержки
- `WITHDRAWAL_CHANNEL` - канал для заявок на вывод
- `REQUIRED_CHANNEL` - обязательный канал для подписки
- `REQUIRED_BOT_LINK` - ссылка на обязательного бота
- `FIRESTARS_BOT_LINK` - ссылка на FireStars бота
- `FARMIK_BOT_LINK` - ссылка на Farmik бота
- `BASKET_BOT_LINK` - ссылка на Basket бота
- `PRIVATE_CHANNEL_LINK` - ссылка на приватный канал
- `PROMO_NOTIFICATIONS_CHAT` - чат для уведомлений о промокодах
- `BOT_PHOTO_URL` - URL фото бота

### 2. Настройка Render.com

1. Зайдите на [render.com](https://render.com)
2. Создайте новый Web Service
3. Подключите ваш GitHub репозиторий
4. Настройте переменные окружения
5. Установите:
   - **Build Command:** `npm install`
   - **Start Command:** `node magnum-bot-final.js`

### 3. Автоматический деплой

После настройки Render будет автоматически деплоить бота при каждом push в main ветку.

## 🔧 Проверка деплоя

1. Проверьте логи в Render Dashboard
2. Убедитесь, что бот запустился без ошибок
3. Протестируйте команду `/start` в Telegram

## 📊 Мониторинг

- Логи доступны в Render Dashboard
- Статус сервиса отображается в реальном времени
- Автоматические перезапуски при сбоях

## 🎯 Результат

После успешного деплоя ваш бот будет доступен 24/7 на Render.com!

---
*Инструкция создана: 26.08.2025*
