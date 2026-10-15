/**
 * 通用 UI 图标：lucide-react（ISC）。供应商品牌仍用 @nomi-ai/ui BrandIcon / EndpointIcon（lobe 静态 SVG）。
 * 不引入完整 @lobehub/icons React 包（体积大、且品牌已覆盖）。
 */
import {
  Bell,
  BookOpen,
  Brain,
  Calendar,
  CalendarDays,
  FolderLock,
  HardDrive,
  Home,
  Keyboard,
  Mic,
  Monitor,
  Puzzle,
  Scissors,
  Settings,
  Sparkles,
  Terminal,
  ArrowUpCircle,
  Lock,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import React from 'react';

const sz = { width: 16, height: 16, strokeWidth: 1.75 } as const;

export function AppIcon({
  icon: Icon,
  size = 16,
  className,
  'aria-hidden': ariaHidden = true,
}: {
  icon: LucideIcon;
  size?: number;
  className?: string;
  'aria-hidden'?: boolean;
}) {
  return (
    <Icon
      width={size}
      height={size}
      strokeWidth={1.75}
      className={className}
      aria-hidden={ariaHidden}
    />
  );
}

/** 设置页分区图标 */
export const SETTINGS_ICONS = {
  general: Settings,
  shortcuts: Keyboard,
  coding: Terminal,
  voice: Mic,
  kb: BookOpen,
  memory: Brain,
  schedule: CalendarDays,
  calendar: Calendar,
  notify: Bell,
  screen: Monitor,
  ext: Puzzle,
  desktop: FolderLock,
  local: HardDrive,
  privacy: Lock,
  updates: ArrowUpCircle,
} as const;

/** 输入框「更多」菜单等功能入口 */
export const FEATURE_ICONS = {
  kb: BookOpen,
  fork: Scissors,
  settings: Settings,
  voice: Mic,
  files: FolderLock,
  memory: Brain,
  schedule: CalendarDays,
  screen: Monitor,
  ext: Puzzle,
  desktop: FolderLock,
  local: Home,
  appSettings: Settings,
  sparkles: Sparkles,
} as const;

export type { LucideIcon, LucideProps };
export { sz };
