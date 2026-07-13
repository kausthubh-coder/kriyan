# Kriyan Human Map

Kriyan is a local-first personal productivity and second-brain system. The integrated product now has web, Android/Expo, and macOS/Tauri clients over a shared client contract, a Convex coordination plane, a Bun agent node and CLI, and a local Markdown/SQLite knowledge vault.

## Repository shape

- `web/` — Next.js 16 application for Today, tasks, reminders, notes, calendar, sources, entities, and runtime settings. It supports an explicit offline demo repository and an explicitly configured Convex repository.
- `mobile/` — Expo Router client for Android-oriented Today, tasks, notes, calendar, knowledge, reminders, agent, and settings surfaces. It shares the product contracts through workspace imports and has a deterministic demo repository.
- `apps/desktop/` — Tauri 2 macOS shell around the static Next.js export in `web/out/`. The desktop profile stores only non-secret runtime preferences.
- `apps/docs/` — public Next.js installation, architecture, desktop, Convex, VPS, second-brain, operations, and status documentation. It is a root Bun workspace and uses the root lockfile.
- `convex/` — coordination and product projection backend. It owns installation/node presence, commands, jobs, runs/events, tasks, reminders, calendar events, notification intents, notes, and compact source/knowledge projections.
- `apps/node/` — long-running Bun worker with lease/retry/restart handling, durable effects, Pi runtime integration, and vault/retrieval hooks.
- `apps/cli/` — `kriyan` setup, pairing, status, doctor, submission, source ingestion, search, and index rebuild commands.
- `packages/client-core/` — repository contracts, in-memory and injected Convex adapters, connection state, optimistic state, and product view models shared by clients.
- `packages/convex-client/` — narrow client for compact knowledge projections.
- `packages/agent-runtime/` — agent/Pi adapter and cited-context assembly.
- `packages/knowledge-vault/` — authoritative local source registry, Markdown entities/transcripts, journals, temporary materialization, and SQLite lexical/hybrid indexes.
- `packages/tools/` — durable-effect and projection boundary contracts.
- `packaging/` — reproducible standalone Linux x64 baseline node/CLI and macOS arm64 operator builds, provenance/archive verification, systemd installation, and transactional update/rollback support.

The root is a Git worktree and a Bun workspace. Use `bun`/`bunx`; npm, Vite, and Portless are not part of this integrated checkout.

## Data and runtime boundaries

- Convex is the coordination authority and reactive compact projection store. It is not the authority for raw files, full transcript bodies, provider credentials, or browser profiles.
- The knowledge vault is the local authority for raw-source references, Markdown entities/transcripts, provenance, journals, and rebuildable SQLite indexes.
- The agent node owns provider sessions, execution, leases, durable-effect reconciliation, temporary workspaces, and vault access.
- Web, mobile, and desktop depend on client repository contracts. They do not directly own leases, Pi sessions, vault files, or the local search index.
- Offline/demo mode is explicit. Live mode requires an explicit Convex URL and installation identifier; missing configuration fails closed.

## Install and development

From the repository root:

```sh
bun install --frozen-lockfile
bun run dev
```

`bun run dev` starts Convex, the Next.js web app, and the Expo Android command concurrently. Run individual surfaces with:

```sh
bun run dev:convex
bun run dev:web
bun run dev:mobile
bun run --cwd apps/desktop dev
```

The current checkout has no configured `CONVEX_DEPLOYMENT`. Run `bunx convex dev` only when an isolated development deployment is intentionally being configured. Do not treat the credential-free tests as live Convex proof.

## Build outputs

```sh
bun run --cwd web build
bun run --cwd web build:desktop
(cd mobile && bunx expo export --platform android)
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
bun run --cwd apps/desktop build:debug
bun run verify:docs
bun run build:standalone
```

The normal web build writes `web/.next/`; the desktop static export writes `web/out/`; the Android JS export writes `mobile/dist/`; the public docs build writes `apps/docs/.next/`; standalone executables write under `dist/`; and the macOS debug bundle is `apps/desktop/src-tauri/target/debug/bundle/macos/Kriyan.app`.

## Live integration configuration

Live integration uses exactly one local file, `.env.integration.local`. It must remain Git-ignored and mode `0600`. The file contains the selected deployment references and URLs, UUID installation ID, stable node ID, release SHA, Droplet host metadata, and Vercel project ID. Never copy its values into commits, public docs, screenshots, journals, or chat evidence.

Required variable names are `CONVEX_DEPLOYMENT`, `CONVEX_URL`, `KRIYAN_DEPLOYMENT_NAME`, `KRIYAN_PROD_DEPLOYMENT`, `KRIYAN_PROD_CONVEX_URL`, `KRIYAN_INSTALLATION_ID`, `KRIYAN_NODE_ID`, `KRIYAN_RELEASE_ID`, `KRIYAN_ENV_FILE`, `KRIYAN_DROPLET_ID`, `KRIYAN_DROPLET_HOST`, `KRIYAN_SSH_USER`, and `KRIYAN_VERCEL_PROJECT_ID`.

The isolated live project is `kriyan-live-20260713`, with dev deployment `bold-cat-986` and production deployment `robust-clownfish-387`. The replacement VPS resource is named `kriyan-live-node`; the original Droplet `584129331` is preserve-only. Public docs use the existing Vercel project `kriyan-docs`.

## Product-integration boundary

This checkpoint integrates the accepted product, standalone CLI/node, and public-docs chains and provides a guarded live runbook. Repository support is not itself proof that a particular Convex deployment, VPS service, Vercel production alias, or desktop round trip is healthy; those claims require exact-SHA provider and interactive evidence from `test.md`.

See `test.md` for the exact credential-free verification matrix and interactive boundaries.
