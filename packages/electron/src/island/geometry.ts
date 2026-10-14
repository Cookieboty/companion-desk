/**
 * 灵动岛几何：刘海屏检测 + 收起 / 展开尺寸与位置（纯函数，便于测试）。
 *
 * Electron 不暴露 NSScreen.safeAreaInsets，这里用可观测的信号判断刘海：
 * macOS 内建屏 + 菜单栏高度 ≥ 30pt（刘海机型菜单栏约 37–38pt，非刘海约 24–25pt）。
 * 判断错了也无害：只是从「贴刘海展开」退化为「顶部居中胶囊」。
 */
export interface DisplayLike {
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  internal?: boolean;
}

export type IslandMode = 'notch' | 'pill';

export interface IslandGeometry {
  mode: IslandMode;
  /** 窗口（= 展开后的岛）位置与尺寸 */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 收起时的尺寸（刘海宽 × 菜单栏高 / 小胶囊） */
  collapsed: { width: number; height: number };
  menuBarHeight: number;
}

/** macOS 刘海宽度约 180–210pt（14"/16" MacBook Pro、Air），取中间值 */
export const NOTCH_WIDTH = 196;

/** 调试 / 截图：CD_ISLAND_SIMULATE_NOTCH=1 在任意平台模拟 37pt 菜单栏 + 刘海 */
const simulate = () => process.env.CD_ISLAND_SIMULATE_NOTCH === '1';

export function hasNotch(platform: NodeJS.Platform, d: DisplayLike): boolean {
  if (simulate()) return true;
  if (platform !== 'darwin') return false;
  const menuBar = d.workArea.y - d.bounds.y;
  return d.internal !== false && menuBar >= 30;
}

export function islandGeometry(
  platform: NodeJS.Platform,
  d: DisplayLike,
  pref: 'auto' | 'pill' = 'auto',
): IslandGeometry {
  const menuBarHeight = simulate() ? 37 : Math.max(0, d.workArea.y - d.bounds.y);
  const notch = pref === 'auto' && hasNotch(platform, d);
  const width = Math.min(400, d.bounds.width - 32);
  const height = notch ? menuBarHeight + 76 : 76;
  const x = Math.round(d.bounds.x + (d.bounds.width - width) / 2);
  // 刘海：顶到屏幕最上沿，与刘海融为一体；其它：菜单栏 / 工作区顶部下方 8px
  const y = notch ? d.bounds.y : d.workArea.y + 8;
  return {
    mode: notch ? 'notch' : 'pill',
    x,
    y,
    width,
    height,
    collapsed: notch ? { width: NOTCH_WIDTH, height: menuBarHeight } : { width: 132, height: 30 },
    menuBarHeight,
  };
}
