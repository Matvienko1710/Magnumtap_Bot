# 🚀 Быстрая настройка UptimeRobot

## ⚡ 5 минут до активного бота

### 1. Зарегистрируйтесь на UptimeRobot
- Перейдите на [uptimerobot.com](https://uptimerobot.com)
- Создайте бесплатный аккаунт

### 2. Создайте монитор
1. Нажмите **"Add New Monitor"**
2. Выберите тип: **HTTP(s)**
3. Заполните поля:
   - **Friendly Name**: `Magnum Bot Health`
   - **URL**: `https://YOUR-APP-NAME.onrender.com/health`
   - **Monitoring Interval**: `5 minutes`
   - **Timeout**: `30 seconds`

### 3. Замените YOUR-APP-NAME
Замените `YOUR-APP-NAME` на реальное имя вашего приложения на Render.com

### 4. Сохраните и готово!
Монитор будет проверять ваш бот каждые 5 минут и держать его активным.

## 🔍 Проверка работы

После настройки проверьте, что эндпоинты работают:

```bash
curl https://YOUR-APP-NAME.onrender.com/health
```

Должен вернуть JSON с информацией о состоянии бота.

## 📞 Поддержка

Если что-то не работает:
1. Проверьте URL в мониторе
2. Убедитесь, что бот развернут на Render.com
3. Проверьте логи в Render.com Dashboard

---

**✅ Готово! Ваш бот теперь будет активен 24/7**
