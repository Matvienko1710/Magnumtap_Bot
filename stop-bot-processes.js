// Скрипт для остановки других процессов бота
const { exec } = require('child_process');

function stopBotProcesses() {
    console.log('🔄 Поиск и остановка процессов бота...\n');

    // На Windows используем taskkill для остановки Node.js процессов
    if (process.platform === 'win32') {
        exec('taskkill /F /IM node.exe /FI "WINDOWTITLE eq node*"', (error, stdout, stderr) => {
            if (error) {
                console.log('ℹ️  Нет запущенных процессов Node.js для остановки');
                return;
            }
            console.log('✅ Процессы Node.js остановлены:');
            console.log(stdout);
        });
    } else {
        // На Linux/Mac используем pkill
        exec('pkill -f "node.*magnum-bot"', (error, stdout, stderr) => {
            if (error) {
                console.log('ℹ️  Нет запущенных процессов бота для остановки');
                return;
            }
            console.log('✅ Процессы бота остановлены');
        });
    }

    console.log('🎯 Теперь можно безопасно запустить бота');
    console.log('💡 Команда: node magnum-bot-final.js');
}

stopBotProcesses();
