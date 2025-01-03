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
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            sessionId = doc.getElementById('sessionId').value;
        })
        .catch(error => console.error('获取新 sessionId 失败:', error));
    
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
function showGameContainer() {
    // 隐藏欢迎界面
    const welcomeScreen = document.getElementById('welcomeScreen');
    welcomeScreen.style.display = 'none';
    
    // 显示游戏界面
    const gameContainer = document.getElementById('gameContainer');
    gameContainer.style.display = 'block';
    document.getElementById('startScreen').style.display = 'block';
    document.getElementById('currentPlayerName').textContent = playerName;
    
    // 重置游戏状态
    resetGame();
    
    // 设置 5 秒后启动 AI 游戏
    startAICountdown();
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

    // 画蛇
    ctx.fillStyle = 'green';
    snake.forEach(segment => {
        ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize - 2, gridSize - 2);
    });

    // 画食物
    ctx.font = `${gridSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🍊', 
        food.x * gridSize + gridSize/2,
        food.y * gridSize + gridSize/2
    );
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

    // 检查是否会撞墙或撞到自己（除了尾部）
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

    // 提交分数并处理结果
    submitScore();
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

// 更新排行榜
async function updateScoreboard() {
    try {
        const response = await fetch('/get-scores');
        if (!response.ok) {
            throw new Error('获取排行榜失败');
        }
        
        const scores = await response.json();
        const rankings = document.getElementById('rankings');
        if (!rankings) {
            throw new Error('找不到排行榜元素');
        }
        
        const rankingsHtml = scores.length > 0 ? scores
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
                        <span class="player-name">${score.name || '未知玩家'}</span>
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

// 修改回放点击处理函数
async function handleReplayClick(element, playerName) {
    if (isReplaying) return;
    
    try {
        // 禁用点击
        element.style.opacity = '0.5';
        element.style.pointerEvents = 'none';
        
        // 获取回放数据
        const response = await fetch(`/get-replay?name=${encodeURIComponent(playerName)}`);
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
        
        // 构建提示文字
        replayIndicator.innerHTML = `
            <span class="replay-icon">🎬</span>
            <span class="replay-text">正在回放 <strong>${playerName}</strong> 的精彩记录</span>
            <span class="replay-score">${playerScore}分</span>
        `;
        
        document.querySelector('.game-area').appendChild(replayIndicator);
        
        function playNextStep() {
            if (stepIndex >= steps.length) {
                isReplaying = false;
                document.getElementById('startScreen').style.display = 'block';
                replayIndicator.remove();
                resetReplayButton(replayButton);
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
            setTimeout(playNextStep, 100);  // 控制回放速度
        }
        
        playNextStep();
        
    } catch (error) {
        console.error('回放错误:', error);
        alert('回放出错，请稍后再试');
        isReplaying = false;
        document.getElementById('startScreen').style.display = 'block';
        resetReplayButton(replayButton);
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

        // 处理响应
        const result = await response.json();
        
        // 显示游戏结束界面
        const gameOverDiv = document.getElementById('gameOver');
        gameOverDiv.style.display = 'block';
        
        // 更新分数和玩家名称显示
        document.getElementById('finalScore').textContent = score;
        document.getElementById('playerNameDisplay').textContent = playerName;
        
        // 根据是否破纪录显示特效
        if (result.isNewRecord) {
            startConfetti();
            document.getElementById('newRecord').style.display = 'block';
        } else {
            document.getElementById('newRecord').style.display = 'none';
        }

        // 更新排行榜
        await updateScoreboard();
        
    } catch (error) {
        console.error('提交分数失败:', error);
        alert('提交分数失败: ' + error.message);
        
        // 出错时也显示游戏结束界面，但不显示破纪录提示
        const gameOverDiv = document.getElementById('gameOver');
        gameOverDiv.style.display = 'block';
        document.getElementById('finalScore').textContent = score;
        document.getElementById('playerNameDisplay').textContent = playerName;
        document.getElementById('newRecord').style.display = 'none';
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