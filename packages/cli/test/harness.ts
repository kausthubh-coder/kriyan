// A fake Kriyan agent API (same routes, auth and reply shapes as packages/convex/convex/http.ts)
// and a runner that starts the real `kriyan` process against it.

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NOW, TOKEN } from "./fixtures.ts";

export interface Request {
  op: string;
  auth: string | undefined;
  body: Record<string, unknown>;
}

type Handler = (body: Record<string, unknown>) => { status?: number; result?: unknown; error?: string };

export class FakeApi {
  readonly requests: Request[] = [];
  private server: Server | undefined;
  url = "";

  constructor(private readonly handlers: Record<string, Handler>) {}

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let text = "";
      req.on("data", (c) => (text += String(c)));
      req.on("end", () => {
        const reply = (status: number, body: unknown) => {
          res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(body));
        };
        const op = (req.url ?? "").replace(/^\/api\/v1\//, "");
        const body = text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
        this.requests.push({ op, auth: req.headers.authorization, body });
        const handler = this.handlers[op];
        if (req.method !== "POST" || !handler)
          return reply(404, { error: `There's no operation called "${op}". GET /api/v1 lists them.` });
        if (req.headers.authorization !== `Bearer ${TOKEN}`)
          return reply(401, {
            error: "Send a personal access token: Authorization: Bearer kriyan_... Create one in Settings.",
          });
        const out = handler(body);
        if (out.error) return reply(out.status ?? 400, { error: out.error });
        reply(200, { result: out.result ?? null });
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    this.url = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  ops(): string[] {
    return this.requests.map((r) => r.op);
  }
}

export interface Result {
  code: number | null;
  stdout: string;
  stderr: string;
}

const MAIN = join(import.meta.dirname, "..", "src", "main.ts");

export function tempConfigDir(): string {
  return mkdtempSync(join(tmpdir(), "kriyan-cli-test-"));
}

/** Runs `kriyan <args>` as its own process, the way a person's shell would. */
export function kriyan(
  args: string[],
  options: { env?: Record<string, string | undefined>; stdin?: string } = {},
): Promise<Result> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...process.env, KRIYAN_NOW: NOW, ...options.env }))
    if (v !== undefined && k !== "NO_COLOR" && k !== "FORCE_COLOR") env[k] = v;
  return new Promise((resolve, reject) => {
    const child = spawn("bun", [MAIN, ...args], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += String(c)));
    child.stderr.on("data", (c) => (stderr += String(c)));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(options.stdin ?? "");
  });
}
