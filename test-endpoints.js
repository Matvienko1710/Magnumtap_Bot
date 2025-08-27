#!/usr/bin/env node

/**
 * Скрипт для тестирования эндпоинтов Magnum Stars Bot
 * Использование: node test-endpoints.js [URL]
 * 
 * Пример: node test-endpoints.js https://your-app-name.onrender.com
 */

const https = require('https');
const http = require('http');

// Получаем URL из аргументов командной строки или используем по умолчанию
const baseUrl = process.argv[2] || 'http://localhost:3000';

console.log(`🔍 Тестирование эндпоинтов для: ${baseUrl}\n`);

// Функция для выполнения HTTP запроса
function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        const req = client.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: data
                });
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

// Функция для тестирования эндпоинта
async function testEndpoint(name, path) {
    const url = `${baseUrl}${path}`;
    console.log(`📡 Тестирование ${name}...`);
    console.log(`   URL: ${url}`);
    
    try {
        const startTime = Date.now();
        const response = await makeRequest(url);
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        console.log(`   ✅ Статус: ${response.statusCode}`);
        console.log(`   ⏱️  Время ответа: ${responseTime}ms`);
        
        // Пытаемся распарсить JSON
        try {
            const jsonData = JSON.parse(response.data);
            console.log(`   📄 Ответ: ${JSON.stringify(jsonData, null, 2)}`);
        } catch (e) {
            console.log(`   📄 Ответ: ${response.data}`);
        }
        
        console.log('');
        return { success: true, statusCode: response.statusCode, responseTime };
    } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
        console.log('');
        return { success: false, error: error.message };
    }
}

// Основная функция тестирования
async function runTests() {
    const endpoints = [
        { name: 'Health Check', path: '/health' },
        { name: 'Ping', path: '/ping' },
        { name: 'Status API', path: '/api/status' },
        { name: 'Root', path: '/' },
        { name: 'Bot Info', path: '/api/bot-info' }
    ];
    
    console.log('🚀 Начинаем тестирование эндпоинтов...\n');
    
    const results = [];
    
    for (const endpoint of endpoints) {
        const result = await testEndpoint(endpoint.name, endpoint.path);
        results.push({ ...endpoint, ...result });
    }
    
    // Выводим сводку
    console.log('📊 Сводка результатов:');
    console.log('='.repeat(50));
    
    let successCount = 0;
    let totalResponseTime = 0;
    
    results.forEach(result => {
        const status = result.success ? '✅' : '❌';
        const time = result.success ? `(${result.responseTime}ms)` : '';
        console.log(`${status} ${result.name}: ${result.success ? 'OK' : result.error} ${time}`);
        
        if (result.success) {
            successCount++;
            totalResponseTime += result.responseTime;
        }
    });
    
    console.log('='.repeat(50));
    console.log(`📈 Успешно: ${successCount}/${results.length}`);
    
    if (successCount > 0) {
        console.log(`⏱️  Среднее время ответа: ${Math.round(totalResponseTime / successCount)}ms`);
    }
    
    if (successCount === results.length) {
        console.log('🎉 Все эндпоинты работают корректно!');
        console.log('✅ Ваш бот готов к настройке UptimeRobot');
    } else {
        console.log('⚠️  Некоторые эндпоинты не работают');
        console.log('🔧 Проверьте логи приложения и настройки');
    }
}

// Запускаем тесты
runTests().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
});
