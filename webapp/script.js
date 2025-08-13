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
        
        // Start systems
        startAutoClicker();
        startMiner();
        startProgressBar();
        
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
}

// Handle farming
function handleFarming() {
    // Add coins and experience
    const oldCoins = gameState.magnumCoins;
    gameState.magnumCoins += gameState.cps;
    gameState.clickCount++;
    gameState.experience += 1;
    
    // Show visual feedback
    showBalanceChange('coins', gameState.magnumCoins - oldCoins);
    showFarmingEffect();
    
    // Check level up
    checkLevelUp();
    
    // Update tasks
    updateTasks('click_100', 1);
    updateTasks('first_click', 1);
    updateTasks('click_master', 1);
    
    // Update UI
    updateUI();
    
    // Save data
    if (gameState.clickCount % 5 === 0) {
        saveUserData();
    }
    
    // Haptic feedback
    if (tg?.HapticFeedback) {
        try {
            tg.HapticFeedback.impactOccurred('light');
        } catch (error) {
            console.log('Haptic feedback недоступен');
        }
    }
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
}

// Start animations
function startAnimations() {
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
    let progress = 0;
    
    setInterval(() => {
        progress += 1;
        if (progress > 100) {
            progress = 0;
        }
        
        elements.progressFill.style.width = `${progress}%`;
        
        if (progress === 0) {
            elements.progressText.textContent = 'Готов к фарму';
        } else if (progress < 50) {
            elements.progressText.textContent = 'Фармим...';
        } else if (progress < 100) {
            elements.progressText.textContent = 'Почти готово...';
        }
    }, 100);
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
    setInterval(() => {
        if (gameState.minerActive && !document.hidden) {
            const minerIncome = calculateMinerIncome();
            gameState.magnumCoins += minerIncome;
            updateUI();
        }
    }, 60000); // Every minute
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

// Save user data
async function saveUserData() {
    try {
        // Save locally
        localStorage.setItem('magnumStarsWebApp', JSON.stringify(gameState));
        
        // Save to server
        if (userId) {
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