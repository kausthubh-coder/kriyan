// The agent HTTP API: POST <base>/api/v1/<op> with a bearer token and a JSON body.
// Replies are { result } or { error }.

export const DEFAULT_API_URL = "https://kriyan.app";

/** Kriyan answered and said no. Its message is shown as is. Exit code 1. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Kriyan couldn't be reached or didn't answer like Kriyan. Exit code 2. */
export class NetworkError extends Error {}

export interface Client {
  base: string;
  call<T>(op: string, input?: Record<string, unknown>): Promise<T>;
}

export function client(base: string, token: string, userAgent: string): Client {
  const root = base.replace(/\/+$/, "");
  return {
    base: root,
    async call<T>(op: string, input: Record<string, unknown> = {}): Promise<T> {
      const url = `${root}/api/v1/${op}`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "user-agent": userAgent,
          },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        const reason =
          error instanceof Error
            ? error.cause instanceof Error
              ? error.cause.message
              : error.message
            : String(error);
        throw new NetworkError(
          `Couldn't reach ${root} (${reason}). Check your connection, or KRIYAN_API_URL.`,
        );
      }
      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string")
        throw new ApiError(body.error, res.status);
      if (res.ok && body && typeof body === "object" && "result" in body) return body.result as T;
      throw new NetworkError(
        `${root} answered ${res.status} without a Kriyan reply. Check KRIYAN_API_URL points at Kriyan.`,
      );
    },
  };
}
