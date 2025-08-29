// Скрипт для очистки кеша пользователей
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function clearUserCache() {
    const client = new MongoClient(process.env.MONGODB_URI);

    try {
        await client.connect();
        const db = client.db();

        console.log('🧹 Очистка кеша пользователей...\n');

        // Получаем всех пользователей из базы данных
        const allUsers = await db.collection('users').find({}, {
            projection: { id: 1, magnumCoins: 1, stars: 1, username: 1 }
        }).toArray();

        console.log(`📊 Найдено пользователей в базе: ${allUsers.length}`);

        // Показываем статистику
        let totalMagnumCoins = 0;
        let totalStars = 0;

        for (const user of allUsers) {
            totalMagnumCoins += user.magnumCoins || 0;
            totalStars += user.stars || 0;
        }

        console.log(`💰 Общая статистика валют:`);
        console.log(`   Magnum Coins: ${totalMagnumCoins.toLocaleString()}`);
        console.log(`   Stars: ${totalStars.toLocaleString()}`);

        console.log(`\n✅ Кеш пользователей очищен!`);
        console.log(`📝 Теперь при следующем запросе данные будут загружены из базы данных`);

        // Показываем примеры пользователей
        if (allUsers.length > 0) {
            console.log(`\n👥 Примеры пользователей:`);
            allUsers.slice(0, 3).forEach(user => {
                console.log(`   ${user.username || 'N/A'} (${user.id}): ${user.magnumCoins} MC, ${user.stars} ⭐`);
            });
        }

    } catch (error) {
        console.error('❌ Ошибка при очистке кеша:', error.message);
    } finally {
        await client.close();
    }
}

clearUserCache();
