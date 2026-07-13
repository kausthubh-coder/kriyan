# Kriyan Testing Contract

This is the testing contract for the integrated Bun monorepo. Evidence must identify an immutable checkpoint, distinguish deterministic local tests from live services, and name every skipped platform or external dependency.

## Definition of done

- Install, typecheck, tests, lint, and applicable production/export/native builds pass from the same checkout.
- Visible web behavior is checked at desktop and phone viewports; desktop behavior is checked in the built Tauri app.
- Mocks, demo repositories, unavailable services, untested devices, and external-account boundaries are explicit.
- A local or mocked result is never described as deployment, release, physical-device, or live-provider proof.
- Test processes and mutable demo profiles are cleaned up before the checkpoint is frozen.

## Verified credential-free baseline

Verified on macOS on 2026-07-13 after integrating the four accepted product checkpoints.

Install and static metadata boundary:

```sh
bun install --frozen-lockfile
bun run check:convex-metadata
```

- Frozen install passed with no lockfile changes.
- `check:convex-metadata` stopped with `No CONVEX_DEPLOYMENT set`; Convex codegen, metadata comparison, live worker smoke, and live Convex tests were therefore not run.

Typechecks:

```sh
bun run typecheck:convex
bun run typecheck:client-core
bun run typecheck:smoke
bun run typecheck:node
bun run --cwd packages/knowledge-vault typecheck
bun run --cwd web typecheck
bun run --cwd mobile typecheck
```

All listed typechecks passed.

Tests:

```sh
bun run test:convex
bun run test:client-core
bun run --cwd packages/convex-client test
bun run test:node
bun run --cwd packages/knowledge-vault test
bun run --cwd packages/tools test
bun run --cwd web test
bun run --cwd mobile test
```

Verified results:

- Convex: 33 passed, 0 failed.
- Shared client-core: 35 passed, 0 failed.
- Convex knowledge projection client: 1 passed, 0 failed.
- Node, CLI, agent runtime, and tools composite: 55 passed, 0 failed.
- Knowledge vault: 4 passed, 0 failed.
- Web: 14 passed, 0 failed.
- Mobile: 5 passed, 0 failed.
- `packages/tools` also passed standalone: 4 passed, 0 failed; these four are already included in the 55-test composite.
- Unique deterministic tests across the listed product surfaces: 147 passed, 0 failed.
- The CLI composite includes a real subprocess fixture that creates a temporary source and vault, registers and ingests the source, performs cited lexical search, deletes the original source, rebuilds the index, repeats the search deterministically, and cleans up.

The first concurrent run made the CLI knowledge smoke exceed Bun's five-second per-test timeout while other heavy suites were running. An isolated rerun passed in 3.42 seconds, and the complete 55-test composite passed. This was recorded as resource contention, not a product failure.

Lint:

```sh
bun run --cwd web lint
bun run --cwd mobile lint
```

Both lint commands passed.

Builds and exports:

```sh
bun run --cwd web build
bun run --cwd web build:desktop
(cd mobile && bunx expo export --platform android)
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
bun run --cwd apps/desktop build:debug
```

Verified results:

- Next.js normal production build passed with 9 static routes plus the not-found route; output is `web/.next/`.
- Next.js desktop static export passed for the same routes; output is `web/out/`.
- Expo Android JS export passed with 1 Hermes bundle and 43 assets; output is `mobile/dist/`.
- `cargo check` passed for `kriyan-desktop`.
- Tauri debug build and `.app` bundling passed; output is `apps/desktop/src-tauri/target/debug/bundle/macos/Kriyan.app`.

## Interactive regression

For web changes, run the integrated checkout in explicit offline/demo mode and use Browser Use against the exact local URL. Check Today/task/note/settings behavior at one desktop and one phone-sized viewport, including navigation, representative writes, persistence, and console errors. Bound browser-tool retries; record the exact failure if the tool becomes unresponsive.

For desktop changes, launch the freshly built debug `.app` with a dedicated mutable profile, use Computer Use to confirm it renders, exercise one representative navigation/settings persistence path, then stop the process. Do not reuse a mutable webview profile owned by another active process.

Verified Browser Use results against `NEXT_PUBLIC_KRIYAN_DEMO=1` at `http://127.0.0.1:3100/`:

- Desktop viewport (`1280x800`): Today rendered the offline/demo state; completing the first task immediately changed the Today count from 2 to 1; the Tasks workspace rendered both seeded tasks; the existing note was renamed and saved with revision advancing from 0 to 1; Settings changed the display name to `Integration smoke` and preserved it after a full page reload.
- Phone viewport override (reported content width 433 px): Today, Notes, and Settings rendered with `scrollWidth === clientWidth` and no captured console warnings/errors. The Tasks route returned HTTP 200 but remained in its loading shell during the single bounded 1.2-second route check, so phone Tasks rendering is not claimed as interactively verified.
- Full page reloads recreate the in-memory demo repository's seeded product data by design; settings persist separately in local app-profile storage.
- The browser viewport override was reset, the Browser Use tab was finalized, and the local web server was stopped.

Verified Computer Use results against `apps/desktop/src-tauri/target/debug/bundle/macos/Kriyan.app`:

- No other `kriyan-desktop` process was active before launch.
- The freshly built app initially showed the webview startup frame and then rendered the integrated Today workspace at `tauri://localhost/`.
- Settings navigation rendered at `tauri://localhost/settings/`; the display name was changed from `Desktop Test` to `Desktop Integration` and showed the saved-runtime confirmation.
- The app was fully stopped, relaunched, and rendered Today with `Desktop Integration`, proving app-profile persistence across process restart.
- The relaunched app was stopped; no desktop or web test process was intentionally left running.

## Surface-specific expectations

- Convex tests/typecheck are credential-free and use deterministic local harnesses. Codegen and live tests require an explicitly assigned isolated `CONVEX_DEPLOYMENT`.
- Client-core contract behavior must pass for both in-memory and injected Convex adapters.
- Node tests cover claim/lease behavior, reconnect/retry/cancellation, durable-effect crash boundaries, signal/drain behavior, redaction, Pi session persistence, packaging invariants, and knowledge context.
- Knowledge-vault tests use temporary fixtures, never a user's real vault, and cover stable IDs, cleanup, atomic write recovery, stale-hash rejection, cited retrieval, and rebuild.
- Mobile acceptance in this lane is lint, TypeScript, deterministic tests, and Android JS export. Do not retry the known broken emulator install in this integration lane.

## Known untested boundaries

- No `CONVEX_DEPLOYMENT` is configured, so there is no codegen refresh, live Convex metadata proof, reactive two-client cloud proof, or live worker smoke.
- No Android emulator or physical Android device run was attempted; the Android boundary is source checks plus JS export.
- iOS build/runtime behavior is untested.
- No real provider/model session was started and no external account was changed.
- No Linux binary, installer, deployment, VPS, systemd host, release, signing/notarization, or distribution claim is made by this product-integration checkpoint.
- No deploy, push, remote mutation, auth change, billing change, or external-account action is part of this contract.

## Live integration writer runbook

The live run uses the isolated project `kriyan-live-20260713`, dev deployment `bold-cat-986`, production deployment `robust-clownfish-387`, replacement host `kriyan-live-node`, and Vercel project `kriyan-docs`. Never put private URLs, the UUID installation, host addresses, keys, or provider sessions in tracked evidence.

Preflight the single private environment before every live command:

```sh
test "$(stat -f '%Lp' .env.integration.local)" = 600
git check-ignore .env.integration.local
set -a
source .env.integration.local
set +a
test "$KRIYAN_RELEASE_ID" = "$(git rev-parse HEAD)"
test -z "$(git status --porcelain)"
```

Dev Convex validation and idempotent fixture cleanup:

```sh
set -a
source .env.integration.local
set +a
bunx convex dev --once --env-file "$KRIYAN_ENV_FILE" --typecheck enable --tail-logs disable
bunx convex codegen --typecheck enable
bun run typecheck:convex
bun run check:convex-metadata
bun run test:node:live
```

`test:node:live` refuses a dirty checkout, release-SHA mismatch, non-UUID installation, or missing deployment name/URL/env file/node ID. Its sanitized output correlates command, job, run, ordered event sequences, server timestamps, reminder, node heartbeat, and release SHA. Cleanup is guarded by the exact selected deployment plus installation fingerprint and must delete zero rows on its second pass.

Production deployment is explicit and happens only from the frozen integration SHA:

```sh
bunx convex deploy --env-file "$KRIYAN_ENV_FILE" --typecheck enable --message "Kriyan live integration $KRIYAN_RELEASE_ID"
```

Build and verify the exact standalone release before touching the host:

```sh
bun run build:standalone
file dist/kriyan-node-linux-x64 dist/kriyan-linux-x64 dist/kriyan-darwin-arm64
packaging/scripts/verify-operator-build.sh dist/kriyan-darwin-arm64 "$KRIYAN_RELEASE_ID"
```

Follow `packaging/README.md` for archive construction and `kriyan vps install|status|doctor|restart|update|rollback`. The Ubuntu host must prove `command -v bun` fails before install, the release/archive hashes match locally and remotely, the service is enabled and active, the process-health release equals the Git SHA, and Convex shows a fresh heartbeat for the same node. Repeat install, restart, update, rollback, and host reboot must all preserve health.

Build the fresh live Tauri handoff without committing private values:

```sh
NEXT_PUBLIC_CONVEX_URL="$KRIYAN_PROD_CONVEX_URL" \
NEXT_PUBLIC_KRIYAN_INSTALLATION_ID="$KRIYAN_INSTALLATION_ID" \
NEXT_PUBLIC_KRIYAN_DISPLAY_NAME="Kriyan live" \
bun run --cwd web build:desktop
bun run --cwd apps/desktop build:debug
```

The writer may prove terminal and service behavior but does not self-accept desktop UX. A fresh Computer Use tester must launch that exact bundle with a dedicated profile and prove the desktop → production Convex → VPS → completed run/reminder → desktop loop, then service restart and host reboot recovery. Android device and iOS runtime coverage remain separate boundaries.
