# Kriyan

A planner that turns everything a person has to do into a plan for their time, and helps them keep it: tasks, nested spaces, repeats, reminders, notes, goals and habits, with a calm Today view at the centre. The person's AI agents plan with them through MCP and a CLI. Open source (MIT). Bun workspaces: Expo (Android and app.kriyan.app), Next.js (kriyan.app, docs, MCP), Convex, Clerk.

## Words we use

- **you**: the agent reading this. **me**: the developer. **user** or **person**: whoever uses Kriyan.
- **space**: a coloured container for tasks; spaces nest. Never "area", "project" or "garden".
- **event**: a task you attend (class, meeting) rather than tick off. **occurrence**: one date of a repeating task.
- **proposal**: a task an agent suggested that waits for the person to accept it.

## Map

| Where                                  | What                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`                        | Pure logic shared by everything: dates, repeat rules, reminders, the quick-add parser, formatting, layout, design tokens, the agent operation registry (`ops.ts`)     |
| `packages/convex/convex`               | Backend. `model/` holds every rule (one place); `tasks.ts`, `views.ts`, `organize.ts`, `account.ts` are the app's functions; `agent.ts` + `http.ts` are the agent API |
| `apps/app`                             | Expo Router app for Android and the web app, one feature per folder in `src/features`                                                                                 |
| `apps/site`                            | Next.js: landing page, docs, `/mcp` server                                                                                                                            |
| `packages/cli`                         | The `kriyan` command                                                                                                                                                  |
| `docs/design/ux.md`, `docs/design/v3/` | How the app works, and how it looks (open `brand.html`)                                                                                                               |

Business logic lives once, in `packages/core` or `packages/convex/convex/model`. Apps, MCP and the CLI call it.

## Commands

Every task in a new worktree starts with `worktree-kriyan`. Ship only with `ship-kriyan`, when I say so.

- Set up a worktree: `bun run setup` (deps, dev env from `~/.kriyan/dev-env`, its own ports and local Convex backend; safe to rerun)
- Doctor: `bun run doctor` (read-only; run it first when anything looks off)
- Dev: `bun run dev` (this worktree's backend, the app on the web and the site, on the ports in `.env.ports`)
- Tests for one package: `bun run --filter @kriyan/core test` (also `@kriyan/convex`, `@kriyan/cli`)
- Full check, what CI runs: `bun run check`
- UI check against the running app: `bun run lint:ui`
- Design tokens changed: `bun run tokens`

## Proving a change works

- Done means you saw it work. Drive the feature the way a person would with the `verify-kriyan` skill and look at the result.
- Test with real-shaped data: a few spaces, a repeating class, a birthday, reminders, a habit with history.
- A test calls the code the way its users do and asserts the exact result. Never edit a test to make it pass; say why it's wrong instead.
- A skipped check is not a pass. Report what you ran, what you saw and what you didn't check.

## Design

- Read `docs/design/v3/README.md` before UI work. Values come from `packages/core/src/tokens.ts` only.
- UI work: use the `critly` skill. Read `.critly/policy.json` before choosing spacing, type or colour, use only its values, and never edit it to pass.
- After any UI change, run `bun run lint:ui` and fix every error until it exits 0. Exit 2 means it couldn't run; say so, it is not a pass. Then run `bun run taste:ui` (signed in, at 390 and 1440), open the squint and overlay images in `.critly/taste/` for each changed screen, and fix each look or say why the screen needs it.
- Copy: sentence case, verb plus object on buttons, dates like "Tue 13 Oct", times like "14:30", no em dashes, no guilt ("2 from earlier", never "overdue"). Never invent a task's length.

## How we write code

- TypeScript strict. Boring and explicit; one way to do each thing; names you can grep; no barrel files.
- Every Convex function checks identity first (`requireOwner`) and reads through an index starting with `ownerId`. Agent functions take the owner the HTTP layer authenticated, never one from a request body.
- "Today" comes from the person's time zone (`todayIn`), never the server's UTC date. Queries take `today` as an argument.
- Comments say why, never what.

## Cloud sessions

A cloud VM (Claude Code on the web, Codex Cloud) is Linux with a bare clone: no `~/.kriyan/dev-env`, no main checkout, no Windows. The SessionStart hook in `.claude/settings.json` runs `node scripts/cloud.mjs` (Codex: set the environment's setup script to `CLOUD=1 node scripts/cloud.mjs`). It loads Kausthubh's global skills and rules, runs setup, and makes sure a browser exists. It does nothing outside the cloud. Its last line says ready or what failed; rerun it if you're unsure.

- Setup writes `apps/app/.env.local` and `apps/site/.env.local` from the cloud environment's variables, generates a `KRIYAN_SERVICE_SECRET` for this clone's backend, and creates the local Convex backend as usual. With no Clerk key it gives the backend a placeholder issuer so functions still push. The doctor names every unset variable.
- Env vars, dev values only (setup refuses `pk_live_`, `sk_live_` and production deployments):
  - `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`: the dev instance's `pk_test_` key. Without it the web app stops at "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is missing" and nothing signs in.
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: optional, defaults to the one above.
  - `CLERK_SECRET_KEY`: optional, the dev `sk_test_` key, for the site's MCP OAuth sign-in.
- Works here: setup and the doctor, `bun run check`, `bun run dev`, the site and docs, the local backend through `apps/app/e2e/api.mjs` (it takes any user id in `.artifacts/app/user.json`, so it needs no Clerk), and the e2e scripts headless on the VM's Chromium (`scripts/browser.mjs` picks it; `CHROMIUM_PATH` overrides). With the Clerk key set: `seed.mjs`, the signed-in web app, `lint:ui`, `taste:ui`, and the CLI and MCP with a token from Settings. Shipping with `ship-kriyan` works for landing on `main`.
- `bun run dev` puts each server in its own process group; stop it with `kill -TERM <pid>`. If `[convex]` exits with an `AssertionError` after "Downloading Convex dashboard", the proxy cut the download: run `bun run dev` again; it's cached after one success.
- `gh pr` doesn't work here; `gh api` does.
- Only on Kausthubh's machine: the Android emulator and `adb.sh`, EAS builds and the Android release, Google sign-in on a device, the main checkout (`ship-kriyan` step 9), anything that needs `~/.kriyan/prod-env` or a signed-in Vercel, Convex or npm CLI (`convex deploy`, the web app's `vercel deploy --prod`, `bun publish`). Finish the rest here and list those steps in the report.

## Safety

- Production needs my explicit go: `convex deploy`, `--prod`, Vercel production, EAS submit, Clerk production settings. The steps are in `ship-kriyan`; `docs/ops.md` says where each piece runs.
- Your worktree pushes Convex functions only to its own local backend, which `bun run setup` creates. Never push to the old shared dev deployment `wry-parrot-108`.
- Secrets live in `.env.local` files (ignored) and `~/.kriyan/dev-env`. Never print, log, screenshot or commit them.
- Stop only processes you started, by PID. Use `git stash push -u -m <tag>` and apply by SHA, never a bare `git stash`.
- Git: a branch per change in its own worktree, landed by fast-forwarding `main` with `ship-kriyan`. No PRs; this is a personal repo. Never edit the main checkout (`C:\Users\kaust\OneDrive\Documents\dev\kriyan`).
