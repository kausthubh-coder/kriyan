// Clients that probe the origin before the path-specific document get the same answer.
import { METADATA_CORS, protectedResource } from "@/lib/mcp/metadata";

export const GET = protectedResource;

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: METADATA_CORS });
}
