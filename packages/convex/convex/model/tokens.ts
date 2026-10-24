// Personal access tokens for the CLI and MCP clients. The plain token is shown once;
// only its SHA-256 hash is stored.

import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { owned } from "./owner";

export const TOKEN_PREFIX = "kriyan_";

export async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${TOKEN_PREFIX}${base64}`;
}

export async function createToken(
  ctx: MutationCtx,
  ownerId: string,
  name: string,
): Promise<{ id: Id<"accessTokens">; token: string }> {
  const label = name.trim();
  if (!label) throw new ConvexError('Name the token after where you\'ll use it, like "Laptop CLI".');
  const existing = await ctx.db
    .query("accessTokens")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(51);
  if (existing.length >= 50) throw new ConvexError("You have 50 tokens. Revoke one you no longer use first.");
  const token = randomToken();
  const id = await ctx.db.insert("accessTokens", {
    ownerId,
    name: label.slice(0, 80),
    hash: await hashToken(token),
    hint: token.slice(0, TOKEN_PREFIX.length + 4),
  });
  return { id, token };
}

export async function revokeToken(ctx: MutationCtx, ownerId: string, id: Id<"accessTokens">): Promise<void> {
  const row = await ctx.db.get(id);
  owned(row, ownerId, "token");
  await ctx.db.delete(id);
}

export async function ownerForToken(
  ctx: QueryCtx,
  token: string,
): Promise<{ ownerId: string; id: Id<"accessTokens">; name: string } | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const hash = await hashToken(token);
  const match = await ctx.db
    .query("accessTokens")
    .withIndex("by_hash", (q) => q.eq("hash", hash))
    .unique();
  return match ? { ownerId: match.ownerId, id: match._id, name: match.name } : null;
}
