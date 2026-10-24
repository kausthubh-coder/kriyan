// Reminders on the web: Web Push to this browser, or to the Home Screen web app on an iPhone.
// Permission is asked the first time a person turns reminders on (adding one, or Settings),
// never at launch. The service worker (public/sw.js) shows them and opens the task on a tap.

import { api } from "@kriyan/convex/api";
import { convex } from "@/data/convex";
import { canWebPush, currentEndpoint } from "@/features/pwa/install";

export { canWebPush, isStandalone, needsInstall } from "@/features/pwa/install";

/** A base64url VAPID key as the bytes PushManager.subscribe wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Turns on reminders for this browser: asks permission (call it from a tap), registers the
 * service worker, subscribes and saves the subscription. False when this browser can't (an
 * iPhone outside the Home Screen: show `needsInstall()`), or permission was refused.
 */
export async function ensureNotifications(): Promise<boolean> {
  if (!canWebPush()) return false;
  try {
    // Safari only honours the request inside the tap, so it comes before any other await.
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== "granted") return false;
    const key = await convex.query(api.webPush.publicKey, {});
    if (!key) return false;
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
    await convex.mutation(api.webPush.subscribe, {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      userAgent: navigator.userAgent.slice(0, 300),
    });
    return true;
  } catch {
    return false;
  }
}

/** Nothing to do at launch on the web; the subscription lives in the browser and the backend. */
export function useNotifications() {}

/** Signing out: this browser stops getting this person's reminders. */
export async function forgetDevice(): Promise<void> {
  try {
    const endpoint = await currentEndpoint();
    if (!endpoint) return;
    await convex.mutation(api.webPush.unsubscribe, { endpoint });
    const reg = await navigator.serviceWorker.getRegistration("/");
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // Signing out goes ahead either way.
  }
}
