# Kriyan Desktop

Kriyan Desktop is a Tauri 2 shell around the existing Next.js product. The desktop build statically exports `web/` to `web/out`; no Next.js server or sidecar is bundled.

```bash
bun install --frozen-lockfile
bun run --cwd apps/desktop build:release
```

The release command creates an Apple-silicon macOS application and a drag-to-install disk image:

- `apps/desktop/src-tauri/target/release/bundle/macos/Kriyan.app`
- `apps/desktop/src-tauri/target/release/bundle/dmg/Kriyan_0.1.0_aarch64.dmg`

The build receives a local ad-hoc signature so the bundle is internally sealed, but it has no Apple Developer ID signature and is not notarized for V1. A user may need to control-click the app and choose **Open** the first time. Developer ID signing and App Store distribution are separate release steps.

On first launch, Kriyan asks for the owner's Convex deployment URL and installation ID, or offers a fully offline demo. No Next.js server or bundled credential is required.

The app stores only its non-secret Convex URL, installation ID, display name, and offline-demo preference in the webview profile. A private Kriyan VPS node connects independently through the same Convex deployment.
