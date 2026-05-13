import React, { useState, memo, useMemo } from 'react';
import { logger } from '../../lib/logger';
import { useSettingsStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { AlertIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, InfoIcon, ShieldIcon, SparklesIcon, XIcon } from '../ui/Icons';

type ApprovalChoice = 'once' | 'session' | 'always' | 'deny';

interface PermissionCardProps {
  approval: {
    id: string;
    command: string;
    description: string;
    allow_permanent: boolean;
    choices?: ApprovalChoice[];  // Optional: backend may specify which choices are available
  };
  onRespond: (choice: ApprovalChoice) => void | Promise<void>;
}

const PermissionCardComponent: React.FC<PermissionCardProps> = ({ approval, onRespond }) => {
  const [showCommand, setShowCommand] = useState(false);
  const [responding, setResponding] = useState(false);
  const { t } = useTranslation();

  // Get approval config from store
  const approvalConfig = useSettingsStore((s) => s.approvalConfig);

  // Determine available choices from backend response or fallback to defaults
  const availableChoices = approval.choices || (
    approval.allow_permanent
      ? ['once', 'session', 'always', 'deny'] as ApprovalChoice[]
      : ['once', 'session', 'deny'] as ApprovalChoice[]
  );

  const hasChoice = (choice: ApprovalChoice) => availableChoices.includes(choice);

  // Check if command is in safe or dangerous list
  const commandStatus = useMemo(() => {
    const cmd = approval.command.toLowerCase();
    const safeCommands = approvalConfig?.safe_commands || [];
    const dangerousCommands = approvalConfig?.dangerous_commands || [];

    // Check if any safe command pattern matches
    for (const safeCmd of safeCommands) {
      const pattern = safeCmd.toLowerCase();
      if (cmd.startsWith(pattern) || cmd.includes(pattern)) {
        return 'safe' as const;
      }
    }

    // Check if any dangerous command pattern matches
    for (const dangerousCmd of dangerousCommands) {
      const pattern = dangerousCmd.toLowerCase();
      if (cmd.startsWith(pattern) || cmd.includes(pattern)) {
        return 'dangerous' as const;
      }
    }

    return 'normal' as const;
  }, [approval.command, approvalConfig?.safe_commands, approvalConfig?.dangerous_commands]);

  // Determine if we should show command preview based on config
  const showCommandPreview = approvalConfig?.show_command_preview ?? true;

  const handleRespond = async (choice: ApprovalChoice) => {
    if (responding) return;
    setResponding(true);
    logger.info('[PermissionCard] User clicked:', choice, 'for approval:', approval.id);
    try {
      await onRespond(choice);
      logger.info('[PermissionCard] Response completed:', choice);
    } catch (err) {
      logger.error('[PermissionCard] Response failed:', err);
    } finally {
      setResponding(false);
    }
  };

  return (
    <div className={`permission-card ${commandStatus}`}>
      <div className="permission-card-header">
        <div className="permission-card-icon">
          {commandStatus === 'safe' ? <SparklesIcon size={18} /> : commandStatus === 'dangerous' ? <AlertIcon size={18} /> : <ShieldIcon size={18} />}
        </div>
        <div className="permission-card-title">
          <span className="permission-card-label">
            {commandStatus === 'dangerous' ? t('permission.dangerousCommand') : t('permission.needsConfirm')}
          </span>
          <span className="permission-card-desc">{approval.description}</span>
          {commandStatus === 'safe' && (
            <span className="permission-card-tag safe">{t('permission.safeCommand')}</span>
          )}
          {commandStatus === 'dangerous' && (
            <span className="permission-card-tag dangerous">{t('permission.dangerousCommand')}</span>
          )}
        </div>
        <span className="permission-card-badge">
          <span className="permission-pulse" />
          {t('permission.waitingConfirm')}
        </span>
      </div>
      {showCommandPreview && (
        <div className="permission-card-body">
          <div className="permission-command-preview">
            <code>{approval.command.slice(0, 100)}{approval.command.length > 100 ? '...' : ''}</code>
          </div>
          {approval.command.length > 100 && (
            <button
              className="permission-show-more"
              onClick={() => setShowCommand(v => !v)}
            >
              {showCommand ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
              {showCommand ? t('permission.collapse') : t('permission.viewFullCommand')}
            </button>
          )}
          {showCommand && (
            <pre className="permission-command-full">{approval.command}</pre>
          )}
        </div>
      )}
      <div className="permission-card-actions">
        {hasChoice('once') && (
          <button className="permission-btn allow" onClick={() => handleRespond('once')} disabled={responding}>
            <CheckIcon size={16} />
            {t('permission.allow')}
          </button>
        )}
        {hasChoice('session') && (
          <button className="permission-btn session" onClick={() => handleRespond('session')} disabled={responding}>
            <InfoIcon size={16} />
            {t('permission.thisSession')}
          </button>
        )}
        {hasChoice('always') && (
          <button className="permission-btn always" onClick={() => handleRespond('always')} disabled={responding}>
            <SparklesIcon size={16} />
            {t('permission.always')}
          </button>
        )}
        {hasChoice('deny') && (
          <button className="permission-btn deny" onClick={() => handleRespond('deny')} disabled={responding}>
            <XIcon size={16} />
            {t('permission.deny')}
          </button>
        )}
      </div>
    </div>
  );
};

// Memoize to prevent re-renders when parent updates but approval props haven't changed
export const PermissionCard = memo(PermissionCardComponent);
