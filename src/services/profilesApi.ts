import { apiClient } from './apiClient';
import type { HermesProfileInfo, ProfileCommandResponse } from '../types/profiles';

export function listHermesProfiles(): Promise<HermesProfileInfo[]> {
  return apiClient.invokeShared<HermesProfileInfo[]>('list_hermes_profiles', undefined, {
    timeout: 20000,
  });
}

export function createHermesProfile(name: string, cloneDefault: boolean): Promise<ProfileCommandResponse> {
  return apiClient.invoke<ProfileCommandResponse>('create_hermes_profile', {
    name,
    clone_default: cloneDefault,
  }, { timeout: 60000, retries: 1 });
}

export function useHermesProfile(name: string): Promise<ProfileCommandResponse> {
  return apiClient.invoke<ProfileCommandResponse>('use_hermes_profile', { name }, { timeout: 20000 });
}

export function deleteHermesProfile(name: string): Promise<ProfileCommandResponse> {
  return apiClient.invoke<ProfileCommandResponse>('delete_hermes_profile', { name }, { timeout: 30000 });
}

export function renameHermesProfile(oldName: string, newName: string): Promise<ProfileCommandResponse> {
  return apiClient.invoke<ProfileCommandResponse>('rename_hermes_profile', {
    old_name: oldName,
    new_name: newName,
  }, { timeout: 30000 });
}

export function showHermesProfile(name: string): Promise<string> {
  return apiClient.invoke<string>('show_hermes_profile', { name }, { timeout: 20000 });
}

export function getHermesProfileSoul(name: string): Promise<string> {
  return apiClient.invoke<string>('get_hermes_profile_soul', { name }, { timeout: 20000 });
}

export function updateHermesProfileSoul(name: string, content: string): Promise<ProfileCommandResponse> {
  return apiClient.invoke<ProfileCommandResponse>('update_hermes_profile_soul', {
    name,
    content,
  }, { timeout: 30000 });
}

export function openHermesProfileShell(name: string): Promise<ProfileCommandResponse> {
  return apiClient.invoke<ProfileCommandResponse>('open_hermes_profile_shell', { name }, { timeout: 10000 });
}

export function runHermesProfileSetup(name: string): Promise<ProfileCommandResponse> {
  return apiClient.invoke<ProfileCommandResponse>('run_hermes_profile_setup', { name }, { timeout: 10000 });
}
