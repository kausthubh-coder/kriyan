import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
} from '@earendil-works/pi-coding-agent'
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxProviderHandle,
} from '@earendil-works/pi-ai/providers/faux'

import type { ReminderProduct } from '@kriyan/tools'

export type NormalizedRuntimeEvent =
  | { type: 'status'; data: string }
  | { type: 'message'; data: string }
  | { type: 'tool'; data: string }
  | { type: 'error'; data: string }

export interface RuntimeRequest {
  runId: string
  input: string
  workspace: string
  signal: AbortSignal
}

export interface RuntimeResult {
  products: ReminderProduct[]
  summary: string
}

export interface AgentRuntimeSession {
  run(
    request: RuntimeRequest,
    emit: (event: NormalizedRuntimeEvent) => Promise<void>,
  ): Promise<RuntimeResult>
  dispose(): Promise<void>
}

export interface AgentRuntime {
  createSession(runId: string, workspace: string): Promise<AgentRuntimeSession>
}

export interface FakeRuntimeOptions {
  now?: () => number
  stepDelayMs?: number
}

function deterministicReminder(input: string, now: number): ReminderProduct {
  const normalized = input.trim().replace(/^remind me\s*/i, '').trim()
  return {
    kind: 'reminder',
    message: normalized.length === 0 ? 'Reminder' : normalized,
    remindAt: now + 24 * 60 * 60 * 1_000,
    timezone: 'UTC',
  }
}

export class FakeAgentRuntime implements AgentRuntime {
  constructor(private readonly options: FakeRuntimeOptions = {}) {}

  async createSession(): Promise<AgentRuntimeSession> {
    const now = this.options.now ?? Date.now
    const delay = this.options.stepDelayMs ?? 0
    return {
      async run(request, emit) {
        const step = async (event: NormalizedRuntimeEvent): Promise<void> => {
          if (request.signal.aborted) throw new DOMException('cancelled', 'AbortError')
          if (delay > 0) await Bun.sleep(delay)
          await emit(event)
        }
        await step({ type: 'status', data: 'runtime_started' })
        await step({ type: 'message', data: 'Interpreting reminder command' })
        const reminder = deterministicReminder(request.input, now())
        await step({
          type: 'tool',
          data: JSON.stringify({ name: 'create_reminder', status: 'prepared' }),
        })
        return { products: [reminder], summary: 'Reminder prepared' }
      },
      async dispose() {},
    }
  }
}

export interface PiSessionFactory {
  create(workspace: string): Promise<AgentSession>
}

function normalizePiEvent(event: AgentSessionEvent): NormalizedRuntimeEvent | null {
  if (
    event.type === 'message_update' &&
    event.assistantMessageEvent.type === 'text_delta'
  ) {
    return { type: 'message', data: event.assistantMessageEvent.delta }
  }
  if (event.type === 'tool_execution_start') {
    return {
      type: 'tool',
      data: JSON.stringify({ name: event.toolName, status: 'started' }),
    }
  }
  if (event.type === 'tool_execution_end') {
    return {
      type: event.isError ? 'error' : 'tool',
      data: JSON.stringify({ name: event.toolName, status: event.isError ? 'failed' : 'completed' }),
    }
  }
  return null
}

function extractReminder(text: string): ReminderProduct[] {
  const match = text.match(/<kriyan-reminder>(.*?)<\/kriyan-reminder>/s)
  if (match?.[1] === undefined) return []
  const parsed = JSON.parse(match[1]) as Partial<ReminderProduct>
  if (
    parsed.kind !== 'reminder' ||
    typeof parsed.message !== 'string' ||
    typeof parsed.remindAt !== 'number' ||
    typeof parsed.timezone !== 'string'
  ) {
    throw new Error('Pi returned an invalid reminder product')
  }
  return [parsed as ReminderProduct]
}

export class PiAgentRuntime implements AgentRuntime {
  constructor(private readonly sessions: PiSessionFactory) {}

  async createSession(_runId: string, workspace: string): Promise<AgentRuntimeSession> {
    const session = await this.sessions.create(workspace)
    return {
      async run(request, emit) {
        const chunks: string[] = []
        let pending = Promise.resolve()
        const unsubscribe = session.subscribe((event) => {
          const normalized = normalizePiEvent(event)
          if (normalized !== null) {
            if (normalized.type === 'message') chunks.push(normalized.data)
            pending = pending.then(() => emit(normalized))
          }
        })
        const onAbort = (): void => void session.abort()
        request.signal.addEventListener('abort', onAbort, { once: true })
        try {
          await session.prompt(
            `${request.input}\nReturn product output only as <kriyan-reminder>{"kind":"reminder","message":"...","remindAt":0,"timezone":"UTC"}</kriyan-reminder>. Never include private reasoning.`,
          )
          await pending
          const text = chunks.join('')
          return { products: extractReminder(text), summary: 'Pi run completed' }
        } finally {
          unsubscribe()
          request.signal.removeEventListener('abort', onAbort)
        }
      },
      async dispose() {
        session.dispose()
      },
    }
  }
}

export class LocalPiSessionFactory implements PiSessionFactory {
  async create(workspace: string): Promise<AgentSession> {
    const authStorage = AuthStorage.create()
    const modelRegistry = ModelRegistry.create(authStorage)
    const { session } = await createAgentSession({
      cwd: workspace,
      authStorage,
      modelRegistry,
      sessionManager: SessionManager.create(workspace),
      tools: [],
    })
    return session
  }
}

export interface FauxPiFactory {
  factory: PiSessionFactory
  provider: FauxProviderHandle
  dispose(): void
}

export function createFauxPiFactory(response: ReminderProduct): FauxPiFactory {
  const provider = fauxProvider()
  provider.setResponses([
    fauxAssistantMessage(
      `<kriyan-reminder>${JSON.stringify(response)}</kriyan-reminder>`,
    ),
  ])
  const model = provider.getModel()
  const authStorage = AuthStorage.inMemory()
  authStorage.setRuntimeApiKey(model.provider, 'faux-key')
  const modelRegistry = ModelRegistry.inMemory(authStorage)
  modelRegistry.registerProvider(model.provider, {
    baseUrl: model.baseUrl,
    apiKey: 'faux-key',
    api: model.api,
    streamSimple: provider.provider.streamSimple.bind(provider.provider),
    models: provider.models.map((registeredModel) => ({
      id: registeredModel.id,
      name: registeredModel.name,
      api: registeredModel.api,
      reasoning: registeredModel.reasoning,
      input: registeredModel.input,
      cost: registeredModel.cost,
      contextWindow: registeredModel.contextWindow,
      maxTokens: registeredModel.maxTokens,
      baseUrl: registeredModel.baseUrl,
    })),
  })
  return {
    provider,
    factory: {
      async create(workspace) {
        const { session } = await createAgentSession({
          cwd: workspace,
          model,
          authStorage,
          modelRegistry,
          sessionManager: SessionManager.inMemory(),
          tools: [],
        })
        return session
      },
    },
    dispose() {
      modelRegistry.unregisterProvider(model.provider)
    },
  }
}
