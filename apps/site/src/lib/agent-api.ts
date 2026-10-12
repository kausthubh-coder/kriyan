// Calls the Convex agent API: POST <NEXT_PUBLIC_CONVEX_SITE_URL>/api/v1/<op> with a JSON body.
// Replies are { result } or { error } (400, 401, 404, 500). See packages/convex/convex/http.ts.

export type OpReply = { ok: true; result: unknown } | { ok: false; status: number; error: string };

export function convexSiteUrl(): string | null {
  return process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, "") || null;
}

export async function callOp(op: string, input: unknown, headers: Record<string, string>): Promise<OpReply> {
  const base = convexSiteUrl();
  if (!base) return { ok: false, status: 500, error: "This server has no NEXT_PUBLIC_CONVEX_SITE_URL set." };
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/${encodeURIComponent(op)}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(input ?? {}),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 502, error: "Couldn't reach Kriyan. Try again in a moment." };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Handled below: a reply without JSON is an error whatever its status.
  }
  const reply = (body ?? {}) as { result?: unknown; error?: unknown };
  if (res.ok && "result" in reply) return { ok: true, result: reply.result };
  const error =
    typeof reply.error === "string" ? reply.error : `Kriyan answered ${res.status} without a reply. Try again.`;
  return { ok: false, status: res.status, error };
}
