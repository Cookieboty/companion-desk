/**
 * ai:* IPC 通道 sender 白名单。
 *
 * 仅放行加载了受信内容的渲染窗口：
 * - 打包环境：`file://`（随包页面）；
 * - 开发环境：额外放行 renderer / chat 两个 127.0.0.1 dev server 端口。
 *
 * 若窗口被导航到任意外部站点（即使导航守卫被绕过），其 sender URL 不在白名单内，
 * 所有 ai:* 调用（LLM 对话、工具执行、剪贴板、截屏、provider 密钥写入等）一律拒绝。
 */

import type { IpcInvokeEvent } from '@nomi-ai/ai-runtime';
import { app } from 'electron';

import { DEV_HOST, devChatUrl, devRendererUrl } from '../core/devPorts';

const devPorts = (): Set<string> =>
  new Set([new URL(devRendererUrl()).port, new URL(devChatUrl()).port]);

export function isTrustedSenderUrl(raw: string | undefined | null): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol === 'file:') return true;

  if (
    !app.isPackaged &&
    process.env.NODE_ENV === 'development' &&
    url.protocol === 'http:' &&
    url.hostname === DEV_HOST &&
    devPorts().has(url.port)
  ) {
    return true;
  }

  return false;
}

export function isTrustedAiSender(event: IpcInvokeEvent): boolean {
  return isTrustedSenderUrl(event.senderUrl);
}
