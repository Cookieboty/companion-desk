/**
 * @ig-live/bundle-ig-mascot
 *
 * dsh Bundle：看板娘渲染进程能力（渲染后端无关；协议名沿用 live2d，见 seams/mascot.ts）
 *   - Live2dSeamPlugin：ctx.live2d 服务与事件桥
 *   - TouchInjectPlugin：hitArea 触摸 → agent/sensory-inject（5s/area 冷却）
 *   - TtsLipSyncPlugin：tts/chunk → driveLipSync（20fps 节流）+ tts/end 归零
 *   - WaifuToolsPlugin：live2d_play_motion / live2d_set_expression（白名单自动确认）
 *   - WaifuAgentPresetPlugin：preset:waifu，systemPrompt 取 userProfile.preferences.tone
 *
 * 入口即执行渲染进程守卫；测试环境（VITEST）旁路。
 */
import { assertRendererProcess } from './env';

assertRendererProcess({ skipInTest: true });

export * from './env';
export * from './plugins';
export * from './seams';
