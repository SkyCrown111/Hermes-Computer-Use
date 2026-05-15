// Desktop notification service using the Web Notification API
// Works in Tauri webview without additional plugins

let permission: NotificationPermission | null = null;
let audioContext: AudioContext | null = null;

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
 * Play a short completion chime using Web Audio.
 * This avoids shipping an audio asset and gracefully no-ops when audio is blocked.
 */
export async function playNotificationSound(): Promise<void> {
  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  try {
    audioContext ||= new AudioContextCtor();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    gain.connect(audioContext.destination);

    const firstTone = audioContext.createOscillator();
    firstTone.type = 'sine';
    firstTone.frequency.setValueAtTime(660, now);
    firstTone.connect(gain);
    firstTone.start(now);
    firstTone.stop(now + 0.16);

    const secondTone = audioContext.createOscillator();
    secondTone.type = 'sine';
    secondTone.frequency.setValueAtTime(880, now + 0.11);
    secondTone.connect(gain);
    secondTone.start(now + 0.11);
    secondTone.stop(now + 0.32);
  } catch {
    // Audio can be blocked until user interaction; notifications should not fail the task.
  }
}

/**
 * Check whether notifications are supported and permitted.
 */
export function areNotificationsEnabled(): boolean {
  if (!('Notification' in window)) return false;
  return Notification.permission === 'granted';
}
