// Инициализация Telegram WebApp (если доступен)
let tg = null;
try {
    tg = window.Telegram?.WebApp;
    if (tg) {
        tg.expand();
        tg.ready();
        console.log('✅ Telegram WebApp API доступен');
    } else {
        console.log('⚠️ Telegram WebApp API недоступен, работаем в автономном режиме');
    }
} catch (error) {
    console.log('⚠️ Ошибка инициализации Telegram WebApp:', error);
}

// Состояние игры
let gameState = {
    magnumCoins: 1000, // Начальные монеты
    stars: 100, // Начальные звезды
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
    console.log('🎮 WebApp загружен');
    initGame();
    setupEventListeners();
    loadUserData();
    startAutoClicker();
    renderUpgrades();
    updateConnectionStatus('WebApp готов к работе', 'connected');
});

// Инициализация игры
function initGame() {
    console.log('🎮 Инициализация WebApp кликера...');
    updateConnectionStatus('Загрузка игры...', 'connecting');
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
    
    // Сохранение данных
    saveUserData();
    
    // Haptic feedback (если доступен)
    if (tg?.HapticFeedback) {
        try {
            tg.HapticFeedback.impactOccurred('light');
        } catch (error) {
            console.log('Haptic feedback недоступен');
        }
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

// Рендеринг улучшений
function renderUpgrades() {
    const upgradeList = elements.upgradeList;
    upgradeList.innerHTML = '';
    
    Object.entries(gameState.upgrades).forEach(([id, upgrade]) => {
        const upgradeElement = document.createElement('div');
        upgradeElement.className = 'upgrade-item';
        upgradeElement.innerHTML = `
            <div class="upgrade-info">
                <div class="upgrade-name">${getUpgradeName(id)}</div>
                <div class="upgrade-level">Уровень: ${upgrade.level}</div>
                <div class="upgrade-cost">Стоимость: ${formatNumber(upgrade.cost)} MC</div>
            </div>
            <button class="upgrade-btn" onclick="buyUpgrade('${id}')" ${gameState.magnumCoins < upgrade.cost ? 'disabled' : ''}>
                Купить
            </button>
        `;
        upgradeList.appendChild(upgradeElement);
    });
}

// Названия улучшений
function getUpgradeName(id) {
    const names = {
        autoClicker: '🤖 Авто-кликер',
        clickPower: '⚡ Сила клика',
        starGenerator: '⭐ Генератор звезд'
    };
    return names[id] || id;
}

// Покупка улучшения
function buyUpgrade(upgradeId) {
    const upgrade = gameState.upgrades[upgradeId];
    
    if (gameState.magnumCoins >= upgrade.cost) {
        gameState.magnumCoins -= upgrade.cost;
        upgrade.level++;
        
        // Пересчет стоимости
        upgrade.cost = Math.floor(upgrade.baseCost * Math.pow(upgrade.multiplier, upgrade.level));
        
        // Обновление CPS для clickPower
        if (upgradeId === 'clickPower') {
            gameState.cps = 1 + upgrade.level;
        }
        
        // Обновление UI
        updateUI();
        renderUpgrades();
        saveUserData();
        
        console.log(`✅ Куплено улучшение: ${getUpgradeName(upgradeId)} (уровень ${upgrade.level})`);
        
        // Haptic feedback
        if (tg?.HapticFeedback) {
            try {
                tg.HapticFeedback.impactOccurred('medium');
            } catch (error) {
                console.log('Haptic feedback недоступен');
            }
        }
    }
}

// Загрузка данных пользователя
function loadUserData() {
    try {
        const savedData = localStorage.getItem('magnumStarsWebApp');
        if (savedData) {
            const data = JSON.parse(savedData);
            gameState = { ...gameState, ...data };
            console.log('📥 Данные загружены из localStorage');
        }
    } catch (error) {
        console.log('❌ Ошибка загрузки данных:', error);
    }
}

// Сохранение данных пользователя
function saveUserData() {
    try {
        localStorage.setItem('magnumStarsWebApp', JSON.stringify(gameState));
    } catch (error) {
        console.log('❌ Ошибка сохранения данных:', error);
    }
}

// Обновление статуса подключения
function updateConnectionStatus(message, status) {
    const statusElement = elements.connectionStatus;
    const indicator = statusElement.querySelector('.status-indicator');
    const text = statusElement.querySelector('span');
    
    text.textContent = message;
    
    // Удаляем старые классы
    indicator.className = 'status-indicator';
    
    // Добавляем новый класс
    if (status === 'connected') {
        indicator.classList.add('connected');
    } else if (status === 'connecting') {
        indicator.classList.add('connecting');
    } else if (status === 'error') {
        indicator.classList.add('error');
    }
}

// Отправка данных на сервер (заглушка для будущей интеграции)
function sendDataToServer() {
    // Здесь будет интеграция с сервером
    console.log('📤 Данные будут отправлены на сервер');
}