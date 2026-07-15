# Kriyan Human Map

Last reconciled: 2026-07-15 for the V1 release-candidate integration.

Kriyan is a local-first productivity system and personal agent runtime. It combines tasks, reminders, calendar, notes, an entity-oriented Markdown second brain, and agent workspaces. Product clients and the agent node coordinate through the owner's Convex deployment; only the public documentation site is centrally hosted.

## Repository map

- `web/` — Next.js product UI for Today, tasks, reminders, notes, calendar, sources, entities, agents, and settings. It supports explicit offline demo mode and an explicit live Convex mode.
- `mobile/` — Expo Router Android client. Demo-mode data is persisted with bounded, versioned AsyncStorage snapshots; live mode uses the configured Convex repository.
- `apps/desktop/` — Tauri 2 macOS shell around `web/`'s static export. Arbitrary knowledge IDs use finite query-based detail routes so runtime-created items work without a Next.js server.
- `apps/docs/` — the only publicly hosted surface: landing page plus installation, architecture, Convex, VPS, desktop, second-brain, operations, and status docs.
- `convex/` — reactive coordination and compact product projections: installations, nodes, commands/jobs/runs/events, tasks, reminders, calendar events, notes, sources, entities, agent definitions/threads/messages, and notification intents.
- `apps/node/` — long-running Bun worker with leases, retries, durable effects, Pi integration, and vault/retrieval hooks.
- `apps/cli/` — setup, pairing, node execution, health, work submission, source ingestion, search, indexing, and provider-generic VPS lifecycle commands.
- `packages/client-core/` — framework-neutral repository contracts, local/in-memory adapters, injected Convex adapters, optimistic state, and view models shared by product clients.
- `packages/agent-runtime/` — Pi/provider adapter and cited-context assembly.
- `packages/knowledge-vault/` — local source registry, Markdown entities/transcripts, provenance, journals, temporary materialization, and rebuildable SQLite indexes.
- `packages/convex-client/` — narrow compact-knowledge projection client.
- `packages/tools/` — durable-effect and projection boundary contracts.
- `packaging/` — standalone Linux x64 node/CLI, Darwin arm64 operator, exact-source provenance, release archive, systemd install, update, rollback, backup, and restore tooling.

## Runtime and trust boundaries

```text
local clients <-> owner Convex deployment <-> owner node <-> providers/vault
```

- Convex is the reactive coordination authority. It should not contain provider credentials, SSH material, browser profiles, raw source files by default, or full private vault bodies.
- The knowledge vault is authoritative for source references, transcripts, structured Markdown, provenance, journals, and rebuildable local indexes.
- The node owns provider sessions, execution, leases, durable effects, temporary workspaces, and vault access.
- Clients never connect directly to a VPS. They write intent to Convex and subscribe to the resulting state.
- V1 intentionally has no central Kriyan account service. `installationId` is a routing/isolation key inside an owner-controlled deployment, not an authentication credential.
- Missing live configuration fails closed. Offline/demo mode must be selected explicitly.

## Product behavior now present

- Tasks, reminders, calendar events, notes, and knowledge surfaces share repository contracts across web, desktop, and mobile.
- The macOS release is a static Tauri app with query-based detail routes for arbitrary source, artifact, and entity IDs.
- Android demo data survives force-stop and cold relaunch through a bounded local snapshot. Convex mode remains separate.
- `/agents` uses the deterministic demo only in explicit demo mode. Live mode maps Convex definitions, revisions, threads, messages, runs, events, and nodes through `AgentWorkspacePort`, including create, rename, revise, submit, cancel, retry, and reset operations.
- Live agent windows are bounded, the UI discloses bounded history, and node freshness advances from a time-driven clock instead of waiting for another reactive render.

## Install and develop

```sh
bun install --frozen-lockfile
bun run dev
```

Individual surfaces:

```sh
bun run dev:convex
bun run dev:web
bun run dev:mobile
bun run --cwd apps/desktop dev
```

The repository uses Bun workspaces. Expo's Metro process runs through its expected Node-compatible tooling, but workspace commands still use `bun`/`bunx`.

## Configure Convex and the node

Use `bunx convex dev` to select or create a development deployment and generate bindings. Use `bunx convex deploy` only after reviewing the selected production target.

Create a private node JSON config with `bun run kriyan setup`, pair the installation with `bun run kriyan pair`, and start the worker with `bun run kriyan node run`. Required configuration concepts are the Convex URL, unique installation ID, stable node ID, private data directory, IANA timezone, and BCP 47 locale. Store private values only in ignored, mode-restricted local files.

## Build outputs

```sh
bun run --cwd web build
bun run --cwd web build:desktop
bun run --cwd apps/desktop build:release
bun run --cwd mobile build:android:apk
bun run build:standalone
bun run verify:docs
```

- Web production build: `web/.next/`
- Desktop static export: `web/out/`
- macOS DMG and checksum: `apps/desktop/dist/release/`
- Android APK: `mobile/build/kriyan-android-v1.0.0.apk`
- Linux node/operator and Darwin operator CLI: `dist/`
- Public docs build: `apps/docs/.next/`

The macOS arm64 app is ad-hoc signed and its build fails unless strict signature verification passes. It is not Developer ID signed or notarized. The Android APK uses a generated debug key for direct V1 installation, not Play Store distribution.

## Release and operational truth

- The accepted desktop component produced a strictly sealed arm64 DMG; its visible offline product flow and persistence passed Computer Use, while the exact copied-DMG app's final keyboard/detail smoke was blocked by a locked Mac and remains a post-integration check.
- The accepted Android component installed on an API 36 emulator, completed a task and note flow without the prior stale-write retry, and preserved the changes after force-stop and cold relaunch.
- Standalone Linux x64 node/CLI and Darwin operator artifacts pass local identity/archive verification.
- The exact live-proven node archive and Darwin operator are published as the `v0.1.1` tooling patch; unchanged desktop and Android apps remain in `v0.1.0`.
- The DigitalOcean systemd service is enabled, active, and healthy on exact source candidate `3bf3ec273a3b9fb407747a5ba1eed1857c2bca29`. The earlier promotion failed because a stable node identity could not renegotiate its legacy capability list; the updater rolled back safely, the Convex contract was repaired, and a single later promotion passed release identity, process-health, and fresh-heartbeat gates.
- A live browser session connected through Settings, created a durable Agent thread, submitted a message, and observed the DigitalOcean node complete it through Convex with an assistant response and four ordered public run events. That proof used the deterministic fake runtime, not Pi or a real model provider.
- V1 operates one process per stable node ID through systemd. Concurrent processes sharing the same node ID do not yet have a registration-generation fence and remain an explicit operational boundary.
- Hetzner, self-hosted Convex, iOS, app-store distribution, and a real Pi/provider session require separate proof.

## Safe parallel ownership

- `convex/` plus generated API metadata is one shared schema/API lane.
- `web/` and `apps/desktop/` overlap whenever desktop static output changes; rebuild the DMG after any integrated web change.
- `mobile/` owns Expo/native artifacts but root `bun.lock` is shared.
- `apps/cli/`, `apps/node/`, shared runtime packages, and `packaging/` overlap for release provenance and must freeze one final source SHA before artifact construction.
- `README.md`, `human.md`, `test.md`, and `apps/docs/` are integration/release-owner files.

## Workflow locations

- Oracle plans: `.artifacts/plans/`
- Run ledgers and evidence: `.artifacts/runs/`
- Conclusions: `.artifacts/conclusions/`
- UI explorations: `.design/`
- Isolated worktrees/prototypes: `.sandbox/`

See `test.md` for the smallest credible V1 regression and the explicit unclaimed boundaries.
