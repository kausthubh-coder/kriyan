// The hosted MCP server, streamable HTTP, at https://kriyan.app/mcp.

import { authenticate } from "@/lib/mcp/auth";
import { mcpHandler } from "@/lib/mcp/server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function handle(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin;
  // Someone opened the address in a browser: show them how to connect instead of a JSON error.
  if (req.method === "GET" && req.headers.get("accept")?.includes("text/html") && !req.headers.get("authorization"))
    return Response.redirect(`${origin}/docs/mcp`, 302);

  const auth = await authenticate(req, origin);
  if (!auth.ok) return withCors(auth.response);
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const res = await mcpHandler.fetch(req, {
    authInfo: {
      token,
      clientId: auth.caller.clientId ?? "personal-access-token",
      scopes: [],
      extra: { caller: auth.caller },
    },
  });
  return withCors(res);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
