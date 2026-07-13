export interface ReminderProduct {
  kind: 'reminder'
  message: string
  remindAt: number
  timezone: string
}

export interface ToolContext {
  runId: string
  signal: AbortSignal
}

export interface StructuredToolResult<T = unknown> {
  ok: boolean
  value?: T
  error?: { code: string; message: string; retryable: boolean }
}

export interface CapabilityTool<TInput = unknown, TOutput = unknown> {
  name: string
  execute(
    input: TInput,
    context: ToolContext,
  ): Promise<StructuredToolResult<TOutput>>
}

export class CapabilityRegistry {
  private readonly tools = new Map<string, CapabilityTool>()

  register(tool: CapabilityTool): void {
    if (this.tools.has(tool.name)) throw new Error(`duplicate tool: ${tool.name}`)
    this.tools.set(tool.name, tool)
  }

  names(): string[] {
    return [...this.tools.keys()].sort()
  }

  async execute(
    name: string,
    input: unknown,
    context: ToolContext,
  ): Promise<StructuredToolResult> {
    const tool = this.tools.get(name)
    if (tool === undefined) {
      return {
        ok: false,
        error: { code: 'unknown_tool', message: `unknown tool: ${name}`, retryable: false },
      }
    }
    try {
      return await tool.execute(input, context)
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'tool_error',
          message: error instanceof Error ? error.message : 'tool failed',
          retryable: false,
        },
      }
    }
  }
}

export function reminderTool(): CapabilityTool<ReminderProduct, ReminderProduct> {
  return {
    name: 'create_reminder',
    async execute(input, context) {
      if (context.signal.aborted) {
        return {
          ok: false,
          error: { code: 'cancelled', message: 'run cancelled', retryable: false },
        }
      }
      if (
        input.kind !== 'reminder' ||
        input.message.trim().length === 0 ||
        !Number.isSafeInteger(input.remindAt) ||
        input.remindAt < 0 ||
        input.timezone.trim().length === 0
      ) {
        return {
          ok: false,
          error: { code: 'invalid_reminder', message: 'invalid reminder product', retryable: false },
        }
      }
      return { ok: true, value: input }
    },
  }
}

export function minimalProductivityRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry()
  registry.register(reminderTool())
  return registry
}
