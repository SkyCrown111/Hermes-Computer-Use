import React, { useMemo } from 'react';
import { useNavigationStore, useChatStore, useSessionStore } from '../stores';
import { useTranslation } from '../hooks/useTranslation';
import { formatNumber } from '../utils/format';
import { AlertIcon, ClockIcon, TokenIcon } from './ui/Icons';

function formatRelativeTime(timestamp: string | undefined, lang: 'zh' | 'en'): string {
  if (!timestamp) return '';

  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return lang === 'zh' ? '刚刚' : 'Just now';
  if (diffMin < 60) return lang === 'zh' ? `${diffMin}分钟前` : `${diffMin} minutes ago`;
  if (diffHour < 24) return lang === 'zh' ? `${diffHour}小时前` : `${diffHour} hours ago`;
  if (diffDay < 7) return lang === 'zh' ? `${diffDay}天前` : `${diffDay} days ago`;

  return new Date(timestamp).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US');
}

export const ChatSessionHeader: React.FC = () => {
  const { t, lang } = useTranslation();
  const activeTabId = useNavigationStore((s) => s.activeTabId);
  const openTabs = useNavigationStore((s) => s.openTabs);
  const sessionState = useChatStore((s) => s.sessions[activeTabId || '']);
  const sessions = useSessionStore((s) => s.sessions);

  const sessionInfo = useMemo(() => sessions.find((s) => s.id === activeTabId), [sessions, activeTabId]);
  const currentTab = useMemo(() => openTabs.find((tab) => tab.id === activeTabId), [openTabs, activeTabId]);

  const totalTokens = useMemo(() => {
    if (!sessionState) return 0;
    const streamingTokens =
      (sessionState.tokenUsage?.input_tokens || 0) + (sessionState.tokenUsage?.output_tokens || 0);
    const messageTokens =
      sessionState.messages?.reduce((sum, msg) => sum + (msg.totalTokens || 0), 0) || 0;
    return streamingTokens + messageTokens;
  }, [sessionState]);

  const lastActivity = useMemo(() => {
    if (sessionInfo?.last_activity_at) return sessionInfo.last_activity_at;
    if (sessionState?.messages?.length) return sessionState.messages[sessionState.messages.length - 1]?.timestamp;
    return undefined;
  }, [sessionInfo, sessionState]);

  const status = useMemo(() => {
    if (sessionState?.isStreaming) return 'streaming';
    if (sessionState?.error) return 'error';
    if (sessionState?.messages?.length) return 'active';
    return 'idle';
  }, [sessionState]);

  const title = currentTab?.title || sessionInfo?.chat_name || t('chat.idle');

  if (!activeTabId) return null;

  return (
    <div className="chat-session-header">
      <div className="chat-session-header-left">
        <span className={`chat-session-status ${status}`}>
          {status === 'streaming' && (
            <>
              <span className="chat-session-status-dot pulse" />
              {t('chat.streaming')}
            </>
          )}
          {status === 'active' && (
            <>
              <span className="chat-session-status-dot" />
              {t('chat.active')}
            </>
          )}
          {status === 'error' && (
            <>
              <AlertIcon size={14} className="status-icon error" />
              {t('chat.error')}
            </>
          )}
          {status === 'idle' && t('chat.idle')}
        </span>

        {totalTokens > 0 && (
          <span className="chat-session-tokens">
            <TokenIcon size={14} className="token-icon" />
            {formatNumber(totalTokens)}t
          </span>
        )}
      </div>

      <div className="chat-session-header-center">
        <h1 className="chat-session-title">{title}</h1>
      </div>

      <div className="chat-session-header-right">
        {lastActivity && (
          <span className="chat-session-last-update">
            <ClockIcon size={14} className="time-icon" />
            {t('chat.lastUpdate')} {formatRelativeTime(lastActivity, lang)}
          </span>
        )}
      </div>
    </div>
  );
};
