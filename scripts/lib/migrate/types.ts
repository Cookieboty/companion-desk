export type LegacyProvider = 'deepseek' | 'openai' | 'claude' | 'ollama' | 'custom';

export interface LegacyAIModelConfig {
  id: string;
  name: string;
  provider: LegacyProvider;
  apiKey?: string;
  apiUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  enabled: boolean;
  isLocal?: boolean;
}

export interface LegacyChatSetting {
  theme?: 'light' | 'dark';
  language?: 'zh-CN' | 'en-US';
  fontSize?: number;
  autoSave?: boolean;
  maxHistoryLength?: number;
  ttsVoiceId?: string;
}

export interface LegacyAppConfig {
  chat?: LegacyChatSetting;
  models?: LegacyAIModelConfig[];
  currentModelId?: string;
}

export interface LegacyChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelId?: string;
  error?: string;
  sessionId?: string;
}

export interface DshProviderPatch {
  id: string;
  displayName: string;
  provider: LegacyProvider;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  enabled: boolean;
  isLocal: boolean;
  keyRef?: string;
}

export interface ConfigMigrationResult {
  providers: DshProviderPatch[];
  defaultProviderId?: string;
  keyEntries: Array<{ keyRef: string; secret: string }>;
  skipped: Array<{ id: string; reason: string }>;
}

export interface HistoryMigrationSessionFile {
  sessionId: string;
  file: string;
  records: Array<{
    ts: number;
    id: string;
    role: LegacyChatMessage['role'];
    content: string;
    modelId?: string;
    error?: string;
  }>;
  createdAt: number;
  updatedAt: number;
}

export interface HistoryMigrationResult {
  sessions: HistoryMigrationSessionFile[];
  skipped: Array<{ id: string; reason: string }>;
}
