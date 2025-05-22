function registerDrag() {
  console.log('正在注册拖动事件');

  // 修改为只监听live2d画布区域
  const waifuElement = document.getElementById('waifu');
  const dragElement = document.getElementById('live2d');
  if (!waifuElement || !dragElement) {
    console.error('无法找到waifu或live2d元素，拖动注册失败');
    return;
  }

  // 定义变量
  let isDragging = false;
  let initialX = 0;
  let initialY = 0;
  let lastX = 0;
  let lastY = 0;

  // 窗口起始位置
  let windowX = 0;
  let windowY = 0;

  // 动画帧ID
  let animationFrameId: number | null = null;

  // 获取全局电子API
  const electronAPI = (window as any).electronAPI;

  // 初始化时尝试获取当前窗口位置
  const initPosition = async () => {
    try {
      if (electronAPI?.getPosition) {
        const position = await electronAPI.getPosition();
        if (Array.isArray(position) && position.length === 2) {
          windowX = position[0];
          windowY = position[1];
        }
      }
    } catch (err) {
      console.error('获取初始窗口位置失败:', err);
    }
  };

  // 立即执行获取初始位置
  initPosition();

  // 移动动画函数
  const moveWindow = () => {
    if (!isDragging) return;

    try {
      if (electronAPI && electronAPI.setPosition) {
        // 确保坐标为整数
        const newX = Math.round(windowX);
        const newY = Math.round(windowY);

        // 发送位置更新
        electronAPI.setPosition(newX, newY);
      }
    } catch (err) {
      console.error('设置窗口位置失败:', err);
      stopDragging();
    }
  };

  // 鼠标移动处理函数
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    // 计算移动距离
    const deltaX = e.screenX - lastX;
    const deltaY = e.screenY - lastY;

    // 如果鼠标没有移动，则不更新
    if (deltaX === 0 && deltaY === 0) return;

    // 更新窗口位置
    windowX += deltaX;
    windowY += deltaY;

    // 更新上次鼠标位置
    lastX = e.screenX;
    lastY = e.screenY;
  };

  // 停止拖动
  const stopDragging = () => {
    isDragging = false;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopDragging);
  };

  // 动画循环
  const animationLoop = () => {
    moveWindow();
    if (isDragging) {
      animationFrameId = requestAnimationFrame(animationLoop);
    }
  };

  // 开始拖动
  const startDragging = async (e: MouseEvent) => {
    // 忽略右键点击
    if (e.button === 2) return;

    e.preventDefault();

    // 获取最新窗口位置
    try {
      if (electronAPI?.getPosition) {
        const position = await electronAPI.getPosition();
        if (Array.isArray(position) && position.length === 2) {
          windowX = position[0];
          windowY = position[1];
        }
      }
    } catch (err) {
      console.error('获取窗口位置失败:', err);
    }

    // 记录鼠标初始位置
    initialX = lastX = e.screenX;
    initialY = lastY = e.screenY;

    // 标记开始拖动
    isDragging = true;

    // 添加事件监听
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopDragging);

    // 启动动画循环
    animationFrameId = requestAnimationFrame(animationLoop);
  };

  // 鼠标按下事件 - 只在live2d画布上监听
  dragElement.addEventListener('mousedown', startDragging);

  console.log('拖动事件注册成功');

  // 返回一个清理函数，用于在重新注册前移除旧事件
  return () => {
    if (dragElement) {
      dragElement.removeEventListener('mousedown', startDragging);
    }

    // 确保停止所有正在进行的拖动操作
    stopDragging();

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    console.log('拖动事件监听已移除');
  };
}

export default registerDrag;
