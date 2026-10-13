# Production

Where each piece runs and what it needs. The ship and rollback commands are in the `ship-kriyan` skill; run them only with my explicit go.

## Where things run

| Piece                     | Where                                                                          | Name                                                                           |
| ------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Backend                   | Convex project `kriyan-app`                                                    | dev `wry-parrot-108`, prod `brave-sheep-245`                                   |
| Agent API                 | `https://brave-sheep-245.convex.site/api/v1`, also `https://kriyan.app/api/v1` |                                                                                |
| Site (landing, docs, MCP) | Vercel project `kriyan`                                                        | kriyan.app                                                                     |
| Web app                   | Vercel project `kriyan-app`                                                    | app.kriyan.app                                                                 |
| Android                   | EAS builds, APK on GitHub Releases                                             | package `app.kriyan`                                                           |
| Sign-in                   | Clerk application `kriyan`                                                     | dev instance `aware-glowworm-503`; production instance on kriyan.app (pending) |

## Backend

Worktrees each run their own local backend; `wry-parrot-108` is no longer used for development. `ship-kriyan` deploys to `brave-sheep-245` with `CONVEX_DEPLOYMENT=dev:wry-parrot-108 bunx convex deploy`, which names the project; a worktree's own `.env.local` points at its local backend.

Production environment variables: `CLERK_JWT_ISSUER_DOMAIN` (the production Clerk issuer once it exists; the dev issuer until then) and `KRIYAN_SERVICE_SECRET` (shared with the site; a copy lives in `~/.kriyan/prod-env/site.env`).

## Site and web app

Site production env lives on Vercel: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `KRIYAN_SERVICE_SECRET`.

The web app is built here and uploaded as static files, so its values are baked in at build time from `~/.kriyan/prod-env/app.env` (`EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`). Build it only with `export:prod`: a plain `expo export` reads `apps/app/.env.local` and ships the dev backend.

The site builds from `main` on every push (Vercel's GitHub integration). The web app is uploaded by hand from `apps/app/dist`, with `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` naming `kriyan-app`, so a fresh worktree needs no `.vercel` link.

Check after a deploy: the live entry bundle names the production Convex host (`brave-sheep-245`) and no dev host.

`kriyan-app` is deliberately not connected to GitHub: a git build has no `app.env` and would publish the repo root. If Vercel reconnects it (`vercel link` can), remove the link in the project's Git settings.

## Android

EAS builds an APK with the `production` profile (`apps/app/eas.json`); it goes on a GitHub release as `kriyan.apk`, which the site's download link expects.

## CLI

Published to npm as `kriyan` from `packages/cli/dist` (`bun run --filter @kriyan/cli build`).

## Clerk production

Create the production instance for kriyan.app, add the DNS records Clerk lists (kriyan.app's DNS is on Vercel: `bunx vercel dns add kriyan.app <name> CNAME <value>`), enable email code and Google, then switch every production variable above to the `pk_live_` / `sk_live_` keys and the production issuer, and redeploy all three pieces.
