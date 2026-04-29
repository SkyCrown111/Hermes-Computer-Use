# Fix: Chat streaming stops when navigating away from chat page

## Context

When a user switches to another page (e.g., Settings, Sessions) during an active chat stream, the streaming stops. This is because `ChatPage` component unmounts on navigation, and all streaming callbacks have `if (!isMountedRef.current) return;` guards that silently discard incoming Tauri event data.

The root cause: these callbacks **only write to Zustand stores** (chatStore, navigationStore, sessionStore) which are module-level objects that persist across component lifecycles. The `isMountedRef` guard is unnecessary and harmful — it prevents store updates that should continue regardless of component mount status.

## Approach

Remove `isMountedRef.current` checks from all streaming callbacks in `ChatPage.tsx`. Keep `isStoppedRef.current` checks (user-initiated stop).

### File: `src/pages/Chat/ChatPage.tsx`

**Lines 427, 432, 437, 442, 489** — Change from:
```typescript
if (isStoppedRef.current || !isMountedRef.current) return;
```
to:
```typescript
if (isStoppedRef.current) return;
```

**Lines 513, 518** — Change from:
```typescript
if (!isMountedRef.current) return;
```
to:
(no guard — these are `onApproval` and `onSessionCreated` which should always run)

**Line 532** — In the outer catch block, change:
```typescript
if (!isMountedRef.current) return;
```
to:
(no guard — the store update should always run)

**Line 226** — `shouldVirtualize` check: no change needed (only affects rendering, not data flow)

### What each callback does (all store-only, no React state):

| Callback | Operations | Safe after unmount? |
|----------|-----------|-------------------|
| `onChunk` | `setStreamingText(targetSessionId, accumulated)` | Yes (chatStore) |
| `onReasoning` | `setReasoningText(targetSessionId, accumulated)` | Yes (chatStore) |
| `onTool` | `addStreamingTool(targetSessionId, tool)` | Yes (chatStore) |
| `onComplete` | `setStreamingText`, `clearReasoningText`, `setStreaming`, `addMessage`/`updateMessage`, `updateSessionActivity`, `refreshSessions` | Yes (all stores) |
| `onError` | `setStreamingText`, `clearReasoningText`, `setStreaming`, `updateMessage` | Yes (all stores) |
| `onApproval` | `respondApproval(id, false)` | Yes (API call) |
| `onSessionCreated` | `registerSessionMigration`, `migrateSession`, `replaceTabId`, `addSessionOptimistic`, `fetchSessions` | Yes (all stores) |

## Verification

1. `npm run build` — ensure no TypeScript/build errors
2. Start the app, begin a chat that takes several seconds to complete
3. Navigate to Settings page mid-stream
4. Navigate back to Chat — streaming should have continued in background and show the completed message
