const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gridSize = 20;
const tileCount = 30;

let snake = [
    {x: 3, y: 1},
    {x: 2, y: 1},
    {x: 1, y: 1},
];
let food = {x: 5, y: 5};
let dx = 1;
let dy = 0;
let score = 0;
let gameLoop;
let gameStarted = false;
let playerName = localStorage.getItem('playerName') || '';
let lastGameEndTime = 0;
let countdownTimer = null;
let personalBestScore = 0;
let isAIPlaying = false;
let aiGameLoop;
let aiStartTimeout = null;
let gameSteps = [];
let isReplaying = false;
let lastDirectionChange = 0;
let replayTimer = null;

// 添加鼓励语数组
const encouragements = [
    { text: "再接再厉，超越自我！", emoji: "💪" },
    { text: "加油！下一把一定能创造新纪录！", emoji: "🚀" },
    { text: "继续努力，你离最高分越来越近了！", emoji: "⭐" },
    { text: "不错的表现，继续保持这个势头！", emoji: "🌟" },
    { text: "相信自己，你可以做得更好！", emoji: "✨" },
    { text: "胜败乃兵家常事，重要的是永不言弃！", emoji: "🔥" },
    { text: "每一次尝试都是进步的机会！", emoji: "📈" },
    { text: "失败是成功之母，继续加油！", emoji: "💫" },
    { text: "看好你哦，下一把一定更精彩！", emoji: "🎯" },
    { text: "这个分数已经很厉害了！", emoji: "👏" }
];

// 添加庆祝语数组
const celebrations = [
    { text: "太厉害了！你创造了新的传奇！", emoji: "👑" },
    { text: "破纪录啦！这就是实力的象征！", emoji: "🏆" },
    { text: "哇！这个分数简直是神级表现！", emoji: "✨" },
    { text: "新纪录诞生的瞬间，就是传奇开始的时刻！", emoji: "🌟" },
    { text: "这波操作，简直完美！", emoji: "💫" },
    { text: "这个分数，已经超越了自我！", emoji: "🚀" },
    { text: "天啊！这真是令人惊叹的表现！", emoji: "🎯" },
    { text: "这就是王者的实力！无人能及！", emoji: "👊" },
    { text: "新纪录！你就是最闪亮的星！", emoji: "⭐" },
    { text: "这个分数，足以载入史册！", emoji: "📚" },
    { text: "登峰造极！这就是巅峰的感觉！", emoji: "🏔️" },
    { text: "破纪录的瞬间，就是王者的诞生！", emoji: "👑" },
    { text: "这个分数，简直就是艺术品！", emoji: "🎨" },
    { text: "无与伦比的表现！你就是最强的！", emoji: "💪" },
    { text: "这一刻，你就是贪吃蛇界的传奇！", emoji: "🐍" },
    { text: "新纪录！这就是冠军的实力！", emoji: "🏅" },
    { text: "太棒了！你创造了新的可能！", emoji: "🌈" },
    { text: "这个分数，将永远被铭记！", emoji: "💎" },
    { text: "破纪录的感觉真好！继续保持！", emoji: "🔥" },
    { text: "这就是实力的证明！无人能敌！", emoji: "🌠" }
];

// 添加反外挂检测相关常量和变量
const ANTI_CHEAT = {
    MAX_SCORE_PER_FOOD: 10,
    MIN_MOVE_INTERVAL: 50,  // 最小移动间隔（毫秒）
    MAX_PERFECT_MOVES: 50,  // 连续完美移动的最大次数
    DIRECTION_CHANGE_MIN_INTERVAL: 30  // 方向改变最小间隔（毫秒）
};

let lastMoveTime = 0;
let perfectMoveCount = 0;
let lastKeyPressTime = 0;
let suspiciousActions = [];
let gameStartTime = 0;
let moveHistory = [];

// 修改反外挂检测类
class AntiCheatSystem {
    constructor() {
        this.violations = [];
        this.checkInterval = null;
        this.lastCheckTime = Date.now();
        this.protectedFunctions = ['changeDirection', 'generateFood'];  // 减少监控的函数
        this.originalFunctions = new Map();
    }

    // 初始化检测
    init() {
        this.violations = []; // 重置违规记录
        this.startPeriodicChecks();
        return this.isGameEnvironmentSafe();
    }

    // 开始周期性检查
    startPeriodicChecks() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        
        this.lastCheckTime = Date.now();
        this.checkInterval = setInterval(() => {
            const now = Date.now();
            const timeDiff = now - this.lastCheckTime;
            
            // 放宽时间检查标准
            if (timeDiff > 2000 && timeDiff < 10000) {
                console.warn('Suspicious time gap detected, but allowing game to continue');
            }
            
            this.lastCheckTime = now;
        }, 1000);
    }

    // 检查游戏环境
    isGameEnvironmentSafe() {
        // 检查是否在iframe中运行
        if (window !== window.top) {
            this.violations.push('Game running in iframe');
            return false;
        }

        // 检查是否存在常见的作弊工具
        const cheatTools = ['CheatEngine', 'Tampermonkey', 'Greasemonkey'];
        for (const tool of cheatTools) {
            if (window[tool]) {
                this.violations.push(`Cheat tool detected: ${tool}`);
                return false;
            }
        }

        return true;
    }

    // 检查游戏行为
    validateGameplay(moveData) {
        const now = Date.now();
        
        // 放宽移动间隔检查
        if (now - lastMoveTime < ANTI_CHEAT.MIN_MOVE_INTERVAL / 2) {
            console.warn('Movement too fast, but allowing game to continue');
        }

        // 检查完美移动
        if (this.isPerfectMove(moveData)) {
            perfectMoveCount++;
            if (perfectMoveCount > ANTI_CHEAT.MAX_PERFECT_MOVES * 2) {
                this.violations.push('Too many perfect moves');
                return false;
            }
        } else {
            perfectMoveCount = 0;
        }

        // 记录移动历史
        moveHistory.push({
            time: now,
            position: moveData.position,
            direction: moveData.direction
        });

        // 保持最近的移动记录
        if (moveHistory.length > 100) {
            moveHistory.shift();
        }

        lastMoveTime = now;
        return true;
    }

    // 检查是否是完美移动
    isPerfectMove(moveData) {
        const distanceToFood = Math.abs(moveData.position.x - food.x) + 
                             Math.abs(moveData.position.y - food.y);
        const isOptimalDirection = 
            (food.x > moveData.position.x && moveData.direction.x > 0) ||
            (food.x < moveData.position.x && moveData.direction.x < 0) ||
            (food.y > moveData.position.y && moveData.direction.y > 0) ||
            (food.y < moveData.position.y && moveData.direction.y < 0);

        return isOptimalDirection && distanceToFood < distanceToFood;
    }

    // 检测可疑的移动模式
    detectSuspiciousPattern() {
        if (moveHistory.length < 50) return false;

        // 检查重复模式
        const pattern = moveHistory.slice(-20);
        const patternString = JSON.stringify(pattern);
        const fullString = JSON.stringify(moveHistory.slice(-40));
        
        return fullString.includes(patternString.repeat(2));
    }

    // 验证游戏分数
    validateScore(currentScore, foodEaten) {
        return currentScore <= foodEaten * ANTI_CHEAT.MAX_SCORE_PER_FOOD;
    }

    // 获取违规记录
    getViolations() {
        return this.violations;
    }

    // 清理
    cleanup() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        moveHistory = [];
        this.violations = [];
        perfectMoveCount = 0;
        lastMoveTime = 0;
    }
}

// 创建反外挂系统实例
const antiCheat = new AntiCheatSystem();

document.addEventListener('keydown', changeDirection);
// 初始化游戏状态
resetGame();
// 绘制初始状态
draw();

// 获取玩家历史最高分
async function getPersonalBestScore() {
    try {
        const response = await fetch('/get-scores');
        if (!response.ok) {
            throw new Error('获取分数失败');
        }
        const scores = await response.json();
        // 在所有分数中找到当前玩家的最高分
        const playerScores = scores.filter(s => s.name === playerName);
        if (playerScores.length > 0) {
            personalBestScore = Math.max(...playerScores.map(s => s.score));
        }
    } catch (error) {
        console.error('获取历史最高分失败:', error);
    }
}

// 提交玩家名字
function submitName() {
    const nameInput = document.getElementById('playerName');
    const name = nameInput.value.trim();
    if (!name) {
        alert('请输入昵称！');
        return;
    }
    
    setPlayerName(name);
    showGameContainer();
}

// 添加设置玩家名称的函数
function setPlayerName(name) {
    playerName = name;
    localStorage.setItem('playerName', name);
    
    // 更新显示
    const currentPlayerName = document.getElementById('currentPlayerName');
    if (currentPlayerName) {
        currentPlayerName.textContent = name;
    }
}

// 修改更换昵称的函数
function changeName() {
    // 清除本地存储的昵称
    localStorage.removeItem('playerName');
    playerName = '';
    
    // 重置游戏状态
    if (gameLoop) {
        clearInterval(gameLoop);
        gameLoop = null;
    }
    if (countdownTimer) {
        clearTimeout(countdownTimer);
        countdownTimer = null;
    }
    gameStarted = false;
    
    // 重新获取新的 sessionId
    fetch('/')
        .then(response => response.text())
        .then(html => {
            // 使用正则表达式提取 sessionId
            const match = html.match(/const sessionId = "([^"]+)"/);
            if (match && match[1]) {
                sessionId = match[1];
            } else {
                console.error('无法从响应中提取 sessionId');
                // 如果无法获取新的 sessionId，则刷新页面
                window.location.reload();
                return;
            }
        })
        .catch(error => {
            console.error('获取新 sessionId 失败:', error);
            // 出错时刷新页面
            window.location.reload();
        });
    
    // 重置欢迎界面
    const welcomeScreen = document.getElementById('welcomeScreen');
    welcomeScreen.style.cssText = `
        display: flex;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #f0f0f0;
        justify-content: center;
        align-items: center;
        z-index: 9999;
    `;
    
    // 隐藏其他界面
    document.getElementById('gameContainer').style.display = 'none';
    document.getElementById('gameOver').style.display = 'none';
    
    // 清空昵称输入框
    const nameInput = document.getElementById('playerName');
    if (nameInput) {
        nameInput.value = '';
        nameInput.focus(); // 自动聚焦到输入框
    }
    
    // 重置游戏
    resetGame();
    
    // 隐藏个人最高分
    document.getElementById('personalBest').style.display = 'none';
}

// 修改页面加载逻辑
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 更新排行榜
        await updateScoreboard();
        
        // 如果已有存储的昵称，直接进入游戏界面
        if (playerName) {
            showGameContainer();
        } else {
            // 显示欢迎界面
            const welcomeScreen = document.getElementById('welcomeScreen');
            welcomeScreen.style.cssText = `
                display: flex;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: #f0f0f0;
                justify-content: center;
                align-items: center;
                z-index: 9999;
            `;
        }
    } catch (error) {
        console.error('初始化失败:', error);
    }
});

// 修改显示游戏容器的函数
async function showGameContainer() {
    // 隐藏欢迎界面
    const welcomeScreen = document.getElementById('welcomeScreen');
    welcomeScreen.style.display = 'none';
    
    // 显示游戏界面
    const gameContainer = document.getElementById('gameContainer');
    gameContainer.style.display = 'block';
    document.getElementById('startScreen').style.display = 'block';
    document.getElementById('currentPlayerName').textContent = playerName;
    
    // 获取并显示个人最高分
    await updatePersonalBest();
    
    // 重置游戏状态
    resetGame();
    
    // 设置 5 秒后启动 AI 游戏
    startAICountdown();
}

// 修改更新个人最高分的函数
async function updatePersonalBest() {
    try {
        const params = {
            name: playerName
        };
        const signedParams = generateRequestSignature(params);
        
        const response = await fetch('/get-scores?' + new URLSearchParams({
            ...signedParams,
            name: playerName
        }));
        
        if (!response.ok) {
            throw new Error('获取分数失败');
        }
        
        const scores = await response.json();
        const personalBestElement = document.getElementById('personalBest');
        const personalBestScoreElement = document.getElementById('personalBestScore');
        const personalBestRankElement = document.getElementById('personalBestRank');
        
        if (scores.length > 0) {
            const playerData = scores[0];
            personalBestElement.style.display = 'inline';
            personalBestScoreElement.textContent = playerData.score;
            
            // 更新游戏次数和总分
            document.getElementById('personalPlayCount').textContent = playerData.playCount;
            document.getElementById('personalTotalScore').textContent = playerData.totalScore;
            
            // 获取排名
            const allScoresResponse = await fetch('/get-scores?' + new URLSearchParams(generateRequestSignature({})));
            const allScores = await allScoresResponse.json();
            
            const playerScore = playerData.score;
            const rank = allScores.findIndex(s => s.score === playerScore) + 1;
            
            // 更新排名显示
            const rankNumber = personalBestRankElement.querySelector('.rank-number');
            rankNumber.textContent = `${rank}`;
            
            // 设置排名属性用于样式
            personalBestRankElement.setAttribute('data-rank', rank);
            personalBestRankElement.style.display = 'inline-flex';
        } else {
            personalBestElement.style.display = 'none';
        }
    } catch (error) {
        console.error('获取个人最高分失败:', error);
        document.getElementById('personalBest').style.display = 'none';
    }
}

// 添加 AI 倒计时函数
function startAICountdown() {
    // 清除可能存在的旧定时器
    if (aiStartTimeout) {
        clearTimeout(aiStartTimeout);
    }
    
    // 5 秒后启动 AI 游戏
    aiStartTimeout = setTimeout(() => {
        if (!gameStarted) {  // 只有在游戏未开始时才启动 AI
            startAIGame();
        }
    }, 5000);
}

// 隐藏游戏结束对话框
function hideGameOver() {
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('startScreen').style.display = 'block';
    confetti.stop();
    
    // 重新开始 AI 倒计时
    startAICountdown();
}

function startGame() {
    if (!playerName) {
        alert('请先输入昵称！');
        return;
    }
    if (gameStarted) return;
    
    // 重置并初始化反外挂系统
    antiCheat.cleanup();
    if (!antiCheat.init()) {
        console.warn('检测到潜在风险，但允许游戏继续');
    }
    
    // 检查是否可以开始新游戏
    const now = Date.now();
    const timeSinceLastGame = now - lastGameEndTime;
    if (timeSinceLastGame < minInterval * 1000) {  // 转换为毫秒
        const waitTime = Math.ceil((minInterval * 1000 - timeSinceLastGame) / 1000);
        alert(`请等待 ${waitTime} 秒后再开始新游戏`);
        return;
    }
    
    // 清除 AI 倒计时
    if (aiStartTimeout) {
        clearTimeout(aiStartTimeout);
        aiStartTimeout = null;
    }
    
    // 停止 AI 游戏
    stopAIGame();
    
    document.getElementById('startScreen').style.display = 'none';
    startCountdown();
}

// 倒计时函数
function startCountdown() {
    let count = 3;
    const countdownElement = document.getElementById('countdown');
    countdownElement.style.display = 'block';
    
    function updateCount() {
        if (count > 0) {
            countdownElement.textContent = count;
            count--;
            countdownTimer = setTimeout(updateCount, 1000);
        } else {
            countdownElement.style.display = 'none';
            actuallyStartGame();
        }
    }
    
    updateCount();
}

// 实际开始游戏的函数
function actuallyStartGame() {
    resetGame();
    gameStarted = true;
    gameLoop = setInterval(update, 100);
}

function update() {
    if (isReplaying) return;
    
    const moveData = {
        position: snake[0],
        direction: { x: dx, y: dy }
    };

    // 验证移动
    if (!antiCheat.validateGameplay(moveData)) {
        gameOver();
        alert('检测到异常操作，游戏结束');
        return;
    }
    
    const head = {x: snake[0].x + dx, y: snake[0].y + dy};
    
    // 检查碰撞
    if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount || checkCollision(head)) {
        gameOver();
        return;
    }
    
    // 记录当前步骤
    gameSteps.push({
        snake: JSON.parse(JSON.stringify(snake)),
        food: {...food},
        dx: dx,
        dy: dy,
        score: score
    });
    
    snake.unshift(head);
    
    // 检查是否吃到食物
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        document.getElementById('scoreSpan').textContent = score;
        // 添加积分特效
        showScoreEffect(food.x, food.y, 10);
        generateFood();
    } else {
        snake.pop();
    }
    
    draw();
}

function draw() {
    // 清空画布
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制蛇
    snake.forEach((segment, index) => {
        const x = segment.x * gridSize;
        const y = segment.y * gridSize;
        const size = gridSize - 2;

        // 根据位置确定部位
        if (index === 0) {
            // 蛇头
            drawSnakeHead(x, y, size);
        } else if (index === snake.length - 1) {
            // 蛇尾
            drawSnakeTail(x, y, size);
        } else {
            // 蛇身
            drawSnakeBody(x, y, size, index);
        }
    });

    // 绘制食物（保持原有的食物绘制代码）
    const fontSize = Math.floor(gridSize * 0.8);
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.shadowColor = 'rgba(255, 165, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    ctx.fillText('🍊', 
        food.x * gridSize + gridSize/2,
        food.y * gridSize + gridSize/2
    );
    
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
}

// 绘制蛇头
function drawSnakeHead(x, y, size) {
    ctx.fillStyle = '#2E7D32';  // 深绿色
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, [size/2, size/2, 0, 0]);
    ctx.fill();

    // 添加眼睛
    const eyeSize = size / 6;
    ctx.fillStyle = 'white';
    
    // 根据移动方向调整眼睛位置
    if (dx === 1) {  // 向右
        ctx.fillRect(x + size * 0.7, y + size * 0.3, eyeSize, eyeSize);
        ctx.fillRect(x + size * 0.7, y + size * 0.6, eyeSize, eyeSize);
    } else if (dx === -1) {  // 向左
        ctx.fillRect(x + size * 0.2, y + size * 0.3, eyeSize, eyeSize);
        ctx.fillRect(x + size * 0.2, y + size * 0.6, eyeSize, eyeSize);
    } else if (dy === -1) {  // 向上
        ctx.fillRect(x + size * 0.3, y + size * 0.2, eyeSize, eyeSize);
        ctx.fillRect(x + size * 0.6, y + size * 0.2, eyeSize, eyeSize);
    } else {  // 向下
        ctx.fillRect(x + size * 0.3, y + size * 0.7, eyeSize, eyeSize);
        ctx.fillRect(x + size * 0.6, y + size * 0.7, eyeSize, eyeSize);
    }

    // 添加舌头
    ctx.strokeStyle = '#FF1744';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (dx === 1) {  // 向右
        ctx.moveTo(x + size, y + size/2);
        ctx.lineTo(x + size + 6, y + size/2 - 3);
        ctx.moveTo(x + size, y + size/2);
        ctx.lineTo(x + size + 6, y + size/2 + 3);
    } else if (dx === -1) {  // 向左
        ctx.moveTo(x, y + size/2);
        ctx.lineTo(x - 6, y + size/2 - 3);
        ctx.moveTo(x, y + size/2);
        ctx.lineTo(x - 6, y + size/2 + 3);
    } else if (dy === -1) {  // 向上
        ctx.moveTo(x + size/2, y);
        ctx.lineTo(x + size/2 - 3, y - 6);
        ctx.moveTo(x + size/2, y);
        ctx.lineTo(x + size/2 + 3, y - 6);
    } else {  // 向下
        ctx.moveTo(x + size/2, y + size);
        ctx.lineTo(x + size/2 - 3, y + size + 6);
        ctx.moveTo(x + size/2, y + size);
        ctx.lineTo(x + size/2 + 3, y + size + 6);
    }
    ctx.stroke();
}

// 绘制蛇身
function drawSnakeBody(x, y, size, index) {
    // 渐变色蛇身
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, '#4CAF50');  // 浅绿色
    gradient.addColorStop(1, '#388E3C');  // 深绿色
    ctx.fillStyle = gradient;
    
    // 添加鳞片效果
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 4);
    ctx.fill();

    // 添加花纹
    if (index % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.arc(x + size/2, y + size/2, size/4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 绘制蛇尾
function drawSnakeTail(x, y, size) {
    ctx.fillStyle = '#388E3C';  // 深绿色
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, [0, 0, size/2, size/2]);
    ctx.fill();
}

function changeDirection(event) {
    // 阻止方向键的默认滚动行为
    if([37, 38, 39, 40].includes(event.keyCode)) {
        event.preventDefault();
    }

    // 如果游戏未开始或正在回放，不处理方向改变
    if (!gameStarted || isReplaying) return;

    const LEFT = 37;
    const RIGHT = 39;
    const UP = 38;
    const DOWN = 40;

    const keyPressed = event.keyCode;
    const goingUp = dy === -1;
    const goingDown = dy === 1;
    const goingRight = dx === 1;
    const goingLeft = dx === -1;

    // 检查距离上次方向改变的时间间隔（改为50ms）
    const now = Date.now();
    if (now - lastDirectionChange < 50) {
        return;
    }

    let newDx = dx;
    let newDy = dy;

    // 允许180度转向，但需要检查是否安全
    if (keyPressed === LEFT) {
        newDx = -1;
        newDy = 0;
    } else if (keyPressed === UP) {
        newDx = 0;
        newDy = -1;
    } else if (keyPressed === RIGHT) {
        newDx = 1;
        newDy = 0;
    } else if (keyPressed === DOWN) {
        newDx = 0;
        newDy = 1;
    } else {
        return; // 如果是无效的方向改变，直接返回
    }

    // 检查新方向是否会导致立即碰撞
    const head = snake[0];
    const nextPos = {
        x: head.x + newDx,
        y: head.y + newDy
    };

    // 检查是否会撞墙或撞到自己（除了尾巴）
    const willEatFood = nextPos.x === food.x && nextPos.y === food.y;
    const snakeBody = willEatFood ? snake : snake.slice(0, -1);
    
    if (nextPos.x < 0 || nextPos.x >= tileCount || 
        nextPos.y < 0 || nextPos.y >= tileCount || 
        snakeBody.some(segment => segment.x === nextPos.x && segment.y === nextPos.y)) {
        return;
    }

    // 更新方向
    dx = newDx;
    dy = newDy;
    lastDirectionChange = now;
}

function generateFood() {
    food.x = Math.floor(Math.random() * tileCount);
    food.y = Math.floor(Math.random() * tileCount);
}

function checkCollision(head) {
    return snake.some(segment => segment.x === head.x && segment.y === head.y);
}

// 添加 Confetti 类
class Confetti {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.isActive = false;
        
        // 设置画布尺寸
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.particles = [];
        this.animate();
    }

    stop() {
        this.isActive = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    createParticle() {
        return {
            x: Math.random() * this.canvas.width,
            y: -10,
            size: Math.random() * 5 + 5,
            color: `hsl(${Math.random() * 360}, 80%, 60%)`,
            speedX: Math.random() * 6 - 3,
            speedY: Math.random() * 3 + 2,
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 10 - 5
        };
    }

    animate() {
        if (!this.isActive) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 添加新粒子
        if (this.particles.length < 100) {
            this.particles.push(this.createParticle());
        }

        // 更新和绘制粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.speedX;
            p.y += p.speedY;
            p.rotation += p.rotationSpeed;

            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate((p.rotation * Math.PI) / 180);
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            this.ctx.restore();

            // 移除超出画布的粒子
            if (p.y > this.canvas.height + 10) {
                this.particles.splice(i, 1);
            }
        }

        requestAnimationFrame(() => this.animate());
    }
}

// 创建全局 confetti 实例
const confetti = new Confetti(document.getElementById('confettiCanvas'));

// 添加开始特效的函数
function startConfetti() {
    confetti.start();
    // 5秒后停止特效
    setTimeout(() => confetti.stop(), 5000);
}

function gameOver() {
    if (gameLoop) {
        clearInterval(gameLoop);
        gameLoop = null;
    }
    gameStarted = false;
    lastGameEndTime = Date.now();

    // 显示游戏结束弹窗，但只显示加载状态
    const gameOverDiv = document.getElementById('gameOver');
    const scoreLoading = document.getElementById('scoreLoading');
    const scoreResult = document.getElementById('scoreResult');
    
    gameOverDiv.style.display = 'block';
    scoreLoading.style.display = 'block';
    scoreResult.style.display = 'none';

    // 生成游戏回放数据
    const replayData = JSON.stringify(gameSteps);

    // 提交分数
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = generateNonce();
    const scoreData = {
        name: playerName,
        score: score,
        sessionId: sessionId,
        timestamp: timestamp,
        nonce: nonce,
        hash: generateScoreHash(sessionId, score, timestamp, nonce),
        replay: replayData
    };

    // 直接调用 fetch 提交分数
    fetch('/submit-score', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(scoreData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('提交分数失败');
        }
        return response.json();
    })
    .then(result => {
        // 隐藏加载状态，显示结算结果
        scoreLoading.style.display = 'none';
        scoreResult.style.display = 'block';
        
        // 更新分数和玩家名称显示
        document.getElementById('finalScore').textContent = score;
        document.getElementById('playerNameDisplay').textContent = playerName;
        
        // 根据是否破纪录显示不同内容
        if (result.isNewRecord) {
            startConfetti();
            document.getElementById('newRecord').style.display = 'block';
            document.getElementById('normalScore').style.display = 'none';
            
            // 随机选择一条庆祝语
            const celebration = celebrations[Math.floor(Math.random() * celebrations.length)];
            const recordText = document.querySelector('#newRecord p');
            recordText.innerHTML = `
                <div class="celebration-text">
                    <span class="celebration-emoji">${celebration.emoji}</span>
                    ${celebration.text}
                </div>
            `;
        } else {
            document.getElementById('newRecord').style.display = 'none';
            document.getElementById('normalScore').style.display = 'block';
            
            // 随机选择一条鼓励语
            const encouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
            const encouragementText = document.querySelector('.encouragement-text');
            encouragementText.innerHTML = `${encouragement.emoji} ${encouragement.text}`;
        }

        // 更新排行榜和个人最高分
        Promise.all([
            updateScoreboard(),
            updatePersonalBest(),
            updateGameStats()
        ]).catch(console.error);
    })
    .catch(error => {
        console.error('提交分数失败:', error);
        // 显示错误信息
        scoreLoading.style.display = 'none';
        scoreResult.style.display = 'block';
        document.getElementById('finalScore').textContent = score;
        document.getElementById('playerNameDisplay').textContent = playerName;
        
        // 显示鼓励语
        document.getElementById('newRecord').style.display = 'none';
        document.getElementById('normalScore').style.display = 'block';
        const encouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
        const encouragementText = document.querySelector('.encouragement-text');
        encouragementText.innerHTML = `${encouragement.emoji} ${encouragement.text}`;
    })
    .finally(() => {
        antiCheat.cleanup();
    });
}

function generateNonce(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    randomValues.forEach(num => {
        result += chars[num % chars.length];
    });
    return result;
}

function generateScoreHash(sessionId, score, timestamp, nonce) {
    const message = `nonce=${nonce}&score=${score}&sessionId=${sessionId}&timestamp=${timestamp}`;
    const secretKey = 'your-secret-key-here';
    const hash = CryptoJS.HmacSHA256(message, secretKey);
    return hash.toString(CryptoJS.enc.Hex);
}

// 修改通用的请求签名函数
function generateRequestSignature(params) {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = generateNonce();
    
    // 添加公共参数
    params.timestamp = timestamp;
    params.nonce = nonce;
    
    // 按字母顺序排序参数
    const keys = Object.keys(params).sort();
    
    // 构建签名字符串
    const signString = keys
        .map(key => `${key}=${params[key]}`)
        .join('&');
    
    // 使用从服务器传递的 secretKey 生成签名
    const hash = CryptoJS.HmacSHA256(signString, window.secretKey);
    
    return {
        ...params,
        signature: hash.toString(CryptoJS.enc.Hex)
    };
}

// 修改获取排行榜函数
async function updateScoreboard() {
    try {
        // 不传昵称参数，获取前10名记录
        const params = {};
        const signedParams = generateRequestSignature(params);
        
        const response = await fetch('/get-scores?' + new URLSearchParams(signedParams));
        
        if (!response.ok) {
            throw new Error('获取排行榜失败');
        }
        
        const scores = await response.json();
        const rankings = document.getElementById('rankings');
        if (!rankings) {
            throw new Error('找不到排行榜元素');
        }
        
        // 只显示前10名
        const rankingsHtml = scores.length > 0 ? scores
            .slice(0, 10)  // 确保只取前10名
            .map((score, index) => {
                let prefix = `${index + 1}.`;
                let className = '';
                
                if (index === 0) {
                    prefix = '🏆';
                    className = 'gold';
                } else if (index === 1) {
                    prefix = '🥈';
                    className = 'silver';
                } else if (index === 2) {
                    prefix = '🥉';
                    className = 'bronze';
                }
                
                return `
                    <div class="ranking-item ${className}">
                        <span class="rank">${prefix}</span>
                        <div class="player-info">
                            <span class="player-name">${score.name || '未知玩家'}</span>
                            <span class="player-play-count">游戏次数: ${score.playCount || 0}</span>
                        </div>
                        <span class="player-score">${score.score || 0}</span>
                        <span class="replay-icon" 
                            title="点击观看回放" 
                            onclick="handleReplayClick(this, '${score.name}')"
                            data-player="${score.name}">▶️</span>
                    </div>
                `;
            })
            .join('') : '<div class="ranking-item">暂无记录</div>';

        rankings.innerHTML = rankingsHtml;
        
        // 更新最高分
        const highScoreElement = document.getElementById('highScore');
        if (highScoreElement && scores.length > 0) {
            const highScore = scores[0];
            highScoreElement.textContent = `最高分: ${highScore.score || 0}`;
        }
    } catch (error) {
        console.error('更新排行榜出错:', error);
        const rankings = document.getElementById('rankings');
        if (rankings) {
            rankings.innerHTML = '<div class="ranking-item error">获取排行榜失败，请稍后再试</div>';
        }
    }
}

// 修改获取回放数据函数
async function handleReplayClick(element, playerName) {
    if (isReplaying) return;
    
    try {
        const params = { name: playerName };
        const signedParams = generateRequestSignature(params);
        
        const response = await fetch(`/get-replay?` + new URLSearchParams(signedParams));
        
        if (!response.ok) {
            throw new Error('获取回放数据失败');
        }
        
        const replayData = await response.text();
        // 开始回放
        await startReplay(replayData, element, playerName);
    } catch (error) {
        console.error('回放错误:', error);
        alert('获取回放数据失败，请稍后再试');
    } finally {
        resetReplayButton(element);
    }
}

// 修改回放函数
function startReplay(replayData, replayButton, playerName) {
    try {
        if (!replayData || replayData === '[]') {
            alert('暂无回放数据');
            resetReplayButton(replayButton);
            return;
        }

        isReplaying = true;
        const steps = JSON.parse(replayData);
        
        if (!Array.isArray(steps) || steps.length === 0) {
            alert('回放数据无效');
            isReplaying = false;
            resetReplayButton(replayButton);
            return;
        }

        let stepIndex = 0;
        
        // 隐藏开始界面
        document.getElementById('startScreen').style.display = 'none';
        
        // 停止 AI 游戏
        stopAIGame();
        
        // 添加回放提示
        const replayIndicator = document.createElement('div');
        replayIndicator.className = 'replaying';
        
        // 获取玩家分数
        const playerItem = replayButton.closest('.ranking-item');
        const playerScore = playerItem.querySelector('.player-score').textContent;
        
        // 修改提示文字，添加 ESC 退出提示
        replayIndicator.innerHTML = `
            <span class="replay-icon">🎬</span>
            <span class="replay-text">正在回放 <strong>${playerName}</strong> 的精彩记录</span>
            <span class="replay-score">${playerScore}分</span>
            <span class="replay-exit-hint">[ESC 退出]</span>
        `;
        
        document.querySelector('.game-area').appendChild(replayIndicator);
        
        function playNextStep() {
            if (!isReplaying || stepIndex >= steps.length) {
                if (isReplaying) {  // 正常播放完成
                    isReplaying = false;
                    document.getElementById('startScreen').style.display = 'block';
                    replayIndicator.remove();
                    resetReplayButton(replayButton);
                }
                // 清除定时器
                if (replayTimer) {
                    clearTimeout(replayTimer);
                    replayTimer = null;
                }
                return;
            }
            
            const step = steps[stepIndex];
            snake = JSON.parse(JSON.stringify(step.snake));
            food = {...step.food};
            score = step.score;
            dx = step.dx;
            dy = step.dy;
            
            document.getElementById('scoreSpan').textContent = score;
            draw();
            
            stepIndex++;
            replayTimer = setTimeout(playNextStep, 100);  // 存储定时器ID
        }
        
        playNextStep();
        
    } catch (error) {
        console.error('回放错误:', error);
        alert('回放出错，请稍后再试');
        isReplaying = false;
        document.getElementById('startScreen').style.display = 'block';
        resetReplayButton(replayButton);
        // 确保清除定时器
        if (replayTimer) {
            clearTimeout(replayTimer);
            replayTimer = null;
        }
    }
}

// 添加重置回放按钮状态的辅助函数
function resetReplayButton(button) {
    if (!button) return;
    
    // 重置按钮状态
    button.style.opacity = '1';
    button.style.pointerEvents = 'auto';
    
    // 重置所有回放按钮
    document.querySelectorAll('.replay-icon').forEach(icon => {
        icon.style.opacity = '1';
        icon.style.pointerEvents = 'auto';
    });
}

// 修改压缩函数，记录所有关键状态
function compressGameSteps(steps) {
    if (steps.length === 0) return '[]';
    
    // 记录初始状态和所有关键变化
    const compressed = {
        init: steps[0],  // 完整记录初始状态
        changes: []      // 记录状态变化
    };
    
    // 记录每一步的变化
    for (let i = 1; i < steps.length; i++) {
        const current = steps[i];
        const prev = steps[i-1];
        
        // 检查是否有变化
        if (current.dx !== prev.dx || 
            current.dy !== prev.dy || 
            current.food.x !== prev.food.x || 
            current.food.y !== prev.food.y || 
            current.score !== prev.score) {
            
            compressed.changes.push({
                frame: i,
                state: {
                    snake: current.snake,
                    food: current.food,
                    dx: current.dx,
                    dy: current.dy,
                    score: current.score
                }
            });
        }
    }
    
    return JSON.stringify(compressed);
}

// 修改解压缩函数，精确还原游戏状态
function decompressGameSteps(compressedData) {
    const data = JSON.parse(compressedData);
    if (!data.init) return [];
    
    const steps = [];
    let currentState = JSON.parse(JSON.stringify(data.init));
    
    // 添加初始状态
    steps.push(currentState);
    
    // 重建每一帧的状态
    let nextChangeIndex = 0;
    let frame = 1;
    
    while (nextChangeIndex < data.changes.length) {
        const nextChange = data.changes[nextChangeIndex];
        
        // 在变化帧之前，继续使用当前状态移动
        while (frame < nextChange.frame) {
            const newState = simulateOneStep(currentState);
            steps.push(newState);
            currentState = newState;
            frame++;
        }
        
        // 应用变化
        currentState = JSON.parse(JSON.stringify(nextChange.state));
        steps.push(currentState);
        frame++;
        nextChangeIndex++;
    }
    
    return steps;
}

// 辅助函数：模拟一步移动
function simulateOneStep(state) {
    const newState = JSON.parse(JSON.stringify(state));
    
    // 移动蛇头
    const newHead = {
        x: state.snake[0].x + state.dx,
        y: state.snake[0].y + state.dy
    };
    
    // 检查是否吃到食物
    const ateFood = newHead.x === state.food.x && newHead.y === state.food.y;
    
    // 更新蛇的位置
    newState.snake.unshift(newHead);
    if (!ateFood) {
        newState.snake.pop();
    }
    
    return newState;
}

// 修改提交分数函数
async function submitScore() {
    try {
        console.log('开始提交分数...'); // 添加日志

        // 进行最终的反外挂检查
        if (!antiCheat.validateScore(score, score/10)) {
            alert('检测到异常分数，无法提交');
            hideGameOver();  // 添加这行，在检测到作弊时关闭加载界面
            return;
        }

        if (antiCheat.getViolations().length > 0) {
            alert('检测到游戏过程中存在异常，无法提交分数');
            console.error('Anti-cheat violations:', antiCheat.getViolations());
            hideGameOver();  // 添加这行，在检测到作弊时关闭加载界面
            return;
        }

        console.log('生成提交数据...'); // 添加日志
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = generateNonce();
        const scoreData = {
            name: playerName,
            score: score,
            sessionId: sessionId,
            timestamp: timestamp,
            nonce: nonce,
            hash: generateScoreHash(sessionId, score, timestamp, nonce),
            replay: JSON.stringify(gameSteps)
        };

        console.log('发送请求...', scoreData); // 添加日志
        const response = await fetch('/submit-score', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(scoreData)
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        console.log('处理响应...'); // 添加日志
        const result = await response.json();
        
        // 隐藏加载状态，显示结算结果
        document.getElementById('scoreLoading').style.display = 'none';
        document.getElementById('scoreResult').style.display = 'block';
        
        // 更新分数和玩家名称显示
        document.getElementById('finalScore').textContent = score;
        document.getElementById('playerNameDisplay').textContent = playerName;
        
        // 根据是否破纪录显示不同内容
        if (result.isNewRecord) {
            startConfetti();
            document.getElementById('newRecord').style.display = 'block';
            document.getElementById('normalScore').style.display = 'none';
            
            // 随机选择一条庆祝语
            const celebration = celebrations[Math.floor(Math.random() * celebrations.length)];
            const recordText = document.querySelector('#newRecord p');
            recordText.innerHTML = `
                <div class="celebration-text">
                    <span class="celebration-emoji">${celebration.emoji}</span>
                    ${celebration.text}
                </div>
            `;
        } else {
            document.getElementById('newRecord').style.display = 'none';
            document.getElementById('normalScore').style.display = 'block';
            
            // 随机选择一条鼓励语
            const encouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
            const encouragementText = document.querySelector('.encouragement-text');
            encouragementText.innerHTML = `${encouragement.emoji} ${encouragement.text}`;
        }

        // 更新排行榜和个人最高分
        await Promise.all([
            updateScoreboard(),
            updatePersonalBest()
        ]);
        
        // 更新统计数据
        await updateGameStats();
        
    } catch (error) {
        console.error('提交分数失败:', error); // 添加错误日志
        alert('提交分数失败: ' + error.message);
        
        // 出错时也显示鼓励语
        document.getElementById('newRecord').style.display = 'none';
        document.getElementById('normalScore').style.display = 'block';
        const encouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
        const encouragementText = document.querySelector('.encouragement-text');
        encouragementText.innerHTML = `${encouragement.emoji} ${encouragement.text}`;
        
        // 显示结果界面，即使出错
        document.getElementById('scoreLoading').style.display = 'none';
        document.getElementById('scoreResult').style.display = 'block';
        document.getElementById('finalScore').textContent = score;
        document.getElementById('playerNameDisplay').textContent = playerName;
    } finally {
        antiCheat.cleanup();
    }
}

function resetGame() {
    snake = [
        {x: 3, y: 1},
        {x: 2, y: 1},
        {x: 1, y: 1},
    ];
    dx = 1;
    dy = 0;
    score = 0;
    gameSteps = [];  // 重置游戏记录
    document.getElementById('scoreSpan').textContent = score;
    generateFood();
}

// 添加常量
const minInterval = 2;  // 与后端保持一致 

// 添加键盘事件监听
document.addEventListener('keydown', function(event) {
    // ESC 键退出回放
    if (event.key === 'Escape' && isReplaying) {
        exitReplay();
        return;
    }
    
    // 在昵称输入界面按回车
    if (event.key === 'Enter' && document.getElementById('welcomeScreen').style.display !== 'none') {
        submitName();
    }
    
    // 在游戏界面按空格
    if (event.code === 'Space') {
        event.preventDefault();  // 防止空格键滚动页面
        // 游戏结束界面按空格继续游戏
        if (document.getElementById('gameOver').style.display === 'block') {
            hideGameOver();
            return;
        }
        // 开始界面按空格开始游戏
        if (document.getElementById('gameContainer').style.display !== 'none' &&
            document.getElementById('startScreen').style.display !== 'none') {
            startGame();
        }
    }
});

// 在昵称输入框上添加回车事件监听
document.getElementById('playerName').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();  // 防止表单提交
        submitName();
    }
});

// 版本历史折叠功能
function toggleVersionHistory() {
    const header = document.querySelector('.version-header');
    const content = document.querySelector('.version-content');
    const isExpanded = content.style.display !== 'none';

    header.classList.toggle('active');
    
    if (isExpanded) {
        content.style.display = 'none';
    } else {
        content.style.display = 'block';
    }
}

// 添加 AI 自动游戏功能
function startAIGame() {
    isAIPlaying = true;
    resetGame();
    aiGameLoop = setInterval(updateAIGame, 100);
}

// AI 游戏更新函数
function updateAIGame() {
    if (!isAIPlaying) return;
    
    const head = snake[0];
    const foodDir = {
        x: food.x - head.x,
        y: food.y - head.y
    };
    
    // 获取所有可能的移动方向
    const possibleMoves = getPossibleMoves();
    if (possibleMoves.length === 0) {
        handleAIGameOver();
        return;
    }

    // 选择最佳移动方向
    const bestMove = chooseBestMove(possibleMoves, foodDir);
    dx = bestMove.x;
    dy = bestMove.y;
    
    // 更新游戏状态
    const newHeadPos = {x: head.x + dx, y: head.y + dy};
    snake.unshift(newHeadPos);
    
    if (newHeadPos.x === food.x && newHeadPos.y === food.y) {
        generateFood();
    } else {
        snake.pop();
    }
    
    draw();
}

// 改进获取可能移动方向的函数
function getPossibleMoves() {
    const head = snake[0];
    const moves = [
        {x: 1, y: 0},   // 右
        {x: -1, y: 0},  // 左
        {x: 0, y: 1},   // 下
        {x: 0, y: -1}   // 上
    ];
    
    // 过滤掉不安全的移动
    return moves.filter(move => {
        const newX = head.x + move.x;
        const newY = head.y + move.y;
        
        // 检查是否会撞墙
        if (newX < 0 || newX >= tileCount || newY < 0 || newY >= tileCount) {
            return false;
        }
        
        // 检查是否会撞到自己（除了尾巴）
        const willEatFood = newX === food.x && newY === food.y;
        const snakeWithoutTail = willEatFood ? snake : snake.slice(0, -1);
        return !snakeWithoutTail.some(segment => segment.x === newX && segment.y === newY);
    });
}

// 改进选择最佳移动方向的函数
function chooseBestMove(possibleMoves, foodDir) {
    // 为每个可能的移动计算分数
    const scoredMoves = possibleMoves.map(move => {
        const newHead = {
            x: snake[0].x + move.x,
            y: snake[0].y + move.y
        };
        
        let score = 0;
        
        // 1. 距离食物的距离（负分，距离越近分数越高）
        const distanceToFood = Math.abs(food.x - newHead.x) + Math.abs(food.y - newHead.y);
        score -= distanceToFood * 2;
        
        // 2. 检查移动后是否有足够的空间（空间越大分数越高）
        const spaceScore = calculateFreeSpace(newHead);
        score += spaceScore * 3;
        
        // 3. 避免靠近自己的身体（除了尾巴）
        snake.slice(0, -1).forEach(segment => {
            const distToSegment = Math.abs(segment.x - newHead.x) + Math.abs(segment.y - newHead.y);
            if (distToSegment < 3) {
                score -= (3 - distToSegment) * 5;
            }
        });
        
        // 4. 优先选择沿着当前方向移动
        if ((dx === move.x && dy === move.y)) {
            score += 2;
        }
        
        // 5. 如果这个移动可以直接吃到食物，给予额外分数
        if (newHead.x === food.x && newHead.y === food.y) {
            score += 10;
        }
        
        return { move, score };
    });
    
    // 选择得分最高的移动
    scoredMoves.sort((a, b) => b.score - a.score);
    return scoredMoves[0].move;
}

// 计算某个位置的可用空间
function calculateFreeSpace(pos) {
    const visited = new Set();
    const queue = [pos];
    
    while (queue.length > 0) {
        const current = queue.shift();
        const key = `${current.x},${current.y}`;
        
        if (visited.has(key)) continue;
        visited.add(key);
        
        // 检查四个方向
        const directions = [
            {x: 1, y: 0}, {x: -1, y: 0},
            {x: 0, y: 1}, {x: 0, y: -1}
        ];
        
        for (const dir of directions) {
            const newX = current.x + dir.x;
            const newY = current.y + dir.y;
            
            // 检查是否在边界内且不是蛇的身体
            if (newX >= 0 && newX < tileCount && 
                newY >= 0 && newY < tileCount && 
                !snake.some(s => s.x === newX && s.y === newY)) {
                queue.push({x: newX, y: newY});
            }
        }
        
        // 限制搜索空间，避免计算过久
        if (visited.size > 50) break;
    }
    
    return visited.size;
}

// 添加 AI 游戏结束处理函数
function handleAIGameOver() {
    // 停止当前游戏循环
    if (aiGameLoop) {
        clearInterval(aiGameLoop);
        aiGameLoop = null;
    }
    
    // 等待 2 秒后重新开始
    setTimeout(() => {
        if (isAIPlaying) { // 确保还在 AI 模式
            resetGame();
            aiGameLoop = setInterval(updateAIGame, 100);
        }
    }, 2000);
}

// 修改停止 AI 游戏函数
function stopAIGame() {
    isAIPlaying = false; // 先设置标志，防止重启
    if (aiGameLoop) {
        clearInterval(aiGameLoop);
        aiGameLoop = null;
    }
    if (aiStartTimeout) {
        clearTimeout(aiStartTimeout);
        aiStartTimeout = null;
    }
    resetGame();
}

// 添加退出回放的函数
function exitReplay() {
    if (!isReplaying) return;
    
    // 清除回放定时器
    if (replayTimer) {
        clearTimeout(replayTimer);
        replayTimer = null;
    }
    
    // 重置回放状态
    isReplaying = false;
    
    // 移除回放提示
    const replayIndicator = document.querySelector('.replaying');
    if (replayIndicator) {
        replayIndicator.remove();
    }
    
    // 重置游戏状态
    resetGame();
    
    // 显示开始界面
    document.getElementById('startScreen').style.display = 'block';
    
    // 重置分数显示
    document.getElementById('scoreSpan').textContent = '0';
    
    // 重新绘制游戏画面
    draw();
    
    // 启动 AI 倒计时
    startAICountdown();
    
    // 重置所有回放按钮状态
    document.querySelectorAll('.replay-icon').forEach(icon => {
        icon.style.opacity = '1';
        icon.style.pointerEvents = 'auto';
    });
}

// 添加游戏说明展开/折叠功能
function toggleInstructions() {
    const moreContent = document.querySelector('.instructions-more');
    const toggleBtn = document.querySelector('.toggle-instructions');
    const toggleText = toggleBtn.querySelector('.toggle-text');
    
    if (moreContent.style.display === 'none') {
        // 展开
        moreContent.style.display = 'block';
        moreContent.classList.remove('sliding-up');
        moreContent.classList.add('sliding-down');
        toggleText.textContent = '收起';
        toggleBtn.classList.add('active');
    } else {
        // 折叠
        moreContent.classList.remove('sliding-down');
        moreContent.classList.add('sliding-up');
        toggleText.textContent = '展开更多';
        toggleBtn.classList.remove('active');
        
        // 等待动画完成后隐藏
        setTimeout(() => {
            moreContent.style.display = 'none';
        }, 300);
    }
}

// 添加更新统计数据的函数
async function updateGameStats() {
    try {
        const params = {};
        const signedParams = generateRequestSignature(params);
        
        const response = await fetch('/get-stats?' + new URLSearchParams(signedParams));
        
        if (!response.ok) {
            throw new Error('获取统计数据失败');
        }
        
        const stats = await response.json();
        
        // 更新显示
        document.getElementById('totalPlayers').textContent = stats.totalPlayers.toLocaleString();
        document.getElementById('totalGames').textContent = stats.totalGames.toLocaleString();
        document.getElementById('totalScore').textContent = stats.totalScore.toLocaleString();
        
    } catch (error) {
        console.error('更新统计数据失败:', error);
    }
}

// 在页面加载和游戏结束时更新统计
document.addEventListener('DOMContentLoaded', updateGameStats);

// 修改 submitScore 函数，在提交分数后更新统计
async function submitScore() {
    // ... 现有代码 ...
    
    // 更新统计数据
    await updateGameStats();
    
    // ... 现有代码 ...
}

// 添加积分特效函数
function showScoreEffect(x, y, score) {
    const gameArea = document.querySelector('.game-area');
    const effect = document.createElement('div');
    effect.className = 'score-effect';
    effect.textContent = `+${score}`;
    
    // 计算相对于游戏区域的位置
    const canvas = document.getElementById('gameCanvas');
    const rect = canvas.getBoundingClientRect();
    const gameRect = gameArea.getBoundingClientRect();
    
    // 将网格坐标转换为像素坐标
    const pixelX = x * gridSize + rect.left - gameRect.left;
    const pixelY = y * gridSize + rect.top - gameRect.top;
    
    // 设置初始位置
    effect.style.left = `${pixelX}px`;
    effect.style.top = `${pixelY}px`;
    
    gameArea.appendChild(effect);
    
    // 添加动画结束监听器
    effect.addEventListener('animationend', () => {
        effect.remove();
    });
}

// 将 confetti 实例和触发函数暴露到全局
window.confetti = confetti;

// 添加一个全局的触发撒花函数
window.triggerConfetti = function(duration = 5000) {
    confetti.start();
    setTimeout(() => confetti.stop(), duration);
};

// 添加一个全局的高级礼花特效函数
window.triggerFancyConfetti = function(options = {}) {
    const defaults = {
        duration: 5000,    // 持续时间
        particleCount: 150,  // 粒子数量
        spread: 70,        // 扩散范围
        startVelocity: 30, // 初始速度
        colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']  // 彩色粒子
    };

    const settings = { ...defaults, ...options };
    
    // 停止之前的特效
    confetti.stop();
    
    // 创建新的粒子
    const particles = [];
    for (let i = 0; i < settings.particleCount; i++) {
        particles.push({
            x: Math.random() * window.innerWidth,
            y: window.innerHeight + 10,
            size: Math.random() * 5 + 5,
            color: settings.colors[Math.floor(Math.random() * settings.colors.length)],
            speedX: (Math.random() - 0.5) * settings.spread,
            speedY: -Math.random() * settings.startVelocity,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10
        });
    }
    
    // 更新粒子动画
    confetti.particles = particles;
    confetti.start();
    
    // 设置定时器停止特效
    setTimeout(() => confetti.stop(), settings.duration);
};

// 添加一些预设的特效模式
window.confettiEffects = {
    // 瀑布效果
    waterfall: () => {
        triggerFancyConfetti({
            particleCount: 200,
            spread: 30,
            startVelocity: 15,
            colors: ['#FFD700', '#FFA500', '#FF6347', '#FF69B4', '#DDA0DD']
        });
    },
    
    // 爆炸效果
    explosion: () => {
        triggerFancyConfetti({
            particleCount: 300,
            spread: 100,
            startVelocity: 45,
            colors: ['#FF0000', '#FF69B4', '#FF4500', '#FFD700', '#FF6347']
        });
    },
    
    // 彩虹效果
    rainbow: () => {
        triggerFancyConfetti({
            particleCount: 250,
            spread: 60,
            startVelocity: 35,
            colors: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#8B00FF']
        });
    },
    
    // 金色庆典效果
    golden: () => {
        triggerFancyConfetti({
            particleCount: 180,
            spread: 50,
            startVelocity: 25,
            colors: ['#FFD700', '#FFA500', '#DAA520', '#B8860B', '#CD853F']
        });
    }
};

// 添加烟花特效函数
window.triggerFireworks = function(options = {}) {
    const defaults = {
        duration: 5000,      // 持续时间
        rocketCount: 5,      // 烟花发射数量
        particlesPerRocket: 50,  // 每个烟花爆炸后的粒子数
        colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']
    };

    const settings = { ...defaults, ...options };
    
    // 停止之前的特效
    confetti.stop();
    
    // 发射烟花
    function launchRocket() {
        // 烟花起始位置（底部随机位置）
        const startX = Math.random() * window.innerWidth;
        const endX = startX + (Math.random() - 0.5) * 200;  // 轻微偏移
        const endY = 200 + Math.random() * (window.innerHeight * 0.5);  // 爆炸高度
        
        // 创建上升的火箭
        const rocket = {
            x: startX,
            y: window.innerHeight,
            targetX: endX,
            targetY: endY,
            color: settings.colors[Math.floor(Math.random() * settings.colors.length)],
            size: 3,
            phase: 'rising'  // rising 或 exploding
        };
        
        // 火箭上升动画
        const riseInterval = setInterval(() => {
            // 更新火箭位置
            const dx = (rocket.targetX - rocket.x) * 0.05;
            const dy = (rocket.targetY - rocket.y) * 0.05;
            rocket.x += dx;
            rocket.y += dy;
            
            // 检查是否到达目标高度
            if (Math.abs(rocket.y - rocket.targetY) < 10) {
                clearInterval(riseInterval);
                // 爆炸效果
                explodeRocket(rocket);
            }
            
            // 绘制上升轨迹
            confetti.particles = [{
                x: rocket.x,
                y: rocket.y,
                size: rocket.size,
                color: rocket.color,
                speedX: 0,
                speedY: -2,
                phase: 'rising'
            }];
            confetti.start();
        }, 20);
    }
    
    // 烟花爆炸效果
    function explodeRocket(rocket) {
        const particles = [];
        for (let i = 0; i < settings.particlesPerRocket; i++) {
            const angle = (Math.PI * 2 * i) / settings.particlesPerRocket;
            const velocity = 5 + Math.random() * 5;
            const particle = {
                x: rocket.x,
                y: rocket.y,
                size: 2 + Math.random() * 2,
                color: rocket.color,
                speedX: Math.cos(angle) * velocity,
                speedY: Math.sin(angle) * velocity,
                phase: 'exploding',
                alpha: 1,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 10
            };
            particles.push(particle);
        }
        
        // 爆炸动画
        let frame = 0;
        const explodeInterval = setInterval(() => {
            frame++;
            particles.forEach(particle => {
                // 更新粒子位置
                particle.x += particle.speedX;
                particle.y += particle.speedY;
                particle.speedY += 0.1;  // 重力效果
                particle.alpha -= 0.02;  // 淡出效果
                
                if (particle.alpha <= 0) {
                    particle.alpha = 0;
                }
            });
            
            // 更新粒子
            confetti.particles = particles.filter(p => p.alpha > 0);
            confetti.start();
            
            // 结束动画
            if (frame > 50) {
                clearInterval(explodeInterval);
            }
        }, 20);
    }
    
    // 发射多个烟花
    let rocketLaunched = 0;
    const launchInterval = setInterval(() => {
        launchRocket();
        rocketLaunched++;
        if (rocketLaunched >= settings.rocketCount) {
            clearInterval(launchInterval);
        }
    }, 300);
    
    // 设置定时器停止特效
    setTimeout(() => confetti.stop(), settings.duration);
};

// 添加预设烟花效果
window.fireworkEffects = {
    // 节日庆典
    celebration: () => {
        triggerFireworks({
            rocketCount: 8,
            particlesPerRocket: 60,
            colors: ['#FFD700', '#FF0000', '#00FF00', '#0000FF', '#FF00FF']
        });
    },
    
    // 金色盛典
    golden: () => {
        triggerFireworks({
            rocketCount: 5,
            particlesPerRocket: 50,
            colors: ['#FFD700', '#FFA500', '#DAA520', '#B8860B']
        });
    },
    
    // 彩虹烟花
    rainbow: () => {
        triggerFireworks({
            rocketCount: 7,
            particlesPerRocket: 40,
            colors: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#8B00FF']
        });
    }
}; 