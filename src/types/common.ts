// 通用类型定义

export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export type Size = 'sm' | 'md' | 'lg' | 'xl';

export type Variant = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'ghost';

export type Status = 'idle' | 'loading' | 'success' | 'error';
