# Production

Every command here changes something people use. Run them only with my explicit go.

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

```
cd packages/convex
bunx convex env list --prod          # names only; never paste values anywhere
bunx convex deploy                   # pushes functions and schema to production
```

Production environment variables: `CLERK_JWT_ISSUER_DOMAIN` (the production Clerk issuer once it exists; the dev issuer until then) and `KRIYAN_SERVICE_SECRET` (shared with the site; a copy lives in `~/.kriyan/prod-env/site.env`).

## Site and web app

Production env on Vercel, per project: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `KRIYAN_SERVICE_SECRET` (site); `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (app).

```
bunx vercel deploy --prod --cwd apps/site
bunx vercel deploy --prod --cwd apps/app/dist   # after `bunx expo export --platform web` in apps/app
```

## Android

```
cd apps/app
bunx eas-cli build --platform android --profile preview   # an APK to attach to a GitHub release
```

## Clerk production

Create the production instance for kriyan.app, add the DNS records Clerk lists (kriyan.app's DNS is on Vercel: `bunx vercel dns add kriyan.app <name> CNAME <value>`), enable email code and Google, then switch every production variable above to the `pk_live_` / `sk_live_` keys and the production issuer, and redeploy all three pieces.
