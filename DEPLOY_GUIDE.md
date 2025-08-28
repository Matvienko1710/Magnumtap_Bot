# 🚀 РУКОВОДСТВО ПО ДЕПЛОЮ

## 📋 Настройка Render.com

### Build Command:
```bash
npm install
```

### Start Command:
```bash
npm start
```

### Environment Variables:
```env
BOT_TOKEN=your_bot_token
MONGODB_URI=your_mongodb_uri
RICHADS_API_KEY=6d0734893c941affcca49d54e05193da
RICHADS_PUBLISHER_ID=982065
RICHADS_SITE_ID=demo
ADMIN_IDS=your_admin_id
WEBAPP_ENABLED=true
WEBAPP_URL=https://your-app-name.onrender.com
WEBAPP_ADMIN_ONLY=false
LOG_LEVEL=info
PORT=3000
```

## 🔧 Автоматический деплой

### Windows:
```bash
deploy.bat
```

### Linux/Mac:
```bash
git add .
git commit -m "🚀 Update"
git push origin main
```

## 📊 Health Checks

После деплоя проверьте:
- `/health` - основная проверка
- `/ping` - простая проверка
- `/metrics` - метрики системы

## 🎯 Готово!

Бот автоматически деплоится на Render.com при пуше в GitHub.

