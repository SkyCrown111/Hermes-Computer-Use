export interface HermesProfileInfo {
  name: string;
  is_default: boolean;
  is_active: boolean;
  home: string;
  model?: string | null;
  provider?: string | null;
  skills_count: number;
  env_configured: boolean;
}

export interface ProfileCommandResponse {
  ok: boolean;
  message: string;
}
