// Kriyan's service worker: the app opens offline, and reminders arrive with the tab closed.
// - Pages (every route is the one index.html): network first, so a deploy shows at once; the
//   last copy when offline. The app then shows its offline notice.
// - /_expo/static/* and /assets/*: cache first. Expo names them by content hash, so a cached
//   file never goes stale.
// - Clerk's script from its CDN: the cached copy, refreshed in the background. Clerk's "who is
//   signed in" answers: from the network, the last one when offline.
// - Push: a reminder from the server (packages/convex/convex/webPush.ts), shown as a
//   notification that opens its task.
// Registered by the app in production builds only (features/notifications/register.web.ts).

const VERSION = "kriyan-v1";
// The root serves index.html everywhere (a static server, Vercel), with no redirect to follow.
const SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // A dev server may not answer; the worker still installs, for push.
      .then((cache) => cache.add(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Clerk's sign-in script comes from its CDN; without it the app can't start offline.
  if (url.pathname.includes("/npm/@clerk/")) return event.respondWith(fresh(request));
  // Clerk asks its server who is signed in on every start; offline, the last answer keeps the
  // person in the app (with its offline notice) instead of on the sign-in screen.
  if (url.hostname.includes("clerk") && /^\/v1\/(environment|client)$/.test(url.pathname))
    return event.respondWith(lastAnswer(request, url));
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(page(request));
  } else if (url.pathname.startsWith("/_expo/static/") || url.pathname.startsWith("/assets/")) {
    event.respondWith(hashed(request));
  }
});

async function page(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok && (response.headers.get("content-type") ?? "").includes("text/html"))
      await cache.put(SHELL, response.clone());
    return response;
  } catch (error) {
    const shell = await cache.match(SHELL);
    if (shell) return shell;
    throw error;
  }
}

async function hashed(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/** The cached copy at once, refreshed in the background for next time (Clerk pins a major version only). */
async function fresh(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then(async (response) => {
      if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (hit) {
    void update;
    return hit;
  }
  return (await update) ?? Response.error();
}

/** Network first; the last good answer only when there is no network at all. */
async function lastAnswer(request, url) {
  const cache = await caches.open(VERSION);
  // Clerk adds version and dev-session parameters; one copy per endpoint is enough.
  const key = url.origin + url.pathname;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Kriyan" };
  }
  const title = data.title || "Kriyan";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.taskId ? `/task/${data.taskId}` : "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/today", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // An open Kriyan tab or Home Screen app goes to the task; otherwise open one.
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(url).catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    })(),
  );
});
