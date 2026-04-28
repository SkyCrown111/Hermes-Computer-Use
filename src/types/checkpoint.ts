// Checkpoint 相关类型定义

export interface Checkpoint {
  id: string;
  session_id: string;
  name: string | null;
  created_at: string;
  message_count: number;
  size_bytes: number;
  description: string | null;
}

export interface CreateCheckpointParams {
  session_id: string;
  name?: string;
  description?: string;
}

export interface CheckpointListResponse {
  checkpoints: Checkpoint[];
  total: number;
}

export interface RestoreCheckpointResult {
  success: boolean;
  session_id: string;
  checkpoint_id: string;
  restored_at: string;
  message_count: number;
}
