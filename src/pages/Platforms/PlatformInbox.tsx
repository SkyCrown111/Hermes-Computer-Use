import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input } from '../../components';
import { useTranslation } from '../../hooks/useTranslation';
import { usePageVisibility, usePolling } from '../../hooks';
import { isTauri } from '../../lib/tauri';
import { platformApi, type PlatformChat, type PlatformMessage } from '../../services/platformApi';
import { toast } from '../../stores/toastStore';
import type { Platform, PlatformType } from '../../types/platform';

const MESSAGE_PAGE_SIZE = 50;

function messageTimeMs(m: PlatformMessage): number {
  const t = Date.parse(m.timestamp);
  return Number.isNaN(t) ? 0 : t;
}

function sortMessagesChronological(list: PlatformMessage[]): PlatformMessage[] {
  return [...list].sort((a, b) => messageTimeMs(a) - messageTimeMs(b));
}

/** Deduplicate by message_id (or content fallbacks) */
function dedupeMessages(list: PlatformMessage[]): PlatformMessage[] {
  const seen = new Set<string>();
  return list.filter((m) => {
    const key = m.message_id || `${m.timestamp}\0${m.sender_id}\0${m.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface PlatformInboxProps {
  platforms: Platform[];
}

export function PlatformInbox({ platforms }: PlatformInboxProps) {
  const { t } = useTranslation();
  const pageVisible = usePageVisibility();
  const connectedPlatforms = useMemo(
    () => platforms.filter((p) => p.enabled && p.status === 'connected'),
    [platforms],
  );

  const [inboxPlatform, setInboxPlatform] = useState<PlatformType | null>(null);
  const [chats, setChats] = useState<PlatformChat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PlatformMessage[]>([]);
  const [tailOffset, setTailOffset] = useState(0);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!inboxPlatform && connectedPlatforms.length > 0) {
      setInboxPlatform(connectedPlatforms[0].type);
    }
    if (inboxPlatform && !connectedPlatforms.some((p) => p.type === inboxPlatform)) {
      setInboxPlatform(connectedPlatforms[0]?.type ?? null);
    }
  }, [connectedPlatforms, inboxPlatform]);

  const loadChats = useCallback(async (platform: PlatformType) => {
    if (!isTauri()) return;
    setIsLoadingChats(true);
    try {
      const list = await platformApi.getPlatformChats(platform, 50);
      setChats(list);
      setSelectedChatId((prev) => (prev && list.some((c) => c.chat_id === prev) ? prev : list[0]?.chat_id ?? null));
    } finally {
      setIsLoadingChats(false);
    }
  }, []);

  const loadMessages = useCallback(
    async (platform: PlatformType, chatId: string, opts?: { tailOffset?: number; prependOlder?: boolean }) => {
      if (!isTauri()) return;
      setIsLoadingMessages(!opts?.prependOlder);
      if (opts?.prependOlder) setIsLoadingOlder(true);
      try {
        const off = opts?.tailOffset ?? 0;
        const raw = await platformApi.getPlatformMessages(platform, chatId, {
          limit: MESSAGE_PAGE_SIZE,
          tailOffset: off,
        });
        const sorted = sortMessagesChronological(raw);
        if (opts?.prependOlder) {
          setMessages((prev) => sortMessagesChronological(dedupeMessages([...sorted, ...prev])));
          setHasMoreOlder(sorted.length >= MESSAGE_PAGE_SIZE);
          setTailOffset((prevOff) => prevOff + sorted.length);
        } else {
          setMessages(sortMessagesChronological(dedupeMessages(sorted)));
          setTailOffset(sorted.length);
          setHasMoreOlder(sorted.length >= MESSAGE_PAGE_SIZE);
        }
        if (!opts?.prependOlder) {
          await platformApi.markPlatformChatRead(platform, chatId);
        }
      } finally {
        setIsLoadingMessages(false);
        setIsLoadingOlder(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!inboxPlatform) {
      setChats([]);
      setSelectedChatId(null);
      setMessages([]);
      setTailOffset(0);
      setHasMoreOlder(false);
      return;
    }
    void loadChats(inboxPlatform);
  }, [inboxPlatform, loadChats]);

  useEffect(() => {
    if (!inboxPlatform || !selectedChatId) {
      setMessages([]);
      setTailOffset(0);
      setHasMoreOlder(false);
      return;
    }
    setTailOffset(0);
    void loadMessages(inboxPlatform, selectedChatId);
  }, [inboxPlatform, selectedChatId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [selectedChatId]);

  const loadOlder = useCallback(() => {
    if (!inboxPlatform || !selectedChatId || isLoadingOlder || !hasMoreOlder) return;
    void loadMessages(inboxPlatform, selectedChatId, {
      tailOffset,
      prependOlder: true,
    });
  }, [hasMoreOlder, inboxPlatform, isLoadingOlder, loadMessages, selectedChatId, tailOffset]);

  const handleSend = useCallback(async () => {
    if (!inboxPlatform || !selectedChatId || !composeText.trim()) return;
    setIsSending(true);
    try {
      const result = await platformApi.sendPlatformMessage(inboxPlatform, selectedChatId, composeText.trim());
      if (!result.success) {
        toast.error(result.error || t('platforms.inbox.sendFailed'));
        return;
      }
      setComposeText('');
      toast.success(t('platforms.inbox.sendSuccess'));
      await loadMessages(inboxPlatform, selectedChatId);
      await loadChats(inboxPlatform);
      queueMicrotask(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    } finally {
      setIsSending(false);
    }
  }, [composeText, inboxPlatform, loadChats, loadMessages, selectedChatId, t]);

  usePolling(
    async () => {
      if (!inboxPlatform || !selectedChatId) return;
      const raw = await platformApi.getPlatformMessages(inboxPlatform, selectedChatId, {
        limit: MESSAGE_PAGE_SIZE,
        tailOffset: 0,
      });
      const newest = sortMessagesChronological(dedupeMessages(raw));
      setMessages((prev) => {
        if (prev.length === 0) return newest;
        const prevIds = new Set(
          prev.map((m) => m.message_id || `${m.timestamp}\0${m.sender_id}\0${m.content}`),
        );
        const hasNew = newest.some((m) => {
          const key = m.message_id || `${m.timestamp}\0${m.sender_id}\0${m.content}`;
          return !prevIds.has(key);
        });
        if (!hasNew) return prev;
        return sortMessagesChronological(dedupeMessages([...prev, ...newest]));
      });
      await loadChats(inboxPlatform);
    },
    12_000,
    {
      enabled: pageVisible && isTauri() && connectedPlatforms.length > 0 && !!inboxPlatform && !!selectedChatId,
      immediate: false,
    },
  );

  if (!isTauri()) {
    return (
      <section className="platform-inbox glass-card">
        <h2 className="inbox-title">{t('platforms.inbox.title')}</h2>
        <p className="inbox-hint">{t('platforms.inbox.desktopOnly')}</p>
      </section>
    );
  }

  if (connectedPlatforms.length === 0) {
    return (
      <section className="platform-inbox glass-card">
        <h2 className="inbox-title">{t('platforms.inbox.title')}</h2>
        <p className="inbox-hint">{t('platforms.inbox.noConnected')}</p>
      </section>
    );
  }

  return (
    <section className="platform-inbox glass-card">
      <div className="inbox-header">
        <h2 className="inbox-title">{t('platforms.inbox.title')}</h2>
        <select
          className="inbox-platform-select"
          value={inboxPlatform ?? ''}
          onChange={(e) => setInboxPlatform(e.target.value as PlatformType)}
        >
          {connectedPlatforms.map((p) => (
            <option key={p.type} value={p.type}>
              {p.name}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" onClick={() => inboxPlatform && void loadChats(inboxPlatform)} disabled={isLoadingChats}>
          {t('common.refresh')}
        </Button>
      </div>

      <p className="inbox-sync-hint">{t('platforms.inbox.syncHint')}</p>

      <div className="inbox-body">
        <aside className="inbox-chats">
          {isLoadingChats ? (
            <p className="inbox-hint">{t('common.loading')}</p>
          ) : chats.length === 0 ? (
            <p className="inbox-hint">{t('platforms.inbox.noChats')}</p>
          ) : (
            chats.map((chat) => (
              <button
                key={chat.chat_id}
                type="button"
                className={`inbox-chat-item ${selectedChatId === chat.chat_id ? 'active' : ''}`}
                onClick={() => setSelectedChatId(chat.chat_id)}
              >
                <span className="inbox-chat-name">{chat.name || chat.chat_id}</span>
                {chat.last_message && <span className="inbox-chat-preview">{chat.last_message}</span>}
                {(chat.unread_count ?? 0) > 0 && <span className="inbox-unread">{chat.unread_count}</span>}
              </button>
            ))
          )}
        </aside>

        <div className="inbox-thread">
          {!selectedChatId ? (
            <p className="inbox-hint">{t('platforms.inbox.selectChat')}</p>
          ) : (
            <>
              {hasMoreOlder && (
                <div className="inbox-load-older">
                  <Button variant="ghost" size="sm" onClick={() => void loadOlder()} disabled={isLoadingOlder}>
                    {isLoadingOlder ? t('platforms.inbox.loadingOlder') : t('platforms.inbox.loadOlder')}
                  </Button>
                </div>
              )}
              <div className="inbox-messages">
                {isLoadingMessages ? (
                  <p className="inbox-hint">{t('common.loading')}</p>
                ) : messages.length === 0 ? (
                  <p className="inbox-hint">{t('platforms.inbox.noMessages')}</p>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.message_id} className={`inbox-message ${msg.is_from_me ? 'from-me' : 'from-them'}`}>
                      <div className="inbox-message-meta">
                        <span>{msg.sender_name || msg.sender_id}</span>
                        <time>{msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ''}</time>
                      </div>
                      <p>{msg.content}</p>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="inbox-compose">
                <Input
                  value={composeText}
                  onChange={(e) => setComposeText(e.target.value)}
                  placeholder={t('platforms.inbox.composePlaceholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <Button variant="primary" onClick={() => void handleSend()} disabled={isSending || !composeText.trim()}>
                  {isSending ? t('platforms.inbox.sending') : t('platforms.inbox.send')}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
