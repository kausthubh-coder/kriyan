# Kriyan Convex control plane

To install dependencies:

```bash
bun install
```

Focused backend verification:

```bash
bun run typecheck:convex
bun run typecheck:smoke
bun run test:convex
bun run codegen:convex
```

The public control-plane API uses Convex server time for bookkeeping. Semantic
timestamps such as task `dueAt` and reminder `remindAt` remain caller supplied.

Development fixture cleanup is internal-only. Call
`dev:resetInstallation` with the guarded deployment name, confirmation literal,
installation ID, and a `batchSize` from 1-64 until `done` is true. Each call is
installation-indexed and bounded; repeating a completed cleanup is safe.
