/**
 * 订阅额度（尽力而为）。
 *
 * 原则：只用「本机已经有的数据」或「官方公开文档、且不需要读取用户凭据的接口」。
 * 读取额度如果必须走未文档接口或登录凭据，就不做，显示「暂未返回可用额度」——不编造、不猜。
 * 目前只有一个来源：Codex 自己写进会话日志的额度快照（日志里没有就没有）。
 * 新来源通过 QuotaRegistry.register 接入，不需要改面板。
 */

/** 一个额度窗口（例如 5 小时窗口 / 每周窗口） */
export interface QuotaWindow {
  id: string;
  /** 已用百分比 0–100 */
  usedPercent: number;
  /** 窗口长度（分钟）；未知则不填 */
  windowMinutes?: number;
  /** 重置时间（ms）；未知则不填 */
  resetAt?: number;
  /** 重置时间已过：这个百分比是上一个窗口的数据，不再展示为当前用量 */
  expired?: boolean;
}

/** 来源读到的原始额度快照 */
export interface QuotaReading {
  windows: QuotaWindow[];
  /** 快照产生时间（ms） */
  updatedAt: number;
  plan?: string;
}

/** 面板展示的一行：没有数据时 status = unavailable */
export interface QuotaEntry {
  id: string;
  label: string;
  status: 'ok' | 'unavailable';
  windows: QuotaWindow[];
  updatedAt?: number;
  plan?: string;
}

/** 额度来源。read 必须是同步、无网络、无凭据读取的；返回 null = 没有可用额度。 */
export interface QuotaSource {
  id: string;
  label: string;
  read(now: number): QuotaReading | null;
}

export class QuotaRegistry {
  private readonly sources = new Map<string, QuotaSource>();

  register(source: QuotaSource): void {
    this.sources.set(source.id, source);
  }

  unregister(id: string): void {
    this.sources.delete(id);
  }

  /**
   * 汇总：已注册来源按注册顺序；`placeholders` 里没有数据的工具补一行「不可用」。
   * 来源抛错 / 返回不合法数据都按「不可用」处理。
   */
  collect(now: number, placeholders: Array<{ id: string; label: string }>): QuotaEntry[] {
    const out: QuotaEntry[] = [];
    const seen = new Set<string>();
    for (const s of this.sources.values()) {
      const r = safeRead(s, now);
      const windows = r ? sanitizeWindows(r.windows, now) : [];
      seen.add(s.id);
      out.push(
        r && windows.length
          ? {
              id: s.id,
              label: s.label,
              status: 'ok',
              windows,
              updatedAt: r.updatedAt,
              ...(r.plan ? { plan: r.plan } : {}),
            }
          : { id: s.id, label: s.label, status: 'unavailable', windows: [] },
      );
    }
    for (const p of placeholders)
      if (!seen.has(p.id))
        out.push({ id: p.id, label: p.label, status: 'unavailable', windows: [] });
    return out;
  }
}

function safeRead(s: QuotaSource, now: number): QuotaReading | null {
  try {
    return s.read(now);
  } catch {
    return null;
  }
}

/** 去掉不合法的窗口；超过重置时间的标 expired */
export function sanitizeWindows(ws: QuotaWindow[], now: number): QuotaWindow[] {
  const out: QuotaWindow[] = [];
  for (const w of ws) {
    if (!w || typeof w.usedPercent !== 'number' || !Number.isFinite(w.usedPercent)) continue;
    if (w.usedPercent < 0) continue;
    const resetAt =
      typeof w.resetAt === 'number' && Number.isFinite(w.resetAt) && w.resetAt > 0
        ? w.resetAt
        : undefined;
    const minutes =
      typeof w.windowMinutes === 'number' && w.windowMinutes > 0 ? w.windowMinutes : undefined;
    out.push({
      id: String(w.id),
      usedPercent: Math.min(100, w.usedPercent),
      ...(minutes ? { windowMinutes: minutes } : {}),
      ...(resetAt ? { resetAt } : {}),
      ...(resetAt && resetAt <= now ? { expired: true } : {}),
    });
  }
  return out;
}
