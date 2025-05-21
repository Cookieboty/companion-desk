/**
 * @file Contains functions for initializing the waifu widget.
 * @module widget
 */

import { ModelManager, Config, ModelList } from './model';
import { showMessage, welcomeMessage, Time } from './message';
import { randomSelection } from './utils';
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
  tools['switch-model'].callback = () => model.loadNextModel();
  tools['switch-texture'].callback = () => {
    let successMessage = '', failMessage = '';
    if (tips) {
      successMessage = tips.message.changeSuccess;
      failMessage = tips.message.changeFail;
    }
    model.loadRandTexture(successMessage, failMessage);
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
      document
        .getElementById('waifu-tool')!
        .insertAdjacentHTML(
          'beforeend',
          `<span id="waifu-tool-${toolName}">${icon}</span>`,
        );
      document
        .getElementById(`waifu-tool-${toolName}`)!
        .addEventListener('click', callback);
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
  await removeCache('waifu-display');
  sessionStorage.removeItem('waifu-text');
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
  let models: ModelList[] = [];
  let tips: Tips | null = null;
  if (config.waifuPath) {
    const response = await fetch(config.waifuPath);
    tips = await response.json();
    models = tips.models;
    registerEventListener(tips);
  }
  const model = await ModelManager.initCheck(config, models);
  await model.loadModel('');
  if (tips) {
    registerTools(model, config, tips);
  }
  if (config.drag) registerDrag();
  document.getElementById('waifu')!.style.bottom = '0';
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
    toggle!.classList.remove('waifu-toggle-active');
    if (toggle?.getAttribute('first-time')) {
      loadWidget(config as Config);
      toggle?.removeAttribute('first-time');
    } else {
      await removeCache('waifu-display');
      document.getElementById('waifu')!.style.display = '';
      setTimeout(() => {
        document.getElementById('waifu')!.style.bottom = '0';
      }, 0);
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
