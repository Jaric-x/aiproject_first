// index.js
Page({
  data: {
    highScore: 0
  },

  onLoad() {
    this.loadHighScore();
  },

  onShow() {
    // 每次显示页面时重新加载最高分
    this.loadHighScore();
  },

  // 加载最高分
  loadHighScore() {
    const highScore = wx.getStorageSync('highScore') || 0;
    this.setData({ highScore });
  },

  // 开始游戏
  startGame() {
    wx.navigateTo({
      url: '/pages/game/game'
    });
  },

  // 查看游戏规则
  viewRules() {
    wx.showModal({
      title: '游戏规则',
      content: '1. 点击屏幕控制小人跳跃\n2. 根据按压时间长短决定跳跃距离\n3. 成功落在平台上得分\n4. 错过平台游戏结束\n5. 挑战你的最高分！',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
