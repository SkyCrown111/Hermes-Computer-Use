// Analytics 统计相关类型定义

export interface UsageTotals {
  total_input: number;
  total_output: number;
  total_cache_read: number;
  total_reasoning: number;
  total_estimated_cost: number;
  total_actual_cost: number;
  total_sessions: number;
}

export interface DailyUsage {
  day: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  reasoning_tokens: number;
  estimated_cost: number;
  actual_cost: number;
  sessions: number;
}

export interface ModelUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  sessions: number;
}

export interface UsageAnalytics {
  period_days: number;
  totals: UsageTotals;
  daily: DailyUsage[];
  by_model: ModelUsage[];
}

export interface UsageParams {
  days?: number;
}
