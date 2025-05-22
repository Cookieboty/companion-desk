/**
 * 随机选择数组中的一个元素
 * @param arr 数组或字符串
 * @returns 随机选择的元素
 */
export function randomSelection<T>(arr: T | T[]): T {
  if (!Array.isArray(arr)) return arr;
  if (arr.length === 0) throw new Error('Cannot select from empty array');
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 加载外部资源（JS或CSS）
 * @param url 资源URL
 * @param type 资源类型 'js' | 'css'
 * @returns Promise
 */
export function loadExternalResource(url: string, type: 'js' | 'css'): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    let tag: HTMLElement;

    if (type === 'css') {
      tag = document.createElement('link');
      (tag as HTMLLinkElement).rel = 'stylesheet';
      (tag as HTMLLinkElement).href = url;
    } else if (type === 'js') {
      tag = document.createElement('script');
      (tag as HTMLScriptElement).src = url;
    } else {
      reject(new Error(`Unsupported resource type: ${type}`));
      return;
    }

    if (tag instanceof HTMLScriptElement) {
      tag.async = true;
    }

    tag.onload = () => resolve(tag);
    tag.onerror = () => reject(new Error(`Failed to load ${url}`));

    document.head.appendChild(tag);
  });
}

/**
 * 增强的fetch函数，支持超时和重试
 * @param url 请求URL
 * @param options fetch选项
 * @param timeout 超时时间（毫秒）
 * @param retries 重试次数
 * @returns Promise<Response>
 */
export async function customFetch(
  url: string,
  options: RequestInit = {},
  timeout = 10000,
  retries = 2
): Promise<Response> {
  // 创建AbortController用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    // 如果是超时错误或其他错误，且还有重试次数，则重试
    if (retries > 0) {
      return customFetch(url, options, timeout, retries - 1);
    }

    throw error;
  }
} 