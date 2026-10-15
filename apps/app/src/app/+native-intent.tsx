// Google sign-in returns to kriyan://sso-callback. Clerk's useSSO reads that link from the
// auth browser, but Android also hands it to the router, which has no such screen and showed
// "Unmatched Route". The link is for Clerk only, so the router ignores it, and on a cold start
// opens the app at its root, where the sign-in gate decides what to show.

const SSO_CALLBACK = /^[a-z][a-z0-9+.-]*:\/\/\/?sso-callback(?:[/?#]|$)/i;

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (!SSO_CALLBACK.test(path)) return path;
  return initial ? "/" : null;
}
