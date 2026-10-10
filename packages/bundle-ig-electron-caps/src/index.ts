/**
 * @ig-live/bundle-ig-electron-caps
 *
 * dsh Bundle：Electron 主进程独占能力
 *   - SafeKeyStorePlugin：safeStorage 加密密钥库
 *   - FileSessionStorePlugin：JSONL 会话 + UserProfile 文件后端
 *   - ScreenPlugin：desktopCapturer 截屏
 *   - ClipboardPlugin：剪贴板读写 + 200ms 轮询变化事件
 *   - AsrPlugin：3 家 provider（whisper-local / openai-whisper / volc-asr）
 *   - TtsPlugin：4 家 provider（system / edge / openai / azure）
 *   - WakeWordPlugin：Porcupine（默认关）
 *   - ShortcutPlugin：全局快捷键 → 命令
 *
 * 入口即执行主进程守卫，非 Electron 主进程 import 会直接抛错。
 */
import { assertElectronMainProcess } from './env';

assertElectronMainProcess({ skipInTest: true });

export * from './env';
export * from './plugins';
export * from './seams';
