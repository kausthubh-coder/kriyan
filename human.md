# Kriyan Human Map

Kriyan is a local-first personal productivity and second-brain system. The integrated product now has web, Android/Expo, and macOS/Tauri clients over a shared client contract, a Convex coordination plane, a Bun agent node and CLI, and a local Markdown/SQLite knowledge vault.

## Repository shape

- `web/` — Next.js 16 application for Today, tasks, reminders, notes, calendar, sources, entities, and runtime settings. It supports an explicit offline demo repository and an explicitly configured Convex repository.
- `mobile/` — Expo Router client for Android-oriented Today, tasks, notes, calendar, knowledge, reminders, agent, and settings surfaces. It shares the product contracts through workspace imports and has a deterministic demo repository.
- `apps/desktop/` — Tauri 2 macOS shell around the static Next.js export in `web/out/`. The desktop profile stores only non-secret runtime preferences.
- `convex/` — coordination and product projection backend. It owns installation/node presence, commands, jobs, runs/events, tasks, reminders, calendar events, notification intents, notes, and compact source/knowledge projections.
- `apps/node/` — long-running Bun worker with lease/retry/restart handling, durable effects, Pi runtime integration, and vault/retrieval hooks.
- `apps/cli/` — `kriyan` setup, pairing, status, doctor, submission, source ingestion, search, and index rebuild commands.
- `packages/client-core/` — repository contracts, in-memory and injected Convex adapters, connection state, optimistic state, and product view models shared by clients.
- `packages/convex-client/` — narrow client for compact knowledge projections.
- `packages/agent-runtime/` — agent/Pi adapter and cited-context assembly.
- `packages/knowledge-vault/` — authoritative local source registry, Markdown entities/transcripts, journals, temporary materialization, and SQLite lexical/hybrid indexes.
- `packages/tools/` — durable-effect and projection boundary contracts.
- `packaging/` — systemd and standalone-node construction support. Packaging and deployment are outside this product-integration checkpoint.

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
```

The normal web build writes `web/.next/`; the desktop static export writes `web/out/`; the Android JS export writes `mobile/dist/`; and the macOS debug bundle is `apps/desktop/src-tauri/target/debug/bundle/macos/Kriyan.app`.

## Product-integration boundary

This checkpoint integrates the accepted web baseline repair, web productivity, Expo mobile, and Tauri desktop feature checkpoints onto the product-contracts and second-brain core. It does not deploy, configure external accounts, create a Convex project, install an Android emulator build, verify iOS, or claim a packaged/released product.

See `test.md` for the exact credential-free verification matrix and interactive boundaries.
