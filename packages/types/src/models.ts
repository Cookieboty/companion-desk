/**
 * 看板娘模型注册表（内置 + 远程商店 + 用户导入）的共享类型。
 */

export type ModelOrigin = 'bundled' | 'remote' | 'user';

/** 用户可调的模型呈现配置（导入模型 / 任意模型的本地覆盖），可导出为 JSON。 */
export interface ModelConfig {
  /** 显示名（覆盖 meta 里的名字） */
  name?: string;
  /** 缩放，0.1 ~ 5 */
  scale?: number;
  /** 位置偏移（米），各分量 -5 ~ 5 */
  offset?: [number, number, number];
  /** 镜头取景 */
  camera?: { height?: number; distance?: number; fov?: number };
  /** 通用表情名 → 模型表情名（如 happy → Joy） */
  expressionMap?: Record<string, string>;
  /** 允许的身体动作；缺省 = 全部 */
  motions?: string[];
}

export const MODEL_CONFIG_SCHEMA = 'companion-desk/model-config@1';

export interface ModelConfigFile {
  schema: typeof MODEL_CONFIG_SCHEMA;
  modelName?: string;
  config: ModelConfig;
}

/** VRM meta 摘要（用于用户导入模型的许可提示） */
export interface VrmMetaSummary {
  version: '0.x' | '1.0';
  title?: string;
  author?: string;
  license?: string;
  allowedUser?: string;
  commercialUsage?: string;
  allowRedistribution?: boolean;
  expressions: string[];
}

/** 经审核的非 OSI 许可（允许商用 + 再分发）的条款与条件 */
export interface LicenseTermsView {
  name: string;
  url: string;
  conditions: {
    commercialUse: boolean;
    redistribution: boolean;
    modification?: boolean;
    credit?: boolean;
    prohibited?: string[];
  };
}

export interface RegistryModel {
  /** 稳定 id（选中状态按 id 持久化） */
  id: string;
  name: string;
  description?: string;
  origin: ModelOrigin;
  /** 渲染进程可直接加载的 URL（内置：相对路径；远程 / 用户：cdmodel://） */
  path: string;
  thumbnail?: string;
  author: string;
  /** SPDX（内置 / 远程）；用户模型为 VRM meta 原文或 'user-provided' */
  license: string;
  source?: string;
  credit?: string;
  licenseTerms?: LicenseTermsView;
  version?: string;
  vrmVersion?: string;
  tags?: string[];
  config?: ModelConfig;
  /** 仅用户模型 */
  meta?: VrmMetaSummary;
}

export interface StoreEntryView {
  id: string;
  name: string;
  description?: string;
  author: string;
  license: string;
  source: string;
  credit: string;
  licenseTerms?: LicenseTermsView;
  version: string;
  vrmVersion: string;
  tags: string[];
  size: number;
  thumbnailUrl?: string;
  installedVersion?: string;
  updateAvailable: boolean;
  downloading?: boolean;
}

export interface StoreStateView {
  entries: StoreEntryView[];
  offline: boolean;
  fetchedAt?: number;
  error?: string;
  rejectedCount: number;
  catalogUrls: string[];
}

export interface ModelDownloadProgress {
  id: string;
  received: number;
  total: number;
  state: 'downloading' | 'verifying' | 'done' | 'error' | 'cancelled';
  error?: string;
}

export interface ModelImportResult {
  ok: boolean;
  model?: RegistryModel;
  error?: string;
}

export interface ModelsApi {
  list(): Promise<RegistryModel[]>;
  storeState(refresh?: boolean): Promise<StoreStateView>;
  install(id: string): Promise<{ ok: boolean; error?: string }>;
  cancel(id: string): Promise<void>;
  remove(id: string): Promise<{ ok: boolean; error?: string }>;
  /** 打开文件对话框导入 .vrm；传 filePath（拖放）则跳过对话框 */
  importVrm(filePath?: string, config?: ModelConfig): Promise<ModelImportResult>;
  /** 拖放的 File → 本地路径（webUtils.getPathForFile） */
  pathForFile(file: File): string;
  replaceVrm(id: string, filePath?: string): Promise<ModelImportResult>;
  updateConfig(id: string, config: ModelConfig): Promise<ModelImportResult>;
  exportConfig(id: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  importConfig(id: string, json?: string): Promise<ModelImportResult>;
  onProgress(cb: (p: ModelDownloadProgress) => void): () => void;
  onChanged(cb: () => void): () => void;
}
