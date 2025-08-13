// Инициализация Telegram WebApp (если доступен)
let tg = null;
let userId = null;

try {
    tg = window.Telegram?.WebApp;
    if (tg) {
        tg.expand();
        tg.ready();
        userId = tg.initDataUnsafe?.user?.id;
        console.log('✅ Telegram WebApp API доступен');
        console.log('👤 User ID:', userId);
    } else {
        console.log('⚠️ Telegram WebApp API недоступен, работаем в автономном режиме');
    }
} catch (error) {
    console.log('⚠️ Ошибка инициализации Telegram WebApp:', error);
}

// Состояние игры
let gameState = {
    magnumCoins: 1000,
    stars: 100,
    level: 1,
    experience: 0,
    clickCount: 0,
    cps: 1,
    farmLastUsed: null,
    minerActive: false,
    minerLevel: 1,
    referralsCount: 0,
    referralEarnings: 0,
    achievementsCompleted: 0,
    upgrades: {
        autoClicker: { level: 0, cost: 10, baseCost: 10, multiplier: 1.5 },
        clickPower: { level: 0, cost: 25, baseCost: 25, multiplier: 2 },
        starGenerator: { level: 0, cost: 50, baseCost: 50, multiplier: 2.5 }
    },
    minerUpgrades: {
        efficiency: { level: 0, cost: 100, baseCost: 100, multiplier: 2 },
        capacity: { level: 0, cost: 200, baseCost: 200, multiplier: 2.5 }
    },
    tasks: {
        daily: [
            { id: 'click_100', name: 'Кликер', description: 'Сделайте 100 кликов', target: 100, progress: 0, reward: 50, completed: false },
            { id: 'earn_1000', name: 'Заработок', description: 'Заработайте 1000 MC', target: 1000, progress: 0, reward: 100, completed: false },
            { id: 'farm_5', name: 'Фармер', description: 'Используйте фарм 5 раз', target: 5, progress: 0, reward: 75, completed: false }
        ],
        achievements: [
            { id: 'first_click', name: 'Первый клик', description: 'Сделайте первый клик', target: 1, progress: 0, reward: 25, completed: false },
            { id: 'rich_player', name: 'Богач', description: 'Накопите 10000 MC', target: 10000, progress: 0, reward: 500, completed: false },
            { id: 'click_master', name: 'Мастер кликов', description: 'Сделайте 1000 кликов', target: 1000, progress: 0, reward: 200, completed: false }
        ]
    }
};

// DOM элементы
const elements = {
    magnumCoins: document.getElementById('magnumCoins'),
    stars: document.getElementById('stars'),
    level: document.getElementById('level'),
    clickCount: document.getElementById('clickCount'),
    cps: document.getElementById('cps'),
    clickerBtn: document.getElementById('clickerBtn'),
    upgradeList: document.getElementById('upgradeList'),
    connectionStatus: document.getElementById('connectionStatus'),
    
    // Фарм
    farmCooldown: document.getElementById('farmCooldown'),
    farmReward: document.getElementById('farmReward'),
    farmBtn: document.getElementById('farmBtn'),
    
    // Биржа
    exchangeRate: document.getElementById('exchangeRate'),
    exchangeAmount: document.getElementById('exchangeAmount'),
    exchangeFrom: document.getElementById('exchangeFrom'),
    exchangeResult: document.getElementById('exchangeResult'),
    exchangeResultCurrency: document.getElementById('exchangeResultCurrency'),
    exchangeBtn: document.getElementById('exchangeBtn'),
    
    // Майнер
    minerStatus: document.getElementById('minerStatus'),
    minerIncome: document.getElementById('minerIncome'),
    minerLevel: document.getElementById('minerLevel'),
    minerBtn: document.getElementById('minerBtn'),
    minerUpgradeList: document.getElementById('minerUpgradeList'),
    
    // Рефералы
    referralsCount: document.getElementById('referralsCount'),
    referralEarnings: document.getElementById('referralEarnings'),
    referralLink: document.getElementById('referralLink'),
    copyReferralBtn: document.getElementById('copyReferralBtn'),
    
    // Достижения
    achievementsCompleted: document.getElementById('achievementsCompleted'),
    achievementsTotal: document.getElementById('achievementsTotal'),
    achievementsList: document.getElementById('achievementsList'),
    
    // Настройки
    notificationsToggle: document.getElementById('notificationsToggle'),
    soundToggle: document.getElementById('soundToggle'),
    autoSaveToggle: document.getElementById('autoSaveToggle'),
    resetDataBtn: document.getElementById('resetDataBtn')
};

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎮 WebApp загружен');
    initGame();
    setupEventListeners();
    loadUserData();
    startAutoClicker();
    startMiner();
    updateFarmCooldown();
    renderAllSections();
    updateConnectionStatus('WebApp готов к работе', 'connected');
});

// Инициализация игры
function initGame() {
    console.log('🎮 Инициализация WebApp кликера...');
    updateConnectionStatus('Загрузка игры...', 'connecting');
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Кликер
    elements.clickerBtn.addEventListener('click', handleClick);
    
    // Навигация
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchSection(btn.dataset.section));
    });
    
    // Фарм
    elements.farmBtn.addEventListener('click', handleFarm);
    
    // Биржа
    elements.exchangeAmount.addEventListener('input', updateExchangeResult);
    elements.exchangeFrom.addEventListener('change', updateExchangeResult);
    elements.exchangeBtn.addEventListener('click', handleExchange);
    
    // Майнер
    elements.minerBtn.addEventListener('click', toggleMiner);
    
    // Рефералы
    elements.copyReferralBtn.addEventListener('click', copyReferralLink);
    
    // Задания
    document.querySelectorAll('.task-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTaskTab(tab.dataset.tab));
    });
    
    // Настройки
    elements.resetDataBtn.addEventListener('click', resetData);
    
    // Обработка видимости страницы
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

// Переключение секций
function switchSection(sectionName) {
    // Убираем активный класс со всех кнопок и секций
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
    
    // Добавляем активный класс к выбранной кнопке и секции
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    document.getElementById(`${sectionName}-section`).classList.add('active');
    
    // Обновляем контент секции
    updateSectionContent(sectionName);
}

// Обновление контента секции
function updateSectionContent(sectionName) {
    switch(sectionName) {
        case 'clicker':
            renderUpgrades();
            break;
        case 'farm':
            updateFarmCooldown();
            break;
        case 'exchange':
            updateExchangeRate();
            break;
        case 'miner':
            updateMinerInfo();
            break;
        case 'tasks':
            renderTasks();
            break;
        case 'referrals':
            updateReferralsInfo();
            break;
        case 'achievements':
            renderAchievements();
            break;
        case 'settings':
            updateSettings();
            break;
    }
}

// Обработка клика
function handleClick() {
    // Анимация кнопки
    elements.clickerBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        elements.clickerBtn.style.transform = 'scale(1)';
    }, 100);
    
    // Добавление монет и опыта
    gameState.magnumCoins += gameState.cps;
    gameState.clickCount++;
    gameState.experience += 1;
    
    // Проверка повышения уровня
    checkLevelUp();
    
    // Обновление задач
    updateTasks('click_100', 1);
    updateTasks('first_click', 1);
    updateTasks('click_master', 1);
    
    // Обновление UI
    updateUI();
    
    // Сохранение данных
    saveUserData();
    
    // Haptic feedback
    if (tg?.HapticFeedback) {
        try {
            tg.HapticFeedback.impactOccurred('light');
        } catch (error) {
            console.log('Haptic feedback недоступен');
        }
    }
}

// Проверка повышения уровня
function checkLevelUp() {
    const requiredExp = gameState.level * 100;
    if (gameState.experience >= requiredExp) {
        gameState.level++;
        gameState.experience -= requiredExp;
        
        // Награда за уровень
        const levelReward = gameState.level * 50;
        gameState.magnumCoins += levelReward;
        
        console.log(`🎉 Уровень повышен! Новый уровень: ${gameState.level}`);
        console.log(`💰 Награда за уровень: +${levelReward} MC`);
        
        // Haptic feedback
        if (tg?.HapticFeedback) {
            try {
                tg.HapticFeedback.impactOccurred('heavy');
            } catch (error) {
                console.log('Haptic feedback недоступен');
            }
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

// Майнер
let minerInterval;

function startMiner() {
    minerInterval = setInterval(() => {
        if (gameState.minerActive && !document.hidden) {
            const minerIncome = calculateMinerIncome();
            gameState.magnumCoins += minerIncome;
            updateUI();
        }
    }, 60000); // Каждую минуту
}

function calculateMinerIncome() {
    const baseIncome = 0.01;
    const efficiencyBonus = gameState.minerUpgrades.efficiency.level * 0.005;
    const capacityBonus = gameState.minerUpgrades.capacity.level * 0.01;
    return baseIncome + efficiencyBonus + capacityBonus;
}

function toggleMiner() {
    gameState.minerActive = !gameState.minerActive;
    updateMinerInfo();
    saveUserData();
}

// Фарм
function handleFarm() {
    const now = Date.now();
    const farmCooldown = 10 * 60 * 1000; // 10 минут
    
    if (!gameState.farmLastUsed || (now - gameState.farmLastUsed) >= farmCooldown) {
        const farmReward = 0.01;
        gameState.magnumCoins += farmReward;
        gameState.farmLastUsed = now;
        
        // Обновление задач
        updateTasks('farm_5', 1);
        
        updateUI();
        updateFarmCooldown();
        saveUserData();
        
        console.log(`🌾 Фарм собран! +${farmReward} MC`);
        
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

function updateFarmCooldown() {
    if (!gameState.farmLastUsed) {
        elements.farmCooldown.textContent = 'Готово';
        elements.farmBtn.disabled = false;
        return;
    }
    
    const now = Date.now();
    const farmCooldown = 10 * 60 * 1000;
    const timeLeft = farmCooldown - (now - gameState.farmLastUsed);
    
    if (timeLeft <= 0) {
        elements.farmCooldown.textContent = 'Готово';
        elements.farmBtn.disabled = false;
    } else {
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        elements.farmCooldown.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        elements.farmBtn.disabled = true;
    }
}

// Биржа
function updateExchangeRate() {
    const rate = 0.001; // 1 MC = 0.001 Stars
    elements.exchangeRate.textContent = `1 MC = ${rate} ⭐`;
}

function updateExchangeResult() {
    const amount = parseFloat(elements.exchangeAmount.value) || 0;
    const fromCurrency = elements.exchangeFrom.value;
    const rate = 0.001;
    
    if (fromCurrency === 'mc') {
        const result = amount * rate;
        elements.exchangeResult.textContent = result.toFixed(6);
        elements.exchangeResultCurrency.textContent = 'Stars';
    } else {
        const result = amount / rate;
        elements.exchangeResult.textContent = result.toFixed(2);
        elements.exchangeResultCurrency.textContent = 'MC';
    }
}

function handleExchange() {
    const amount = parseFloat(elements.exchangeAmount.value) || 0;
    const fromCurrency = elements.exchangeFrom.value;
    
    if (amount <= 0) {
        alert('Введите сумму больше 0');
        return;
    }
    
    if (fromCurrency === 'mc') {
        if (amount > gameState.magnumCoins) {
            alert('Недостаточно Magnum Coins');
            return;
        }
        const result = amount * 0.001;
        gameState.magnumCoins -= amount;
        gameState.stars += result;
    } else {
        if (amount > gameState.stars) {
            alert('Недостаточно Stars');
            return;
        }
        const result = amount / 0.001;
        gameState.stars -= amount;
        gameState.magnumCoins += result;
    }
    
    updateUI();
    saveUserData();
    elements.exchangeAmount.value = '';
    updateExchangeResult();
    
    console.log(`🔄 Обмен выполнен: ${amount} ${fromCurrency.toUpperCase()}`);
}

// Задания
function switchTaskTab(tabName) {
    document.querySelectorAll('.task-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.task-list').forEach(list => list.classList.add('hidden'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tasks`).classList.remove('hidden');
}

function updateTasks(taskId, progress) {
    // Обновляем ежедневные задания
    gameState.tasks.daily.forEach(task => {
        if (task.id === taskId && !task.completed) {
            task.progress += progress;
            if (task.progress >= task.target) {
                task.completed = true;
                gameState.magnumCoins += task.reward;
                console.log(`✅ Задание выполнено: ${task.name} (+${task.reward} MC)`);
            }
        }
    });
    
    // Обновляем достижения
    gameState.tasks.achievements.forEach(task => {
        if (task.id === taskId && !task.completed) {
            task.progress += progress;
            if (task.progress >= task.target) {
                task.completed = true;
                gameState.magnumCoins += task.reward;
                gameState.achievementsCompleted++;
                console.log(`🏆 Достижение разблокировано: ${task.name} (+${task.reward} MC)`);
            }
        }
    });
    
    // Обновляем задачи на заработок
    updateTasks('earn_1000', gameState.magnumCoins - (gameState.magnumCoins - progress));
    updateTasks('rich_player', gameState.magnumCoins);
}

function renderTasks() {
    // Рендерим ежедневные задания
    const dailyTasksContainer = document.getElementById('dailyTasks');
    dailyTasksContainer.innerHTML = '';
    
    gameState.tasks.daily.forEach(task => {
        const progressPercent = Math.min((task.progress / task.target) * 100, 100);
        const taskElement = document.createElement('div');
        taskElement.className = `task-item ${task.completed ? 'completed' : ''}`;
        taskElement.innerHTML = `
            <div class="task-name">${task.name}</div>
            <div class="task-description">${task.description}</div>
            <div class="task-progress">
                <div class="task-progress-bar">
                    <div class="task-progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <span>${task.progress}/${task.target}</span>
            </div>
            <div class="task-reward">Награда: ${task.reward} MC</div>
        `;
        dailyTasksContainer.appendChild(taskElement);
    });
    
    // Рендерим достижения
    const achievementTasksContainer = document.getElementById('achievementTasks');
    achievementTasksContainer.innerHTML = '';
    
    gameState.tasks.achievements.forEach(task => {
        const progressPercent = Math.min((task.progress / task.target) * 100, 100);
        const taskElement = document.createElement('div');
        taskElement.className = `task-item ${task.completed ? 'completed' : ''}`;
        taskElement.innerHTML = `
            <div class="task-name">${task.name}</div>
            <div class="task-description">${task.description}</div>
            <div class="task-progress">
                <div class="task-progress-bar">
                    <div class="task-progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <span>${task.progress}/${task.target}</span>
            </div>
            <div class="task-reward">Награда: ${task.reward} MC</div>
        `;
        achievementTasksContainer.appendChild(taskElement);
    });
}

// Рефералы
function updateReferralsInfo() {
    elements.referralsCount.textContent = gameState.referralsCount;
    elements.referralEarnings.textContent = `${gameState.referralEarnings} MC`;
    
    if (userId) {
        elements.referralLink.value = `https://t.me/your_bot?start=${userId}`;
    }
}

function copyReferralLink() {
    elements.referralLink.select();
    document.execCommand('copy');
    alert('Реферальная ссылка скопирована!');
}

// Достижения
function renderAchievements() {
    elements.achievementsCompleted.textContent = gameState.achievementsCompleted;
    elements.achievementsTotal.textContent = gameState.tasks.achievements.length;
    
    elements.achievementsList.innerHTML = '';
    gameState.tasks.achievements.forEach(task => {
        const achievementElement = document.createElement('div');
        achievementElement.className = `achievement-item ${task.completed ? 'completed' : ''}`;
        achievementElement.innerHTML = `
            <div class="achievement-name">${task.name}</div>
            <div class="achievement-description">${task.description}</div>
            <div class="achievement-reward">Награда: ${task.reward} MC</div>
        `;
        elements.achievementsList.appendChild(achievementElement);
    });
}

// Настройки
function updateSettings() {
    // Загружаем настройки из localStorage
    const settings = JSON.parse(localStorage.getItem('magnumStarsSettings') || '{}');
    elements.notificationsToggle.checked = settings.notifications !== false;
    elements.soundToggle.checked = settings.sound !== false;
    elements.autoSaveToggle.checked = settings.autoSave !== false;
}

function resetData() {
    if (confirm('Вы уверены, что хотите сбросить все данные? Это действие нельзя отменить.')) {
        localStorage.removeItem('magnumStarsWebApp');
        localStorage.removeItem('magnumStarsSettings');
        location.reload();
    }
}

// Обновление UI
function updateUI() {
    elements.magnumCoins.textContent = formatNumber(gameState.magnumCoins);
    elements.stars.textContent = formatNumber(gameState.stars);
    elements.level.textContent = gameState.level;
    elements.clickCount.textContent = formatNumber(gameState.clickCount);
    elements.cps.textContent = formatNumber(gameState.cps);
}

// Обновление информации майнера
function updateMinerInfo() {
    elements.minerStatus.textContent = gameState.minerActive ? 'Включен' : 'Выключен';
    elements.minerIncome.textContent = `${calculateMinerIncome().toFixed(3)} MC/мин`;
    elements.minerLevel.textContent = gameState.minerLevel;
    elements.minerBtn.textContent = gameState.minerActive ? '⛏️ Выключить майнер' : '⛏️ Включить майнер';
    elements.minerBtn.className = `miner-btn ${gameState.minerActive ? 'active' : ''}`;
    
    renderMinerUpgrades();
}

// Рендеринг улучшений майнера
function renderMinerUpgrades() {
    elements.minerUpgradeList.innerHTML = '';
    
    Object.entries(gameState.minerUpgrades).forEach(([id, upgrade]) => {
        const upgradeElement = document.createElement('div');
        upgradeElement.className = 'upgrade-item';
        upgradeElement.innerHTML = `
            <div class="upgrade-info">
                <div class="upgrade-name">${getMinerUpgradeName(id)}</div>
                <div class="upgrade-level">Уровень: ${upgrade.level}</div>
                <div class="upgrade-cost">Стоимость: ${formatNumber(upgrade.cost)} MC</div>
            </div>
            <button class="upgrade-btn" onclick="buyMinerUpgrade('${id}')" ${gameState.magnumCoins < upgrade.cost ? 'disabled' : ''}>
                Купить
            </button>
        `;
        elements.minerUpgradeList.appendChild(upgradeElement);
    });
}

function getMinerUpgradeName(id) {
    const names = {
        efficiency: '⚡ Эффективность',
        capacity: '📦 Вместимость'
    };
    return names[id] || id;
}

function buyMinerUpgrade(upgradeId) {
    const upgrade = gameState.minerUpgrades[upgradeId];
    
    if (gameState.magnumCoins >= upgrade.cost) {
        gameState.magnumCoins -= upgrade.cost;
        upgrade.level++;
        
        // Пересчет стоимости
        upgrade.cost = Math.floor(upgrade.baseCost * Math.pow(upgrade.multiplier, upgrade.level));
        
        // Обновление UI
        updateUI();
        updateMinerInfo();
        saveUserData();
        
        console.log(`✅ Куплено улучшение майнера: ${getMinerUpgradeName(upgradeId)} (уровень ${upgrade.level})`);
        
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

// Рендеринг всех секций
function renderAllSections() {
    renderUpgrades();
    renderTasks();
    renderAchievements();
    updateReferralsInfo();
    updateSettings();
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
async function loadUserData() {
    try {
        if (userId) {
            // Загружаем данные с сервера
            const response = await fetch(`/api/webapp/user-data?user_id=${userId}`);
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    gameState.magnumCoins = result.data.magnumCoins;
                    gameState.stars = result.data.stars;
                    gameState.level = result.data.level;
                    gameState.experience = result.data.experience;
                    console.log('📥 Данные загружены с сервера');
                    updateConnectionStatus('Подключено к боту', 'connected');
                }
            } else {
                console.log('⚠️ Не удалось загрузить данные с сервера, используем локальные');
                loadLocalData();
            }
        } else {
            // Загружаем локальные данные
            loadLocalData();
        }
    } catch (error) {
        console.log('❌ Ошибка загрузки данных:', error);
        loadLocalData();
    }
}

// Загрузка локальных данных
function loadLocalData() {
    try {
        const savedData = localStorage.getItem('magnumStarsWebApp');
        if (savedData) {
            const data = JSON.parse(savedData);
            gameState = { ...gameState, ...data };
            console.log('📥 Данные загружены из localStorage');
        }
        updateConnectionStatus('Автономный режим', 'connected');
    } catch (error) {
        console.log('❌ Ошибка загрузки локальных данных:', error);
        updateConnectionStatus('Ошибка загрузки', 'error');
    }
}

// Сохранение данных пользователя
async function saveUserData() {
    try {
        // Сохраняем локально
        localStorage.setItem('magnumStarsWebApp', JSON.stringify(gameState));
        
        // Синхронизируем с сервером если есть userId
        if (userId) {
            const response = await fetch('/api/webapp/update-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: userId,
                    magnumCoins: gameState.magnumCoins,
                    stars: gameState.stars,
                    level: gameState.level,
                    experience: gameState.experience
                })
            });
            
            if (response.ok) {
                console.log('📤 Данные синхронизированы с сервером');
            } else {
                console.log('⚠️ Ошибка синхронизации с сервером');
            }
        }
    } catch (error) {
        console.log('❌ Ошибка сохранения данных:', error);
    }
}

// Обработка изменения видимости страницы
function handleVisibilityChange() {
    if (document.hidden) {
        console.log('📱 Страница скрыта, авто-кликер приостановлен');
        // Сохраняем данные при скрытии страницы
        saveUserData();
    } else {
        console.log('📱 Страница видна, авто-кликер возобновлен');
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

// Периодическая синхронизация с сервером
setInterval(() => {
    if (userId && !document.hidden) {
        saveUserData();
    }
}, 30000); // Синхронизация каждые 30 секунд

// Обновление фарма каждую секунду
setInterval(() => {
    updateFarmCooldown();
}, 1000);