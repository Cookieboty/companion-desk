import type { ProfilePatch } from '../../seams/userProfile';
import { userProfilePatchByDistillerSchema } from '../../types/UserProfileSchema';

/**
 * LLM 轻量蒸馏 —— 从多轮对话摘要中提炼稳定偏好。
 *
 * 骨架版：把「LLM 调用」抽成注入函数；schema 保证 LLM 只能改 preferences/dislikes。
 */
export interface DistillerLlm {
  /**
   * 输入：截取的最近 N 条对话文本
   * 输出：结构化 patch（json），必须能通过 userProfilePatchByDistillerSchema
   */
  distill(dialogueText: string): Promise<unknown>;
}

export class PreferenceDistiller {
  constructor(private readonly llm: DistillerLlm) {}

  async run(dialogueText: string, now: number = Date.now()): Promise<ProfilePatch | undefined> {
    const raw = await this.llm.distill(dialogueText);
    const parsed = userProfilePatchByDistillerSchema.safeParse(raw);
    if (!parsed.success) return undefined;

    // 打上 updatedAt / source
    const patch = structuredClone(parsed.data);
    if (patch.preferences) {
      for (const v of Object.values(patch.preferences)) {
        if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
          (v as { source?: string; updatedAt?: number }).source = 'distilled';
          (v as { updatedAt?: number }).updatedAt = now;
        }
      }
    }
    return { source: 'distilled', reason: 'llm distilled from recent dialogue', patch };
  }
}
