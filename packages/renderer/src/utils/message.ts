/**
 * @file Contains functions for displaying waifu messages.
 * @module message
 */

import { randomSelection } from './utils.js';

type Time = {
  /**
   * Time period, format is "HH-HH", e.g. "00-06" means from 0 to 6 o'clock.
   * @type {string}
   */
  hour: string;
  /**
   * Message to display during this time period.
   * @type {string}
   */
  text: string;
}[];

let messageTimer: NodeJS.Timeout | null = null;

/**
 * Display waifu message.
 * @param {string | string[]} text - Message text or array of texts.
 * @param {number} timeout - Timeout for message display (ms).
 * @param {number} priority - Priority of the message.
 * @param {boolean} clearPrevious - Whether to immediately clear any existing message.
 */
function showMessage(
  text: string | string[],
  timeout: number,
  priority: number,
  clearPrevious: boolean = false
) {
  if (
    !text ||
    (!clearPrevious &&
      sessionStorage.getItem('waifu-text') &&
      Number(sessionStorage.getItem('waifu-text')) > priority)
  )
    return;

  // 清理现有计时器
  if (messageTimer) {
    clearTimeout(messageTimer);
    messageTimer = null;
  }

  // 如果需要立即清除之前的消息
  const tips = document.getElementById('waifu-tips');
  if (!tips) return;

  if (clearPrevious) {
    sessionStorage.removeItem('waifu-text');
    tips.classList.remove('waifu-tips-active');

    // 短暂延迟后再显示新消息
    setTimeout(() => {
      showNewMessage(text, timeout, priority, tips);
    }, 100);
  } else {
    showNewMessage(text, timeout, priority, tips);
  }
}

/**
 * 显示新消息的内部函数
 */
function showNewMessage(
  text: string | string[],
  timeout: number,
  priority: number,
  tips: HTMLElement
) {
  text = randomSelection(text) as string;
  sessionStorage.setItem('waifu-text', String(priority));

  tips.innerHTML = text;
  tips.classList.add('waifu-tips-active');

  // 设置自动隐藏的计时器
  messageTimer = setTimeout(() => {
    sessionStorage.removeItem('waifu-text');
    if (tips) {
      tips.classList.remove('waifu-tips-active');
    }
  }, timeout);
}

/**
 * Show welcome message based on time.
 * @param {Time} time - Time message configuration.
 * @returns {string} Welcome message.
 */
function welcomeMessage(time: Time, template: string): string {
  if (location.pathname === '/') {
    // If on the homepage
    for (const { hour, text } of time) {
      const now = new Date(),
        after = hour.split('-')[0],
        before = hour.split('-')[1] || after;
      if (
        Number(after) <= now.getHours() &&
        now.getHours() <= Number(before)
      ) {
        return text;
      }
    }
  }
  console.log('template===>', template);
  const text = i18n(template, document?.title || '');
  let from;
  if (document.referrer !== '') {
    const referrer = new URL(document.referrer),
      domain = referrer.hostname.split('.')[1];
    const domains = {
      baidu: '百度',
      so: '360搜索',
      google: '谷歌搜索',
    } as const;
    if (location.hostname === referrer.hostname) return text;

    if (domain in domains) from = domains[domain as keyof typeof domains];
    else from = referrer.hostname;
    return `Hello！来自 <span>${from}</span> 的朋友<br>${text}`;
  }
  return text;
}

function i18n(template: string, ...args: any[]): string {
  return template.replace(/\$(\d+)/g, (_: string, idx: string) => {
    const i = parseInt(idx, 10) - 1;
    return args[i] ?? '';
  });
}

export { showMessage, welcomeMessage, i18n };
export type { Time };
