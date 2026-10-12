// Older MCP clients (2025-03-26) look for the authorization server's metadata on the resource's
// origin. Pass Clerk's through.
import { fetchClerkAuthorizationServerMetadata } from "@clerk/mcp-tools/server";
import { METADATA_CORS } from "@/lib/mcp/metadata";

export async function GET(req: Request): Promise<Response> {
  void req.url; // Read per request, never prerendered: the document belongs to the Clerk instance in use.
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey)
    return Response.json({ error: "No sign-in server is configured." }, { status: 500, headers: METADATA_CORS });
  try {
    const metadata = await fetchClerkAuthorizationServerMetadata({ publishableKey });
    return Response.json(metadata, { headers: { ...METADATA_CORS, "Cache-Control": "public, max-age=3600" } });
  } catch {
    return Response.json({ error: "Couldn't reach the sign-in server." }, { status: 502, headers: METADATA_CORS });
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: METADATA_CORS });
}
