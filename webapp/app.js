// Magnum Stars WebApp - Основная логика

class MagnumWebApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.userId = null;
        this.userData = null;
        this.isLoading = false;
        
        this.init();
    }

    // Инициализация приложения
    async init() {
        try {
            // Инициализируем Telegram WebApp
            this.tg.ready();
            this.tg.expand();
            
            // Получаем данные пользователя
            this.userId = this.tg.initDataUnsafe?.user?.id;
            
            if (!this.userId) {
                this.showNotification('Ошибка: не удалось получить данные пользователя', 'error');
                return;
            }

            // Загружаем данные пользователя
            await this.loadUserData();
            
            // Обновляем интерфейс
            this.updateUI();
            
            // Запускаем автообновление
            this.startAutoUpdate();
            
            console.log('Magnum WebApp инициализирован');
            
        } catch (error) {
            console.error('Ошибка инициализации:', error);
            this.showNotification('Ошибка инициализации приложения', 'error');
        }
    }

    // Загрузка данных пользователя
    async loadUserData() {
        try {
            this.setLoading(true);
            
            const response = await fetch(`/api/webapp/user-data?userId=${this.userId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            this.userData = await response.json();
            
            // Кэшируем данные
            localStorage.setItem('userData', JSON.stringify(this.userData));
            localStorage.setItem('userDataTimestamp', Date.now());
            
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            
            // Пробуем загрузить из кэша
            const cached = localStorage.getItem('userData');
            const timestamp = localStorage.getItem('userDataTimestamp');
            
            if (cached && timestamp && (Date.now() - timestamp < 60000)) {
                this.userData = JSON.parse(cached);
                this.showNotification('Загружены кэшированные данные', 'warning');
            } else {
                this.showNotification('Ошибка загрузки данных пользователя', 'error');
            }
        } finally {
            this.setLoading(false);
        }
    }

    // Обновление интерфейса
    updateUI() {
        if (!this.userData) return;

        // Обновляем баланс
        document.getElementById('magnumCoins').textContent = this.formatNumber(this.userData.magnumCoins || 0);
        document.getElementById('stars').textContent = this.formatNumber(this.userData.stars || 0);
        
        // Обновляем статистику
        document.getElementById('userLevel').textContent = this.userData.level || 1;
        
        // Рассчитываем скорость майнинга
        const miningSpeed = this.calculateMiningSpeed();
        document.getElementById('miningSpeed').textContent = miningSpeed.toFixed(2);
        
        // Обновляем общую добычу
        const totalMined = (this.userData.miningStats?.totalMinedMC || 0) + 
                          (this.userData.miningStats?.totalMinedStars || 0);
        document.getElementById('totalMined').textContent = this.formatNumber(totalMined);
    }

    // Расчет скорости майнинга
    calculateMiningSpeed() {
        if (!this.userData?.miners) return 0;
        
        let totalSpeed = 0;
        
        this.userData.miners.forEach(miner => {
            if (miner.active) {
                const baseSpeed = miner.type === 'magnumCoins' ? 1 : 0.5;
                totalSpeed += baseSpeed * miner.speed * (miner.level || 1);
            }
        });
        
        return totalSpeed;
    }

    // Форматирование чисел
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toFixed(0);
    }

    // Установка состояния загрузки
    setLoading(loading) {
        this.isLoading = loading;
        const earnButton = document.querySelector('.earn-button');
        
        if (loading) {
            earnButton.classList.add('loading');
            earnButton.disabled = true;
        } else {
            earnButton.classList.remove('loading');
            earnButton.disabled = false;
        }
    }

    // Показ уведомлений
    showNotification(message, type = 'info') {
        const notifications = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        notifications.appendChild(notification);
        
        // Автоудаление через 5 секунд
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    // API запросы
    async apiRequest(endpoint, data = {}) {
        try {
            const response = await fetch(`/api/webapp/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: this.userId,
                    ...data
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
            
        } catch (error) {
            console.error(`API ошибка (${endpoint}):`, error);
            throw error;
        }
    }

    // Автообновление данных
    startAutoUpdate() {
        setInterval(async () => {
            if (!this.isLoading) {
                await this.loadUserData();
                this.updateUI();
            }
        }, 30000); // каждые 30 секунд
    }

    // Обработчики действий
    async handleEarnClick() {
        if (this.isLoading) return;
        
        try {
            this.setLoading(true);
            
            // Показываем меню заработка
            this.showEarnMenu();
            
        } catch (error) {
            console.error('Ошибка обработки заработка:', error);
            this.showNotification('Ошибка при обработке действия', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    // Показать меню заработка
    showEarnMenu() {
        const menuItems = [
            { icon: '⚡', text: 'Активный клик', action: 'mining_click' },
            { icon: '🌾', text: 'Фарм', action: 'farm' },
            { icon: '📋', text: 'Задания', action: 'tasks' },
            { icon: '👥', text: 'Рефералы', action: 'referrals' },
            { icon: '🏆', text: 'Достижения', action: 'achievements' }
        ];

        const menuText = menuItems.map(item => 
            `${item.icon} ${item.text}`
        ).join('\n');

        this.tg.showPopup({
            title: '💰 Выберите способ заработка',
            message: menuText,
            buttons: menuItems.map(item => ({
                text: `${item.icon} ${item.text}`,
                callback_data: item.action
            }))
        });
    }

    async handleMiningClick() {
        try {
            this.setLoading(true);
            
            const result = await this.apiRequest('mining-click');
            
            if (result.success) {
                this.showNotification(`+${result.reward} MC за активный клик!`, 'success');
                await this.loadUserData();
                this.updateUI();
            } else {
                this.showNotification(result.message || 'Ошибка майнинга', 'error');
            }
            
        } catch (error) {
            console.error('Ошибка активного клика:', error);
            this.showNotification('Ошибка при выполнении действия', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async handleFarmClick() {
        try {
            this.setLoading(true);
            
            const result = await this.apiRequest('farm');
            
            if (result.success) {
                this.showNotification(`+${result.reward} MC за фарм!`, 'success');
                await this.loadUserData();
                this.updateUI();
            } else {
                this.showNotification(result.message || 'Ошибка фарма', 'error');
            }
            
        } catch (error) {
            console.error('Ошибка фарма:', error);
            this.showNotification('Ошибка при выполнении действия', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async handleExchangeClick() {
        try {
            this.setLoading(true);
            
            // Показываем меню обмена
            this.showExchangeMenu();
            
        } catch (error) {
            console.error('Ошибка обмена:', error);
            this.showNotification('Ошибка при открытии обмена', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async showExchangeMenu() {
        const currentRate = await this.calculateExchangeRate();
        
        const commission = 2.5;
        this.tg.showPopup({
            title: '💱 Обмен валют',
            message: `Текущий курс: 1 Magnum Coins = ${currentRate.toFixed(4)} Stars\nКомиссия: ${commission}%\n\nВаш баланс:\n💰 ${this.userData.magnumCoins.toFixed(2)} Magnum Coins\n⭐ ${this.userData.stars.toFixed(2)} Stars\n\nПримеры:\n• 100 MC → ${(100 * currentRate * (1 - commission/100)).toFixed(4)} Stars\n• 100 Stars → ${((100 / currentRate) * (1 - commission/100)).toFixed(2)} MC`,
            buttons: [
                { text: '💰 Magnum Coins → Stars', callback_data: 'exchange_mc_to_stars' },
                { text: '⭐ Stars → Magnum Coins', callback_data: 'exchange_stars_to_mc' },
                { text: '📊 История', callback_data: 'exchange_history' },
                { text: '❌ Отмена', callback_data: 'cancel' }
            ]
        });
    }

    async calculateExchangeRate() {
        try {
            const response = await fetch('/api/webapp/exchange-rate');
            const data = await response.json();
            return data.rate || 0.001;
        } catch (error) {
            console.error('Ошибка получения курса:', error);
            // Fallback на случайный курс
            return 0.001 * (1 + Math.random() * 0.1);
        }
    }

    async showExchangeHistory() {
        try {
            this.setLoading(true);

            const response = await fetch(`/api/webapp/exchange-history?userId=${this.userId}`);
            const data = await response.json();

            if (data.success && data.history && data.history.length > 0) {
                const historyText = data.history.slice(0, 10).map(item => {
                    const date = new Date(item.timestamp).toLocaleDateString('ru-RU');
                    const type = item.direction === 'Stars' ? 'Magnum Coins → Stars' : 'Stars → Magnum Coins';
                    return `${date}: ${type} ${item.amount} → ${item.received.toFixed(4)}`;
                }).join('\n');

                this.tg.showPopup({
                    title: '📊 История обменов',
                    message: historyText,
                    buttons: [
                        { text: '🔄 Обновить', callback_data: 'exchange_history' },
                        { text: '❌ Закрыть', callback_data: 'close' }
                    ]
                });
            } else {
                this.showNotification('История обменов пуста', 'info');
            }

        } catch (error) {
            console.error('Ошибка загрузки истории:', error);
            this.showNotification('Ошибка загрузки истории обменов', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async showExchangeInput(exchangeType) {
        const currentRate = await this.calculateExchangeRate();
        const commission = 2.5; // 2.5% комиссия

        let title, message, maxAmount, fromCurrency, toCurrency, fromParam;

        if (exchangeType === 'mc_to_stars') {
            title = '💰 Magnum Coins → Stars';
            fromCurrency = 'Magnum Coins';
            toCurrency = 'Stars';
            fromParam = 'Stars'; // Для API
            maxAmount = this.userData.magnumCoins;
            message = `Обмен Magnum Coins на Stars\nКурс: 1 MC = ${currentRate.toFixed(4)} Stars\nКомиссия: ${commission}%\n\nВаш баланс: ${this.userData.magnumCoins} MC\n\nВведите сумму Magnum Coins для обмена:`;
        } else {
            title = '⭐ Stars → Magnum Coins';
            fromCurrency = 'Stars';
            toCurrency = 'Magnum Coins';
            fromParam = 'stars'; // Для API
            maxAmount = this.userData.stars;
            message = `Обмен Stars на Magnum Coins\nКурс: 1 Stars = ${(1/currentRate).toFixed(2)} MC\nКомиссия: ${commission}%\n\nВаш баланс: ${this.userData.stars} Stars\n\nВведите сумму Stars для обмена:`;
        }

        const amount = prompt(message);

        if (amount && !isNaN(amount) && amount > 0) {
            const numAmount = parseFloat(amount);
            if (numAmount <= maxAmount) {
                this.performExchange(fromParam, numAmount, currentRate, commission);
            } else {
                this.showNotification(`Недостаточно ${fromCurrency} на балансе`, 'error');
            }
        }
    }

    async performExchange(fromParam, amount, rate, commission) {
        try {
            this.setLoading(true);
            this.showNotification('Выполняем обмен...', 'info');

            const exchangeData = {
                userId: this.userId,
                from: fromParam, // 'Stars' или 'stars'
                amount: amount
            };

            const response = await fetch('/api/webapp/exchange', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(exchangeData)
            });

            const result = await response.json();

            if (result.success) {
                // Обновляем баланс
                this.userData.magnumCoins = result.magnumCoins;
                this.userData.stars = result.stars;
                this.updateUI();

                // Определяем, что было получено
                let receivedAmount, receivedCurrency;
                if (fromParam === 'Stars') {
                    receivedAmount = result.stars;
                    receivedCurrency = 'Stars';
                } else {
                    receivedAmount = result.magnumCoins;
                    receivedCurrency = 'MC';
                }

                const commissionAmount = amount * (commission / 100);

                this.showNotification(`✅ Обмен выполнен!\nПолучено: ${receivedAmount.toFixed(4)} ${receivedCurrency}\nКомиссия: ${commissionAmount.toFixed(4)}`, 'success');
            } else {
                this.showNotification(result.error || 'Ошибка обмена', 'error');
            }

        } catch (error) {
            console.error('Ошибка обмена:', error);
            this.showNotification('Ошибка при выполнении обмена', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async handleTasksClick() {
        try {
            this.setLoading(true);
            
            const result = await this.apiRequest('tasks');
            
            if (result.success) {
                this.showTasksMenu(result.tasks);
            } else {
                this.showNotification(result.message || 'Ошибка загрузки заданий', 'error');
            }
            
        } catch (error) {
            console.error('Ошибка заданий:', error);
            this.showNotification('Ошибка при загрузке заданий', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    showTasksMenu(tasks) {
        const tasksText = tasks.length > 0 
            ? tasks.map(task => `${task.icon} ${task.name} (+${task.reward} MC)`)
                .join('\n')
            : 'Нет доступных заданий';

        this.tg.showPopup({
            title: '📋 Доступные задания',
            message: tasksText,
            buttons: tasks.map(task => ({
                text: `${task.icon} ${task.name}`,
                callback_data: `task_${task.id}`
            })).concat([
                { text: '❌ Закрыть', callback_data: 'close' }
            ])
        });
    }
}

// Глобальные функции для обработчиков
let webApp;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    webApp = new MagnumWebApp();
});

// Глобальные обработчики
function handleEarnClick() {
    if (webApp) webApp.handleEarnClick();
}

function handleMiningClick() {
    if (webApp) webApp.handleMiningClick();
}

function handleFarmClick() {
    if (webApp) webApp.handleFarmClick();
}

function handleExchangeClick() {
    if (webApp) webApp.handleExchangeClick();
}

function handleTasksClick() {
    if (webApp) webApp.handleTasksClick();
}

// Обработка callback'ов от Telegram
window.handleTelegramCallback = function(callbackData) {
    if (!webApp) return;
    
    console.log('Telegram callback:', callbackData);
    
    switch (callbackData) {
        case 'mining_click':
            webApp.handleMiningClick();
            break;
        case 'farm':
            webApp.handleFarmClick();
            break;
        case 'tasks':
            webApp.handleTasksClick();
            break;
        case 'exchange_mc_to_stars':
            webApp.showExchangeInput('mc_to_stars');
            break;
        case 'exchange_stars_to_mc':
            webApp.showExchangeInput('stars_to_mc');
            break;
        case 'exchange_history':
            webApp.showExchangeHistory();
            break;
        case 'close':
        case 'cancel':
            // Просто закрываем
            break;
        default:
            if (callbackData.startsWith('task_')) {
                const taskId = callbackData.replace('task_', '');
                webApp.handleTaskComplete(taskId);
            }
            break;
    }
};
