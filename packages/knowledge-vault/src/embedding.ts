import type { EmbeddingProvider } from './types'

export interface OllamaEmbeddingOptions {
  baseUrl?: string
  model?: string
  timeoutMs?: number
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly timeoutMs: number

  constructor(options: OllamaEmbeddingOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
    this.model = options.model ?? 'nomic-embed-text'
    this.timeoutMs = options.timeoutMs ?? 2_000
    this.name = `ollama:${this.model}`
  }

  async embed(text: string, signal?: AbortSignal): Promise<Float32Array> {
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: text }),
      signal: combined,
    })
    if (!response.ok) throw new Error(`Ollama embedding failed with HTTP ${response.status}`)
    const value = await response.json() as { embeddings?: number[][]; embedding?: number[] }
    const embedding = value.embeddings?.[0] ?? value.embedding
    if (!Array.isArray(embedding) || embedding.length === 0 || !embedding.every(Number.isFinite)) {
      throw new Error('Ollama returned an invalid embedding')
    }
    return Float32Array.from(embedding)
  }
}
