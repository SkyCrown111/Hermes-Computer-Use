import { normalizeContent } from './contentUtils';
import { parseToolJson } from '../components/chat/parseToolJson';
import type { SessionMessage } from '../types/session';
import type { ChatMessage, ToolCallInfo } from '../stores/chatStore';

function normalizeToolCalls(message: SessionMessage): ToolCallInfo[] | undefined {
  if (!message.tool_calls || message.tool_calls.length === 0) {
    return undefined;
  }

  return message.tool_calls.map((toolCall) => ({
    name: toolCall.name,
    event_type: 'tool.completed',
    args: toolCall.args,
    duration: 1,
  }));
}

export function adaptSessionMessagesToChat(
  sessionId: string,
  messages: SessionMessage[],
): ChatMessage[] {
  const adaptedMessages: ChatMessage[] = [];

  messages
    .filter((message): message is SessionMessage & { role: 'user' | 'assistant' } =>
      message.role === 'user' || message.role === 'assistant',
    )
    .forEach((message, index) => {
      const rawContent = normalizeContent(message.content);
      const { cleanContent } = parseToolJson(rawContent);
      const tools = normalizeToolCalls(message);

      if (!cleanContent && !rawContent && !tools && !message.reasoning) {
        return;
      }

      adaptedMessages.push({
        id: `server-${sessionId}-${index}-${message.timestamp}`,
        role: message.role,
        content: cleanContent || rawContent,
        timestamp: message.timestamp,
        reasoning: message.reasoning,
        tools,
      });
    });

  return adaptedMessages;
}
