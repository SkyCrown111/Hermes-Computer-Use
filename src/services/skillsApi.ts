// Skills API Service - Tauri Commands

import { safeInvoke } from '../lib/tauri';
import { logger } from '../lib/logger';
import type { Skill, SkillDetail, SkillCategory } from '../types/skill';

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

// Delete a skill
export async function deleteSkill(name: string): Promise<void> {
  await safeInvoke('delete_skill', { name });
}

// Get skills directory path
export async function getSkillsPath(): Promise<string> {
  return safeInvoke<string>('get_skills_path');
}

// Export all functions
export const skillsApi = {
  listSkills,
  getSkill,
  getSkillDetail,
  getCategories,
  toggleSkill,
  saveSkill,
  deleteSkill,
  getSkillsPath,
};
