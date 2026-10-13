# Kriyan

A calm planner for time boxing. Put everything you have to do in one place, give it a time on your day, and keep the plan quiet enough to follow. The AI you already use (Claude, ChatGPT, Cursor and others) can plan with you.

[Open the web app](https://app.kriyan.app) · [Get it on Android](https://github.com/kausthubh-coder/kriyan/releases/latest/download/kriyan.apk) · [Docs](https://kriyan.app/docs)

## What it does

- **Today**: what's next, a timeline you drag tasks onto, anytime tasks and the free time left.
- **Tasks in one sentence**: `calculus lecture every tue and thu 9am for 1h30 #school/calculus` or `mum's birthday 16 oct every year remind day before at 20:00`.
- **Repeats**: chosen weekdays at a time and length, first or last day of the month, the nth weekday, yearly, every N days after done, until a date or N times.
- **Reminders**: as many as you like per task, on Android.
- **Spaces inside spaces**, each with Markdown notes.
- **Goals, habits** and a year-long activity heatmap.
- **Your AI**: an MCP server at `https://kriyan.app/mcp`, an HTTP API and a `kriyan` CLI. Agents can propose a plan that you accept or discard.

## Use it

- **Web**: [app.kriyan.app](https://app.kriyan.app).
- **Android**: download [kriyan.apk](https://github.com/kausthubh-coder/kriyan/releases/latest/download/kriyan.apk) from the latest [release](https://github.com/kausthubh-coder/kriyan/releases) (Android 7 or newer).
- **AI assistants**: add `https://kriyan.app/mcp` as a connector, or use a personal access token from Settings. [Setup guide](https://kriyan.app/docs/mcp).
- **Terminal**: `bun run kriyan login`, then `bun run kriyan today` from a checkout of this repo. [CLI guide](https://kriyan.app/docs/cli).

## Develop

Bun workspaces: an Expo app (Android and the web app), a Next.js site (landing, docs, MCP), a Convex backend and Clerk for sign-in.

| Where             | What                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `packages/core`   | Shared logic: dates, repeats, reminders, the quick-add parser, design tokens, the agent operations |
| `packages/convex` | The backend                                                                                        |
| `apps/app`        | Expo Router app for Android and the web                                                            |
| `apps/site`       | kriyan.app: landing, docs, `/mcp`                                                                  |
| `packages/cli`    | The `kriyan` command                                                                               |

```sh
bun install
bun run dev      # backend, web app and site
bun run check    # format, types, lint, tests
```

You need your own Convex project and Clerk application; put their values in `.env.local` files (`bun run doctor` lists what's missing). `AGENTS.md` is the guide for working in the repo, for people and coding agents alike.

## License

MIT
