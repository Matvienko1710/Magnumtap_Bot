#!/usr/bin/env node

/**
 * Скрипт для запуска бота с полным логированием
 * Запускает бота и сохраняет все логи в файлы для анализа
 */

const fs = require('fs');
const path = require('path');

// Создаем папку для логов если её нет
const logsDir = './logs';
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Очищаем старые логи
const logFiles = ['user_actions.log', 'error_log.log', 'bot.log'];
logFiles.forEach(file => {
  const filePath = path.join(logsDir, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
});

console.log('🚀 Запуск Magnum Stars Bot с полным логированием...');
console.log('📝 Логи будут сохранены в папку ./logs/');
console.log('📋 Файлы логов:');
console.log('   - user_actions.log - действия пользователей');
console.log('   - error_log.log - ошибки');
console.log('   - bot.log - общие логи бота');
console.log('');

// Перенаправляем console.log в файл
const originalLog = console.log;
const originalError = console.error;

const botLogStream = fs.createWriteStream(path.join(logsDir, 'bot.log'), { flags: 'a' });

console.log = function(...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.join(' ')}`;
  originalLog(message);
  botLogStream.write(message + '\n');
};

console.error = function(...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ERROR: ${args.join(' ')}`;
  originalError(message);
  botLogStream.write(message + '\n');
};

// Обработка завершения процесса
process.on('SIGINT', () => {
  console.log('🛑 Получен сигнал завершения, сохраняем логи...');
  botLogStream.end();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Получен сигнал завершения, сохраняем логи...');
  botLogStream.end();
  process.exit(0);
});

// Запускаем основной файл бота
console.log('🔧 Загружаем основной файл бота...');
require('./magnum-bot-final.js');
