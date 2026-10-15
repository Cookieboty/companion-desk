/**
 * sherpa-onnx 本地离线 TTS 默认模型清单。
 * 模型随安装包 extraResources 分发（packages/electron/resources/tts-models/，由 sync-tts-model.mjs 同步），
 * 不进 git；开发态指向仓库同级 ../models/<id> 或 NOMI_SHERPA_TTS_MODEL_DIR。
 */
export interface ModelManifest {
  id: string;
  /** 运行所需文件（相对模型目录）→ 精确字节数（完整性校验） */
  files: Readonly<Record<string, number>>;
}

export const SHERPA_MODEL_ID = 'vits-zh-hf-theresa';

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

export const SHERPA_MANIFEST: ModelManifest = Object.freeze({
  id: SHERPA_MODEL_ID,
  files: SHERPA_REQUIRED_FILES,
});

/** 默认推理参数：sid=0、speed=1.0（语速与参考样例一致，不加速） */
export const SHERPA_DEFAULT_SID = 0;
export const SHERPA_DEFAULT_SPEED = 1.0;
export const SHERPA_NUM_THREADS = 4;
export const SHERPA_MAX_NUM_SENTENCES = 1;
export const SHERPA_RULE_FSTS = ['phone.fst', 'date.fst', 'number.fst', 'new_heteronym.fst'];
