// Reminders in the browser and the iPhone Home Screen app, through Web Push. The server sends
// them (convex/webPush.ts) to every browser that subscribed, the way it sends to phones, so a
// reminder rings with the tab closed. The service worker (public/sw.js) shows them.
//
// Permission is asked only from Settings' "Allow reminders on this device" button: browsers
// ignore or block a prompt that doesn't follow a click, and the app never asks on load.

import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { api } from "@kriyan/convex/api";
import { convex } from "@/data/convex";

const WORKER = "/sw.js";

/** The app shell is cached for offline use from a production build only; dev serves no hashed files. */
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // After the page has loaded, so caching the shell never competes with the first paint.
  const register = () => void navigator.serviceWorker.register(WORKER).catch(() => undefined);
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

/**
 * "unsupported": no Web Push here (an older browser, or iPhone Safari outside the Home Screen
 * app). "add-to-home-screen": an iPhone or iPad that gets it once the app is on the Home Screen.
 */
export type WebPushSupport = "supported" | "unsupported" | "add-to-home-screen";

export function webPushSupport(): WebPushSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "supported";
  // iOS 16.4+ offers Web Push only to an app opened from the Home Screen.
  const apple =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  return apple && !window.matchMedia("(display-mode: standalone)").matches
    ? "add-to-home-screen"
    : "unsupported";
}

async function worker(): Promise<ServiceWorkerRegistration> {
  // In dev nothing registered it at load; asking for reminders is reason enough.
  return (await navigator.serviceWorker.getRegistration(WORKER)) ?? navigator.serviceWorker.register(WORKER);
}

/** The key as PushManager wants it: VAPID keys travel as unpadded base64url. */
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

/** Subscribes this browser (or reuses its subscription) and stores it for the signed-in person. */
async function subscribe(publicKey: string): Promise<boolean> {
  const registration = await worker();
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  // A subscription made with another key (the server's keys changed) can't receive these pushes.
  const current = subscription?.options.applicationServerKey;
  if (subscription && current && !sameKey(new Uint8Array(current), keyBytes(publicKey))) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(publicKey),
  });
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) return false;
  await convex.mutation(api.account.registerWebPush, { endpoint, p256dh: keys.p256dh, auth: keys.auth });
  return true;
}

function sameKey(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * From the Settings button: asks for permission, then subscribes. Must run straight from the
 * click, before any await, or Safari refuses to ask.
 */
export async function allowReminders(publicKey: string): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission === "granted") await subscribe(publicKey);
  return permission;
}

/** Already allowed: make sure the server has this browser's current subscription. Never prompts. */
export async function syncReminders(publicKey: string): Promise<boolean> {
  if (webPushSupport() !== "supported" || Notification.permission !== "granted") return false;
  return subscribe(publicKey);
}

/** Whether this browser is subscribed right now (permission alone isn't enough). */
export async function isSubscribed(): Promise<boolean> {
  if (webPushSupport() !== "supported") return false;
  const registration = await navigator.serviceWorker.getRegistration(WORKER);
  return Boolean(await registration?.pushManager.getSubscription());
}

/** Turns reminders off for this browser: the server forgets it and the push service drops it. */
export async function stopReminders(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration(WORKER);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await convex
    .mutation(api.account.unregisterWebPush, { endpoint: subscription.endpoint })
    .catch(() => undefined);
  // Unsubscribing also stops pushes the server still sends to this endpoint, for any account.
  await subscription.unsubscribe().catch(() => undefined);
}

/** Called when a reminder is added. The web never prompts here; it only re-syncs an allowed browser. */
export async function ensureNotifications(): Promise<boolean> {
  if (webPushSupport() !== "supported" || Notification.permission !== "granted") return false;
  const key = await convex.query(api.account.webPushKey, {}).catch(() => null);
  return key ? subscribe(key).catch(() => false) : false;
}

/**
 * Mount once in the signed-in app: a browser that allowed reminders before (and was unsubscribed
 * by signing out, or got a new subscription from its push service) is subscribed again. Never prompts.
 */
export function useNotifications() {
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (isAuthenticated) void ensureNotifications();
  }, [isAuthenticated]);
}

/** Before signing out: this browser stops ringing for the account it leaves. */
export async function forgetDevice(): Promise<void> {
  if (webPushSupport() !== "supported") return;
  await stopReminders().catch(() => undefined);
}
