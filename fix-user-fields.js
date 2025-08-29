// Скрипт для исправления полей пользователей в базе данных
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function fixUserFields() {
    const client = new MongoClient(process.env.MONGODB_URI);

    try {
        await client.connect();
        const db = client.db();

        console.log('🔧 Исправление полей пользователей...\n');

        // Находим пользователей с проблемными полями
        const usersWithIssues = await db.collection('users').find({
            $or: [
                { magnumCoins: { $exists: false } },
                { magnumCoins: null },
                { magnumCoins: { $type: 'null' } },
                { stars: { $exists: false } },
                { stars: null },
                { stars: { $type: 'null' } },
                { magnumCoins: { $type: 'string' } },
                { stars: { $type: 'string' } }
            ]
        }).toArray();

        console.log(`📊 Найдено пользователей с проблемными полями: ${usersWithIssues.length}`);

        const initialMagnumCoins = 1000; // Значение по умолчанию
        const initialStars = 0; // Значение по умолчанию

        for (const user of usersWithIssues) {
            const updateData = {};

            // Исправляем magnumCoins
            if (user.magnumCoins === undefined || user.magnumCoins === null ||
                typeof user.magnumCoins === 'string' || isNaN(user.magnumCoins)) {
                updateData.magnumCoins = initialMagnumCoins;
                updateData.totalEarnedMagnumCoins = initialMagnumCoins;
            }

            // Исправляем stars
            if (user.stars === undefined || user.stars === null ||
                typeof user.stars === 'string' || isNaN(user.stars)) {
                updateData.stars = initialStars;
                updateData.totalEarnedStars = initialStars;
            }

            if (Object.keys(updateData).length > 0) {
                await db.collection('users').updateOne(
                    { _id: user._id },
                    { $set: updateData }
                );
                console.log(`✅ Исправлен пользователь ${user.id || user._id}`);
            }
        }

        // Проверяем результат
        const fixedUsers = await db.collection('users').countDocuments({
            magnumCoins: { $exists: true, $ne: null, $type: 'number' },
            stars: { $exists: true, $ne: null, $type: 'number' }
        });

        const totalUsers = await db.collection('users').countDocuments();

        console.log(`\n🎉 Исправление завершено!`);
        console.log(`📊 Всего пользователей: ${totalUsers}`);
        console.log(`📊 Пользователей с корректными полями: ${fixedUsers}`);
        console.log(`📊 Процент исправленных: ${((fixedUsers / totalUsers) * 100).toFixed(1)}%`);

        // Показываем пример исправленного пользователя
        const exampleUser = await db.collection('users').findOne({}, {
            projection: { id: 1, magnumCoins: 1, stars: 1, username: 1 }
        });

        if (exampleUser) {
            console.log(`\n👤 Пример пользователя:`);
            console.log(`   ID: ${exampleUser.id}`);
            console.log(`   Username: ${exampleUser.username || 'N/A'}`);
            console.log(`   Magnum Coins: ${exampleUser.magnumCoins}`);
            console.log(`   Stars: ${exampleUser.stars}`);
        }

    } catch (error) {
        console.error('❌ Ошибка при исправлении полей пользователей:', error.message);
    } finally {
        await client.close();
    }
}

fixUserFields();
