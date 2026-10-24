// Installing as a web app only applies on the web. The Android app is already installed and
// gets reminders through Expo push, so these answer accordingly.

/** True when Kriyan runs as an installed app (always, here). */
export function isStandalone(): boolean {
  return true;
}

/** True on an iPhone or iPad in a browser, where reminders need Add to Home Screen first. */
export function isIOS(): boolean {
  return false;
}

/** This browser can receive Web Push now (the native app uses Expo push instead). */
export function canWebPush(): boolean {
  return false;
}

/** Reminders on this device need Kriyan on the Home Screen first. */
export function needsInstall(): boolean {
  return false;
}

/** Sends a test reminder to this browser. Native: not offered. */
export async function sendTestReminder(): Promise<boolean> {
  return false;
}

/** This browser's push subscription endpoint, or null. */
export async function currentEndpoint(): Promise<string | null> {
  return null;
}
