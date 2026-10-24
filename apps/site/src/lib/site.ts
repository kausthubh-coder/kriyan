// Addresses the site links to. One place, so a move is one edit.

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://kriyan.app").replace(/\/$/, "");
export const APP_URL = "https://app.kriyan.app";
export const GITHUB_URL = "https://github.com/kausthubh-coder/kriyan";
export const RELEASES_URL = `${GITHUB_URL}/releases`;
/** The APK of the latest release; every release attaches it under this name. */
export const APK_URL = `${RELEASES_URL}/latest/download/kriyan.apk`;
/** Where every "Get it on Android" link goes: the version, size and install steps, then the APK. */
export const ANDROID_PAGE = "/android";
/**
 * The Android build APK_URL serves, as shown on /android. ship-kriyan updates the version and the
 * size with every Android release; the size is the APK's in MB (1,000,000 bytes) as the release lists it.
 */
export const ANDROID_RELEASE = { version: "2.2.0", sizeMb: 116, minAndroid: "7" } as const;
export const MCP_URL = `${SITE_URL}/mcp`;

export const SITE_NAME = "Kriyan";
export const HEADLINE = "Your whole day, in one calm plan.";
export const DESCRIPTION =
  "Tasks, events, habits and goals on one timeline. Kriyan tells you what's next and how much time is free, and your AI plans with you.";
