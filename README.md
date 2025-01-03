# Snake Game

一个基于 Go + HTML5 Canvas 实现的贪吃蛇游戏。

> 特别说明：本项目是通过 AI 助手完全生成的实验性项目，包括所有的代码、文档和资源文件均由 AI 生成，没有一行代码是手动编写的（包括 README.md）。
> 这个项目展示了 AI 在现代软件开发中的能力，同时也作为一个有趣的技术探索案例。

## 功能特点

- 经典贪吃蛇玩法
- 实时分数统计
- 历史最高分记录
- 响应式设计，支持键盘控制
- 碰撞检测
- 游戏暂停/继续功能

## 技术栈

- 后端：Go
- 前端：HTML5 Canvas + JavaScript
- 样式：CSS3
- 数据存储：JSON

## 项目结构

    snake-game/
    ├── main.go              # Go 后端服务入口
    ├── scores.json          # 分数记录存储文件
    ├── README.md           # 项目说明文档
    ├── static/             # 静态资源目录
    │   ├── css/
    │   │   └── style.css   # 游戏样式表
    │   └── js/
    │       └── snake.js    # 游戏核心逻辑
    └── templates/          # 模板目录
        └── game.html       # 游戏页面模板

每个文件的主要功能：

- `main.go`: 提供 Web 服务器功能，处理路由和请求
- `scores.json`: 存储游戏分数记录
- `static/css/style.css`: 定义游戏界面样式
- `static/js/snake.js`: 实现贪吃蛇游戏的核心逻辑
- `templates/game.html`: 游戏的 HTML 模板
- `README.md`: 项目说明文档

## 安装和运行

### 前置要求

- Go 1.22 或更高版本
- 现代浏览器（支持 HTML5 Canvas）

### 安装步骤

1. 克隆项目

    git clone https://github.com/haozishuizhaole/snake.git
    cd snake

2. 安装依赖

    go mod init snake
    go mod tidy

### 运行方式

1. 启动服务器

    go run main.go

2. 访问游戏
   在浏览器中打开 `http://localhost:8080`

### 游戏控制

- 方向键控制蛇的移动
  - ↑: 向上移动
  - ↓: 向下移动
  - ←: 向左移动
  - →: 向右移动
- 空格键: 暂停/继续游戏
- ESC键: 重新开始游戏

### 开发模式

如果您想进行开发或调试：

1. 修改代码后直接刷新浏览器即可看到更改
2. 服务器支持热重载，修改 Go 代码后会自动重启

