// Скрипт для исправления проблемы с miningStats: null в базе данных
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function fixMiningStats() {
    const client = new MongoClient(process.env.MONGODB_URI);

    try {
        await client.connect();
        const db = client.db();

        console.log('🔧 Исправление проблемы с miningStats...\n');

        // Находим пользователей с miningStats: null
        const usersWithNullMiningStats = await db.collection('users').find({
            miningStats: null
        }).toArray();

        console.log(`📊 Найдено пользователей с miningStats: null: ${usersWithNullMiningStats.length}`);

        for (const user of usersWithNullMiningStats) {
            // Инициализируем miningStats
            const miningStats = {
                totalMinedMagnumCoins: 0,
                totalMinedStars: 0,
                seasonMinedMagnumCoins: 0,
                seasonMinedStars: 0,
                lastReward: new Date(),
                activeClickCount: 0,
                passiveRewards: 0
            };

            await db.collection('users').updateOne(
                { _id: user._id },
                { $set: { miningStats } }
            );

            console.log(`✅ Исправлен пользователь ${user.id || user._id}`);
        }

        // Находим пользователей без поля miningStats вообще
        const usersWithoutMiningStats = await db.collection('users').find({
            miningStats: { $exists: false }
        }).toArray();

        console.log(`\n📊 Найдено пользователей без поля miningStats: ${usersWithoutMiningStats.length}`);

        for (const user of usersWithoutMiningStats) {
            // Инициализируем miningStats
            const miningStats = {
                totalMinedMagnumCoins: 0,
                totalMinedStars: 0,
                seasonMinedMagnumCoins: 0,
                seasonMinedStars: 0,
                lastReward: user.miner?.lastReward || new Date(),
                activeClickCount: 0,
                passiveRewards: 0
            };

            await db.collection('users').updateOne(
                { _id: user._id },
                { $set: { miningStats } }
            );

            console.log(`✅ Инициализирован пользователь ${user.id || user._id}`);
        }

        // Проверяем результат
        const fixedUsers = await db.collection('users').countDocuments({
            miningStats: { $ne: null },
            'miningStats.totalMinedMagnumCoins': { $exists: true }
        });

        console.log(`\n🎉 Исправление завершено!`);
        console.log(`📊 Пользователей с корректными miningStats: ${fixedUsers}`);

    } catch (error) {
        console.error('❌ Ошибка при исправлении miningStats:', error.message);
    } finally {
        await client.close();
    }
}

fixMiningStats();
