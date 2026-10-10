import { ToolRegistryKey, definePlugin, type PluginContext } from '@ig-live/bundle-ig-base';
import { z } from 'zod';

export interface MascotModelInfo {
  id: string;
  name: string;
  origin: string;
  license: string;
  author: string;
}

export interface MascotModelToolsPluginConfig {
  /** 统一模型注册表（内置 + 商店已安装 + 用户导入） */
  list: () => Promise<MascotModelInfo[]>;
  /** 切换当前角色（转发给渲染进程） */
  select: (id: string) => void | Promise<void>;
}

export const selectModelInputSchema = z.object({ id: z.string().min(1).max(80) }).strict();

/** AI 工具：mascot_list_models / mascot_select_model（只能选注册表里已有的模型）。 */
export const MascotModelToolsPlugin = definePlugin<MascotModelToolsPluginConfig>({
  name: 'MascotModelToolsPlugin',
  requires: ['ToolsBuiltinPlugin'],
  apply(ctx: PluginContext, cfg: MascotModelToolsPluginConfig) {
    const registry = ctx.inject(ToolRegistryKey);
    if (!registry || !cfg?.list) {
      ctx.logger.warn('[MascotModelToolsPlugin] tools registry / model list unavailable; skipping');
      return;
    }
    registry.register({
      name: 'mascot_list_models',
      description: '列出可用的看板娘角色（id、名字、来源 bundled/remote/user、许可）。',
      input: z.object({}).strict(),
      dangerous: false,
      async execute() {
        return { models: await cfg.list() };
      },
    });
    registry.register({
      name: 'mascot_select_model',
      description: '切换看板娘角色。id 必须来自 mascot_list_models。',
      input: selectModelInputSchema,
      dangerous: false,
      async execute(input: { id: string }) {
        const { id } = selectModelInputSchema.parse(input);
        const models = await cfg.list();
        const m = models.find((x) => x.id === id);
        if (!m) return { ok: false as const, error: `unknown model id: ${id}` };
        await cfg.select(id);
        return { ok: true as const, name: m.name };
      },
    });
  },
});
