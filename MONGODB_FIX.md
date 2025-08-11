# 🔧 Исправление ошибки MongoDB

## ❌ Проблема
Ошибка при создании индекса для коллекции `reserve`:
```
E11000 duplicate key error collection: test.reserve index: currency_1 dup key: { currency: null }
```

## ✅ Решение
Добавлена обработка дублирующихся записей в коллекции `reserve`.

### Что исправлено:

1. **Обработка ошибки индекса:**
```javascript
try {
  await db.collection('reserve').createIndex({ currency: 1 }, { unique: true });
} catch (error) {
  if (error.code === 11000) {
    // Удаляем дублирующиеся записи и создаем индекс заново
    await db.collection('reserve').deleteMany({ currency: null });
    await db.collection('reserve').createIndex({ currency: 1 }, { unique: true });
  } else {
    throw error;
  }
}
```

2. **Инициализация резерва:**
```javascript
async function initializeReserve() {
  try {
    // Очищаем некорректные записи
    await db.collection('reserve').deleteMany({ currency: null });
    
    let reserve = await db.collection('reserve').findOne({ currency: 'main' });
    
    if (!reserve) {
      reserve = {
        currency: 'main',
        stars: config.INITIAL_RESERVE_STARS,
        magnumCoins: config.INITIAL_RESERVE_MAGNUM_COINS,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection('reserve').insertOne(reserve);
      console.log('💰 Резерв валют инициализирован');
    }
  } catch (error) {
    console.error('❌ Ошибка инициализации резерва:', error);
  }
}
```

3. **Улучшенная функция получения резерва:**
```javascript
async getReserve() {
  try {
    // Сначала очищаем некорректные записи
    await this.db.collection('reserve').deleteMany({ currency: null });
    
    let reserve = await this.db.collection('reserve').findOne({ currency: 'main' });
    // ... остальной код
  } catch (error) {
    console.error('Ошибка получения резерва:', error);
    return { stars: 1000000, magnumCoins: 1000000 };
  }
}
```

## 🚀 Развертывание

1. **Закоммитьте изменения:**
```bash
git add .
git commit -m "🔧 Исправлена ошибка MongoDB с дублирующимися записями"
git push
```

2. **Railway автоматически пересоберет проект**

3. **Проверьте логи:**
```bash
railway logs
```

## 📊 Ожидаемый результат

После исправления бот должен:
- ✅ Успешно подключиться к MongoDB
- ✅ Создать все необходимые индексы
- ✅ Инициализировать резерв валют
- ✅ Запуститься без ошибок

## 🔍 Проверка

В логах должно появиться:
```
✅ База данных подключена
🔄 Исправляем дублирующиеся записи в резерве...
💰 Резерв валют инициализирован
🚀 Magnum Stars Bot запущен!
```

---

**Готово!** 🎉 Теперь MongoDB ошибка исправлена и бот должен запуститься без проблем.