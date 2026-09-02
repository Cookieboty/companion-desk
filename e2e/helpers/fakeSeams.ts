/**
 * Fake seams —— headless E2E 冒烟专用。
 *
 * 保证 AIClient 构造时 `LLMRegistry` / `ToolRegistry` / `UserProfileService`
 * 都能被 inject 到；语义与 ai-sdk / ai-runtime 内部 fake 保持一致。
 *
 * 额外提供：
 * - `createFakeTtsService`：满足 TtsFacade.list/synth/stream/listVoices 契约，
 *   支持"手动 push chunk"以便 E1 触发嘴型链路；
 * - `createFakeLive2dService`：满足 Live2dFacade.driveLipSync/on 契约，
 *   记录 rms 序列供 E1 断言；
 * - `createEchoTool`：一个可控的工具，触发后 emit `tools/post-execute`
 *   dsh 事件，供 E2 断言 `tool:executed` 广播。
 */

import type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  DshEvent,
  LLMProvider,
  LLMRegistry,
  ProfilePatch,
  ToolDefinition,
  ToolRegistry,
  UserProfile,
  UserProfileEvent,
  UserProfileService,
} from '@ig-live/bundle-ig-base';
import { makeDefaultUserProfile } from '@ig-live/bundle-ig-base';
import type {
  TtsChunk,
  TtsOptions,
  TtsProvider,
  TtsProviderInfo,
  TtsResult,
  TtsService,
  TtsVoice,
} from '@ig-live/bundle-ig-electron-caps/seams';
import type {
  Live2dEvent,
  Live2dEventPayload,
  Live2dService,
} from '@ig-live/bundle-ig-live2d/seams';

export interface FakeLLM extends LLMProvider {
  chatCalls: ChatRequest[];
  streamCalls: ChatRequest[];
  aborted: string[];
  /** 允许 test 用例覆盖某次 chat 的返回内容（默认 `ok`） */
  nextContent?: string;
}

export function createFakeLLM(id = 'fake'): FakeLLM {
  const chatCalls: ChatRequest[] = [];
  const streamCalls: ChatRequest[] = [];
  const aborted: string[] = [];
  const provider: FakeLLM = {
    id,
    chatCalls,
    streamCalls,
    aborted,
    nextContent: undefined,
    async chat(req: ChatRequest): Promise<ChatResponse> {
      chatCalls.push(req);
      return {
        reqId: req.reqId,
        provider: id,
        model: req.model,
        content: provider.nextContent ?? 'ok',
        finishReason: 'stop',
      };
    },
    stream(req: ChatRequest): AsyncIterable<ChatChunk> {
      streamCalls.push(req);
      return (async function* () {
        yield { type: 'delta', content: 'hel' } as ChatChunk;
        yield { type: 'delta', content: 'lo' } as ChatChunk;
        yield { type: 'done', finishReason: 'stop' } as ChatChunk;
      })();
    },
    abort(reqId: string): void {
      aborted.push(reqId);
    },
  };
  return provider;
}

export function createFakeLLMRegistry(...providers: LLMProvider[]): LLMRegistry {
  const map = new Map<string, LLMProvider>();
  for (const p of providers) map.set(p.id, p);
  return {
    register: (p) => {
      map.set(p.id, p);
    },
    get: (id) => map.get(id),
    list: () => [...map.values()],
  };
}

export function createFakeToolRegistry(): ToolRegistry {
  const map = new Map<string, ToolDefinition>();
  return {
    register: <TIn, TOut>(tool: ToolDefinition<TIn, TOut>) => {
      map.set(tool.name, tool as unknown as ToolDefinition);
    },
    get: (n) => map.get(n),
    list: () => [...map.values()],
  };
}

export function createFakeProfileService(seed?: Partial<UserProfile>): UserProfileService {
  let profile: UserProfile = { ...makeDefaultUserProfile(1_700_000_000_000), ...seed };
  const subs = new Set<(p: UserProfile) => void>();
  const notify = () => subs.forEach((f) => f(profile));

  const svc: UserProfileService = {
    get: () => structuredClone(profile),
    getPath: <T>(path: string) => {
      const segs = path.split('.');
      let cur: unknown = profile;
      for (const s of segs) {
        if (cur && typeof cur === 'object' && s in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[s];
        } else return undefined;
      }
      return cur as T;
    },
    async set(patch: ProfilePatch) {
      profile = deepMerge(profile, patch.patch) as UserProfile;
      profile.updatedAt = Date.now();
      notify();
      return structuredClone(profile);
    },
    async reset() {
      profile = makeDefaultUserProfile();
      notify();
      return structuredClone(profile);
    },
    subscribe(_evt: UserProfileEvent, fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    async export() {
      return structuredClone(profile);
    },
    async import(data: unknown) {
      profile = data as UserProfile;
      notify();
      return structuredClone(profile);
    },
  };
  return svc;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isObj(base) || !isObj(patch)) return patch ?? base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out;
}

/* ------------------------------------------------------------ *
 * TTS service —— TtsFacade 要求实现 list/synth/stream/listVoices *
 * ------------------------------------------------------------ */

export interface FakeTtsService extends TtsService {
  /** 手动模拟一次合成的 chunk 序列，返回 promise 用于串接下一步 */
  push(reqId: string, chunks: Array<Omit<TtsChunk, 'reqId'>>): Promise<void>;
  synthCalls: Array<{ text: string; opts?: TtsOptions }>;
  streamCalls: Array<{ text: string; opts?: TtsOptions }>;
}

export function createFakeTtsService(): FakeTtsService {
  const synthCalls: FakeTtsService['synthCalls'] = [];
  const streamCalls: FakeTtsService['streamCalls'] = [];
  const providers = new Map<string, TtsProvider>();
  const info: TtsProviderInfo = {
    id: 'fake-tts',
    name: 'Fake TTS',
    streaming: true,
    requiresApiKey: false,
  };
  const voices: TtsVoice[] = [
    { id: 'v1', providerId: 'fake-tts', name: 'Alice', language: 'en-US', gender: 'female' },
  ];
  const svc: FakeTtsService = {
    synthCalls,
    streamCalls,
    async synth(text, opts) {
      synthCalls.push({ text, opts });
      return {
        reqId: opts?.reqId ?? 'r-synth',
        providerId: info.id,
        mime: 'audio/mp3',
        data: new Uint8Array([0]),
      } satisfies TtsResult;
    },
    stream(text, opts) {
      streamCalls.push({ text, opts });
      return (async function* () {
        yield {
          reqId: opts?.reqId ?? 'r-stream',
          seq: 0,
          mime: 'audio/mp3',
          data: new Uint8Array([0]),
          rms: 0.5,
        } satisfies TtsChunk;
        yield {
          reqId: opts?.reqId ?? 'r-stream',
          seq: 1,
          mime: 'audio/mp3',
          data: new Uint8Array([0]),
          rms: 0,
          isFinal: true,
        } satisfies TtsChunk;
      })();
    },
    stop() {
      /* noop */
    },
    async listVoices() {
      return voices;
    },
    list() {
      return [info, ...[...providers.values()].map((p) => p.info)];
    },
    get(id) {
      return providers.get(id);
    },
    register(p) {
      providers.set(p.info.id, p);
    },
    async push() {
      throw new Error('push replaced at runtime');
    },
  };
  return svc;
}

/* --------------------------------------------------- *
 * Live2d service —— 记录 driveLipSync + on(touch) 序列 *
 * --------------------------------------------------- */

export interface FakeLive2dService extends Live2dService {
  driveLipSyncCalls: number[];
  motionCalls: Array<{ group: string; index?: number }>;
  expressionCalls: string[];
  parameterCalls: Array<{ id: string; value: number }>;
  fire<E extends Live2dEvent>(evt: E, payload: Live2dEventPayload<E>): void;
}

export function createFakeLive2dService(): FakeLive2dService {
  const driveLipSyncCalls: number[] = [];
  const motionCalls: Array<{ group: string; index?: number }> = [];
  const expressionCalls: string[] = [];
  const parameterCalls: Array<{ id: string; value: number }> = [];
  const listeners = new Map<Live2dEvent, Set<(p: unknown) => void>>();

  const svc: FakeLive2dService = {
    driveLipSyncCalls,
    motionCalls,
    expressionCalls,
    parameterCalls,
    async playMotion(group, index) {
      motionCalls.push({ group, index });
    },
    async setExpression(name) {
      expressionCalls.push(name);
    },
    driveLipSync(rms) {
      driveLipSyncCalls.push(rms);
    },
    setParameter(id, value) {
      parameterCalls.push({ id, value });
    },
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      const set = listeners.get(evt)!;
      set.add(fn as (p: unknown) => void);
      return () => set.delete(fn as (p: unknown) => void);
    },
    attachHost() {
      return () => undefined;
    },
    hasHost() {
      return true;
    },
    fire(evt, payload) {
      listeners.get(evt)?.forEach((fn) => fn(payload));
    },
  };
  return svc;
}

/* ------------------------------------------------- *
 * Echo tool —— 触发后回调 tools/post-execute dsh 事件 *
 * ------------------------------------------------- */

export function createEchoTool(): ToolDefinition<{ text: string }, { echoed: string }> {
  return {
    name: 'echo',
    description: 'Return the given text verbatim',
    dangerous: false,
    input: { type: 'echo-input' },
    async execute(input) {
      return { echoed: input.text };
    },
  };
}

/** dsh `tools/post-execute` 事件的 payload —— 与 AIClient 桥接契约保持一致 */
export const TOOL_POST_EXECUTE_EVENT: DshEvent = 'tools/post-execute';

/* -------------------------------------------------------------- *
 * write_file —— 危险工具冒烟：默认拒绝执行，须由 GuardrailsPlugin *
 * 逻辑等价物在 `installDangerToolGuardrail(ctx)` 中完成拒绝 & 触发  *
 * `tool/confirm-required`；execute 记录调用次数供断言校验。       *
 * -------------------------------------------------------------- */

export interface WriteFileArgs {
  path: string;
  content: string;
}
export interface WriteFileResult {
  written: number;
  path: string;
}
export interface WriteFileTool extends ToolDefinition<WriteFileArgs, WriteFileResult> {
  executions: WriteFileArgs[];
}

export function createWriteFileTool(): WriteFileTool {
  const executions: WriteFileArgs[] = [];
  const tool: WriteFileTool = {
    name: 'write_file',
    description: 'Write text content to a file on the local disk (DANGEROUS)',
    dangerous: true,
    input: { type: 'write-file-input' },
    executions,
    async execute(input: WriteFileArgs): Promise<WriteFileResult> {
      executions.push(input);
      return { written: input.content.length, path: input.path };
    },
  };
  return tool;
}

/**
 * 复刻 [GuardrailsPlugin](file:///Users/botycookie/self/ai-live2d-client/packages/bundle-ig-base/src/plugins/GuardrailsPlugin.ts)
 * 的 danger-tool 分支：命中 dangerTools 且 `confirmed !== true` 时
 * 通过 `triggerEvent('tool/confirm-required', ...)` 派发（fanout 到 AIClient 桥接
 * 与 emit 记录），并 reject。用于 E5 拒绝路径断言。
 *
 * 注意：真实 dsh 中 `ctx.emit` 即会触发 handler；本 e2e FakeSdkCtx 里 emit 只做
 * record，因此 helper 用 `triggerEvent` 才能让 [AIClient.bindDshBridges](file:///Users/botycookie/self/ai-live2d-client/packages/ai-sdk/src/AIClient.ts) 命中。
 */
export function installDangerToolGuardrail(
  ctx: {
    on: <TP = unknown, TR = void>(
      evt: DshEvent,
      fn: (h: { payload: TP; reject: (r: string, code?: string) => never }) => TR | Promise<TR>,
    ) => () => void;
    emit: <TP = unknown>(evt: DshEvent, payload: TP) => void;
    triggerEvent: <TP = unknown>(evt: DshEvent, payload: TP) => Promise<void>;
  },
  dangerTools: string[],
): () => void {
  const set = new Set(dangerTools);
  return ctx.on<{ tool: string; args: unknown; confirmed?: boolean; reqId?: string }>(
    'tools/pre-execute',
    async (hookCtx) => {
      const { tool, args, confirmed, reqId } = hookCtx.payload;
      if (set.has(tool) && confirmed !== true) {
        // 记录（emitted 供断言），同时 fanout 触发 AIClient 桥接。
        ctx.emit('tool/confirm-required', { tool, args, reqId });
        await ctx.triggerEvent('tool/confirm-required', { tool, args, reqId });
        hookCtx.reject('danger tool requires user confirm', 'E_TOOL_DENIED');
      }
    },
  );
}
