import {
  ToolRegistryKey,
  definePlugin,
  type PluginContext,
  type ToolDefinition,
} from '@nomi-ai/bundle-ig-base';
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
      '让 Nomi 做一个动作。group 为动作名（均为中文菜单同名动作）：' +
      'wave（挥手）、hello（打招呼）、nod（点头）、shake_head（摇头）、bow（鞠躬）、salute（敬礼）、' +
      'think（托腮思考）、explain（讲解）、eureka（灵光一闪）、puzzled（疑惑歪头）、listen（倾听）、' +
      'look_around（张望）、look_lr（左顾右盼）、peek（偷看）、heart（比心）、blow_kiss（送飞吻）、' +
      'shy（害羞）、cover_face（捂脸）、sorry（道歉）、surprise（惊讶）、sigh（叹气）、smug（得意）、' +
      'aggrieved（委屈）、tears（流泪）、angry（生气）、cold_sweat（冷汗）、daze（发呆）、' +
      'cheer（加油握拳）、thumbs_up（点赞）、peace（剪刀手）、celebrate（庆祝）、clap（鼓掌）、' +
      'hop（开心跳动）、wink（眨眼）、tongue（吐舌）、cute（卖萌）、work（打字工作）、' +
      'yawn（打哈欠）、stretch（伸懒腰）、goodnight（晚安）、peek_note（哼歌）、random（随机）。index 忽略。',
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
      '切换 Nomi 表情：happy / angry / sad / relaxed / surprised / neutral（数秒后自动恢复）。',
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
