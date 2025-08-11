# Используем официальный образ Node.js
FROM node:18-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем файлы package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production && npm cache clean --force

# Копируем исходный код
COPY . .

# Создаем пользователя для безопасности
RUN addgroup -g 1001 -S nodejs
RUN adduser -S bot -u 1001

# Меняем владельца файлов
RUN chown -R bot:nodejs /app
USER bot

# Запускаем бота
CMD ["npm", "start"]