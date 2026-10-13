import { METADATA_CORS, protectedResource } from "@/lib/mcp/metadata";

export const GET = protectedResource;

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: METADATA_CORS });
}
