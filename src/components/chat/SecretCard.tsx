import React, { useState, memo } from 'react';
import { logger } from '../../lib/logger';
import { useTranslation } from '../../hooks/useTranslation';

interface SecretCardProps {
  secret: {
    id: string;
    var_name: string;
    prompt: string;
    metadata: Record<string, unknown>;
  };
  onRespond: (value: string) => void | Promise<void>;
  onSkip: () => void | Promise<void>;
}

const SecretCardComponent: React.FC<SecretCardProps> = ({ secret, onRespond, onSkip }) => {
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [responding, setResponding] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = async () => {
    if (responding || !value.trim()) return;
    setResponding(true);
    logger.info('[SecretCard] Submitting secret for:', secret.var_name);
    try {
      await onRespond(value.trim());
      logger.info('[SecretCard] Secret submitted successfully');
    } catch (err) {
      logger.error('[SecretCard] Failed to submit secret:', err);
    } finally {
      setResponding(false);
    }
  };

  const handleSkip = async () => {
    if (responding) return;
    setResponding(true);
    logger.info('[SecretCard] Skipping secret for:', secret.var_name);
    try {
      await onSkip();
      logger.info('[SecretCard] Secret skipped');
    } catch (err) {
      logger.error('[SecretCard] Failed to skip secret:', err);
    } finally {
      setResponding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      handleSubmit();
    }
  };

  // Extract metadata info
  const requiredFor = secret.metadata?.required_for as string | undefined;
  const helpText = secret.metadata?.help_text as string | undefined;

  return (
    <div className="secret-card">
      <div className="secret-card-header">
        <div className="secret-card-icon">
          <span className="material-symbols-outlined">key</span>
        </div>
        <div className="secret-card-title">
          <span className="secret-card-label">{t('secret.needsKey')}</span>
          <span className="secret-card-var">{secret.var_name}</span>
        </div>
        <span className="secret-card-badge">
          <span className="secret-pulse" />
          {t('secret.waitingInput')}
        </span>
      </div>
      <div className="secret-card-body">
        <p className="secret-card-prompt">{secret.prompt}</p>
        {helpText && (
          <p className="secret-card-help">{helpText}</p>
        )}
        {requiredFor && (
          <p className="secret-card-required">{t('secret.usedFor').replace('{value}', requiredFor)}</p>
        )}
        <div className="secret-input-wrapper">
          <input
            type={showValue ? 'text' : 'password'}
            className="secret-input"
            placeholder={t('secret.enterValue').replace('{name}', secret.var_name)}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={responding}
            autoFocus
          />
          <button
            className="secret-toggle-visibility"
            onClick={() => setShowValue(v => !v)}
            type="button"
            title={showValue ? t('common.hide') : t('common.show')}
          >
            <span className="material-symbols-outlined">
              {showValue ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        </div>
        <p className="secret-security-note">
          <span className="material-symbols-outlined">lock</span>
          {t('secret.securityNote')}
        </p>
      </div>
      <div className="secret-card-actions">
        <button
          className="secret-btn skip"
          onClick={handleSkip}
          disabled={responding}
        >
          <span className="material-symbols-outlined">close</span>
          {t('secret.skip')}
        </button>
        <button
          className="secret-btn save"
          onClick={handleSubmit}
          disabled={responding || !value.trim()}
        >
          <span className="material-symbols-outlined">save</span>
          {t('secret.save')}
        </button>
      </div>
    </div>
  );
};

// Memoize to prevent re-renders when parent updates but secret props haven't changed
export const SecretCard = memo(SecretCardComponent);
