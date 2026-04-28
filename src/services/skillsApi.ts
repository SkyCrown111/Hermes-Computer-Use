// Skills API Service - Tauri Commands

import { safeInvoke } from '../lib/tauri';
import { logger } from '../lib/logger';
import type { Skill, SkillDetail, SkillCategory, CreateSkillParams, SkillExecutionParams, SkillExecutionRecord } from '../types/skill';

export interface SkillListResponse {
  skills: Skill[];
  total: number;
}

export interface SkillCategoriesResponse {
  categories: SkillCategory[];
}

// List all skills
export async function listSkills(category?: string): Promise<SkillListResponse> {
  const skills = await safeInvoke<Skill[]>('list_skills', category ? { category } : undefined);
  return {
    skills: skills || [],
    total: skills?.length || 0,
  };
}

// Get a single skill by name
export async function getSkill(name: string): Promise<Skill> {
  return safeInvoke<Skill>('get_skill', { name });
}

// Get skill detail by category and name
export async function getSkillDetail(category: string, name: string): Promise<SkillDetail> {
  return safeInvoke<SkillDetail>('get_skill_detail', { category, name });
}

// Get skill categories
export async function getCategories(): Promise<SkillCategoriesResponse> {
  const categories = await safeInvoke<SkillCategory[]>('get_skill_categories');
  logger.debug('[SkillsApi] getCategories result:', categories);
  return {
    categories: categories || [],
  };
}

// Toggle skill enabled status
export async function toggleSkill(name: string, enabled: boolean): Promise<void> {
  await safeInvoke('toggle_skill', { name, enabled });
}

// Save a skill
export async function saveSkill(skill: Skill): Promise<void> {
  await safeInvoke('save_skill', { skill });
}

// Create a new skill with content
export async function createSkill(params: CreateSkillParams): Promise<void> {
  await safeInvoke('create_skill', { params });
}

// Delete a skill
export async function deleteSkill(category: string, name: string): Promise<void> {
  await safeInvoke('delete_skill', { category, name });
}

// Get skills directory path
export async function getSkillsPath(): Promise<string> {
  return safeInvoke<string>('get_skills_path');
}

// Execute a skill with parameters
export async function executeSkill(params: SkillExecutionParams): Promise<{ session_id: string; status: string }> {
  logger.debug('[SkillsApi] executeSkill params:', params);
  // For now, execution starts a new chat session with the skill context
  // This is handled by the frontend navigation, but we can track execution here
  const sessionId = `skill_${params.skill_category}_${params.skill_name}_${Date.now()}`;
  return {
    session_id: sessionId,
    status: 'started',
  };
}

// Get skill execution history (mock implementation - stores in localStorage)
export async function getExecutionHistory(skillName?: string): Promise<SkillExecutionRecord[]> {
  // In a real implementation, this would fetch from backend
  // For now, we use localStorage for demo purposes
  const historyKey = 'hermes_skill_execution_history';
  const storedHistory = localStorage.getItem(historyKey);
  if (!storedHistory) return [];

  try {
    const history: SkillExecutionRecord[] = JSON.parse(storedHistory);
    if (skillName) {
      return history.filter(record => record.skill_name === skillName);
    }
    return history;
  } catch (error) {
    logger.error('[SkillsApi] Failed to parse execution history:', error);
    return [];
  }
}

// Save execution record to history
export async function saveExecutionRecord(record: SkillExecutionRecord): Promise<void> {
  const historyKey = 'hermes_skill_execution_history';
  const storedHistory = localStorage.getItem(historyKey);
  const history: SkillExecutionRecord[] = storedHistory ? JSON.parse(storedHistory) : [];

  // Add new record and keep only last 100
  history.unshift(record);
  if (history.length > 100) {
    history.pop();
  }

  localStorage.setItem(historyKey, JSON.stringify(history));
}

// Export all functions
export const skillsApi = {
  listSkills,
  getSkill,
  getSkillDetail,
  getCategories,
  toggleSkill,
  saveSkill,
  createSkill,
  deleteSkill,
  getSkillsPath,
  executeSkill,
  getExecutionHistory,
  saveExecutionRecord,
};
