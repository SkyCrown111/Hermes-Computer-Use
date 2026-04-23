// Skill 类型定义

export interface Skill {
  name: string;
  description?: string;
  version?: string;
  author?: string;
  category?: string;
  path?: string;
  enabled: boolean;
  tags?: string[];
}

export interface SkillDetail {
  name: string;
  category: string;
  path: string;
  content: string;
  metadata: {
    name: string;
    description: string;
    version: string;
    author: string;
    license?: string;
    metadata?: {
      hermes?: {
        tags: string[];
        related_skills?: string[];
      };
    };
  };
}

export interface SkillCategory {
  name: string;
  description?: string;
  skill_count: number;
}

export interface CreateSkillParams {
  name: string;
  category: string;
  description: string;
  content: string;
  metadata?: {
    version?: string;
    author?: string;
    tags?: string[];
  };
}
