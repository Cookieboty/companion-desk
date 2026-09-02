import type {
  HistoryMigrationResult,
  HistoryMigrationSessionFile,
  LegacyChatMessage,
} from './types';

const ALLOWED_ROLES: ReadonlySet<LegacyChatMessage['role']> = new Set([
  'user',
  'assistant',
  'system',
]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function safeSessionId(input: string): string {
  return input.replace(/[^A-Za-z0-9_-]/g, '_');
}

function validate(
  message: unknown,
  index: number,
): { ok: true; value: LegacyChatMessage } | { ok: false; id: string; reason: string } {
  if (!message || typeof message !== 'object') {
    return { ok: false, id: `<index:${index}>`, reason: 'not an object' };
  }
  const raw = message as Record<string, unknown>;
  const id = isNonEmptyString(raw.id) ? raw.id : `<index:${index}>`;
  if (!isNonEmptyString(raw.id)) return { ok: false, id, reason: 'missing id' };
  if (typeof raw.role !== 'string' || !ALLOWED_ROLES.has(raw.role as LegacyChatMessage['role'])) {
    return { ok: false, id, reason: `invalid role "${String(raw.role)}"` };
  }
  if (typeof raw.content !== 'string') {
    return { ok: false, id, reason: 'missing content' };
  }
  if (!isFiniteNumber(raw.timestamp)) {
    return { ok: false, id, reason: 'missing timestamp' };
  }
  return { ok: true, value: raw as unknown as LegacyChatMessage };
}

export interface MigrateHistoryOptions {
  /** 未携带 sessionId 的旧消息合并到该 fallback session；默认 "legacy" */
  fallbackSessionId?: string;
}

/**
 * 将旧的扁平 ChatMessage[] 拆分为「按 sessionId 分组的 JSONL 会话文件」。
 *
 * 每条 record 保留 timestamp、role、content 与 modelId，用作 dsh session log
 * 的 JSONL 单行；写入策略为「一 session 一文件」，与 FileSessionStore 的
 * <baseDir>/sessions/<sessionId>.jsonl 完全一致。
 */
export function migrateLegacyHistory(
  messages: readonly unknown[],
  opts: MigrateHistoryOptions = {},
): HistoryMigrationResult {
  const fallback = opts.fallbackSessionId ?? 'legacy';
  const bySession = new Map<string, HistoryMigrationSessionFile>();
  const skipped: HistoryMigrationResult['skipped'] = [];

  messages.forEach((raw, index) => {
    const result = validate(raw, index);
    if (!result.ok) {
      skipped.push({ id: result.id, reason: result.reason });
      return;
    }
    const msg = result.value;
    const sessionId = safeSessionId(isNonEmptyString(msg.sessionId) ? msg.sessionId : fallback);

    let bucket = bySession.get(sessionId);
    if (!bucket) {
      bucket = {
        sessionId,
        file: `${sessionId}.jsonl`,
        records: [],
        createdAt: msg.timestamp,
        updatedAt: msg.timestamp,
      };
      bySession.set(sessionId, bucket);
    }

    bucket.records.push({
      ts: msg.timestamp,
      id: msg.id,
      role: msg.role,
      content: msg.content,
      ...(isNonEmptyString(msg.modelId) ? { modelId: msg.modelId } : {}),
      ...(isNonEmptyString(msg.error) ? { error: msg.error } : {}),
    });
    if (msg.timestamp < bucket.createdAt) bucket.createdAt = msg.timestamp;
    if (msg.timestamp > bucket.updatedAt) bucket.updatedAt = msg.timestamp;
  });

  for (const bucket of bySession.values()) {
    bucket.records.sort((a, b) => a.ts - b.ts);
  }

  const sessions = [...bySession.values()].sort((a, b) =>
    a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0,
  );
  return { sessions, skipped };
}

/** 序列化为 FileSessionStore 期望的 JSONL（每行 JSON，末尾换行）。 */
export function serializeSessionFile(session: HistoryMigrationSessionFile): string {
  return (
    session.records.map((r) => JSON.stringify(r)).join('\n') + (session.records.length ? '\n' : '')
  );
}
