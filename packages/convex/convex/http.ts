// The agent API: POST /api/v1/<operation> with a JSON body, for the CLI and MCP.
// Auth is either a personal access token (Authorization: Bearer kriyan_...) or, from the
// Kriyan site's MCP server, the service secret plus the Clerk user id it verified.

import { httpRouter } from "convex/server";
import { ConvexError, v } from "convex/values";
import { todayIn } from "@kriyan/core/dates";
import { findOp, OPS } from "@kriyan/core/ops";
import { internal } from "./_generated/api";
import type { FunctionReference } from "convex/server";
import { env, httpAction, internalMutation, internalQuery } from "./_generated/server";
import { ownerForToken } from "./model/tokens";

export const tokenOwner = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => ownerForToken(ctx, token),
});

export const touchToken = internalMutation({
  args: { id: v.id("accessTokens") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    // Write at most once an hour.
    if (row && (row.lastUsedAt ?? 0) < Date.now() - 3_600_000)
      await ctx.db.patch(id, { lastUsedAt: Date.now() });
  },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/** Compares digests, so how long it takes says nothing about how much of the secret matched. */
async function sameSecret(given: string, secret: string): Promise<boolean> {
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(given), digest(secret)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

const CLERK_USER = /^user_[A-Za-z0-9]+$/;

/**
 * A validator failure names the bad field and value, which the agent needs to fix its call. The
 * backend also echoes the whole request ("Object: {...}", owner id included); that stays here.
 */
export function validatorMessage(message: string): string | null {
  if (
    !/ArgumentValidationError|Validator error|Object contains extra field|Value does not match/.test(message)
  )
    return null;
  const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(Object|Validator):/.test(line));
  return lines.slice(0, 3).join(" ").slice(0, 500);
}

async function authenticate(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  req: Request,
): Promise<string | null> {
  const bearer = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!bearer) return null;
  const secret = env.KRIYAN_SERVICE_SECRET;
  const user = req.headers.get("x-kriyan-user");
  const issuer = env.CLERK_JWT_ISSUER_DOMAIN;
  if (secret && issuer && user && (await sameSecret(bearer, secret)))
    return CLERK_USER.test(user) ? `${issuer}|${user}` : null;
  const found = await ctx.runQuery(internal.http.tokenOwner, { token: bearer });
  if (!found) return null;
  await ctx.runMutation(internal.http.touchToken, { id: found.id });
  return found.ownerId;
}

type AnyRef = FunctionReference<"query" | "mutation", "internal">;
const refs = internal.agent as unknown as Record<string, AnyRef>;

const http = httpRouter();

http.route({
  path: "/api/v1",
  method: "GET",
  handler: httpAction(async () => json(200, { operations: OPS })),
});

http.route({
  pathPrefix: "/api/v1/",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const name = new URL(req.url).pathname.slice("/api/v1/".length);
    const op = findOp(name);
    const ref = refs[name];
    if (!op || !ref)
      return json(404, { error: `There's no operation called "${name}". GET /api/v1 lists them.` });
    const ownerId = await authenticate(ctx, req);
    if (!ownerId)
      return json(401, {
        // A token that was sent and failed is most often a revoked one, not a missing one.
        error: req.headers.get("authorization")
          ? "That token doesn't work: it may have been revoked or mistyped. Create a new one in Settings."
          : "Send a personal access token: Authorization: Bearer kriyan_... Create one in Settings.",
      });
    let input: unknown = {};
    const text = await req.text();
    if (text.trim()) {
      try {
        input = JSON.parse(text);
      } catch {
        return json(400, { error: "The body must be JSON." });
      }
    }
    if (typeof input !== "object" || input === null || Array.isArray(input))
      return json(400, { error: "The body must be a JSON object." });
    try {
      const args: Record<string, unknown> = { ...(input as Record<string, unknown>), ownerId };
      let result: unknown;
      if (op.kind === "read") {
        const zone = await ctx.runQuery(internal.agent.timeZone, { ownerId });
        result = await ctx.runQuery(ref as FunctionReference<"query", "internal">, {
          ...args,
          today: todayIn(zone),
        });
      } else {
        result = await ctx.runMutation(ref as FunctionReference<"mutation", "internal">, args);
      }
      return json(200, { result: result ?? null });
    } catch (error) {
      if (error instanceof ConvexError) return json(400, { error: String(error.data) });
      const message = error instanceof Error ? error.message : String(error);
      const invalid = validatorMessage(message);
      if (invalid) return json(400, { error: invalid });
      console.error(message);
      return json(500, { error: "Something failed on our side. Try again; if it keeps failing, report it." });
    }
  }),
});

export default http;
