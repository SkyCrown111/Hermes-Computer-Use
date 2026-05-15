import { create } from 'zustand';
import type { HermesProfileInfo } from '../types/profiles';
import * as profilesApi from '../services/profilesApi';
import { getErrorMessage } from '../lib/errorUtils';

interface ProfilesState {
  profiles: HermesProfileInfo[];
  selectedProfileDetail: string | null;
  loading: boolean;
  actionLoading: boolean;
  error: string | null;
  fetchProfiles: () => Promise<void>;
  createProfile: (name: string, cloneDefault: boolean) => Promise<boolean>;
  useProfile: (name: string) => Promise<boolean>;
  deleteProfile: (name: string) => Promise<boolean>;
  renameProfile: (oldName: string, newName: string) => Promise<boolean>;
  showProfile: (name: string) => Promise<void>;
  getSoul: (name: string) => Promise<string | null>;
  saveSoul: (name: string, content: string) => Promise<boolean>;
  openShell: (name: string) => Promise<boolean>;
  runSetup: (name: string) => Promise<boolean>;
  clearDetail: () => void;
  clearError: () => void;
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  selectedProfileDetail: null,
  loading: false,
  actionLoading: false,
  error: null,

  fetchProfiles: async () => {
    set({ loading: true, error: null });
    try {
      const profiles = await profilesApi.listHermesProfiles();
      set({ profiles, loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err), loading: false });
    }
  },

  createProfile: async (name, cloneDefault) => {
    set({ actionLoading: true, error: null });
    try {
      await profilesApi.createHermesProfile(name, cloneDefault);
      await get().fetchProfiles();
      set({ actionLoading: false });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err), actionLoading: false });
      return false;
    }
  },

  useProfile: async (name) => {
    set({ actionLoading: true, error: null });
    try {
      await profilesApi.useHermesProfile(name);
      await get().fetchProfiles();
      set({ actionLoading: false });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err), actionLoading: false });
      return false;
    }
  },

  deleteProfile: async (name) => {
    set({ actionLoading: true, error: null });
    try {
      await profilesApi.deleteHermesProfile(name);
      await get().fetchProfiles();
      set({ actionLoading: false });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err), actionLoading: false });
      return false;
    }
  },

  renameProfile: async (oldName, newName) => {
    set({ actionLoading: true, error: null });
    try {
      await profilesApi.renameHermesProfile(oldName, newName);
      await get().fetchProfiles();
      set({ actionLoading: false });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err), actionLoading: false });
      return false;
    }
  },

  showProfile: async (name) => {
    set({ actionLoading: true, error: null, selectedProfileDetail: null });
    try {
      const detail = await profilesApi.showHermesProfile(name);
      set({ selectedProfileDetail: detail, actionLoading: false });
    } catch (err) {
      set({ error: getErrorMessage(err), actionLoading: false });
    }
  },

  getSoul: async (name) => {
    set({ actionLoading: true, error: null });
    try {
      const content = await profilesApi.getHermesProfileSoul(name);
      set({ actionLoading: false });
      return content;
    } catch (err) {
      set({ error: getErrorMessage(err), actionLoading: false });
      return null;
    }
  },

  saveSoul: async (name, content) => {
    set({ actionLoading: true, error: null });
    try {
      await profilesApi.updateHermesProfileSoul(name, content);
      set({ actionLoading: false });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err), actionLoading: false });
      return false;
    }
  },

  openShell: async (name) => {
    set({ actionLoading: true, error: null });
    try {
      await profilesApi.openHermesProfileShell(name);
      set({ actionLoading: false });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err), actionLoading: false });
      return false;
    }
  },

  runSetup: async (name) => {
    set({ actionLoading: true, error: null });
    try {
      await profilesApi.runHermesProfileSetup(name);
      set({ actionLoading: false });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err), actionLoading: false });
      return false;
    }
  },

  clearDetail: () => set({ selectedProfileDetail: null }),
  clearError: () => set({ error: null }),
}));
