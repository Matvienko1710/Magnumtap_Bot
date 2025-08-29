// Скрипт миграции базы данных для исправления названий полей Magnum Coins
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function migrateDatabase() {
    const client = new MongoClient(process.env.MONGODB_URI);

    try {
        await client.connect();
        const db = client.db();

        console.log('🔄 Начинаем миграцию базы данных...\n');

        // 1. Миграция пользователей
        console.log('👥 Миграция пользователей...');
        const usersCollection = db.collection('users');

        // Находим всех пользователей со старыми полями
        const usersWithOldFields = await usersCollection.find({
            $or: [
                { magnuStarsoins: { $exists: true } },
                { totalEarnedMagnuStarsoins: { $exists: true } },
                { totalWithdrawnMagnuStarsoins: { $exists: true } }
            ]
        }).toArray();

        console.log(`📊 Найдено пользователей для миграции: ${usersWithOldFields.length}`);

        for (const user of usersWithOldFields) {
            const updateData = {};

            // Переносим значения из старых полей в новые
            if (user.magnuStarsoins !== undefined) {
                updateData.magnumCoins = user.magnuStarsoins;
                updateData.$unset = { ...updateData.$unset, magnuStarsoins: 1 };
            }

            if (user.totalEarnedMagnuStarsoins !== undefined) {
                updateData.totalEarnedMagnumCoins = user.totalEarnedMagnuStarsoins;
                updateData.$unset = { ...updateData.$unset, totalEarnedMagnuStarsoins: 1 };
            }

            if (user.totalWithdrawnMagnuStarsoins !== undefined) {
                updateData.totalWithdrawnMagnumCoins = user.totalWithdrawnMagnuStarsoins;
                updateData.$unset = { ...updateData.$unset, totalWithdrawnMagnuStarsoins: 1 };
            }

            if (Object.keys(updateData).length > 0) {
                await usersCollection.updateOne(
                    { _id: user._id },
                    updateData
                );
                console.log(`✅ Обновлен пользователь ${user.id || user._id}`);
            }
        }

        // 2. Миграция WebApp пользователей
        console.log('\n🌐 Миграция WebApp пользователей...');
        const webappUsersCollection = db.collection('webappUsers');

        const webappUsersWithOldFields = await webappUsersCollection.find({
            $or: [
                { magnuStarsoins: { $exists: true } },
                { totalEarnedMagnuStarsoins: { $exists: true } },
                { totalWithdrawnMagnuStarsoins: { $exists: true } }
            ]
        }).toArray();

        console.log(`📊 Найдено WebApp пользователей для миграции: ${webappUsersWithOldFields.length}`);

        for (const user of webappUsersWithOldFields) {
            const updateData = {};

            if (user.magnuStarsoins !== undefined) {
                updateData.magnumCoins = user.magnuStarsoins;
                updateData.$unset = { ...updateData.$unset, magnuStarsoins: 1 };
            }

            if (user.totalEarnedMagnuStarsoins !== undefined) {
                updateData.totalEarnedMagnumCoins = user.totalEarnedMagnuStarsoins;
                updateData.$unset = { ...updateData.$unset, totalEarnedMagnuStarsoins: 1 };
            }

            if (user.totalWithdrawnMagnuStarsoins !== undefined) {
                updateData.totalWithdrawnMagnumCoins = user.totalWithdrawnMagnuStarsoins;
                updateData.$unset = { ...updateData.$unset, totalWithdrawnMagnuStarsoins: 1 };
            }

            if (Object.keys(updateData).length > 0) {
                await webappUsersCollection.updateOne(
                    { _id: user._id },
                    updateData
                );
                console.log(`✅ Обновлен WebApp пользователь ${user.userId || user._id}`);
            }
        }

        // 3. Миграция резерва валют
        console.log('\n🏦 Миграция резерва валют...');
        const reserveCollection = db.collection('reserve');

        const reservesWithOldFields = await reserveCollection.find({
            $or: [
                { magnuStarsoins: { $exists: true } }
            ]
        }).toArray();

        console.log(`📊 Найдено резервов для миграции: ${reservesWithOldFields.length}`);

        for (const reserve of reservesWithOldFields) {
            const updateData = {};

            if (reserve.magnuStarsoins !== undefined) {
                updateData.magnumCoins = reserve.magnuStarsoins;
                updateData.$unset = { ...updateData.$unset, magnuStarsoins: 1 };
            }

            if (Object.keys(updateData).length > 0) {
                await reserveCollection.updateOne(
                    { _id: reserve._id },
                    updateData
                );
                console.log(`✅ Обновлен резерв ${reserve.currency || reserve._id}`);
            }
        }

        // 4. Миграция истории обменов
        console.log('\n💱 Миграция истории обменов...');
        const exchangeHistoryCollection = db.collection('exchangeHistory');

        const exchangeHistoryWithOldFields = await exchangeHistoryCollection.find({
            $or: [
                { magnuStarsoinsAmount: { $exists: true } },
                { magnuStarsoinsReceived: { $exists: true } }
            ]
        }).toArray();

        console.log(`📊 Найдено записей истории обменов для миграции: ${exchangeHistoryWithOldFields.length}`);

        for (const exchange of exchangeHistoryWithOldFields) {
            const updateData = {};

            if (exchange.magnuStarsoinsAmount !== undefined) {
                updateData.magnumCoinsAmount = exchange.magnuStarsoinsAmount;
                updateData.$unset = { ...updateData.$unset, magnuStarsoinsAmount: 1 };
            }

            if (exchange.magnuStarsoinsReceived !== undefined) {
                updateData.magnumCoinsReceived = exchange.magnuStarsoinsReceived;
                updateData.$unset = { ...updateData.$unset, magnuStarsoinsReceived: 1 };
            }

            if (Object.keys(updateData).length > 0) {
                await exchangeHistoryCollection.updateOne(
                    { _id: exchange._id },
                    updateData
                );
                console.log(`✅ Обновлена запись истории обмена ${exchange._id}`);
            }
        }

        // 5. Проверка результатов миграции
        console.log('\n📋 Проверка результатов миграции...\n');

        // Проверяем, что старых полей больше нет
        const remainingOldFields = await usersCollection.countDocuments({
            $or: [
                { magnuStarsoins: { $exists: true } },
                { totalEarnedMagnuStarsoins: { $exists: true } },
                { totalWithdrawnMagnuStarsoins: { $exists: true } }
            ]
        });

        if (remainingOldFields === 0) {
            console.log('✅ Миграция пользователей завершена успешно!');
        } else {
            console.log(`⚠️  Осталось ${remainingOldFields} пользователей со старыми полями`);
        }

        // Проверяем, что новые поля появились
        const usersWithNewFields = await usersCollection.countDocuments({
            magnumCoins: { $exists: true }
        });

        console.log(`📊 Пользователей с новыми полями: ${usersWithNewFields}`);

        // Статистика миграции
        console.log('\n🎉 Миграция базы данных завершена!');
        console.log('📊 Резюме:');
        console.log(`   • Пользователей: ${usersWithOldFields.length}`);
        console.log(`   • WebApp пользователей: ${webappUsersWithOldFields.length}`);
        console.log(`   • Резервов: ${reservesWithOldFields.length}`);
        console.log(`   • Записей истории обменов: ${exchangeHistoryWithOldFields.length}`);

    } catch (error) {
        console.error('❌ Ошибка при миграции базы данных:', error.message);
    } finally {
        await client.close();
    }
}

migrateDatabase();
