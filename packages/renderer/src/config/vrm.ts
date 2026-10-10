/**
 * VRM（3D 模式）模型配置。
 *
 * 统一使用相对路径，兼容 Vite dev server（http://）与 Electron 生产环境（file://）。
 * 内置模型均为 pixiv VRoid 项目以 CC0 发布的样例模型，详见 assets/models/vrm/CREDITS.md。
 */
export const DEFAULT_VRM_MODEL_PATH = './assets/models/vrm/default-character.vrm';
export const VRM_MODEL_LIST_PATH = './assets/models/vrm/model-list.json';
