# 🚀 Руководство по развертыванию Magnum Stars Bot

## 📋 Предварительные требования

### Системные требования
- **ОС:** Linux (Ubuntu 20.04+), macOS, Windows 10+
- **RAM:** Минимум 2GB, рекомендуется 4GB+
- **CPU:** 2 ядра, рекомендуется 4 ядра
- **Диск:** 10GB свободного места
- **Сеть:** Стабильное интернет-соединение

### Программное обеспечение
- **Node.js:** 16.0.0 или выше
- **MongoDB:** 4.4 или выше
- **Git:** для клонирования репозитория
- **Docker:** (опционально, для контейнеризации)

## 🛠️ Способы развертывания

### 1. Локальное развертывание

#### Шаг 1: Подготовка системы
```bash
# Обновление системы (Ubuntu/Debian)
sudo apt update && sudo apt upgrade -y

# Установка Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установка MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Установка Git
sudo apt install git -y
```

#### Шаг 2: Клонирование и настройка
```bash
# Клонирование репозитория
git clone https://github.com/magnum-stars/bot.git
cd bot

# Установка зависимостей
npm install

# Создание конфигурационного файла
cp .env.example .env
nano .env
```

#### Шаг 3: Настройка переменных окружения
```env
# Основные настройки
BOT_TOKEN=your_telegram_bot_token_here
MONGODB_URI=mongodb://localhost:27017/magnum_stars

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

#### Шаг 4: Запуск бота
```bash
# Запуск в режиме разработки
npm run dev

# Запуск в продакшене
npm start

# Запуск с PM2 (рекомендуется для продакшена)
npm install -g pm2
pm2 start bot.js --name "magnum-stars-bot"
pm2 startup
pm2 save
```

### 2. Развертывание с Docker

#### Шаг 1: Установка Docker
```bash
# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### Шаг 2: Настройка и запуск
```bash
# Клонирование репозитория
git clone https://github.com/magnum-stars/bot.git
cd bot

# Создание конфигурационного файла
cp .env.example .env
nano .env

# Запуск всех сервисов
docker-compose up -d

# Просмотр логов
docker-compose logs -f bot

# Остановка сервисов
docker-compose down
```

#### Шаг 3: Управление контейнерами
```bash
# Перезапуск бота
docker-compose restart bot

# Обновление бота
git pull
docker-compose build bot
docker-compose up -d bot

# Резервное копирование базы данных
docker-compose exec mongodb mongodump --out /data/backup
docker cp magnum-stars-mongodb:/data/backup ./backup

# Восстановление базы данных
docker cp ./backup magnum-stars-mongodb:/data/backup
docker-compose exec mongodb mongorestore /data/backup
```

### 3. Облачное развертывание

#### Heroku
```bash
# Установка Heroku CLI
curl https://cli-assets.heroku.com/install.sh | sh

# Создание приложения
heroku create your-bot-name

# Настройка переменных окружения
heroku config:set BOT_TOKEN=your_telegram_bot_token
heroku config:set MONGODB_URI=your_mongodb_uri
heroku config:set ADMIN_IDS=123456789,987654321
heroku config:set SUPPORT_CHANNEL=@your_support_channel
heroku config:set WITHDRAWAL_CHANNEL=@your_withdrawal_channel
heroku config:set REQUIRED_CHANNEL=@your_required_channel

# Развертывание
git push heroku main

# Просмотр логов
heroku logs --tail
```

#### Railway
```bash
# Установка Railway CLI
npm install -g @railway/cli

# Авторизация
railway login

# Инициализация проекта
railway init

# Настройка переменных окружения
railway variables set BOT_TOKEN=your_telegram_bot_token
railway variables set MONGODB_URI=your_mongodb_uri
railway variables set ADMIN_IDS=123456789,987654321

# Развертывание
railway up

# Просмотр логов
railway logs
```

#### DigitalOcean App Platform
```bash
# Создание app.yaml
cat > app.yaml << EOF
name: magnum-stars-bot
services:
- name: bot
  source_dir: /
  github:
    repo: magnum-stars/bot
    branch: main
  run_command: npm start
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  envs:
  - key: BOT_TOKEN
    value: your_telegram_bot_token
  - key: MONGODB_URI
    value: your_mongodb_uri
  - key: ADMIN_IDS
    value: "123456789,987654321"
EOF

# Развертывание
doctl apps create --spec app.yaml
```

## 🔧 Настройка и оптимизация

### Настройка MongoDB
```bash
# Создание пользователя базы данных
mongosh
use magnum_stars
db.createUser({
  user: "bot_user",
  pwd: "secure_password",
  roles: ["readWrite"]
})

# Настройка индексов
db.users.createIndex({ "id": 1 }, { unique: true })
db.users.createIndex({ "username": 1 })
db.users.createIndex({ "miner.active": 1 })
db.promocodes.createIndex({ "code": 1 }, { unique: true })
db.withdrawalRequests.createIndex({ "userId": 1 })
db.supportTickets.createIndex({ "userId": 1 })
```

### Настройка Nginx (опционально)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Настройка SSL (Let's Encrypt)
```bash
# Установка Certbot
sudo apt install certbot python3-certbot-nginx -y

# Получение сертификата
sudo certbot --nginx -d your-domain.com

# Автоматическое обновление
sudo crontab -e
# Добавить строку:
0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 Мониторинг и логирование

### Настройка PM2
```bash
# Установка PM2
npm install -g pm2

# Создание конфигурации PM2
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'magnum-stars-bot',
    script: 'bot.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
EOF

# Запуск с PM2
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

### Настройка логирования
```bash
# Создание директории для логов
mkdir -p logs

# Ротация логов с logrotate
sudo nano /etc/logrotate.d/magnum-stars-bot

# Добавить конфигурацию:
/path/to/bot/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 bot bot
    postrotate
        pm2 reloadLogs
    endscript
}
```

## 🔒 Безопасность

### Настройка файрвола
```bash
# Установка UFW
sudo apt install ufw -y

# Настройка правил
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 27017/tcp
sudo ufw enable
```

### Настройка MongoDB безопасности
```bash
# Создание конфигурации MongoDB
sudo nano /etc/mongod.conf

# Добавить настройки безопасности:
security:
  authorization: enabled
net:
  bindIp: 127.0.0.1
  port: 27017
```

### Настройка переменных окружения
```bash
# Создание отдельного пользователя для бота
sudo useradd -r -s /bin/false bot

# Настройка прав доступа
sudo chown -R bot:bot /path/to/bot
sudo chmod 600 /path/to/bot/.env
```

## 🚨 Устранение неполадок

### Частые проблемы

#### Бот не запускается
```bash
# Проверка логов
pm2 logs magnum-stars-bot
docker-compose logs bot

# Проверка переменных окружения
node -e "require('dotenv').config(); console.log(process.env.BOT_TOKEN)"
```

#### Проблемы с базой данных
```bash
# Проверка подключения к MongoDB
mongosh "mongodb://localhost:27017/magnum_stars"

# Проверка статуса MongoDB
sudo systemctl status mongod

# Перезапуск MongoDB
sudo systemctl restart mongod
```

#### Проблемы с памятью
```bash
# Мониторинг использования памяти
htop
free -h

# Очистка кеша
pm2 flush
docker system prune -f
```

### Полезные команды
```bash
# Перезапуск всех сервисов
pm2 restart all
docker-compose restart

# Обновление бота
git pull
npm install
pm2 restart magnum-stars-bot

# Резервное копирование
mongodump --db magnum_stars --out ./backup/$(date +%Y%m%d)

# Восстановление
mongorestore --db magnum_stars ./backup/20231201/magnum_stars/
```

## 📈 Масштабирование

### Горизонтальное масштабирование
```bash
# Увеличение количества экземпляров PM2
pm2 scale magnum-stars-bot 3

# Настройка балансировщика нагрузки
# Используйте nginx или haproxy для распределения нагрузки
```

### Вертикальное масштабирование
```bash
# Увеличение лимитов памяти
pm2 restart magnum-stars-bot --max-memory-restart 2G

# Настройка MongoDB для больших нагрузок
# Увеличьте размер WiredTiger cache
```

## 📞 Поддержка

При возникновении проблем:

1. **Проверьте логи:** `pm2 logs` или `docker-compose logs`
2. **Проверьте документацию:** [README.md](README.md)
3. **Создайте issue:** [GitHub Issues](https://github.com/magnum-stars/bot/issues)
4. **Обратитесь в поддержку:** @magnum_support

---

**Удачного развертывания! 🚀**