/**
 * @file Contains functions for initializing the waifu widget.
 * @module widget
 */

import { ModelManager, Config, ModelList } from './model';
import { showMessage, welcomeMessage, Time } from './message';
import { randomSelection, customFetch, loadExternalResource } from './utils';
import tools from './tools';
import logger from './logger';
import registerDrag from './drag';
import { fa_child } from './icons';
import { getCache, setCache, removeCache } from './cache';

interface Tips {
  /**
   * Default message configuration.
   */
  message: {
    /**
     * Default message array.
     * @type {string[]}
     */
    default: string[];
    /**
     * Console message.
     * @type {string}
     */
    console: string;
    /**
     * Copy message.
     * @type {string}
     */
    copy: string;
    /**
     * Visibility change message.
     * @type {string}
     */
    visibilitychange: string;
    changeSuccess: string;
    changeFail: string;
    photo: string;
    goodbye: string;
    hitokoto: string;
    welcome: string;
  };
  /**
   * Time configuration.
   * @type {Time}
   */
  time: Time;
  /**
   * Mouseover message configuration.
   * @type {Array<{selector: string, text: string | string[]}>}
   */
  mouseover: {
    selector: string;
    text: string | string[];
  }[];
  /**
   * Click message configuration.
   * @type {Array<{selector: string, text: string | string[]}>}
   */
  click: {
    selector: string;
    text: string | string[];
  }[];
  /**
   * Season message configuration.
   * @type {Array<{date: string, text: string | string[]}>}
   */
  seasons: {
    date: string;
    text: string | string[];
  }[];
  models: ModelList[];
}

function registerTools(model: ModelManager, config: Config, tips: Tips | null) {
  tools['switch-model'].callback = async () => {
    try {
      await model.loadNextModel();
    } catch (err) {
      console.error('切换模型失败:', err);
    }
  };
  tools['switch-texture'].callback = async () => {
    try {
      let successMessage = '', failMessage = '';
      if (tips) {
        successMessage = tips.message.changeSuccess;
        failMessage = tips.message.changeFail;
      }
      await model.loadRandTexture(successMessage, failMessage);
    } catch (err) {
      console.error('切换纹理失败:', err);
      showMessage('切换纹理失败', 4000, 10);
    }
  };

  if (tips) {
    tools.hitokoto.callback = tools.hitokoto.callback.bind(null, tips.message.hitokoto);
    tools.photo.callback = tools.photo.callback.bind(null, tips.message.photo);
    tools.quit.callback = tools.quit.callback.bind(null, tips.message.goodbye);
  }
  if (!Array.isArray(config.tools)) {
    config.tools = Object.keys(tools);
  }
  for (const toolName of config.tools!) {
    if (tools[toolName]) {
      const { icon, callback } = tools[toolName];
      const waifuTool = document.getElementById('waifu-tool');
      if (!waifuTool) continue;

      waifuTool.insertAdjacentHTML(
        'beforeend',
        `<span id="waifu-tool-${toolName}">${icon}</span>`,
      );
      const toolElement = document.getElementById(`waifu-tool-${toolName}`);
      if (toolElement) {
        toolElement.addEventListener('click', callback);
      }
    }
  }
}

/**
 * Register event listeners.
 * @param {Tips} tips - Result configuration.
 */
function registerEventListener(tips: Tips | null) {
  if (!tips) return;
  // Detect user activity and display messages when idle
  let userAction = false;
  let userActionTimer: any;
  const messageArray = tips.message.default;
  let lastHoverElement: any;
  window.addEventListener('mousemove', () => (userAction = true));
  window.addEventListener('keydown', () => (userAction = true));
  setInterval(() => {
    if (userAction) {
      userAction = false;
      clearInterval(userActionTimer);
      userActionTimer = null;
    } else if (!userActionTimer) {
      userActionTimer = setInterval(() => {
        showMessage(messageArray, 6000, 9);
      }, 20000);
    }
  }, 1000);
  showMessage(welcomeMessage(tips.time, tips.message.welcome), 7000, 11);
  window.addEventListener('mouseover', (event) => {
    // eslint-disable-next-line prefer-const
    for (let { selector, text } of tips.mouseover) {
      if (!(event.target as HTMLElement)?.closest(selector)) continue;
      if (lastHoverElement === selector) return;
      lastHoverElement = selector;
      text = randomSelection(text);
      text = (text as string).replace(
        '{text}',
        (event.target as HTMLElement).innerText,
      );
      showMessage(text, 4000, 8);
      return;
    }
  });
  window.addEventListener('click', (event) => {
    // eslint-disable-next-line prefer-const
    for (let { selector, text } of tips.click) {
      if (!(event.target as HTMLElement)?.closest(selector)) continue;
      text = randomSelection(text);
      text = (text as string).replace(
        '{text}',
        (event.target as HTMLElement).innerText,
      );
      showMessage(text, 4000, 8);
      return;
    }
  });
  tips.seasons.forEach(({ date, text }) => {
    const now = new Date(),
      after = date.split('-')[0],
      before = date.split('-')[1] || after;
    if (
      Number(after.split('/')[0]) <= now.getMonth() + 1 &&
      now.getMonth() + 1 <= Number(before.split('/')[0]) &&
      Number(after.split('/')[1]) <= now.getDate() &&
      now.getDate() <= Number(before.split('/')[1])
    ) {
      text = randomSelection(text);
      text = (text as string).replace('{year}', String(now.getFullYear()));
      messageArray.push(text);
    }
  });

  const devtools = () => { };
  console.log('%c', devtools);
  devtools.toString = () => {
    showMessage(tips.message.console, 6000, 9);
  };
  window.addEventListener('copy', () => {
    showMessage(tips.message.copy, 6000, 9);
  });
  window.addEventListener('visibilitychange', () => {
    if (!document.hidden)
      showMessage(tips.message.visibilitychange, 6000, 9);
  });
}

/**
 * Load the waifu widget.
 * @param {Config} config - Waifu configuration.
 */
async function loadWidget(config: Config) {
  // 清理之前可能存在的拖动注册
  if (typeof window.cleanupDrag === 'function') {
    try {
      window.cleanupDrag();
      window.cleanupDrag = undefined;
    } catch (err) {
      console.error('清理拖动注册失败:', err);
    }
  }

  await removeCache('waifu-display');
  sessionStorage.removeItem('waifu-text');

  // 创建初始化加载提示
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="waifu-init-indicator" style="position: fixed; bottom: 0; left: 0; width: 250px; background: rgba(255, 255, 255, 0.9); 
      border-radius: 8px; box-shadow: 0 3px 15px rgba(0, 0, 0, 0.2); padding: 10px; z-index: 1000; text-align: center;">
      <div style="font-size: 14px; margin-bottom: 8px;">正在初始化看板娘...</div>
      <div style="width: 100%; height: 4px; background: #eee; border-radius: 2px; overflow: hidden;">
        <div id="waifu-init-progress" style="width: 0%; height: 100%; background: #0084ff; transition: width 0.3s;"></div>
      </div>
    </div>`
  );

  // 更新初始化进度条
  let progress = 0;
  const updateProgress = (percent: number) => {
    const progressBar = document.getElementById('waifu-init-progress');
    if (progressBar) {
      progress = percent;
      progressBar.style.width = `${percent}%`;
    }
  };

  // 开始进度条动画
  updateProgress(10);

  // 定时更新进度，模拟加载过程
  const progressInterval = setInterval(() => {
    if (progress < 80) {
      updateProgress(progress + Math.random() * 8);
    }
  }, 200);

  // 设置初始化超时处理（1分钟）
  const initTimeout = setTimeout(() => {
    // 如果1分钟后还没初始化完成
    if (!window.isInitialized) {
      console.warn('初始化超时，自动切换到第一个模型');

      // 更新进度到100%
      updateProgress(100);

      // 移除加载指示器和可能存在的旧DOM元素
      const initIndicator = document.getElementById('waifu-init-indicator');
      if (initIndicator) {
        initIndicator.style.opacity = '0';
        initIndicator.style.transition = 'opacity 0.5s';
        setTimeout(() => {
          initIndicator.remove();
          clearInterval(progressInterval);
        }, 500);
      }

      // 清理之前的waifu元素，避免重复
      const oldWaifu = document.getElementById('waifu');
      if (oldWaifu) {
        oldWaifu.remove();
      }

      // 重新创建waifu容器
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div id="waifu">
           <div id="waifu-tips"></div>
           <div id="waifu-canvas">
             <canvas id="live2d" width="800" height="800"></canvas>
           </div>
           <div id="waifu-tool"></div>
         </div>`
      );

      // 设置初始化完成标志
      window.isInitialized = true;

      // 清除初始化超时定时器
      clearTimeout(initTimeout);

      // 尝试创建一个新的ModelManager实例并加载第一个模型
      (async () => {
        try {
          console.log('开始执行超时处理，清除缓存并重置模型...');
          // 清除所有相关缓存，确保从头开始
          await removeCache('modelId');
          await removeCache('modelTexturesId');
          await removeCache('modelName');

          // 重置modelId到0，确保加载第一个模型
          await setCache('modelId', 0);
          await setCache('modelTexturesId', 0);

          let localModels: ModelList[] = [];
          let localTips: Tips | null = null;

          // 创建一个新的配置
          const newConfig = { ...config };

          // 先尝试使用本地模型
          if (config.waifuPath) {
            try {
              console.log('尝试加载本地配置文件...');
              const response = await customFetch(config.waifuPath);
              localTips = await response.json();
              if (localTips && localTips.models && localTips.models.length > 0) {
                localModels = localTips.models;
                console.log('成功加载本地模型列表，模型数量:', localModels.length);

                // 使用本地模型，禁用CDN
                newConfig.cdnPath = undefined;
                newConfig.apiPath = undefined;
              } else {
                console.warn('本地模型列表为空，将尝试使用CDN模型');
              }
            } catch (err) {
              console.error('加载配置文件失败:', err);
            }
          }

          // 如果没有本地模型但有CDN配置，使用CDN
          if (localModels.length === 0 && newConfig.cdnPath) {
            console.log('使用CDN模型...');
            // 确保CDN路径格式正确，以斜杠结尾
            newConfig.cdnPath = newConfig.cdnPath.replace(/\/$/, '') + '/';

            // 设置一个标记，表示这是强制刷新
            newConfig.forceRefresh = true;

            // 将配置保存到全局
            (window as any).config = newConfig;

            console.log('准备使用强制刷新模式，CDN路径:', newConfig.cdnPath);
          }

          // 如果既没有本地模型也没有CDN，添加一个硬编码的本地模型作为备选
          if (localModels.length === 0 && !newConfig.cdnPath) {
            console.log('无法加载模型，添加一个默认的内置模型作为备选');
            // 添加一个硬编码的默认模型
            localModels = [
              {
                name: "默认模型",
                paths: ["/assets/models/default/model.json"],
                message: "这是一个默认模型"
              }
            ];
          }

          console.log('创建新的ModelManager实例...');
          const model = await ModelManager.initCheck(newConfig, localModels);

          // 加载第一个模型
          console.log('尝试加载第一个模型...');
          await model.loadModel('');
          console.log('第一个模型加载成功！');

          // 注册工具和事件
          if (localTips) {
            registerTools(model, config, localTips);
            registerEventListener(localTips);
          }

          // 注册拖动功能
          if (config.drag) {
            window.drag = true;
            window.cleanupDrag = registerDrag();
          }

          // 设置样式
          const waifuElement = document.getElementById('waifu');
          if (waifuElement) {
            waifuElement.style.bottom = '0';
          }
        } catch (err) {
          console.error('超时后初始化模型失败:', err);
          showMessage('初始化失败，请刷新页面重试', 4000, 10);
        }
      })();
    } else {
      // 如果已初始化，清除定时器
      clearTimeout(initTimeout);
    }
  }, 60000); // 1分钟超时

  // 创建Live2D容器
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="waifu">
       <div id="waifu-tips"></div>
       <div id="waifu-canvas">
         <canvas id="live2d" width="800" height="800"></canvas>
       </div>
       <div id="waifu-tool"></div>
     </div>`,
  );

  // 更新进度
  updateProgress(30);
  let models: ModelList[] = [];
  let tips: Tips | null = null;
  if (config.waifuPath) {
    const response = await customFetch(config.waifuPath);
    tips = await response.json();
    console.log('tips===>', tips);
    if (tips) {
      models = tips.models;
      registerEventListener(tips);
    }
  }
  const model = await ModelManager.initCheck(config, models);
  // 更新进度
  updateProgress(60);

  // 通知用户正在初始化看板娘
  const initIndicator = document.getElementById('waifu-init-indicator');
  if (initIndicator) {
    const initText = initIndicator.querySelector('div');
    if (initText) {
      initText.textContent = '正在初始化看板娘...';
    }
  }

  await model.loadModel('');

  // 更新进度
  updateProgress(90);

  if (tips) {
    registerTools(model, config, tips);
  }
  // 注册拖动功能
  let cleanupDrag: (() => void) | undefined;
  if (config.drag) {
    // 设置全局标记，用于模型重新加载时重新注册拖动
    window.drag = true;
    cleanupDrag = registerDrag();
    window.cleanupDrag = cleanupDrag;
  }

  // 更新进度到100%
  updateProgress(100);

  // 设置初始化完成标志
  window.isInitialized = true;

  // 移除加载指示器
  setTimeout(() => {
    if (initIndicator) {
      initIndicator.style.opacity = '0';
      initIndicator.style.transition = 'opacity 0.5s';
      setTimeout(() => {
        initIndicator.remove();
        clearInterval(progressInterval);
      }, 500);
    }
  }, 500);

  // 确保元素存在后再设置样式
  const waifuElement = document.getElementById('waifu');
  if (waifuElement) {
    waifuElement.style.bottom = '0';
  }
}

/**
 * Initialize the waifu widget.
 * @param {string | Config} config - Waifu configuration or configuration path.
 */
async function initWidget(config: string | Config) {
  if (typeof config === 'string') {
    logger.error('Your config for Live2D initWidget is outdated. Please refer to https://github.com/stevenjoezhang/live2d-widget/blob/master/dist/autoload.js');
    return;
  }

  logger.setLevel(config.logLevel);

  // 初始化时检查并应用置顶状态
  const electronAPI = (window as any).electronAPI;
  if (electronAPI && electronAPI.setAlwaysOnTop) {
    const alwaysOnTop = await getCache<boolean>('waifu-always-on-top');
    electronAPI.setAlwaysOnTop(alwaysOnTop === true);
  }

  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="waifu-toggle">
       ${fa_child}
     </div>`,
  );
  const toggle = document.getElementById('waifu-toggle');
  toggle?.addEventListener('click', async () => {
    if (!toggle) return;

    toggle.classList.remove('waifu-toggle-active');
    if (toggle.getAttribute('first-time')) {
      loadWidget(config as Config);
      toggle.removeAttribute('first-time');
    } else {
      await removeCache('waifu-display');
      const waifuElement = document.getElementById('waifu');
      if (waifuElement) {
        waifuElement.style.display = '';
        setTimeout(() => {
          if (waifuElement) {
            waifuElement.style.bottom = '0';
          }
        }, 0);
      }
    }
  });

  const displayTime = await getCache<number>('waifu-display');
  if (displayTime && Date.now() - displayTime <= 86400000) {
    toggle?.setAttribute('first-time', 'true');
    setTimeout(() => {
      toggle?.classList.add('waifu-toggle-active');
    }, 0);
  } else {
    loadWidget(config as Config);
  }
}

export { initWidget };
export type { Tips };
