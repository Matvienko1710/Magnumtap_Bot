# 📝 Система логирования Magnum Stars Bot

## 🚀 Запуск бота с полным логированием

### Способ 1: Через npm script
```bash
npm run logging
```

### Способ 2: Прямой запуск
```bash
node start-with-logging.js
```

## 📋 Файлы логов

После запуска бота с логированием в папке `./logs/` будут созданы следующие файлы:

### 🔍 `user_actions.log`
Детальные действия пользователей в формате JSON:
```json
{
  "timestamp": "2025-01-27T18:30:00.000Z",
  "userId": 123456789,
  "action": "button_tasks_sponsor",
  "details": "Нажата кнопка RichAds офферы",
  "memory": { "rss": 71303168, "heapTotal": 39034880 },
  "uptime": 120.5
}
```

### ❌ `error_log.log`
Ошибки с полным контекстом:
```json
{
  "timestamp": "2025-01-27T18:30:00.000Z",
  "userId": 123456789,
  "context": "showSponsorTasks",
  "error": {
    "message": "Cannot read property 'length' of undefined",
    "stack": "TypeError: Cannot read property...",
    "name": "TypeError"
  },
  "memory": { "rss": 71303168 },
  "uptime": 120.5
}
```

### 🤖 `bot.log`
Общие логи бота с временными метками:
```
[2025-01-27T18:30:00.000Z] 🚀 Запуск Magnum Stars Bot...
[2025-01-27T18:30:01.000Z] ✅ Бот успешно запущен
[2025-01-27T18:30:05.000Z] 🔍 [USER_ACTION] User 123456789 | Action: button_tasks_sponsor
```

## 🎯 Отслеживаемые действия

### RichAds офферы:
- `button_tasks_sponsor` - Нажатие кнопки RichAds офферы
- `showSponsorTasks` - Показ списка офферов
- `getRichAdsTasks` - Получение офферов
- `showSponsorTaskDetails` - Показ деталей оффера
- `findTaskInDetails` - Поиск оффера в деталях
- `verifySponsorTask` - Верификация оффера
- `claimSponsorTask` - Получение награды

### Общие действия:
- `userFound` - Пользователь найден
- `userNotFound` - Пользователь не найден
- `showSponsorTasksComplete` - Офферы показаны успешно

## 🔧 Как протестировать

1. **Запустите бота с логированием:**
   ```bash
   npm run logging
   ```

2. **Откройте бота в Telegram**

3. **Выполните следующие действия:**
   - Перейдите в раздел "Задания"
   - Нажмите "RichAds офферы"
   - Попробуйте открыть детали оффера
   - Попробуйте выполнить оффер

4. **Остановите бота** (Ctrl+C)

5. **Проверьте файлы логов** в папке `./logs/`

## 📊 Анализ логов

### Поиск ошибок:
```bash
grep "ERROR" logs/error_log.log
```

### Поиск действий пользователя:
```bash
grep "123456789" logs/user_actions.log
```

### Поиск конкретного действия:
```bash
grep "button_tasks_sponsor" logs/user_actions.log
```

## 🐛 Отладка проблем

### Если RichAds офферы не загружаются:
1. Проверьте `user_actions.log` на наличие `getRichAdsTasks`
2. Проверьте `error_log.log` на ошибки
3. Убедитесь, что демо-офферы возвращаются

### Если кнопки не работают:
1. Проверьте `user_actions.log` на наличие `button_tasks_sponsor`
2. Проверьте `error_log.log` на ошибки обработчиков

### Если офферы не отображаются:
1. Проверьте `showSponsorTasks` в `user_actions.log`
2. Проверьте `findTaskInDetails` на наличие офферов

## 📤 Отправка логов для анализа

После тестирования отправьте следующие файлы:
- `logs/user_actions.log`
- `logs/error_log.log`
- `logs/bot.log`

Или создайте архив:
```bash
zip -r logs.zip logs/
```

## 🔄 Очистка логов

Для очистки старых логов:
```bash
rm -rf logs/
```

Или удалите отдельные файлы:
```bash
rm logs/user_actions.log
rm logs/error_log.log
rm logs/bot.log
```

## ⚙️ Настройка логирования

### Изменение уровня детализации:
В файле `magnum-bot-final.js` можно настроить функции логирования:

```javascript
// Добавить больше деталей
logAction(userId, 'action', { 
  param1: value1, 
  param2: value2,
  timestamp: new Date().toISOString()
});
```

### Отключение логирования:
Закомментируйте вызовы `logAction` и `logErrorWithContext` в коде.

---

**📝 Теперь запустите бота с логированием и протестируйте RichAds офферы!**
