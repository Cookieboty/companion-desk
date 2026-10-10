/**
 * TrayManager —— 系统托盘：一键切换 AI provider、打开对话 / Provider 设置。
 *
 * 菜单由 ProviderService.state() 生成（只含名称与掩码信息，无 key），store 变化即重建。
 * `IG_DISABLE_TRAY=1` 可关闭（无托盘的桌面环境 / 测试）。
 */
import * as path from 'path';

import type { ProviderService, ProviderState } from '@ig-live/ai-runtime';
import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron';

import { broadcastMascotCommand } from '../ai/mascotCommand';
import type { ILoggerService } from '../services/LoggerService';

export interface ProviderMenuEntry {
  id: string | null;
  label: string;
  checked: boolean;
  enabled: boolean;
}

/** 纯函数：state → 「切换 provider」菜单项（便于单测）。 */
export function providerMenuEntries(state: ProviderState): ProviderMenuEntry[] {
  const current = state.effectiveProviderId;
  const entries: ProviderMenuEntry[] = state.providers
    .filter((p) => p.enabled)
    .map((p) => ({
      id: p.id,
      label: `${p.name}${p.keys.length === 0 && p.presetId !== 'ollama' && p.presetId !== 'custom' ? '（未配置 key）' : ''}`,
      checked: p.id === current,
      enabled: true,
    }));
  for (const e of state.envProviders) {
    entries.push({
      id: e.id,
      label: `${e.name} · 环境变量${e.hasKey ? '' : '（无 key）'}`,
      checked: e.id === current,
      enabled: e.hasKey,
    });
  }
  return entries;
}

export interface TrayManagerOptions {
  providers: ProviderService;
  logger: ILoggerService;
  openChat: () => void;
  openProviderPanel: () => void;
  /** 桌面能力设置（授权文件夹 / 权限 / 操作记录） */
  openDesktopPanel?: () => void;
  quit: () => void;
  /** 统一模型注册表（托盘「切换角色」子菜单）；可选 */
  models?: { list(): Promise<RegistryModelLite[]>; onChange(fn: () => void): () => void };
}

export interface RegistryModelLite {
  id: string;
  name: string;
  origin: string;
}

const ORIGIN_LABEL: Record<string, string> = { bundled: '', remote: ' · 商店', user: ' · 导入' };

/** 托盘「看板娘动作」菜单项 */
export const TRAY_MOTIONS: Array<[string, string]> = [
  ['wave', '挥手'],
  ['nod', '点头'],
  ['shake', '摇头'],
  ['think', '思考'],
  ['clap', '拍手'],
  ['bow', '鞠躬'],
  ['cheer', '欢呼'],
  ['dance', '跳舞'],
  ['jump', '跳跃'],
];

export class TrayManager {
  private tray: Tray | null = null;
  private unsubscribe?: () => void;

  constructor(private readonly opts: TrayManagerOptions) {}

  start(): void {
    if (process.env.IG_DISABLE_TRAY === '1' || this.tray) return;
    try {
      const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
      const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
      this.tray = new Tray(icon);
      this.tray.setToolTip('Companion Desk');
      this.rebuild();
      this.unsubscribe = this.opts.providers.onChange(() => this.rebuild());
      this.unsubscribeModels = this.opts.models?.onChange(() => void this.refreshModels());
      void this.refreshModels();
    } catch (error) {
      this.opts.logger.warn('托盘创建失败（不影响主功能）', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.tray = null;
    }
  }

  private models: RegistryModelLite[] = [];
  private unsubscribeModels?: () => void;

  private async refreshModels(): Promise<void> {
    try {
      this.models = (await this.opts.models?.list()) ?? [];
    } catch {
      this.models = [];
    }
    this.rebuild();
  }

  rebuild(): void {
    if (!this.tray) return;
    const state = this.opts.providers.state();
    const providerItems: MenuItemConstructorOptions[] = providerMenuEntries(state).map((e) => ({
      label: e.label,
      type: 'radio',
      checked: e.checked,
      enabled: e.enabled && !state.overrideId,
      click: () => {
        try {
          this.opts.providers.setActive(e.id);
          this.opts.logger.info('托盘切换 provider', { id: e.id });
        } catch (error) {
          this.opts.logger.warn('托盘切换 provider 失败', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    }));
    const template: MenuItemConstructorOptions[] = [
      { label: '打开 AI 对话', click: () => this.opts.openChat() },
      { type: 'separator' },
      {
        label: state.overrideId ? `AI Provider（已被 COMPANION_PROVIDER 锁定）` : 'AI Provider',
        enabled: false,
      },
      ...providerItems,
      { label: 'Provider 设置…', click: () => this.opts.openProviderPanel() },
      { label: '桌面能力（文件授权 / 操作记录）…', click: () => this.opts.openDesktopPanel?.() },
      { type: 'separator' },
      {
        label: '看板娘动作',
        submenu: TRAY_MOTIONS.map(([name, label]) => ({
          label,
          click: () => broadcastMascotCommand({ type: 'motion', name }),
        })),
      },
      ...(this.models.length
        ? [
            {
              label: '切换角色',
              submenu: this.models.map((m) => ({
                label: `${m.name}${ORIGIN_LABEL[m.origin] ?? ''}`,
                click: () => broadcastMascotCommand({ type: 'select-model', id: m.id }),
              })),
            } satisfies MenuItemConstructorOptions,
          ]
        : []),
      {
        label: '选择角色 / 模型商店…',
        click: () => broadcastMascotCommand({ type: 'open-picker' }),
      },
      {
        label: '互动设置（穿透 / 重力 / 散步）…',
        click: () => broadcastMascotCommand({ type: 'open-panel', panel: 'interaction' }),
      },
      { type: 'separator' },
      { label: '退出', click: () => this.opts.quit() },
    ];
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribeModels?.();
    this.tray?.destroy();
    this.tray = null;
  }
}
