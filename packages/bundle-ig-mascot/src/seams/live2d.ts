import { defineService } from '@ig-live/bundle-ig-base';

/**
 * 命中区域（由 Live2D 模型自身定义，常见如 Head / Body / Chest / Arm）。
 * bundle 不做枚举强绑，字符串透传。
 */
export type Live2dHitArea = string;

export interface Live2dTouchPayload {
  hitArea: Live2dHitArea;
  /** 相对模型 canvas 的坐标（0~1），可选 */
  x?: number;
  y?: number;
  /** 触发时间戳（ms） */
  at: number;
}

export interface Live2dMotionEndPayload {
  group: string;
  index?: number;
  /** 是否被后续动画打断 */
  interrupted?: boolean;
}

export type Live2dEvent = 'touch' | 'motion:end';

export type Live2dEventPayload<E extends Live2dEvent> = E extends 'touch'
  ? Live2dTouchPayload
  : E extends 'motion:end'
    ? Live2dMotionEndPayload
    : never;

/**
 * Live2d 渲染宿主接口。
 * 由消费方（P8 / renderer）在启动时通过 `provideLive2dHost` 注入实际实现，
 * 本 bundle 只面向本接口编程，做到与具体渲染库解耦。
 */
export interface Live2dHost {
  playMotion(group: string, index?: number): Promise<void>;
  setExpression(name: string): Promise<void>;
  driveLipSync(rms: number): void;
  setParameter(id: string, value: number): void;
  /** hitArea 事件、动作播完事件由 host 反向广播 */
  on<E extends Live2dEvent>(evt: E, fn: (p: Live2dEventPayload<E>) => void): () => void;
}

/**
 * ctx.live2d 对外提供的 service。
 * 与 Host 接口同形但语义更严：
 *   - RMS 会做 clamp 到 [0, 1]
 *   - playMotion / setExpression 若无 host 会 no-op 且落 warn 日志
 *   - on 支持 'touch' / 'motion:end'，本 service 内部转发
 */
export interface Live2dService {
  playMotion(group: string, index?: number): Promise<void>;
  setExpression(name: string): Promise<void>;
  driveLipSync(rms: number): void;
  setParameter(id: string, value: number): void;
  on<E extends Live2dEvent>(evt: E, fn: (p: Live2dEventPayload<E>) => void): () => void;
  /** 供 consumer runtime 注入 host（P8） */
  attachHost(host: Live2dHost): () => void;
  /** 当前是否已挂载 host */
  hasHost(): boolean;
}

export const Live2dKey = defineService<Live2dService>('ctx.live2d');
