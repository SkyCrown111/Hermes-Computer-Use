// Desktop notification service using the Web Notification API
// Works in Tauri webview without additional plugins

let permission: NotificationPermission | null = null;

/**
 * Request notification permission if not already granted.
 * Returns true if notifications are allowed.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (permission === 'granted') return true;
  if (!('Notification' in window)) return false;

  try {
    permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch {
    return false;
  }
}

/**
 * Send a desktop notification.
 * Silently fails if permission is not granted.
 */
export async function sendNotification(
  title: string,
  options?: { body?: string; icon?: string; tag?: string }
): Promise<void> {
  if (!('Notification' in window)) return;

  // Request permission on first use
  if (permission === null) {
    const ok = await requestNotificationPermission();
    if (!ok) return;
  }

  if (permission !== 'granted') return;

  try {
    const notification = new Notification(title, {
      body: options?.body,
      icon: options?.icon,
      tag: options?.tag,
      silent: false,
    });

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    // Focus the app window when clicked
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Silently fail — notification may not be available in some contexts
  }
}

/**
 * Check whether notifications are supported and permitted.
 */
export function areNotificationsEnabled(): boolean {
  if (!('Notification' in window)) return false;
  return Notification.permission === 'granted';
}
