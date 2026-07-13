export function createClientId(prefix: string, now = Date.now()): string {
  return `${prefix}:${now.toString(36)}:${Math.random().toString(36).slice(2, 8)}`
}

export function notificationIntentKey(reminderId: string, scheduledFor: number): string {
  return `reminder:${reminderId}:${scheduledFor}`
}

export function tipTapDocumentFromText(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      content: line.length > 0 ? [{ type: 'text', text: line }] : [],
    })),
  })
}

export function wordCount(text: string): number {
  const value = text.trim()
  return value.length === 0 ? 0 : value.split(/\s+/).length
}
