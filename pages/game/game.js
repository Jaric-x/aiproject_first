// game.js
Page({
  data: {
    gameState: 'playing', // playing, paused, ended
    currentScore: 0,
    isNewRecord: false,
    
    // 游戏对象
    canvas: null,
    ctx: null,
    gameWidth: 0,
    gameHeight: 0,
    
    // 相机/视野
    cameraOffsetX: 0,
    cameraLeftMargin: 80,
    cameraTargetX: 0,
    cameraMoveSpeed: 8, // 每帧推进像素（约60fps）

    // 平台参数
    minPlatformSpacing: 20, // 平台最小间距（可调整）
    maxPlatformSpacing: 160, // 平台最大间距（可调整）
    platformWidth: 80,
    platformHeight: 20,
    platformGroundOffset: 300, // 平台距离底部的高度

    // 跳跃参数（线性映射）
    pressMsForFullPower: 800, // ms，按压达到满功率的时间
    jumpHorizontalSpeedPerUnit: 4, // 横向速度系数（单位功率对应的速度 px/帧）
    jumpVerticalVelocity: -9, // 固定竖直初速度（px/帧），决定滞空时间

    // 按压进度条状态
    isPressing: false,
    pressProgress: 0,     // 0.0 ~ 1.0
    pressDirection: 1,    // 1 递增，-1 递减
    progressPercent: 0,   // 0~100，便于样式绑定

    // 计分辅助：最近一次落地的平台索引
    lastLandedPlatformIndex: -1,
    
    // 游戏状态
    isJumping: false,
    jumpPower: 0,
    maxJumpPower: 100,
    jumpStartTime: 0,
    
    // 小人属性
    player: {
      x: 0,
      y: 0,
      width: 20,
      height: 30,
      velocityX: 0,
      velocityY: 0,
      onGround: false
    },
    
    // 平台数组
    platforms: [],
    
    // 游戏循环
    gameLoop: null,
    lastTime: 0,
    
    // 物理常量
    gravity: 0.3,
    friction: 0.8,
    jumpForce: -8
  },

  onLoad() {
    // 延迟初始化Canvas，确保页面完全加载
    setTimeout(() => {
      this.initCanvas();
    }, 100);
  },

  onUnload() {
    this.stopGameLoop();
  },

  // 保存最高分
  saveHighScore(score) {
    const highScore = wx.getStorageSync('highScore') || 0;
    if (score > highScore) {
      this.setData({ 
        isNewRecord: true 
      });
      wx.setStorageSync('highScore', score);
    }
  },

  // 初始化画布
  initCanvas() {
    // 使用传统Canvas API
    const canvas = wx.createCanvasContext('gameCanvas', this);
    
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    const gameWidth = systemInfo.windowWidth;
    const gameHeight = systemInfo.windowHeight;
    
    this.setData({
      canvas: canvas,
      ctx: canvas,
      gameWidth: gameWidth,
      gameHeight: gameHeight
    });
    
    console.log('Canvas initialized:', gameWidth, gameHeight);
    this.initGame();
    this.startGameLoop();
  },

  // 初始化游戏
  initGame() {
    this.generateInitialPlatforms();
    this.resetPlayer();
    // 初始化相机，使玩家出现在左侧预留位置
    const initialCamera = Math.max(0, this.data.player.x - this.data.cameraLeftMargin);
    // 起始平台索引为 0，作为落地基准（不计分）
    this.setData({ cameraOffsetX: initialCamera, cameraTargetX: initialCamera, lastLandedPlatformIndex: 0 });
    console.log('Game initialized:', this.data.player, this.data.platforms);
    this.draw();
  },

  // 生成初始平台
  generateInitialPlatforms() {
    const platforms = [];
    const platformWidth = this.data.platformWidth;
    const platformHeight = this.data.platformHeight;
    const groundY = this.data.gameHeight - this.data.platformGroundOffset;
    const minSpacing = this.data.minPlatformSpacing;
    const maxSpacing = this.data.maxPlatformSpacing;
    
    // 起始平台
    platforms.push({
      x: 50,
      y: groundY,
      width: platformWidth,
      height: platformHeight,
      type: 'start'
    });
    
    // 生成初始可视范围内的平台
    let currentX = 50 + platformWidth;
    const targetRight = this.data.cameraOffsetX + this.data.gameWidth + 300; // 右侧缓冲
    while (currentX < targetRight) {
      const spacing = minSpacing + Math.random() * (maxSpacing - minSpacing);
      currentX += spacing;
      platforms.push({
        x: currentX,
        y: groundY,
        width: platformWidth,
        height: platformHeight,
        type: 'normal'
      });
      currentX += platformWidth;
    }
    
    this.setData({ platforms });
  },

  // 重置玩家位置
  resetPlayer() {
    const startPlatform = this.data.platforms[0];
    this.setData({
      'player.x': startPlatform.x + startPlatform.width / 2 - 10,
      'player.y': startPlatform.y - 30,
      'player.velocityX': 0,
      'player.velocityY': 0,
      'player.onGround': true
    });
  },


  // 暂停游戏
  pauseGame() {
    this.setData({ gameState: 'paused' });
    this.stopGameLoop();
  },

  // 继续游戏
  resumeGame() {
    this.setData({ gameState: 'playing' });
    this.startGameLoop();
  },

  // 重新开始
  restartGame() {
    this.setData({
      gameState: 'playing',
      currentScore: 0,
      isNewRecord: false
    });
    this.initGame();
    this.startGameLoop();
  },

  // 返回首页
  backToStart() {
    wx.navigateBack();
  },

  // 从暂停菜单返回首页
  backToHome() {
    this.stopGameLoop();
    wx.navigateBack();
  },

  // 开始游戏循环
  startGameLoop() {
    this.lastTime = Date.now();
    this.gameLoop = setInterval(() => {
      this.update();
      this.draw();
    }, 1000 / 60); // 60fps
  },

  // 停止游戏循环
  stopGameLoop() {
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
      this.gameLoop = null;
    }
  },

  // 更新游戏状态
  update() {
    if (this.data.gameState !== 'playing') return;

    const now = Date.now();
    const deltaMs = Math.max(0, now - this.lastTime);
    this.lastTime = now;
    
    const player = this.data.player;
    
    // 按压进度更新（仅在按压时进行 0→1→0 往复）
    if (this.data.isPressing) {
      const step = deltaMs / this.data.pressMsForFullPower; // 满功率用时对应 1.0 进度
      let prog = this.data.pressProgress + this.data.pressDirection * step;
      let dir = this.data.pressDirection;
      if (prog >= 1) { prog = 1; dir = -1; }
      if (prog <= 0) { prog = 0; dir = 1; }
      const percent = Math.round(prog * 100);
      this.setData({ pressProgress: prog, pressDirection: dir, progressPercent: percent });
    }
    
    // 应用重力
    if (!player.onGround) {
      player.velocityY += this.data.gravity;
    }
    
    // 更新位置
    player.x += player.velocityX;
    player.y += player.velocityY;
    
    // 检查碰撞（可能会在此帧落地）
    this.checkCollisions();

    // 相机平滑推进到目标
    if (this.data.cameraOffsetX < this.data.cameraTargetX) {
      const diff = this.data.cameraTargetX - this.data.cameraOffsetX;
      const stepMove = Math.min(this.data.cameraMoveSpeed, diff);
      this.setData({ cameraOffsetX: this.data.cameraOffsetX + stepMove });
    }
    
    // 检查游戏结束
    this.checkGameEnd();
    
    // 更新平台
    this.updatePlatforms();
    
    this.setData({ player });
  },

  // 检查碰撞
  checkCollisions() {
    const player = this.data.player;
    const platforms = this.data.platforms;
    
    player.onGround = false;
    
    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i];
      if (this.isColliding(player, platform)) {
        // 检查是否从上方落下
        if (player.velocityY > 0 && player.y < platform.y) {
          player.y = platform.y - player.height;
          player.velocityY = 0;
          player.velocityX = 0; // 停止水平滑行
          player.onGround = true;

          // 落地后设置相机目标：保持玩家位于左侧边距
          const desiredCamera = player.x - this.data.cameraLeftMargin;
          if (desiredCamera > this.data.cameraTargetX) {
            this.setData({ cameraTargetX: desiredCamera });
          }
          
          // 计分：根据跨越的平台数量累计
          const prevIndex = this.data.lastLandedPlatformIndex;
          if (prevIndex === -1) {
            // 首次初始化，不计分，只设置索引
            this.setData({ lastLandedPlatformIndex: i });
          } else if (i > prevIndex) {
            const gained = i - prevIndex; // 跨越的平台数
            this.setData({
              currentScore: this.data.currentScore + gained,
              lastLandedPlatformIndex: i
            });
          } else if (i !== prevIndex) {
            // 落到左侧平台（一般不会发生），仅同步索引不加分
            this.setData({ lastLandedPlatformIndex: i });
          }

          break; // 已经落到某个平台，结束循环
        }
      }
    }
  },

  // 碰撞检测
  isColliding(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
  },

  // 检查游戏结束
  checkGameEnd() {
    const player = this.data.player;
    
    // 掉落出屏幕
    if (player.y > this.data.gameHeight) {
      this.endGame();
    }
    
    // 检查是否错过平台
    const platforms = this.data.platforms;
    let onAnyPlatform = false;
    
    for (let platform of platforms) {
      if (this.isColliding(player, platform)) {
        onAnyPlatform = true;
        break;
      }
    }
    
    // 如果小人在地面以下且不在任何平台上
    if (player.y > this.data.gameHeight - 100 && !onAnyPlatform) {
      this.endGame();
    }
  },

  // 更新平台
  updatePlatforms() {
    const platformWidth = this.data.platformWidth;
    const platformHeight = this.data.platformHeight;
    const groundY = this.data.gameHeight - this.data.platformGroundOffset;
    const minSpacing = this.data.minPlatformSpacing;
    const maxSpacing = this.data.maxPlatformSpacing;

    const leftWorldEdge = this.data.cameraOffsetX; // 视口左边界（世界坐标）
    const rightWorldEdge = this.data.cameraOffsetX + this.data.gameWidth + 300; // 视口右边界 + 缓冲
    
    // 移除屏幕左侧很远的平台
    let filteredPlatforms = this.data.platforms.filter(platform => 
      platform.x + platformWidth > leftWorldEdge - 300
    );
    
    // 确保右侧持续有平台：一直生成到可视范围右侧缓冲之外
    if (filteredPlatforms.length === 0) {
      // 极端情况，重建一个起始平台
      filteredPlatforms.push({
        x: leftWorldEdge,
        y: groundY,
        width: platformWidth,
        height: platformHeight,
        type: 'normal'
      });
    }
    let last = filteredPlatforms[filteredPlatforms.length - 1];
    while (last.x + last.width < rightWorldEdge) {
      const spacing = minSpacing + Math.random() * (maxSpacing - minSpacing);
      const newPlatform = {
        x: last.x + last.width + spacing,
        y: groundY,
        width: platformWidth,
        height: platformHeight,
        type: 'normal'
      };
      filteredPlatforms.push(newPlatform);
      last = newPlatform;
    }
    
    this.setData({ platforms: filteredPlatforms });
  },

  // 结束游戏
  endGame() {
    this.setData({ gameState: 'ended' });
    this.stopGameLoop();
    this.saveHighScore(this.data.currentScore);
  },

  // 绘制游戏
  draw() {
    if (!this.data.ctx) {
      console.log('No canvas context available');
      return;
    }
    
    const ctx = this.data.ctx;
    const player = this.data.player;
    const platforms = this.data.platforms;
    const cameraX = this.data.cameraOffsetX;
    
    console.log('Drawing:', player, platforms.length);
    
    // 清空画布
    ctx.clearRect(0, 0, this.data.gameWidth, this.data.gameHeight);
    
    // 测试绘制 - 先画一个简单的矩形确保Canvas工作
    ctx.setFillStyle('#FF0000');
    ctx.fillRect(50, 50, 100, 100);
    
    // 绘制背景渐变
    const gradient = ctx.createLinearGradient(0, 0, 0, this.data.gameHeight);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.setFillStyle(gradient);
    ctx.fillRect(0, 0, this.data.gameWidth, this.data.gameHeight);
    
    // 绘制平台（使用相机偏移）
    ctx.setFillStyle('#8B4513');
    platforms.forEach(platform => {
      const sx = platform.x - cameraX;
      const sy = platform.y;
      ctx.fillRect(sx, sy, platform.width, platform.height);
      // 平台边框
      ctx.setStrokeStyle('#654321');
      ctx.setLineWidth(2);
      ctx.strokeRect(sx, sy, platform.width, platform.height);
    });
    
    // 绘制小人（使用相机偏移）
    const px = player.x - cameraX;
    const py = player.y;
    ctx.setFillStyle('#FF6B6B');
    ctx.fillRect(px, py, player.width, player.height);
    
    // 小人眼睛
    ctx.setFillStyle('#FFFFFF');
    ctx.fillRect(px + 3, py + 5, 4, 4);
    ctx.fillRect(px + 13, py + 5, 4, 4);
    
    // 小人嘴巴
    ctx.setFillStyle('#000000');
    ctx.fillRect(px + 8, py + 15, 4, 2);
    
    // 提交绘制
    ctx.draw();
  },

  // 触摸开始
  onTouchStart(e) {
    if (this.data.gameState !== 'playing') return;
    if (this.data.player.onGround && !this.data.isJumping) {
      this.setData({
        isJumping: true,
        isPressing: true,
        pressDirection: 1,
        // 不重置 pressProgress，允许从当前进度继续；如需每次从0开始可改为 0
        jumpStartTime: Date.now(),
        jumpPower: 0
      });
    }
  },

  // 触摸结束
  onTouchEnd(e) {
    if (this.data.gameState !== 'playing') return;
    if (this.data.isJumping) {
      // 使用进度条的当前进度作为功率（0~1）
      const powerNorm = this.data.pressProgress;

      // 固定竖直速度，线性水平速度（始终向右）
      const vx = this.data.jumpHorizontalSpeedPerUnit * powerNorm;
      const vy = this.data.jumpVerticalVelocity;

      // 极短按压的最小水平速度
      const minVX = 0.8;
      const finalVX = powerNorm > 0 ? Math.max(minVX, vx) : 0;

      this.setData({
        'player.velocityX': finalVX,
        'player.velocityY': vy,
        isJumping: false,
        isPressing: false,
        // 可选：释放后将进度回到0，更直观
        pressProgress: 0,
        progressPercent: 0,
        jumpPower: 0
      });

      console.log('Linear jump with progress:', { powerNorm, finalVX, vy });
    }
  },

  // 触摸移动
  onTouchMove(e) {
    // 可以在这里添加触摸移动的处理逻辑
  },

  // 获取下一个平台
  getNextPlatform() {
    const platforms = this.data.platforms;
    const player = this.data.player;
    
    // 找到小人当前所在的平台
    let currentPlatformIndex = -1;
    for (let i = 0; i < platforms.length; i++) {
      if (this.isColliding(player, platforms[i])) {
        currentPlatformIndex = i;
        break;
      }
    }
    
    console.log('Current platform index:', currentPlatformIndex, 'Total platforms:', platforms.length);
    
    // 返回下一个平台
    if (currentPlatformIndex >= 0 && currentPlatformIndex < platforms.length - 1) {
      const nextPlatform = platforms[currentPlatformIndex + 1];
      console.log('Next platform:', nextPlatform);
      return nextPlatform;
    }
    
    // 如果没有找到当前平台，返回第一个平台作为目标
    if (platforms.length > 0) {
      console.log('Using first platform as target:', platforms[0]);
      return platforms[0];
    }
    
    return null;
  }
});
