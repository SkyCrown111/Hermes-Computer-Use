/**
 * Event Service - Real-time event subscription for Hermes Console
 * Uses Tauri event system for real-time updates
 */
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { logger } from '../lib/logger';

// Event types
export type HermesEventType =
  | 'gateway-status-changed'
  | 'platform-message-received'
  | 'platform-status-changed'
  | 'cron-job-completed'
  | 'cron-job-started'
  | 'session-updated'
  | 'tool-execution-started'
  | 'tool-execution-completed'
  | 'memory-updated'
  | 'config-changed';

// Event payloads
export interface GatewayStatusPayload {
  status: 'running' | 'stopped' | 'error';
  uptime?: number;
  active_platforms?: string[];
}

export interface PlatformMessagePayload {
  platform: string;
  chat_id: string;
  message_id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  timestamp: string;
}

export interface PlatformStatusPayload {
  platform: string;
  status: 'connected' | 'disconnected' | 'error';
  error?: string;
}

export interface CronJobPayload {
  job_id: string;
  job_name: string;
  status: 'started' | 'completed' | 'failed';
  output?: string;
  duration_ms?: number;
}

export interface ToolExecutionPayload {
  tool_name: string;
  session_id?: string;
  status: 'started' | 'completed' | 'error';
  duration_ms?: number;
  error?: string;
}

export interface SessionUpdatedPayload {
  session_id: string;
  action: 'created' | 'updated' | 'deleted';
  title?: string;
}

export interface MemoryUpdatedPayload {
  file_type: 'memory' | 'user_profile';
  action: 'updated' | 'section_added' | 'section_deleted';
}

export interface ConfigChangedPayload {
  section: string;
  key: string;
  old_value?: unknown;
  new_value?: unknown;
}

// Event handler type
type EventHandler<T> = (payload: T) => void;

// Subscription manager
class EventSubscriptionManager {
  private listeners: Map<string, UnlistenFn[]> = new Map();

  async subscribe<T>(
    eventType: HermesEventType,
    handler: EventHandler<T>
  ): Promise<() => void> {
    try {
      const unlisten = await listen<T>(eventType, (event) => {
        logger.debug(`[EventService] Received ${eventType}:`, event.payload);
        handler(event.payload);
      });

      // Track the listener
      if (!this.listeners.has(eventType)) {
        this.listeners.set(eventType, []);
      }
      this.listeners.get(eventType)!.push(unlisten);

      // Return unsubscribe function
      return () => {
        unlisten();
        const listeners = this.listeners.get(eventType);
        if (listeners) {
          const index = listeners.indexOf(unlisten);
          if (index > -1) {
            listeners.splice(index, 1);
          }
        }
      };
    } catch (error) {
      logger.error(`[EventService] Failed to subscribe to ${eventType}:`, error);
      return () => {};
    }
  }

  // Unsubscribe all listeners for a specific event type
  async unsubscribeAll(eventType?: HermesEventType): Promise<void> {
    if (eventType) {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        listeners.forEach((unlisten) => unlisten());
        this.listeners.delete(eventType);
      }
    } else {
      // Unsubscribe all
      this.listeners.forEach((listeners) => {
        listeners.forEach((unlisten) => unlisten());
      });
      this.listeners.clear();
    }
  }

  // Get active listener count
  getListenerCount(eventType?: HermesEventType): number {
    if (eventType) {
      return this.listeners.get(eventType)?.length || 0;
    }
    let total = 0;
    this.listeners.forEach((listeners) => {
      total += listeners.length;
    });
    return total;
  }
}

// Singleton instance
export const eventService = new EventSubscriptionManager();

// Convenience subscription functions
export const subscribeToGatewayStatus = (handler: EventHandler<GatewayStatusPayload>) =>
  eventService.subscribe('gateway-status-changed', handler);

export const subscribeToPlatformMessages = (handler: EventHandler<PlatformMessagePayload>) =>
  eventService.subscribe('platform-message-received', handler);

export const subscribeToPlatformStatus = (handler: EventHandler<PlatformStatusPayload>) =>
  eventService.subscribe('platform-status-changed', handler);

export const subscribeToCronJobs = (handler: EventHandler<CronJobPayload>) =>
  eventService.subscribe('cron-job-completed', handler);

export const subscribeToToolExecution = (handler: EventHandler<ToolExecutionPayload>) =>
  eventService.subscribe('tool-execution-completed', handler);

export const subscribeToSessionUpdates = (handler: EventHandler<SessionUpdatedPayload>) =>
  eventService.subscribe('session-updated', handler);

export const subscribeToMemoryUpdates = (handler: EventHandler<MemoryUpdatedPayload>) =>
  eventService.subscribe('memory-updated', handler);

export const subscribeToConfigChanges = (handler: EventHandler<ConfigChangedPayload>) =>
  eventService.subscribe('config-changed', handler);
