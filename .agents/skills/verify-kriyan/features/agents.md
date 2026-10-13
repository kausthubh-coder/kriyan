# Agents

A person connects their AI to Kriyan with a personal access token (or OAuth on the hosted MCP). Agents read the plan, add and change tasks, and can propose blocks the person accepts or discards on Upcoming.

## Sub-features

- `agents-token` create a token in Settings, see it once, copy it, revoke it.
- `agents-api` `GET /api/v1` lists the operations; `POST /api/v1/<op>` with `Authorization: Bearer kriyan_...`.
- `agents-cli` the `kriyan` CLI over the same API.
- `agents-mcp` the MCP server at `/mcp` on the site: tools, a read, a write.
- `agents-oauth` a connector signs in through Clerk (dynamic registration, consent) and calls MCP with the OAuth token.
- `agents-proposals` `propose_plan` puts blocks on Upcoming behind a `Claude proposed N blocks` banner with `Accept all` and `Discard`.

## How to get to it (user POV)

- Settings: `Token name`, `Create token`, `Copy the token`, `I've copied it`, `Revoke <name>`.
- Their AI client pointed at `https://kriyan.app/mcp` (locally `http://localhost:<PORT_SITE>/mcp`).
- `kriyan login`, then `kriyan today`, `kriyan add "<sentence>"`, `kriyan done <task>`; `kriyan --help` lists the rest.

## Driving it with Playwright, the CLI and the MCP client

Preconditions: baseline seed; `bun run dev` serving the site.

- **Token.** In Settings fill `Token name`, click `Create token`, then `Copy the token`; read it with `page.evaluate(() => navigator.clipboard.readText())` after `ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE })`. It starts with `kriyan_`. Keep it in a variable only.
- **API.** `fetch(<CONVEX_SITE_URL>/api/v1/get_today, { method: "POST", headers: { authorization: "Bearer " + token } })` returns `{ result: { ... } }` with the seeded tasks; without the header it returns 401.
- **CLI.** `KRIYAN_TOKEN=<token> KRIYAN_API_URL=<CONVEX_SITE_URL> bun run kriyan today` lists today's plan; `... bun run kriyan done Run` prints `Done "Run". Next: <day>.`
- **MCP.** `KRIYAN_TOKEN=<token> node apps/site/scripts/mcp-e2e.mjs http://localhost:<PORT_SITE>/mcp` connects, lists the tools, reads today, adds a task and deletes it; run it again with `legacy` as the second argument for older clients.
- **Proposals.** `node apps/app/e2e/proposals.mjs` creates a token, proposes two blocks through the API, accepts them on Upcoming, proposes again, discards, and revokes the token.
- **Proof.** The command outputs with exit codes, the Upcoming banner screenshot, and the plan after a reload.
- **Revoke.** Click `Revoke <name>` at the end; the same token then gets 401.

## Gotchas

- Never print, log or screenshot a token; screenshots of Settings are taken before `Create token` or after `I've copied it`.
- `api.mjs` uses the service secret, a test shortcut. A proof of `agents-api` uses a personal access token.
- OAuth for MCP runs on whichever Clerk instance the site's keys name (dynamic client registration is on). Prove it with `node apps/app/e2e/mcp-oauth.mjs`; Playwright routes miss the final redirect, so the script reads the callback from the request event.
