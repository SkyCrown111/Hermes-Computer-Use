import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ConfirmModal, EditIcon, TrashIcon, UserIcon, XIcon } from '../../components';
import { useTranslation } from '../../hooks/useTranslation';
import { useProfilesStore } from '../../stores';
import { toast } from '../../stores/toastStore';
import type { HermesProfileInfo } from '../../types/profiles';
import './Profiles.css';

const PROFILE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function getCliCommand(profile: HermesProfileInfo): string {
  return profile.is_default ? 'hermes setup' : `${profile.name} setup`;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function ShellArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function ProfileRow({
  profile,
  onCopyCli,
  onEditSoul,
  onRename,
  onDelete,
}: {
  profile: HermesProfileInfo;
  onCopyCli: (profile: HermesProfileInfo) => void;
  onEditSoul: (profile: HermesProfileInfo) => void;
  onRename: (profile: HermesProfileInfo) => void;
  onDelete: (profile: HermesProfileInfo) => void;
}) {
  const { t } = useTranslation();
  const modelLabel = profile.model && profile.provider
    ? `${profile.model}(${profile.provider})`
    : profile.model || profile.provider || '-';

  return (
    <article className={`profile-row ${profile.is_active ? 'profile-row-active' : ''}`}>
      <div className="profile-row-main">
        <div className="profile-row-title">
          <span className="profile-name">{profile.name}</span>
          {profile.is_default && <span className="profile-tag">{t('profiles.default')}</span>}
          {profile.is_active && !profile.is_default && <span className="profile-tag profile-tag-active">{t('profiles.active')}</span>}
          <span className={`profile-tag ${profile.env_configured ? '' : 'profile-tag-muted'}`}>
            {profile.env_configured ? t('profiles.envConfigured') : t('profiles.envMissing')}
          </span>
        </div>
        <div className="profile-row-meta">
          <span>{t('profiles.model')}: {modelLabel}</span>
          <span>{t('profiles.skills')}: {profile.skills_count}</span>
          <code>{profile.home}</code>
        </div>
      </div>
      <div className="profile-row-actions">
        <button className="profile-icon-button profile-soul-button" onClick={() => onEditSoul(profile)} title={t('profiles.editSoul')}>
          s
        </button>
        <button className="profile-icon-button" onClick={() => onCopyCli(profile)} title={t('profiles.copyCli')}>
          <ShellArrowIcon />
        </button>
        {!profile.is_default && (
          <>
            <button className="profile-icon-button" onClick={() => onRename(profile)} title={t('profiles.rename')}>
              <EditIcon size={17} />
            </button>
            <button className="profile-icon-button profile-danger-button" onClick={() => onDelete(profile)} title={t('profiles.delete')}>
              <TrashIcon size={17} />
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function ProfileFormModal({
  open,
  actionLoading,
  onClose,
  onCreate,
}: {
  open: boolean;
  actionLoading: boolean;
  onClose: () => void;
  onCreate: (name: string, cloneDefault: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [cloneDefault, setCloneDefault] = useState(true);

  useEffect(() => {
    if (open) {
      setName('');
      setCloneDefault(true);
    }
  }, [open]);

  if (!open) return null;

  const normalizedName = name.trim();
  const isValid = PROFILE_NAME_PATTERN.test(normalizedName);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValid || actionLoading) return;
    await onCreate(normalizedName, cloneDefault);
  };

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <section className="profile-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header className="profile-modal-header">
          <h2>{t('profiles.createTitle')}</h2>
          <button className="profile-modal-close" onClick={onClose} aria-label={t('common.cancel')}>
            <XIcon size={18} />
          </button>
        </header>
        <form className="profile-form" onSubmit={handleSubmit}>
          <label className="profile-form-field">
            <span>{t('profiles.name')}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('profiles.namePlaceholder')}
              autoFocus
            />
          </label>
          <p className="profile-form-help">{t('profiles.nameHelp')}</p>
          <label className="profile-checkbox">
            <input
              type="checkbox"
              checked={cloneDefault}
              onChange={(event) => setCloneDefault(event.target.checked)}
            />
            <span>{t('profiles.cloneDefault')}</span>
          </label>
          <div className="profile-modal-actions">
            <button type="button" className="profile-secondary-button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="profile-primary-button" disabled={!isValid || actionLoading}>
              {t('profiles.create')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function Profiles() {
  const { t } = useTranslation();
  const profiles = useProfilesStore(s => s.profiles);
  const loading = useProfilesStore(s => s.loading);
  const actionLoading = useProfilesStore(s => s.actionLoading);
  const error = useProfilesStore(s => s.error);
  const selectedProfileDetail = useProfilesStore(s => s.selectedProfileDetail);
  const fetchProfiles = useProfilesStore(s => s.fetchProfiles);
  const createProfile = useProfilesStore(s => s.createProfile);
  const deleteProfile = useProfilesStore(s => s.deleteProfile);
  const renameProfile = useProfilesStore(s => s.renameProfile);
  const getSoul = useProfilesStore(s => s.getSoul);
  const saveSoul = useProfilesStore(s => s.saveSoul);
  const clearDetail = useProfilesStore(s => s.clearDetail);
  const clearError = useProfilesStore(s => s.clearError);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HermesProfileInfo | null>(null);
  const [renameTarget, setRenameTarget] = useState<HermesProfileInfo | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingSoulProfile, setEditingSoulProfile] = useState<string | null>(null);
  const [soulDraft, setSoulDraft] = useState('');
  const [soulLoading, setSoulLoading] = useState(false);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  useEffect(() => {
    if (renameTarget) setRenameValue(renameTarget.name);
  }, [renameTarget]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const sortedProfiles = useMemo(() => profiles, [profiles]);

  const handleCreate = async (name: string, cloneDefault: boolean) => {
    const ok = await createProfile(name, cloneDefault);
    if (ok) {
      toast.success(t('profiles.created'));
      setCreateOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deleteProfile(deleteTarget.name);
    if (ok) {
      toast.success(t('profiles.deleted'));
      setDeleteTarget(null);
    }
  };

  const handleRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renameTarget) return;
    const newName = renameValue.trim();
    if (!PROFILE_NAME_PATTERN.test(newName)) return;
    const ok = await renameProfile(renameTarget.name, newName);
    if (ok) {
      toast.success(t('profiles.updated'));
      setRenameTarget(null);
    }
  };

  const handleCopyCli = async (profile: HermesProfileInfo) => {
    await copyText(getCliCommand(profile));
    toast.success(t('profiles.cliCopied'));
  };

  const handleEditSoul = async (profile: HermesProfileInfo) => {
    if (editingSoulProfile === profile.name) {
      setEditingSoulProfile(null);
      setSoulDraft('');
      return;
    }

    setEditingSoulProfile(profile.name);
    setSoulLoading(true);
    const content = await getSoul(profile.name);
    setSoulDraft(content ?? '');
    setSoulLoading(false);
  };

  const handleSaveSoul = async () => {
    if (!editingSoulProfile) return;
    const ok = await saveSoul(editingSoulProfile, soulDraft);
    if (ok) toast.success(t('profiles.soulSaved'));
  };

  return (
    <main className="profiles-page">
      <header className="profiles-page-header">
        <h1>{t('profiles.title')}</h1>
        <button className="profile-primary-button" onClick={() => setCreateOpen(true)}>
          {t('profiles.create')}
        </button>
      </header>

      <section className="profiles-list-section">
        <div className="profiles-list-heading">
          <span className="profiles-list-icon"><UserIcon size={20} /></span>
          <h2>{t('profiles.listTitle')} ({sortedProfiles.length})</h2>
        </div>

        {loading ? (
          <div className="profiles-loading">
            <div className="loading-spinner" />
            <span>{t('loading.loading')}</span>
          </div>
        ) : sortedProfiles.length === 0 ? (
          <div className="profiles-empty">{t('profiles.empty')}</div>
        ) : (
          <div className="profiles-list">
            {sortedProfiles.map(profile => (
              <div key={profile.name} className="profile-item">
                <ProfileRow
                  profile={profile}
                  onCopyCli={handleCopyCli}
                  onEditSoul={handleEditSoul}
                  onRename={setRenameTarget}
                  onDelete={setDeleteTarget}
                />
                {editingSoulProfile === profile.name && (
                  <section className="profile-soul-editor">
                    <label className="profile-soul-label" htmlFor={`soul-${profile.name}`}>
                      {t('profiles.soulTitle')}
                    </label>
                    {soulLoading ? (
                      <div className="profile-soul-loading">{t('loading.loading')}</div>
                    ) : (
                      <textarea
                        id={`soul-${profile.name}`}
                        className="profile-soul-textarea"
                        value={soulDraft}
                        onChange={(event) => setSoulDraft(event.target.value)}
                        spellCheck={false}
                      />
                    )}
                    <div className="profile-soul-actions">
                      <button className="profile-primary-button" onClick={handleSaveSoul} disabled={soulLoading || actionLoading}>
                        {t('profiles.saveSoul')}
                      </button>
                    </div>
                  </section>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <ProfileFormModal
        open={createOpen}
        actionLoading={actionLoading}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      {renameTarget && (
        <div className="profile-modal-overlay" onClick={() => setRenameTarget(null)}>
          <section className="profile-modal profile-rename-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <header className="profile-modal-header">
              <h2>{t('profiles.renameTitle')}</h2>
              <button className="profile-modal-close" onClick={() => setRenameTarget(null)} aria-label={t('common.cancel')}>
                <XIcon size={18} />
              </button>
            </header>
            <form className="profile-form" onSubmit={handleRename}>
              <label className="profile-form-field">
                <span>{t('profiles.name')}</span>
                <input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus />
              </label>
              <p className="profile-form-help">{t('profiles.nameHelp')}</p>
              <div className="profile-modal-actions">
                <button type="button" className="profile-secondary-button" onClick={() => setRenameTarget(null)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="profile-primary-button" disabled={!PROFILE_NAME_PATTERN.test(renameValue.trim()) || actionLoading}>
                  {t('common.save')}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedProfileDetail !== null && (
        <div className="profile-modal-overlay" onClick={clearDetail}>
          <section className="profile-modal profile-detail-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <header className="profile-modal-header">
              <h2>{t('profiles.detailTitle')}</h2>
              <button className="profile-modal-close" onClick={clearDetail} aria-label={t('common.cancel')}>
                <XIcon size={18} />
              </button>
            </header>
            <pre className="profile-detail-output">{selectedProfileDetail || '-'}</pre>
          </section>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={t('profiles.delete')}
        message={t('profiles.deleteConfirm')}
        confirmText={t('profiles.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {error && (
        <button className="profile-error-clear" onClick={clearError}>
          {error}
        </button>
      )}
    </main>
  );
}
