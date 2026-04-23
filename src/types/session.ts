// Session 相关类型定义

export interface Session {
  id: string;
  platform: string; // 'telegram' | 'discord' | 'slack' | 'cli' | 'cron' | 'weixin' | etc.
  chat_id: string;
  chat_name: string;
  chat_type?: 'private' | 'group';
  user_id?: string;
  user_name?: string;
  started_at: string;
  last_activity_at: string;
  message_count: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  reasoning_tokens?: number;
  estimated_cost_usd: number;
  actual_cost_usd?: number | null;
  status: string; // 'active' | 'completed' | 'error' | etc.
}

export interface SessionListResponse {
  sessions: Session[];
  total: number;
  limit: number;
  offset: number;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
  reasoning?: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface SessionMessagesResponse {
  session_id: string;
  messages: SessionMessage[];
}

export interface SessionSearchParams {
  q?: string;
  platform?: string;
  days?: number;
}

export interface SessionSearchResult {
  session_id: string;
  platform: string;
  matched_at: string;
  context: string;
  relevance_score: number;
}

export interface SessionSearchResponse {
  query: string;
  results: SessionSearchResult[];
  total: number;
}

export interface SessionListParams {
  platform?: string;
  limit?: number;
  offset?: number;
}
