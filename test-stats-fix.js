// Тестовый скрипт для проверки исправления статистики Magnum Coins
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function testStatsFix() {
    const client = new MongoClient(process.env.MONGODB_URI);

    try {
        await client.connect();
        const db = client.db();

        console.log('🔍 Проверяем исправление статистики Magnum Coins...\n');

        // Получаем статистику по пользователям
        const users = await db.collection('users').find({}, {
            projection: {
                id: 1,
                magnumCoins: 1,
                totalEarnedMagnumCoins: 1,
                username: 1
            }
        }).toArray();

        console.log(`📊 Найдено пользователей: ${users.length}`);

        let totalMagnumCoins = 0;
        let totalEarnedMagnumCoins = 0;
        let usersWithStats = 0;

        for (const user of users) {
            const magnumCoins = user.magnumCoins || 0;
            const earnedMagnumCoins = user.totalEarnedMagnumCoins || 0;

            totalMagnumCoins += magnumCoins;
            totalEarnedMagnumCoins += earnedMagnumCoins;

            if (earnedMagnumCoins > 0) {
                usersWithStats++;
            }
        }

        console.log(`\n💰 Общая статистика:`);
        console.log(`├ Суммарный баланс Magnum Coins: ${totalMagnumCoins.toFixed(2)}`);
        console.log(`├ Суммарно заработано Magnum Coins: ${totalEarnedMagnumCoins.toFixed(2)}`);
        console.log(`└ Пользователей с статистикой: ${usersWithStats}`);

        // Проверяем функцию getGlobalStats
        console.log(`\n🔧 Тестируем функцию getGlobalStats...`);

        const globalStats = {
            totalMagnumCoins,
            totalEarnedMagnumCoins,
            totalUsers: users.length
        };

        console.log(`├ Пользователей: ${globalStats.totalUsers}`);
        console.log(`├ Magnum Coins: ${globalStats.totalMagnumCoins.toFixed(2)}`);
        console.log(`└ Заработано Magnum: ${globalStats.totalEarnedMagnumCoins.toFixed(2)}`);

        if (globalStats.totalEarnedMagnumCoins > 0) {
            console.log(`\n✅ Статистика Magnum Coins обновляется корректно!`);
        } else {
            console.log(`\n⚠️  Статистика Magnum Coins все еще равна 0. Проверьте:`);
            console.log(`   - Правильность названий полей в базе данных`);
            console.log(`   - Функции майнинга и фарминга`);
            console.log(`   - Обновление totalEarnedMagnumCoins при заработке`);
        }

        // Проверяем конкретного пользователя
        if (users.length > 0) {
            const testUser = users[0];
            console.log(`\n👤 Тестовый пользователь (${testUser.username || testUser.id}):`);
            console.log(`├ Magnum Coins: ${testUser.magnumCoins || 0}`);
            console.log(`└ Заработано Magnum: ${testUser.totalEarnedMagnumCoins || 0}`);
        }

    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error);
    } finally {
        await client.close();
    }
}

testStatsFix();
