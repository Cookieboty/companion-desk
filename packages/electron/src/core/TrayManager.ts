/**
 * TrayManager —— 系统托盘：一键切换 AI provider、打开对话 / Provider 设置。
 *
 * 菜单由 ProviderService.state() 生成（只含名称与掩码信息，无 key），store 变化即重建。
 * `IG_DISABLE_TRAY=1` 可关闭（无托盘的桌面环境 / 测试）。
 */
import * as path from 'path';

import type { ProviderService, ProviderState } from '@nomi-ai/ai-runtime';
import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron';

import { broadcastMascotCommand } from '../ai/mascotCommand';
import { APP_DISPLAY_NAME } from '../brand';
import { onLocaleChange, t } from '../i18n';
import type { ILoggerService } from '../services/LoggerService';

import { assetsDir, iconImage, onTrayIcon } from './appIcon';

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
      label: t(
        '{0} · {1}{2}',
        p.name,
        p.defaultModel,
        p.keys.length === 0 && !['ollama', 'lmstudio', 'custom'].includes(p.presetId)
          ? t('（未配置 key）')
          : '',
      ),
      checked: p.id === current,
      enabled: true,
    }));
  for (const e of state.envProviders) {
    entries.push({
      id: e.id,
      label: t('{0}{1}', e.name, e.hasKey ? '' : t('（无 key）')),
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
  /** 屏幕记忆（开启时托盘提示 + 菜单「暂停」）；可选 */
  screenMemory?: {
    active(): boolean;
    onChange(fn: () => void): () => void;
    pause(minutes: number): void;
    open(): void;
  };
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
];

export class TrayManager {
  private tray: Tray | null = null;
  private unsubscribe?: () => void;
  private unsubscribeScreen?: () => void;

  constructor(private readonly opts: TrayManagerOptions) {}

  /** 屏幕记忆开启时：托盘提示文字 + 菜单顶部醒目的状态与暂停入口 */
  private screenMenu(): MenuItemConstructorOptions[] {
    const sm = this.opts.screenMemory;
    const on = !!sm?.active();
    this.tray?.setToolTip(on ? t('Nomi · ● 屏幕记忆中') : 'Nomi');
    if (!sm || !on) return [];
    return [
      { label: t('● 屏幕记忆中（仅保存在本机）'), click: () => sm.open() },
      { label: t('暂停屏幕记忆 1 小时'), click: () => sm.pause(60) },
      { type: 'separator' },
    ];
  }

  start(): void {
    if (process.env.IG_DISABLE_TRAY === '1' || this.tray) return;
    try {
      // macOS 用单色 Template 图（随菜单栏明暗自动反色），其余平台用彩色 Nomi 标
      const mac = process.platform === 'darwin';
      const icon = mac
        ? nativeImage.createFromPath(path.join(assetsDir(), 'trayTemplate.png'))
        : iconImage('tray');
      if (mac) icon.setTemplateImage(true);
      this.tray = new Tray(icon);
      this.unsubscribeIcon = onTrayIcon((img) => this.tray?.setImage(img));
      this.tray.setToolTip(APP_DISPLAY_NAME);
      this.rebuild();
      this.unsubscribe = this.opts.providers.onChange(() => this.rebuild());
      this.unsubscribeModels = this.opts.models?.onChange(() => void this.refreshModels());
      void this.refreshModels();
      this.unsubscribeScreen = this.opts.screenMemory?.onChange(() => this.rebuild());
      // 切换界面语言后立即重建托盘菜单
      this.unsubscribeLocale = onLocaleChange(() => this.rebuild());
    } catch (error) {
      this.opts.logger.warn('托盘创建失败（不影响主功能）', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.tray = null;
    }
  }

  private unsubscribeLocale?: () => void;
  private unsubscribeIcon?: () => void;
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
      ...this.screenMenu(),
      { label: t('打开 AI 对话'), click: () => this.opts.openChat() },
      { type: 'separator' },
      {
        label: state.overrideId ? t('AI Provider（已被 COMPANION_PROVIDER 锁定）') : 'AI Provider',
        enabled: false,
      },
      ...providerItems,
      { label: t('Provider 设置…'), click: () => this.opts.openProviderPanel() },
      { label: t('桌面能力（文件授权 / 操作记录）…'), click: () => this.opts.openDesktopPanel?.() },
      { type: 'separator' },
      {
        label: t('Nomi 动作'),
        submenu: TRAY_MOTIONS.map(([name, label]) => ({
          label: t(label),
          click: () => broadcastMascotCommand({ type: 'motion', name }),
        })),
      },
      ...(this.models.length
        ? [
            {
              label: t('切换角色'),
              submenu: this.models.map((m) => ({
                label: `${m.name}${t(ORIGIN_LABEL[m.origin] ?? '')}`,
                click: () => broadcastMascotCommand({ type: 'select-model', id: m.id }),
              })),
            } satisfies MenuItemConstructorOptions,
          ]
        : []),
      {
        label: t('选择角色 / 模型商店…'),
        click: () => broadcastMascotCommand({ type: 'open-picker' }),
      },
      {
        label: t('互动设置（穿透 / 重力 / 散步）…'),
        click: () => broadcastMascotCommand({ type: 'open-panel', panel: 'interaction' }),
      },
      { type: 'separator' },
      { label: t('退出'), click: () => this.opts.quit() },
    ];
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  dispose(): void {
    this.unsubscribeLocale?.();
    this.unsubscribeIcon?.();
    this.unsubscribe?.();
    this.unsubscribeScreen?.();
    this.unsubscribeModels?.();
    this.tray?.destroy();
    this.tray = null;
  }
}
