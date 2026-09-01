/**
 * ClipboardGateway - 基于 Electron `clipboard` 模块实现 ClipboardService
 *
 * 图像读写：`clipboard.readImage()` 返回 nativeImage，本类转 PNG buffer + width/height。
 * 事件订阅：Electron 未提供剪贴板变化事件，通过 setInterval 轮询 hash 实现最小版本。
 */

import { clipboard, nativeImage } from 'electron';

import type {
  ClipboardChangePayload,
  ClipboardEvent,
  ClipboardImage,
  ClipboardService,
} from '@ig-live/bundle-ig-electron-caps';

export interface ClipboardGatewayOptions {
  /** 轮询间隔，默认 500ms。设为 0 关闭事件订阅（`on()` 会返回 no-op） */
  pollIntervalMs?: number;
}

export class ClipboardGateway implements ClipboardService {
  private readonly pollMs: number;
  private timer: NodeJS.Timeout | undefined;
  private lastText = '';
  private readonly listeners = new Set<(p: ClipboardChangePayload) => void>();

  constructor(opts: ClipboardGatewayOptions = {}) {
    this.pollMs = opts.pollIntervalMs ?? 500;
  }

  async readText(): Promise<string> {
    return clipboard.readText();
  }

  async writeText(text: string): Promise<void> {
    clipboard.writeText(text);
  }

  async readImage(): Promise<ClipboardImage | undefined> {
    const img = clipboard.readImage();
    if (img.isEmpty()) return undefined;
    const buf = img.toPNG();
    const size = img.getSize();
    return {
      mime: 'image/png',
      data: new Uint8Array(buf),
      width: size.width,
      height: size.height,
    };
  }

  on(evt: ClipboardEvent, fn: (p: ClipboardChangePayload) => void): () => void {
    if (evt !== 'change') return () => {};
    if (this.pollMs <= 0) return () => {};
    this.listeners.add(fn);
    if (!this.timer) this.startPolling();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stopPolling();
    };
  }

  private startPolling(): void {
    this.lastText = clipboard.readText();
    this.timer = setInterval(() => {
      const text = clipboard.readText();
      if (text === this.lastText) return;
      this.lastText = text;
      const payload: ClipboardChangePayload =
        text === '' ? { kind: 'empty' } : { kind: 'text', text };
      for (const fn of this.listeners) {
        try {
          fn(payload);
        } catch {
          /* ignore listener error */
        }
      }
    }, this.pollMs);
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  dispose(): void {
    this.stopPolling();
    this.listeners.clear();
  }
}

/** 内部使用：借助 nativeImage 判断图像是否为空（避免 tree-shake 后无用引用被删） */
export const __nativeImageAvailable = typeof nativeImage !== 'undefined';
