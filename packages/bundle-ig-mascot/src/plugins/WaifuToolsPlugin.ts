import {
  ToolRegistryKey,
  definePlugin,
  type PluginContext,
  type ToolDefinition,
} from '@ig-live/bundle-ig-base';
import { z } from 'zod';

import { Live2dKey, type Live2dService } from '../seams/live2d';

export interface WaifuToolsPluginConfig {
  /** 为 true 时工具标记 dangerous=false（免 UI 确认），默认 true */
  autoConfirm?: boolean;
}

export const playMotionInputSchema = z
  .object({
    group: z.string().min(1).max(64),
    index: z.number().int().nonnegative().max(255).optional(),
  })
  .strict();

export type PlayMotionInput = z.infer<typeof playMotionInputSchema>;

export const setExpressionInputSchema = z
  .object({
    name: z.string().min(1).max(64),
  })
  .strict();

export type SetExpressionInput = z.infer<typeof setExpressionInputSchema>;

export function createPlayMotionTool(
  live2d: Live2dService,
  opts: { dangerous: boolean },
): ToolDefinition<PlayMotionInput, { ok: true }> {
  return {
    name: 'live2d_play_motion',
    description:
      '让看板娘做一个动作。group 为动作名：wave（挥手）、nod（点头）、shake（摇头）、think（思考）、' +
      'clap（拍手）、bow（鞠躬）、cheer（欢呼）、dance（跳舞）、stretch（伸懒腰）、' +
      'look_around（张望）、interact（伸手）、flinch（受惊）、random（随机）。index 忽略。',
    input: playMotionInputSchema,
    dangerous: opts.dangerous,
    async execute(input: PlayMotionInput) {
      const parsed = playMotionInputSchema.parse(input);
      await live2d.playMotion(parsed.group, parsed.index);
      return { ok: true } as const;
    },
  };
}

export function createSetExpressionTool(
  live2d: Live2dService,
  opts: { dangerous: boolean },
): ToolDefinition<SetExpressionInput, { ok: true }> {
  return {
    name: 'live2d_set_expression',
    description:
      '切换看板娘表情：happy / angry / sad / relaxed / surprised / neutral（数秒后自动恢复）。',
    input: setExpressionInputSchema,
    dangerous: opts.dangerous,
    async execute(input: SetExpressionInput) {
      const parsed = setExpressionInputSchema.parse(input);
      await live2d.setExpression(parsed.name);
      return { ok: true } as const;
    },
  };
}

export const WaifuToolsPlugin = definePlugin<WaifuToolsPluginConfig>({
  name: 'WaifuToolsPlugin',
  requires: ['Live2dSeamPlugin', 'ToolsBuiltinPlugin'],
  apply(ctx: PluginContext, cfg: WaifuToolsPluginConfig) {
    const live2d = ctx.inject(Live2dKey);
    if (!live2d) {
      ctx.logger.warn('[WaifuToolsPlugin] ctx.live2d not available; skipping');
      return;
    }
    const registry = ctx.inject(ToolRegistryKey);
    if (!registry) {
      ctx.logger.warn('[WaifuToolsPlugin] ctx.tools not available; skipping');
      return;
    }

    const dangerous = !(cfg.autoConfirm ?? true);

    registry.register(createPlayMotionTool(live2d, { dangerous }));
    registry.register(createSetExpressionTool(live2d, { dangerous }));

    ctx.logger.info(
      `WaifuToolsPlugin ready (dangerous=${dangerous}, tools=live2d_play_motion,live2d_set_expression)`,
    );
  },
});
