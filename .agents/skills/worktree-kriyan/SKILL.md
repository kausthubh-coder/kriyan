---
name: worktree-kriyan
description: Make a Kriyan checkout work, isolated from every other worktree. Use at the start of every task in a new worktree, when install, env, ports or the backend look wrong, and before giving a helper agent its own checkout.
---

# Worktree Kriyan

Every task runs in its own git worktree with its own dependencies, ports and Convex backend. One command sets that up.

## Setup and doctor

From the worktree root:

```
bun run setup     # safe to rerun; about 5 seconds when nothing is missing
bun run doctor    # read-only; prints the fix for each FAIL
```

Setup links `.claude/skills`, copies `apps/app/.env.local` and `apps/site/.env.local` from `~/.kriyan/dev-env` (the main checkout is the fallback), installs when `bun.lock` is newer than the last install, writes `.env.ports`, creates the local backend, and points the app and site env at it. It ends by running the doctor. A healthy run ends with:

```
kriyan: ready. app :8133, site :3333, own Convex backend :4466, 0 behind origin/main.
```

`warn apps/site/.env.local lacks CLERK_SECRET_KEY` is expected: the dev store has no Clerk secret, so the site's MCP OAuth sign-in is off locally. MCP with a personal access token still works. Everything else should be `ok`.

- **Ports.** `.env.ports` holds `PORT_APP` (8100-8299), `PORT_SITE` (3300-3499), `PORT_CONVEX` and `PORT_CONVEX_SITE` (4400-4799), derived from a hash of the worktree path. Setup skips ports in use or listed in another worktree's `.env.ports`.
- **Backend.** An anonymous local Convex deployment. Its data lives in `packages/convex/.convex/local/` and its URL is `http://127.0.0.1:<PORT_CONVEX>`. Setup sets `CLERK_JWT_ISSUER_DOMAIN` (the dev Clerk instance) and `KRIYAN_SERVICE_SECRET` on it. Data starts empty; `node apps/app/e2e/seed.mjs` fills it (see `verify-kriyan`).
- **Shared deployments.** `dev:wry-parrot-108` is the old shared dev backend and `prod:brave-sheep-245` is production. No checkout points at either. `bun run dev` and `api.mjs` refuse to start against them, and the doctor fails. If a worktree still has `dev:wry-parrot-108` in `packages/convex/.env.local`, rerun setup and it switches.
- **Android.** The emulator reaches the backend through `adb reverse tcp:<PORT_CONVEX> tcp:<PORT_CONVEX>` (see `verify-kriyan/features/android.md`).

## Dev

`bun run dev` starts the backend (watching `packages/convex/convex`), the web app and the site on this worktree's ports. To stop it, kill the tree: `taskkill /PID <pid> /T /F`. A plain kill of the PID leaves the backend, Metro and Next running.

## The main checkout

`C:\Users\kaust\OneDrive\Documents\dev\kriyan` is the main checkout. Never edit it, pull it or run dev there; `ship-kriyan` is the only thing that updates it. The doctor prints its path.

## Helpers

Give each helper agent its own worktree and backend, never a shared checkout:

```
git -C C:\Users\kaust\OneDrive\Documents\dev\kriyan fetch origin
git -C C:\Users\kaust\OneDrive\Documents\dev\kriyan worktree add C:\Users\kaust\.t3\worktrees\kriyan\<name> -b <name> origin/main
cd C:\Users\kaust\.t3\worktrees\kriyan\<name>; bun run setup
```

The first setup in a new worktree takes about two minutes, mostly `bun install`.

## Cleanup

- Stop only processes you started, by PID and with `/T` (see Dev).
- Remove a worktree only when its branch is merged into `main` or I say so, and never one a live thread uses: check `t3_thread_list` for its path first. Then run `git worktree remove <path>` and `git branch -d <branch>`. The local backend's data goes with the folder.
