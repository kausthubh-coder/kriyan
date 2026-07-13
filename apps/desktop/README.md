# Kriyan Desktop

Kriyan Desktop is a Tauri 2 shell around the existing Next.js product. The desktop build statically exports `web/` to `web/out`; no Next.js server or sidecar is bundled.

```bash
bun install --frozen-lockfile
bun run --cwd apps/desktop build:web
bun run --cwd apps/desktop tauri build --debug --bundles app
```

The app stores only its non-secret Convex URL, installation ID, display name, and offline-demo preference in the webview profile. A private Kriyan VPS node connects independently through the same Convex deployment.
