import { definePlugin, type PluginContext } from '@ig-live/bundle-ig-base';

import { loadElectron } from '../electronLoader';

export interface ShortcutBinding {
  /** Electron accelerator（如 'CommandOrControl+Shift+Space'） */
  accelerator: string;
  /** 命令：由消费方分发到具体动作（如 'wake.toggle', 'screen.captureToAgent'） */
  command: string;
  /** 可选透传 payload */
  payload?: unknown;
}

export interface ShortcutConfig {
  bindings?: ShortcutBinding[];
}

interface GlobalShortcutLike {
  register(accelerator: string, cb: () => void): boolean;
  unregister(accelerator: string): void;
  unregisterAll(): void;
  isRegistered(accelerator: string): boolean;
}

interface AppLike {
  on(evt: 'will-quit', cb: () => void): unknown;
}

const DEFAULT_BINDINGS: ShortcutBinding[] = [
  { accelerator: 'CommandOrControl+Shift+Space', command: 'wake.toggle' },
  { accelerator: 'CommandOrControl+Shift+X', command: 'screen.captureToAgent' },
];

export const ShortcutPlugin = definePlugin<ShortcutConfig>({
  name: 'ShortcutPlugin',
  apply(ctx: PluginContext, cfg: ShortcutConfig) {
    const electron = loadElectron() as unknown as {
      app: AppLike;
      globalShortcut: GlobalShortcutLike;
    };
    const { app, globalShortcut } = electron;

    const bindings = cfg.bindings ?? DEFAULT_BINDINGS;
    const registered: string[] = [];

    for (const b of bindings) {
      const ok = globalShortcut.register(b.accelerator, () => {
        ctx.logger.info(`shortcut fired: ${b.accelerator} -> ${b.command}`);
        // 用 dsh 的通用事件通道派发；具体消费者可自行订阅
        ctx.emit('agent/pre-request', {
          shortcut: b.accelerator,
          command: b.command,
          payload: b.payload,
        });
      });
      if (ok) {
        registered.push(b.accelerator);
      } else {
        ctx.logger.warn(`shortcut register failed: ${b.accelerator}`);
      }
    }

    app.on('will-quit', () => {
      for (const acc of registered) {
        try {
          globalShortcut.unregister(acc);
        } catch (err) {
          ctx.logger.warn(`shortcut unregister failed: ${acc}`, err);
        }
      }
    });

    ctx.logger.info(`ShortcutPlugin ready: ${registered.length} bindings`);
  },
});
