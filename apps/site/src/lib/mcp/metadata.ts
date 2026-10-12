// OAuth discovery for /mcp (RFC 9728 protected resource metadata), pointing clients at Clerk.

import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";

export const METADATA_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

export function protectedResource(req: Request): Response {
  const origin = new URL(req.url).origin;
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey)
    return Response.json(
      { error: "This server has no NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, so it can't point to a sign-in server." },
      { status: 500, headers: METADATA_CORS },
    );
  const metadata = generateClerkProtectedResourceMetadata({
    publishableKey,
    resourceUrl: `${origin}/mcp`,
    properties: {
      resource_name: "Kriyan",
      resource_documentation: `${origin}/docs/mcp`,
      service_documentation: `${origin}/docs/mcp`,
      scopes_supported: ["openid", "profile", "email"],
      bearer_methods_supported: ["header"],
    },
  });
  return Response.json(metadata, {
    headers: { ...METADATA_CORS, "Cache-Control": "public, max-age=3600" },
  });
}
