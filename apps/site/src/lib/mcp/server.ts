// The Kriyan MCP server: one tool per operation in @kriyan/core/ops, each forwarded to the agent API.
// A fresh server is built per request (the transport is stateless), bound to the authenticated caller.

import {
  createMcpHandler,
  fromJsonSchema,
  McpServer,
  type CallToolResult,
} from "@modelcontextprotocol/server";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";
import { OPS } from "@kriyan/core/ops";
import { callOp } from "@/lib/agent-api";
import type { Caller } from "./auth";
import { INSTRUCTIONS } from "./instructions";

type JsonSchema = Parameters<typeof fromJsonSchema>[0];
type Validator = NonNullable<Parameters<typeof fromJsonSchema>[1]>;

const ajv = new AjvJsonSchemaValidator();

/**
 * Ajv says "data must NOT have additional properties" without naming them, so an agent that
 * sends `due` instead of `deadline` can't tell what to fix. This names the fields it doesn't take.
 */
const namingValidator: Validator = {
  getValidator<T>(schema: JsonSchema) {
    const check = ajv.getValidator<T>(schema);
    const known = Object.keys((schema as { properties?: object }).properties ?? {});
    return (input: unknown) => {
      const result = check(input);
      if (result.valid || !input || typeof input !== "object") return result;
      const extra = Object.keys(input).filter((key) => !known.includes(key));
      if (!extra.length) return result;
      const names = extra.map((key) => `"${key}"`).join(", ");
      const takes = known.length ? ` It takes: ${known.join(", ")}.` : " It takes no input.";
      return {
        ...result,
        errorMessage: `Unknown ${extra.length === 1 ? "field" : "fields"} ${names}.${takes}`,
      };
    };
  },
};

function toolResult(reply: Awaited<ReturnType<typeof callOp>>): CallToolResult {
  if (!reply.ok) {
    const text =
      reply.status === 401
        ? "Kriyan didn't accept this sign-in or token. Create a new personal access token in Settings, or connect Kriyan again."
        : reply.error;
    return { isError: true, content: [{ type: "text", text }] };
  }
  const { result } = reply;
  const structured =
    result !== null && typeof result === "object" && !Array.isArray(result)
      ? { structuredContent: result as Record<string, unknown> }
      : {};
  return { content: [{ type: "text", text: JSON.stringify(result) }], ...structured };
}

export function buildServer(caller: Caller | undefined): McpServer {
  const server = new McpServer(
    { name: "kriyan", title: "Kriyan", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );
  for (const op of OPS) {
    server.registerTool(
      op.name,
      {
        title: op.title,
        description: op.description,
        inputSchema: fromJsonSchema<Record<string, unknown>>(op.input as JsonSchema, namingValidator),
        annotations: {
          title: op.title,
          readOnlyHint: op.kind === "read",
          destructiveHint: op.destructive === true,
          idempotentHint: op.kind === "read" || op.idempotent === true,
          openWorldHint: false,
        },
      },
      async (args) => {
        if (!caller) return { isError: true, content: [{ type: "text", text: "Sign in to Kriyan first." }] };
        // The client's own name ("claude-ai", "openai-mcp", "codex-mcp-client") names its changes
        // in the person's activity log. Only trusted on the service-secret path (OAuth callers).
        const client = server.server.getClientVersion()?.name ?? "";
        const headers =
          caller.kind === "oauth" ? { ...caller.headers, "x-kriyan-client": client } : caller.headers;
        return toolResult(await callOp(op.name, args, headers));
      },
    );
  }
  return server;
}

/** Serves 2026-07-28 requests and, for 2025-era clients, the stateless Streamable HTTP fallback. */
export const mcpHandler = createMcpHandler((ctx) => {
  const caller = ctx.authInfo?.extra?.caller as Caller | undefined;
  return buildServer(caller);
});
