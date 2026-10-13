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

- Set up a fresh checkout or worktree: `bun run setup` (installs, copies dev env from `~/.kriyan/dev-env`, picks ports)
- Doctor: `bun run doctor` (run it first when anything looks off)
- Dev: `bun run dev` (backend, app on the web, site; ports in `.env.ports`)
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
- After any UI change, run `bun run lint:ui` and fix every error until it exits 0. Exit 2 means it couldn't run; say so, it is not a pass. Then screenshot each changed screen at 390 and 1440, blur it, and check one thing leads.
- Copy: sentence case, verb plus object on buttons, dates like "Tue 13 Oct", times like "14:30", no em dashes, no guilt ("2 from earlier", never "overdue"). Never invent a task's length.

## How we write code

- TypeScript strict. Boring and explicit; one way to do each thing; names you can grep; no barrel files.
- Every Convex function checks identity first (`requireOwner`) and reads through an index starting with `ownerId`. Agent functions take the owner the HTTP layer authenticated, never one from a request body.
- "Today" comes from the person's time zone (`todayIn`), never the server's UTC date. Queries take `today` as an argument.
- Comments say why, never what.

## Safety

- Production needs my explicit go: `convex deploy`, `--prod`, Vercel production, EAS submit, Clerk production settings. Commands live in `docs/ops.md`.
- Your worktree pushes Convex functions only to its own deployment: the shared dev deployment from the main `rebuild` checkout, or `CONVEX_AGENT_MODE=anonymous bunx convex dev --local` in other worktrees.
- Secrets live in `.env.local` files (ignored) and `~/.kriyan/dev-env`. Never print, log, screenshot or commit them.
- Stop only processes you started, by PID. Use `git stash push -u -m <tag>` and apply by SHA, never a bare `git stash`.
- Git: branch per change, PR into `rebuild` (later `main`) with CI green.
