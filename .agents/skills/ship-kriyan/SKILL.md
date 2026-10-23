---
name: ship-kriyan
description: Take verified Kriyan work to production and leave main, the main checkout and the worktree list clean. Use only when I say ship, deploy, release, or merge and deploy.
---

# Ship Kriyan

Kriyan is a personal repo: work lands by fast-forwarding `main` with a direct push, with no PR. Run the commands in Bash from the worktree root.

## Rules

- Production needs my go in this conversation. "Ship" (or deploy, release, merge and deploy) is that go for every step below that the change needs, including the release when app code changed and the cleanup. Don't stop to ask between steps.
- When a step fails because of this change (a failing check, a deploy limit, a rejected push), fix it, rerun the checks and carry on. Stop and tell me only when the cause is outside the change or the fix needs my decision.
- Never end the turn while a build or deploy you started is queued or running: watch it to the end, then finish the steps after it. Two releases were lost to a turn that ended on a queued EAS build.
- Never force-push, skip a check, or raise a warning cap to get through.
- In a cloud session, steps that need my machine (see `## Cloud sessions` in AGENTS.md) are listed in the report as left for me, never skipped silently.

**Dry run.** When I ask for a dry run, walk every step and run the local checks. Print each push, deploy, release and publish command instead of running it.

## What a change needs

```
git fetch origin
git log --oneline origin/main..HEAD
git diff --name-only origin/main...HEAD
```

| Changed paths | Surfaces |
| --- | --- |
| `packages/convex/**` | Convex |
| `packages/core/**` | Every surface: core is bundled into each one |
| `apps/site/**` | Site |
| `apps/app/**` outside `e2e/` | Web app; Android at the next release |
| `packages/cli/**` | CLI |
| `docs/**`, `.agents/**`, `scripts/**`, tests only | Nothing beyond landing |

Android and the CLI are versioned releases. When the change touches app code (`apps/app/**` outside `e2e/`, or `packages/core/**`), the Android release is part of the ship; when it touches `packages/cli/**` or `packages/core/**`, so is the CLI release. There are no over-the-air updates, so phones only see app changes in a new APK. Tooling, docs and test-only changes need no release.

| Surface | Where | How it ships |
| --- | --- | --- |
| Convex | `prod:brave-sheep-245` (project `kriyan-app`) | `convex deploy`, by hand |
| Site, docs, MCP | kriyan.app (Vercel `kriyan`) | Vercel builds `main` on every push |
| Web app | app.kriyan.app (Vercel `kriyan-app`) | `export:prod`, then upload `dist/`, by hand |
| Android | GitHub release `android-v<version>` with `kriyan.apk` | EAS build, then `gh release` |
| CLI | npm package `kriyan` | `bun publish` from `packages/cli/dist` |

Production still signs in through the Clerk dev instance (`aware-glowworm-503`); the production instance is a separate job in `docs/ops.md`.

## 1. Ready

- `git status --short` prints nothing, and `git merge-base --is-ancestor origin/main HEAD` succeeds. If `main` moved, rebase onto `origin/main` and run the check again.
- `bun run check` passes (about 3.5 minutes).
- Every changed feature was driven with `verify-kriyan`, and its evidence is in `.artifacts/app/`.
- Write the rollback for each surface you are about to touch (section 8) into your reply before deploying.

## 2. Convex (first, so the frontends never call functions that don't exist yet)

Your worktree's `.env.local` points at its local backend. Name the project explicitly, then check the target before deploying:

```
cd packages/convex
CONVEX_DEPLOYMENT=dev:wry-parrot-108 bunx convex env list --prod | cut -d= -f1    # names only; expect CLERK_JWT_ISSUER_DOMAIN, KRIYAN_SERVICE_SECRET
CONVEX_DEPLOYMENT=dev:wry-parrot-108 bunx convex deploy --message "$(git rev-parse --short HEAD)"
```

`convex deploy` goes to the project's production deployment. The output must name `brave-sheep-245`; if it names anything else, stop. A schema change that drops a field needs a migration first (`convex-migrate` skill).

## 3. Land

```
git push origin HEAD:main
```

This fast-forwards `main`. If the push is rejected, go back to step 1. CI runs on the push; wait for it, up to 20 minutes:

```
gh run watch $(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
```

The push also deploys the site. Watch the Production deployment for the pushed commit, up to 10 minutes:

```
gh api "repos/kausthubh-coder/kriyan/deployments?environment=Production&sha=$(git rev-parse HEAD)" --jq '.[0].id'
gh api repos/kausthubh-coder/kriyan/deployments/<id>/statuses --jq '.[0].state'    # success
```

## 4. Web app

```
cd apps/app && bun run export:prod
cd dist && VERCEL_ORG_ID=team_eG2BEkfqMmQSwwGiTPzlC622 VERCEL_PROJECT_ID=prj_8r2dRZB1VO7kmAIsSG2k7NelflKK bunx vercel deploy --prod
```

`export:prod` takes values from `~/.kriyan/prod-env/app.env` and refuses a bundle that names a dev backend. Never run `vercel link` here: the project must stay off GitHub (see `docs/ops.md`).

## 5. Android release

1. In `apps/app/app.json`, raise `expo.version` and `android.versionCode` above the last release (`gh release list`). Commit, then land as in step 3.
2. Build on EAS. The free queue can take an hour; `--wait` keeps the command attached until the build ends, and the turn must not end before it does. If 90 minutes pass, keep watching with `build:list` below rather than leaving it queued:
   ```
   cd apps/app
   bunx eas-cli@18 build --platform android --profile production --non-interactive --wait
   ```
   Plain `bunx eas-cli` (latest) currently fails to start; keep the `@18`. If a finished build for this commit already exists (`bunx eas-cli@18 build:list --platform android --limit 3 --json --non-interactive`), use it.
3. Download the build's `artifacts.buildUrl` as `kriyan.apk` and copy it to `kriyan-<version>.apk`. Install it on the emulator (`adb install -r kriyan.apk`) and check it opens and signs in against production.
4. Release it. The site's "Get it on Android" link is `releases/latest/download/kriyan.apk`, so every release attaches a file named exactly `kriyan.apk`:
   ```
   gh release create android-v<version> kriyan.apk kriyan-<version>.apk --target $(git rev-parse HEAD) --title "Kriyan Android <version>" --notes-file <notes> --latest
   ```
   Follow the notes of `android-v1.0.1`: install steps, minimum Android 7, SHA-256, size, the source commit and the version code.

## 6. CLI

1. Raise `version` in `packages/cli/package.json`. Commit, then land as in step 3.
2. Build and check what would go out:
   ```
   bun run --filter @kriyan/cli build                 # writes packages/cli/dist, package name "kriyan"
   cd packages/cli/dist && node kriyan.js --version && bun publish --dry-run
   ```
3. `bun publish --access public` from `packages/cli/dist`. It uses the token in `~/.npmrc`.
4. After the first publish, switch the lines that say to run from a copy of the code to the npm form (`npx kriyan login`, `npm i -g kriyan`): `CLI_LINE` in `apps/app/src/features/settings/SettingsScreen.tsx`, the Install, Sign in and Examples steps of `apps/site/src/app/docs/cli/page.tsx`, and the Terminal line in `README.md`. `packages/cli/README.md` is the npm page and already uses `npx`.

The CLI ships on npm as `kriyan` (decided 2026-10-13; the name was free that day, so the first publish claims it). Install docs say `npm i -g kriyan`. The unmerged `release-2.0` branch documents an older plan, a `kriyan-cli.tgz` on each release. Change its docs to npm before merging it, or drop it.

## 7. Check production (read-only)

- Convex: `curl -s https://brave-sheep-245.convex.site/api/v1 | head -c 200` lists the operations, including any you added.
- Site: `curl -sI https://kriyan.app` is 200, and the changed page shows the change. `curl -s https://kriyan.app/.well-known/oauth-authorization-server` answers 200.
- Web app: the entry bundle on https://app.kriyan.app names `brave-sheep-245` and no `wry-parrot-108` or `127.0.0.1`.
- Android: `curl -sIL https://github.com/kausthubh-coder/kriyan/releases/latest/download/kriyan.apk | grep -i content-length | tail -1` matches the new APK's size.
- CLI: `bun pm view kriyan version` prints the new version.
- End to end, when I agree: `verify-kriyan` lists `prod-smoke.mjs` and `mcp-oauth.mjs`. They add a token and a task as the test account and remove them again.

## 8. Rollback

- Convex: deploy the previous `main` commit from a detached worktree (`git worktree add --detach <tmp> <sha>`, `bun run setup`, then step 2 there). If the schema changed, check that the old schema still accepts the data.
- Site: `VERCEL_ORG_ID=team_eG2BEkfqMmQSwwGiTPzlC622 VERCEL_PROJECT_ID=prj_Kg8o433KDfnG3tkvtdfFej7ZkZy6 bunx vercel rollback`. Later git pushes don't go live until you `vercel promote` one.
- Web app: the same with `VERCEL_PROJECT_ID=prj_8r2dRZB1VO7kmAIsSG2k7NelflKK`.
- Android: `gh release edit android-v<previous> --latest` points the download link back.
- CLI: `bun publish` the previous version with a higher patch number. npm won't take a version twice.

## 9. Update the main checkout

The main checkout is `C:\Users\kaust\OneDrive\Documents\dev\kriyan`.

- If `git -C <main> status --short` is empty and it is on `main`: run `git -C <main> pull --ff-only`, then `bun run setup` there.
- If it's dirty or on another branch, leave it and tell me.

## 10. Clean up

- If you pushed your branch, delete it on the remote with `git push origin --delete <branch>`.
- Remove other worktrees whose branches are now in `main` (`git branch --merged origin/main`), but only those no live thread uses (`t3_thread_list`). Use `git worktree remove <path>`, then `git branch -d <branch>`. Leave the worktree this thread runs in; tell me it can be archived.

## 11. Report

A few lines: what shipped (commits) and to which surfaces, the production checks and what they showed, what's waiting for the next release, and anything skipped or left behind.
