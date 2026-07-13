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

The client fails closed unless both deployment and installation are explicitly configured. For a namespaced development smoke, use an installation created by the local setup flow:

```bash
NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud \
NEXT_PUBLIC_KRIYAN_INSTALLATION_ID=installation:<shared-id> \
bun run dev
```

These values identify a development deployment and one owner-controlled installation; they are not credentials. Do not put one shared development installation ID into a public deployment. The browser does not create installations, claim jobs, or execute a runner. A command remains visibly queued while no node is online.

## Client architecture

Framework-neutral types, repository ports, in-memory adapter, pending/optimistic reducers, connection state machine, clock boundaries, and Today view models live in `packages/client-core`. Thin React adapters under `src/client-core` are the only modules that own generated query/mutation hooks. Components consume the package repository interface and never own the generated API lifecycle.

There is no polling and no legacy Convex API use. Revision-checked task/reminder mutations show one stable-ID optimistic row, then reconcile synchronously with a subscription or roll back with a typed conflict message. Entity/command locks prevent conflicting double submits.

## Pagination boundary

Tasks use the accepted status/due index and reminders use the accepted status/time index, so loaded pages have deterministic due/time order. Run events use the run/sequence index. Activity uses one installation/created-time command index and one paginated read model that joins each command to its job and exact current-attempt run. Every page is globally newest-first and remains relationally coherent across retry boundaries.

## Browser-test handoff

1. Start the paired fake or real node with the same `NEXT_PUBLIC_KRIYAN_INSTALLATION_ID`.
2. Start the web app and open `/` in two independent browser sessions.
3. Submit `remind me tomorrow at 8 to practice Korean` in session A.
4. Verify queued → running → completed activity and ordered events in both sessions without reload; verify the resulting reminder appears once.
5. Stop the node, submit another command, and verify honest queued/node-offline copy. Restart the node and verify recovery.
6. Exercise task create/edit/complete/cancel and reminder create/edit/dismiss/cancel, including a stale-revision conflict across the two sessions.
7. Test `/`, `/tasks`, and `/reminders` at desktop and 390px phone viewports; inspect keyboard focus, reduced motion, console errors, network errors, offline/reconnect behavior, and the route error retry boundary.

Browser Use evidence, Vercel deployment, native alarms, central authentication, notes, calendar, Google integrations, and broad settings are outside this checkpoint.
