# Shared context for the rebuild helpers

You are one of three agents building parts of Kriyan in parallel, each in its own git worktree. The lead agent owns the backend and merges your branch. Read `AGENTS.md` at the repo root first; it is binding.

## What Kriyan is

A calm planner: it turns everything a person has to do into a plan for their time and helps them keep it. Tasks, nested spaces, repeating tasks (classes on Tue and Thu, the last day of each month, birthdays, every 2 days after done), any number of reminders, Markdown notes on tasks and spaces, goals, habits, and a heatmap of time done. Agents (Claude, ChatGPT, Cursor) plan with the person through MCP and the CLI. Feel: calm, focused, zen. Dark theme only.

## Where things are

- `docs/design/ux.md`: how the app works (screens, loop, reactions, states, keyboard). Read it.
- `docs/design/v3/`: the approved look, as static HTML that passes the Critly check. Open the `.html` files; `README.md` lists every decision. Match it closely: layout, copy, spacing, type, colour. It is the spec.
- `packages/core/src/`: shared logic. Import from the real file, e.g. `@kriyan/core/parse`, `@kriyan/core/repeat`, `@kriyan/core/format`, `@kriyan/core/tokens`, `@kriyan/core/ops`. Never reimplement anything that lives here; if something is missing, write it in core with a test, and say so in your report.
- `packages/convex/convex/`: the backend (read-only for you). Functions: `views.today|week|inbox|space|progress|spaces|task`, `tasks.add|addText|update|complete|undoComplete|reopen|remove|restore|move|settleProposals`, `organize.addSpace|updateSpace|archiveSpace|addHabit|updateHabit|checkHabit|addGoal|updateGoal`, `account.profile|ensureProfile|updateProfile|registerPush|tokens|createToken|revokeToken`. Read the files for exact args and return shapes; `model/views.ts` defines `TaskView`. Import the API as `import { api } from "@kriyan/convex/api"`.
- Agent HTTP API: `POST <CONVEX_SITE_URL>/api/v1/<op>` with `Authorization: Bearer kriyan_...` and a JSON body; `GET /api/v1` lists ops. Ops and their JSON schemas: `packages/core/src/ops.ts`. Responses are `{ "result": ... }` or `{ "error": "..." }` with status 400/401/404/500.

## Environment

- Your worktree was prepared with `bun run setup`. Run `bun run doctor` first. Env files (never print them): `apps/app/.env.local`, `apps/site/.env.local`, `packages/convex/.env.local`. Ports for your worktree are in `.env.ports`.
- The dev backend is the shared Convex dev deployment. Do not run `convex dev` or `convex deploy` against it. If you truly need a backend change, describe it precisely in your report instead.
- Clerk development instance `aware-glowworm-503`. To sign in while testing, sign up with an email ending `+clerk_test@example.com` (for example `kriyan.qa+clerk_test@example.com`) and a strong password; the verification code is always `424242`. Never use a real person's account.
- Windows machine, Git Bash and PowerShell available. Bun everywhere (`bun`, `bunx`), never npm or npx.

## How to work

- Use the `critly` skill for all UI work, plus the concepts it points to (for the Expo app, read every file under its `references/mobile/`). Values come only from `packages/core/src/tokens.ts`.
- Proof standard: done means you ran it and looked. Screenshot every screen you build at 390 and 1440 wide (Playwright is installed: `playwright-core`, Chromium at `C:/Users/kaust/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe`), look at each one, and fix what reads wrong. Keep the screenshots in `.artifacts/<your-area>/` (ignored by git) and list them in your report.
- Tests call code the way users do and assert exact results.
- Commit to your branch in small, working steps with clear messages ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push and do not merge; the lead does that.
- Stop only processes you started, by PID.

## Report

End with: what you built (by screen or command), how you verified it (commands run with their real last lines, screenshots taken), what is not done or not verified, and any backend or core changes you need from the lead.
