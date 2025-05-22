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

    // 处理electron环境下的资源路径
    let resourceUrl = url;
    // 检测是否为URL
    const isExternalUrl = url.startsWith('http://') || url.startsWith('https://');

    // Live2D特殊处理 - 如果是加载Live2D库
    const isLive2DLibrary = url.includes('live2d.min.js');

    // 如果不是外部URL，尝试使用electron API获取本地资源路径
    if (!isExternalUrl && window.electronAPI && type === 'js') {
      console.log('通过Electron API加载本地资源:', url);

      // 为Electron环境准备多个可能的路径
      const filename = url.split('/').pop();
      const possiblePaths = [
        url,                                    // 原始路径
        url.startsWith('./') ? url : `./${url}`, // 确保有./前缀
        url.startsWith('/') ? url.substring(1) : url, // 移除开头的/
        `assets/${filename}`,                   // 直接使用文件名在assets目录下查找
        `renderer/assets/${filename}`,          // 在renderer/assets目录下查找
        `../renderer/assets/${filename}`,       // 向上一级目录查找
        `Resources/renderer/assets/${filename}`, // macOS打包路径
        `resources/renderer/assets/${filename}`, // Windows打包路径
        `Contents/Resources/renderer/assets/${filename}`, // 另一种macOS路径
        `dist/renderer/assets/${filename}`,     // 开发构建路径
        `packages/renderer/public/assets/${filename}` // 源码路径
      ];

      console.log('尝试以下可能的路径:', possiblePaths);

      // 使用全局模式创建script标签
      const scriptTag = document.createElement('script');

      // 创建异步函数来使用await
      const tryLoadPaths = async () => {
        // 尝试加载所有可能的路径
        let loaded = false;

        for (const path of possiblePaths) {
          if (loaded) break;

          try {
            console.log('尝试加载路径:', path);
            // 先加载本地文件，然后作为内联脚本插入
            const content = await window.electronAPI.readLocalFile(path).catch(() => null);

            if (content) {
              console.log('成功通过Electron API加载本地资源:', path);
              // 将内容作为内联脚本插入
              scriptTag.textContent = typeof content === 'string' ? content : '';
              document.head.appendChild(scriptTag);

              if (isLive2DLibrary) {
                // 对于Live2D库，需要等待全局对象初始化完成
                try {
                  await new Promise<void>((resolve, reject) => {
                    let attempts = 0;
                    const maxAttempts = 50; // 最多尝试50次，每次100ms

                    const checkInitialized = () => {
                      attempts++;
                      // 检查Live2D关键对象是否已初始化
                      if (typeof window.Live2D !== 'undefined' &&
                        typeof window.AMotion !== 'undefined' &&
                        typeof window.Live2DMotion !== 'undefined') {
                        console.log('Live2D库全局对象已成功初始化');
                        resolve();
                      } else {
                        console.log(`等待Live2D库初始化... (${attempts}/${maxAttempts})`);
                        // 如果未初始化且未超过最大尝试次数，延迟后再次检查
                        if (attempts < maxAttempts) {
                          setTimeout(checkInitialized, 100);
                        } else {
                          reject(new Error('Live2D库初始化超时'));
                        }
                      }
                    };

                    // 开始检查初始化状态
                    setTimeout(checkInitialized, 50);
                  });
                } catch (err) {
                  console.error('Live2D库初始化失败:', err);
                  throw err;
                }
              }

              loaded = true;
              resolve(scriptTag);
              break;
            }
          } catch (err) {
            console.error(`尝试加载路径 ${path} 失败:`, err);
            // 继续尝试下一个路径
          }
        }

        if (!loaded) {
          console.error('无法通过所有可能的路径加载资源:', url);
          // 回退到常规方法
          loadResourceNormally();
        }
      };

      // 执行异步加载函数
      tryLoadPaths().catch(err => {
        console.error('资源加载过程中出错:', err);
        loadResourceNormally();
      });

      return;
    }

    // 常规加载方法
    function loadResourceNormally() {
      if (type === 'css') {
        tag = document.createElement('link');
        (tag as HTMLLinkElement).rel = 'stylesheet';
        (tag as HTMLLinkElement).href = resourceUrl;
      } else if (type === 'js') {
        tag = document.createElement('script');
        (tag as HTMLScriptElement).src = resourceUrl;
      } else {
        reject(new Error(`Unsupported resource type: ${type}`));
        return;
      }

      if (tag instanceof HTMLScriptElement) {
        tag.async = true;

        // 对于Live2D库，需要特殊处理确保完全加载
        if (isLive2DLibrary) {
          tag.onload = () => {
            // 检查Live2D关键对象是否已初始化
            const checkInitialized = () => {
              if (typeof window.Live2D !== 'undefined' &&
                typeof window.AMotion !== 'undefined' &&
                typeof window.Live2DMotion !== 'undefined') {
                console.log('Live2D库全局对象已成功初始化');
                resolve(tag);
              } else {
                console.log('等待Live2D库初始化...');
                // 如果未初始化，延迟100ms后再次检查
                setTimeout(checkInitialized, 100);
              }
            };

            // 开始检查初始化状态
            setTimeout(checkInitialized, 50);
          };
        } else {
          tag.onload = () => resolve(tag);
        }
      } else {
        tag.onload = () => resolve(tag);
      }

      tag.onerror = () => reject(new Error(`Failed to load ${resourceUrl}`));

      document.head.appendChild(tag);
    }

    // 如果不需要特殊处理，则正常加载资源
    if (isExternalUrl || !window.electronAPI) {
      loadResourceNormally();
    }
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
  // 检查是否为相对URL，并且在Electron环境中
  if (!url.startsWith('http') && !url.startsWith('blob:') && window.electronAPI) {
    try {
      console.log('通过Electron API加载本地JSON:', url);
      const data = await window.electronAPI.readLocalFile(url);

      if (data) {
        console.log('成功通过Electron API加载本地JSON');
        // 创建一个Response对象
        return new Response(data, {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (err) {
      console.error('通过Electron API加载JSON失败，回退到标准fetch:', err);
      // 如果失败，继续使用标准fetch
    }
  }

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