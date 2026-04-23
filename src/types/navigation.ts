// 导航项类型
import type { ReactNode } from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  path: string;
  badge?: number | string;
}

// 导航分组
export interface NavGroup {
  title?: string;
  items: NavItem[];
}

// 侧边栏状态
export interface SidebarState {
  collapsed: boolean;
  activeItem: string;
}
