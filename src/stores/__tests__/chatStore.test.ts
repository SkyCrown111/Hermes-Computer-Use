// Chat Store Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore, initializeChatStore } from '../chatStore';

describe('ChatStore', () => {
  const sessionId = 'test-session-1';

  beforeEach(() => {
    // Reset store state
    useChatStore.setState({ sessions: {} });
    localStorage.clear();
  });

  describe('addMessage', () => {
    it('should add a user message to the session', () => {
      useChatStore.getState().addMessage(sessionId, {
        role: 'user',
        content: 'Hello',
      });

      const session = useChatStore.getState().sessions[sessionId];
      expect(session).toBeDefined();
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].role).toBe('user');
      expect(session.messages[0].content).toBe('Hello');
      expect(session.messages[0].id).toBeDefined();
      expect(session.messages[0].timestamp).toBeDefined();
    });

    it('should add multiple messages in order', () => {
      const store = useChatStore.getState();
      store.addMessage(sessionId, { role: 'user', content: 'Hi' });
      store.addMessage(sessionId, { role: 'assistant', content: 'Hello!' });
      store.addMessage(sessionId, { role: 'user', content: 'How are you?' });

      const messages = useChatStore.getState().sessions[sessionId].messages;
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('Hi');
      expect(messages[1].content).toBe('Hello!');
      expect(messages[2].content).toBe('How are you?');
    });

    it('should handle multiple sessions independently', () => {
      const store = useChatStore.getState();
      store.addMessage('session-a', { role: 'user', content: 'A1' });
      store.addMessage('session-b', { role: 'user', content: 'B1' });
      store.addMessage('session-a', { role: 'assistant', content: 'A2' });

      const sessions = useChatStore.getState().sessions;
      expect(sessions['session-a'].messages).toHaveLength(2);
      expect(sessions['session-b'].messages).toHaveLength(1);
      expect(sessions['session-a'].messages[1].content).toBe('A2');
    });
  });

  describe('updateMessage', () => {
    it('should update message content by ID', () => {
      const store = useChatStore.getState();
      store.addMessage(sessionId, { role: 'user', content: 'Original' });

      const msgId = useChatStore.getState().sessions[sessionId].messages[0].id;
      store.updateMessage(sessionId, msgId, { content: 'Updated' });

      const msg = useChatStore.getState().sessions[sessionId].messages[0];
      expect(msg.content).toBe('Updated');
    });

    it('should update only the specified message', () => {
      const store = useChatStore.getState();
      store.addMessage(sessionId, { role: 'user', content: 'First' });
      store.addMessage(sessionId, { role: 'assistant', content: 'Second' });

      const msgs = useChatStore.getState().sessions[sessionId].messages;
      store.updateMessage(sessionId, msgs[0].id, { content: 'Changed' });

      const updated = useChatStore.getState().sessions[sessionId].messages;
      expect(updated[0].content).toBe('Changed');
      expect(updated[1].content).toBe('Second');
    });
  });

  describe('deleteMessage', () => {
    it('should delete a single message by ID', () => {
      const store = useChatStore.getState();
      store.addMessage(sessionId, { role: 'user', content: 'Keep' });
      store.addMessage(sessionId, { role: 'assistant', content: 'Delete me' });

      const msgs = useChatStore.getState().sessions[sessionId].messages;
      store.deleteMessage(sessionId, msgs[1].id);

      const remaining = useChatStore.getState().sessions[sessionId].messages;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].content).toBe('Keep');
    });
  });

  describe('migrateSession', () => {
    it('should migrate messages from old session ID to new session ID', () => {
      const oldId = 'new_123';
      const newId = 'real-session-456';

      const store = useChatStore.getState();
      store.addMessage(oldId, { role: 'user', content: 'Hello' });
      store.addMessage(oldId, { role: 'assistant', content: 'World' });

      expect(useChatStore.getState().sessions[oldId].messages).toHaveLength(2);
      expect(useChatStore.getState().sessions[newId]).toBeUndefined();

      store.migrateSession(oldId, newId);

      expect(useChatStore.getState().sessions[oldId]).toBeUndefined();
      expect(useChatStore.getState().sessions[newId].messages).toHaveLength(2);
      expect(useChatStore.getState().sessions[newId].messages[0].content).toBe('Hello');
    });

    it('should not migrate if new session already exists', () => {
      const store = useChatStore.getState();
      store.addMessage('old', { role: 'user', content: 'Old data' });
      store.addMessage('existing', { role: 'user', content: 'Existing data' });

      store.migrateSession('old', 'existing');

      // Old session messages should still exist (migration was skipped)
      expect(useChatStore.getState().sessions['old']).toBeDefined();
      expect(useChatStore.getState().sessions['existing'].messages[0].content).toBe('Existing data');
    });
  });

  describe('streaming state', () => {
    it('should set and clear streaming text', () => {
      const store = useChatStore.getState();
      store.setStreamingText(sessionId, 'Hello...');
      expect(useChatStore.getState().sessions[sessionId].streamingText).toBe('Hello...');

      store.setStreamingText(sessionId, '');
      expect(useChatStore.getState().sessions[sessionId].streamingText).toBe('');
    });

    it('should append streaming text', () => {
      const store = useChatStore.getState();
      store.appendStreamingText(sessionId, 'Hello ');
      store.appendStreamingText(sessionId, 'World');

      expect(useChatStore.getState().sessions[sessionId].streamingText).toBe('Hello World');
    });

    it('should set thinking state with text', () => {
      const store = useChatStore.getState();
      store.setThinking(sessionId, true, '思考中...');

      const session = useChatStore.getState().sessions[sessionId];
      expect(session.isThinking).toBe(true);
      expect(session.thinkingText).toBe('思考中...');
    });

    it('should manage streaming tools', () => {
      const store = useChatStore.getState();
      store.addStreamingTool(sessionId, { name: 'read_file', event_type: 'tool.started' });

      let tools = useChatStore.getState().sessions[sessionId].streamingTools;
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('read_file');

      store.addStreamingTool(sessionId, { name: 'edit_file', event_type: 'tool.started' });

      tools = useChatStore.getState().sessions[sessionId].streamingTools;
      expect(tools).toHaveLength(2);

      store.clearStreamingTools(sessionId);
      expect(useChatStore.getState().sessions[sessionId].streamingTools).toHaveLength(0);
    });
  });

  describe('token usage', () => {
    it('should set token usage for a session', () => {
      const store = useChatStore.getState();
      store.setTokenUsage(sessionId, { input_tokens: 100, output_tokens: 50 });

      const usage = useChatStore.getState().sessions[sessionId].tokenUsage;
      expect(usage.input_tokens).toBe(100);
      expect(usage.output_tokens).toBe(50);
    });
  });

  describe('clearSession', () => {
    it('should remove the session entirely', () => {
      const store = useChatStore.getState();
      store.addMessage(sessionId, { role: 'user', content: 'Hello' });

      expect(useChatStore.getState().sessions[sessionId]).toBeDefined();

      store.clearSession(sessionId);

      expect(useChatStore.getState().sessions[sessionId]).toBeUndefined();
    });
  });

  describe('getSession', () => {
    it('should return default state for non-existent session', () => {
      const session = useChatStore.getState().getSession('nonexistent');
      expect(session.messages).toEqual([]);
      expect(session.streamingText).toBe('');
      expect(session.isStreaming).toBe(false);
    });

    it('should return existing session state', () => {
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'Test' });
      const session = useChatStore.getState().getSession(sessionId);
      expect(session.messages).toHaveLength(1);
    });
  });

  describe('persistence', () => {
    it('should persist and restore messages via initializeChatStore', async () => {
      // Add messages to a session
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'Hello' });
      useChatStore.getState().addMessage(sessionId, { role: 'assistant', content: 'Hi' });

      // Wait for debounce to flush (persistMessages uses 500ms debounce)
      await new Promise(resolve => setTimeout(resolve, 600));

      // Check localStorage was written
      const raw = localStorage.getItem('hermes-chat-messages');
      expect(raw).not.toBeNull();

      if (raw) {
        const parsed = JSON.parse(raw);
        expect(parsed[sessionId]).toHaveLength(2);
      }

      // Simulate fresh app load
      useChatStore.setState({ sessions: {} });
      expect(Object.keys(useChatStore.getState().sessions)).toHaveLength(0);

      initializeChatStore();

      const sessions = useChatStore.getState().sessions;
      const sessionIds = Object.keys(sessions);
      expect(sessionIds.length).toBeGreaterThan(0);

      // The restored session should have messages
      const restoredSession = sessions[sessionId];
      expect(restoredSession).toBeDefined();
      expect(restoredSession.messages).toHaveLength(2);
    });
  });
});
