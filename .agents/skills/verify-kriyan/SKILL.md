---
name: verify-kriyan
description: Drive Kriyan the way a person does and capture proof. Use to prove a change works in the web app, the Android app, reminders, the agent API, the CLI or the MCP server, or to sign in as the test account and seed a known plan.
---

# Verify Kriyan

Proof means a real user path on the running app, with the action and the resulting state captured. Read `features/README.md`, then the feature file for what you're proving; it lists every entry point and what done looks like.

## Launch

From the checkout root (the `rebuild` worktree or any checkout of it):

```
bun run setup                                   # once: deps, env files, ports in .env.ports
bun run dev > .artifacts/dev.log 2>&1           # run in the background; it lives until you stop it
```

`bun run dev` starts `convex dev` (the dev deployment, shared by every checkout), the app on the web at `PORT_APP` and the site at `PORT_SITE`. Ready when `.artifacts/dev.log` holds `Waiting on http://localhost:<PORT_APP>`, `Ready` from the site and `Convex functions ready`. The first page load bundles for about 30 seconds.

Android, only when the feature needs it: start the emulator detached so it outlives your command, and keep its PID.

```
$env:ANDROID_HOME = "C:\Users\kaust\scoop\apps\android-clt\current"   # PowerShell
$p = Start-Process "$env:ANDROID_HOME\emulator\emulator.exe" -ArgumentList "-avd","kriyan","-no-window","-no-audio","-no-boot-anim","-gpu","swiftshader_indirect","-no-snapshot-save" -WindowStyle Hidden -PassThru
$p.Id | Out-File -Encoding ascii "$HOME\.kriyan\emulator.pid"
```

Booted when `adb shell getprop sys.boot_completed` prints `1` (two to four minutes). Then open the dev build on this checkout's Metro, as in `features/android.md`.

## Doctor

```
node .agents/skills/verify-kriyan/doctor.mjs
```

Read-only. It checks the deployment is dev, the app, site and Convex are up, there's a saved sign-in and seeded user, and whether the emulator and dev build are there. Run it first, and again whenever something looks off. `FAIL` lines block; `warn` lines matter only for the surface they name.

## Drive

Every run starts from a known plan:

```
node apps/app/e2e/seed.mjs          # signs in, resets the test account, seeds 7 spaces and 9 tasks dated from today
```

The test account is `kriyan.app.qa+clerk_test@example.com` on the dev Clerk instance; `+clerk_test` addresses take the code `424242`. `apps/app/e2e/lib.mjs` signs in through the real sign-in screen and saves the session to `.artifacts/app/auth-state.json`.

| Surface | Harness |
| --- | --- |
| Web app | Playwright scripts in `apps/app/e2e/` on `lib.mjs`: `launch()`, `signedInContext(browser, viewport)`, `settle(page)`, `artifact(name)`. Handles are ARIA roles and names (`getByRole("checkbox", { name: "Complete: Run" })`). |
| Android | `bash apps/app/e2e/adb.sh shot <name>`, `ui` (visible labels with bounds), `tap x y`, `text "..."`, `key CODE`, `swipe`. Tap from the bounds `ui` prints. |
| Agent API | `node apps/app/e2e/api.mjs <op> ['<json>']` as the test account, or a personal access token from Settings for the real path. |
| CLI | `KRIYAN_TOKEN=kriyan_... KRIYAN_API_URL=<CONVEX_SITE_URL> bun run kriyan <command>` |
| MCP | `KRIYAN_TOKEN=kriyan_... node apps/site/scripts/mcp-e2e.mjs http://localhost:<PORT_SITE>/mcp` |

`api.mjs` signs with the dev service secret and refuses any deployment that isn't `dev:`. Use it to arrange state; prove the feature itself through the surface a person uses.

`node apps/app/e2e/walkthrough.mjs` runs the main desktop flows (after `seed.mjs`) and prints `ok` or `FAIL` per step with a screenshot of each failure.

## Isolation

One dev deployment and one test account serve every checkout. Two runs at once reset each other's data: before seeding, check no other session is driving (another `bun run dev` on different ports is the sign). Port clashes are handled by `.env.ports`; the emulator is one per machine.

## Evidence

Artifacts go to `.artifacts/app/` (gitignored, kept across runs). For each proof capture:

- the action and the state after it: a screenshot before and after, or an ARIA snapshot (`page.locator("body").ariaSnapshot()`);
- the side effect from a second view: reload, read it through `api.mjs`, or see it on the other platform;
- for Android reminders, the notification record: `bash apps/app/e2e/adb.sh shell dumpsys notification --noredact`, saved to a file.

Name artifacts after the feature (`reminders-android-shade.png`) and report the paths. A step you could not run is reported as skipped with the reason, never as passed through a different path.

## Cleanup

- Stop what you started, by PID: the `bun run dev` background task, and the emulator from `~/.kriyan/emulator.pid` (`Stop-Process -Id (Get-Content $HOME\.kriyan\emulator.pid)`). Never stop processes by name.
- Leave the seeded data; the next run's `seed.mjs` resets it. `node apps/app/e2e/seed.mjs --reset` empties the account if you need it empty.
- Keep `.artifacts/app/`: it holds the proof.
