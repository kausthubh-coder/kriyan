# Kriyan

Kriyan is an open-source, local-first productivity system and personal agent runtime. It combines tasks, reminders, calendar, notes, a Markdown second brain, and an agent workspace while keeping the product apps and agent node under the owner's control.

Version 0.1.0 is a practical direct-download release for Apple-silicon macOS, Android, and an Ubuntu 24.04 x64 node. Only the documentation site is hosted publicly; the product UI, Convex deployment, vault, and agent runtime are owner-operated.

## Architecture

```text
macOS / Android / local web
            |
            v
     owner Convex deployment
            |
            v
  Bun agent node on a VPS or computer
            |
            v
  Pi providers + Markdown/SQLite vault
```

- Convex is the reactive coordination plane for tasks, reminders, calendar events, notes, compact knowledge projections, agent threads, runs, events, and node presence.
- The node owns 24/7 execution, provider sessions, leases, durable effects, temporary workspaces, and local knowledge indexing.
- Raw material stays at its source when practical. Kriyan keeps source references, transcripts, structured Markdown, provenance, and rebuildable local indexes.
- Clients communicate with the node through Convex subscriptions; they never need the VPS address.
- There is no central Kriyan account service in V1. An installation ID scopes an owner-controlled deployment, but is not an authentication credential.

## Download V1

The [v0.1.0 release page](https://github.com/kausthubh-coder/kriyan/releases/tag/v0.1.0) contains:

- `Kriyan_0.1.0_aarch64.dmg` — Apple-silicon macOS desktop app.
- `kriyan-android-v1.0.0.apk` — Android direct-install APK.
- `kriyan-node-v0.1.0-linux-x64.tar.gz` plus checksum — Ubuntu 24.04 x64 CLI/node archive.
- `kriyan-darwin-arm64` plus checksum — macOS operator CLI for setup and remote VPS lifecycle commands.

The macOS app is ad-hoc signed and strictly sealed, but has no Apple Developer ID signature and is not notarized. Control-click **Open** on first launch if macOS blocks a normal double-click. The Android APK is debug-signed for direct V1 installation; it is not a Play Store/AAB release.

## Prerequisites

- Bun 1.3.x for source development and Convex/CLI setup.
- An owner-controlled Convex project.
- For the always-on node: Ubuntu 24.04 x64, SSH access, and outbound HTTPS/WSS. The standalone node does not require Bun or Node on the server.
- For local release builds: Rust/Tauri prerequisites for macOS; Java 17, Android SDK 36, and NDK `27.1.12297006` for Android.

## Source setup

```sh
git clone https://github.com/kausthubh-coder/kriyan.git
cd kriyan
bun install --frozen-lockfile
bun run dev
```

Run surfaces independently with `bun run dev:convex`, `bun run dev:web`, `bun run dev:mobile`, or `bun run --cwd apps/desktop dev`.

## Configure Convex

```sh
# Select or create the owner's development deployment and generate bindings.
bunx convex dev

# Review the selected target before an explicit production deployment.
bunx convex deploy
```

Copy only the resulting deployment URL and a unique installation ID into the local client and node configuration. Never put provider credentials, SSH keys, browser profiles, raw source bytes, or full transcripts in Convex.

## Configure the CLI and node

From source, inspect the current CLI and write a private JSON config:

```sh
bun run kriyan --help
bun run kriyan setup \
  --convex-url https://<deployment>.convex.cloud \
  --installation-id <installation-id> \
  --node-id <node-id> \
  --data-dir <private-data-directory> \
  --timezone <iana-timezone> \
  --locale <bcp47-locale> \
  --config <private-config-path>
bun run kriyan pair --config <private-config-path>
bun run kriyan node run --config <private-config-path>
```

For an Ubuntu VPS, download the Linux archive, checksum, and Darwin operator from the release page, verify the checksums, then use `kriyan-darwin-arm64 vps install`. The same operator provides `vps status`, `doctor`, `restart`, `update`, `rollback`, and `uninstall`. See [`packaging/README.md`](packaging/README.md) for the exact SSH and lifecycle flags.

## Build release artifacts

```sh
bun run --cwd apps/desktop build:release
bun run --cwd mobile build:android:apk
bun run build:standalone
bun run verify:docs
```

## Development checks

```sh
bun run typecheck:convex
bun run typecheck:client-core
bun run typecheck:node
bun run --cwd web typecheck
bun run --cwd mobile typecheck
bun run lint
```

Focused test commands are documented in [`test.md`](test.md). The codebase map and trust boundaries are in [`human.md`](human.md).

## V1 limitations

- macOS is Apple-silicon only, ad-hoc signed, and not notarized.
- Android is a debug-signed direct-download APK; iOS and app-store distribution are not included.
- The existing DigitalOcean service is healthy on its prior release, but promotion of this V1 candidate stopped after repeated `remote vps update failed` results and a healthy rollback. Do not claim the candidate is running there.
- Live Agent Settings and `/agents` route preflight passed after the Strict Mode repair. A complete visible chat-to-node-to-result round trip is not claimed because both bounded browser-automation attempts failed in their tooling sessions.
- Agent history windows are bounded for V1; large installations need explicit pagination and truncation UI.
- Hetzner and self-hosted Convex follow the same architecture but do not yet have release-specific host proof.

## License

[MIT](LICENSE)
