// ===== PREMIUM MAGNUM STARS WEBAPP =====

// Global variables
let userId = null;
let username = 'Пользователь';
let tg = null;

// Game state
const gameState = {
    magnumCoins: 1000,
    stars: 0,
    level: 1,
    experience: 0,
    clickCount: 0,
    cps: 1,
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
    },
    settings: {
        notifications: true,
        sound: true,
        autoSave: true
    }
};

// DOM elements
const elements = {
    // Header
    starsValue: document.getElementById('stars-value'),
    coinsValue: document.getElementById('coins-value'),
    userName: document.getElementById('user-name'),
    userLevel: document.getElementById('user-level'),
    expFill: document.getElementById('exp-fill'),
    
    // Farming
    farmingBtn: document.getElementById('farming-btn'),
    progressFill: document.getElementById('progress-fill'),
    progressText: document.getElementById('progress-text'),
    todayEarned: document.getElementById('today-earned'),
    totalEarned: document.getElementById('total-earned'),
    
    // Miner
    minerStatus: document.getElementById('miner-status'),
    minerIncome: document.getElementById('miner-income'),

    // Exchange
    exchangeRateText: document.getElementById('exchange-rate'),
    exchangeAmount: document.getElementById('exchange-amount'),
    exchangeFrom: document.getElementById('exchange-from'),
    exchangeResult: document.getElementById('exchange-result'),
    exchangeBtn: document.getElementById('exchange-btn'),
    
    // Referrals
    referralLinkInput: document.getElementById('referral-link'),
    copyReferralBtn: document.getElementById('copy-referral-btn'),
    
    // Navigation
    navItems: document.querySelectorAll('.nav-item'),
    
    // Sections
    contentSections: document.querySelectorAll('.content-section'),
    
    // Notifications
    notificationsContainer: document.getElementById('notifications-container'),
    confettiContainer: document.getElementById('confetti-container')
};

// Starfield Animation
class Starfield {
    constructor() {
        this.canvas = document.getElementById('starfield');
        this.ctx = this.canvas.getContext('2d');
        this.stars = [];
        this.mouseX = 0;
        this.mouseY = 0;
        
        this.init();
        this.animate();
    }
    
    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        document.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });
        
        // Create stars
        for (let i = 0; i < 200; i++) {
            this.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2,
                speed: Math.random() * 0.5 + 0.1,
                opacity: Math.random() * 0.8 + 0.2
            });
        }
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Parallax effect
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.stars.forEach(star => {
            // Move stars
            star.y += star.speed;
            if (star.y > this.canvas.height) {
                star.y = 0;
                star.x = Math.random() * this.canvas.width;
            }
            
            // Parallax effect
            const deltaX = (this.mouseX - centerX) * 0.01;
            const deltaY = (this.mouseY - centerY) * 0.01;
            
            const x = star.x + deltaX;
            const y = star.y + deltaY;
            
            // Draw star
            this.ctx.beginPath();
            this.ctx.arc(x, y, star.size, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255, 215, 0, ${star.opacity})`;
            this.ctx.fill();
            
            // Add glow effect
            this.ctx.shadowColor = '#FFD700';
            this.ctx.shadowBlur = star.size * 2;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        });
        
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize starfield
let starfield;

// Initialize WebApp
async function initWebApp() {
    try {
        console.log('🚀 Инициализация премиального WebApp...');
        
        // Initialize starfield
        starfield = new Starfield();
        
        // Get Telegram WebApp data
        if (window.Telegram && window.Telegram.WebApp) {
            tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                userId = tg.initDataUnsafe.user.id;
                username = tg.initDataUnsafe.user.first_name || 'Пользователь';
                console.log('🔗 Telegram WebApp подключен:', { userId, username });
            }
        }
        
        // Initialize game
        await initGame();
        
        // Setup event listeners
        setupEventListeners();
        
        // Start animations
        startAnimations();
        
        console.log('✅ WebApp инициализирован');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации WebApp:', error);
    }
}

// Initialize game
async function initGame() {
    try {
        // Load user data
        if (userId) {
            await loadUserData();
        } else {
            loadLocalData();
        }
        
        // Update UI
        updateUI();
        
        // Init feature modules
        initUpgrades();
        initTasks();
        
        // Start systems
        startAutoClicker();
        startMiner();
        startProgressBar();

        // Если сервер вернул кулдаун
        if (typeof window.__farmCooldownMs === 'number') {
            farmCooldownMs = window.__farmCooldownMs;
        }
        if (typeof window.__farmNextAvailableAt === 'number' && Date.now() < window.__farmNextAvailableAt) {
            farmNextAvailableAt = window.__farmNextAvailableAt;
            startFarmCooldownProgress();
        }
        
        // Telegram MainButton => Tasks
        if (tg && tg.MainButton) {
            try {
                tg.MainButton.setText('Задания');
                tg.MainButton.show();
                tg.MainButton.onClick(() => switchSection('tasks'));
            } catch (e) {}
        }
        
        console.log('🎮 Игра инициализирована');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации игры:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Farming button
    elements.farmingBtn.addEventListener('click', handleFarming);
    
    // Navigation
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => switchSection(item.dataset.section));
    });
    
    // Touch events for mobile
    elements.farmingBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        elements.farmingBtn.style.transform = 'scale(0.95)';
    });
    
    elements.farmingBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        elements.farmingBtn.style.transform = 'scale(1)';
        handleFarming();
    });

    // Miner toggle
    const minerToggleBtn = document.getElementById('miner-toggle-btn');
    if (minerToggleBtn) {
        minerToggleBtn.addEventListener('click', async () => {
            gameState.minerActive = !gameState.minerActive;
            try {
                if (userId) {
                    await fetch('/api/webapp/miner/toggle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, active: gameState.minerActive })
                    });
                }
                updateUI();
                saveUserData();
            } catch (e) { console.log('miner toggle error', e); }
        });
    }

    // Settings toggles
    const notif = document.getElementById('notifications-toggle');
    const sound = document.getElementById('sound-toggle');
    const autos = document.getElementById('auto-save-toggle');
    [notif, sound, autos].forEach((el, idx) => {
        if (!el) return;
        el.addEventListener('change', () => {
            if (idx === 0) gameState.settings.notifications = el.checked;
            if (idx === 1) gameState.settings.sound = el.checked;
            if (idx === 2) gameState.settings.autoSave = el.checked;
            localStorage.setItem('magnumStarsWebApp', JSON.stringify(gameState));
        });
    });
}

// Handle farming with server cooldown and UI lock
let farmLock = false;
let farmCooldownMs = 5000;
let farmNextAvailableAt = 0;

async function handleFarming() {
    if (farmLock) return;
    const now = Date.now();
    if (now < farmNextAvailableAt) return;

    farmLock = true;

    try {
        if (!navigator.onLine) {
            showNotification('🚫 Нет соединения. Попробуйте позже', 'warning');
            farmLock = false;
            return;
        }
        if (!userId) {
            // fallback оффлайн
            localFarm();
            farmLock = false;
            return;
        }
        const resp = await fetch('/api/webapp/farm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        if (resp.status === 429) {
            const data = await resp.json();
            farmCooldownMs = data.farmCooldownMs;
            farmNextAvailableAt = data.nextAvailableAt;
            startFarmCooldownProgress();
            farmLock = false;
            return;
        }
        const data = await resp.json();
        if (data.success) {
            const oldCoins = gameState.magnumCoins;
            gameState.magnumCoins = data.magnumCoins;
            gameState.clickCount += 1;
            gameState.experience += 1;
            farmCooldownMs = data.farmCooldownMs;
            farmNextAvailableAt = data.nextAvailableAt;

            showBalanceChange('coins', gameState.magnumCoins - oldCoins);
            showFarmingEffect();
            checkLevelUp();
            updateTasks('click_100', 1);
            updateTasks('first_click', 1);
            updateTasks('click_master', 1);
            updateUI();
            startFarmCooldownProgress();
            saveUserData();
        }
    } catch (e) {
        console.log('❌ Ошибка фарма:', e);
        localFarm();
    } finally {
        farmLock = false;
    }
}

function localFarm() {
    const oldCoins = gameState.magnumCoins;
    gameState.magnumCoins += gameState.cps;
    gameState.clickCount++;
    gameState.experience += 1;
    showBalanceChange('coins', gameState.magnumCoins - oldCoins);
    showFarmingEffect();
    checkLevelUp();
    updateTasks('click_100', 1);
    updateTasks('first_click', 1);
    updateTasks('click_master', 1);
    updateUI();
    saveUserData();
}

// Show farming effect
function showFarmingEffect() {
    // Button animation
    elements.farmingBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        elements.farmingBtn.style.transform = 'scale(1)';
    }, 100);
    
    // Glow effect
    const glow = elements.farmingBtn.querySelector('.button-glow');
    glow.style.opacity = '1';
    setTimeout(() => {
        glow.style.opacity = '0';
    }, 300);
    
    // Particle effect
    createParticles(elements.farmingBtn);
}

// Create particles
function createParticles(element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    for (let i = 0; i < 10; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            position: fixed;
            left: ${centerX}px;
            top: ${centerY}px;
            width: 4px;
            height: 4px;
            background: var(--color-gold);
            border-radius: 50%;
            pointer-events: none;
            z-index: 1000;
            animation: particleExplosion 0.6s ease-out forwards;
        `;
        
        document.body.appendChild(particle);
        
        setTimeout(() => {
            particle.remove();
        }, 600);
    }
}

// Show balance change
function showBalanceChange(type, amount) {
    const element = type === 'coins' ? elements.coinsValue : elements.starsValue;
    const oldValue = element.textContent;
    const newValue = formatNumber(parseFloat(oldValue.replace(/,/g, '')) + amount);
    
    // Animate number change
    animateNumberChange(element, oldValue, newValue);
    
    // Show floating text
    showFloatingText(element, amount > 0 ? `+${formatNumber(amount)}` : formatNumber(amount));
}

// Animate number change
function animateNumberChange(element, from, to) {
    const fromNum = parseFloat(from.replace(/,/g, ''));
    const toNum = parseFloat(to.replace(/,/g, ''));
    const duration = 500;
    const startTime = Date.now();
    
    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const current = fromNum + (toNum - fromNum) * easeOutQuart(progress);
        element.textContent = formatNumber(Math.floor(current));
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    update();
}

// Easing function
function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
}

// Show floating text
function showFloatingText(element, text) {
    const rect = element.getBoundingClientRect();
    const floatingText = document.createElement('div');
    floatingText.textContent = text;
    floatingText.style.cssText = `
        position: fixed;
        left: ${rect.right}px;
        top: ${rect.top}px;
        color: var(--color-gold);
        font-weight: 600;
        font-size: 14px;
        pointer-events: none;
        z-index: 1000;
        animation: floatingText 1s ease-out forwards;
    `;
    
    document.body.appendChild(floatingText);
    
    setTimeout(() => {
        floatingText.remove();
    }, 1000);
}

// Check level up
function checkLevelUp() {
    const requiredExp = gameState.level * 100;
    if (gameState.experience >= requiredExp) {
        gameState.level++;
        gameState.experience -= requiredExp;
        
        // Level up reward
        const levelReward = gameState.level * 50;
        gameState.magnumCoins += levelReward;
        
        console.log(`🎉 Уровень повышен! Новый уровень: ${gameState.level}`);
        console.log(`💰 Награда за уровень: +${levelReward} MC`);
        
        // Show level up effect
        showLevelUpEffect(levelReward);
        
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

// Show level up effect
function showLevelUpEffect(reward) {
    // Show notification
    showNotification(`🎉 Уровень повышен! +${reward} MC`, 'success');
    
    // Create confetti
    createConfetti();
    
    // Update UI
    updateUI();
}

// Create confetti
function createConfetti() {
    const colors = ['#FFD700', '#FFE55C', '#FFB800', '#00E5FF', '#33EAFF'];
    
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.cssText = `
            left: ${Math.random() * 100}%;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            animation-delay: ${Math.random() * 0.5}s;
            animation-duration: ${Math.random() * 2 + 2}s;
        `;
        
        elements.confettiContainer.appendChild(confetti);
        
        setTimeout(() => {
            confetti.remove();
        }, 4000);
    }
}

// Switch section
function switchSection(sectionName) {
    // Update navigation
    elements.navItems.forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    
    // Update content
    elements.contentSections.forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${sectionName}-section`).classList.add('active');
    
    // Haptic feedback
    if (tg?.HapticFeedback) {
        try {
            tg.HapticFeedback.impactOccurred('light');
        } catch (error) {
            console.log('Haptic feedback недоступен');
        }
    }
}

// Update UI
function updateUI() {
    // Update balances
    elements.starsValue.textContent = formatNumber(gameState.stars);
    elements.coinsValue.textContent = formatNumber(gameState.magnumCoins);
    
    // Update user info
    elements.userName.textContent = username;
    elements.userLevel.textContent = gameState.level;
    
    // Update experience bar
    const requiredExp = gameState.level * 100;
    const expPercentage = (gameState.experience / requiredExp) * 100;
    elements.expFill.style.width = `${expPercentage}%`;
    
    // Update statistics
    elements.todayEarned.textContent = formatNumber(gameState.clickCount * gameState.cps);
    elements.totalEarned.textContent = formatNumber(gameState.magnumCoins);

    // Miner UI
    if (elements.minerStatus && elements.minerIncome) {
        elements.minerStatus.textContent = gameState.minerActive ? 'Активен' : 'Неактивен';
        const income = calculateMinerIncome();
        elements.minerIncome.textContent = `${income} MC/мин`;
    }
}

// Start animations
function startAnimations() {
    initExchange();
    initReferrals();

    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes particleExplosion {
            0% {
                transform: translate(0, 0) scale(1);
                opacity: 1;
            }
            100% {
                transform: translate(${Math.random() * 200 - 100}px, ${Math.random() * 200 - 100}px) scale(0);
                opacity: 0;
            }
        }
        
        @keyframes floatingText {
            0% {
                transform: translateY(0);
                opacity: 1;
            }
            100% {
                transform: translateY(-50px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// Start progress bar
function startProgressBar() {
    // оставим декоративную анимацию без таймеров для батареи
}

function startFarmCooldownProgress() {
    const btn = elements.farmingBtn;
    const fill = elements.progressFill;
    const text = elements.progressText;
    const start = Date.now();
    const end = farmNextAvailableAt;

    btn.disabled = true;
    btn.style.opacity = '0.6';

    function tick() {
        const now = Date.now();
        const total = Math.max(1, farmCooldownMs);
        const elapsed = Math.min(total, now - start);
        const pct = Math.min(100, Math.floor((elapsed / total) * 100));
        fill.style.transform = `scaleX(${pct/100})`;
        const leftMs = Math.max(0, end - now);
        if (leftMs <= 0) {
            text.textContent = 'Готов к фарму';
            btn.disabled = false;
            btn.style.opacity = '1';
            fill.style.transform = 'scaleX(1)';
            setTimeout(() => { fill.style.transform = 'scaleX(0)'; }, 150);
            return;
        }
        text.textContent = `Ожидание: ${(leftMs / 1000).toFixed(1)} c`;
        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}

// Start auto clicker
function startAutoClicker() {
    setInterval(() => {
        if (!document.hidden && gameState.upgrades.autoClicker.level > 0) {
            const autoClickerBonus = gameState.upgrades.autoClicker.level * 0.1;
            gameState.magnumCoins += autoClickerBonus;
            updateUI();
        }
    }, 1000);
}

// Start miner
function startMiner() {
    // Клиентский таймер отключен, сервер начисляет пассив
}

// Calculate miner income
function calculateMinerIncome() {
    const baseIncome = 1;
    const efficiencyBonus = gameState.minerUpgrades.efficiency.level * 0.5;
    const capacityBonus = gameState.minerUpgrades.capacity.level * 0.3;
    return baseIncome + efficiencyBonus + capacityBonus;
}

// Update tasks
function updateTasks(taskId, amount) {
    // Update daily tasks
    gameState.tasks.daily.forEach(task => {
        if (task.id === taskId && !task.completed) {
            task.progress += amount;
            if (task.progress >= task.target) {
                task.completed = true;
                gameState.magnumCoins += task.reward;
                showNotification(`✅ Задание выполнено! +${task.reward} MC`, 'success');
            }
        }
    });
    
    // Update achievement tasks
    gameState.tasks.achievements.forEach(task => {
        if (task.id === taskId && !task.completed) {
            task.progress += amount;
            if (task.progress >= task.target) {
                task.completed = true;
                gameState.achievementsCompleted++;
                gameState.magnumCoins += task.reward;
                showNotification(`🏆 Достижение разблокировано! +${task.reward} MC`, 'success');
                createConfetti();
            }
        }
    });
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'times-circle'}"></i>
        <span>${message}</span>
    `;
    
    elements.notificationsContainer.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Format number
function formatNumber(num) {
    return new Intl.NumberFormat('ru-RU').format(Math.floor(num));
}

// Load user data
async function loadUserData() {
    try {
        if (userId) {
            const response = await fetch(`/api/webapp/user-data?user_id=${userId}`);
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    Object.assign(gameState, result.data);
                    if (result.data.farmCooldownMs) window.__farmCooldownMs = result.data.farmCooldownMs;
                    if (result.data.lastFarmAt) {
                        const fc = result.data.farmCooldownMs || farmCooldownMs;
                        const nextAt = new Date(result.data.lastFarmAt).getTime() + fc;
                        window.__farmNextAvailableAt = nextAt;
                    }
                    console.log('📥 Данные загружены с сервера');
                }
            }
        }
    } catch (error) {
        console.log('❌ Ошибка загрузки данных:', error);
        loadLocalData();
    }
}

// Load local data
function loadLocalData() {
    try {
        const savedData = localStorage.getItem('magnumStarsWebApp');
        if (savedData) {
            const data = JSON.parse(savedData);
            Object.assign(gameState, data);
            console.log('📥 Данные загружены из localStorage');
        }
    } catch (error) {
        console.log('❌ Ошибка загрузки локальных данных:', error);
    }
}

// Save user data (debounced)
let __lastSaveAt = 0;
async function saveUserData() {
    try {
        // Save locally
        localStorage.setItem('magnumStarsWebApp', JSON.stringify(gameState));
        
        // Throttle server saves
        const now = Date.now();
        if (!userId || now - __lastSaveAt < 5000) return;
        __lastSaveAt = now;

        const response = await fetch('/api/webapp/update-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: userId,
                ...gameState
            })
        });
        
        if (response.ok) {
            console.log('📤 Данные синхронизированы с сервером');
        }
    } catch (error) {
        console.log('❌ Ошибка сохранения данных:', error);
    }
}

// Handle visibility change
function handleVisibilityChange() {
    if (document.hidden) {
        console.log('📱 Страница скрыта');
        saveUserData();
    } else {
        console.log('📱 Страница видна');
    }
}

// Event listeners
document.addEventListener('visibilitychange', handleVisibilityChange);

// Initialize WebApp when DOM is loaded
document.addEventListener('DOMContentLoaded', initWebApp);

// Export for debugging
window.gameState = gameState;
window.elements = elements;

async function initExchange(){
    try{
        // load rate
        const r = await fetch('/api/webapp/exchange-rate');
        const j = await r.json();
        if(j?.success && elements.exchangeRateText){
            elements.exchangeRateText.textContent = (j.rate||1).toFixed(6);
        }
        // listeners
        if (elements.exchangeAmount && elements.exchangeFrom && elements.exchangeResult){
            const updatePreview = ()=>{
                const amount = Number(elements.exchangeAmount.value||0);
                const from = elements.exchangeFrom.value;
                const rate = Number(elements.exchangeRateText?.textContent||1);
                const commission = 0.025;
                if(!amount||amount<=0){ elements.exchangeResult.textContent = '0'; return; }
                let out = 0;
                if(from==='mc') out = amount*rate*(1-commission); else out = (amount/rate)*(1-commission);
                elements.exchangeResult.textContent = out.toFixed(6);
            };
            elements.exchangeAmount.addEventListener('input', updatePreview);
            elements.exchangeFrom.addEventListener('change', updatePreview);
            updatePreview();
        }
        if (elements.exchangeBtn){
            elements.exchangeBtn.addEventListener('click', async ()=>{
                try{
                    const amount = Number(elements.exchangeAmount.value||0);
                    const from = elements.exchangeFrom.value;
                    if (!userId){ showNotification('Авторизуйтесь в Telegram WebApp','warning'); return; }
                    if (!amount||amount<=0){ return; }
                    const resp = await fetch('/api/webapp/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,from,amount})});
                    const jj = await resp.json();
                    if (jj.success){
                        gameState.magnumCoins = jj.magnumCoins;
                        gameState.stars = jj.stars;
                        updateUI();
                        elements.exchangeAmount.value = '';
                        elements.exchangeResult.textContent = '0';
                        if (elements.exchangeRateText) elements.exchangeRateText.textContent = (jj.rate||1).toFixed(6);
                        showNotification('Обмен выполнен','success');
                    } else {
                        showNotification('Ошибка обмена','error');
                    }
                }catch(e){ showNotification('Ошибка обмена','error'); }
            });
        }
    }catch{}
}

async function initReferrals(){
    try{
        if (!elements.referralLinkInput || !elements.copyReferralBtn) return;
        const info = await fetch('/api/bot-info').then(r=>r.json()).catch(()=>({success:false}));
        const bot = info?.username;
        if (userId && bot){
            const link = `https://t.me/${bot}?start=${userId}`;
            elements.referralLinkInput.value = link;
            elements.copyReferralBtn.addEventListener('click', async ()=>{
                try{ await navigator.clipboard.writeText(link); showNotification('Ссылка скопирована','success'); }catch{}
            });
        }
    }catch{}
}

function initUpgrades(){
    const grid = document.getElementById('upgrades-grid');
    if (!grid) return;
    const render = ()=>{
        grid.innerHTML = '';
        const entries = Object.entries(gameState.upgrades);
        entries.forEach(([key, up])=>{
            const card = document.createElement('div');
            card.className = 'glass-card';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
                    <div>
                        <div style="font-weight:700;text-transform:capitalize;">${key}</div>
                        <div style="color:#aaa;font-size:12px;">Уровень: ${up.level}</div>
                    </div>
                    <button class="btn" data-up="${key}">Купить за ${up.cost} MC</button>
                </div>
            `;
            grid.appendChild(card);
        });
        grid.querySelectorAll('button[data-up]').forEach(btn=>{
            btn.addEventListener('click', async (e)=>{
                const k = e.currentTarget.getAttribute('data-up');
                const up = gameState.upgrades[k];
                if (gameState.magnumCoins < up.cost) { showNotification('Недостаточно MC','warning'); return; }
                gameState.magnumCoins -= up.cost;
                up.level += 1;
                up.cost = Math.floor(up.baseCost * Math.pow(up.multiplier, up.level));
                if (k === 'clickPower') gameState.cps = Math.max(1, gameState.cps) + 1;
                updateUI();
                saveUserData();
                render();
            });
        });
    };
    render();
}

function initTasks(){
    // Daily/achievements will be rendered server-side later; here only claim flows could be wired to buttons if present.
}