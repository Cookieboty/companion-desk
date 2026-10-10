import { ToolRegistryKey, definePlugin, type PluginContext } from '@ig-live/bundle-ig-base';

import { getDesktopService } from './DesktopService';

/** 把桌面工具（fs_* / desktop_* / undo_last）注册进 ToolRegistry → AI SDK 工具循环可用 */
export const DesktopToolsPlugin = definePlugin<Record<string, never>>({
  name: 'DesktopToolsPlugin',
  requires: ['ToolsBuiltinPlugin'],
  apply(ctx: PluginContext) {
    const registry = ctx.inject(ToolRegistryKey);
    if (!registry) {
      ctx.logger.warn('[DesktopToolsPlugin] tools registry unavailable; skipping');
      return;
    }
    for (const t of getDesktopService().tools()) registry.register(t);
  },
});

export const desktopIgPlugins = [{ plugin: DesktopToolsPlugin, config: {} }];
