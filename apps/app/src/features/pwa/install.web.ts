// The web app as an installed app: is it on the Home Screen, can it get Web Push, and a test
// reminder for Settings. iPhone Safari only allows Web Push for a Home Screen web app (iOS 16.4
// and later); every other browser allows it in a tab.

import { api } from "@kriyan/convex/api";
import { convex } from "@/data/convex";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports a Mac; a Mac with touch is an iPad.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** This browser can get Web Push right now. */
export function canWebPush(): boolean {
  return supported() && (!isIOS() || isStandalone());
}

/** On an iPhone in Safari: reminders need Add to Home Screen first. */
export function needsInstall(): boolean {
  return isIOS() && !isStandalone();
}

export async function currentEndpoint(): Promise<string | null> {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

export async function sendTestReminder(): Promise<boolean> {
  const endpoint = await currentEndpoint();
  if (!endpoint) return false;
  return await convex.mutation(api.webPush.sendTest, { endpoint });
}
