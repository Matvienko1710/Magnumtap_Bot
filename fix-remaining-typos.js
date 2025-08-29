// Скрипт для массового исправления оставшихся опечаток magnuStarsoins -> magnumCoins
const fs = require('fs');
const path = require('path');

const filePath = 'magnum-bot-final.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Массив замен для исправления опечаток
    const replacements = [
        { from: 'magnuStarsoins', to: 'magnumCoins' },
        { from: 'totalEarnedMagnuStarsoins', to: 'totalEarnedMagnumCoins' },
        { from: 'totalWithdrawnMagnuStarsoins', to: 'totalWithdrawnMagnumCoins' },
        { from: 'magnuStarsoinsReserve', to: 'magnumCoinsReserve' },
        { from: 'magnuStarsoinsAmount', to: 'magnumCoinsAmount' },
        { from: 'magnuStarsoinsReceived', to: 'magnumCoinsReceived' }
    ];

    let changesCount = 0;

    replacements.forEach(({ from, to }) => {
        const regex = new RegExp(from, 'g');
        const matches = content.match(regex);
        if (matches) {
            content = content.replace(regex, to);
            changesCount += matches.length;
            console.log(`✅ Исправлено "${from}" -> "${to}": ${matches.length} вхождений`);
        }
    });

    if (changesCount > 0) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`\n🎉 Всего исправлено: ${changesCount} опечаток`);
        console.log('📁 Файл magnum-bot-final.js обновлен');
    } else {
        console.log('✅ Опечаток не найдено');
    }

} catch (error) {
    console.error('❌ Ошибка при исправлении опечаток:', error.message);
}
