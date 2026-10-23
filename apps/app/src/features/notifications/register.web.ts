// Reminders reach the phone; the web app doesn't ask for notification permission.

export async function ensureNotifications(): Promise<boolean> {
  return false;
}

export function useNotifications() {}

export async function forgetDevice(): Promise<void> {}
