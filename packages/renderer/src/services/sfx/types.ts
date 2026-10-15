/** 程序合成 / 打包音效的标识 */
export type SfxId =
  'pop' | 'ding' | 'swoosh' | 'hum' | 'click' | 'success' | 'fail' | 'think' | 'wave' | 'land';

export interface SfxSettings {
  /** 动作音效总开关（默认开） */
  enabled: boolean;
  /** 0..1，缺省跟随语音音量 */
  volume: number;
}
