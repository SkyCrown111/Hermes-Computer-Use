export interface Skill {
  name: string;
  description?: string;
  version?: string;
  author?: string;
  license?: string;
  category: string;
  path: string;
  enabled: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
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

export interface SkillCategoriesResponse {
  categories: SkillCategory[];
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

export interface UpdateSkillParams {
  description?: string;
  content?: string;
  metadata?: {
    version?: string;
    author?: string;
    tags?: string[];
  };
}

export interface ToggleSkillParams {
  name: string;
  enabled: boolean;
}

export interface ToggleSkillResponse {
  ok: boolean;
  name: string;
  enabled: boolean;
}

export interface SkillExecutionParams {
  skill_name: string;
  skill_category: string;
  input_text?: string;
  parameters?: Record<string, string | number | boolean>;
  context?: string;
}

export interface SkillExecutionRecord {
  id: string;
  skill_name: string;
  skill_category: string;
  executed_at: string;
  input_text?: string;
  parameters?: Record<string, string | number | boolean>;
  status: 'success' | 'failed' | 'running';
  output?: string;
  duration_ms?: number;
  session_id?: string;
}

export interface Toolset {
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  available: boolean;
  configured: boolean;
  tools: string[];
}

export const SKILL_CATEGORY_DEFINITIONS: Record<string, { label: string; labelEn: string; icon: string; description: string; descriptionEn: string }> = {
  'coding': {
    label: '编程开发',
    labelEn: 'Coding',
    icon: '💻',
    description: '代码编写、调试、重构相关技能',
    descriptionEn: 'Skills for coding, debugging, and refactoring',
  },
  'analysis': {
    label: '数据分析',
    labelEn: 'Analysis',
    icon: '📊',
    description: '数据分析、可视化、统计相关技能',
    descriptionEn: 'Skills for data analysis, visualization, and statistics',
  },
  'automation': {
    label: '自动化',
    labelEn: 'Automation',
    icon: '🤖',
    description: '自动化任务、流程编排相关技能',
    descriptionEn: 'Skills for automation and workflow orchestration',
  },
  'research': {
    label: '研究调研',
    labelEn: 'Research',
    icon: '🔍',
    description: '信息检索、文献研究相关技能',
    descriptionEn: 'Skills for information retrieval and research',
  },
  'writing': {
    label: '内容创作',
    labelEn: 'Writing',
    icon: '✍️',
    description: '文档编写、内容生成相关技能',
    descriptionEn: 'Skills for documentation and content generation',
  },
  'security': {
    label: '安全审计',
    labelEn: 'Security',
    icon: '🔐',
    description: '安全检查、漏洞检测相关技能',
    descriptionEn: 'Skills for security audits and vulnerability detection',
  },
  'testing': {
    label: '测试验证',
    labelEn: 'Testing',
    icon: '🧪',
    description: '单元测试、集成测试相关技能',
    descriptionEn: 'Skills for unit and integration testing',
  },
  'devops': {
    label: '运维部署',
    labelEn: 'DevOps',
    icon: '🚀',
    description: '部署、监控、运维相关技能',
    descriptionEn: 'Skills for deployment, monitoring, and operations',
  },
  'ai': {
    label: 'AI 增强',
    labelEn: 'AI Enhanced',
    icon: '🧠',
    description: 'AI 辅助、模型优化相关技能',
    descriptionEn: 'Skills for AI assistance and model optimization',
  },
  'utils': {
    label: '实用工具',
    labelEn: 'Utilities',
    icon: '🔧',
    description: '通用工具、辅助功能相关技能',
    descriptionEn: 'General utility and helper skills',
  },
};
