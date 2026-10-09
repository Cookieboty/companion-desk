/**
 * VRM（3D 模式）模型路径配置。
 *
 * 统一使用相对路径，兼容 Vite dev server（http://）与 Electron 生产环境（file://）。
 * 注意：仓库目前并未提交该 VRM 文件；3D 模式在模型缺失时会回退到内置的程序化角色
 * （见 VRMCharacterController 的 fallback 分支），因此不要对该路径做预加载，以免产生 404。
 */
export const DEFAULT_VRM_MODEL_PATH = './assets/models/vrm/default-character.vrm';

/** 是否为默认（当前缺失的）VRM 模型路径 */
export function isDefaultVrmModelPath(modelPath?: string | null): boolean {
  return !modelPath || modelPath.endsWith('default-character.vrm');
}
