// Keyboard Shortcuts Help Panel
import React, { useEffect, useCallback } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import './KeyboardShortcutsHelp.css';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

export const KeyboardShortcutsHelp: React.FC = () => {
  const [visible, setVisible] = React.useState(false);
  const { t } = useTranslation();

  const shortcutGroups: ShortcutGroup[] = [
    {
      title: t('shortcuts.global') || 'Global',
      shortcuts: [
        { keys: ['Ctrl', 'N'], description: t('shortcuts.newChat') || 'New chat' },
        { keys: ['Ctrl', 'W'], description: t('shortcuts.closeTab') || 'Close tab' },
        { keys: ['Ctrl', 'Tab'], description: t('shortcuts.nextTab') || 'Next tab' },
        { keys: ['Ctrl', 'Shift', 'Tab'], description: t('shortcuts.prevTab') || 'Previous tab' },
        { keys: ['Ctrl', 'K'], description: t('shortcuts.commandPalette') || 'Command palette' },
        { keys: ['Ctrl', 'Shift', 'F'], description: t('shortcuts.globalSearch') || 'Global search' },
        { keys: ['Ctrl', '/'], description: t('shortcuts.showHelp') || 'Show keyboard shortcuts' },
      ],
    },
    {
      title: t('shortcuts.chat') || 'Chat',
      shortcuts: [
        { keys: ['Ctrl', 'F'], description: t('shortcuts.searchMessages') || 'Search messages' },
        { keys: ['Enter'], description: t('shortcuts.sendMessage') || 'Send message' },
        { keys: ['Shift', 'Enter'], description: t('shortcuts.newLine') || 'New line' },
        { keys: ['Esc'], description: t('shortcuts.close') || 'Close / Cancel' },
      ],
    },
    {
      title: t('shortcuts.slashCommands') || 'Slash Commands',
      shortcuts: [
        { keys: ['/'], description: t('shortcuts.startCommand') || 'Start slash command' },
        { keys: ['↑', '↓'], description: t('shortcuts.navigateCommands') || 'Navigate commands' },
        { keys: ['Tab'], description: t('shortcuts.selectCommand') || 'Select command' },
      ],
    },
  ];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ctrl+/ to toggle help
    if (e.ctrlKey && e.key === '/') {
      e.preventDefault();
      setVisible(prev => !prev);
    }
    // Escape to close
    if (e.key === 'Escape' && visible) {
      setVisible(false);
    }
  }, [visible]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!visible) return null;

  return (
    <div className="shortcuts-help-overlay" onClick={() => setVisible(false)} role="presentation">
      <div
        className="shortcuts-help-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-help-title"
      >
        <div className="shortcuts-help-header">
          <h2 id="shortcuts-help-title">{t('shortcuts.title') || 'Keyboard Shortcuts'}</h2>
          <button className="shortcuts-help-close" onClick={() => setVisible(false)} aria-label={t('common.close') || 'Close'}>
            ✕
          </button>
        </div>
        <div className="shortcuts-help-content">
          {shortcutGroups.map(group => (
            <div key={group.title} className="shortcuts-group">
              <h3 className="shortcuts-group-title">{group.title}</h3>
              <div className="shortcuts-list">
                {group.shortcuts.map((shortcut, idx) => (
                  <div key={idx} className="shortcut-item">
                    <span className="shortcut-description">{shortcut.description}</span>
                    <span className="shortcut-keys">
                      {shortcut.keys.map((key, keyIdx) => (
                        <React.Fragment key={key}>
                          <kbd className="shortcut-key">{key}</kbd>
                          {keyIdx < shortcut.keys.length - 1 && (
                            <span className="shortcut-plus">+</span>
                          )}
                        </React.Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="shortcuts-help-footer">
          <span className="shortcuts-hint">
            <kbd>Esc</kbd> {t('shortcuts.toClose') || 'to close'}
          </span>
        </div>
      </div>
    </div>
  );
};
