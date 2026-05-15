import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import { DEFAULT_PATHS } from './constants';
import type {
  Skill,
  SkillDetail,
  SkillCategoriesResponse,
  CreateSkillParams,
  UpdateSkillParams,
  ToggleSkillParams,
  ToggleSkillResponse,
  Toolset,
  SkillExecutionRecord,
} from '../types/skill';
import type { ApiOkResponse } from '../types/common';

export async function listSkills(): Promise<Skill[]> {
  try {
    return await apiClient.invokeShared<Skill[]>('list_skills');
  } catch (error) {
    logger.error(`[SkillsApi] listSkills failed: ${getErrorDetail(error)}`);
    return [];
  }
}

export async function getSkillDetail(name: string, category: string): Promise<SkillDetail | null> {
  try {
    return await apiClient.invoke<SkillDetail>('get_skill_detail', { name, category });
  } catch (error) {
    logger.error(`[SkillsApi] getSkillDetail failed: ${getErrorDetail(error)}`);
    return null;
  }
}

// 获取单个 Skill（简化版）
export async function getSkill(name: string): Promise<Skill | null> {
  try {
    return await apiClient.invoke<Skill>('get_skill', { name });
  } catch (error) {
    logger.error(`[SkillsApi] getSkill failed: ${getErrorDetail(error)}`);
    return null;
  }
}

export async function getSkillCategories(): Promise<SkillCategoriesResponse> {
  try {
    const categories = await apiClient.invokeShared<SkillCategoriesResponse['categories']>('get_skill_categories');
    return { categories };
  } catch (error) {
    logger.error(`[SkillsApi] getSkillCategories failed: ${getErrorDetail(error)}`);
    return { categories: [] };
  }
}

export async function toggleSkill(params: ToggleSkillParams): Promise<ToggleSkillResponse> {
  return apiClient.invoke<ToggleSkillResponse>('toggle_skill', {
    name: params.name,
    category: params.category,
    enabled: params.enabled,
  });
}

export async function createSkill(params: CreateSkillParams): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('create_skill', {
    name: params.name,
    category: params.category,
    description: params.description,
    content: params.content,
    metadata: params.metadata,
  });
}

export async function updateSkill(name: string, category: string, params: UpdateSkillParams): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('update_skill', {
    category,
    name,
    description: params.description || '',
    content: params.content || '',
  });
}

export async function deleteSkill(name: string, category: string): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('delete_skill', { name, category });
}

export async function getToolsets(): Promise<Toolset[]> {
  try {
    return await apiClient.invoke<Toolset[]>('list_toolsets');
  } catch (error) {
    logger.error(`[SkillsApi] getToolsets failed: ${getErrorDetail(error)}`);
    return [];
  }
}

export async function getSkillsPath(): Promise<string> {
  try {
    return await apiClient.invoke<string>('get_skills_path');
  } catch (error) {
    logger.debug('[Skills] getSkillsPath failed, using default:', getErrorDetail(error));
    return DEFAULT_PATHS.skills;
  }
}

export async function getSkillExecutionHistory(skillName: string, limit?: number, skillCategory?: string): Promise<SkillExecutionRecord[]> {
  try {
    return await apiClient.invoke<SkillExecutionRecord[]>('get_skill_execution_history', {
      skill_name: skillName,
      limit,
      skill_category: skillCategory,
    });
  } catch (error) {
    logger.error(`[SkillsApi] getSkillExecutionHistory failed: ${getErrorDetail(error)}`);
    return [];
  }
}
