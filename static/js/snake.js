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
let playerName = '';
let lastGameEndTime = 0;
let countdownTimer = null;
let personalBestScore = 0;

document.addEventListener('keydown', changeDirection);
updateScoreboard();
// 初始化游戏状态
resetGame();
// 绘制初始状态
draw();

// 获取玩家历史最高分
function getPersonalBestScore() {
    fetch('/get-scores')
        .then(response => response.json())
        .then(scores => {
            // 在所有分数中找到当前玩家的最高分
            const playerScores = scores.filter(s => s.name === playerName);
            if (playerScores.length > 0) {
                personalBestScore = Math.max(...playerScores.map(s => s.score));
            }
        });
}

// 提交玩家名字
function submitName() {
    const nameInput = document.getElementById('playerName').value.trim();
    if (!nameInput) {
        alert('请输入昵称！');
        return;
    }
    
    playerName = nameInput;
    // 获取该玩家的历史最高分
    getPersonalBestScore();
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';
    document.getElementById('startScreen').style.display = 'block';
    document.getElementById('playerNameDisplay').textContent = playerName;
    document.getElementById('currentPlayerName').textContent = playerName;
}

// 隐藏游戏结束对话框
function hideGameOver() {
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('startScreen').style.display = 'block';
    confetti.stop();
}

function startGame() {
    if (gameStarted) return;
    
    // 检查是否可以开始新游戏
    const now = Date.now();
    const timeSinceLastGame = (now - lastGameEndTime) / 1000;
    if (timeSinceLastGame < minInterval) {
        alert(`请等待 ${Math.ceil(minInterval - timeSinceLastGame)} 秒后再开始新游戏`);
        return;
    }
    
    // 开始倒计时
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
    // 移动蛇
    const head = {x: snake[0].x + dx, y: snake[0].y + dy};
    
    // 检查碰撞
    if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount || checkCollision(head)) {
        gameOver();
        return;
    }

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

    const LEFT = 37;
    const RIGHT = 39;
    const UP = 38;
    const DOWN = 40;

    const keyPressed = event.keyCode;
    const goingUp = dy === -1;
    const goingDown = dy === 1;
    const goingRight = dx === 1;
    const goingLeft = dx === -1;

    if (keyPressed === LEFT && !goingRight) {
        dx = -1;
        dy = 0;
    }
    if (keyPressed === UP && !goingDown) {
        dx = 0;
        dy = -1;
    }
    if (keyPressed === RIGHT && !goingLeft) {
        dx = 1;
        dy = 0;
    }
    if (keyPressed === DOWN && !goingUp) {
        dx = 0;
        dy = 1;
    }
}

function generateFood() {
    food.x = Math.floor(Math.random() * tileCount);
    food.y = Math.floor(Math.random() * tileCount);
}

function checkCollision(head) {
    return snake.some(segment => segment.x === head.x && segment.y === head.y);
}

// 撒花特效类
class Confetti {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.active = false;
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createParticle() {
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
        return {
            x: Math.random() * this.canvas.width,
            y: -20,
            rotation: Math.random() * 360,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 10 + 5,
            speedY: Math.random() * 3 + 2,
            speedRotation: Math.random() * 10 - 5,
            speedX: Math.random() * 4 - 2,
        };
    }

    start() {
        this.active = true;
        this.particles = [];
        this.animate();
        // 每帧添加新的粒子
        this.addParticlesInterval = setInterval(() => {
            if (this.particles.length < 100) {  // 限制最大粒子数
                this.particles.push(this.createParticle());
            }
        }, 50);
    }

    stop() {
        this.active = false;
        clearInterval(this.addParticlesInterval);
    }

    animate() {
        if (!this.active) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.particles.forEach((p, index) => {
            p.y += p.speedY;
            p.x += p.speedX;
            p.rotation += p.speedRotation;

            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate((p.rotation * Math.PI) / 180);
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
            this.ctx.restore();

            // 移除超出屏幕的粒子
            if (p.y > this.canvas.height + 20) {
                this.particles.splice(index, 1);
            }
        });

        requestAnimationFrame(() => this.animate());
    }

    startSpecial() {
        this.active = true;
        this.particles = [];
        this.animate();
        
        // 创建更多、更绚丽的粒子
        this.addParticlesInterval = setInterval(() => {
            if (this.particles.length < 200) {  // 增加粒子数量
                // 添加普通粒子
                this.particles.push(this.createParticle());
                
                // 添加特殊粒子
                this.particles.push(this.createSpecialParticle());
            }
        }, 30);  // 更快的粒子生成速度
    }
    
    createSpecialParticle() {
        const colors = [
            '#FFD700', // 金色
            '#FFA500', // 橙色
            '#FF69B4', // 粉色
            '#00FF00', // 亮绿
            '#FF1493', // 深粉色
            '#4169E1'  // 皇家蓝
        ];
        
        return {
            x: Math.random() * this.canvas.width,
            y: -20,
            rotation: Math.random() * 360,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 15 + 10,  // 更大的粒子
            speedY: Math.random() * 2 + 1,
            speedRotation: Math.random() * 15 - 7.5,
            speedX: Math.random() * 6 - 3,
            type: 'special',
            shine: Math.random() * 360  // 用于闪烁效果
        };
    }
}

// 创建撒花效果实例
const confetti = new Confetti(document.getElementById('confettiCanvas'));

function gameOver() {
    clearInterval(gameLoop);
    if (countdownTimer) {
        clearTimeout(countdownTimer);
        countdownTimer = null;
    }
    gameLoop = null;
    gameStarted = false;
    lastGameEndTime = Date.now();
    document.getElementById('finalScore').textContent = score;
    document.getElementById('playerNameDisplay').textContent = playerName;
    
    // 检查是否破纪录
    const newRecord = document.getElementById('newRecord');
    // 只有当前分数大于历史最高分时才显示破纪录提示
    if (score > personalBestScore) {
        newRecord.style.display = 'block';
        personalBestScore = score;  // 更新最高分
        confetti.startSpecial();    // 触发特殊特效
    } else {
        newRecord.style.display = 'none';
        confetti.start();          // 触发普通特效
    }
    
    document.getElementById('gameOver').style.display = 'block';
    // 自动提交分数
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

function updateScoreboard() {
    fetch('/get-scores')
        .then(response => response.json())
        .then(scores => {
            const rankings = document.getElementById('rankings');
            rankings.innerHTML = scores
                .map((score, index) => {
                    let prefix = `${index + 1}.`;
                    let className = '';
                    
                    // 为前三名添加奖杯图标和特殊样式
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
                            <span class="player-name">${score.name}</span>
                            <span class="player-score">${score.score}</span>
                        </div>
                    `;
                })
                .join('');
        });
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
    document.getElementById('scoreSpan').textContent = score;
    generateFood();
}

function submitScore() {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = generateNonce();
    const scoreData = {
        name: playerName,
        score: score,
        sessionId: sessionId,
        timestamp: timestamp,
        nonce: nonce,
        hash: generateScoreHash(sessionId, score, timestamp, nonce)
    };

    fetch('/submit-score', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(scoreData)
    }).then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                throw new Error(text);
            });
        }
        return response;
    }).then(() => {
        updateScoreboard();
    }).catch(error => {
        alert('提交分数失败: ' + error.message);
    });
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