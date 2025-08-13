// Инициализация Telegram WebApp
let tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Состояние игры
let gameState = {
    magnumCoins: 0,
    stars: 0,
    clickCount: 0,
    cps: 1, // Coins per second
    upgrades: {
        autoClicker: { level: 0, cost: 10, baseCost: 10, multiplier: 1.5 },
        clickPower: { level: 0, cost: 25, baseCost: 25, multiplier: 2 },
        starGenerator: { level: 0, cost: 50, baseCost: 50, multiplier: 2.5 }
    }
};

// DOM элементы
const elements = {
    magnumCoins: document.getElementById('magnumCoins'),
    stars: document.getElementById('stars'),
    clickCount: document.getElementById('clickCount'),
    cps: document.getElementById('cps'),
    clickerBtn: document.getElementById('clickerBtn'),
    upgradeList: document.getElementById('upgradeList'),
    connectionStatus: document.getElementById('connectionStatus')
};

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    initGame();
    setupEventListeners();
    loadUserData();
    startAutoClicker();
    renderUpgrades();
});

// Инициализация игры
function initGame() {
    console.log('🎮 Инициализация WebApp кликера...');
    updateConnectionStatus('Подключение к боту...', 'connecting');
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Клик по основной кнопке
    elements.clickerBtn.addEventListener('click', handleClick);
    
    // Обработка видимости страницы для авто-кликера
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

// Обработка клика
function handleClick() {
    // Анимация кнопки
    elements.clickerBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        elements.clickerBtn.style.transform = 'scale(1)';
    }, 100);
    
    // Добавление монет
    gameState.magnumCoins += gameState.cps;
    gameState.clickCount++;
    
    // Обновление UI
    updateUI();
    
    // Отправка данных на сервер (если подключен)
    saveUserData();
    
    // Haptic feedback
    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Авто-кликер
let autoClickerInterval;

function startAutoClicker() {
    autoClickerInterval = setInterval(() => {
        if (!document.hidden) {
            const autoClickerBonus = gameState.upgrades.autoClicker.level * 0.1;
            if (autoClickerBonus > 0) {
                gameState.magnumCoins += autoClickerBonus;
                updateUI();
            }
        }
    }, 1000);
}

// Обработка изменения видимости страницы
function handleVisibilityChange() {
    if (document.hidden) {
        console.log('📱 Страница скрыта, авто-кликер приостановлен');
    } else {
        console.log('📱 Страница видна, авто-кликер возобновлен');
    }
}

// Обновление UI
function updateUI() {
    elements.magnumCoins.textContent = formatNumber(gameState.magnumCoins);
    elements.stars.textContent = formatNumber(gameState.stars);
    elements.clickCount.textContent = formatNumber(gameState.clickCount);
    elements.cps.textContent = formatNumber(gameState.cps);
}

// Форматирование чисел
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return Math.floor(num).toString();
}

// Рендер улучшений
function renderUpgrades() {
    elements.upgradeList.innerHTML = '';
    
    const upgrades = [
        {
            id: 'autoClicker',
            name: '🤖 Авто-кликер',
            description: 'Автоматически генерирует монеты',
            icon: '⚡'
        },
        {
            id: 'clickPower',
            name: '💪 Сила клика',
            description: 'Увеличивает монеты за клик',
            icon: '💪'
        },
        {
            id: 'starGenerator',
            name: '⭐ Генератор звезд',
            description: 'Генерирует звезды автоматически',
            icon: '⭐'
        }
    ];
    
    upgrades.forEach(upgrade => {
        const upgradeData = gameState.upgrades[upgrade.id];
        const canAfford = gameState.magnumCoins >= upgradeData.cost;
        
        const upgradeElement = document.createElement('div');
        upgradeElement.className = 'upgrade-item';
        upgradeElement.innerHTML = `
            <div class="upgrade-info">
                <div class="upgrade-name">${upgrade.icon} ${upgrade.name}</div>
                <div class="upgrade-description">${upgrade.description} (Уровень: ${upgradeData.level})</div>
            </div>
            <div class="upgrade-cost">
                <div class="upgrade-price">${formatNumber(upgradeData.cost)} MC</div>
                <button class="upgrade-btn" ${!canAfford ? 'disabled' : ''} onclick="buyUpgrade('${upgrade.id}')">
                    Купить
                </button>
            </div>
        `;
        
        elements.upgradeList.appendChild(upgradeElement);
    });
}

// Покупка улучшения
function buyUpgrade(upgradeId) {
    const upgrade = gameState.upgrades[upgradeId];
    
    if (gameState.magnumCoins >= upgrade.cost) {
        gameState.magnumCoins -= upgrade.cost;
        upgrade.level++;
        upgrade.cost = Math.floor(upgrade.baseCost * Math.pow(upgrade.multiplier, upgrade.level));
        
        // Обновление CPS
        if (upgradeId === 'clickPower') {
            gameState.cps = 1 + (upgrade.level * 0.5);
        }
        
        // Обновление UI
        updateUI();
        renderUpgrades();
        saveUserData();
        
        // Haptic feedback
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('medium');
        }
        
        console.log(`✅ Куплено улучшение: ${upgradeId} (уровень ${upgrade.level})`);
    }
}

// Загрузка данных пользователя
async function loadUserData() {
    try {
        const user = tg.initDataUnsafe?.user;
        if (!user) {
            console.log('⚠️ Пользователь не авторизован');
            updateConnectionStatus('Требуется авторизация', 'error');
            return;
        }
        
        console.log('👤 Загрузка данных пользователя:', user.id);
        
        // Здесь будет запрос к API бота
        // Пока используем локальные данные
        const savedData = localStorage.getItem('magnumClickerData');
        if (savedData) {
            const data = JSON.parse(savedData);
            gameState = { ...gameState, ...data };
            updateUI();
        }
        
        updateConnectionStatus('Подключено к боту', 'connected');
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
        updateConnectionStatus('Ошибка подключения', 'error');
    }
}

// Сохранение данных пользователя
async function saveUserData() {
    try {
        const user = tg.initDataUnsafe?.user;
        if (!user) return;
        
        // Сохраняем локально
        localStorage.setItem('magnumClickerData', JSON.stringify({
            magnumCoins: gameState.magnumCoins,
            stars: gameState.stars,
            clickCount: gameState.clickCount,
            cps: gameState.cps,
            upgrades: gameState.upgrades
        }));
        
        // Здесь будет отправка на сервер
        // await sendDataToServer(user.id, gameState);
        
    } catch (error) {
        console.error('❌ Ошибка сохранения данных:', error);
    }
}

// Обновление статуса подключения
function updateConnectionStatus(message, status) {
    const statusElement = elements.connectionStatus;
    const indicator = statusElement.querySelector('.status-indicator');
    const text = statusElement.querySelector('span');
    
    text.textContent = message;
    indicator.className = `status-indicator ${status}`;
}

// Функция для отправки данных на сервер (будет реализована позже)
async function sendDataToServer(userId, data) {
    // TODO: Реализовать API для синхронизации с ботом
    console.log('📡 Отправка данных на сервер:', { userId, data });
}

// Экспорт функций для отладки
window.gameState = gameState;
window.buyUpgrade = buyUpgrade;