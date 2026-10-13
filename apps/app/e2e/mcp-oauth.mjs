// The MCP sign-in a connector (Claude, ChatGPT) does: discover the authorization server from
// kriyan.app, register a client, sign in as the test account on Clerk's page, approve, trade
// the code for a token, then call the MCP server with it.
//   node apps/app/e2e/mcp-oauth.mjs [https://kriyan.app]
// The access token stays in memory.

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { EMAIL, PASSWORD, artifact, launch } from "./lib.mjs";

const SITE = (process.argv[2] ?? "https://kriyan.app").replace(/\/$/, "");
const REDIRECT = "http://127.0.0.1:8976/callback";
const b64url = (buf) => buf.toString("base64url");

const resource = await (await fetch(`${SITE}/.well-known/oauth-protected-resource/mcp`)).json();
const issuer = resource.authorization_servers[0];
const meta = await (await fetch(`${SITE}/.well-known/oauth-authorization-server`)).json();
console.log(`ok   discovery: ${resource.resource} signs in at ${issuer}`);

const client = await (
  await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Kriyan OAuth check",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  })
).json();
if (!client.client_id) throw new Error(`registration failed: ${JSON.stringify(client)}`);
console.log("ok   dynamic client registration");

const verifier = b64url(randomBytes(32));
const challenge = b64url(createHash("sha256").update(verifier).digest());
const state = b64url(randomBytes(12));
const authorize = new URL(meta.authorization_endpoint);
for (const [k, v] of Object.entries({
  response_type: "code",
  client_id: client.client_id,
  redirect_uri: REDIRECT,
  scope: "profile email offline_access",
  code_challenge: challenge,
  code_challenge_method: "S256",
  state,
  resource: resource.resource,
}))
  authorize.searchParams.set(k, v);

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.setDefaultTimeout(30000);
let callback = null;
// The callback arrives as a redirect, which routes don't intercept: read it from the request.
page.on("request", (req) => {
  if (req.url().startsWith(REDIRECT)) callback = new URL(req.url());
});
try {
  await page.goto(authorize.href);
  // Clerk's hosted sign-in, then (for a new client) the consent screen.
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page
    .getByRole("button", { name: /^continue$/i })
    .first()
    .click();
  await page
    .getByLabel(/^password/i)
    .first()
    .fill(PASSWORD);
  await page
    .getByRole("button", { name: /^continue$/i })
    .first()
    .click();
  for (let i = 0; i < 40 && !callback; i++) {
    const code = page.getByLabel(/code/i).first();
    if (await code.isVisible().catch(() => false)) {
      await code.fill("424242");
      await page.waitForTimeout(1500);
    }
    const allow = page.getByRole("button", { name: /^(allow|authorize|accept|approve)/i }).first();
    if (await allow.isVisible().catch(() => false)) await allow.click();
    await page.waitForTimeout(500);
  }
} catch (e) {
  await page.screenshot({ path: artifact("mcp-oauth-fail.png") });
  throw e;
}
if (!callback) {
  await page.screenshot({ path: artifact("mcp-oauth-fail.png") });
  throw new Error(`no redirect back; stopped at ${page.url()}`);
}
await browser.close();
if (callback.searchParams.get("state") !== state) throw new Error("state mismatch");
const code = callback.searchParams.get("code");
if (!code) throw new Error(`no code: ${callback.search}`);
console.log("ok   signed in on Clerk and approved; code returned");

const tokenRes = await fetch(meta.token_endpoint, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    client_id: client.client_id,
    code_verifier: verifier,
    resource: resource.resource,
  }),
});
const tokens = await tokenRes.json();
if (!tokens.access_token) throw new Error(`token exchange failed: ${tokenRes.status} ${tokens.error ?? ""}`);
console.log(`ok   token exchange (${tokens.refresh_token ? "with" : "without"} a refresh token)`);

const mcp = spawnSync("node", ["apps/site/scripts/mcp-e2e.mjs", `${SITE}/mcp`], {
  cwd: fileURLToPath(new URL("../../../", import.meta.url)),
  encoding: "utf8",
  env: { ...process.env, KRIYAN_TOKEN: tokens.access_token },
});
const tools = /tools \((\d+)\)/.exec(mcp.stdout)?.[1];
console.log(
  `${mcp.status === 0 ? "ok  " : "FAIL"} MCP with the OAuth token: ${tools ?? "?"} tools, read, add, delete`,
);
if (mcp.status !== 0) console.log(mcp.stderr.split("\n").slice(-5).join("\n"));
process.exit(mcp.status === 0 ? 0 : 1);
