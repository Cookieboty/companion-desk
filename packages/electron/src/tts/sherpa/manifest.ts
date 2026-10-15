/**
 * sherpa-onnx 本地离线 TTS 默认模型清单（不随安装包 / git 分发，首次使用时下载）。
 * 钉死归档 sha256 与大小；解压后再逐文件校验大小，避免半截 / 被替换的模型。
 * 归档由 k2-fsa/sherpa-onnx 的 `tts-models` release 提供（资产更新于 2024-04-22，核对于 2026-10-15）。
 */
export interface ModelManifest {
  id: string;
  url: string;
  sha256: string;
  /** 归档字节数（进度条总量 / 预期） */
  bytes: number;
  /** 归档内顶层目录（解压时剥掉） */
  topDir: string;
  /** 运行所需文件（相对模型目录）→ 精确字节数 */
  files: Readonly<Record<string, number>>;
}

export const SHERPA_MODEL_ID = 'vits-zh-hf-theresa';

export const SHERPA_MODEL_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-zh-hf-theresa.tar.bz2';

export const SHERPA_ARCHIVE_SHA256 =
  'f337638c49689e1d87135c4e224daa1aacc0109e784b1cf78eafb1b14a1d9e92';

export const SHERPA_ARCHIVE_BYTES = 120596617;

export const SHERPA_REQUIRED_FILES: Readonly<Record<string, number>> = Object.freeze({
  'theresa.onnx': 121913906,
  'lexicon.txt': 2764076,
  'tokens.txt': 268,
  'phone.fst': 88630,
  'date.fst': 59154,
  'number.fst': 64482,
  'new_heteronym.fst': 21974,
  'dict/jieba.dict.utf8': 5071204,
  'dict/hmm_model.utf8': 519739,
  'dict/user.dict.utf8': 49,
  'dict/idf.utf8': 5998717,
  'dict/stop_words.utf8': 8974,
  'dict/pos_dict/prob_start.utf8': 4347,
  'dict/pos_dict/char_state_tab.utf8': 327139,
  'dict/pos_dict/prob_emit.utf8': 1687686,
  'dict/pos_dict/prob_trans.utf8': 124159,
});

/** 默认推理参数：sid=0、speed=1.0（语速与参考样例一致，不加速） */
export const SHERPA_DEFAULT_SID = 0;
export const SHERPA_DEFAULT_SPEED = 1.0;
export const SHERPA_NUM_THREADS = 4;
export const SHERPA_MAX_NUM_SENTENCES = 1;
export const SHERPA_RULE_FSTS = ['phone.fst', 'date.fst', 'number.fst', 'new_heteronym.fst'];

export const SHERPA_MANIFEST: ModelManifest = Object.freeze({
  id: SHERPA_MODEL_ID,
  url: SHERPA_MODEL_URL,
  sha256: SHERPA_ARCHIVE_SHA256,
  bytes: SHERPA_ARCHIVE_BYTES,
  topDir: SHERPA_MODEL_ID,
  files: SHERPA_REQUIRED_FILES,
});
