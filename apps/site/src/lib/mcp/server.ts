// The Kriyan MCP server: one tool per operation in @kriyan/core/ops, each forwarded to the agent API.
// A fresh server is built per request (the transport is stateless), bound to the authenticated caller.

import {
  createMcpHandler,
  fromJsonSchema,
  McpServer,
  type CallToolResult,
} from "@modelcontextprotocol/server";
import { OPS } from "@kriyan/core/ops";
import { callOp } from "@/lib/agent-api";
import type { Caller } from "./auth";
import { INSTRUCTIONS } from "./instructions";

type JsonSchema = Parameters<typeof fromJsonSchema>[0];

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
        inputSchema: fromJsonSchema<Record<string, unknown>>(op.input as JsonSchema),
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
        return toolResult(await callOp(op.name, args, caller.headers));
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
