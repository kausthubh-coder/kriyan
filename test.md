# Kriyan V1 Testing Contract

Last reconciled: 2026-07-15 for the integrated V1 release candidate.

Testing must name the exact source SHA and artifact hash, operate the real user surface when practical, and separate local source gates, packaged-app proof, live Convex proof, VPS proof, and public-release proof. A tester records evidence but does not repair source; a fresh reviewer scores the same frozen checkpoint.

## Practical V1 definition of done

- Frozen install and targeted TypeScript/build gates pass from one clean checkout.
- The macOS arm64 DMG is ad-hoc signed, strictly verifies, copies from a mounted image, launches, and completes one representative local flow.
- The Android APK installs on the assigned emulator, completes a task/note flow, and preserves it through force-stop and cold launch.
- Standalone Linux x64 CLI/node and Darwin arm64 operator artifacts match the frozen source identity and pass archive/operator verification.
- The assigned VPS is inspected only through one serialized operator session. Require the promoted release identity, enabled/active service state, process health, and a fresh post-restart heartbeat before claiming promotion.
- Public docs accurately link the V1 release assets and state that only docs are hosted.
- No result is described as a live agent chat round trip unless the visible thread, submission, run progression, response, and events were observed.

## Fast source gate

Run from the repository root after `bun install --frozen-lockfile`:

```sh
bun run typecheck:convex
bun run typecheck:client-core
bun run typecheck:node
bun run --cwd web typecheck
bun run --cwd mobile typecheck
bun run --cwd web lint
bun run --cwd mobile lint
bun run --cwd web build
bun run --cwd web build:desktop
bun run verify:docs
```

Use focused tests only when a changed boundary needs them:

```sh
bun run test:convex
bun run test:client-core
bun run test:node
bun run --cwd web test
bun run --cwd mobile test
```

Do not rerun broad suites merely to accumulate counts. If a source or build gate fails, preserve the exact command/output and stop dependent artifact claims.

## Desktop release smoke

Build from the frozen integrated SHA:

```sh
bun run --cwd apps/desktop build:release
shasum -a 256 apps/desktop/dist/release/Kriyan_0.1.0_aarch64.dmg
```

Required hands-on sequence with Computer Use:

1. Mount the exact hashed DMG read-only.
2. Copy `Kriyan.app` into a temporary isolated Applications directory, detach the image, and run `codesign --verify --deep --strict` on the copied app.
3. Launch the copied app with an isolated `HOME` and `CFFIXED_USER_HOME` profile.
4. Complete setup in Offline demo, create/complete a task, edit/save a note, and open one arbitrary-ID knowledge detail route.
5. Use one bounded keyboard path and record visible focus or the exact inaccessible control.
6. Quit, relaunch, confirm the saved local state, stop the app, and remove the temporary profile/install directory.

If macOS is locked or Computer Use cannot expose a window, record the infrastructure blocker once. Do not substitute the build-tree app for copied-DMG proof or loop on the same locked-screen failure.

## Android APK smoke

Build and install the exact APK:

```sh
bun run --cwd mobile build:android:apk
shasum -a 256 mobile/build/kriyan-android-v1.0.0.apk
adb install -r mobile/build/kriyan-android-v1.0.0.apk
```

Use the assigned Android emulator exclusively. Record the device/API, package/activity, APK hash, and clean install result. With ADB plus Computer Use/UI Automator:

1. Cold launch `com.kriyan.mobile`.
2. Complete a task on the first attempt and confirm there is no stale/retry notice.
3. Create one task and edit/save one note.
4. Force-stop the package, confirm its PID is gone, and cold launch again.
5. Confirm all three changes persist, inspect the crash/ANR buffer, capture the representative UI tree/screenshots, then stop the package and emulator.

The accepted V1 boundary is emulator-tested, debug-signed direct installation. It does not prove Play Store updates, physical devices, or iOS.

## Live Agent Workspace smoke

Use an isolated development Convex deployment, unique installation ID, dedicated local browser profile, and fake or intentionally selected provider runtime. Never publish the URL, IDs, keys, or provider output.

The complete visible flow is:

1. Configure live Settings and observe Connected state plus a fresh node.
2. Open `/agents`, create a thread, submit one message, and observe queued/running/completed progression.
3. Confirm the assistant result and ordered run events render reactively.
4. Exercise one cancellation/retry or session-reset control when the fixture supports it.
5. Inspect console/network errors, stop the local node/server, and clean only the isolated fixture.

The July 15 live browser smoke completed this flow against the promoted DigitalOcean node: Settings connected, the node was fresh, a new durable thread accepted a message, the deterministic fake runtime completed it, and the UI rendered the assistant response plus four ordered public events. This proves the application/Convex/VPS transport and reactive state path. It does not prove Pi, model-provider credentials, provider output, or a provider-backed tool run.

## CLI and VPS release smoke

Build from the final frozen SHA and verify exact identity:

```sh
bun run build:standalone
file dist/kriyan-node-linux-x64 dist/kriyan-linux-x64 dist/kriyan-darwin-arm64
packaging/scripts/verify-operator-build.sh \
  dist/kriyan-darwin-arm64 "$(git rev-parse HEAD)" \
  dist/operator-provenance.manifest
```

Construct and verify the Linux archive by following `packaging/README.md`. Record the source commit/tree, lock hash, Bun policy/version, artifact hashes, archive verifier result, and clean checkout.

For remote checks, use the separately obtained Darwin operator, strict known-hosts, one assigned host, and one serialized terminal session. Exercise `vps status`, `doctor`, and at most one authorized `restart`, then require enabled/active service state, expected release identity, current process health, and fresh node heartbeat. Never expose the host, installation ID, deployment URL, SSH path, or logs containing user material.

The current DigitalOcean host is healthy on exact source candidate `3bf3ec273a3b9fb407747a5ba1eed1857c2bca29`. The earlier update failure was traced to immutable legacy capability registration, not a dead VPS. After the Convex renegotiation repair, one rebuilt exact-source promotion passed release identity, enabled/active service, process-health, and fresh-heartbeat gates. Do not repeat promotion merely to accumulate evidence.

## Public docs and release verification

```sh
bun run verify:docs
```

After the release owner publishes `v0.1.0`, verify that the tag page and four advertised artifacts are reachable and that checksums match the locally frozen artifacts. Deploy only `apps/docs/` publicly, then check the canonical page, install, desktop, VPS, status, `robots.txt`, and `sitemap.xml`. The product apps, Convex deployment, node, vault, and local web UI are not hosted by the documentation deployment.

## Required evidence and cleanup

Record:

- exact SHA/tree and clean tracked status;
- exact artifact path, size, and SHA-256;
- commands, exit codes, device/OS/tool, and representative screenshots/log excerpts;
- what was mocked, local, live, blocked, or untested;
- process/service cleanup and mutable-resource release.

Never store tokens, private URLs, installation/node IDs, IPs, SSH keys, browser profiles, raw transcripts, or user source material in tracked evidence.

## Current accepted and unclaimed boundaries

- Android component: accepted after exact-APK emulator persistence proof.
- Desktop component: accepted after arbitrary-ID route repair and strict copied-app signature proof; final copied-app visual/keyboard smoke remains post-integration because the Mac was locked.
- CLI/node artifacts: locally verified; exact candidate `3bf3ec273a3b9fb407747a5ba1eed1857c2bca29` promoted to the assigned DigitalOcean host and healthy.
- Live Agent Workspace: complete visible browser → Convex → DigitalOcean node → Convex → browser message completion passed with the deterministic fake runtime and four ordered public events.
- Node concurrency: one systemd process per stable node ID is the verified topology; overlapping processes with the same node ID remain unproven and must not be intentionally run in V1.
- No claim for Developer ID/notarization, Play Store/App Store, iOS, physical Android, Hetzner host proof, self-hosted Convex proof, or a real Pi/provider session.
