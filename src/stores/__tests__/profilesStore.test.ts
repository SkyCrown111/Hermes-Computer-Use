import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfilesStore } from '../profilesStore';
import * as profilesApi from '../../services/profilesApi';

vi.mock('../../services/profilesApi', () => ({
  listHermesProfiles: vi.fn(),
  createHermesProfile: vi.fn(),
  useHermesProfile: vi.fn(),
  deleteHermesProfile: vi.fn(),
  renameHermesProfile: vi.fn(),
  showHermesProfile: vi.fn(),
  getHermesProfileSoul: vi.fn(),
  updateHermesProfileSoul: vi.fn(),
  openHermesProfileShell: vi.fn(),
  runHermesProfileSetup: vi.fn(),
}));

const mockProfile = {
  name: 'work',
  is_default: false,
  is_active: false,
  home: '/home/.hermes/profiles/work',
  skills_count: 0,
  env_configured: true,
};

describe('ProfilesStore', () => {
  beforeEach(() => {
    useProfilesStore.setState({
      profiles: [],
      selectedProfileDetail: null,
      loading: false,
      actionLoading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  it('fetchProfiles loads profiles', async () => {
    vi.mocked(profilesApi.listHermesProfiles).mockResolvedValue([mockProfile]);

    await useProfilesStore.getState().fetchProfiles();

    expect(useProfilesStore.getState().profiles).toHaveLength(1);
    expect(useProfilesStore.getState().loading).toBe(false);
  });

  it('fetchProfiles sets error on failure', async () => {
    vi.mocked(profilesApi.listHermesProfiles).mockRejectedValue(new Error('list failed'));

    await useProfilesStore.getState().fetchProfiles();

    expect(useProfilesStore.getState().error).toBe('list failed');
  });

  it('createProfile refreshes list on success', async () => {
    vi.mocked(profilesApi.createHermesProfile).mockResolvedValue({ ok: true, message: 'ok' });
    vi.mocked(profilesApi.listHermesProfiles).mockResolvedValue([mockProfile]);

    const ok = await useProfilesStore.getState().createProfile('work', true);

    expect(ok).toBe(true);
    expect(profilesApi.createHermesProfile).toHaveBeenCalledWith('work', true);
  });

  it('useProfile deleteProfile renameProfile return boolean', async () => {
    vi.mocked(profilesApi.useHermesProfile).mockResolvedValue({ ok: true, message: 'ok' });
    vi.mocked(profilesApi.deleteHermesProfile).mockResolvedValue({ ok: true, message: 'ok' });
    vi.mocked(profilesApi.renameHermesProfile).mockResolvedValue({ ok: true, message: 'ok' });
    vi.mocked(profilesApi.listHermesProfiles).mockResolvedValue([]);

    expect(await useProfilesStore.getState().useProfile('work')).toBe(true);
    expect(await useProfilesStore.getState().deleteProfile('work')).toBe(true);
    expect(await useProfilesStore.getState().renameProfile('work', 'personal')).toBe(true);
  });

  it('showProfile sets detail', async () => {
    vi.mocked(profilesApi.showHermesProfile).mockResolvedValue('profile yaml');

    await useProfilesStore.getState().showProfile('work');

    expect(useProfilesStore.getState().selectedProfileDetail).toBe('profile yaml');
  });

  it('getSoul and saveSoul', async () => {
    vi.mocked(profilesApi.getHermesProfileSoul).mockResolvedValue('soul content');
    const soul = await useProfilesStore.getState().getSoul('work');
    expect(soul).toBe('soul content');

    vi.mocked(profilesApi.updateHermesProfileSoul).mockResolvedValue({ ok: true, message: 'ok' });
    expect(await useProfilesStore.getState().saveSoul('work', 'new soul')).toBe(true);
  });

  it('openShell and runSetup', async () => {
    vi.mocked(profilesApi.openHermesProfileShell).mockResolvedValue({ ok: true, message: 'ok' });
    vi.mocked(profilesApi.runHermesProfileSetup).mockResolvedValue({ ok: true, message: 'ok' });

    expect(await useProfilesStore.getState().openShell('work')).toBe(true);
    expect(await useProfilesStore.getState().runSetup('work')).toBe(true);
  });

  it('action failures set error and return false', async () => {
    vi.mocked(profilesApi.createHermesProfile).mockRejectedValue(new Error('create failed'));

    expect(await useProfilesStore.getState().createProfile('bad', false)).toBe(false);
    expect(useProfilesStore.getState().error).toBe('create failed');
  });

  it('clearDetail and clearError', () => {
    useProfilesStore.setState({ selectedProfileDetail: 'x', error: 'e' });
    useProfilesStore.getState().clearDetail();
    useProfilesStore.getState().clearError();
    expect(useProfilesStore.getState().selectedProfileDetail).toBeNull();
    expect(useProfilesStore.getState().error).toBeNull();
  });
});
