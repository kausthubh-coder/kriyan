# Kriyan web

The Next.js client is the first reactive Kriyan product slice. It exposes Today, a command composer, live run activity, tasks, reminders, and paired-node status against the accepted Convex control-plane API.

## Run and verify

Use Bun from this directory:

```bash
bun install --frozen-lockfile
bun run dev
bun run lint
bun run typecheck
bun run test
bun --bun run build
```

The default development target is `qualified-sandpiper-726` with the isolated installation `installation:oracle-reactive-web-20260712`. Override either value when testing with a paired node:

```bash
NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud \
NEXT_PUBLIC_KRIYAN_INSTALLATION_ID=installation:<shared-id> \
bun run dev
```

These values identify a development deployment and installation; they are not credentials. The browser never claims jobs or executes a runner. A command remains visibly queued while no node is online.

## Client architecture

Framework-neutral repository contracts, optimistic overlay/reconciliation helpers, and Today view models live under `src/client-core`. They remain inside `web` for this round because the parallel node lane owns root workspaces, `package.json`, `bun.lock`, and TypeScript registration. Integration can move the directory to `packages/client-core` once the root workspace owner registers it.

Convex subscriptions are composed in `components/today/today-app.tsx`. There is no polling and no legacy Convex API use. Revision-checked task/reminder mutations show optimistic state, then reconcile on a newer subscription revision or roll back with a conflict message.

## Browser-test handoff

1. Start the paired fake or real node with the same `NEXT_PUBLIC_KRIYAN_INSTALLATION_ID`.
2. Start the web app and open `/` in two independent browser sessions.
3. Submit `remind me tomorrow at 8 to practice Korean` in session A.
4. Verify queued → running → completed activity and ordered events in both sessions without reload; verify the resulting reminder appears once.
5. Stop the node, submit another command, and verify honest queued/node-offline copy. Restart the node and verify recovery.
6. Exercise task create/edit/complete/cancel and reminder create/edit/dismiss/cancel, including a stale-revision conflict across the two sessions.
7. Test `/`, `/tasks`, and `/reminders` at desktop and 390px phone viewports; inspect keyboard focus, reduced motion, console errors, network errors, offline/reconnect behavior, and the route error retry boundary.

Browser Use evidence, Vercel deployment, native alarms, central authentication, notes, calendar, Google integrations, and broad settings are outside this checkpoint.
