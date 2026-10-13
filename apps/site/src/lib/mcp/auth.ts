// Who is calling /mcp, and how to call the agent API as them. In this order:
//  1. Authorization: Bearer kriyan_...  a personal access token from Settings, forwarded unchanged.
//  2. A Clerk OAuth access token (ChatGPT and Claude connectors). Verified with Clerk, then the
//     agent API is called with the service secret and the verified user id (x-kriyan-user).

import { verifyClerkToken } from "@clerk/mcp-tools/server";

export interface Caller {
  kind: "token" | "oauth";
  /** Headers for the agent API call. */
  headers: Record<string, string>;
  /** The Clerk OAuth client, for oauth callers. */
  clientId?: string;
}

export type AuthResult = { ok: true; caller: Caller } | { ok: false; response: Response };

const PAT = /^kriyan_[A-Za-z0-9_-]+$/;

export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/mcp`;
}

/** True when this server can verify Clerk OAuth tokens and act for the verified user. */
export function oauthConfigured(): boolean {
  return Boolean(
    process.env.CLERK_SECRET_KEY &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.KRIYAN_SERVICE_SECRET,
  );
}

/** Header parameter values are quoted strings; drop anything that would end the quote early. */
const quote = (s: string) => s.replace(/["\\]/g, "");

export function unauthorized(origin: string, error?: { code: string; description: string }): Response {
  const params = [
    error && `error="${error.code}"`,
    error && `error_description="${quote(error.description)}"`,
    `resource_metadata="${resourceMetadataUrl(origin)}"`,
  ].filter(Boolean);
  const message =
    error?.description ??
    "Sign in to Kriyan, or send a personal access token from Settings: Authorization: Bearer kriyan_...";
  return Response.json(
    { error: error?.code ?? "unauthorized", error_description: message },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer ${params.join(", ")}`,
        "Access-Control-Expose-Headers": "WWW-Authenticate",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function authenticate(req: Request, origin: string): Promise<AuthResult> {
  const header = req.headers.get("authorization");
  const match = header ? /^Bearer\s+(\S+)\s*$/i.exec(header) : null;
  const token = match?.[1];
  if (!token) return { ok: false, response: unauthorized(origin) };

  if (token.startsWith("kriyan_")) {
    if (!PAT.test(token))
      return {
        ok: false,
        response: unauthorized(origin, {
          code: "invalid_token",
          description: "That isn't a Kriyan access token. Copy it again from Settings.",
        }),
      };
    return { ok: true, caller: { kind: "token", headers: { authorization: `Bearer ${token}` } } };
  }

  if (!oauthConfigured())
    return {
      ok: false,
      response: unauthorized(origin, {
        code: "invalid_token",
        description:
          "Signing in through this server isn't set up yet. Use a personal access token from Settings: Authorization: Bearer kriyan_...",
      }),
    };

  const userId = await verifyOAuthToken(req, token);
  if (!userId.ok)
    return {
      ok: false,
      response: unauthorized(origin, {
        code: "invalid_token",
        description: "This sign-in has expired or isn't valid. Connect Kriyan again.",
      }),
    };
  return {
    ok: true,
    caller: {
      kind: "oauth",
      clientId: userId.clientId,
      headers: {
        authorization: `Bearer ${process.env.KRIYAN_SERVICE_SECRET}`,
        "x-kriyan-user": userId.userId,
      },
    },
  };
}

async function verifyOAuthToken(
  req: Request,
  token: string,
): Promise<{ ok: true; userId: string; clientId: string } | { ok: false }> {
  try {
    // Loaded only when Clerk is configured, so the token path works without Clerk's keys.
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const state = await client.authenticateRequest(req, { acceptsToken: "oauth_token" });
    const info = verifyClerkToken(state.toAuth(), token);
    const userId = info?.extra?.userId;
    if (!info || typeof userId !== "string") return { ok: false };
    return { ok: true, userId, clientId: info.clientId };
  } catch (error) {
    console.error("Clerk OAuth verification failed:", error instanceof Error ? error.message : error);
    return { ok: false };
  }
}
